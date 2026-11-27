import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { digest, validateState } from '../scripts/state.mjs';
import { createPolicy } from '../scripts/workflow.mjs';
import { createQualityPolicy, qualityPolicyErrors } from '../scripts/quality.mjs';
import { bindDiscovery, discovery } from './helpers/discovery.mjs';
import { asContract1, git, planEvidence, projectRepo, runWorktree, sliceWorktree } from './helpers/run-fixture.mjs';

const cli = (script, ...args) => spawnSync(process.execPath, [resolve('scripts', script), ...args],
  { encoding: 'utf8', input: 'Synthetic quality fixture request\n' });
const json = file => JSON.parse(readFileSync(file));
const save = (file, value) => writeFileSync(file, JSON.stringify(value));
const notApplicable = { 'format-check': { reason: 'Synthetic fixture has no formatted source' },
  typecheck: { reason: 'Synthetic fixture is plain JavaScript' } };
const task = { id: 1, title: 'Check source', goal: 'Successful check', scope: ['.'], nonGoals: ['Other changes'], blockedBy: [],
  acceptanceCriteria: [{ id: 'T1-AC1', requirement: 'local-AC-1', text: 'Check the source', checks: ['static'] }] };

function writePlan(f) {
  const plan = JSON.stringify({ format: 'canonical-v1', parent: f.state.ticket, policy: f.state.policy, tasks: f.draft.tasks });
  writeFileSync(join(f.run, 'tasks.json'), plan);
  f.state.taskPlan = { path: 'tasks.json', sha256: digest(plan) };
  f.state.gates.G2.evidence = [f.state.taskPlan, planEvidence(f.run)];
  save(f.file, f.state);
}

function fixture(t, code = 'console.log("checked")', commandPatch = {}, checks = { lint: { command: 'lint' }, ...notApplicable }) {
  const { root, repo } = projectRepo(t);
  const id = 'local-quality', start = cli('intake.mjs', 'start-text', id, repo);
  assert.equal(start.status, 0, start.stderr);
  const file = start.stdout.trim(), run = dirname(file), source = runWorktree(repo, id);
  const state = json(file);
  const command = { cwd: '.', argv: [process.execPath, '-e', code], purpose: 'Synthetic whole-project check', ...commandPatch };
  const draft = { changeKind: 'behavior', risks: [], tasks: [structuredClone(task)],
    quality: { modules: [{ id: 'app', path: '.', tasks: [1], checks }] } };
  const preferences = { uiChange: false };
  const policy = createPolicy({ commands: { lint: command }, workflow: { boundedProfile: 'light' } }, 'bounded', draft, { runContract: 2, preferences });
  // Synthetic approvals for tests only; the runner consumes existing approval.
  const approval = { actor: 'human', reference: 'synthetic:quality-test', at: '2026-11-27T00:00:00Z' };
  state.classification = 'bounded';
  state.policy = policy;
  state.phase = 'implement';
  state.slices = [{ id: 1, status: 'in_progress' }];
  state.gates.G0 = { status: 'passed', evidence: [state.intake.request] };
  state.gates.G1 = { status: 'passed', evidence: [], approval: { ...approval, preferences } };
  bindDiscovery(run, state, discovery.replaceAll('AC-1', 'local-AC-1'));
  state.gates.G2 = { status: 'passed', evidence: [], approval };
  const f = { root, repo, source, file, run, state, draft, approval };
  writePlan(f);
  assert.deepEqual(validateState(state, run), []);
  return f;
}

function evidence(f, name, body = `${name}\n`) {
  writeFileSync(join(f.run, name), body);
  return { path: name, sha256: digest(body) };
}

function review(f, subjectHead, coverage = ['spec', 'standards']) {
  return { axis: 'combined', reviewerType: 'model', authorModel: 'author', authorFamily: 'openai', authorSession: 'author-session',
    reviewerModel: 'reviewer', reviewerFamily: 'openai', reviewerSession: 'review-session', blocking: 0, coverage, subjectHead,
    evidence: evidence(f, 'review.md') };
}

function finishSlice(f, quality) {
  const head = git(f.source, 'rev-parse', 'HEAD');
  Object.assign(f.state.slices[0], { status: 'done', attempts: 1, subjectHead: head, red: evidence(f, 'red.log'),
    green: evidence(f, 'green.log'), reviews: [review(f, head)], ...(quality ? { quality } : {}) });
  return head;
}

function runQuality(f, ...args) {
  const result = cli('quality-run.mjs', 'run', f.file, ...args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('quality policies resolve approved commands and reject incomplete assessments', () => {
  const config = { commands: { lint: { cwd: '.', argv: ['go', 'vet', './...'], purpose: 'Go vet' } } };
  const quality = createQualityPolicy(config, { tasks: [task], quality: { modules: [{ id: 'bff', path: '.', tasks: [1],
    checks: { lint: { command: 'lint' }, ...notApplicable } }] } });
  assert.deepEqual(quality.modules[0].checks.lint.command, { id: 'lint', cwd: '.', argv: ['go', 'vet', './...'], purpose: 'Go vet' });
  assert.throws(() => createQualityPolicy(config, { tasks: [task] }), /explicit module assessments/);
  assert.throws(() => createQualityPolicy(config, { tasks: [task], quality: { modules: [{ id: 'bff', path: '.', tasks: [1],
    checks: { lint: { command: 'missing' }, ...notApplicable } }] } }), /unknown project command missing/);
  const module = quality.modules[0];
  const variants = [
    [{ ...module, tasks: [2] }, /known task IDs/],
    [{ ...module, checks: { lint: module.checks.lint, typecheck: notApplicable.typecheck } }, /assess lint, format-check and typecheck/],
    [{ ...module, checks: { ...module.checks, typecheck: { reason: ' ' } } }, /needs a reason/],
    [{ ...module, checks: { ...module.checks, lint: { ...module.checks.lint, reason: 'both' } } }, /command or a non-applicability reason/]
  ];
  for (const [candidate, pattern] of variants) {
    assert.match(qualityPolicyErrors({ version: 1, modules: [candidate] }, [task]).join('\n'), pattern);
  }
  assert.match(qualityPolicyErrors({ version: 1, modules: [module] }, [task, { ...task, id: 2 }]).join('\n'), /every task needs a module assessment/);
});

test('contract-2 runs require a quality policy; contract-1 runs reject one', t => {
  const f = fixture(t);
  const withoutQuality = structuredClone(f.state);
  delete withoutQuality.policy.quality;
  assert.match(validateState(withoutQuality, f.run).join('\n'), /quality: this run requires an approved quality policy/);

  asContract1(f.run, f.state);
  assert.match(validateState(f.state, f.run).join('\n'), /quality: contract-1 runs cannot carry a quality policy/);
});

test('quality runner records check logs for the integration and task scopes without editing state', t => {
  const f = fixture(t), before = readFileSync(f.file);
  for (const args of [[], ['--task', '1']]) {
    const output = runQuality(f, ...args);
    assert.equal(output.passed, true);
    const report = json(join(f.run, output.evidence.path));
    assert.equal(report.scope, args.length ? 1 : 'integration');
    assert.equal(report.subjectHead, git(f.source, 'rev-parse', 'HEAD'));
    assert.match(readFileSync(join(f.run, report.checks[0].evidence.path), 'utf8'), /checked/);
  }
  assert.deepEqual(readFileSync(f.file), before);
  assert.ok(existsSync(join(f.run, 'quality')));
});

test('done slices and G3/G4 require matching quality reports bound to their revisions', t => {
  const f = fixture(t);
  const sliceReport = runQuality(f, '--task', '1').evidence;
  const head = finishSlice(f);
  assert.match(validateState(f.state, f.run).join('\n'), /quality 1 report: evidence path and SHA256 required/);
  f.state.slices[0].quality = sliceReport;
  assert.deepEqual(validateState(f.state, f.run), []);
  f.state.slices[0].subjectHead = 'a'.repeat(40);
  f.state.slices[0].reviews[0].subjectHead = 'a'.repeat(40);
  assert.match(validateState(f.state, f.run).join('\n'), /quality 1: report must match/);
  Object.assign(f.state.slices[0], { subjectHead: head, reviews: [review(f, head)] });

  const integration = runQuality(f).evidence;
  f.state.gates.G3 = { status: 'passed', subjectHead: head, evidence: [evidence(f, 'verify.md')] };
  f.state.phase = 'verify';
  assert.match(validateState(f.state, f.run).join('\n'), /quality integration report: evidence path and SHA256 required/);
  f.state.gates.G3.quality = integration;
  assert.match(validateState(f.state, f.run).join('\n'), /G3: quality report must be bound in gate evidence/);
  f.state.gates.G3.evidence.push(integration);
  assert.deepEqual(validateState(f.state, f.run), []);
  f.state.gates.G4 = { status: 'passed', subjectHead: head, evidence: [evidence(f, 'final.md')],
    reviews: [review(f, head, ['spec', 'standards', 'security'])] };
  f.state.phase = 'release';
  assert.match(validateState(f.state, f.run).join('\n'), /quality integration report: evidence path and SHA256 required/);
  f.state.gates.G4.quality = integration;
  f.state.gates.G4.evidence.push(integration);
  assert.deepEqual(validateState(f.state, f.run), []);
});

test('all-N/A quality scopes need no report', t => {
  const f = fixture(t, undefined, {}, { lint: { reason: 'Documentation-only fixture' }, ...notApplicable });
  finishSlice(f);
  assert.deepEqual(validateState(f.state, f.run), []);
  const output = runQuality(f);
  assert.deepEqual(json(join(f.run, output.evidence.path)).checks, []);
});

test('quality runner records failures and refuses source mutation, dirty source and unapproved execution', t => {
  for (const code of ['console.error("lint failure");process.exit(2)',
    'require("node:fs").writeFileSync("unexpected.txt","changed")']) {
    const f = fixture(t, code), before = readFileSync(f.file);
    const result = cli('quality-run.mjs', 'run', f.file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /quality.*failed|source changed/i);
    const output = JSON.parse(result.stdout);
    assert.equal(output.passed, false);
    assert.equal(json(join(f.run, output.evidence.path)).checks[0].status, 'failed');
    assert.deepEqual(readFileSync(f.file), before);
  }
  const f = fixture(t);
  writeFileSync(join(f.source, 'dirty.txt'), 'uncommitted');
  const dirty = cli('quality-run.mjs', 'run', f.file);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /clean/);
  git(f.source, 'clean', '-qf', 'dirty.txt');
  f.state.gates.G2.status = 'pending';
  save(f.file, f.state);
  const pending = cli('quality-run.mjs', 'run', f.file);
  assert.equal(pending.status, 1);
  assert.match(pending.stderr, /G2/);
});

test('quality runner checks module directories in order and stops after the first failure', t => {
  const f = fixture(t, 'console.log("app");process.exit(process.env.QUALITY_TEST_FAIL === "1" ? 3 : 0)');
  mkdirSync(join(f.source, 'shared'));
  writeFileSync(join(f.source, 'shared/index.js'), 'export const fixture = true;\n');
  git(f.source, 'add', 'shared');
  git(f.source, 'commit', '-qm', 'fixture shared module');
  f.state.policy.quality.modules.push({ id: 'shared', path: 'shared', tasks: [1], checks: {
    lint: { command: { id: 'shared-lint', cwd: 'shared', argv: [process.execPath, '-e', 'console.log(process.cwd())'],
      purpose: 'Synthetic shared module check' } }, ...notApplicable } });
  writePlan(f);

  const taskReport = json(join(f.run, runQuality(f, '--task', '1').evidence.path));
  assert.deepEqual(taskReport.checks.map(check => check.module), ['app', 'shared']);
  assert.equal(readFileSync(join(f.run, taskReport.checks[1].evidence.path), 'utf8').trim(), join(f.source, 'shared'));
  const all = spawnSync(process.execPath, [resolve('scripts/quality-run.mjs'), 'run', f.file],
    { encoding: 'utf8', env: { ...process.env, QUALITY_TEST_FAIL: '1' } });
  assert.equal(all.status, 1, all.stderr);
  const allReport = json(join(f.run, JSON.parse(all.stdout).evidence.path));
  assert.deepEqual(allReport.checks.map(check => [check.module, check.status, check.exitCode]), [['app', 'failed', 3]]);
});

test('quality runner selects the run or task worktree from the recorded assignment', t => {
  const f = fixture(t, 'console.log(process.cwd())');
  const integration = `sdlc/${f.state.ticket}/integration`, baseHead = git(f.source, 'rev-parse', 'HEAD');
  const logOf = output => readFileSync(join(f.run, json(join(f.run, output.evidence.path)).checks[0].evidence.path), 'utf8').trim();
  f.state.slices[0].workspace = { mode: 'branch', path: f.source, branch: integration, integrationBranch: integration, baseHead, paths: [] };
  save(f.file, f.state);
  assert.equal(logOf(runQuality(f, '--task', '1')), f.source);

  const path = sliceWorktree(f.repo, f.state.ticket, 1), branch = `sdlc/${f.state.ticket}/t1`;
  git(f.source, 'worktree', 'add', '-qb', branch, path);
  f.state.slices[0].workspace = { mode: 'worktree', path, branch, integrationBranch: integration, baseHead, paths: ['README.md'] };
  save(f.file, f.state);
  assert.equal(logOf(runQuality(f, '--task', '1')), path);
  assert.equal(logOf(runQuality(f)), f.source);
  mkdirSync(join(path, 'docs/sdlc'), { recursive: true });
  writeFileSync(join(path, 'docs/sdlc/notes.md'), 'ignored run evidence');
  assert.equal(logOf(runQuality(f, '--task', '1')), path);
  f.state.slices[0].workspace.path = f.repo;
  save(f.file, f.state);
  assert.match(cli('quality-run.mjs', 'run', f.file, '--task', '1').stderr, /registered/);
  f.state.slices[0].status = 'pending';
  delete f.state.slices[0].workspace;
  save(f.file, f.state);
  assert.match(cli('quality-run.mjs', 'run', f.file, '--task', '1').stderr, /in-progress task/);
});

test('quality runner reports missing executables and rejects aliased command directories', t => {
  const missing = fixture(t, undefined, { argv: ['missing-quality-fixture-command'] });
  const failed = cli('quality-run.mjs', 'run', missing.file);
  assert.equal(failed.status, 1);
  assert.equal(JSON.parse(failed.stdout).passed, false);
  assert.match(failed.stderr, /ENOENT/);

  const alias = fixture(t, undefined, { cwd: 'alias' });
  symlinkSync(alias.root, join(alias.source, 'alias'), 'dir');
  git(alias.source, 'add', 'alias');
  git(alias.source, 'commit', '-qm', 'fixture cwd alias');
  const escaped = cli('quality-run.mjs', 'run', alias.file);
  assert.equal(escaped.status, 1);
  assert.match(escaped.stderr, /escapes source|symlink/);
});
