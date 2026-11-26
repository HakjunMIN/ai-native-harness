import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { withWorktreeLock, worktreeLock } from '../scripts/run-workspace.mjs';
import { git, projectRepo, runBranches, runRoot, runState, runWorktree, worktreeCount } from './helpers/run-fixture.mjs';

const intake = resolve('scripts/intake.mjs');
const harness = resolve('scripts/harness.mjs');
const workspaces = resolve('scripts/workspaces.mjs');
const startLocal = (id, repo, input = 'A bounded request\n') =>
  spawnSync(process.execPath, [intake, 'start-text', id, repo], { input, encoding: 'utf8' });
const startLocalAsync = (id, repo, input = 'A bounded request\n') => new Promise(done => {
  const child = spawn(process.execPath, [intake, 'start-text', id, repo], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('close', status => done({ id, status, stderr }));
  child.stdin.end(input);
});
const startJira = (id, repo) => spawnSync(process.execPath, [harness, 'start', id, repo], { encoding: 'utf8' });
const json = path => JSON.parse(readFileSync(path, 'utf8'));

test('a new local run gets its own worktree and branch and leaves the invoking checkout untouched', t => {
  const { repo } = projectRepo(t);
  const base = git(repo, 'rev-parse', 'HEAD');
  const started = startLocal('local-alpha', repo);
  assert.equal(started.status, 0, started.stderr);
  const worktree = runWorktree(repo, 'local-alpha');
  assert.equal(realpathSync(started.stdout.trim()), realpathSync(runState(repo, 'local-alpha')));
  assert.equal(git(worktree, 'branch', '--show-current'), 'sdlc/local-alpha/integration');
  assert.equal(git(worktree, 'rev-parse', 'HEAD'), base);
  assert.equal(readFileSync(join(runRoot(repo, 'local-alpha'), 'intake.md'), 'utf8'), 'A bounded request\n');
  assert.equal(git(repo, 'branch', '--show-current'), 'main');
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  assert.equal(existsSync(join(repo, 'docs')), false);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.equal(worktreeCount(repo), 2);
});

test('file-based local intake and Jira runs use the same dedicated layout', t => {
  const { root, repo } = projectRepo(t);
  const request = join(root, 'request.md');
  writeFileSync(request, 'Prewritten automation request\n');
  const local = spawnSync(process.execPath, [intake, 'start', 'local-file', request, repo], { encoding: 'utf8' });
  assert.equal(local.status, 0, local.stderr);
  assert.equal(readFileSync(join(runRoot(repo, 'local-file'), 'intake.md'), 'utf8'), 'Prewritten automation request\n');
  const jira = startJira('ABC-42', repo);
  assert.equal(jira.status, 0, jira.stderr);
  assert.equal(realpathSync(jira.stdout.trim()), realpathSync(runState(repo, 'ABC-42')));
  assert.equal(json(runState(repo, 'ABC-42')).ticket, 'ABC-42');
  assert.equal(git(runWorktree(repo, 'ABC-42'), 'branch', '--show-current'), 'sdlc/ABC-42/integration');
  assert.equal(git(repo, 'branch', '--show-current'), 'main');
  assert.equal(existsSync(join(repo, 'docs')), false);
});

test('two tickets started back to back never share a checkout', t => {
  const { repo } = projectRepo(t);
  assert.equal(startJira('ABC-1', repo).status, 0);
  assert.equal(startJira('ABC-2', repo).status, 0);
  assert.equal(startLocal('local-third', repo).status, 0);
  assert.equal(worktreeCount(repo), 4);
  assert.deepEqual(runBranches(repo).sort(), ['sdlc/ABC-1/integration', 'sdlc/ABC-2/integration', 'sdlc/local-third/integration']);
  for (const [id, others] of [['ABC-1', ['ABC-2', 'local-third']], ['ABC-2', ['ABC-1', 'local-third']]]) {
    assert.equal(existsSync(runState(repo, id)), true);
    for (const other of others) assert.equal(existsSync(join(runWorktree(repo, id), 'docs/sdlc', other)), false, `${id} must not contain ${other}`);
  }
  const first = runWorktree(repo, 'ABC-1');
  writeFileSync(join(first, 'first.txt'), 'only in the first ticket\n');
  git(first, 'add', 'first.txt');
  git(first, 'commit', '-qm', 'first ticket work');
  assert.equal(existsSync(join(runWorktree(repo, 'ABC-2'), 'first.txt')), false);
  assert.notEqual(git(first, 'rev-parse', 'HEAD'), git(runWorktree(repo, 'ABC-2'), 'rev-parse', 'HEAD'));
  assert.equal(git(repo, 'branch', '--show-current'), 'main');
});

test('tickets started at the same moment each get their own worktree and share one snapshot', async t => {
  const ids = ['local-a', 'local-b', 'local-c', 'local-d'];
  const { repo } = projectRepo(t);
  const results = await Promise.all(ids.map(id => startLocalAsync(id, repo)));
  for (const result of results) assert.equal(result.status, 0, `${result.id}: ${result.stderr}`);
  assert.equal(worktreeCount(repo), ids.length + 1);
  assert.deepEqual(runBranches(repo).sort(), ids.map(id => `sdlc/${id}/integration`));
  assert.equal(readdirSync(join(repo, '.ai-native-sdlc-revisions')).length, 1, 'identical content is cached once');
});

test('the same ticket started several times at once is created once and refused otherwise', async t => {
  const { repo } = projectRepo(t);
  const results = await Promise.all(Array.from({ length: 4 }, () => startLocalAsync('local-twin', repo)));
  assert.equal(results.filter(result => result.status === 0).length, 1, results.map(result => result.stderr).join('\n'));
  for (const loser of results.filter(result => result.status !== 0)) assert.match(loser.stderr, /already exists/);
  assert.deepEqual(runBranches(repo), ['sdlc/local-twin/integration']);
  assert.equal(worktreeCount(repo), 2);
});

test('git creates the worktree only while the repository lock is held', t => {
  const { repo } = projectRepo(t);
  const marker = join(dirname(repo), 'lock-during-checkout.log');
  writeFileSync(join(repo, '.git/hooks/post-checkout'),
    `#!/bin/sh\nif [ -d "${worktreeLock(repo)}" ]; then echo held; else echo free; fi >> "${marker}"\n`, { mode: 0o755 });
  const started = startLocal('local-locked', repo);
  assert.equal(started.status, 0, started.stderr);
  assert.equal(readFileSync(marker, 'utf8'), 'held\n');
  assert.equal(existsSync(worktreeLock(repo)), false, 'the lock is released afterwards');
});

test('a worktree that git creates but a hook rejects is rolled back so the start can be repeated', t => {
  const { repo } = projectRepo(t);
  const hook = join(repo, '.git/hooks/post-checkout');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const failed = startLocal('local-hook', repo);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /git worktree add .* failed/);
  assert.deepEqual(runBranches(repo), []);
  assert.equal(worktreeCount(repo), 1);
  assert.equal(existsSync(runWorktree(repo, 'local-hook')), false);
  assert.equal(existsSync(worktreeLock(repo)), false);
  rmSync(hook);
  const retried = startLocal('local-hook', repo);
  assert.equal(retried.status, 0, retried.stderr);
  assert.deepEqual(runBranches(repo), ['sdlc/local-hook/integration']);
});

test('a worktree path that cannot be created leaves no branch behind', t => {
  const { repo } = projectRepo(t);
  const blocker = dirname(dirname(runWorktree(repo, 'local-blocked')));
  mkdirSync(dirname(blocker), { recursive: true });
  writeFileSync(blocker, 'a file where the worktree directory must go\n');
  const failed = startLocal('local-blocked', repo);
  assert.notEqual(failed.status, 0);
  assert.deepEqual(runBranches(repo), []);
  assert.equal(existsSync(worktreeLock(repo)), false);
  rmSync(blocker);
  assert.equal(startLocal('local-blocked', repo).status, 0);
});

test('rolling back a failed start leaves worktrees whose directory is temporarily missing alone', t => {
  const { repo } = projectRepo(t);
  const feature = join(dirname(repo), 'feature');
  git(repo, 'worktree', 'add', '-q', '-b', 'feature', feature);
  writeFileSync(join(feature, 'staged.txt'), 'staged work\n');
  git(feature, 'add', 'staged.txt');
  const parked = `${feature}.away`;
  renameSync(feature, parked);
  mkdirSync(join(repo, '.worktrees'));
  writeFileSync(dirname(dirname(runWorktree(repo, 'local-rollback'))), 'a file where the worktree directory must go\n');
  assert.notEqual(startLocal('local-rollback', repo).status, 0);
  renameSync(parked, feature);
  assert.equal(git(feature, 'branch', '--show-current'), 'feature');
  assert.match(git(feature, 'status', '--porcelain'), /^A\s+staged\.txt$/m);
});

test('a lock left behind by a crashed start is reclaimed', t => {
  const { repo } = projectRepo(t);
  const lock = worktreeLock(repo);
  mkdirSync(lock);
  writeFileSync(join(lock, 'pid'), String(spawnSync(process.execPath, ['-e', '']).pid));
  const started = startLocal('local-after-crash', repo);
  assert.equal(started.status, 0, started.stderr);
  assert.equal(existsSync(lock), false);
});

test('a start waits for a live lock holder instead of racing it', async t => {
  const { repo } = projectRepo(t);
  const lock = worktreeLock(repo);
  mkdirSync(lock);
  writeFileSync(join(lock, 'pid'), String(process.pid));
  let finished = false;
  const started = startLocalAsync('local-waiting', repo).then(result => { finished = true; return result; });
  await new Promise(done => setTimeout(done, 800));
  assert.equal(finished, false, 'the start must wait for the lock holder');
  assert.deepEqual(runBranches(repo), []);
  rmSync(lock, { recursive: true });
  const result = await started;
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(runBranches(repo), ['sdlc/local-waiting/integration']);
});

test('waiting for a lock that never frees fails with its path and a remedy', t => {
  const { repo } = projectRepo(t);
  const lock = worktreeLock(repo);
  mkdirSync(lock);
  writeFileSync(join(lock, 'pid'), String(process.pid));
  assert.throws(() => withWorktreeLock(repo, () => {}, 100), error => error.message.includes(lock) && /remove/i.test(error.message));
  assert.equal(existsSync(lock), true, 'a live holder keeps its lock');
});

test('a reclaim guard left by a killed waiter does not wedge the lock', t => {
  const { repo } = projectRepo(t);
  const lock = worktreeLock(repo);
  mkdirSync(lock);
  writeFileSync(join(lock, 'pid'), String(spawnSync(process.execPath, ['-e', '']).pid));
  const guard = `${lock}.reclaim`;
  mkdirSync(guard);
  const longAgo = new Date(Date.now() - 60_000);
  utimesSync(guard, longAgo, longAgo);
  let ran = false;
  withWorktreeLock(repo, () => { ran = true; }, 3000);
  assert.equal(ran, true);
  assert.equal(existsSync(lock), false);
  assert.equal(existsSync(guard), false, 'the guard is cleaned up too');
});

test('a holder whose lock was taken over never removes the new holder lock', t => {
  const { repo } = projectRepo(t);
  const lock = worktreeLock(repo);
  withWorktreeLock(repo, () => {
    rmSync(lock, { recursive: true });
    mkdirSync(lock);
    writeFileSync(join(lock, 'pid'), String(process.ppid));
  });
  assert.equal(readFileSync(join(lock, 'pid'), 'utf8'), String(process.ppid));
});

test('starting from another run worktree is refused so tickets cannot contaminate each other', t => {
  const { repo } = projectRepo(t);
  assert.equal(startJira('ABC-1', repo).status, 0);
  const refused = startLocal('local-beta', runWorktree(repo, 'ABC-1'));
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /sdlc\/ABC-1\/integration/);
  assert.match(refused.stderr, /primary checkout|another run/i);
  assert.equal(existsSync(runWorktree(repo, 'local-beta')), false);
  assert.deepEqual(runBranches(repo), ['sdlc/ABC-1/integration']);
  assert.equal(worktreeCount(repo), 2);
});

test('an already dedicated worktree is adopted instead of nesting another one', t => {
  const { root, repo } = projectRepo(t);
  const manual = join(root, 'manual-gamma');
  git(repo, 'worktree', 'add', '-q', '-b', 'sdlc/local-gamma/integration', manual, 'HEAD');
  const started = startLocal('local-gamma', manual);
  assert.equal(started.status, 0, started.stderr);
  assert.equal(realpathSync(started.stdout.trim()), realpathSync(join(manual, 'docs/sdlc/local-gamma/state.json')));
  assert.equal(worktreeCount(repo), 2);
  assert.deepEqual(runBranches(repo), ['sdlc/local-gamma/integration']);
  assert.notEqual(startLocal('local-delta', manual).status, 0, 'a worktree dedicated to one run cannot host a different run');
  assert.equal(worktreeCount(repo), 2);
});

test('duplicate IDs, orphaned branches and committed runs are refused without side effects', t => {
  const { repo } = projectRepo(t);
  assert.equal(startLocal('local-dup', repo).status, 0);
  const duplicate = startLocal('local-dup', repo);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /already exists/);
  git(repo, 'branch', 'sdlc/local-orphan/integration');
  const orphan = startLocal('local-orphan', repo);
  assert.notEqual(orphan.status, 0);
  assert.match(orphan.stderr, /already exists/);
  assert.match(orphan.stderr, /git worktree add/);
  mkdirSync(join(repo, 'docs/sdlc/ABC-7'), { recursive: true });
  writeFileSync(join(repo, 'docs/sdlc/ABC-7/state.json'), '{}');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'legacy in-place run');
  const committed = startJira('ABC-7', repo);
  assert.notEqual(committed.status, 0);
  assert.match(committed.stderr, /already exists/);
  assert.deepEqual(runBranches(repo).sort(), ['sdlc/local-dup/integration', 'sdlc/local-orphan/integration']);
  assert.equal(worktreeCount(repo), 2);
});

test('run worktrees live under the primary checkout ignored .worktrees/sdlc directory', t => {
  const { repo } = projectRepo(t);
  assert.equal(startLocal('local-inside', repo).status, 0);
  assert.equal(realpathSync(runWorktree(repo, 'local-inside')),
    realpathSync(join(repo, '.worktrees/sdlc/local-inside/integration')));
  assert.equal(existsSync(join(repo, '..', 'repo.sdlc-worktrees')), false);
  assert.equal(git(repo, 'status', '--porcelain', '--untracked-files=all'), '');
});

test('a run is refused before anything is created when .worktrees is not ignored', t => {
  const { root, repo } = projectRepo(t);
  writeFileSync(join(repo, '.gitignore'), '.ai-native-sdlc-revisions/\n');
  git(repo, 'commit', '-qam', 'drop worktree ignore');
  const refused = startLocal('local-unignored', repo);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /\.worktrees.*not ignored.*\/\.worktrees\//s);
  assert.deepEqual(runBranches(repo), []);
  assert.equal(worktreeCount(repo), 1);
  assert.equal(existsSync(join(repo, '.worktrees')), false);
  const manual = join(root, 'manual-run');
  git(repo, 'worktree', 'add', '-q', '-b', 'sdlc/local-manual/integration', manual, 'HEAD');
  assert.equal(startLocal('local-manual', manual).status, 0, 'a worktree the user created elsewhere is still adopted');
  writeFileSync(join(repo, '.gitignore'), '.ai-native-sdlc-revisions/\n/.worktrees/\n');
  assert.equal(startLocal('local-unignored', repo).status, 0);
});

test('invalid IDs and blank requests never create a branch or worktree', t => {
  const { repo } = projectRepo(t);
  for (const id of ['ABC-1', '../escape', 'local--bad', 'LOCAL-upper', 'local-' + 'x'.repeat(80)]) {
    assert.notEqual(startLocal(id, repo).status, 0, id);
  }
  assert.match(startLocal('local-blank', repo, ' \n').stderr, /nonempty/);
  for (const id of ['ABC-0', 'ABC-01', 'abc-1', 'ABC-1/../x', 'local-doc']) {
    assert.notEqual(startJira(id, repo).status, 0, id);
  }
  assert.deepEqual(runBranches(repo), []);
  assert.equal(worktreeCount(repo), 1);
  assert.equal(existsSync(join(repo, '.worktrees')), false);
});

test('a failed creation removes the worktree and branch it created', t => {
  const { root, repo } = projectRepo(t);
  mkdirSync(join(root, 'elsewhere'));
  symlinkSync(join(root, 'elsewhere'), join(repo, 'docs'));
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'docs is a symlink');
  const failed = startLocal('local-broken', repo);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /symlink/);
  assert.equal(existsSync(runWorktree(repo, 'local-broken')), false);
  assert.deepEqual(runBranches(repo), []);
  assert.equal(worktreeCount(repo), 1);
});

test('a repository without commits or Git is refused before anything is created', t => {
  const { root, repo } = projectRepo(t, { commit: false });
  const refused = startLocal('local-empty', repo);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /commit/i);
  assert.equal(existsSync(join(repo, '.worktrees')), false);
  const plain = join(root, 'plain');
  mkdirSync(plain);
  const outside = startLocal('local-plain', plain);
  assert.notEqual(outside.status, 0);
  assert.match(outside.stderr, /Git repository/i);
  assert.equal(existsSync(join(plain, 'docs')), false);
});

test('uncommitted changes are reported because the run worktree starts from the last commit', t => {
  const { repo } = projectRepo(t);
  writeFileSync(join(repo, 'notes.txt'), 'not committed\n');
  const started = startLocal('local-dirty', repo);
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stderr, /has 1 uncommitted change\(s\)/);
  assert.equal(existsSync(join(runWorktree(repo, 'local-dirty'), 'notes.txt')), false);
  assert.equal(readFileSync(join(repo, 'notes.txt'), 'utf8'), 'not committed\n');
});

test('the snapshot cache kept in the primary checkout is not reported as uncommitted work', t => {
  const { repo } = projectRepo(t, { commit: false });
  writeFileSync(join(repo, '.gitignore'), '/.worktrees/\n');
  writeFileSync(join(repo, 'README.md'), '# fixture\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'initial');
  assert.equal(startLocal('local-cache-one', repo).status, 0);
  assert.equal(existsSync(join(repo, '.ai-native-sdlc-revisions')), true);
  const clean = startLocal('local-cache-two', repo);
  assert.equal(clean.status, 0, clean.stderr);
  assert.doesNotMatch(clean.stderr, /uncommitted/i);
});

const resolveRun = state => spawnSync(process.execPath, [harness, 'resolve', state], { encoding: 'utf8' });

test('a subdirectory run keeps its relative path and its snapshot outlives the worktree', t => {
  const { repo } = projectRepo(t);
  const app = join(repo, 'packages/app');
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, 'index.js'), 'export {};\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'app');
  const started = startLocal('local-keep', app);
  assert.equal(started.status, 0, started.stderr);
  const worktree = runWorktree(repo, 'local-keep');
  assert.equal(realpathSync(started.stdout.trim()),
    realpathSync(join(worktree, 'packages/app/docs/sdlc/local-keep/state.json')));
  assert.equal(existsSync(join(worktree, 'docs')), false);
  assert.equal(existsSync(join(app, '.ai-native-sdlc-revisions')), true);
  assert.equal(existsSync(join(worktree, 'packages/app/.ai-native-sdlc-revisions')), false);
  assert.equal(resolveRun(started.stdout.trim()).status, 0);
  git(worktree, 'add', '-A');
  git(worktree, 'commit', '-qm', 'run files');
  git(repo, 'merge', '--ff-only', 'sdlc/local-keep/integration');
  git(repo, 'worktree', 'remove', '--force', worktree);
  const archived = resolveRun(join(app, 'docs/sdlc/local-keep/state.json'));
  assert.equal(archived.status, 0, archived.stderr);
});

test('run listing finds every run from the primary checkout or from inside a worktree', t => {
  const { repo } = projectRepo(t);
  assert.equal(startJira('ABC-1', repo).status, 0);
  assert.equal(startLocal('local-two', repo).status, 0);
  mkdirSync(join(repo, 'docs/sdlc/local-legacy'), { recursive: true });
  writeFileSync(join(repo, 'docs/sdlc/local-legacy/state.json'), JSON.stringify({ ticket: 'local-legacy', phase: 'plan' }));
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'legacy in-place run');
  const list = cwd => {
    const result = spawnSync(process.execPath, [workspaces, 'list', cwd], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return Object.fromEntries(JSON.parse(result.stdout).map(run => [run.id, run]));
  };
  for (const from of [repo, runWorktree(repo, 'ABC-1'), runWorktree(repo, 'local-two')]) {
    const runs = list(from);
    assert.deepEqual(Object.keys(runs).sort(), ['ABC-1', 'local-legacy', 'local-two']);
    assert.equal(realpathSync(runs['ABC-1'].worktree), realpathSync(runWorktree(repo, 'ABC-1')));
    assert.equal(realpathSync(runs['ABC-1'].state), realpathSync(runState(repo, 'ABC-1')));
    assert.equal(runs['ABC-1'].branch, 'sdlc/ABC-1/integration');
    assert.equal(runs['ABC-1'].dedicated, true);
    assert.equal(runs['ABC-1'].phase, 'discover');
    assert.equal(runs['local-legacy'].dedicated, false);
    assert.equal(runs['local-legacy'].phase, 'plan');
    assert.equal(realpathSync(runs['local-legacy'].worktree), realpathSync(repo));
  }
  const { root } = projectRepo(t, { name: 'other' });
  const plain = join(root, 'plain');
  mkdirSync(plain);
  const empty = spawnSync(process.execPath, [workspaces, 'list', plain], { encoding: 'utf8' });
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(JSON.parse(empty.stdout), []);
});
