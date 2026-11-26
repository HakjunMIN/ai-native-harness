import { readdir, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  attachWarnings,
  createEvent,
  extractRunRefs,
  findHostStoreRoot,
  getFileTimestamps,
  resolveHostStore,
  readTranscriptJsonLines
} from '../model.mjs';

const SOURCE = 'claude';
const IGNORED_TYPES = new Set(['system', 'summary', 'file-history-snapshot', 'custom-title', 'progress', 'queue-operation']);

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(item => {
    if (typeof item === 'string') return item;
    if (item?.type === 'text' && typeof item.text === 'string') return item.text;
    if (item?.type === 'tool_result') return typeof item.content === 'string' ? item.content : '';
    return '';
  }).filter(Boolean).join('\n');
}

function metadata(record, transcriptPath) {
  if (!record || !['user', 'assistant'].includes(record.type)) return null;
  const cwd = record.cwd;
  const id = record.sessionId ?? basename(transcriptPath, '.jsonl');
  const startedAt = record.timestamp;
  if (typeof id !== 'string' || typeof cwd !== 'string' || typeof startedAt !== 'string') return null;
  return { id, cwd, startedAt };
}

export async function discoverSessions({ homeDir, maxSessions = 200 }) {
  const warnings = [];
  let projects;
  try {
    const realStore = await resolveHostStore(homeDir, '.claude', 'projects');
    projects = await readdir(realStore, { withFileTypes: true });
    const sessions = [];
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const projectDirectory = join(realStore, project.name);
      for (const entry of await readdir(projectDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
        const transcriptPath = join(projectDirectory, entry.name);
        try {
          const { records } = await readTranscriptJsonLines(transcriptPath, realStore, { maxBytes: 64 * 1024, fromEnd: false });
          const sessionMetadata = records.map(record => metadata(record, transcriptPath)).find(Boolean);
          if (!sessionMetadata) {
            warnings.push('A Claude Code session lacked supported session metadata.');
            continue;
          }
          sessions.push({
            host: SOURCE,
            ...sessionMetadata,
            updatedAt: await getFileTimestamps(transcriptPath),
            transcriptPath: await realpath(transcriptPath)
          });
        } catch (error) {
          warnings.push(error.message.includes('Unsupported') ? error.message : 'A Claude Code session could not be read.');
        }
      }
    }
    sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const cap = Number.isSafeInteger(maxSessions) && maxSessions > 0 ? maxSessions : 200;
    if (sessions.length > cap) warnings.push(`Omitted ${sessions.length - cap} older session${sessions.length - cap === 1 ? '' : 's'}.`);
    return attachWarnings(sessions.slice(0, cap), warnings);
  } catch (error) {
    if (error.code === 'ENOENT') return attachWarnings([], warnings);
    warnings.push(error.message.includes('Unsupported') ? error.message : 'Claude Code session store could not be read.');
    return attachWarnings([], warnings);
  }
}

function normalize(record, toolUses) {
  if (!record || typeof record.type !== 'string') throw new Error('Unsupported Claude transcript schema');
  if (IGNORED_TYPES.has(record.type)) return [];
  if (!['user', 'assistant'].includes(record.type) || !record.message || typeof record.message !== 'object') {
    throw new Error('Unsupported Claude transcript schema');
  }
  const content = record.message.content;
  const parts = Array.isArray(content) ? content : [{ type: 'text', text: contentText(content) }];
  const events = [];
  for (const part of parts) {
    if (part?.type === 'tool_use') {
      const command = typeof part.input?.command === 'string' ? part.input.command : null;
      const skill = typeof part.name === 'string' && part.name.toLowerCase() === 'skill'
        ? part.input?.skill ?? part.input?.name
        : null;
      const event = createEvent({
        id: typeof part.id === 'string' ? part.id : record.uuid,
        at: record.timestamp,
        actor: 'tool',
        kind: typeof skill === 'string' ? 'skill' : 'tool',
        label: typeof skill === 'string' ? skill : part.name ?? 'Tool use',
        excerpt: command ?? (typeof skill === 'string' ? skill : ''),
        command,
        outcome: 'unknown',
        runRefs: extractRunRefs(part.input?.command, part.input?.file_path, part.input?.path, part.input?.notebook_path),
        source: SOURCE
      });
      if (typeof part.id === 'string') toolUses.set(part.id, event);
      events.push(event);
      continue;
    }
    if (part?.type === 'tool_result') {
      const excerpt = contentText([part]);
      const toolUse = typeof part.tool_use_id === 'string' ? toolUses.get(part.tool_use_id) : null;
      events.push(createEvent({
        id: toolUse ? `${toolUse.id}:result` : record.uuid,
        at: record.timestamp,
        actor: 'tool',
        kind: toolUse?.kind === 'skill' ? 'skill' : 'tool',
        label: toolUse?.label ?? 'Tool result',
        excerpt,
        command: toolUse?.command ?? null,
        outcome: part.is_error === true ? 'failed' : part.is_error === false ? 'passed' : 'unknown',
        relatedTo: toolUse ? [toolUse.id] : [],
        source: SOURCE
      }));
    }
  }
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.filter(part => part?.type === 'text').map(part => part.text ?? '').join('\n')
      : '';
  if (text) {
    const actor = record.type;
    events.push(createEvent({
      id: record.uuid,
      at: record.timestamp,
      actor,
      kind: text.includes('?') ? 'question' : 'message',
      label: text,
      excerpt: text,
      source: SOURCE
    }));
  }
  return events;
}

export async function readEvents(session, { maxBytes } = {}) {
  const storeDirectory = findHostStoreRoot(session.transcriptPath, '.claude', 'projects');
  const { records, warnings } = await readTranscriptJsonLines(session.transcriptPath, storeDirectory, { maxBytes });
  const events = [];
  const toolUses = new Map();
  for (const record of records) {
    try {
      events.push(...normalize(record, toolUses));
    } catch (error) {
      if (!error.message.startsWith('Unsupported')) throw error;
      warnings.push(error.message);
    }
  }
  return attachWarnings(events, warnings);
}
