import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import {
  attachWarnings,
  createEvent,
  extractRunRefs,
  findHostStoreRoot,
  getFileTimestamps,
  readFirstJsonRecord,
  resolveHostStore,
  readTranscriptJsonLines
} from '../model.mjs';

const SOURCE = 'codex';
const IGNORED_RECORDS = new Set([
  'session_meta', 'turn_context', 'world_state', 'token_usage_record', 'compacted', 'inter_agent_communication_metadata'
]);
const IGNORED_EVENTS = new Set([
  'task_started', 'task_complete', 'token_count', 'agent_reasoning', 'user_message', 'agent_message',
  'sub_agent_activity', 'patch_apply_end', 'thread_settings_applied', 'turn_aborted', 'error',
  'web_search_end', 'view_image_tool_call', 'item_completed', 'exec_command_begin'
]);
const IGNORED_ITEMS = new Set(['reasoning', 'agent_message', 'web_search_call']);
const INJECTED_USER_TEXT = /^\s*(?:<[a-z_]+[\s>]|# AGENTS\.md)/;
const SHELL_WRAPPER = /^\s*(?:&\s*)?(?:(?:ba|z)?sh|(?:powershell|pwsh|cmd)(?:\.exe)?)\b[^"';|&]*?\s(?:-l?c|-Command|\/c)\s+["']?/i;
const SKILL_READ = /^\s*(?:sed|cat|head|tail|nl|bat|less|awk|more|type|gc|get-content)\b/i;
const SKILL_FILE = /(?:^|[\/\\\s"'])skills[\/\\]+([A-Za-z0-9][A-Za-z0-9_.:-]*)[\/\\]+SKILL\.md\b/g;

function readSkills(command) {
  if (typeof command !== 'string') return [];
  const skills = new Set();
  for (const segment of command.split(/;|&&|\|\||\||\n/)) {
    if (!SKILL_READ.test(segment.replace(SHELL_WRAPPER, ''))) continue;
    for (const match of segment.matchAll(SKILL_FILE)) skills.add(match[1]);
  }
  return [...skills];
}

function sessionMetadata(record) {
  const payload = record?.payload;
  if (record?.type !== 'session_meta' || !payload || typeof payload !== 'object') return null;
  const { id, cwd, timestamp } = payload;
  if (typeof id !== 'string' || typeof cwd !== 'string' || typeof timestamp !== 'string') return null;
  return { id, cwd, startedAt: timestamp };
}

async function rolloutFiles(directory, depth = 0) {
  if (depth > 3) return { paths: [], warnings: [] };
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { paths: [], warnings: [] };
    throw error;
  }
  const paths = [];
  const warnings = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await rolloutFiles(path, depth + 1);
      paths.push(...nested.paths);
      warnings.push(...nested.warnings);
    }
    else if (entry.isFile() && /^rollout-.+\.jsonl$/.test(entry.name)) paths.push(path);
    else if (entry.isFile() && /^rollout-.+\.jsonl\.zst$/.test(entry.name)) {
      warnings.push('Compressed Codex rollouts are not supported.');
    }
  }
  return { paths, warnings };
}

export async function discoverSessions({ homeDir, maxSessions = 200 }) {
  const warnings = [];
  const sessions = [];
  const stores = [];
  for (const storeName of ['sessions', 'archived_sessions']) {
    try {
      stores.push(await resolveHostStore(homeDir, '.codex', storeName));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        warnings.push(error.message.includes('Unsupported') ? error.message : 'Codex session store could not be read.');
      }
    }
  }
  for (const realStore of stores) {
    const scan = await rolloutFiles(realStore);
    warnings.push(...scan.warnings);
    for (const transcriptPath of scan.paths) {
      try {
        const metadata = sessionMetadata(await readFirstJsonRecord(transcriptPath, realStore));
        if (!metadata) {
          warnings.push('A Codex session lacked supported session metadata.');
          continue;
        }
        sessions.push({
          host: SOURCE,
          ...metadata,
          updatedAt: await getFileTimestamps(transcriptPath),
          transcriptPath: await realpath(transcriptPath)
        });
      } catch (error) {
        warnings.push(error.message.includes('Unsupported') ? error.message : 'A Codex session could not be read.');
      }
    }
  }
  sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const cap = Number.isSafeInteger(maxSessions) && maxSessions > 0 ? maxSessions : 200;
  if (sessions.length > cap) warnings.push(`Omitted ${sessions.length - cap} older session${sessions.length - cap === 1 ? '' : 's'}.`);
  return attachWarnings(sessions.slice(0, cap), warnings);
}

function parseArguments(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function commandText(args) {
  if (typeof args.cmd === 'string') return args.cmd;
  if (typeof args.command === 'string') return args.command;
  if (Array.isArray(args.command) && args.command.every(part => typeof part === 'string')) return args.command.join(' ');
  return null;
}

function outputText(output) {
  if (typeof output === 'string') return output;
  if (!Array.isArray(output)) return '';
  return output.map(item => typeof item?.text === 'string' ? item.text : '').filter(Boolean).join('\n');
}

function commandOutcome(text) {
  const exit = text.match(/Process exited with code (-?\d+)/);
  if (exit) return Number(exit[1]) === 0 ? 'passed' : 'failed';
  return /^exec_command failed/.test(text) ? 'failed' : 'unknown';
}

function messageEvent(record, payload) {
  if (payload.role !== 'user' && payload.role !== 'assistant') return [];
  const text = Array.isArray(payload.content)
    ? payload.content.map(item => typeof item?.text === 'string' ? item.text : '').filter(Boolean).join('\n')
    : '';
  if (!text || (payload.role === 'user' && INJECTED_USER_TEXT.test(text))) return [];
  return [createEvent({
    id: eventId(record, payload),
    at: record.timestamp,
    actor: payload.role,
    kind: text.includes('?') ? 'question' : 'message',
    label: text,
    excerpt: text,
    source: SOURCE
  })];
}

function eventId(record, payload) {
  if (typeof payload.id === 'string') return payload.id;
  if (typeof record.id === 'string') return record.id;
  return Number.isSafeInteger(record.ordinal) ? `ordinal-${record.ordinal}` : null;
}

function toolCallEvent(record, payload, calls) {
  const name = typeof payload.name === 'string' ? payload.name : 'Tool call';
  const args = payload.type === 'function_call' ? parseArguments(payload.arguments) : {};
  const input = typeof payload.input === 'string' ? payload.input : null;
  const command = commandText(args);
  const requestedSkill = name.toLowerCase() === 'skill' && typeof (args.skill ?? args.name) === 'string' ? args.skill ?? args.name : null;
  const questions = name === 'request_user_input' && Array.isArray(args.questions)
    ? args.questions.map(question => question?.question ?? question?.header).filter(value => typeof value === 'string')
    : null;
  const runRefs = extractRunRefs(command, args.workdir, input);
  const event = createEvent({
    id: typeof payload.call_id === 'string' ? payload.call_id : eventId(record, payload),
    at: record.timestamp,
    actor: questions ? 'assistant' : 'tool',
    kind: questions ? 'question' : requestedSkill ? 'skill' : 'tool',
    label: questions ? questions.join(' / ') || 'User input requested' : requestedSkill ?? command ?? name,
    excerpt: command ?? input ?? '',
    command,
    outcome: questions ? 'none' : 'unknown',
    runRefs,
    source: SOURCE
  });
  if (typeof payload.call_id === 'string') calls.set(payload.call_id, { event, name });
  const skillReads = readSkills(command).map(skill => createEvent({
    id: `${event.id}:skill:${skill}`,
    at: record.timestamp,
    actor: 'tool',
    kind: 'skill',
    label: skill,
    excerpt: command,
    command,
    outcome: 'unknown',
    runRefs,
    source: SOURCE
  }));
  return [...skillReads, event];
}

function toolOutputEvent(record, payload, calls) {
  const call = typeof payload.call_id === 'string' ? calls.get(payload.call_id) : null;
  const text = outputText(payload.output);
  if (call?.name === 'request_user_input') {
    return [createEvent({
      id: `${payload.call_id}:answer`,
      at: record.timestamp,
      actor: 'user',
      kind: 'message',
      label: 'User answered',
      excerpt: text,
      relatedTo: [call.event.id],
      source: SOURCE
    })];
  }
  const event = createEvent({
    id: call ? `${payload.call_id}:result` : eventId(record, payload),
    at: record.timestamp,
    actor: 'tool',
    kind: call?.event.kind === 'skill' ? 'skill' : 'tool',
    label: call?.event.label ?? 'Tool result',
    excerpt: text,
    command: call?.event.command ?? null,
    outcome: call?.exitCode !== undefined ? call.exitCode : commandOutcome(text),
    relatedTo: call?.event.id ? [call.event.id] : [],
    source: SOURCE
  });
  if (call) call.result = event;
  return [event];
}

function normalize(record, calls) {
  if (!record || typeof record.type !== 'string') throw new Error('Unsupported Codex transcript schema');
  if (IGNORED_RECORDS.has(record.type)) return [];
  const payload = record.payload;
  if (!payload || typeof payload.type !== 'string') throw new Error('Unsupported Codex transcript schema');

  if (record.type === 'event_msg') {
    if (IGNORED_EVENTS.has(payload.type)) return [];
    if (payload.type === 'exec_command_end') {
      const call = typeof payload.call_id === 'string' ? calls.get(payload.call_id) : null;
      const outcome = payload.exit_code === 0 ? 'passed' : typeof payload.exit_code === 'number' ? 'failed' : 'unknown';
      if (call?.result) call.result.outcome = outcome;
      else if (call) call.exitCode = outcome;
      return [];
    }
    throw new Error('Unsupported Codex transcript schema');
  }

  if (record.type === 'response_item') {
    if (IGNORED_ITEMS.has(payload.type)) return [];
    if (payload.type === 'message') return messageEvent(record, payload);
    if (payload.type === 'function_call' || payload.type === 'custom_tool_call') return toolCallEvent(record, payload, calls);
    if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
      return toolOutputEvent(record, payload, calls);
    }
  }
  throw new Error('Unsupported Codex transcript schema');
}

export async function readEvents(session, { maxBytes } = {}) {
  const storeDirectory = findHostStoreRoot(session.transcriptPath, '.codex', ['sessions', 'archived_sessions']);
  const { records, warnings } = await readTranscriptJsonLines(session.transcriptPath, storeDirectory, { maxBytes });
  const events = [];
  const calls = new Map();
  for (const record of records) {
    try {
      events.push(...normalize(record, calls));
    } catch (error) {
      if (!error.message.startsWith('Unsupported')) throw error;
      warnings.push(error.message);
    }
  }
  return attachWarnings(events, warnings);
}
