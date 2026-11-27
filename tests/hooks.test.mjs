import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { git, projectRepo, runState, runWorktree } from './helpers/run-fixture.mjs';

const script = resolve('hooks/guard.mjs');
function hook(payload, adapter = 'copilot') {
  const r = spawnSync(process.execPath, [script, adapter], {input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding:'utf8'});
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  return adapter === 'claude' ? result.hookSpecificOutput : result;
}
const shell = command => ({ toolName:'bash', toolArgs:{ command }, cwd:process.cwd() });
test('allows harmless reads but rejects remote publication and production mutation', () => {
  assert.equal(hook(shell('git status --short')).permissionDecision, undefined);
  for (const command of ['git push origin main', 'git -C /tmp push origin HEAD', 'gh pr merge 42',
    'argocd app sync platform-prod', 'kubectl apply -f deployment.yaml', 'helm upgrade app chart',
    'echo tag > deploy/prod/values.yaml']) {
    assert.equal(hook(shell(command)).permissionDecision, 'deny', command);
  }
});
test('supports Claude format and JSON-encoded Copilot tool arguments', () => {
  assert.equal(hook({tool_name:'Bash',tool_input:{command:'gh pr merge 42'}}, 'claude').permissionDecision, 'deny');
  assert.equal(hook({toolName:'bash',toolArgs:JSON.stringify({command:'git push'})}).permissionDecision, 'deny');
});
test('Codex denies prohibited commands and patches without granting neutral calls', () => {
  const codex = (tool_name, tool_input) =>
    ({hook_event_name:'PreToolUse', tool_name, tool_input, cwd:process.cwd()});
  for (const [name, input] of [
    ['Bash', {command:'git push origin main'}],
    ['apply_patch', {command:'*** Begin Patch\n*** Update File: deploy/prod/values.yaml\n*** End Patch'}]
  ]) {
    const result = hook(codex(name,input),'codex');
    assert.equal(result.hookSpecificOutput.hookEventName,'PreToolUse');
    assert.equal(result.hookSpecificOutput.permissionDecision,'deny');
  }
  assert.equal(hook(codex('Bash',{command:'git status'}),'codex').hookSpecificOutput?.permissionDecision,undefined);
  assert.equal(hook({},'codex').hookSpecificOutput.permissionDecision,'deny');
});
test('hook wrappers locate Node.js without an interactive shell PATH', {skip:process.platform === 'win32'}, t => {
  const dir = mkdtempSync(join(tmpdir(),'sdlc-node-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const fake = join(dir,'node');
  writeFileSync(fake,'#!/bin/sh\necho "fake-node $*"\n',{mode:0o755});
  for (const wrapper of ['gate-guard.sh','session-start.sh']) {
    const run = env => spawnSync('/bin/bash',[resolve('hooks',wrapper),'copilot'],
      {input:'{}',encoding:'utf8',env:{PATH:'/usr/bin:/bin',HOME:dir,...env}});
    const found = run({AI_NATIVE_SDLC_NODE:fake});
    assert.equal(found.status,0,found.stderr);
    assert.match(found.stdout,new RegExp(`fake-node .*hooks/${wrapper === 'gate-guard.sh' ? 'guard' : 'session'}\\.mjs copilot`));
    const missing = run({AI_NATIVE_SDLC_NODE:join(dir,'missing-node')});
    assert.equal(missing.status,127);
    assert.match(missing.stderr,/Node\.js is not executable/);
  }
});
test('push detection targets the git subcommand, not words or other subcommands', () => {
  for (const command of ['git push', 'git -C repo push origin HEAD', 'git -c user.name=x push',
    'git --git-dir=.git --no-pager push', 'cd repo && git push', 'FOO=1 git push', 'env FOO=1 git push',
    'git status; git push', 'echo ok | git push', '/usr/bin/git push', 'git -C "my repo" push',
    'gh pr merge 1', 'gh -R o/r pr merge 1', 'bash -c "git push"', "sh -c 'git push'", 'eval "git push"',
    'git $(echo push)', 'git `echo push`', 'echo push | xargs git', 'git -c alias.p=push p', 'command git push',
    'sudo git push', 'git\tpush', 'git push>/dev/null', 'g"i"t pu\'sh\'', 'git \\\npush',
    'python3 -c "import os; os.system(\'git push\')"', 'git rebase --exec "git push" main', 'sudo -u git git push',
    'git commit -m "x" && git push', '(git push)', 'git push origin "$BRANCH"']) {
    assert.equal(hook(shell(command)).permissionDecision, 'deny', command);
  }
  for (const command of ['git stash push -m wip', 'git commit -m "push docs"', "git commit -m 'git push later'",
    'git log --grep push', 'echo push', 'git status --short', 'git -C repo stash push', 'npm run push-docs',
    'git checkout -b feature/push-guard']) {
    assert.equal(hook(shell(command)).permissionDecision, undefined, command);
  }
});
test('Codex session start provides additional context', () => {
  const result = spawnSync(process.execPath,[resolve('hooks/session.mjs'),'codex'],
    {input:JSON.stringify({cwd:process.cwd(),hook_event_name:'SessionStart'}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName,'SessionStart');
});
test('session bootstrap describes Jira and Jira-free entrypoints in every adapter', () => {
  for (const adapter of ['copilot','claude','codex']) {
    const result = spawnSync(process.execPath,[resolve('hooks/session.mjs'),adapter],
      {input:JSON.stringify({cwd:process.cwd()}),encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const output = JSON.parse(result.stdout);
    const context = (output.hookSpecificOutput ?? output).additionalContext;
    assert.match(context,/Jira key/);
    assert.match(context,/natural-language request/);
    assert.match(context,/existing local ID/);
    assert.match(context,/Human gates cannot be self-approved/);
  }
});
test('local integration merges stay neutral without authorizing remote publication', () => {
  for (const adapter of ['copilot','claude','codex']) {
    const local = hook(shell('git merge --no-commit --no-ff sdlc/local-work/t1'),adapter);
    assert.deepEqual(local,adapter === 'claude' ? {hookEventName:'PreToolUse'} : {});
    const remote = hook(shell('gh pr merge 42'),adapter);
    assert.equal((remote.hookSpecificOutput ?? remote).permissionDecision,'deny');
  }
});
test('keeps deployment observation and in-memory rendering neutral in both adapters', () => {
  for (const adapter of ['copilot','claude']) {
    for (const command of [
      'kubectl rollout status deployment/bff -n staging',
      'kubectl rollout history deployment/bff -n prod',
      'kubectl get deployment -n prod -o json',
      'helm template preview ./charts -f deploy/prod/values.yaml',
      'helm template preview ./charts -f deploy/prod/values.yaml --set image.tag=test',
      'argocd app get platform-prod --output json'
    ]) {
      assert.equal(hook(shell(command),adapter).permissionDecision,undefined,command);
    }
  }
});
test('read-only exceptions cannot authorize mutations, shell composition or output files', () => {
  for (const command of [
    'kubectl rollout restart deployment/bff -n staging',
    'kubectl rollout undo deployment/bff -n staging',
    'helm template preview ./charts -f deploy/prod/values.yaml --output-dir deploy/prod',
    'helm template preview ./charts -f deploy/prod/values.yaml --post-renderer ./renderer',
    'helm template preview ./charts -f deploy/prod/values.yaml --dependency-update',
    'helm template preview ./charts -f deploy/prod/values.yaml > deploy/prod/rendered.yaml',
    'helm template preview ./charts -f deploy/prod/values.yaml | sh',
    'helm template preview ./charts -f deploy/prod/values.yaml; kubectl apply -f app.yaml',
    'kubectl rollout status deployment/bff -n staging && git push origin main',
    'helm template preview ./charts -f deploy/prod/values.yaml --set tag=$(./mutate)',
    'helm template preview ./charts -f deploy/prod/values.yaml\nkubectl apply -f app.yaml'
  ]) {
    assert.equal(hook(shell(command)).permissionDecision,'deny',command);
  }
});
test('read-only deployment commands respect configured paths without exempting edits', t => {
  const cwd = mkdtempSync(join(tmpdir(),'sdlc-hook-'));
  t.after(() => rmSync(cwd,{recursive:true}));
  writeFileSync(join(cwd,'ai-native-sdlc.config.json'),JSON.stringify({release:{productionPaths:['ops/live']}}));
  const command = 'helm template preview ./charts -f ops/live/values.yaml';
  assert.equal(hook({...shell(command),cwd}).permissionDecision,undefined);
  assert.equal(hook({...shell(`${command} --output-dir ops/live`),cwd}).permissionDecision,'deny');
  assert.equal(hook({...shell(command),toolArgs:{command,path:'ops/live/values.yaml'},cwd}).permissionDecision,'deny');
});
test('denies production edits including patch strings but allows draft proposals', () => {
  for (const args of [{path:'deploy/prod/values.yaml'}, {file_path:'/repo/deploy/production/values.yaml'},
    {patch:'*** Begin Patch\n*** Update File: deploy/prod/values.yaml\n*** End Patch'}]) {
    assert.equal(hook({toolName:'apply_patch',toolArgs:args}).permissionDecision,'deny');
  }
  assert.equal(hook({toolName:'edit',toolArgs:{path:'docs/sdlc/ABC-123/production-proposal/change.patch'}}).permissionDecision,undefined);
});
test('uses configured production paths and denies broken configuration', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'sdlc-hook-'));
  t.after(() => rmSync(cwd, {recursive:true}));
  writeFileSync(join(cwd, 'ai-native-sdlc.config.json'), JSON.stringify({release:{productionPaths:['ops/live']}}));
  assert.equal(hook({toolName:'edit',toolArgs:{path:'ops/live/values.yaml'},cwd}).permissionDecision,'deny');
  writeFileSync(join(cwd, 'ai-native-sdlc.config.json'), '{');
  assert.equal(hook({...shell('git status'),cwd}).permissionDecision,'deny');
});
test('run worktrees inherit production paths from the primary checkout untracked config', t => {
  const {repo} = projectRepo(t);
  writeFileSync(join(repo,'ai-native-sdlc.config.json'),JSON.stringify({release:{productionPaths:['ops/live']}}));
  const cwd = runWorktree(repo,'local-work');
  git(repo,'worktree','add','-q','-b','sdlc/local-work/integration',cwd);
  assert.equal(hook({toolName:'edit',toolArgs:{path:'ops/live/values.yaml'},cwd}).permissionDecision,'deny');
  assert.equal(hook({toolName:'edit',toolArgs:{path:'src/app.js'},cwd}).permissionDecision,undefined);
});
test('session start lists runs from every run worktree with their location', t => {
  const {repo} = projectRepo(t);
  const intake = spawnSync(process.execPath,[resolve('scripts/intake.mjs'),'start-text','local-work',repo],
    {input:'Request\n',encoding:'utf8'});
  assert.equal(intake.status,0,intake.stderr);
  for (const cwd of [repo, runWorktree(repo,'local-work')]) {
    const result = spawnSync(process.execPath,[resolve('hooks/session.mjs'),'copilot'],
      {input:JSON.stringify({cwd}),encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const context = JSON.parse(result.stdout).additionalContext;
    assert.match(context,/own git worktree on sdlc\/<ID>\/integration/);
    assert.ok(context.includes(`local-work: recorded phase discover`),context);
    assert.ok(context.includes(`worktree ${runWorktree(repo,'local-work')}; state ${runState(repo,'local-work')}`),context);
  }
});
test('malformed input is a structured denial, not an empty success', () => {
  assert.equal(hook('{').permissionDecision, 'deny');
  assert.equal(hook({}).permissionDecision, 'deny');
});
test('neutral decisions preserve host permission prompts in both adapters', () => {
  const payload = {tool_name:'Bash',tool_input:{command:'rm example.txt'}};
  assert.equal(hook(payload,'claude').permissionDecision, undefined);
  assert.equal(hook(shell('rm example.txt')).permissionDecision, undefined);
});
test('config and reports may mention production without targeting production files', () => {
  const content = 'Observed deploy/prod/values.yaml. Operator runs git push and gh pr merge.';
  for (const path of ['ai-native-sdlc.config.json','docs/sdlc/ABC-123/05-release.md']) {
    assert.equal(hook({toolName:'create',toolArgs:{path,content}}).permissionDecision, undefined);
  }
  assert.equal(hook({toolName:'apply_patch',toolArgs:{patch:'*** Begin Patch\n*** Add File: docs/sdlc/ABC-123/05-release.md\n+deploy/prod/values.yaml\n*** End Patch'}}).permissionDecision, undefined);
  assert.equal(hook({toolName:'apply_patch',toolArgs:{patch:'*** Begin Patch\n*** Update File: safe.yaml\n*** Move to: deploy/prod/values.yaml\n*** End Patch'}}).permissionDecision,'deny');
});
test('saving a raw production patch as a proposal is not applying it', () => {
  const patch = '*** Begin Patch\n*** Update File: deploy/prod/values.yaml\n-tag: old\n+tag: new\n*** End Patch';
  assert.equal(hook({toolName:'create',toolArgs:{
    path:'docs/sdlc/ABC-123/production-proposal/change.patch', content:patch
  }}).permissionDecision,undefined);
  assert.equal(hook({tool_name:'Write',tool_input:{
    file_path:'docs/sdlc/ABC-123/production-proposal/change.patch', content:patch
  }},'claude').permissionDecision,undefined);
  assert.equal(hook({tool_name:'Edit',tool_input:{patch}},'claude').permissionDecision,'deny');
});
test('az and gh are limited to read-only observation', () => {
  for (const command of [
    'az group delete -n rg --yes', 'az role assignment create --assignee x --role Reader --scope /subscriptions/s',
    'az deployment group create -g rg -f main.bicep', 'az aks get-credentials -g rg -n c',
    'az keyvault secret show --vault-name v -n s', 'az keyvault secret list --vault-name v',
    'az storage account keys list -g rg -n sa', 'az webapp config appsettings list -g rg -n app',
    'az storage account show-connection-string -g rg -n sa', 'az rest --url https://management.azure.com/x',
    'az login', 'az acr login -n r', 'az account get-access-token', 'az -o json group list',
    'gh api -X DELETE repos/o/r', 'gh api --method=PATCH repos/o/r', 'gh api -XPOST repos/o/r/issues',
    'gh api -iXPUT repos/o/r', 'gh api repos/o/r -f name=x', 'gh api repos/o/r -Fname=x',
    'gh api repos/o/r --raw-field=name=x', 'gh api repos/o/r --input body.json', 'gh api graphql',
    'gh pr create --title t --body b', 'gh pr ready 1', 'gh pr review 1 --approve', 'gh pr edit 1 --title x',
    'gh pr close 1', 'gh issue create --title t', 'gh issue close 1', 'gh repo sync',
    'gh repo edit --visibility public', 'gh repo delete o/r --yes', 'gh secret set X', 'gh workflow run ci',
    'gh release create v1', 'gh run rerun 2', 'gh auth login', 'gh auth token'
  ]) {
    assert.match(hook(shell(command)).permissionDecisionReason ?? '', /requires the human operator/, command);
  }
  for (const command of [
    'az version', 'az --version', 'az account show', 'az account list -o table', 'az group list -o table',
    'az aks show -g rg -n c', 'az aks get-versions -l koreacentral', 'az graph query -q "Resources | take 1"',
    'gh pr view 1', 'gh -R o/r pr view 1', 'gh pr list --state open', 'gh pr diff 1', 'gh pr checks 1',
    'gh run view 2 --log', 'gh run list -L 5', 'gh workflow view ci', 'gh release download v1 -p "*.tgz"',
    'gh repo view o/r', 'gh label list', 'gh search prs --author @me', 'gh status', 'gh auth status',
    'gh api repos/o/r', 'gh api -X GET repos/o/r/pulls', 'gh api --method=get repos/o/r -H "Accept: x"',
    'gh pr create --draft --title t --body b', 'gh pr create -d -t t -b b', 'gh pr checkout 3',
    'gh pr comment 1 -b x', 'gh issue comment 2 -b y', 'command -v gh', 'echo gh',
    'git commit -m "use gh pr create"', 'kubectl get pods -n production'
  ]) {
    assert.equal(hook(shell(command)).permissionDecision, undefined, command);
  }
});
test('wrappers, nested shells and expansions cannot hide az or gh mutations', () => {
  for (const command of [
    'bash -c "az group delete -n rg"', "sh -lc 'gh repo delete o/r'", `zsh -c "bash -c 'az group delete -n rg'"`,
    'env A=1 gh repo delete o/r', 'env -i PATH=/bin az group delete -n rg', 'A=1 az group delete -n rg',
    'sudo az group delete -n rg', 'sudo -u root az group delete -n rg', 'command gh repo delete o/r',
    'time az group delete -n rg', 'nohup gh workflow run ci', 'timeout -s KILL 60 gh workflow run ci',
    '/usr/local/bin/gh repo delete o/r', 'cd repo && gh repo delete o/r', 'gh pr view 1; gh pr close 1',
    'az $(echo group) delete', 'eval "gh repo delete o/r"', 'gh pr view `echo 1`', 'gh pr view $PR',
    'echo o/r | xargs gh repo delete', 'gh pr view "1'
  ]) {
    assert.equal(hook(shell(command)).permissionDecision, 'deny', command);
  }
  for (const command of ['bash -c "gh pr view 1"', 'env GH_PAGER= gh pr list', 'sudo -u me az account show',
    'npm run gh-pages -- --tag $TAG', 'ls $HOME/az-lab']) {
    assert.equal(hook(shell(command)).permissionDecision, undefined, command);
  }
});
test('observation-only commands skip the production-text check', () => {
  for (const adapter of ['copilot','claude']) {
    for (const command of ['az group show -n production -o json',
      'az aks show -g rg -n production && kubectl get pods -n production']) {
      assert.equal(hook(shell(command),adapter).permissionDecision, undefined, command);
    }
  }
  for (const command of ['az group show -n production -o json > deploy/prod/rg.json',
    'az group show -n production && cp a deploy/prod/values.yaml', 'gh pr comment 1 -b "edit deploy/prod/ now"']) {
    assert.equal(hook(shell(command)).permissionDecision, 'deny', command);
  }
});
test('shell syntax, flag placement and positional arguments cannot disguise az or gh mutations', () => {
  for (const command of [
    'bash -euo pipefail -c "az group delete -n rg --yes"', 'bash -c -e "gh workflow run x"',
    "bash -o pipefail -c 'gh release create v9'", 'if true; then az group delete -n rg --yes; fi',
    '{ gh workflow run deploy.yml; }', '! gh workflow run deploy.yml', 'for i in 1; do gh release create v9; done',
    'while true; do gh run rerun 2; done', 'setsid gh workflow run x', 'stdbuf -oL gh workflow run x',
    'find . -exec gh workflow run x \\;', 'echo "gh workflow run x" | bash', 'rg --pre gh x docs',
    'gh workflow --ref view run deploy.yml', 'gh issue --comment view close 5', 'gh release --notes view create v9',
    'gh --description search repo edit', 'gh pr create --draft --draft=false',
    'az acr build list -r reg -t img', 'az acr run list -r reg', 'az acr manifest delete list',
    'az signalr key list -n s -g rg', 'az search admin-key show --service-name s -g rg',
    'az search query-key list --service-name s -g rg', 'az eventgrid topic key list -n t -g rg',
    'az iot hub policy list --hub-name h', 'az monitor app-insights api-key show --app a -g rg',
    "setsid sh -c 'gh workflow run deploy.yml'", "stdbuf -o0 bash -c 'az group delete -n rg --yes'",
    "find . -maxdepth 0 -exec sh -c 'gh workflow run deploy.yml' \\;", '*** Begin Patch\ngh workflow run deploy.yml',
    'gh pr create --title --draft --body x', 'gh pr create -t --draft -b x', 'gh pr create -d -t x --draft=false',
    'gh auth status --show-token', 'gh auth status -t', 'gh auth status -h github.com -at'
  ]) {
    assert.equal(hook(shell(command)).permissionDecision, 'deny', command);
  }
  for (const command of ['bash -euo pipefail -c "gh pr view 1"', 'if gh pr view 1; then echo ok; fi',
    'which az', 'type gh', 'grep -rn gh docs', 'rg -n gh docs', 'gh pr -R o/r view 1', 'gh pr --repo=o/r view 1',
    'gh pr view 1 --repo o/r', 'az acr show -n reg', 'az pipelines build list',
    "setsid sh -c 'gh pr view 1'", 'gh pr create --title x --draft', 'gh pr create -t x -d', 'gh pr create -dt --draft=false', 'gh auth status -h github.com']) {
    assert.equal(hook(shell(command)).permissionDecision, undefined, command);
  }
});
test('Codex patches that mention az or gh are judged by their target paths', () => {
  const patch = '*** Begin Patch\n*** Add File: docs/notes.md\n+Use `gh pr view 1` to read.\n+gh workflow run deploy.yml\n' +
    '+Run `az group list` first.\n*** End Patch';
  const result = hook({hook_event_name:'PreToolUse',tool_name:'apply_patch',tool_input:{command:patch},cwd:process.cwd()},'codex');
  assert.equal(result.hookSpecificOutput?.permissionDecision, undefined);
});
