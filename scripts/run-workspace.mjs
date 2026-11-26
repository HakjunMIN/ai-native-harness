import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Every SDLC run lives in its own linked worktree on sdlc/<ID>/integration.
// Run and parallel slice worktrees live under the primary checkout: <main>/.worktrees/sdlc/<ID>/{integration,t<N>}.
const runBranch = /^sdlc\/[^/]+\/(?:integration|t[1-9][0-9]*)$/;
export const snapshotCache = '.ai-native-sdlc-revisions';
// Native realpath expands Windows 8.3 short names and normalizes case, so paths derived from the
// caller's directory and from Git compare and relativize consistently.
const canonical = path => realpathSync.native(path);
const present = path => {
  try { lstatSync(path); return true; }
  catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false; throw error; }
};

function run(directory, args) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

function git(directory, ...args) {
  const result = run(directory, args);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

export const integrationBranch = id => `sdlc/${id}/integration`;
const workspaceRoot = main => join(main, '.worktrees', 'sdlc');
export const runWorktreePath = (main, id) => join(workspaceRoot(main), id, 'integration');
export const sliceWorktreePath = (main, id, slice) => join(workspaceRoot(main), id, `t${slice}`);

// New worktrees sit inside the primary checkout, so Git must ignore them there before any is created.
export function requireIgnoredWorkspace(main, path) {
  const target = relative(main, path);
  const result = run(main, ['check-ignore', '--quiet', '--', target]);
  if (result.status === 0) return;
  if (result.status === 1) throw new Error(`${target} is not ignored by Git in ${main}; add /.worktrees/ to ${join(main, '.gitignore')} (the harness installer adds it) before creating SDLC worktrees`);
  throw new Error(`git check-ignore ${target} failed: ${result.stderr.trim()}`);
}

function toplevel(directory) {
  const result = run(directory, ['rev-parse', '--show-toplevel']);
  return result.status === 0 ? canonical(result.stdout.trim()) : null;
}

export function worktrees(directory) {
  return git(directory, 'worktree', 'list', '--porcelain').split(/\n\n+/).filter(Boolean).map(block => {
    const fields = new Map(block.split('\n').map(line => {
      const space = line.indexOf(' ');
      return space < 0 ? [line, ''] : [line.slice(0, space), line.slice(space + 1)];
    }));
    const path = fields.get('worktree');
    const branch = fields.get('branch');
    return { path: present(path) ? canonical(path) : path, branch: branch?.replace(/^refs\/heads\//, '') ?? null,
      bare: fields.has('bare'), prunable: fields.has('prunable') };
  });
}

export const mainWorktree = directory => worktrees(directory)[0].path;

function currentBranch(directory) {
  const result = run(directory, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  return result.status === 0 ? result.stdout.trim() : null;
}

// Git neither serializes concurrent `worktree add` calls nor undoes the branch or worktree it created
// when a late step such as a post-checkout hook fails. All worktree changes therefore run under one
// per-repository lock: a directory in the common git dir whose pid file names the holder.
const lockWaitMs = 300_000;
const guardStaleMs = 10_000;
const held = new Set();
const sleep = milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
const alive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
};
const ownerOf = lock => {
  try { return Number.parseInt(readFileSync(join(lock, 'pid'), 'utf8'), 10); }
  catch { return Number.NaN; }
};

export function worktreeLock(directory) {
  const common = realpathSync(resolve(directory, git(directory, 'rev-parse', '--git-common-dir')));
  return join(common, 'ai-native-sdlc-worktrees.lock');
}

// A killed holder leaves its lock behind; one that died before writing its pid is judged by age.
function abandoned(lock) {
  const owner = ownerOf(lock);
  if (owner > 0) return !alive(owner);
  try { return Date.now() - lstatSync(lock).mtimeMs > 10_000; } catch { return false; }
}

// Two waiters can judge the same abandoned lock stale; a short-lived guard directory serializes the
// removal so the slower one cannot delete a lock the faster one has just taken.
function reclaim(lock) {
  const guard = `${lock}.reclaim`;
  try { mkdirSync(guard); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try { if (Date.now() - lstatSync(guard).mtimeMs > guardStaleMs) rmSync(guard, { recursive: true, force: true }); }
    catch { /* released in the meantime */ }
    return false;
  }
  try {
    if (!abandoned(lock)) return false;
    rmSync(lock, { recursive: true, force: true });
    return true;
  } finally { rmSync(guard, { recursive: true, force: true }); }
}

export function withWorktreeLock(directory, action, waitMs = lockWaitMs) {
  const lock = worktreeLock(directory);
  if (held.has(lock)) return action();
  const deadline = Date.now() + waitMs;
  for (;;) {
    try { mkdirSync(lock); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (abandoned(lock) && reclaim(lock)) continue;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for another SDLC start to finish changing worktrees. If none is running, remove ${lock}`);
    sleep(10 + Math.floor(Math.random() * 40));
  }
  held.add(lock);
  try {
    writeFileSync(join(lock, 'pid'), String(process.pid));
    return action();
  } finally {
    held.delete(lock);
    if (ownerOf(lock) === process.pid) rmSync(lock, { recursive: true, force: true });
  }
}

// Creates `branch` and a worktree for it, or leaves nothing behind. `git worktree prune` is avoided
// because it would also unregister unrelated worktrees whose directory is temporarily missing.
export function addWorktree(repository, branch, path, base) {
  withWorktreeLock(repository, () => {
    if (run(repository, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0) throw new Error(`Branch already exists: ${branch}`);
    if (present(path)) throw new Error(`Worktree path already exists: ${path}`);
    const added = run(repository, ['worktree', 'add', '-q', '-b', branch, path, base]);
    if (added.status === 0) return;
    run(repository, ['worktree', 'remove', '--force', path]);
    // Node 22 reports ENOTDIR instead of ignoring a path under a file; such a path cannot exist.
    try { rmSync(path, { recursive: true, force: true }); } catch (error) { if (error.code !== 'ENOTDIR') throw error; }
    run(repository, ['branch', '-D', branch]);
    throw new Error(`git worktree add -b ${branch} ${path} ${base} failed: ${added.stderr.trim() || `exit status ${added.status}`}`);
  });
}

export function discardWorktree(repository, worktree, branch) {
  let clean = false;
  try {
    clean = withWorktreeLock(repository, () => {
      const removed = run(repository, ['worktree', 'remove', '--force', worktree]).status === 0;
      const deleted = run(repository, ['branch', '-D', branch]).status === 0;
      return removed && deleted;
    });
  } catch { /* reported below */ }
  if (!clean) {
    process.stderr.write(`warning: could not remove worktree ${worktree}; clean up with: git worktree remove --force ${worktree} && git branch -D ${branch}\n`);
  }
}

// Returns the checkout that must hold the run's files. A linked worktree that is
// already on sdlc/<id>/integration is adopted; otherwise a new one is created from HEAD.
export function openRunWorkspace(id, repositoryRoot = process.cwd()) {
  const start = canonical(repositoryRoot);
  const source = toplevel(start);
  if (!source) throw new Error(`${start} is not inside a Git repository; run git init and commit once, because every SDLC run needs its own worktree`);
  return withWorktreeLock(source, () => openLocked(id, start, source));
}

function openLocked(id, start, source) {
  const subdirectory = relative(source, start);
  const trees = worktrees(source);
  const main = trees[0].path;
  const branch = integrationBranch(id);
  const current = currentBranch(source);
  if (current === branch && source !== main) return { root: start, worktree: source, branch, created: false, discard() {} };
  const path = runWorktreePath(main, id);
  if (run(source, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0) {
    const holder = trees.find(tree => tree.branch === branch);
    throw new Error(holder
      ? `Run already exists: ${id}. Its worktree is ${holder.path}; resume there`
      : `Run already exists: ${id}. Branch ${branch} has no worktree; recreate it with: git worktree add ${path} ${branch}`);
  }
  for (const tree of trees) {
    if (!tree.bare && !tree.prunable && present(join(tree.path, subdirectory, 'docs/sdlc', id))) {
      throw new Error(`Run already exists: ${id} (${join(tree.path, subdirectory, 'docs/sdlc', id)})`);
    }
  }
  if (current && runBranch.test(current)) {
    throw new Error(`Cannot start ${id} from ${current}, which belongs to another run, so its changes would leak into the new run. Start from the primary checkout or any other branch`);
  }
  if (present(path)) throw new Error(`Run already exists: ${id}. ${path} is in the way; move or remove it`);
  const head = run(source, ['rev-parse', '--verify', 'HEAD']);
  if (head.status !== 0) throw new Error('Commit once before starting a run: its worktree is created from HEAD');
  // The snapshot cache sits in the primary checkout at its root or the starting subdirectory; it is not project work.
  const inCache = file => file.startsWith(`${snapshotCache}/`) || file.includes(`/${snapshotCache}/`);
  const changed = git(source, 'status', '--porcelain').split('\n').filter(line => line && !inCache(line.slice(3))).length;
  if (changed) {
    process.stderr.write(`warning: ${source} has ${changed} uncommitted change(s); the run worktree starts from commit ${head.stdout.trim().slice(0, 12)}, so they are not included\n`);
  }
  requireIgnoredWorkspace(main, path);
  addWorktree(source, branch, path, 'HEAD');
  const worktree = canonical(path);
  process.stderr.write(`created run worktree ${worktree} on ${branch}\n`);
  return { root: subdirectory ? join(worktree, subdirectory) : worktree, worktree, branch, created: true,
    discard() { discardWorktree(source, worktree, branch); } };
}

export function withRunWorkspace(id, repositoryRoot, create) {
  const workspace = openRunWorkspace(id, repositoryRoot);
  try { return create(workspace.root); }
  catch (error) { workspace.discard(); throw error; }
}

function runsIn(root) {
  const base = join(root, 'docs/sdlc');
  if (!present(base) || !lstatSync(base).isDirectory()) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && present(join(base, entry.name, 'state.json')))
    .map(entry => ({ id: entry.name, state: join(base, entry.name, 'state.json') }));
}

function phaseOf(file) {
  try { return { phase: JSON.parse(readFileSync(file, 'utf8')).phase ?? null }; }
  catch (error) { return { phase: null, error: error.message }; }
}

// Lists runs across the primary checkout and every linked worktree. A copy in the
// run's dedicated worktree wins over copies committed elsewhere.
export function listRuns(directory = process.cwd()) {
  const start = canonical(directory);
  const source = toplevel(start);
  const trees = source
    ? worktrees(source).filter(tree => !tree.bare && !tree.prunable && present(tree.path))
    : [{ path: start, branch: null }];
  const subdirectory = source ? relative(source, start) : '';
  const main = trees[0]?.path;
  const runs = new Map();
  for (const tree of trees) {
    for (const { id, state } of runsIn(join(tree.path, subdirectory))) {
      const dedicated = Boolean(source) && tree.path !== main && tree.branch === integrationBranch(id);
      if (runs.has(id) && !(dedicated && !runs.get(id).dedicated)) continue;
      runs.set(id, { id, state, worktree: tree.path, branch: tree.branch, dedicated, ...phaseOf(state) });
    }
  }
  return [...runs.values()].sort((first, second) => first.id.localeCompare(second.id));
}
