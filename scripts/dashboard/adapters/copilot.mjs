import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import {
  attachWarnings,
  createEvent,
  extractRunRefs,
  findHostStoreRoot,
  getFileTimestamps,
  resolveHostStore,
  readTranscriptJsonLines
} from '../model.mjs';

const SOURCE = 'copilot';
const KNOWN_TYPES = new Set([
  'session.start',
  'session.info',
  'user.message',
  'assistant.message',
  'tool.execution_start',
  'tool.execution_complete',
  'permission.requested',
  'permission.completed'
]);
const IGNORED_TYPE = /^(?:session|hook|assistant|model|subagent|skill|external_tool|system|instruction|human_response)\.|^abort$/;

function messageText(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map(item => typeof item === 'string' ? item :
    item && typeof item.text === 'string' ? item.text : '').filter(Boolean).join('\n');
}

function sessionMetadata(record) {
  if (record?.type !== 'session.start' || !record.data || typeof record.data !== 'object') return null;
  if (record.data.version !== undefined && record.data.version !== 1) {
    throw new Error('Unsupported Copilot event log version');
  }
  const id = record.data.sessionId;
  const cwd = record.data.context?.cwd;
  const startedAt = record.data.startTime ?? record.timestamp;
  if (typeof id !== 'string' || typeof cwd !== 'string' || typeof startedAt !== 'string') return null;
  return { id, cwd, startedAt };
}

export async function discoverSessions({ homeDir, maxSessions = 200 }) {
  const warnings = [];
  let realStore;
  try {
    realStore = await resolveHostStore(homeDir, '.copilot', 'session-state');
  } catch (error) {
    if (error.code === 'ENOENT') return attachWarnings([], warnings);
    warnings.push(error.message.includes('Unsupported') ? error.message : 'Copilot session store could not be read.');
    return attachWarnings([], warnings);
  }
  const sessions = [];
  for (const directory of await readdir(realStore, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const transcriptPath = join(realStore, directory.name, 'events.jsonl');
    try {
      const { records } = await readTranscriptJsonLines(transcriptPath, realStore, { maxBytes: 64 * 1024, fromEnd: false });
      const metadata = records.map(sessionMetadata).find(Boolean);
      if (!metadata) {
        warnings.push('A Copilot session lacked supported session metadata.');
        continue;
      }
      const updatedAt = await getFileTimestamps(transcriptPath);
      sessions.push({
        host: SOURCE,
        ...metadata,
        updatedAt,
        transcriptPath: await realpath(transcriptPath)
      });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      warnings.push(error.message.includes('Unsupported') ? error.message : 'A Copilot session could not be read.');
    }
  }
  sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const cap = Number.isSafeInteger(maxSessions) && maxSessions > 0 ? maxSessions : 200;
  if (sessions.length > cap) warnings.push(`Omitted ${sessions.length - cap} older session${sessions.length - cap === 1 ? '' : 's'}.`);
  return attachWarnings(sessions.slice(0, cap), warnings);
}

function normalize(record, toolCalls) {
  if (typeof record?.type === 'string' && !KNOWN_TYPES.has(record.type) && IGNORED_TYPE.test(record.type)) return null;
  if (!record || typeof record.type !== 'string' || !KNOWN_TYPES.has(record.type)) {
    throw new Error('Unsupported Copilot transcript schema');
  }
  const data = record.data && typeof record.data === 'object' ? record.data : {};
  if (record.type === 'session.start' && data.version !== undefined && data.version !== 1) {
    throw new Error('Unsupported Copilot event log version');
  }
  const at = typeof record.timestamp === 'string' ? record.timestamp : null;
  const id = typeof record.id === 'string' ? record.id : null;
  if (record.type === 'session.start' || record.type === 'session.info') return null;
  if (record.type === 'user.message' || record.type === 'assistant.message') {
    const excerpt = messageText(data.content);
    if (!excerpt) return null;
    const actor = record.type === 'user.message' ? 'user' : 'assistant';
    const kind = excerpt.includes('?') ? 'question' : 'message';
    return createEvent({ id, at, actor, kind, label: excerpt, excerpt, source: SOURCE });
  }
  if (record.type === 'permission.requested' || record.type === 'permission.completed') {
    return createEvent({
      id,
      at,
      actor: 'system',
      kind: 'approval',
      label: record.type === 'permission.requested' ? 'Permission requested' : 'Permission completed',
      excerpt: messageText(data.summary ?? data.toolName),
      outcome: data.approved === true ? 'passed' : data.approved === false ? 'failed' : 'unknown',
      source: SOURCE
    });
  }
  const toolCallId = typeof data.toolCallId === 'string' ? data.toolCallId : null;
  const start = record.type === 'tool.execution_start';
  const previous = toolCallId ? toolCalls.get(toolCallId) : null;
  const requestedSkill = typeof data.toolName === 'string' && data.toolName.toLowerCase() === 'skill'
    ? data.arguments?.skill ?? data.arguments?.name
    : null;
  const command = typeof data.arguments?.command === 'string' ? data.arguments.command : previous?.command ?? null;
  const event = createEvent({
    id,
    at,
    actor: 'tool',
    kind: typeof requestedSkill === 'string' || previous?.kind === 'skill' ? 'skill' : 'tool',
    label: typeof requestedSkill === 'string' ? requestedSkill : previous?.label ?? command ?? data.toolName ?? 'Tool execution',
    excerpt: start ? command ?? '' : messageText(data.result?.content ?? data.error?.message),
    command,
    outcome: start ? 'unknown' : data.success === true ? 'passed' : data.success === false ? 'failed' : 'unknown',
    runRefs: start ? extractRunRefs(
      data.arguments?.command, data.arguments?.path, data.arguments?.paths,
      typeof data.arguments === 'string' ? data.arguments : null
    ) : [],
    relatedTo: previous?.id ? [previous.id] : [],
    source: SOURCE
  });
  if (start && toolCallId) toolCalls.set(toolCallId, event);
  return event;
}

export async function readEvents(session, { maxBytes } = {}) {
  const storeDirectory = findHostStoreRoot(session.transcriptPath, '.copilot', 'session-state');
  const { records, warnings } = await readTranscriptJsonLines(session.transcriptPath, storeDirectory, { maxBytes });
  const events = [];
  const toolCalls = new Map();
  for (const record of records) {
    try {
      const event = normalize(record, toolCalls);
      if (event) events.push(event);
    } catch (error) {
      if (!error.message.startsWith('Unsupported')) throw error;
      warnings.push(error.message);
    }
  }
  return attachWarnings(events, warnings);
}
