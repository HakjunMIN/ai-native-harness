import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  readlinkSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

const source = resolve('.');
const installer = join(source, 'scripts/install-shared.mjs');
const git = (cwd, ...arguments_) => {
  const result = spawnSync('git', ['-C', cwd, ...arguments_], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const commit = remote => {
  git(remote, 'add', '.');
  git(remote, '-c', 'user.name=Installer Test', '-c', 'user.email=installer@example.invalid',
    'commit', '--quiet', '-m', 'Test harness');
};
const fixture = t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'shared-installer-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, 'remote');
  mkdirSync(remote);
  for (const directory of ['skills', 'agents', 'hooks', 'scripts', 'templates', 'docs']) {
    cpSync(join(source, directory), join(remote, directory), { recursive: true });
  }
  git(remote, 'init', '--quiet', '--initial-branch=main');
  commit(remote);
  const parent = join(root, 'MSA space 한글');
  mkdirSync(parent);
  const targets = ['api', 'web', 'worker'].map(name => join(parent, name));
  for (const target of targets) mkdirSync(target);
  return { root, remote, parent, targets, shared: join(parent, 'ai-native-harness') };
};
const install = (fixture_, targets = fixture_.targets, extra = [], nodeOptions = []) =>
  spawnSync(process.execPath, [...nodeOptions, installer, ...targets, '--repo-url', fixture_.remote, ...extra], { encoding: 'utf8' });

test('shared installation clones once and links three sibling repositories', t => {
  const fixture_ = fixture(t);
  const result = install(fixture_);
  assert.equal(result.status, 0, result.stderr);
  for (const target of fixture_.targets) {
    assert.ok(lstatSync(join(target, '.ai-native-sdlc')).isSymbolicLink());
    assert.equal(realpathSync(join(target, '.ai-native-sdlc')), fixture_.shared);
    assert.equal(realpathSync(join(target, 'AGENTS.md')), join(fixture_.shared, 'templates/project-AGENTS.md'));
    for (const name of readdirSync(join(fixture_.shared, 'skills'))) {
      assert.equal(realpathSync(join(target, '.agents/skills', name)), join(fixture_.shared, 'skills', name));
    }
    for (const name of readdirSync(join(fixture_.shared, 'agents'))) {
      assert.equal(realpathSync(join(target, '.github/agents', name)), join(fixture_.shared, 'agents', name));
      const native = readFileSync(join(target, '.codex/agents', name.replace('.agent.md', '.toml')), 'utf8');
      assert.ok(native.includes(join(target, '.ai-native-sdlc/agents', name).replaceAll('\\', '/')));
    }
  }
  assert.equal(git(fixture_.shared, 'status', '--porcelain'), '');
  assert.equal(existsSync(join(fixture_.parent, '.ai-native-harness.shared-install-lock')), false);
});

test('rerun pulls fast-forward updates; other repositories see shared changes immediately', t => {
  const fixture_ = fixture(t);
  assert.equal(install(fixture_).status, 0);
  const template = join(fixture_.remote, 'templates/project-AGENTS.md');
  writeFileSync(template, readFileSync(template, 'utf8') + '\nUpdated shared policy\n');
  commit(fixture_.remote);
  const result = install(fixture_, [fixture_.targets[0]]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Updated shared harness/);
  for (const target of fixture_.targets) assert.match(readFileSync(join(target, 'AGENTS.md'), 'utf8'), /Updated shared policy/);
  assert.equal(git(fixture_.shared, 'rev-parse', 'HEAD'), git(fixture_.remote, 'rev-parse', 'HEAD'));
});

test('localizing project guidance preserves the shared template, siblings and reinstall ownership', testContext => {
  const fixture_ = fixture(testContext);
  assert.equal(install(fixture_).status,0);
  const target = fixture_.targets[0];
  const guidance = join(target,'AGENTS.md');
  const template = join(fixture_.shared,'templates/project-AGENTS.md');
  const original = readFileSync(guidance);
  const manifestPath = join(target,'.ai-native-sdlc.links.json');
  const manifest = JSON.parse(readFileSync(manifestPath));
  assert.equal(manifest.entries.find(entry => entry.path === 'AGENTS.md').kind,'link');
  const retained = manifest.entries.filter(entry => entry.path !== 'AGENTS.md');
  unlinkSync(guidance);
  writeFileSync(guidance,original,{flag:'wx'});
  writeFileSync(manifestPath,JSON.stringify({...manifest,entries:retained},null,2)+'\n');
  const local = original.toString()+'\nProject-specific standards: docs/team/standards.md\n';
  writeFileSync(guidance,local);
  assert.deepEqual(readFileSync(template),original);
  for (const sibling of fixture_.targets.slice(1)) assert.deepEqual(readFileSync(join(sibling,'AGENTS.md')),original);
  const updated = install(fixture_,[target]);
  assert.equal(updated.status,0,updated.stderr);
  assert.equal(lstatSync(guidance).isSymbolicLink(),false);
  assert.equal(readFileSync(guidance,'utf8'),local);
  assert.deepEqual(JSON.parse(readFileSync(manifestPath)).entries,retained);
  assert.equal(git(fixture_.shared,'status','--porcelain'),'');
});

test('existing project instructions are preserved and conflicts preflight the entire batch', t => {
  const fixture_ = fixture(t);
  writeFileSync(join(fixture_.targets[0], 'AGENTS.md'), 'project-specific policy');
  mkdirSync(join(fixture_.targets[1], '.codex'));
  writeFileSync(join(fixture_.targets[1], '.codex/hooks.json'), 'user hooks');
  const failed = install(fixture_);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Conflict/);
  for (const target of fixture_.targets) assert.equal(existsSync(join(target, '.ai-native-sdlc')), false);
  rmSync(join(fixture_.targets[1], '.codex/hooks.json'));
  const result = install(fixture_);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Existing AGENTS.md preserved/);
  assert.equal(readFileSync(join(fixture_.targets[0], 'AGENTS.md'), 'utf8'), 'project-specific policy');
});

test('modified managed configuration or link blocks reinstall without overwriting', t => {
  const fixture_ = fixture(t);
  assert.equal(install(fixture_).status, 0);
  const hook = join(fixture_.targets[0], '.codex/hooks.json');
  const original = readFileSync(hook, 'utf8');
  writeFileSync(hook, 'modified hooks');
  const failed = install(fixture_);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Modified managed entry/);
  assert.equal(readFileSync(hook, 'utf8'), 'modified hooks');
  assert.equal(realpathSync(join(fixture_.targets[2], '.ai-native-sdlc')), fixture_.shared);
  writeFileSync(hook, original);
  const link = join(fixture_.targets[0], '.agents/skills/sdlc');
  unlinkSync(link);
  symlinkSync('../../.ai-native-sdlc/skills/tdd', link, 'dir');
  assert.match(install(fixture_).stderr, /Modified managed entry/);
  assert.equal(readlinkSync(link).replaceAll('\\', '/'), '../../.ai-native-sdlc/skills/tdd');
});

test('dirty shared clone and mismatched origins are never overwritten', t => {
  const fixture_ = fixture(t);
  assert.equal(install(fixture_).status, 0);
  writeFileSync(join(fixture_.shared, 'local-change'), 'do not remove');
  assert.match(install(fixture_).stderr, /local changes/);
  rmSync(join(fixture_.shared, 'local-change'));
  git(fixture_.shared, 'remote', 'set-url', 'origin', join(fixture_.root, 'wrong-remote'));
  assert.match(install(fixture_).stderr, /origin does not match/);
});

test('non-sibling targets, copy installations and symlinked configuration parents are rejected', t => {
  const fixture_ = fixture(t);
  const nested = join(fixture_.targets[0], 'nested');
  mkdirSync(nested);
  assert.match(install(fixture_, [nested, fixture_.targets[1]]).stderr, /sibling/);
  mkdirSync(join(fixture_.targets[0], '.ai-native-sdlc'));
  assert.match(install(fixture_).stderr, /copy installations are not migrated/);
  rmSync(join(fixture_.targets[0], '.ai-native-sdlc'), { recursive: true });
  const external = join(fixture_.root, 'external');
  mkdirSync(external);
  symlinkSync(external, join(fixture_.targets[0], '.codex'), 'dir');
  assert.match(install(fixture_).stderr, /Conflict at parent/);
  assert.deepEqual(readdirSync(external), []);
});

test('custom sibling clone location and branch are supported', t => {
  const fixture_ = fixture(t);
  git(fixture_.remote, 'checkout', '--quiet', '-b', 'stable');
  const shared = join(fixture_.parent, 'shared-harness');
  const result = install(fixture_, fixture_.targets, ['--shared-dir', shared, '--ref', 'stable']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readlinkSync(join(fixture_.targets[0], '.ai-native-sdlc')).replaceAll('\\', '/'), '../shared-harness');
  assert.match(install(fixture_, fixture_.targets, ['--shared-dir', shared]).stderr, /must be on branch main/);
});

test('generated hooks execute Node directly, including spaces, Unicode and apostrophes', { skip: process.platform === 'win32' }, t => {
  const fixture_ = fixture(t);
  const target = join(fixture_.parent, "service's API");
  mkdirSync(target);
  const result = install(fixture_, [target]);
  assert.equal(result.status, 0, result.stderr);
  const copilot = JSON.parse(readFileSync(join(target, '.github/hooks/ai-native-sdlc.json')));
  assert.match(copilot.hooks.sessionStart[0].powershell, /service''s API/);
  const codex = JSON.parse(readFileSync(join(target, '.codex/hooks.json')));
  for (const [host, start, guard] of [
    ['copilot', copilot.hooks.sessionStart[0].bash, copilot.hooks.preToolUse[0].bash],
    ['codex', codex.hooks.SessionStart[0].hooks[0].command, codex.hooks.PreToolUse[0].hooks[0].command]
  ]) {
    const session = spawnSync('bash', ['-c', start], { cwd: dirname(target), encoding: 'utf8', input: JSON.stringify({ cwd: target }) });
    assert.equal(session.status, 0, session.stderr);
    assert.match(session.stdout, /sdlc-setup/);
    const blocked = spawnSync('bash', ['-c', guard], { cwd: target, encoding: 'utf8',
      input: JSON.stringify({ cwd: target, toolName: 'bash', toolArgs: { command: 'git push' } }) });
    assert.equal(blocked.status, 0, blocked.stderr);
    const output = JSON.parse(blocked.stdout);
    assert.equal(host === 'codex' ? output.hookSpecificOutput.permissionDecision : output.permissionDecision, 'deny');
  }
});

test('a link creation failure rolls back all target writes and restores the old installation', t => {
  const fixture_ = fixture(t);
  assert.equal(install(fixture_, [fixture_.targets[0]]).status, 0);
  const original = readFileSync(join(fixture_.targets[0], '.ai-native-sdlc.links.json'), 'utf8');
  const injection = `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
    const original = fs.symlinkSync; let count = 0;
    fs.symlinkSync = (...args) => { if (++count === 45) throw new Error('Simulated symlink failure'); return original(...args); };
    syncBuiltinESMExports();`;
  const failed = install(fixture_, fixture_.targets, [], ['--import', `data:text/javascript,${encodeURIComponent(injection)}`]);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Simulated symlink failure/);
  assert.equal(readFileSync(join(fixture_.targets[0], '.ai-native-sdlc.links.json'), 'utf8'), original);
  assert.equal(realpathSync(join(fixture_.targets[0], '.ai-native-sdlc')), fixture_.shared);
  for (const target of fixture_.targets.slice(1)) {
    assert.equal(existsSync(join(target, '.ai-native-sdlc')), false, failed.stderr);
    assert.deepEqual(readdirSync(target), [], failed.stderr);
  }
});

test('manifest paths cannot escape the target and stale locks are respected', t => {
  const fixture_ = fixture(t);
  mkdirSync(join(fixture_.targets[0], '.ai-native-sdlc.install-lock'));
  assert.match(install(fixture_).stderr, /lock exists/);
  assert.ok(existsSync(join(fixture_.targets[0], '.ai-native-sdlc.install-lock')));
  rmSync(join(fixture_.targets[0], '.ai-native-sdlc.install-lock'), { recursive: true });
  assert.equal(install(fixture_).status, 0);
  const manifest = join(fixture_.targets[0], '.ai-native-sdlc.links.json');
  writeFileSync(manifest, JSON.stringify({ version: 1, entries: [{ path: '../outside', kind: 'file', hash: 'a'.repeat(64) }] }));
  assert.match(install(fixture_).stderr, /Invalid manifest/);
});

test('Bash entrypoint forwards multiple target arguments', { skip: process.platform === 'win32' }, t => {
  const fixture_ = fixture(t);
  const result = spawnSync('bash', [join(source, 'install-shared.sh'), ...fixture_.targets,
    '--repo-url', fixture_.remote], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(fixture_.targets[2], '.ai-native-sdlc.links.json')));
});

const run = (executable, arguments_, input, env) => new Promise((resolve_, reject) => {
  const child = spawn(executable, arguments_, { env: { ...process.env, ...env } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', status => resolve_({ status, stdout, stderr }));
  child.stdin.end(input);
});
const bootstrapServer = async t => {
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    response.end(readFileSync(installer));
  });
  await new Promise(resolve_ => server.listen(0, '127.0.0.1', resolve_));
  t.after(() => new Promise(resolve_ => server.close(resolve_)));
  return { url: `http://127.0.0.1:${server.address().port}/install-shared.mjs`, requests: () => requests };
};

test('streamed Bash entrypoint bootstraps without a local harness checkout', { skip: process.platform === 'win32' }, async t => {
  const fixture_ = fixture(t);
  const server = await bootstrapServer(t);
  const result = await run('bash', ['-s', '--', ...fixture_.targets, '--repo-url', fixture_.remote],
    readFileSync(join(source, 'install-shared.sh')), { AI_NATIVE_SDLC_INSTALLER_URL: server.url });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(server.requests(), 1);
  assert.ok(existsSync(join(fixture_.targets[0], 'AGENTS.md')));
});

const hasPowerShell = !spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']).error;
test('PowerShell entrypoint forwards paths and propagates errors', { skip: !hasPowerShell }, t => {
  const fixture_ = fixture(t);
  const quotedTarget = join(fixture_.parent, "service's API");
  mkdirSync(quotedTarget);
  fixture_.targets.push(quotedTarget);
  const result = spawnSync('pwsh', ['-NoProfile', '-File', join(source, 'install-shared.ps1'),
    ...fixture_.targets, '--repo-url', fixture_.remote], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const failure = spawnSync('pwsh', ['-NoProfile', '-File', join(source, 'install-shared.ps1'),
    join(fixture_.root, 'missing')], { encoding: 'utf8' });
  assert.notEqual(failure.status, 0);
  const hooks = JSON.parse(readFileSync(join(quotedTarget, '.github/hooks/ai-native-sdlc.json')));
  const hook = spawnSync('pwsh', ['-NoProfile', '-Command', hooks.hooks.sessionStart[0].powershell],
    { input: JSON.stringify({ cwd: quotedTarget }), encoding: 'utf8' });
  assert.equal(hook.status, 0, hook.stderr);
  assert.match(hook.stdout, /sdlc-setup/);
  const guard = spawnSync('pwsh', ['-NoProfile', '-Command', hooks.hooks.preToolUse[0].powershell],
    { input: JSON.stringify({ cwd: quotedTarget, toolName: 'bash', toolArgs: { command: 'git push' } }), encoding: 'utf8' });
  assert.equal(guard.status, 0, guard.stderr);
  assert.equal(JSON.parse(guard.stdout).permissionDecision, 'deny');
});

test('streamed PowerShell entrypoint bootstraps without a local harness checkout', { skip: !hasPowerShell }, async t => {
  const fixture_ = fixture(t);
  const server = await bootstrapServer(t);
  const encoded = readFileSync(join(source, 'install-shared.ps1')).toString('base64');
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const command = `& ([scriptblock]::Create([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encoded}')))) ` +
    [...fixture_.targets, '--repo-url', fixture_.remote].map(quote).join(' ');
  const result = await run('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], undefined,
    { AI_NATIVE_SDLC_INSTALLER_URL: server.url });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(server.requests(), 1);
  assert.ok(existsSync(join(fixture_.targets[0], 'AGENTS.md')));
});
