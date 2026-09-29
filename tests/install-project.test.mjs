import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {join, resolve} from 'node:path';
import {test} from 'node:test';

const source = resolve('.');
const shellInstaller = resolve('install.sh');
const shellInstall = (target, env = {}) => spawnSync('bash',[shellInstaller,target],
  {encoding:'utf8',env:{...process.env,...env}});
const install = target => spawnSync('bash',[shellInstaller,target,source],{encoding:'utf8'});
const fixture = t => {
  const target = mkdtempSync(join(source,'.installer-test-'));
  t.after(() => rmSync(target,{recursive:true,force:true}));
  return target;
};
const bootstrappableRepository = t => {
  const repository = join(fixture(t),'source');
  const clone = spawnSync('git',['clone','--quiet',source,repository],{encoding:'utf8'});
  assert.equal(clone.status,0,clone.stderr);
  writeFileSync(join(repository,'templates/project-AGENTS.md'),
    readFileSync(join(source,'templates/project-AGENTS.md')));
  const add = spawnSync('git',['-C',repository,'add','templates/project-AGENTS.md'],{encoding:'utf8'});
  assert.equal(add.status,0,add.stderr);
  const commit = spawnSync('git',['-C',repository,'-c','user.name=Installer Test',
    '-c','user.email=installer-test@example.invalid','commit','--quiet','-m','Add project instructions'],
  {encoding:'utf8'});
  assert.equal(commit.status,0,commit.stderr);
  const branch = spawnSync('git',['-C',repository,'branch','-M','main'],{encoding:'utf8'});
  assert.equal(branch.status,0,branch.stderr);
  return repository;
};

test('one command wires skills, native agents and both hook configurations', t => {
  const target = fixture(t);
  const installed = install(target);
  assert.equal(installed.status,0,installed.stderr);
  assert.ok(lstatSync(join(target,'.ai-native-sdlc')).isDirectory());
  assert.notEqual(realpathSync(join(target,'.ai-native-sdlc')),realpathSync(source));
  const guidance = readFileSync(join(target,'AGENTS.md'),'utf8');
  assert.equal(guidance,readFileSync(join(source,'templates/project-AGENTS.md'),'utf8'));
  assert.notEqual(guidance,readFileSync(join(source,'AGENTS.md'),'utf8'));
  assert.match(guidance,/\.agents\/skills\//);
  assert.match(guidance,/sdlc-setup/);
  for (const name of readdirSync(join(source,'skills'))) {
    assert.equal(realpathSync(join(target,'.agents/skills',name)),
      realpathSync(join(target,'.ai-native-sdlc/skills',name)));
  }
  const agents = readdirSync(join(source,'agents')).filter(name => name.endsWith('.agent.md'));
  for (const name of agents) {
    assert.equal(realpathSync(join(target,'.github/agents',name)),
      realpathSync(join(target,'.ai-native-sdlc/agents',name)));
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
  const unchanged = install(target);
  assert.equal(unchanged.status,0);
  assert.equal(unchanged.stderr,'');
  writeFileSync(join(target,'AGENTS.md'),'customized instructions');
  const revision = readFileSync(join(target,'.ai-native-sdlc/.install-revision'),'utf8');
  const rerun = install(target);
  assert.equal(rerun.status,0);
  assert.match(rerun.stderr,/Existing AGENTS\.md preserved/);
  assert.equal(readFileSync(join(target,'.ai-native-sdlc/.install-revision'),'utf8'),revision);
  assert.equal(readFileSync(join(target,'AGENTS.md'),'utf8'),'customized instructions');

  const conflicting = fixture(t);
  writeFileSync(join(conflicting,'AGENTS.md'),'existing project policy');
  mkdirSync(join(conflicting,'.codex'),{recursive:true});
  writeFileSync(join(conflicting,'.codex/hooks.json'),'{"user":true}');
  const failed = install(conflicting);
  assert.notEqual(failed.status,0);
  assert.match(failed.stderr,/Conflict|Legacy/);
  assert.equal(readFileSync(join(conflicting,'.codex/hooks.json'),'utf8'),'{"user":true}');
  assert.equal(readFileSync(join(conflicting,'AGENTS.md'),'utf8'),'existing project policy');
  assert.equal(existsSync(join(conflicting,'.ai-native-sdlc')),false);
});

test('pre-existing project AGENTS.md is preserved with integration guidance', t => {
  const target = fixture(t);
  writeFileSync(join(target,'AGENTS.md'),'project policy');
  const result = install(target);
  assert.equal(result.status,0,result.stderr);
  assert.equal(readFileSync(join(target,'AGENTS.md'),'utf8'),'project policy');
  assert.match(result.stderr,/Existing AGENTS\.md preserved/);
  assert.ok(existsSync(join(target,'.agents/skills/sdlc/SKILL.md')));
});

test('invalid AGENTS.md destination blocks installation', t => {
  const target = fixture(t);
  mkdirSync(join(target,'AGENTS.md'));
  const result = install(target);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Conflict at existing path: .*AGENTS\.md/);
  assert.equal(existsSync(join(target,'.ai-native-sdlc')),false);
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
  assert.match(failed.stderr,/Conflict|Legacy/);
  assert.ok(lstatSync(join(broken,'.ai-native-sdlc')).isSymbolicLink());
});

test('legacy shared-cache link is rejected without migration or changes', t => {
  const target = fixture(t);
  const cache = fixture(t);
  symlinkSync(cache,join(target,'.ai-native-sdlc'));
  const failed = install(target);
  assert.notEqual(failed.status,0);
  assert.match(failed.stderr,/legacy|link|migrat/i);
  assert.equal(readlinkSync(join(target,'.ai-native-sdlc')),cache);
  assert.equal(existsSync(join(target,'.agents')),false);
});

test('local source revision updates managed files and preserves edited AGENTS.md', t => {
  const target = fixture(t);
  const upstream = fixture(t);
  for (const name of ['skills','agents','hooks','scripts','templates']) {
    const copied = spawnSync('cp',['-R',join(source,name),upstream],{encoding:'utf8'});
    assert.equal(copied.status,0,copied.stderr);
  }
  const run = () => spawnSync('bash',[shellInstaller,target,upstream],{encoding:'utf8'});
  assert.equal(run().status,0);
  writeFileSync(join(target,'AGENTS.md'),'user policy');
  const prior = readFileSync(join(target,'.ai-native-sdlc/.install-revision'),'utf8');
  const file = join(upstream,'hooks/guard.mjs');
  writeFileSync(file,readFileSync(file,'utf8')+'\n// next revision\n');
  const updated = run();
  assert.equal(updated.status,0,updated.stderr);
  assert.match(readFileSync(join(target,'.ai-native-sdlc/hooks/guard.mjs'),'utf8'),/next revision/);
  assert.notEqual(readFileSync(join(target,'.ai-native-sdlc/.install-revision'),'utf8'),prior);
  assert.equal(readFileSync(join(target,'AGENTS.md'),'utf8'),'user policy');
});

test('rerun prunes retired skills and agents, deploys replacements, and restores old links on failed replacement', t => {
  const target = fixture(t);
  const upstream = fixture(t);
  for (const name of ['skills','agents','hooks','scripts','templates']) {
    const copied = spawnSync('cp',['-R',join(source,name),upstream],{encoding:'utf8'});
    assert.equal(copied.status,0,copied.stderr);
  }
  const run = env => spawnSync('bash',[shellInstaller,target,upstream],
    {encoding:'utf8',env:{...process.env,...env}});
  const first = run();
  assert.equal(first.status,0,first.stderr);
  const retiredSkill = 'grilling';
  const retiredAgent = 'sdlc-test-writer';
  assert.ok(existsSync(join(target,'.agents/skills',retiredSkill,'SKILL.md')));
  assert.ok(existsSync(join(target,'.github/agents',`${retiredAgent}.agent.md`)));
  assert.ok(existsSync(join(target,'.codex/agents',`${retiredAgent}.toml`)));
  mkdirSync(join(target,'.agents/skills/user-owned'),{recursive:true});
  writeFileSync(join(target,'.agents/skills/user-owned/SKILL.md'),'user skill');
  writeFileSync(join(target,'.github/agents/user-owned.agent.md'),'user agent');
  writeFileSync(join(target,'.codex/agents/user-owned.toml'),'user config');
  writeFileSync(join(target,'AGENTS.md'),'user policy');
  const before = readFileSync(join(target,'.ai-native-sdlc/.install-manifest'),'utf8');

  rmSync(join(upstream,'skills',retiredSkill),{recursive:true});
  rmSync(join(upstream,'agents',`${retiredAgent}.agent.md`));
  mkdirSync(join(upstream,'skills/installer-new'));
  writeFileSync(join(upstream,'skills/installer-new/SKILL.md'),
    '---\nname: installer-new\ndescription: Replacement skill\n---\n\n# Installer New\n');
  writeFileSync(join(upstream,'agents/installer-new.agent.md'),
    '---\nname: Installer New\ndescription: Replacement agent\n---\n\n# Installer New\n');

  const tools = fixture(t);
  writeFileSync(join(tools,'cp'),`#!/bin/sh
case "$2" in */.codex/hooks.json) exit 43 ;; esac
exec /bin/cp "$@"
`,{mode:0o755});
  const failed = run({PATH:`${tools}:${process.env.PATH}`});
  assert.notEqual(failed.status,0);
  assert.equal(readFileSync(join(target,'.ai-native-sdlc/.install-manifest'),'utf8'),before);
  assert.ok(existsSync(join(target,'.agents/skills',retiredSkill,'SKILL.md')));
  assert.ok(existsSync(join(target,'.github/agents',`${retiredAgent}.agent.md`)));
  assert.ok(existsSync(join(target,'.codex/agents',`${retiredAgent}.toml`)));
  assert.equal(existsSync(join(target,'.agents/skills/installer-new')),false);
  assert.equal(existsSync(join(target,'.github/agents/installer-new.agent.md')),false);
  assert.equal(existsSync(join(target,'.codex/agents/installer-new.toml')),false);
  assert.equal(readdirSync(target).filter(name => name.startsWith('.ai-native-sdlc.stage.')).length,0);

  const updated = run();
  assert.equal(updated.status,0,updated.stderr);
  for (const retired of [
    `.agents/skills/${retiredSkill}`,
    `.github/agents/${retiredAgent}.agent.md`,
    `.codex/agents/${retiredAgent}.toml`,
    `.ai-native-sdlc/skills/${retiredSkill}`,
    `.ai-native-sdlc/agents/${retiredAgent}.agent.md`
  ]) assert.equal(existsSync(join(target,retired)),false,retired);
  assert.equal(realpathSync(join(target,'.agents/skills/installer-new')),
    realpathSync(join(target,'.ai-native-sdlc/skills/installer-new')));
  assert.equal(realpathSync(join(target,'.github/agents/installer-new.agent.md')),
    realpathSync(join(target,'.ai-native-sdlc/agents/installer-new.agent.md')));
  const profile = join(target,'.ai-native-sdlc/agents/installer-new.agent.md');
  const toml = readFileSync(join(target,'.codex/agents/installer-new.toml'),'utf8');
  assert.match(toml,/^name = "Installer New"$/m);
  assert.ok(toml.includes(profile));
  assert.ok(existsSync(profile));
  for (const [configuration,command,payload,decision] of [
    [join(target,'.codex/hooks.json'),config => config.hooks.PreToolUse[0].hooks[0].command,
      {tool_name:'Bash',tool_input:{command:'git push origin main'},cwd:target},
      result => result.hookSpecificOutput?.permissionDecision],
    [join(target,'.github/hooks/ai-native-sdlc.json'),config => config.hooks.preToolUse[0].bash,
      {toolName:'bash',toolArgs:{command:'git push origin main'},cwd:target},
      result => result.permissionDecision]
  ]) {
    const hook = command(JSON.parse(readFileSync(configuration,'utf8')));
    assert.ok(hook.includes(join(target,'.ai-native-sdlc/hooks/gate-guard.sh')));
    const blocked = spawnSync('bash',['-c',hook],{cwd:target,encoding:'utf8',
      input:JSON.stringify(payload)});
    assert.equal(blocked.status,0,blocked.stderr);
    assert.equal(decision(JSON.parse(blocked.stdout)),'deny');
  }
  assert.equal(readFileSync(join(target,'.agents/skills/user-owned/SKILL.md'),'utf8'),'user skill');
  assert.equal(readFileSync(join(target,'.github/agents/user-owned.agent.md'),'utf8'),'user agent');
  assert.equal(readFileSync(join(target,'.codex/agents/user-owned.toml'),'utf8'),'user config');
  assert.equal(readFileSync(join(target,'AGENTS.md'),'utf8'),'user policy');
});

test('tampered managed files and unmanaged payload additions block updates', t => {
  const target = fixture(t);
  assert.equal(install(target).status,0);
  const file = join(target,'.ai-native-sdlc/hooks/guard.mjs');
  writeFileSync(file,'user override');
  const result = install(target);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/modified|Conflict/i);
  assert.equal(readFileSync(file,'utf8'),'user override');
  writeFileSync(file,readFileSync(join(source,'hooks/guard.mjs')));
  writeFileSync(join(target,'.ai-native-sdlc/extra.txt'),'user data');
  assert.notEqual(install(target).status,0);
  assert.equal(readFileSync(join(target,'.ai-native-sdlc/extra.txt'),'utf8'),'user data');
});

test('permissions, generated config changes and symlinked source assets are rejected', t => {
  const target = fixture(t);
  assert.equal(install(target).status,0);
  const script = join(target,'.ai-native-sdlc/hooks/gate-guard.sh');
  const originalMode = lstatSync(script).mode & 0o777;
  chmodSync(script,0o600);
  const denied = install(target);
  assert.notEqual(denied.status,0);
  assert.match(denied.stderr,/permissions/i);
  chmodSync(script,originalMode);
  const config = join(target,'.codex/hooks.json');
  writeFileSync(config,'user hooks');
  const alteredConfig = install(target);
  assert.notEqual(alteredConfig.status,0);
  assert.match(alteredConfig.stderr,/Modified managed file: .*hooks\.json/);
  assert.equal(readFileSync(config,'utf8'),'user hooks');

  const upstream = fixture(t);
  for (const name of ['skills','agents','hooks','scripts','templates']) {
    assert.equal(spawnSync('cp',['-R',join(source,name),upstream]).status,0);
  }
  rmSync(join(upstream,'hooks/guard.mjs'));
  symlinkSync(join(source,'hooks/guard.mjs'),join(upstream,'hooks/guard.mjs'));
  const empty = fixture(t);
  const rejected = spawnSync('bash',[shellInstaller,empty,upstream],{encoding:'utf8'});
  assert.notEqual(rejected.status,0);
  assert.match(rejected.stderr,/Unsupported asset type/);
  assert.equal(existsSync(join(empty,'.ai-native-sdlc')),false);
});

test('world-writable target is rejected without creating managed files', t => {
  const target = fixture(t);
  chmodSync(target,0o777);
  const rejected = install(target);
  assert.notEqual(rejected.status,0);
  assert.match(rejected.stderr,/world-writable target/);
  assert.equal(readdirSync(target).length,0);
});

test('failed replacement restores previous managed files and user files', t => {
  const target = fixture(t);
  assert.equal(install(target).status,0);
  const old = readFileSync(join(target,'.ai-native-sdlc/.install-manifest'),'utf8');
  const tools = fixture(t);
  writeFileSync(join(tools,'cp'),`#!/bin/sh
case "$2" in */.codex/hooks.json) exit 43 ;; esac
exec /bin/cp "$@"
`,{mode:0o755});
  const result = shellInstall(target,{PATH:`${tools}:${process.env.PATH}`});
  assert.notEqual(result.status,0);
  assert.equal(readFileSync(join(target,'.ai-native-sdlc/.install-manifest'),'utf8'),old);
  assert.ok(existsSync(join(target,'.agents/skills/sdlc/SKILL.md')));
  assert.ok(existsSync(join(target,'.codex/hooks.json')));
  assert.equal(readdirSync(target).filter(name => name.startsWith('.ai-native-sdlc.stage.')).length,0);
});

test('failed write rolls back newly created files and directories only', t => {
  const target = fixture(t);
  writeFileSync(join(target,'keep.txt'),'user');
  const tools = fixture(t);
  writeFileSync(join(tools,'cp'),'#!/bin/sh\nexit 43\n',{mode:0o755});
  const failed = shellInstall(target,{PATH:`${tools}:${process.env.PATH}`});
  assert.notEqual(failed.status,0);
  assert.equal(existsSync(join(target,'AGENTS.md')),false);
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
  assert.ok(lstatSync(join(target,'.ai-native-sdlc')).isDirectory());
  assert.equal(shellInstall(target).status,0);
  assert.equal(readdirSync(join(target,'.agents/skills')).length,
    readdirSync(join(source,'skills')).length);
});

test('public bootstrap clones over HTTPS without GitHub credentials by default', t => {
  const target = fixture(t);
  const tools = fixture(t);
  const script = join(tools,'install.sh');
  writeFileSync(script,readFileSync(shellInstaller));
  writeFileSync(join(tools,'git'),'#!/bin/sh\nprintf "%s\\n" "$*" >&2\nexit 55\n',{mode:0o755});
  const result = spawnSync('bash',[script,target],{encoding:'utf8',env:{
    ...process.env,PATH:`${tools}:${process.env.PATH}`,
    AI_NATIVE_SDLC_REPO_URL:'',AI_NATIVE_SDLC_REF:'main'
  }});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/clone .*https:\/\/github\.com\/HakjunMIN\/ai-native-harness\.git/);
  assert.equal(existsSync(join(target,'.ai-native-sdlc')),false);
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
  const repository = bootstrappableRepository(t);
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
  assert.ok(lstatSync(join(target,'.ai-native-sdlc')).isDirectory());
  const originalRevision = readFileSync(join(target,'.ai-native-sdlc/.install-revision'),'utf8');
  const originalHook = readFileSync(join(target,'.ai-native-sdlc/hooks/guard.mjs'),'utf8');
  const remoteHook = join(repository,'hooks/guard.mjs');
  writeFileSync(remoteHook,readFileSync(remoteHook,'utf8')+'\n// fresh remote version\n');
  const commit = spawnSync('git',['-C',repository,'-c','user.name=Installer Test',
    '-c','user.email=installer-test@example.invalid','commit','--quiet','-am','Update hook'],{encoding:'utf8'});
  assert.equal(commit.status,0,commit.stderr);
  assert.equal(spawnSync('bash',[script,target],{encoding:'utf8',env:{
    ...process.env,AI_NATIVE_SDLC_CACHE_DIR:cache,AI_NATIVE_SDLC_REPO_URL:`file://${repository}`
  }}).status,0);
  assert.notEqual(readFileSync(join(target,'.ai-native-sdlc/.install-revision'),'utf8'),originalRevision);
  assert.equal(readFileSync(join(target,'.ai-native-sdlc/hooks/guard.mjs'),'utf8'),
    originalHook+'\n// fresh remote version\n');
  const snapshot = readFileSync(join(target,'.ai-native-sdlc/.install-manifest'),'utf8');
  const failedUpdate = spawnSync('bash',[script,target],{encoding:'utf8',env:{
    ...process.env,AI_NATIVE_SDLC_REPO_URL:'file:///no-such-repository'
  }});
  assert.notEqual(failedUpdate.status,0);
  assert.equal(readFileSync(join(target,'.ai-native-sdlc/.install-manifest'),'utf8'),snapshot);
});

test('curl piped into bash installs in a nested quoted Unicode project path', async t => {
  const target = join(fixture(t),"nested/project's 한글");
  mkdirSync(target,{recursive:true});
  const cache = fixture(t);
  const server = createServer((request,response) => {
    if (request.url !== '/install.sh') { response.writeHead(404).end(); return; }
    response.writeHead(200,{'content-type':'text/plain'}).end(readFileSync(shellInstaller));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => server.close());
  const repository = bootstrappableRepository(t);
  const env = {...process.env,AI_NATIVE_SDLC_CACHE_DIR:cache,
    AI_NATIVE_SDLC_REPO_URL:`file://${repository}`};
  const fetched = spawn('curl',['-fsSL',`http://127.0.0.1:${server.address().port}/install.sh`]);
  const installed = spawn('bash',['-s','--',target],{env});
  fetched.stdout.pipe(installed.stdin);
  let error = '';
  installed.stderr.on('data',chunk => { error += chunk; });
  const done = child => new Promise((resolve,reject) => {
    child.on('error',reject);
    child.on('close',resolve);
  });
  const [curlStatus, bashStatus] = await Promise.all([done(fetched),done(installed)]);
  assert.equal(curlStatus,0);
  assert.equal(bashStatus,0,error);
  assert.equal(readdirSync(join(target,'.agents/skills')).length,30);
  assert.ok(lstatSync(join(target,'.ai-native-sdlc')).isDirectory());
  const hook = JSON.parse(readFileSync(join(target,'.codex/hooks.json'),'utf8'))
    .hooks.PreToolUse[0].hooks[0].command;
  const blocked = spawnSync('bash',['-c',hook],{cwd:target,encoding:'utf8',
    input:JSON.stringify({tool_name:'Bash',
      tool_input:{command:'git push origin main'},cwd:target})});
  assert.equal(blocked.status,0,blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision,'deny');
});
