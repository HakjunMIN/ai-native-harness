import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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
    schemaVersion: 1, ticket: 'ABC-123', classification: 'architectural', uiChange: true,
    phase: 'release', gates: Object.fromEntries(['G0','G1','G2','G3','G4','G5a'].map(g => [g, gate()])),
    slices: [{ id: 1, status: 'done', attempts: 1, red: evidence, green: evidence, subjectHead: head,
      reviews: [{ axis: 'spec', authorFamily: 'openai', reviewerFamily: 'anthropic', authorModel: 'writer', reviewerModel: 'reader', blocking: 0, evidence },
        { axis: 'standards', authorFamily: 'openai', reviewerFamily: 'anthropic', authorModel: 'writer', reviewerModel: 'reader', blocking: 0, evidence }] }],
    history: [], jira: { sync: 'pending' },
  };
  state.gates.G2.reviews = [{ axis: 'plan', authorFamily: 'anthropic', reviewerFamily: 'openai', authorModel: 'planner', reviewerModel: 'critic', blocking: 0, evidence }];
  state.gates.G4.reviews = [{ ...state.slices[0].reviews[0], axis: 'final' }];
  state.gates.G5b = { status: 'pending' };
  return { state, root, evidence };
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
