import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, validateState, nextPhase, invalidate } from '../scripts/state.mjs';
import { renderTicket } from '../scripts/workflow.mjs';

const head = 'a'.repeat(40);
const lightPolicy = {
  version: 1, profile: 'light', changeKind: 'behavior', risks: [],
  requireDifferentFamily: false, allowHumanReview: true
};

function fixture(t, policy = lightPolicy) {
  const root = mkdtempSync(join(tmpdir(),'sdlc-workflow-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const output = 'Synthetic fixture, not real approval or execution evidence.\n';
  writeFileSync(join(root,'evidence.txt'),output);
  const evidence = {path:'evidence.txt',sha256:digest(output)};
  const approval = {actor:'human',reference:'synthetic:approval',at:'2026-09-28T00:00:00Z'};
  const gate = () => ({status:'passed',evidence:[evidence],approval,subjectHead:head});
  const review = {
    axis:'combined', authorModel:'author', authorFamily:'openai', authorSession:'author-session',
    reviewerType:'model', reviewerModel:'reviewer', reviewerFamily:'openai', reviewerSession:'reviewer-session',
    subjectHead:head, coverage:['spec','standards','security'], blocking:0, evidence
  };
  const state = {
    schemaVersion:2,ticket:'ABC-123',classification:'bounded',uiChange:false,phase:'implement',
    policy:structuredClone(policy),gates:Object.fromEntries(['G0','G1','G2'].map(name => [name,gate()])),
    publications:[],slices:[{id:1,status:'pending'}],history:[]
  };
  for (const name of ['G3','G4','G5a','G5b']) state.gates[name] = {status:'pending'};
  const plan = {format:'canonical-v1',parent:state.ticket,policy:structuredClone(policy),tickets:[{
    id:1,title:'Small change',goal:'Observable result',scope:['Affected behavior'],nonGoals:['Other behavior'],
    blockedBy:[],acceptanceCriteria:[{id:'T1-AC1',requirement:'AC-1',text:'Expected result',checks:['junit']}]
  }]};
  function bind() {
    const body = JSON.stringify(plan);
    writeFileSync(join(root,'tickets.json'),body);
    state.ticketPlan = {path:'tickets.json',sha256:digest(body)};
    state.gates.G2.evidence = [state.ticketPlan];
  }
  bind();
  return {root,state,plan,evidence,approval,review,bind};
}

test('approved light work routes to implementation on the existing parent issue', t => {
  const {state,root} = fixture(t);
  assert.deepEqual(validateState(state,root),[]);
  assert.equal(nextPhase(state),'implement');
  const path = join(root,'state.json');
  writeFileSync(path,JSON.stringify(state));
  const result = spawnSync(process.execPath,['scripts/state.mjs','ready',path],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),[{id:1,key:'ABC-123'}]);
});

test('light work accepts one independent combined review and still rejects self-review', t => {
  const {state,root,evidence,review} = fixture(t);
  state.slices[0] = {id:1,status:'done',attempts:1,red:evidence,green:evidence,subjectHead:head,reviews:[review]};
  assert.deepEqual(validateState(state,root),[]);
  review.reviewerSession = review.authorSession;
  assert.match(validateState(state,root).join('\n'),/independent/);
});

test('approved light policy accepts evidenced human review without inventing model identity', t => {
  const {state,root,evidence,approval,review} = fixture(t);
  const humanReview = {...review,reviewerType:'human',human:approval};
  delete humanReview.reviewerModel;
  delete humanReview.reviewerFamily;
  delete humanReview.reviewerSession;
  state.slices[0] = {id:1,status:'done',attempts:1,red:evidence,green:evidence,subjectHead:head,reviews:[humanReview]};
  assert.deepEqual(validateState(state,root),[]);
  delete humanReview.human;
  assert.match(validateState(state,root).join('\n'),/human review/);
});

test('light review eligibility follows the approved family and human-review flags', t => {
  const {state,root,plan,bind,evidence,approval,review} = fixture(t);
  state.policy.requireDifferentFamily = true;
  state.policy.allowHumanReview = false;
  plan.policy = structuredClone(state.policy);
  bind();
  state.slices[0] = {id:1,status:'done',attempts:1,red:evidence,green:evidence,subjectHead:head,reviews:[review]};
  assert.match(validateState(state,root).join('\n'),/distinct verified model family/);
  review.reviewerFamily = 'anthropic';
  assert.deepEqual(validateState(state,root),[]);
  state.policy.requireDifferentFamily = false;
  plan.policy = structuredClone(state.policy);
  bind();
  state.slices[0].reviews = [{axis:'combined',reviewerType:'human',human:approval,
    subjectHead:head,coverage:['spec','standards'],blocking:0,evidence}];
  assert.match(validateState(state,root).join('\n'),/human review/);
});

test('policy is bound to G2 and cannot silently weaken existing approvals', t => {
  const {state,root,plan,bind} = fixture(t);
  state.policy.allowHumanReview = false;
  assert.match(validateState(state,root).join('\n'),/policy.*match/);
  plan.policy = structuredClone(state.policy);
  bind();
  assert.deepEqual(validateState(state,root),[]);
  state.classification = 'architectural';
  assert.match(validateState(state,root).join('\n'),/light.*bounded/);
  state.classification = 'bounded';
  state.policy.risks = ['tenant-isolation'];
  assert.match(validateState(state,root).join('\n'),/light.*risk/);
});

test('light plans reject multiple outcomes and active child publication receipts', t => {
  const {state,root,plan,bind} = fixture(t);
  plan.tickets.push({...plan.tickets[0],id:2});
  state.slices.push({id:2,status:'pending'});
  bind();
  assert.match(validateState(state,root).join('\n'),/light.*one/);
  plan.tickets.pop();
  state.slices.pop();
  bind();
  state.publications = [{id:1,status:'pending',parent:state.ticket,marker:'sdlc:ABC-123:ticket:1'}];
  assert.match(validateState(state,root).join('\n'),/light.*publication/);
});

test('removing a policy cannot reuse the approval binding or weaken legacy requirements', t => {
  const {state,root,plan,bind} = fixture(t);
  delete state.policy;
  assert.match(validateState(state,root).join('\n'),/policy.*match/);
  delete plan.policy;
  bind();
  const errors = validateState(state,root).join('\n');
  assert.match(errors,/G2: reviews required/);
  assert.equal(nextPhase(state),'publish');
});

test('strict policy permits same-model independent reviews at plan, slice and final gates', t => {
  const {state,root,plan,bind,evidence,review,approval} = fixture(t);
  state.policy = {...lightPolicy,profile:'strict',allowHumanReview:false};
  plan.policy = structuredClone(state.policy);
  const body = renderTicket(plan.tickets[0],state.ticket);
  writeFileSync(join(root,'ticket.md'),body);
  plan.tickets[0].document = {path:'ticket.md',sha256:digest(body)};
  bind();
  state.publications = [{id:1,parent:state.ticket,marker:'sdlc:ABC-123:ticket:1',status:'confirmed',
    key:'ABC-124',planSha256:state.ticketPlan.sha256,blockedBy:[],evidence}];
  const independent = {...review,reviewerModel:review.authorModel};
  state.gates.G2.reviews = [{...independent,axis:'plan'}];
  state.slices[0] = {id:1,status:'done',attempts:1,red:evidence,green:evidence,subjectHead:head,
    reviews:['spec','standards'].map(axis => ({...independent,axis}))};
  state.gates.G3 = {status:'passed',evidence:[evidence],subjectHead:head};
  state.gates.G4 = {status:'passed',evidence:[evidence],subjectHead:head,reviews:[{...independent,axis:'final'}]};
  state.phase = 'release';
  assert.deepEqual(validateState(state,root,head),[]);

  for (const record of [state.gates.G2.reviews[0],...state.slices[0].reviews,state.gates.G4.reviews[0]]) {
    record.reviewerSession = record.authorSession;
    assert.match(validateState(state,root,head).join('\n'),/independent review session/);
    record.reviewerSession = independent.reviewerSession;
    delete record.reviewerFamily;
    assert.match(validateState(state,root,head).join('\n'),/verified model family/);
    record.reviewerFamily = independent.reviewerFamily;
  }
  state.slices[0].reviews.pop();
  assert.match(validateState(state,root,head).join('\n'),/standards review required/);
  state.slices[0].reviews.push({...independent,axis:'standards'});
  state.gates.G4.reviews[0] = {axis:'final',reviewerType:'human',human:approval,
    subjectHead:head,coverage:['spec','standards','security'],blocking:0,evidence};
  assert.match(validateState(state,root,head).join('\n'),/human review/);
  state.policy.allowHumanReview = true;
  plan.policy = structuredClone(state.policy);
  bind();
  state.publications[0].planSha256 = state.ticketPlan.sha256;
  assert.deepEqual(validateState(state,root,head),[]);
});

test('explicit strict cross-family policy still rejects same-family and human substitution', t => {
  const {state,root,plan,bind,evidence,review} = fixture(t);
  state.policy = {...lightPolicy,profile:'strict',requireDifferentFamily:true,allowHumanReview:false};
  plan.policy = structuredClone(state.policy);
  const body = renderTicket(plan.tickets[0],state.ticket);
  writeFileSync(join(root,'ticket.md'),body);
  plan.tickets[0].document = {path:'ticket.md',sha256:digest(body)};
  bind();
  state.publications = [{id:1,parent:state.ticket,marker:'sdlc:ABC-123:ticket:1',status:'confirmed',
    key:'ABC-124',planSha256:state.ticketPlan.sha256,blockedBy:[],evidence}];
  const strictReview = {...review,reviewerFamily:'anthropic'};
  state.gates.G2.reviews = [{...strictReview,axis:'plan'}];
  state.slices[0] = {id:1,status:'done',attempts:1,red:evidence,green:evidence,subjectHead:head,
    reviews:['spec','standards'].map(axis => ({...strictReview,axis}))};
  assert.deepEqual(validateState(state,root),[]);
  state.slices[0].reviews[0].reviewerFamily = review.authorFamily;
  assert.match(validateState(state,root).join('\n'),/distinct verified model family/);
  state.slices[0].reviews[0].reviewerType = 'human';
  assert.match(validateState(state,root).join('\n'),/human review/);
});

test('selective invalidation CLI validates impact containment and preserves state on bad inputs', t => {
  const {state,root,evidence,review} = fixture(t);
  state.slices[0] = {id:1,status:'done',attempts:1,red:evidence,green:evidence,subjectHead:head,reviews:[review]};
  const path = join(root,'state.json');
  writeFileSync(path,JSON.stringify(state));
  const original = readFileSync(path,'utf8');
  const run = (...options) => spawnSync(process.execPath,
    ['scripts/state.mjs','invalidate',path,'G3','Code fix',...options],{encoding:'utf8'});
  for (const [options,pattern] of [
    [['--slices','1'],/supplied together/],
    [['--slices','99','--impact','evidence.txt'],/known G3 slice/],
    [['--slices','1','--impact',join(root,'evidence.txt')],/inside ticket/]
  ]) {
    const result = run(...options);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,pattern);
    assert.equal(readFileSync(path,'utf8'),original);
  }
  const outside = mkdtempSync(join(tmpdir(),'sdlc-impact-'));
  t.after(() => rmSync(outside,{recursive:true,force:true}));
  writeFileSync(join(outside,'impact.txt'),'outside');
  symlinkSync(join(outside,'impact.txt'),join(root,'escape.txt'));
  const escaped = run('--slices','1','--impact','escape.txt');
  assert.notEqual(escaped.status,0);
  assert.match(escaped.stderr,/inside ticket/);
  assert.equal(readFileSync(path,'utf8'),original);
  const result = run('--slices','1','--impact','evidence.txt');
  assert.equal(result.status,0,result.stderr);
  const updated = JSON.parse(readFileSync(path));
  assert.deepEqual(updated.history.at(-1).affectedSlices,[1]);
  assert.deepEqual(validateState(updated,root),[]);
  writeFileSync(join(root,'evidence.txt'),'changed impact');
  assert.match(validateState(updated,root).join('\n'),/impact analysis: evidence hash mismatch/);
});

test('non-behavior work uses meaningful static or before/after evidence instead of fabricated RED', t => {
  for (const changeKind of ['documentation','config','refactor']) {
    const policy = {...lightPolicy,changeKind,verificationReason:'No observable behavior changes; scoped checks apply'};
    const {state,root,evidence,review} = fixture(t,policy);
    state.slices[0] = {id:1,status:'done',attempts:1,green:evidence,subjectHead:head,reviews:[review]};
    if (changeKind === 'refactor') state.slices[0].before = evidence;
    assert.deepEqual(validateState(state,root),[]);
    if (changeKind === 'refactor') {
      delete state.slices[0].before;
      assert.match(validateState(state,root).join('\n'),/before/);
    }
    delete state.slices[0].green;
    assert.ok(validateState(state,root).length);
  }
});

test('final light review can reuse unchanged evidence but must include security coverage and final revision', t => {
  const {state,root,evidence,review} = fixture(t);
  state.slices[0] = {id:1,status:'done',attempts:1,red:evidence,green:evidence,subjectHead:head,reviews:[review]};
  state.gates.G3 = {status:'passed',evidence:[evidence],subjectHead:head};
  state.gates.G4 = {status:'passed',evidence:[evidence],subjectHead:head,reviews:[review]};
  state.phase = 'release';
  assert.deepEqual(validateState(state,root,head),[]);
  review.coverage = ['spec','standards'];
  assert.match(validateState(state,root,head).join('\n'),/security/);
  review.coverage.push('security');
  review.subjectHead = 'b'.repeat(40);
  assert.match(validateState(state,root,head).join('\n'),/review.*revision/);
});

test('selective G3 invalidation resets changed slices and transitive dependents, not unrelated slices', t => {
  const {state,evidence,review} = fixture(t);
  state.slices = [1,2,3,4].map(id => ({id,status:'done',attempts:1,red:evidence,green:evidence,subjectHead:head,reviews:[review]}));
  const tickets = [{id:1,blockedBy:[]},{id:2,blockedBy:[1]},{id:3,blockedBy:[2]},{id:4,blockedBy:[]}];
  const updated = invalidate(state,'G3','Changed first outcome',{sliceIds:[1],tickets,impact:evidence});
  assert.deepEqual(updated.slices.map(slice => slice.status),['pending','pending','pending','done']);
  assert.deepEqual(updated.slices[3],state.slices[3]);
  assert.deepEqual(updated.impactAnalysis,evidence);
  assert.equal(updated.gates.G4.status,'pending');
  assert.throws(() => invalidate(state,'G3','Missing impact',{sliceIds:[1],tickets}),/impact/);
  assert.throws(() => invalidate(state,'G3','Unknown slice',{sliceIds:[99],tickets,impact:evidence}),/slice/);
  assert.throws(() => invalidate(state,'G2','Wrong gate',{sliceIds:[1],tickets,impact:evidence}),/known G3/);
  assert.throws(() => invalidate(state,'G3','Incomplete graph',{sliceIds:[1],tickets:tickets.slice(0,3),impact:evidence}),/complete ticket dependency graph/);
});

test('selective CLI invalidation preserves a valid unrelated strict slice and rejects a changed graph', t => {
  const {state,root,plan,bind,evidence,review} = fixture(t);
  state.policy = {...lightPolicy,profile:'strict',requireDifferentFamily:true,allowHumanReview:false};
  plan.policy = structuredClone(state.policy);
  const prototype = plan.tickets[0];
  plan.tickets = [1,2,3,4].map(id => ({...prototype,id,blockedBy:id === 2 ? [1] : id === 3 ? [2] : []}));
  for (const ticket of plan.tickets) {
    const body = renderTicket(ticket,state.ticket);
    const path = `ticket-${ticket.id}.md`;
    writeFileSync(join(root,path),body);
    ticket.document = {path,sha256:digest(body)};
  }
  bind();
  const strictReview = {...review,reviewerFamily:'anthropic'};
  state.gates.G2.reviews = [{...strictReview,axis:'plan'}];
  state.publications = plan.tickets.map(ticket => ({id:ticket.id,parent:state.ticket,
    marker:`sdlc:ABC-123:ticket:${ticket.id}`,status:'confirmed',key:`ABC-${123+ticket.id}`,
    planSha256:state.ticketPlan.sha256,blockedBy:ticket.blockedBy.map(id => `ABC-${123+id}`),evidence}));
  state.slices = plan.tickets.map(ticket => ({id:ticket.id,status:'done',attempts:1,
    red:evidence,green:evidence,subjectHead:head,reviews:['spec','standards'].map(axis => ({...strictReview,axis}))}));
  assert.deepEqual(validateState(state,root),[]);
  const path = join(root,'state.json');
  writeFileSync(path,JSON.stringify(state));
  const run = () => spawnSync(process.execPath,['scripts/state.mjs','invalidate',path,'G3','Scoped fix',
    '--slices','1','--impact','evidence.txt'],{encoding:'utf8'});
  const result = run();
  assert.equal(result.status,0,result.stderr);
  const updated = JSON.parse(readFileSync(path));
  assert.deepEqual(updated.slices.map(slice => slice.status),['pending','pending','pending','done']);
  assert.deepEqual(updated.slices[3],state.slices[3]);
  assert.deepEqual(validateState(updated,root),[]);
  const saved = readFileSync(path,'utf8');
  writeFileSync(join(root,state.ticketPlan.path),'changed graph');
  const rejected = run();
  assert.notEqual(rejected.status,0);
  assert.match(rejected.stderr,/ticket plan: evidence hash mismatch/);
  assert.equal(readFileSync(path,'utf8'),saved);
});
