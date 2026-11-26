import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withDirectoryLock } from '../run-workspace.mjs';

const hosts = new Set(['copilot', 'claude', 'codex']);
const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,71}$/;

function configPath({ homeDir = homedir(), env = process.env }) {
  if (env.AI_NATIVE_HARNESS_CONFIG_HOME) return join(resolve(env.AI_NATIVE_HARNESS_CONFIG_HOME), 'dashboard.json');
  if (process.platform === 'darwin') {
    return join(homeDir, 'Library', 'Application Support', 'ai-native-harness', 'dashboard.json');
  }
  if (process.platform === 'win32') {
    return join(env.APPDATA || join(homeDir, 'AppData', 'Roaming'), 'ai-native-harness', 'dashboard.json');
  }
  return join(env.XDG_CONFIG_HOME || join(homeDir, '.config'), 'ai-native-harness', 'dashboard.json');
}

function validateAssociation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !hosts.has(value.host) ||
      typeof value.sessionId !== 'string' || !value.sessionId.trim() || value.sessionId.length > 256 ||
      typeof value.workspaceRoot !== 'string' || !value.workspaceRoot.trim() || !isAbsolute(value.workspaceRoot) ||
      typeof value.runId !== 'string' || !runIdPattern.test(value.runId)) {
    throw new Error('Invalid dashboard association');
  }
  return {
    host: value.host,
    sessionId: value.sessionId,
    workspaceRoot: resolve(value.workspaceRoot),
    runId: value.runId
  };
}

function parseConfig(text) {
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    throw new Error('Dashboard association config contains malformed JSON');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config) || config.schemaVersion !== 1) {
    throw new Error('Unsupported dashboard association config schema');
  }
  if (!Array.isArray(config.associations)) throw new Error('Invalid dashboard association config');
  const associations = config.associations.map(validateAssociation);
  const keys = new Set();
  for (const association of associations) {
    const key = `${association.host}\0${association.sessionId}`;
    if (keys.has(key)) throw new Error('Duplicate dashboard association');
    keys.add(key);
  }
  return associations;
}

const lockWaitMs = 10_000;

function readAssociations(path) {
  let metadata;
  try { metadata = lstatSync(path); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error('Dashboard association config must be a regular file');
  return parseConfig(readFileSync(path, 'utf8'));
}

export async function loadAssociations(options = {}) {
  return readAssociations(configPath(options));
}

// Saves and removals are read-modify-write; one lock beside the config serializes them across
// calls and dashboard processes, and the whole transaction runs synchronously while it is held.
function updateAssociations(options, change) {
  const path = configPath(options);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  withDirectoryLock(`${path}.lock`, () => {
    const current = readAssociations(path);
    const next = change(current);
    if (next) atomicWrite(path, next);
  }, lockWaitMs, `Timed out waiting for another dashboard to update ${path}`);
}

function atomicWrite(path, associations) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.dashboard-${process.pid}-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, associations }, null, 2)}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600
    });
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
  } catch (error) {
    try { unlinkSync(temporary); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }
}

export async function saveAssociation({ homeDir = homedir(), env = process.env, host, sessionId, workspaceRoot, runId }) {
  const association = validateAssociation({ host, sessionId, workspaceRoot, runId });
  updateAssociations({ homeDir, env }, associations => {
    const index = associations.findIndex(item => item.host === host && item.sessionId === sessionId);
    if (index < 0) associations.push(association);
    else associations[index] = association;
    return associations;
  });
}

export async function removeAssociation({ homeDir = homedir(), env = process.env, host, sessionId }) {
  if (!hosts.has(host) || typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('Invalid dashboard association identity');
  }
  updateAssociations({ homeDir, env }, associations => {
    const filtered = associations.filter(item => item.host !== host || item.sessionId !== sessionId);
    return filtered.length === associations.length ? null : filtered;
  });
}
