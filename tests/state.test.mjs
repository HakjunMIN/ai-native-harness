import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateState, nextPhase, invalidate } from '../scripts/state.mjs';

const head = 'a'.repeat(40);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-state-'));
  t.after(() => rmSync(root, { recursive: true }));
  writeFileSync(join(root, 'evidence.txt'), 'observed result\n');
  const evidence = { path: 'evidence.txt', sha256: createHash('sha256').update('observed result\n').digest('hex') };
  const approval = { actor: 'human', reference: 'session:approval-1', at: '2026-09-28T01:00:00Z' };
  const gate = () => ({ status: 'passed', evidence: [evidence], approval, subjectHead: head });
  const state = {
    schemaVersion: 2, ticket: 'ABC-123', classification: 'architectural', uiChange: true,
    phase: 'release', gates: Object.fromEntries(['G0','G1','G2','G3','G4','G5a'].map(g => [g, gate()])),
    slices: [{ id: 1, status: 'done', attempts: 1, red: evidence, green: evidence, subjectHead: head,
      reviews: [{ axis: 'spec', authorFamily: 'openai', reviewerFamily: 'anthropic', authorModel: 'writer', reviewerModel: 'reader', blocking: 0, evidence },
        { axis: 'standards', authorFamily: 'openai', reviewerFamily: 'anthropic', authorModel: 'writer', reviewerModel: 'reader', blocking: 0, evidence }] }],
    history: [], jira: { sync: 'pending' },
  };
  state.gates.G2.reviews = [{ axis: 'plan', authorFamily: 'anthropic', reviewerFamily: 'openai', authorModel: 'planner', reviewerModel: 'critic', blocking: 0, evidence }];
  state.gates.G4.reviews = [{ ...state.slices[0].reviews[0], axis: 'final' }];
  state.gates.G5b = { status: 'pending' };
  const plan = { parent: 'ABC-123', tickets: [{
    id: 1, title: 'Show error rate', goal: 'User sees the selected service error rate',
    scope: ['Selected service'], nonGoals: ['Alert management'],
    blockedBy: [], document: evidence,
    acceptanceCriteria: [{ id: 'T1-AC1', requirement: 'AC-1', text: 'Show the correct rate',
      checks: ['junit', 'playwright-bdd'] }]
  }] };
  bindPlan(state, root, plan);
  state.publications = [{ id: 1, key: 'ABC-124', parent: state.ticket,
    status: 'confirmed', marker: 'sdlc:ABC-123:ticket:1',
    planSha256: state.ticketPlan.sha256, blockedBy: [], evidence }];
  return { state, root, evidence, plan };
}

function bindPlan(state, root, plan) {
  const body = JSON.stringify(plan);
  writeFileSync(join(root, 'tickets.json'), body);
  state.ticketPlan = { path: 'tickets.json', sha256: createHash('sha256').update(body).digest('hex') };
  state.gates.G2.evidence = [state.ticketPlan];
}

function planned(t) {
  const f = fixture(t);
  for (const g of ['G3','G4','G5a','G5b']) f.state.gates[g] = { status: 'pending' };
  f.state.slices = [{ id: 1, status: 'pending' }];
  f.state.publications = [];
  f.state.phase = 'publish';
  return f;
}

test('routes first incomplete gate, never treating empty gates as done', () => {
  assert.equal(nextPhase({ gates: {} }), 'discover');
  assert.equal(nextPhase({ gates: { G0: {status:'passed'}, G1: {status:'passed'} } }), 'plan');
});
test('accepts evidenced release-ready state without pretending production is done', t => {
  const {state, root} = fixture(t);
  assert.deepEqual(validateState(state, root, head), []);
  assert.equal(nextPhase(state), 'release');
});
test('next CLI derives the phase after gate updates without rewriting state', t => {
  for (const [previous,expected] of [['discover','plan'],['plan','publish'],['publish','implement']]) {
    const {state,root} = fixture(t);
    for (const gate of ['G3','G4','G5a','G5b']) state.gates[gate] = {status:'pending'};
    state.slices = [{id:1,status:'pending'}];
    if (expected !== 'implement') state.publications = [];
    if (expected === 'plan') state.gates.G2 = {status:'pending'};
    state.phase = previous;
    const path = join(root,'state.json');
    const body = JSON.stringify(state);
    writeFileSync(path,body);
    const result = spawnSync(process.execPath,['scripts/state.mjs','next',path],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout.trim(),expected);
    assert.equal(readFileSync(path,'utf8'),body);
    for (const command of ['check','ready']) {
      const stale = spawnSync(process.execPath,['scripts/state.mjs',command,path],{encoding:'utf8'});
      assert.notEqual(stale.status,0);
      assert.match(stale.stderr,new RegExp(`phase must be ${expected}`));
    }
    state.phase = result.stdout.trim();
    writeFileSync(path,JSON.stringify(state));
    const check = spawnSync(process.execPath,['scripts/state.mjs','check',path],{encoding:'utf8'});
    assert.equal(check.status,0,check.stderr);
  }
});
test('next CLI still rejects invalid approvals, evidence, prerequisites and phase names', t => {
  const mutations = [
    [state => { delete state.gates.G1.approval; }, /human approval record required/],
    [state => { state.gates.G0.evidence[0].sha256 = '0'.repeat(64); }, /evidence hash mismatch/],
    [state => { state.gates.G0.status = 'pending'; }, /prerequisite G0 not passed/],
    [state => { state.phase = 'unknown'; }, /phase must be publish/]
  ];
  for (const [mutate,expected] of mutations) {
    const {state,root} = planned(t);
    state.phase = 'plan';
    mutate(state);
    const path = join(root,'state.json');
    writeFileSync(path,JSON.stringify(state));
    const result = spawnSync(process.execPath,['scripts/state.mjs','next',path],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.equal(result.stdout,'');
    assert.match(result.stderr,expected);
  }
});
test('rejects missing prerequisites, fabricated approval shape and empty slices', t => {
  const {state, root} = fixture(t);
  state.gates.G1 = {status: 'pending'};
  state.gates.G2.approval = {actor:'agent'};
  state.slices = [];
  const errors = validateState(state, root, head).join('\n');
  assert.match(errors, /G1/);
  assert.match(errors, /approval/);
  assert.match(errors, /slices/);
});
test('rejects stale evidence contents and missing paths', t => {
  const {state, root} = fixture(t);
  writeFileSync(join(root, 'evidence.txt'), 'changed');
  assert.match(validateState(state, root, head).join('\n'), /hash/);
  state.gates.G0.evidence[0].path = 'missing.txt';
  assert.match(validateState(state, root, head).join('\n'), /evidence/);
});
test('rejects escaped and symlinked evidence paths', t => {
  const {state, root} = fixture(t);
  state.gates.G0.evidence = [{ path:'../outside', sha256:'0'.repeat(64) }];
  assert.match(validateState(state, root, head).join('\n'), /path/);
  symlinkSync(tmpdir(), join(root, 'outside'));
  state.gates.G0.evidence[0].path = 'outside/file';
  assert.ok(validateState(state, root, head).length);
});
test('rejects stale source revision and same-family reviews', t => {
  const {state, root} = fixture(t);
  state.slices[0].reviews[0].reviewerFamily = 'openai';
  const errors = validateState(state, root, 'b'.repeat(40)).join('\n');
  assert.match(errors, /revision/);
  assert.match(errors, /family/);
});
test('invalidating plan clears downstream gates, slices, and records reason', t => {
  const {state} = fixture(t);
  const updated = invalidate(state, 'G2', 'contract changed');
  assert.equal(updated.gates.G1.status, 'passed');
  assert.equal(updated.gates.G2.status, 'pending');
  assert.equal(updated.gates.G5a.status, 'pending');
  assert.equal(updated.phase, 'plan');
  assert.deepEqual(updated.slices, []);
  assert.equal(updated.history.at(-1).reason, 'contract changed');
  assert.equal(state.gates.G2.status, 'passed');
});
test('rejects malformed state without crashing', t => {
  const {root} = fixture(t);
  for (const state of [null, [], {}, {ticket:'../bad'}, {gates:null}]) {
    assert.ok(validateState(state, root, head).length);
  }
});
test('malformed ticket collections and G2 evidence report errors without throwing', t => {
  const {state,root,plan} = planned(t);
  state.gates.G2.evidence = {};
  assert.doesNotThrow(() => validateState(state,root));
  state.gates.G2.evidence = [];
  for (const bad of [null,{},'bad']) {
    bindPlan(state,root,{...plan,tickets:[{...plan.tickets[0],blockedBy:bad}]});
    assert.match(validateState(state,root).join('\n'),/dependenc/i);
  }
});
test('publication intent cannot create a ticket outside the approved set', t => {
  const {state,root} = fixture(t);
  state.publications.push({id:99,parent:state.ticket,status:'unknown',
    marker:'sdlc:ABC-123:ticket:99',planSha256:state.ticketPlan.sha256});
  assert.match(validateState(state,root,head).join('\n'),/publication 99.*approved ticket/i);
});
test('all same-axis review scopes must pass, regardless of record order', t => {
  const {state,root} = fixture(t);
  state.gates.G2.reviews[0].scope = 'architecture';
  state.gates.G2.reviews.push({
    ...state.gates.G2.reviews[0], scope:'contract', blocking:1, reviewerFamily:'anthropic',
    evidence:{path:'not-found.txt',sha256:'0'.repeat(64)}
  });
  for (let i=0; i<2; i++) {
    const errors = validateState(state,root,head).join('\n');
    assert.match(errors,/blocking/);
    assert.match(errors,/family/);
    assert.match(errors,/not-found/);
    state.gates.G2.reviews.reverse();
  }
});
  test('routes approved unpublished tickets to publish before any implementation', t => {
    const {state,root} = planned(t);
    assert.equal(nextPhase(state), 'publish');
    assert.deepEqual(validateState(state,root), []);
    state.phase = 'implement';
    assert.match(validateState(state,root).join('\n'), /publish/);
  });

  test('rejects legacy state with explicit migration requirement', t => {
    const {state,root} = fixture(t);
    state.schemaVersion = 1;
    assert.match(validateState(state,root).join('\n'), /migrat/i);
  });

  test('G2 requires a nonempty hashed ticket plan included in approval evidence', t => {
    const {state,root,plan,evidence} = planned(t);
    delete state.ticketPlan;
    assert.match(validateState(state,root).join('\n'), /ticket plan/i);
    bindPlan(state,root,{...plan,tickets:[]});
    assert.match(validateState(state,root).join('\n'), /nonempty/i);
    bindPlan(state,root,plan);
    state.gates.G2.evidence = [evidence];
    assert.match(validateState(state,root).join('\n'), /G2.*ticket plan/i);
  });

  test('detects changed ticket documents and malformed manifest without crashing', t => {
    const {state,root} = planned(t);
    writeFileSync(join(root,'evidence.txt'),'changed ticket');
    assert.match(validateState(state,root).join('\n'), /ticket.*hash/i);
    const body = '{broken';
    writeFileSync(join(root,'tickets.json'),body);
    state.ticketPlan.sha256 = createHash('sha256').update(body).digest('hex');
    assert.match(validateState(state,root).join('\n'), /ticket plan.*JSON/i);
  });

  test('ticket graph rejects duplicate IDs, missing dependencies, self edges and cycles', t => {
    const {state,root,plan} = planned(t);
    const first = plan.tickets[0];
    const cases = [
      { tickets:[first,first], error:/duplicate.*ticket/i },
      { tickets:[{...first,blockedBy:[99]}], error:/unknown.*dependency/i },
      { tickets:[{...first,blockedBy:[1]}], error:/self|cycle/i },
      { tickets:[{...first,blockedBy:[2]},{...first,id:2,blockedBy:[1]}], error:/cycle/i },
      { tickets:[null], error:/invalid ticket/i },
    ];
    for (const item of cases) {
      bindPlan(state,root,{parent:state.ticket,tickets:item.tickets});
      assert.match(validateState(state,root).join('\n'),item.error);
    }
  });

  test('ticket AC requires parent traceability and valid stack-specific checks', t => {
    const {state,root,plan} = planned(t);
    plan.tickets[0].acceptanceCriteria = [{id:'T1-AC1',text:'Works',checks:['cucumber']}];
    bindPlan(state,root,plan);
    assert.match(validateState(state,root).join('\n'), /acceptance|checks/i);
    plan.tickets[0].acceptanceCriteria = [];
    bindPlan(state,root,plan);
    assert.match(validateState(state,root).join('\n'), /acceptance/i);
  });

  test('slice IDs must exactly map the approved detailed tickets', t => {
    const {state,root} = planned(t);
    for (const slices of [[],[{id:9,status:'pending'}],[{id:1,status:'pending'},{id:1,status:'pending'}]]) {
      state.slices = slices;
      assert.match(validateState(state,root).join('\n'), /slice.*ticket|slice.*unique/i);
    }
  });

  test('queued or stale publication never enables implementation', t => {
    const {state,root} = fixture(t);
    for (const g of ['G3','G4','G5a','G5b']) state.gates[g] = {status:'pending'};
    state.slices = [{id:1,status:'pending'}];
    state.publications[0].status = 'unknown';
    state.phase = 'publish';
    assert.equal(nextPhase(state),'publish');
    assert.deepEqual(validateState(state,root),[]);
    state.publications[0].status = 'confirmed';
    state.publications[0].planSha256 = '0'.repeat(64);
    assert.equal(nextPhase(state),'publish');
  });

  test('confirmed Jira receipts require unique identity, parent, marker and readback evidence', t => {
    const {state,root} = fixture(t);
    const receipt = structuredClone(state.publications[0]);
    for (const patch of [
      {key:'ABC-123'}, {parent:'OTHER-1'}, {marker:'random'}, {evidence:null},
      {key:'bad key'}, {blockedBy:['OTHER-1']}
    ]) {
      state.publications = [{...receipt,...patch}];
      assert.match(validateState(state,root,head).join('\n'), /publication/i);
    }
    state.publications = [receipt,receipt];
    assert.match(validateState(state,root,head).join('\n'), /duplicate.*publication/i);
  });

  test('ticket creation before G2 is rejected but old receipts survive invalidation', t => {
    const {state,root} = fixture(t);
    state.gates.G2 = {status:'pending'};
    assert.match(validateState(state,root,head).join('\n'), /publication.*G2/i);
    const original = fixture(t);
    const invalid = invalidate(original.state,'G2','split ticket');
    assert.deepEqual(invalid.publications, original.state.publications.map(p => ({...p,status:'stale'})));
    assert.deepEqual(validateState(invalid,original.root), []);
  });

  test('G3 invalidation preserves ticket identity and publication but resets execution', t => {
    const {state,root} = fixture(t);
    const updated = invalidate(state,'G3','code changed');
    assert.deepEqual(updated.slices,[{id:1,status:'pending',
      revalidation:{red:state.slices[0].red,subjectHead:state.slices[0].subjectHead}}]);
    assert.deepEqual(updated.ticketPlan,state.ticketPlan);
    assert.deepEqual(updated.publications,state.publications);
    assert.equal(updated.phase,'implement');
    assert.deepEqual(validateState(updated,root),[]);
  });

  test('G2 invalidation archives a stale manifest and allows draft repair without approval', t => {
    const {state,root} = fixture(t);
    writeFileSync(join(root,'tickets.json'),'broken or edited after approval');
    const updated = invalidate(state,'G2','stale ticket definition');
    assert.equal(updated.ticketPlan,null);
    assert.deepEqual(updated.history.at(-1).previous.ticketPlan,state.ticketPlan);
    assert.deepEqual(updated.history.at(-1).previous.slices,state.slices);
    assert.deepEqual(validateState(updated,root),[]);
    assert.equal(nextPhase(updated),'plan');
  });

  test('code-only revalidation requires readable unchanged historical RED evidence', t => {
    const {state,root} = fixture(t);
    const updated = invalidate(state,'G3','regression fix');
    assert.ok(updated.slices[0].revalidation);
    updated.slices[0].revalidation.red = {path:'missing.txt',sha256:'0'.repeat(64)};
    assert.match(validateState(updated,root).join('\n'),/revalidation.*missing/i);
  });

  test('started and done slices cannot bypass publication or unfinished blockers', t => {
    const {state,root,plan} = planned(t);
    state.slices[0].status = 'in_progress';
    assert.match(validateState(state,root).join('\n'), /publication/i);
    const f = fixture(t);
    plan.tickets.push({...plan.tickets[0],id:2,blockedBy:[1]});
    bindPlan(f.state,f.root,plan);
    for (const g of ['G3','G4','G5a','G5b']) f.state.gates[g] = {status:'pending'};
    f.state.slices = [{id:1,status:'pending'},{id:2,status:'in_progress'}];
    f.state.publications[0].planSha256 = f.state.ticketPlan.sha256;
    f.state.publications.push({...f.state.publications[0],id:2,key:'ABC-125',
      marker:'sdlc:ABC-123:ticket:2',blockedBy:['ABC-124']});
    f.state.phase = 'implement';
    assert.match(validateState(f.state,f.root).join('\n'), /blocker/i);
  });

  test('done slice needs real RED GREEN and reviews before G3 can unlock dependents', t => {
    const {state,root} = fixture(t);
    for (const g of ['G3','G4','G5a','G5b']) state.gates[g] = {status:'pending'};
    state.phase = 'implement';
    delete state.slices[0].red;
    assert.match(validateState(state,root).join('\n'), /RED/);
  });

  test('ready CLI emits only pending tickets whose blockers are evidenced done', t => {
    const {state,root,plan} = fixture(t);
    plan.tickets.push({...plan.tickets[0],id:2,blockedBy:[1]});
    bindPlan(state,root,plan);
    state.publications[0].planSha256 = state.ticketPlan.sha256;
    state.publications.push({...state.publications[0],id:2,key:'ABC-125',
      marker:'sdlc:ABC-123:ticket:2',blockedBy:['ABC-124']});
    for (const g of ['G3','G4','G5a','G5b']) state.gates[g] = {status:'pending'};
    state.phase = 'implement';
    state.slices = [{id:1,status:'pending'},{id:2,status:'pending'}];
    const path = join(root,'state.json');
    writeFileSync(path,JSON.stringify(state));
    const result = spawnSync(process.execPath,['scripts/state.mjs','ready',path],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),[{id:1,key:'ABC-124'}]);
    state.slices[0] = fixture(t).state.slices[0];
    writeFileSync(path,JSON.stringify(state));
    const next = spawnSync(process.execPath,['scripts/state.mjs','ready',path],{encoding:'utf8'});
    assert.equal(next.status,0,next.stderr);
    assert.deepEqual(JSON.parse(next.stdout),[{id:2,key:'ABC-125'}]);
  });

  test('G5b needs an observed production deployment, not just human approval', t => {
    const {state,root,evidence} = fixture(t);
    state.gates.G5b = {status:'passed', evidence:[evidence], subjectHead:head,
      approval:{actor:'human',reference:'https://example.invalid/pr/7#merge',at:'2026-09-28T02:00:00Z'}};
    state.phase = 'done';
    assert.match(validateState(state,root,head).join('\n'), /G5b.*digest/i);
    for (const deployment of [
      {sync:'Synced',health:'Healthy'},
      {digest:'sha256:abc',sync:'OutOfSync',health:'Healthy'},
      {digest:'sha256:abc',sync:'Synced',health:'Degraded'},
    ]) {
      state.gates.G5b.deployment = deployment;
      assert.match(validateState(state,root,head).join('\n'), /G5b/);
    }
    state.gates.G5b.deployment = {digest:'sha256:abc',sync:'Synced',health:'Healthy'};
    assert.deepEqual(validateState(state,root,head), []);
    assert.equal(nextPhase(state),'done');
  });
