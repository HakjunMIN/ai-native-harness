import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { digest, invalidate, validateState } from '../scripts/state.mjs';
import { taskDefinitionErrors } from '../scripts/workflow.mjs';
import { bindDiscovery, discovery } from './helpers/discovery.mjs';
import { asContract1, documentationQuality, planEvidence, proceedPlan, projectRepo } from './helpers/run-fixture.mjs';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const errors = f => validateState(f.state, f.run).join('\n');
// Synthetic approval for tests only; real approvals come from the human G1 form.
const approval = { actor: 'human', reference: 'synthetic:contract-test', at: '2026-11-27T00:00:00Z' };
const draft = (checks = ['static'], extra = {}) => ({ changeKind: 'documentation', risks: [], verificationReason: 'Static review',
  tasks: [{ id: 1, title: 'Change', goal: 'Observable result', scope: ['Docs'], nonGoals: ['Other'], blockedBy: [],
    acceptanceCriteria: [{ id: 'T1-AC1', requirement: 'local-AC-1', text: 'Observable result', checks }] }],
  quality: documentationQuality(), ...extra });

// A contract-2 local run with G1 approved by the given execution preferences (null omits them).
function approvedRun(t, preferences = { uiChange: false }) {
  const { root, repo } = projectRepo(t);
  const start = spawnSync(process.execPath, [resolve('scripts/intake.mjs'), 'start-text', 'local-contract', repo],
    { encoding: 'utf8', input: 'Synthetic contract request\n' });
  assert.equal(start.status, 0, start.stderr);
  const file = start.stdout.trim(), run = dirname(file), state = json(file);
  state.classification = 'bounded';
  state.uiChange = preferences?.uiChange === true;
  state.gates.G0 = { status: 'passed', evidence: [state.intake.request] };
  state.gates.G1 = { status: 'passed', evidence: [], approval: { ...approval, ...(preferences ? { preferences } : {}) } };
  bindDiscovery(run, state, discovery.replaceAll('AC-1', 'local-AC-1'));
  state.phase = 'plan';
  writeFileSync(file, JSON.stringify(state));
  return { root, file, run, state };
}

function prepare(f, definition, config = { workflow: { boundedProfile: 'light' } }) {
  writeFileSync(join(f.root, 'draft.json'), JSON.stringify(definition));
  writeFileSync(join(f.root, 'config.json'), JSON.stringify(config));
  const result = spawnSync(process.execPath, [resolve('scripts/tasks.mjs'), 'prepare', f.file,
    join(f.root, 'config.json'), join(f.root, 'draft.json')], { encoding: 'utf8' });
  if (result.status === 0) f.state = json(f.file);
  return result;
}

test('contract-2 G1 approval records valid execution preferences bound to uiChange', t => {
  const f = approvedRun(t, null);
  assert.match(errors(f), /G1: execution preferences required/);
  for (const [preferences, error] of [
    [{ uiChange: 'no' }, /preferences.uiChange must be boolean/],
    [{ uiChange: false, grants: ['push'] }, /preferences.grants/],
    [{ uiChange: false, grants: ['slice-commit', 'slice-commit'] }, /preferences.grants/],
    [{ uiChange: false, e2e: 'max' }, /preferences.e2e/],
    [{ uiChange: false, residualFindings: 'auto' }, /preferences.residualFindings/],
    [{ uiChange: false, autoMerge: true }, /unknown execution preference autoMerge/],
    [{ uiChange: true, e2e: 'none' }, /reason/],
  ]) {
    f.state.uiChange = preferences.uiChange === true;
    f.state.gates.G1.approval.preferences = preferences;
    assert.match(errors(f), error, JSON.stringify(preferences));
  }
  f.state.gates.G1.approval.preferences = { uiChange: true, e2e: 'none', reason: 'Copy-only change reviewed by screenshot' };
  assert.equal(errors(f), '');
  f.state.uiChange = false;
  assert.match(errors(f), /uiChange must match the approved G1 preferences/);
  f.state.uiChange = true;
  f.state.gates.G1.approval.preferences = { uiChange: true, e2e: 'regression', residualFindings: 'human',
    grants: ['plan-commit', 'slice-commit', 'local-integration'] };
  assert.equal(errors(f), '');
});

test('prepare derives the verification policy from G1 preferences, never from the draft', t => {
  const defaults = approvedRun(t);
  const prepared = prepare(defaults, draft(['static'], { verification: { e2e: 'none' } }));
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.deepEqual(defaults.state.policy.verification, { e2e: 'full' });
  assert.equal(errors(defaults), '');

  const waived = approvedRun(t, { uiChange: false, e2e: 'none', reason: 'Documentation only' });
  assert.equal(prepare(waived, draft()).status, 0);
  assert.deepEqual(waived.state.policy.verification, { e2e: 'none', reason: 'Documentation only' });
  waived.state.gates.G1.approval.preferences.e2e = 'regression';
  assert.match(errors(waived), /policy.verification must match the approved G1 preferences/);
  delete waived.state.policy.verification;
  assert.match(errors(waived), /verification: this run requires an approved verification policy/);
});

test('UI changes with E2E need a Playwright acceptance check before G2', t => {
  const ui = approvedRun(t, { uiChange: true });
  const missing = prepare(ui, draft(['jest']));
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /uiChange with E2E requires a playwright or playwright-bdd acceptance check/);
  assert.equal(prepare(ui, draft(['jest', 'playwright'])).status, 0);
  assert.equal(prepare(approvedRun(t, { uiChange: true, e2e: 'regression' }), draft(['playwright-bdd'])).status, 0);
  assert.equal(prepare(approvedRun(t, { uiChange: true, e2e: 'none', reason: 'Static copy change' }), draft()).status, 0);
});

test('contract-1 runs reject execution preferences, verification policy and generic Playwright checks', t => {
  const tasks = draft(['playwright']).tasks;
  assert.match(taskDefinitionErrors(tasks).join('\n'), /task 1: playwright check requires a contract-2 run/);
  assert.deepEqual(taskDefinitionErrors(tasks, { runContract: 2 }), []);

  const f = approvedRun(t);
  assert.equal(prepare(f, draft()).status, 0);
  asContract1(f.run, f.state);
  const report = errors(f);
  assert.match(report, /G1: contract-1 runs cannot carry execution preferences/);
  assert.match(report, /verification: contract-1 runs cannot carry a verification policy/);
  assert.match(report, /autonomy: contract-1 runs cannot carry an autonomy policy/);
});

test('standing grants cover only local Git actions and end with G1 invalidation or revocation', t => {
  const f = approvedRun(t, { uiChange: false, grants: ['plan-commit', 'slice-commit'] });
  for (const grants of [['merge'], ['production'], ['pr-publish']]) {
    const state = structuredClone(f.state);
    state.gates.G1.approval.preferences.grants = grants;
    assert.match(validateState(state, f.run).join('\n'), /preferences.grants/, grants[0]);
  }
  const revoked = { at: '2026-11-28T00:00:00Z', event: 'grants-revoked', grants: ['slice-commit'], reference: 'synthetic:revoke' };
  f.state.history.push(revoked);
  assert.equal(errors(f), '');
  for (const patch of [{ grants: [] }, { grants: ['push'] }, { reference: '' }, { at: 'later' }]) {
    f.state.history[f.state.history.length - 1] = { ...revoked, ...patch };
    assert.match(errors(f), /grants-revoked: at, reference and known grants required/, JSON.stringify(patch));
  }
  f.state.history.pop();
  assert.deepEqual(invalidate(f.state, 'G2', 'plan changed').gates.G1, f.state.gates.G1);
  assert.deepEqual(invalidate(f.state, 'G1', 'scope changed').gates.G1, { status: 'pending' });
});

test('prepare derives the autonomy policy from G1 preferences', t => {
  const defaults = approvedRun(t);
  assert.equal(prepare(defaults, draft(['static'], { autonomy: { residualFindings: 'human' } })).status, 0);
  assert.deepEqual(defaults.state.policy.autonomy, { residualFindings: 'follow-up' });
  const human = approvedRun(t, { uiChange: false, residualFindings: 'human' });
  assert.equal(prepare(human, draft()).status, 0);
  assert.deepEqual(human.state.policy.autonomy, { residualFindings: 'human' });
  human.state.gates.G1.approval.preferences.residualFindings = 'follow-up';
  assert.match(errors(human), /policy.autonomy must match the approved G1 preferences/);
  delete human.state.policy.autonomy;
  assert.match(errors(human), /autonomy: this run requires an approved autonomy policy/);
});

test('contract-2 G2 binds the hashed plan that holds the proceed agreement', t => {
  const f = approvedRun(t);
  assert.equal(prepare(f, draft()).status, 0);
  f.state.gates.G2 = { status: 'passed', evidence: [f.state.taskPlan], approval };
  f.state.phase = 'implement';
  assert.match(errors(f), /G2: 02-plan.md must be bound in approval evidence/);
  f.state.gates.G2.evidence.push(planEvidence(f.run));
  assert.equal(errors(f), '');
  writeFileSync(join(f.run, '02-plan.md'), `${proceedPlan}- Stop: a new external dependency.\n`);
  assert.match(errors(f), /G2: evidence hash mismatch \(02-plan.md\)/);
  f.state.gates.G2.evidence = [f.state.taskPlan];
  asContract1(f.run, f.state);
  assert.doesNotMatch(errors(f), /02-plan\.md/);
});

function reviewedPlan(t, acceptance, patch = {}) {
  const f = approvedRun(t);
  assert.equal(prepare(f, draft()).status, 0);
  writeFileSync(join(f.run, 'review.md'), 'Round 2 delta review: one non-critical standards finding remains.\n');
  f.state.gates.G2 = { status: 'passed', evidence: [f.state.taskPlan, planEvidence(f.run)], approval, reviews: [{
    axis: 'plan', reviewerType: 'model', authorModel: 'planner', authorFamily: 'openai', authorSession: 'plan-session',
    reviewerModel: 'critic', reviewerFamily: 'openai', reviewerSession: 'review-session', round: 2, critical: 0, blocking: 1,
    acceptance, evidence: { path: 'review.md', sha256: digest('Round 2 delta review: one non-critical standards finding remains.\n') },
    ...patch }] };
  f.state.phase = 'implement';
  return f;
}
const agent = { actor: 'agent', decision: 'D-7', followUps: ['Rename the handler to match the standard'] };
const decisions = '| ID | Phase | Question | Choice | Alternatives | Basis | Reversal | At |\n|---|---|---|---|---|---|---|---|\n' +
  '| D-7 | plan | Accept naming finding? | Follow-up | Fix now | Non-critical standard | Rename later | 2026-11-27T00:00:00Z |\n';

test('agents accept residual non-critical blockers only after round 2 with a logged decision', t => {
  const f = reviewedPlan(t, agent);
  assert.match(errors(f), /G2: decision D-7 is not recorded in decisions.md/);
  writeFileSync(join(f.run, 'decisions.md'), decisions);
  assert.equal(errors(f), '');
  const review = f.state.gates.G2.reviews[0];
  for (const [patch, error] of [
    [{ round: 1 }, /agent acceptance requires review round 2/],
    [{ critical: 1 }, /agent acceptance requires zero critical findings/],
    [{ blocking: 0, critical: 0 }, /agent acceptance requires remaining blocking findings/],
    [{ acceptance: { ...agent, followUps: [] } }, /agent acceptance requires follow-ups/],
    [{ acceptance: { ...agent, decision: 'later' } }, /agent acceptance requires a D-n decision/],
    [{ acceptance: { ...agent, decision: 'D-8' } }, /decision D-8 is not recorded/],
    [{ round: 3 }, /review round must be 1 or 2/],
    [{ critical: 2 }, /review critical must be an integer from 0 to blocking/],
  ]) {
    f.state.gates.G2.reviews = [{ ...review, ...patch }];
    assert.match(errors(f), error, JSON.stringify(patch));
  }
  f.state.gates.G2.reviews = [review];
  f.state.policy.autonomy = { residualFindings: 'human' };
  assert.match(errors(f), /agent acceptance requires residualFindings follow-up/);
  f.state.policy.autonomy = { residualFindings: 'follow-up' };

  f.state.gates.G2.reviews = [{ ...review, round: 1, critical: 1,
    acceptance: { actor: 'human', reference: 'synthetic:accept', at: '2026-11-27T00:00:00Z', followUps: ['Fix later'] } }];
  assert.equal(errors(f), '');
  f.state.gates.G2.reviews = [review];
  asContract1(f.run, f.state);
  assert.match(errors(f), /G2: agent acceptance requires a contract-2 run/);
});

test('selective G3 invalidation reads the task plan under the run contract', t => {
  const ui = approvedRun(t, { uiChange: true });
  assert.equal(prepare(ui, draft(['jest', 'playwright'])).status, 0);
  writeFileSync(join(ui.run, 'impact.md'), 'Only task 1 is affected\n');
  const result = spawnSync(process.execPath, [resolve('scripts/state.mjs'), 'invalidate', ui.file, 'G3', 'Code fix',
    '--slices', '1', '--impact', 'impact.md'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(json(ui.file).history.at(-1).affectedSlices, [1]);
});
