import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const assetDirectories = ['agents', 'hooks', 'scripts', 'skills', 'templates'];
const assetDocuments = ['docs/compatibility.md', 'docs/operations.md'];
const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockName = 'harness.lock.json';
const ticketPattern = /^(?:[A-Z][A-Z0-9_]*-[1-9][0-9]*|local-[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const serialize = value => `${JSON.stringify(value, null, 2)}\n`;
const present = path => {
  try { lstatSync(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};

function directory(path, create = false) {
  if (!present(path) && create) mkdirSync(path, { mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Harness directory cannot be a symlink or file: ${path}`);
  return path;
}

function regularFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Harness file cannot be a symlink: ${path}`);
  return readFileSync(path);
}

function inventory(root) {
  const files = [];
  const walk = path => {
    directory(join(root, path));
    for (const name of readdirSync(join(root, path)).sort()) {
      const child = `${path}/${name}`;
      const stat = lstatSync(join(root, child));
      if (stat.isDirectory() && !stat.isSymbolicLink()) walk(child);
      else files.push({ path: child, sha256: sha256(regularFile(join(root, child))) });
    }
  };
  for (const path of assetDirectories) walk(path);
  directory(join(root, 'docs'));
  for (const path of assetDocuments) files.push({ path, sha256: sha256(regularFile(join(root, path))) });
  for (const path of ['scripts/harness.mjs', 'scripts/state.mjs', 'templates/state.json', 'skills/sdlc/SKILL.md']) {
    if (!files.some(file => file.path === path)) throw new Error(`Harness revision does not support ticket locks: missing ${path}`);
  }
  return { files, contentSha256: sha256(JSON.stringify(files)) };
}

function cacheRoot(repositoryRoot, create = false) {
  const installed = join(repositoryRoot, '.ai-native-sdlc');
  const parent = present(installed) && lstatSync(installed).isSymbolicLink()
    ? dirname(realpathSync(installed)) : repositoryRoot;
  const cache = join(parent, '.ai-native-sdlc-revisions');
  if (create || present(cache)) directory(cache, create);
  return cache;
}

function sourceCommit(source) {
  if (present(join(source, '.install-revision'))) {
    const revision = regularFile(join(source, '.install-revision')).toString().split(/\s/)[0];
    return /^[a-f0-9]{40,64}$/.test(revision) ? revision : null;
  }
  const result = spawnSync('git', ['-C', source, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (result.status !== 0 || realpathSync(result.stdout.trim()) !== source) return null;
  const revision = spawnSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return revision.status === 0 && /^[a-f0-9]{40,64}$/.test(revision.stdout.trim()) ? revision.stdout.trim() : null;
}

function snapshot(repositoryRoot, source, expected) {
  const root = realpathSync(source);
  const contents = inventory(root);
  if (expected && contents.contentSha256 !== expected) throw new Error('Harness source content does not match the locked revision');
  const cache = cacheRoot(repositoryRoot, true);
  const destination = join(cache, contents.contentSha256);
  if (present(destination)) {
    directory(destination);
    if (inventory(destination).contentSha256 !== contents.contentSha256) throw new Error(`Modified harness snapshot: ${destination}`);
  } else {
    const stage = mkdtempSync(join(cache, '.snapshot-'));
    try {
      for (const path of assetDirectories) cpSync(join(root, path), join(stage, path), { recursive: true });
      mkdirSync(join(stage, 'docs'));
      for (const path of assetDocuments) cpSync(join(root, path), join(stage, path));
      if (inventory(stage).contentSha256 !== contents.contentSha256) throw new Error('Harness source changed while creating the snapshot');
      try { renameSync(stage, destination); }
      catch (error) {
        if (!present(destination) || inventory(directory(destination)).contentSha256 !== contents.contentSha256) throw error;
      }
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
  return { root: destination, contentSha256: contents.contentSha256, commit: sourceCommit(root) };
}

export function pinRun(state, runRoot, repositoryRoot, source = runtimeRoot) {
  if (!ticketPattern.test(state.ticket ?? '')) throw new Error('Invalid ticket ID');
  if (state.harness || present(join(runRoot, lockName))) throw new Error('Run already has a harness lock');
  const captured = snapshot(realpathSync(repositoryRoot), source);
  const lock = { schemaVersion: 1, ticket: state.ticket, createdAt: new Date().toISOString(),
    harness: { commit: captured.commit, contentSha256: captured.contentSha256 } };
  const body = serialize(lock);
  writeFileSync(join(runRoot, lockName), body, { flag: 'wx', mode: 0o600 });
  state.harness = { path: lockName, sha256: sha256(body) };
  state.history.push({ at: lock.createdAt, event: 'harness-pinned', harness: state.harness,
    contentSha256: captured.contentSha256, commit: captured.commit });
  return captured;
}

export function readRunLock(state, runRoot) {
  if (!state.harness) throw new Error('Run has no harness lock; explicitly adopt a baseline before resuming');
  if (state.harness.path !== lockName || !/^[a-f0-9]{64}$/.test(state.harness.sha256 ?? '')) throw new Error('Invalid harness lock reference');
  const body = regularFile(join(runRoot, lockName));
  if (sha256(body) !== state.harness.sha256) throw new Error('Harness lock hash mismatch');
  const lock = JSON.parse(body);
  if (lock.schemaVersion !== 1 || lock.ticket !== state.ticket || !ticketPattern.test(lock.ticket) ||
      !/^[a-f0-9]{64}$/.test(lock.harness?.contentSha256 ?? '') ||
      !(lock.harness?.commit === null || /^[a-f0-9]{40,64}$/.test(lock.harness?.commit ?? ''))) {
    throw new Error('Invalid harness lock');
  }
  return lock;
}

function runContext(statePath) {
  const path = resolve(statePath);
  if (basename(path) !== 'state.json') throw new Error('Expected docs/sdlc/<ID>/state.json');
  directory(dirname(path));
  directory(dirname(dirname(path)));
  directory(dirname(dirname(dirname(path))));
  const runRoot = realpathSync(dirname(path));
  if (!ticketPattern.test(basename(runRoot)) || basename(dirname(runRoot)) !== 'sdlc' ||
      basename(dirname(dirname(runRoot))) !== 'docs') throw new Error('Expected docs/sdlc/<ID>/state.json');
  const repositoryRoot = dirname(dirname(dirname(runRoot)));
  directory(join(repositoryRoot, 'docs'));
  directory(join(repositoryRoot, 'docs/sdlc'));
  directory(dirname(path));
  if (present(join(runRoot, '.harness-operation-lock'))) throw new Error('Harness revision operation in progress; retry after it finishes');
  const original = regularFile(path).toString();
  const state = JSON.parse(original);
  if (state.ticket !== basename(runRoot)) throw new Error('Ticket ID must match its run directory');
  return { path, runRoot, repositoryRoot, state, original };
}

export function resolveRun(statePath) {
  const context = runContext(statePath);
  const lock = readRunLock(context.state, context.runRoot);
  const root = join(cacheRoot(context.repositoryRoot), lock.harness.contentSha256);
  if (!present(root)) throw new Error('Locked harness snapshot is missing; use harness.mjs restore STATE --source PATH. Never fall back to the latest revision');
  directory(root);
  if (inventory(root).contentSha256 !== lock.harness.contentSha256) throw new Error(`Modified harness snapshot: ${root}`);
  return { ticket: lock.ticket, ...lock.harness, root, state: context.path,
    skills: join(root, 'skills'), agents: join(root, 'agents'), lock: join(context.runRoot, lockName) };
}

export function dispatchPinned(script, statePath, args = process.argv.slice(2)) {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (!state.harness && !present(join(dirname(resolve(statePath)), lockName))) return false;
  const selected = resolveRun(statePath);
  const target = join(selected.root, 'scripts', script);
  if (realpathSync(target) === realpathSync(process.argv[1])) return false;
  const child = spawnSync(process.execPath, [target, ...args], { stdio: 'inherit' });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
  return true;
}

export function startJira(id, repositoryRoot = process.cwd()) {
  if (!/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(id ?? '')) throw new Error('Expected a Jira ticket key');
  const root = realpathSync(repositoryRoot);
  const parent = directory(join(directory(join(root, 'docs'), true), 'sdlc'), true);
  const target = join(parent, id);
  if (present(target)) throw new Error(`Run already exists: ${id}`);
  const stageParent = mkdtempSync(join(parent, '.jira-'));
  try {
    const stage = directory(join(stageParent, id), true);
    const state = JSON.parse(regularFile(join(runtimeRoot, 'templates/state.json')));
    state.ticket = id;
    pinRun(state, stage, root);
    writeFileSync(join(stage, 'state.json'), serialize(state), { flag: 'wx' });
    if (present(target)) throw new Error(`Run already exists: ${id}`);
    renameSync(stage, target);
    return join(target, 'state.json');
  } finally { rmSync(stageParent, { recursive: true, force: true }); }
}

export function restoreRun(statePath, source) {
  const context = runContext(statePath);
  const lock = readRunLock(context.state, context.runRoot);
  const sourceRoot = realpathSync(source);
  if (inventory(sourceRoot).contentSha256 === lock.harness.contentSha256) {
    snapshot(context.repositoryRoot, sourceRoot, lock.harness.contentSha256);
  } else {
    if (!lock.harness.commit) throw new Error('Locked content is not available in this source; supply the exact original snapshot');
    const cache = cacheRoot(context.repositoryRoot, true);
    const stage = mkdtempSync(join(cache, '.restore-'));
    try {
      const checkout = join(stage, 'checkout');
      const clone = spawnSync('git', ['clone', '--quiet', '--no-checkout', '--no-hardlinks', '--', sourceRoot, checkout], { encoding: 'utf8' });
      if (clone.status !== 0) throw new Error(`Cannot restore from local Git history: ${clone.stderr ?? clone.error?.message}`);
      const detached = spawnSync('git', ['-C', checkout, '-c', 'core.autocrlf=false', 'checkout', '--quiet', '--detach', lock.harness.commit], { encoding: 'utf8' });
      if (detached.status !== 0) throw new Error(`Locked commit is not available locally: ${detached.stderr}`);
      snapshot(context.repositoryRoot, checkout, lock.harness.contentSha256);
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
  return resolveRun(statePath);
}

export async function changeRevision(command, statePath, source, reason, confirm) {
  if (!confirm || !reason?.trim()) throw new Error('Revision changes require --confirm and a nonempty --reason; this does not approve any SDLC gate');
  const context = runContext(statePath);
  const { state, runRoot, repositoryRoot, path, original } = context;
  if (state.phase === 'done' || state.gates?.G5b?.status === 'passed') throw new Error('Completed runs are immutable; start a new run instead');
  if (command === 'adopt' && (state.harness || present(join(runRoot, lockName)))) throw new Error('Run already has a harness lock; use upgrade');
  const previousLock = command === 'upgrade' ? readRunLock(state, runRoot) : null;
  const captured = snapshot(repositoryRoot, source);
  if (previousLock?.harness.contentSha256 === captured.contentSha256) throw new Error('Run already uses this harness revision');
  const { invalidate, validateState } = await import(pathToFileURL(join(captured.root, 'scripts/state.mjs')).href);
  if (state.schemaVersion !== 2) throw new Error('Migrate the legacy state schema explicitly before adopting a harness revision');
  const updated = invalidate(state, 'G0', `Harness ${command}: ${reason}`);
  delete updated.policy;
  const lock = { schemaVersion: 1, ticket: state.ticket, createdAt: new Date().toISOString(),
    harness: { commit: captured.commit, contentSha256: captured.contentSha256 } };
  const body = serialize(lock);
  updated.harness = { path: lockName, sha256: sha256(body) };
  const archiveBody = serialize({ state, lock: previousLock });
  const archive = `harness-history/${sha256(archiveBody)}.json`;
  updated.history.push({ at: lock.createdAt, event: `harness-${command}`, reason,
    previous: state.harness ?? null, harness: updated.harness, archive: { path: archive, sha256: sha256(archiveBody) } });
  const operationLock = join(runRoot, '.harness-operation-lock');
  mkdirSync(operationLock, { mode: 0o700 });
  let stage;
  let lockWritten = false;
  let stateWritten = false;
  let oldLock;
  try {
    stage = mkdtempSync(join(runRoot, '.harness-change-'));
    oldLock = present(join(runRoot, lockName)) ? regularFile(join(runRoot, lockName)) : null;
    const validationRoot = join(stage, state.ticket);
    mkdirSync(validationRoot);
    if (state.intake?.kind === 'local') writeFileSync(join(validationRoot, 'intake.md'), regularFile(join(runRoot, 'intake.md')));
    writeFileSync(join(validationRoot, lockName), body);
    const errors = validateState(updated, validationRoot);
    if (errors.length) throw new Error(errors.join('\n'));
    directory(join(runRoot, 'harness-history'), true);
    const archivePath = join(runRoot, archive);
    if (present(archivePath)) {
      if (regularFile(archivePath).toString() !== archiveBody) throw new Error('Harness history conflict');
    } else writeFileSync(archivePath, archiveBody, { flag: 'wx' });
    writeFileSync(join(stage, lockName), body);
    writeFileSync(join(stage, 'state.json'), serialize(updated));
    if (regularFile(path).toString() !== original) throw new Error('Run state changed during revision update');
    renameSync(join(stage, lockName), join(runRoot, lockName));
    lockWritten = true;
    renameSync(join(stage, 'state.json'), path);
    stateWritten = true;
  } finally {
    if (lockWritten && !stateWritten) {
      if (oldLock) writeFileSync(join(runRoot, lockName), oldLock);
      else unlinkSync(join(runRoot, lockName));
    }
    if (stage) rmSync(stage, { recursive: true, force: true });
    rmdirSync(operationLock);
  }
  return resolveRun(path);
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    source: { type: 'string' }, reason: { type: 'string' }, confirm: { type: 'boolean', default: false }
  } });
  const [command, target, extra] = positionals;
  if (command === 'start' && target && positionals.length <= 3) console.log(startJira(target, extra));
  else if (command === 'resolve' && target && !extra) console.log(serialize(resolveRun(target)).trim());
  else if (command === 'restore' && target && !extra && values.source) console.log(serialize(restoreRun(target, values.source)).trim());
  else if (['adopt', 'upgrade'].includes(command) && target && !extra) {
    console.log(serialize(await changeRevision(command, target, values.source ?? runtimeRoot, values.reason, values.confirm)).trim());
  } else throw new Error('Usage: harness.mjs start JIRA-ID [REPO_ROOT]\n       harness.mjs resolve STATE\n       harness.mjs restore STATE --source PATH\n       harness.mjs adopt|upgrade STATE [--source PATH] --reason TEXT --confirm');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
