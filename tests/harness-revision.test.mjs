import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const assets = ['skills', 'agents', 'hooks', 'scripts', 'templates', 'docs'];
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sdlc-revision-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'harness');
  const repo = join(root, 'service');
  mkdirSync(source);
  mkdirSync(repo);
  for (const directory of assets) cpSync(resolve(directory), join(source, directory), { recursive: true });
  const run = (script, ...args) => spawnSync(process.execPath, [join(source, 'scripts', script), ...args],
    { cwd: repo, encoding: 'utf8' });
  const state = id => join(repo, 'docs/sdlc', id, 'state.json');
  const start = id => spawnSync(process.execPath,
    [join(source, 'scripts/intake.mjs'), 'start-text', id, repo], { input: 'A bounded documentation request', encoding: 'utf8' });
  return { root, source, repo, run, state, start };
}
const json = path => JSON.parse(readFileSync(path, 'utf8'));

test('local intake pins a ticket-scoped harness lock without creating a repository lock', t => {
  const fixture_ = fixture(t);
  const result = fixture_.start('local-first');
  assert.equal(result.status, 0, result.stderr);
  const lock = join(fixture_.repo, 'docs/sdlc/local-first/harness.lock.json');
  assert.ok(existsSync(lock), 'new local runs must have a ticket-scoped harness lock');
  assert.equal(json(lock).ticket, 'local-first');
  assert.match(json(lock).harness.contentSha256, /^[a-f0-9]{64}$/);
  assert.equal(json(fixture_.state('local-first')).harness.path, 'harness.lock.json');
  assert.equal(existsSync(join(fixture_.repo, 'harness.lock.json')), false);
});

test('existing tickets retain their snapshot while new tickets use changed skills', t => {
  const fixture_ = fixture(t);
  assert.equal(fixture_.start('local-first').status, 0);
  assert.equal(fixture_.start('local-second').status, 0);
  const resolved = id => {
    const result = fixture_.run('harness.mjs', 'resolve', fixture_.state(id));
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const first = resolved('local-first');
  assert.equal(resolved('local-second').root, first.root);
  const skill = join(fixture_.source, 'skills/sdlc/SKILL.md');
  writeFileSync(skill, readFileSync(skill, 'utf8') + '\nChanged procedure\n');
  assert.equal(fixture_.start('local-third').status, 0);
  const third = resolved('local-third');
  assert.notEqual(first.contentSha256, third.contentSha256);
  assert.equal(resolved('local-first').root, first.root);
  assert.doesNotMatch(readFileSync(join(first.root, 'skills/sdlc/SKILL.md'), 'utf8'), /Changed procedure/);
  assert.match(readFileSync(join(third.root, 'skills/sdlc/SKILL.md'), 'utf8'), /Changed procedure/);
  assert.equal(existsSync(join(fixture_.repo, '.ai-native-sdlc')), false);
});

test('snapshots retain referenced runtime docs but exclude ticket and unrelated docs', t => {
  const fixture_ = fixture(t);
  writeFileSync(join(fixture_.source, 'docs/private-ticket.md'), 'Not a runtime asset');
  assert.equal(fixture_.start('local-first').status, 0);
  const first = JSON.parse(fixture_.run('harness.mjs', 'resolve', fixture_.state('local-first')).stdout);
  for (const name of ['operations.md', 'compatibility.md']) {
    assert.ok(existsSync(join(first.root, 'docs', name)), `snapshot must include docs/${name}`);
  }
  assert.deepEqual(readdirSync(join(first.root, 'docs')).sort(), ['compatibility.md', 'operations.md']);
  const document = join(fixture_.source, 'docs/operations.md');
  const original = readFileSync(document, 'utf8');
  writeFileSync(document, original + '\nChanged operations\n');
  assert.equal(fixture_.start('local-second').status, 0);
  const second = JSON.parse(fixture_.run('harness.mjs', 'resolve', fixture_.state('local-second')).stdout);
  assert.notEqual(first.contentSha256, second.contentSha256);
  assert.equal(readFileSync(join(first.root, 'docs/operations.md'), 'utf8'), original);
  assert.match(readFileSync(join(second.root, 'docs/operations.md'), 'utf8'), /Changed operations/);
});

test('shared installations reuse snapshots across repos without switching the shared link or hooks', t => {
  const fixture_ = fixture(t);
  const second = join(fixture_.root, 'second service');
  mkdirSync(second);
  symlinkSync(fixture_.source, join(fixture_.repo, '.ai-native-sdlc'), 'dir');
  symlinkSync(fixture_.source, join(second, '.ai-native-sdlc'), 'dir');
  const guard = readFileSync(join(fixture_.source, 'hooks/guard.mjs'), 'utf8');
  assert.equal(fixture_.start('local-first').status, 0);
  const start = fixture_.run('harness.mjs', 'start', 'ABC-123', second);
  assert.equal(start.status, 0, start.stderr);
  const first = JSON.parse(fixture_.run('harness.mjs', 'resolve', fixture_.state('local-first')).stdout);
  const other = JSON.parse(fixture_.run('harness.mjs', 'resolve', join(second, 'docs/sdlc/ABC-123/state.json')).stdout);
  assert.equal(first.root, other.root);
  assert.equal(realpathSync(join(second, '.ai-native-sdlc')), fixture_.source);
  assert.equal(readFileSync(join(fixture_.source, 'hooks/guard.mjs'), 'utf8'), guard);
});

test('Jira starts pin pending state without fabricating snapshot evidence or approval', t => {
  const fixture_ = fixture(t);
  const start = fixture_.run('harness.mjs', 'start', 'ABC-123', fixture_.repo);
  assert.equal(start.status, 0, start.stderr);
  const state = json(fixture_.state('ABC-123'));
  assert.equal(state.ticket, 'ABC-123');
  assert.equal(state.jira.sync, 'pending');
  assert.ok(Object.values(state.gates).every(gate => gate.status === 'pending'));
  assert.equal(fixture_.run('state.mjs', 'check', fixture_.state('ABC-123')).status, 0);
  assert.match(fixture_.run('harness.mjs', 'start', 'ABC-123', fixture_.repo).stderr, /already exists/);
});

test('state, task and workspace CLIs dispatch to the ticket snapshot, not the installed implementation', t => {
  const fixture_ = fixture(t);
  for (const name of ['state.mjs', 'tasks.mjs', 'workspaces.mjs']) {
    const path = join(fixture_.source, 'scripts', name);
    writeFileSync(path, readFileSync(path, 'utf8') + `\nif (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.error('pinned-${name}');\n`);
  }
  assert.equal(fixture_.start('local-first').status, 0);
  for (const name of ['state.mjs', 'tasks.mjs', 'workspaces.mjs']) {
    const path = join(fixture_.source, 'scripts', name);
    writeFileSync(path, readFileSync(path, 'utf8').replace(`console.error('pinned-${name}')`, `console.error('latest-${name}')`));
  }
  const statePath = fixture_.state('local-first');
  const check = fixture_.run('state.mjs', 'check', statePath);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stderr, /pinned-state.mjs/);
  const config = join(fixture_.repo, 'config.json');
  const draft = join(fixture_.repo, 'draft.json');
  writeFileSync(config, '{}');
  writeFileSync(draft, '{}');
  const tasks = fixture_.run('tasks.mjs', 'prepare', statePath, config, draft);
  assert.match(tasks.stderr, /pinned-tasks.mjs/);
  assert.match(tasks.stderr, /prepare requires valid G1/);
  const workspaces = fixture_.run('workspaces.mjs', 'plan', statePath);
  assert.match(workspaces.stderr, /pinned-workspaces.mjs/);
});

test('edited snapshots and lock files fail closed instead of using latest assets', t => {
  const fixture_ = fixture(t);
  assert.equal(fixture_.start('local-first').status, 0);
  const statePath = fixture_.state('local-first');
  const result = fixture_.run('harness.mjs', 'resolve', statePath);
  const snapshot = JSON.parse(result.stdout).root;
  writeFileSync(join(snapshot, 'skills/sdlc/SKILL.md'), 'tampered');
  assert.match(fixture_.run('state.mjs', 'next', statePath).stderr, /Modified harness snapshot/);
  const lock = join(fixture_.repo, 'docs/sdlc/local-first/harness.lock.json');
  writeFileSync(lock, readFileSync(lock, 'utf8') + '\n');
  assert.match(fixture_.run('harness.mjs', 'resolve', statePath).stderr, /hash mismatch/);
  assert.match(fixture_.run('state.mjs', 'invalidate', statePath, 'G0', 'reset').stderr, /hash mismatch/);
});

test('missing snapshots require exact restore and never silently repin', t => {
  const fixture_ = fixture(t);
  assert.equal(fixture_.start('local-first').status, 0);
  const statePath = fixture_.state('local-first');
  const original = fixture_.run('harness.mjs', 'resolve', statePath);
  rmSync(JSON.parse(original.stdout).root, { recursive: true });
  assert.match(fixture_.run('harness.mjs', 'resolve', statePath).stderr, /snapshot is missing/);
  assert.equal(fixture_.run('harness.mjs', 'restore', statePath, '--source', fixture_.source).status, 0);
  assert.deepEqual(JSON.parse(fixture_.run('harness.mjs', 'resolve', statePath).stdout), JSON.parse(original.stdout));
  rmSync(JSON.parse(original.stdout).root, { recursive: true });
  writeFileSync(join(fixture_.source, 'skills/sdlc/SKILL.md'), 'different revision');
  assert.match(fixture_.run('harness.mjs', 'restore', statePath, '--source', fixture_.source).stderr, /exact original snapshot/);
});

test('restores a committed revision from local Git history after the shared checkout advances', t => {
  const fixture_ = fixture(t);
  const git = (...args) => {
    const result = spawnSync('git', ['-C', fixture_.source, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '--quiet');
  git('add', '.');
  git('-c', 'user.name=Harness Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'First revision');
  assert.equal(fixture_.start('local-first').status, 0);
  const statePath = fixture_.state('local-first');
  const first = JSON.parse(fixture_.run('harness.mjs', 'resolve', statePath).stdout);
  assert.equal(first.commit, git('rev-parse', 'HEAD'));
  writeFileSync(join(fixture_.source, 'skills/sdlc/SKILL.md'), 'new skill');
  git('add', '.');
  git('-c', 'user.name=Harness Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'Next revision');
  const latest = git('rev-parse', 'HEAD');
  rmSync(first.root, { recursive: true });
  const restored = fixture_.run('harness.mjs', 'restore', statePath, '--source', fixture_.source);
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(JSON.parse(restored.stdout).contentSha256, first.contentSha256);
  assert.equal(git('rev-parse', 'HEAD'), latest);
});

test('explicit upgrades preserve prior state and lock while invalidating approvals', t => {
  const fixture_ = fixture(t);
  assert.equal(fixture_.start('local-first').status, 0);
  const statePath = fixture_.state('local-first');
  const prior = json(statePath);
  prior.gates.G0 = { status: 'passed', evidence: ['old evidence'] };
  prior.gates.G1 = { status: 'passed', approvedBy: 'person' };
  writeFileSync(statePath, JSON.stringify(prior));
  const lockPath = join(fixture_.repo, 'docs/sdlc/local-first/harness.lock.json');
  const oldLock = json(lockPath);
  writeFileSync(join(fixture_.source, 'skills/sdlc/SKILL.md'), 'new workflow');
  assert.match(fixture_.run('harness.mjs', 'upgrade', statePath).stderr, /--confirm/);
  assert.deepEqual(json(statePath), prior);
  const updated = fixture_.run('harness.mjs', 'upgrade', statePath, '--reason', 'Adopt improved workflow', '--confirm');
  assert.equal(updated.status, 0, updated.stderr);
  const current = json(statePath);
  assert.notEqual(json(lockPath).harness.contentSha256, oldLock.harness.contentSha256);
  assert.ok(Object.values(current.gates).every(gate => gate.status === 'pending'));
  assert.equal(current.phase, 'discover');
  const event = current.history.at(-1);
  assert.equal(event.event, 'harness-upgrade');
  const archived = json(join(fixture_.repo, 'docs/sdlc/local-first', event.archive.path));
  assert.deepEqual(archived.state, prior);
  assert.deepEqual(archived.lock, oldLock);
  assert.equal(fixture_.run('state.mjs', 'check', statePath).status, 0);
});

test('legacy adoption is explicit and finished runs are not rewritten', t => {
  const fixture_ = fixture(t);
  const directory = join(fixture_.repo, 'docs/sdlc/ABC-123');
  mkdirSync(directory, { recursive: true });
  const state = json(join(fixture_.source, 'templates/state.json'));
  writeFileSync(join(directory, 'state.json'), JSON.stringify(state));
  assert.match(fixture_.run('harness.mjs', 'resolve', join(directory, 'state.json')).stderr, /explicitly adopt/);
  const adopted = fixture_.run('harness.mjs', 'adopt', join(directory, 'state.json'), '--reason', 'Establish a baseline now, not historically', '--confirm');
  assert.equal(adopted.status, 0, adopted.stderr);
  assert.equal(json(join(directory, 'state.json')).history.at(-1).event, 'harness-adopt');
  const finished = json(join(directory, 'state.json'));
  finished.phase = 'done';
  writeFileSync(join(directory, 'state.json'), JSON.stringify(finished));
  assert.match(fixture_.run('harness.mjs', 'upgrade', join(directory, 'state.json'), '--reason', 'change', '--confirm').stderr, /Completed runs/);
});

test('unsafe IDs, linked run/cache paths and forged lock references are rejected', t => {
  const fixture_ = fixture(t);
  assert.match(fixture_.run('harness.mjs', 'start', '../ABC-123', fixture_.repo).stderr, /ticket key/);
  const external = join(fixture_.root, 'external');
  mkdirSync(external);
  symlinkSync(external, join(fixture_.repo, '.ai-native-sdlc-revisions'), 'dir');
  const linked = fixture_.start('local-first');
  assert.notEqual(linked.status, 0);
  assert.deepEqual(readdirSync(external), []);
  rmSync(join(fixture_.repo, '.ai-native-sdlc-revisions'), { recursive: true });
  assert.equal(fixture_.start('local-first').status, 0);
  const statePath = fixture_.state('local-first');
  const state = json(statePath);
  const lockPath = join(fixture_.repo, 'docs/sdlc/local-first/harness.lock.json');
  const lock = json(lockPath);
  lock.harness.contentSha256 = '../../outside';
  const body = JSON.stringify(lock);
  writeFileSync(lockPath, body);
  state.harness.sha256 = createHash('sha256').update(body).digest('hex');
  writeFileSync(statePath, JSON.stringify(state));
  assert.match(fixture_.run('harness.mjs', 'resolve', statePath).stderr, /Invalid harness lock/);
});

test('lock-aware entrypoints and all role profiles require the conductor revision', () => {
  const conductor = readFileSync(resolve('skills/sdlc/SKILL.md'), 'utf8');
  assert.match(conductor, /harness\.mjs.*resolve STATE/);
  assert.match(conductor, /sub task/);
  const handoff = readFileSync(resolve('templates/handoff.md'), 'utf8');
  assert.match(handoff, /Harness lock:/);
  assert.match(handoff, /Harness root:/);
  for (const name of readdirSync(resolve('agents')).filter(name => name.endsWith('.agent.md'))) {
    const role = readFileSync(resolve('agents', name), 'utf8');
    assert.match(role, /harness\.mjs resolve STATE/);
    assert.ok(role.includes(`agents/${name}`));
    assert.match(role, /Inherit the parent ticket lock/);
  }
});

test('current SessionStart reports pinned identity without executing the old checker or claiming validity', t => {
  const fixture_ = fixture(t);
  assert.equal(fixture_.start('local-first').status, 0);
  const statePath = fixture_.state('local-first');
  const state = json(statePath);
  state.phase = 'imaginary-old-schema-phase';
  writeFileSync(statePath, JSON.stringify(state));
  const hook = spawnSync(process.execPath, [join(fixture_.source, 'hooks/session.mjs'), 'codex'],
    { input: JSON.stringify({ cwd: fixture_.repo }), encoding: 'utf8' });
  assert.equal(hook.status, 0, hook.stderr);
  const context = JSON.parse(hook.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /recorded phase imaginary-old-schema-phase; harness [a-f0-9]{12}/);
  assert.match(context, /run the pinned state checker/);
  assert.notEqual(fixture_.run('state.mjs', 'check', statePath).status, 0);
});

test('revision updates roll back the lock if writing state fails', t => {
  const fixture_ = fixture(t);
  assert.equal(fixture_.start('local-first').status, 0);
  const statePath = fixture_.state('local-first');
  const originalState = readFileSync(statePath, 'utf8');
  const lockPath = join(fixture_.repo, 'docs/sdlc/local-first/harness.lock.json');
  const originalLock = readFileSync(lockPath, 'utf8');
  writeFileSync(join(fixture_.source, 'skills/sdlc/SKILL.md'), 'updated workflow');
  const injection = `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    const original = fs.renameSync;
    fs.renameSync = (source, target) => { if (String(source).includes('.harness-change-') && String(target).endsWith('state.json')) throw new Error('Simulated state write failure'); return original(source, target); };
    syncBuiltinESMExports();`;
  const failed = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(injection)}`,
    join(fixture_.source, 'scripts/harness.mjs'), 'upgrade', statePath, '--reason', 'New policy', '--confirm'], { encoding: 'utf8' });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Simulated state write failure/);
  assert.equal(readFileSync(statePath, 'utf8'), originalState);
  assert.equal(readFileSync(lockPath, 'utf8'), originalLock);
  assert.equal(existsSync(join(fixture_.repo, 'docs/sdlc/local-first/.harness-operation-lock')), false);
  assert.equal(fixture_.run('state.mjs', 'check', statePath).status, 0);
});

test('run locks block concurrent revision operations and linked state files cannot execute', t => {
  const fixture_ = fixture(t);
  assert.equal(fixture_.start('local-first').status, 0);
  const statePath = fixture_.state('local-first');
  const lockDirectory = join(fixture_.repo, 'docs/sdlc/local-first/.harness-operation-lock');
  mkdirSync(lockDirectory);
  assert.match(fixture_.run('harness.mjs', 'resolve', statePath).stderr, /operation in progress/);
  assert.match(fixture_.run('harness.mjs', 'upgrade', statePath, '--reason', 'change', '--confirm').stderr, /operation in progress/);
  assert.ok(existsSync(lockDirectory));
  rmSync(lockDirectory, { recursive: true });
  const actual = join(fixture_.root, 'external-state.json');
  writeFileSync(actual, readFileSync(statePath));
  rmSync(statePath);
  symlinkSync(actual, statePath, 'file');
  assert.match(fixture_.run('state.mjs', 'next', statePath).stderr, /cannot be a symlink/);
});

test('legacy copy installation can pin and resume without a Git checkout in its payload', { skip: process.platform === 'win32' }, t => {
  const fixture_ = fixture(t);
  const installed = spawnSync('bash', [resolve('install.sh'), fixture_.repo, fixture_.source], { encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr);
  const runtime = join(fixture_.repo, '.ai-native-sdlc/scripts');
  const start = spawnSync(process.execPath, [join(runtime, 'harness.mjs'), 'start', 'ABC-123', fixture_.repo], { encoding: 'utf8' });
  assert.equal(start.status, 0, start.stderr);
  const statePath = fixture_.state('ABC-123');
  const selected = spawnSync(process.execPath, [join(runtime, 'harness.mjs'), 'resolve', statePath], { encoding: 'utf8' });
  assert.equal(selected.status, 0, selected.stderr);
  assert.ok(JSON.parse(selected.stdout).root.startsWith(join(fixture_.repo, '.ai-native-sdlc-revisions')));
  assert.equal(existsSync(join(fixture_.repo, '.ai-native-sdlc/.git')), false);
  assert.match(readFileSync(join(fixture_.repo, '.codex/agents/sdlc-architect.toml'), 'utf8'), /authoritative conductor state path/);
});

const hasPowerShell = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']).status === 0;
test('PowerShell starts and resumes a locked run with Unicode, spaces and apostrophes', { skip: !hasPowerShell }, t => {
  const fixture_ = fixture(t);
  const repo = join(fixture_.root, "서비스's repo");
  mkdirSync(repo);
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const harness = quote(join(fixture_.source, 'scripts/harness.mjs'));
  const state = quote(join(repo, 'docs/sdlc/ABC-123/state.json'));
  const command = `
    & node ${harness} start ABC-123 ${quote(repo)}
    if ($LASTEXITCODE -ne 0) { throw 'Start failed' }
    $output = & node ${harness} resolve ${state}
    if ($LASTEXITCODE -ne 0) { throw 'Resolve failed' }
    $revision = $output | ConvertFrom-Json
    & node (Join-Path $revision.root 'scripts/state.mjs') next ${state}
    if ($LASTEXITCODE -ne 0) { throw 'Pinned state failed' }
    $revision.contentSha256
  `;
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /discover/);
  assert.match(result.stdout, /[a-f0-9]{64}/);
});
