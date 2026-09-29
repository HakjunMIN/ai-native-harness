import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, validateState } from '../scripts/state.mjs';
import { createPolicy } from '../scripts/workflow.mjs';

const config = {workflow:{boundedProfile:'light'},review:{requireDifferentFamily:false,allowHumanReview:true}};
const draft = {changeKind:'behavior',risks:[],tasks:[{
  id:1,title:'Bounded change',goal:'One result',scope:['Local behavior'],nonGoals:['Other behavior'],blockedBy:[],
  acceptanceCriteria:[{id:'T1-AC1',requirement:'AC-1',text:'Expected behavior',checks:['junit']}]
}]};

function fixture(t, classification = 'bounded') {
  const root = mkdtempSync(join(tmpdir(),'sdlc-tasks-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const state = JSON.parse(readFileSync('templates/state.json','utf8'));
  const output = 'Synthetic evidence for unit tests only.\n';
  writeFileSync(join(root,'evidence.txt'),output);
  const evidence = {path:'evidence.txt',sha256:digest(output)};
  state.classification = classification;
  state.phase = 'plan';
  state.gates.G0 = {status:'passed',evidence:[evidence]};
  state.gates.G1 = {status:'passed',evidence:[evidence],approval:{actor:'human',reference:'synthetic',at:'2026-09-28T00:00:00Z'}};
  const statePath = join(root,'state.json');
  writeFileSync(statePath,JSON.stringify(state));
  writeFileSync(join(root,'config.json'),JSON.stringify(config));
  writeFileSync(join(root,'draft.json'),JSON.stringify(draft));
  const run = () => spawnSync(process.execPath,['scripts/tasks.mjs','prepare',statePath,join(root,'config.json'),join(root,'draft.json')],{encoding:'utf8'});
  return {root,state,statePath,run};
}

test('policy resolution keeps risk and decomposition strict without forcing a different family', () => {
  assert.equal(createPolicy(config,'bounded',draft).profile,'light');
  assert.equal(createPolicy({...config,review:{requireDifferentFamily:true}},'bounded',draft).requireDifferentFamily,true);
  assert.equal(createPolicy({},'bounded',draft).profile,'strict');
  const decomposed = {...draft,tasks:[draft.tasks[0],{...draft.tasks[0],id:2}]};
  assert.equal(createPolicy(config,'bounded',decomposed).profile,'strict');
  for (const classification of ['bounded','architectural']) {
    const policy = createPolicy(config,classification,{...draft,risks:['authentication']});
    assert.equal(policy.profile,'strict');
    assert.equal(policy.requireDifferentFamily,false);
    assert.equal(policy.allowHumanReview,true);
  }
  assert.throws(() => createPolicy({...config,review:{requireDifferentFamily:'no'}},'bounded',draft),/boolean/);
  assert.throws(() => createPolicy({...config,workflow:{boundedProfile:'unknown'}},'architectural',draft),/boundedProfile/);
});

test('strict review defaults to optional family diversity and preserves explicit opt-in', () => {
  for (const classification of ['bounded','architectural']) {
    const defaults = createPolicy({},classification,draft);
    assert.equal(defaults.profile,'strict');
    assert.equal(defaults.requireDifferentFamily,false);
    assert.equal(defaults.allowHumanReview,false);
    const enforced = createPolicy({...config,review:{requireDifferentFamily:true,allowHumanReview:true}},
      classification,{...draft,risks:['authentication']});
    assert.equal(enforced.profile,'strict');
    assert.equal(enforced.requireDifferentFamily,true);
    assert.equal(enforced.allowHumanReview,false);
  }
});

test('preparation writes one canonical lightweight definition without a child document or approval', t => {
  const {root,statePath,run} = fixture(t);
  const result = run();
  assert.equal(result.status,0,result.stderr);
  const state = JSON.parse(readFileSync(statePath));
  const plan = JSON.parse(readFileSync(join(root,state.taskPlan.path)));
  assert.match(state.taskPlan.path,/^plans\/[a-f0-9]{64}\/tasks\.json$/);
  assert.deepEqual(Object.keys(plan),['format','parent','policy','tasks']);
  assert.equal('ticketPlan' in state,false);
  assert.deepEqual(JSON.parse(result.stdout).tasks,1);
  assert.deepEqual(plan.policy,state.policy);
  assert.equal(plan.tasks[0].document,undefined);
  assert.equal(state.gates.G2.status,'pending');
  assert.equal(state.phase,'plan');
  assert.deepEqual(validateState(state,root),[]);
});

test('strict preparation generates immutable detailed views and detects manually rehashed divergence', t => {
  const {root,statePath,run} = fixture(t,'architectural');
  const result = run();
  assert.equal(result.status,0,result.stderr);
  const state = JSON.parse(readFileSync(statePath));
  const plan = JSON.parse(readFileSync(join(root,state.taskPlan.path)));
  assert.equal(state.policy.profile,'strict');
  assert.equal(state.policy.requireDifferentFamily,false);
  assert.equal(state.policy.allowHumanReview,true);
  assert.deepEqual(plan.policy,state.policy);
  const document = plan.tasks[0].document;
  assert.match(document.path,/^plans\/[a-f0-9]{64}\/tasks\/1\.md$/);
  assert.match(readFileSync(join(root,document.path),'utf8'),/Generated from tasks.json/);
  writeFileSync(join(root,document.path),'Unrelated manually edited AC');
  document.sha256 = digest('Unrelated manually edited AC');
  const body = JSON.stringify(plan);
  writeFileSync(join(root,state.taskPlan.path),body);
  state.taskPlan.sha256 = digest(body);
  assert.match(validateState(state,root).join('\n'),/generated document differs/);
});

test('invalid graph and missing approval do not rewrite state', t => {
  const {root,state,statePath,run} = fixture(t);
  const original = readFileSync(statePath,'utf8');
  const bad = structuredClone(draft);
  bad.tasks[0].blockedBy = [1];
  writeFileSync(join(root,'draft.json'),JSON.stringify(bad));
  const invalidGraph = run();
  assert.notEqual(invalidGraph.status,0);
  assert.match(invalidGraph.stderr,/dependency cycle/);
  assert.equal(readFileSync(statePath,'utf8'),original);
  writeFileSync(join(root,'draft.json'),JSON.stringify(draft));
  state.gates.G1.status = 'pending';
  writeFileSync(statePath,JSON.stringify(state));
  const missingApproval = run();
  assert.notEqual(missingApproval.status,0);
  assert.match(missingApproval.stderr,/requires valid G1/);
});

test('prepare rejects the old ticket-keyed draft without writing state', t => {
  const {root,statePath,run} = fixture(t);
  const original = readFileSync(statePath,'utf8');
  const {tasks,...fields} = draft;
  writeFileSync(join(root,'draft.json'),JSON.stringify({...fields,tickets:tasks}));
  const result = run();
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/nonempty tasks required/);
  assert.equal(readFileSync(statePath,'utf8'),original);
});

test('preparation refuses output through a symlink', t => {
  const {root,statePath,run} = fixture(t);
  symlinkSync(tmpdir(),join(root,'plans'));
  const original = readFileSync(statePath,'utf8');
  const result = run();
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/symlink/);
  assert.equal(readFileSync(statePath,'utf8'),original);
});

test('preparation is deterministic and refuses to replace an approved plan', t => {
  const {root,statePath,run} = fixture(t);
  assert.equal(run().status,0);
  const initial = JSON.parse(readFileSync(statePath));
  const definition = readFileSync(join(root,initial.taskPlan.path),'utf8');
  assert.equal(run().status,0);
  const prepared = JSON.parse(readFileSync(statePath));
  assert.deepEqual(prepared.taskPlan,initial.taskPlan);
  assert.equal(readFileSync(join(root,prepared.taskPlan.path),'utf8'),definition);
  prepared.gates.G2 = {status:'passed',evidence:[prepared.taskPlan],approval:prepared.gates.G1.approval};
  prepared.phase = 'implement';
  writeFileSync(statePath,JSON.stringify(prepared));
  const original = readFileSync(statePath,'utf8');
  const result = run();
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/unapproved G2/);
  assert.equal(readFileSync(statePath,'utf8'),original);
});
