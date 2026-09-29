import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {dirname, join, resolve} from 'node:path';
import {test} from 'node:test';

const source = resolve('.');
const shellInstaller = resolve('install.sh');
const shellInstall = (target, env = {}) => spawnSync('bash',[shellInstaller,target],
  {encoding:'utf8',env:{...process.env,...env}});
const install = target => spawnSync('bash',[shellInstaller,target,source],{encoding:'utf8'});
const fixture = t => {
  const target = mkdtempSync(join(tmpdir(),'sdlc-dual-'));
  t.after(() => rmSync(target,{recursive:true,force:true}));
  return target;
};

test('one command wires skills, native agents and both hook configurations', t => {
  const target = fixture(t);
  const installed = install(target);
  assert.equal(installed.status,0,installed.stderr);
  assert.equal(realpathSync(join(target,'.ai-native-sdlc')),realpathSync(source));
  for (const name of readdirSync(join(source,'skills'))) {
    assert.equal(realpathSync(join(target,'.agents/skills',name)),
      realpathSync(join(source,'skills',name)));
  }
  const agents = readdirSync(join(source,'agents')).filter(name => name.endsWith('.agent.md'));
  for (const name of agents) {
    assert.equal(realpathSync(join(target,'.github/agents',name)),
      realpathSync(join(source,'agents',name)));
    const toml = readFileSync(join(target,'.codex/agents',name.replace(/\.agent\.md$/,'.toml')),'utf8');
    assert.match(toml,/^name = ".+"$/m);
    assert.match(toml,/^description = ".+"$/m);
    assert.match(toml,/^developer_instructions = ".+"$/m);
  }
  const codex = JSON.parse(readFileSync(join(target,'.codex/hooks.json'),'utf8'));
  const copilot = JSON.parse(readFileSync(join(target,'.github/hooks/ai-native-sdlc.json'),'utf8'));
  assert.equal(codex.hooks.PreToolUse.length,1);
  assert.equal(copilot.hooks.preToolUse.length,1);
  for (const [command,payload,selector] of [
    [codex.hooks.PreToolUse[0].hooks[0].command,
      {tool_name:'Bash',tool_input:{command:'git push origin main'},cwd:target},
      output => output.hookSpecificOutput?.permissionDecision],
    [copilot.hooks.preToolUse[0].bash,
      {toolName:'bash',toolArgs:{command:'git push origin main'},cwd:target},
      output => output.permissionDecision]
  ]) {
    const result = spawnSync('bash',['-c',command],{input:JSON.stringify(payload),cwd:target,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(selector(JSON.parse(result.stdout)),'deny');
  }
  for (const command of [
    codex.hooks.SessionStart[0].hooks[0].command,
    copilot.hooks.sessionStart[0].bash
  ]) {
    const result = spawnSync('bash',['-c',command],{input:JSON.stringify({cwd:target}),cwd:target,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.ok(JSON.parse(result.stdout).additionalContext
      ?? JSON.parse(result.stdout).hookSpecificOutput?.additionalContext);
  }
});

test('rerun is idempotent and a user hook file blocks installation before writing', t => {
  const target = fixture(t);
  assert.equal(install(target).status,0);
  const link = readlinkSync(join(target,'.ai-native-sdlc'));
  assert.equal(install(target).status,0);
  assert.equal(readlinkSync(join(target,'.ai-native-sdlc')),link);

  const conflicting = fixture(t);
  mkdirSync(join(conflicting,'.codex'),{recursive:true});
  writeFileSync(join(conflicting,'.codex/hooks.json'),'{"user":true}');
  const failed = install(conflicting);
  assert.notEqual(failed.status,0);
  assert.match(failed.stderr,/Conflict/);
  assert.equal(readFileSync(join(conflicting,'.codex/hooks.json'),'utf8'),'{"user":true}');
  assert.equal(existsSync(join(conflicting,'.ai-native-sdlc')),false);
});

test('existing skills and dangling installation links fail without modifying user files', t => {
  const target = fixture(t);
  mkdirSync(join(target,'.agents/skills/sdlc'),{recursive:true});
  assert.notEqual(install(target).status,0);
  assert.equal(existsSync(join(target,'.ai-native-sdlc')),false);
  assert.ok(lstatSync(join(target,'.agents/skills/sdlc')).isDirectory());

  const broken = fixture(t);
  symlinkSync(join(broken,'missing'),join(broken,'.ai-native-sdlc'));
  const failed = install(broken);
  assert.notEqual(failed.status,0);
  assert.match(failed.stderr,/Conflict/);
  assert.ok(lstatSync(join(broken,'.ai-native-sdlc')).isSymbolicLink());
});

test('failed write rolls back newly created files and directories only', t => {
  const target = fixture(t);
  writeFileSync(join(target,'keep.txt'),'user');
  const tools = fixture(t);
  writeFileSync(join(tools,'cp'),'#!/bin/sh\nexit 43\n',{mode:0o755});
  const failed = shellInstall(target,{PATH:`${tools}:${process.env.PATH}`});
  assert.notEqual(failed.status,0);
  assert.equal(existsSync(join(target,'.ai-native-sdlc')),false);
  assert.equal(existsSync(join(target,'.codex')),false);
  assert.equal(readFileSync(join(target,'keep.txt'),'utf8'),'user');
});

test('local install.sh installs from its checked-out source', t => {
  const target = fixture(t);
  const tools = fixture(t);
  writeFileSync(join(tools,'node'),'#!/bin/sh\nexit 63\n',{mode:0o755});
  const result = shellInstall(target,{PATH:`${tools}:${process.env.PATH}`});
  assert.equal(result.status,0,result.stderr);
  assert.equal(realpathSync(join(target,'.ai-native-sdlc')),realpathSync(source));
  assert.equal(shellInstall(target).status,0);
  assert.equal(readdirSync(join(target,'.agents/skills')).length,
    readdirSync(join(source,'skills')).length);
});

test('hook commands remain valid for quoted and non-ASCII target paths', t => {
  const parent = fixture(t);
  const target = join(parent,"project's 한글");
  mkdirSync(target);
  const result = shellInstall(target);
  assert.equal(result.status,0,result.stderr);
  const config = JSON.parse(readFileSync(join(target,'.codex/hooks.json'),'utf8'));
  const command = config.hooks.PreToolUse[0].hooks[0].command;
  const blocked = spawnSync('bash',['-c',command],{cwd:target,encoding:'utf8',
    input:JSON.stringify({tool_name:'Bash',tool_input:{command:'git push origin main'},cwd:target})});
  assert.equal(blocked.status,0,blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision,'deny');
});

test('HTTP curl-downloaded install.sh bootstraps a reusable checkout without modifying target on clone failure', async t => {
  const target = fixture(t);
  const cache = fixture(t);
  const download = fixture(t);
  const script = join(download,'install.sh');
  const server = createServer((request,response) => {
    if (request.url !== '/install.sh') { response.writeHead(404).end(); return; }
    response.writeHead(200,{'content-type':'text/plain'}).end(readFileSync(shellInstaller));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => server.close());
  const fetched = await new Promise((resolve,reject) => {
    const child = spawn('curl',['-fsSLo',script,`http://127.0.0.1:${server.address().port}/install.sh`]);
    child.on('error',reject);
    child.on('close',resolve);
  });
  assert.equal(fetched,0);
  const repository = resolve(dirname(source), '..');
  const tools = fixture(t);
  writeFileSync(join(tools,'node'),'#!/bin/sh\nexit 63\n',{mode:0o755});
  const wrong = spawnSync('bash',[script,target],{encoding:'utf8',env:{
    ...process.env,AI_NATIVE_SDLC_CACHE_DIR:cache,AI_NATIVE_SDLC_REPO_URL:'file:///no-such-repository'
  }});
  assert.notEqual(wrong.status,0);
  assert.equal(existsSync(join(target,'.ai-native-sdlc')),false);
  const installed = spawnSync('bash',[script,target],{encoding:'utf8',env:{
    ...process.env,PATH:`${tools}:${process.env.PATH}`,
    AI_NATIVE_SDLC_CACHE_DIR:cache,AI_NATIVE_SDLC_REPO_URL:`file://${repository}`
  }});
  assert.equal(installed.status,0,installed.stderr);
  assert.equal(realpathSync(join(target,'.ai-native-sdlc')),
    realpathSync(join(cache,'main')));
  assert.equal(spawnSync('bash',[script,target],{encoding:'utf8',env:{
    ...process.env,AI_NATIVE_SDLC_CACHE_DIR:cache,AI_NATIVE_SDLC_REPO_URL:`file://${repository}`
  }}).status,0);
});
