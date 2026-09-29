import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
