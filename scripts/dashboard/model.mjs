import { open, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const MAX_TRANSCRIPT_BYTES = 5 * 1024 * 1024;
const MAX_EXCERPT_LENGTH = 240;

export function truncateExcerpt(value, maxLength = MAX_EXCERPT_LENGTH) {
  const text = typeof value === 'string' ? value : '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function attachWarnings(items, warnings) {
  Object.defineProperty(items, 'warnings', { value: warnings, enumerable: false });
  return items;
}

export function isWithinDirectory(directory, file) {
  const relativePath = relative(directory, file);
  return relativePath === '' || (!relativePath.startsWith(`..${sep}`) &&
    relativePath !== '..' && !isAbsolute(relativePath));
}

export async function resolveHostStore(homeDir, configDirectory, storeName) {
  const realHome = await realpath(homeDir);
  const realStore = await realpath(resolve(realHome, configDirectory, storeName));
  if (!isWithinDirectory(realHome, realStore)) {
    throw new Error('Unsupported host store outside the user home directory');
  }
  return realStore;
}

export function findHostStoreRoot(transcriptPath, configDirectory, storeName) {
  const expectedConfigDirectory = basename(configDirectory);
  const expectedStoreNames = new Set(Array.isArray(storeName) ? storeName : [storeName]);
  let directory = dirname(transcriptPath);
  while (directory !== dirname(directory)) {
    if (expectedStoreNames.has(basename(directory)) && basename(dirname(directory)) === expectedConfigDirectory) return directory;
    directory = dirname(directory);
  }
  throw new Error('Invalid transcript path outside the supported host store');
}

export async function readTranscriptJsonLines(transcriptPath, storeDirectory, {
  maxBytes = MAX_TRANSCRIPT_BYTES,
  fromEnd = true
} = {}) {
  const limit = Number.isSafeInteger(maxBytes) && maxBytes > 0
    ? Math.min(maxBytes, MAX_TRANSCRIPT_BYTES)
    : MAX_TRANSCRIPT_BYTES;
  const [realStore, realTranscript] = await Promise.all([
    realpath(storeDirectory),
    realpath(transcriptPath)
  ]);
  if (!isWithinDirectory(realStore, realTranscript) || resolve(transcriptPath) !== realTranscript) {
    throw new Error('Invalid transcript path outside the supported host store');
  }

  const handle = await open(realTranscript, 'r');
  try {
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) throw new Error('Invalid transcript source');
    const bytesToRead = Math.min(fileStats.size, limit);
    const offset = fromEnd ? fileStats.size - bytesToRead : 0;
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, offset);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    const warnings = [];
    if (offset > 0) warnings.push('Transcript truncated to the newest bounded bytes.');

    const lines = text.split('\n');
    if (offset > 0 && lines.length) {
      try {
        const firstRecord = JSON.parse(lines[0]);
        if (!firstRecord || typeof firstRecord.type !== 'string') lines.shift();
      } catch {
        lines.shift();
      }
    }
    if (!text.endsWith('\n') && lines.length) {
      const partial = lines.pop();
      if (partial) {
        try {
          JSON.parse(partial);
          lines.push(partial);
        } catch {
          warnings.push('Malformed trailing JSONL record ignored.');
        }
      }
    } else if (text.endsWith('\n') && lines.at(-1) === '') {
      lines.pop();
    }

    const records = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        throw new Error('Unsupported or malformed transcript schema');
      }
    }
    return { records, warnings };
  } finally {
    await handle.close();
  }
}

export async function getFileTimestamps(path) {
  const fileStats = await stat(path);
  return fileStats.mtime.toISOString();
}

const RUN_REFERENCE = /(?:^|[^A-Za-z0-9_.-])(?:docs|\.worktrees)[\/\\]+sdlc[\/\\]+([A-Za-z0-9][A-Za-z0-9_-]{0,71})(?=$|[^A-Za-z0-9_-])/g;

export function extractRunRefs(...values) {
  const refs = new Set();
  for (const value of values.flat(2)) {
    if (typeof value !== 'string') continue;
    for (const match of value.matchAll(RUN_REFERENCE)) refs.add(match[1]);
  }
  return [...refs];
}

export async function readFirstJsonRecord(transcriptPath, storeDirectory, { maxBytes = 1024 * 1024 } = {}) {
  const [realStore, realTranscript] = await Promise.all([realpath(storeDirectory), realpath(transcriptPath)]);
  if (!isWithinDirectory(realStore, realTranscript) || resolve(transcriptPath) !== realTranscript) {
    throw new Error('Invalid transcript path outside the supported host store');
  }
  const handle = await open(realTranscript, 'r');
  try {
    const chunks = [];
    let total = 0;
    while (total < maxBytes) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, total);
      if (!bytesRead) break;
      const chunk = buffer.subarray(0, bytesRead);
      const newline = chunk.indexOf(10);
      chunks.push(newline === -1 ? chunk : chunk.subarray(0, newline));
      total += bytesRead;
      if (newline !== -1) break;
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return null;
    }
  } finally {
    await handle.close();
  }
}

export function createEvent({
  id,
  at,
  actor,
  kind,
  label,
  excerpt = '',
  command = null,
  outcome = 'none',
  runId = null,
  runRefs = [],
  relatedTo = [],
  source
}) {
  return {
    id: typeof id === 'string' ? id : null,
    at: typeof at === 'string' ? at : null,
    actor,
    kind,
    label: truncateExcerpt(label),
    excerpt: truncateExcerpt(excerpt),
    command: typeof command === 'string' ? truncateExcerpt(command) : null,
    outcome,
    runId: typeof runId === 'string' ? runId : null,
    runRefs: Array.isArray(runRefs) ? [...new Set(runRefs.filter(value => typeof value === 'string'))] : [],
    relatedTo: Array.isArray(relatedTo) ? relatedTo.filter(value => typeof value === 'string') : [],
    source
  };
}
