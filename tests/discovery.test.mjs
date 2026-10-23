import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, validateState } from '../scripts/state.mjs';
import { pinRun } from '../scripts/harness.mjs';
import { bindDiscovery, discovery, withDecision } from './helpers/discovery.mjs';

function fixture(t, {body = discovery, approved = false, pinned = true} = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'sdlc-discovery-'));
  t.after(() => rmSync(repo, {recursive:true,force:true}));
  const root = join(repo, 'docs/sdlc/ABC-123');
  mkdirSync(root, {recursive:true});
  const state = JSON.parse(readFileSync('templates/state.json', 'utf8'));
  writeFileSync(join(root, 'request.md'), 'Synthetic request\n');
  const evidence = {path:'request.md',sha256:digest('Synthetic request\n')};
  state.gates.G0 = {status:'passed',evidence:[evidence]};
  state.gates.G1 = approved
    ? {status:'passed',approval:{actor:'human',reference:'test:approval',at:'2026-10-22T00:00:00Z'}}
    : {status:'pending'};
  state.phase = approved ? 'plan' : 'discover';
  bindDiscovery(root, state, body);
  if (pinned) pinRun(state, root, repo);
  const path = join(root, 'state.json');
  const run = (...options) => {
    const before = JSON.stringify(state);
    writeFileSync(path, before);
    const report = readFileSync(join(root, '01-discovery.md'), 'utf8');
    const result = spawnSync(process.execPath, ['scripts/state.mjs','discovery',path,...options], {encoding:'utf8'});
    assert.equal(readFileSync(path, 'utf8'), before, 'summary cannot approve or edit state');
    assert.equal(readFileSync(join(root, '01-discovery.md'), 'utf8'), report, 'summary cannot rewrite discovery');
    return result;
  };
  return {repo, root, state, path, run};
}

test('discovery shows the approval summary in chat-ready Mermaid or equivalent text', t => {
  const {run} = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ABC-123.*G1.*초안/);
  assert.ok(result.stdout.includes(digest(discovery).slice(0, 12)), 'show a concise reference to the exact reviewed bytes');
  assert.ok(!result.stdout.includes(digest(discovery)), 'do not burden the review with full hash lists');
  assert.match(result.stdout, /```mermaid/);
  assert.match(result.stdout, /AC-1.*defined/);
  assert.doesNotMatch(result.stdout, /Detailed test-only rationale/);
  const text = run('--text');
  assert.equal(text.status, 0, text.stderr);
  assert.doesNotMatch(text.stdout, /```|flowchart TD/);
  assert.match(text.stdout, /AC-1.*defined/);
});

test('draft recommendations remain unapproved and high-impact choices are called out separately', t => {
  const {run} = fixture(t, {body:withDecision({impact:'high'})});
  const result = run('--text');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /개별 확인.*D-1.*Product owner/);
  assert.match(result.stdout, /recommended/);
  assert.doesNotMatch(result.stdout, /G1 승인 완료/);
});

test('chat summaries link to the same document and resolve evidence links without rewriting it', t => {
  const body = discovery.replace('Approve these requirements,', '[Request](request.md) [Detail](<notes with spaces.md#context>) [Web](https://example.invalid) [Scope](#scope)\n\nApprove these requirements,');
  const {root, run} = fixture(t, {body});
  const result = run('--text');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`[01-discovery.md](<${join(root, '01-discovery.md')}>)`));
  assert.ok(result.stdout.includes(`[Request](<${join(root, 'request.md')}>)`));
  assert.ok(result.stdout.includes(`[Detail](<${join(root, 'notes with spaces.md')}#context>)`));
  assert.match(result.stdout, /\[Web\]\(https:\/\/example.invalid\)/);
  assert.match(result.stdout, /\[Scope\]\(#scope\)/);
});

test('summary coverage is required for every AC, human decision, deferred choice and risk', t => {
  const risk = discovery
    .replace('| AC-1 | defined |', '| R-1 | noted | Sensitive data; preserve access boundaries. |\n| AC-1 | defined |')
    .replace('## Risks\n\n| ID | Risk | Mitigation | Decision |\n|---|---|---|---|\n',
      '## Risks\n\n| ID | Risk | Mitigation | Decision |\n|---|---|---|---|\n| R-1 | Sensitive data | Preserve access boundaries | - |\n');
  for (const [body, id] of [[discovery,'AC-1'],[withDecision(),'D-1'],[risk,'R-1']]) {
    const missing = body.replace(new RegExp(`^\\| ${id} \\| (defined|recommended|noted) \\|.*\\n`, 'm'), '');
    const {run} = fixture(t, {body:missing});
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`summary.*missing.*${id}`));
    assert.equal(result.stdout, '');
  }
});

test('unknown diagram references, duplicate IDs, stale summary status and malformed tables fail closed', t => {
  const cases = [
    [discovery.replace('@AC-1', '@AC-999'), /unknown reference AC-999/],
    [discovery.replace('| AC-1 | defined |', '| D-999 | recommended | Unknown |\n| AC-1 | defined |'), /unknown.*D-999/],
    [discovery.replace('| AC-1 | The expected result', '| AC-1 | Duplicate | Test |\n| AC-1 | The expected result'), /duplicate.*AC-1/],
    [withDecision().replace('| D-1 | recommended |', '| D-1 | confirmed |'), /status.*D-1/],
    [withDecision().replace('| g1 | standard |', '| later | standard |'), /D-1.*timing/],
    [withDecision().replace('| Product owner | - |', '| Product owner |'), /Decisions.*columns/],
    [discovery.replace('## Decisions', '## Approval summary'), /duplicate.*Approval summary/],
    [discovery.replace('| AC-1 | defined | The expected result is observable. |', '<!-- | AC-1 | defined | Hidden | -->'), /summary.*missing.*AC-1/],
    [discovery.replace('### Scope\n\nOne bounded outcome.', '### Scope\n\n'), /Scope.*required/],
    [discovery.replace('### Review', '<!--\n### Review'), /unclosed HTML comment/],
    [discovery.replace('```mermaid', '```text'), /Mermaid.*required/],
    [discovery.replace('Detailed test-only rationale', '```md\n## Approval summary\n```\nDetailed test-only rationale'), null]
  ];
  for (const [body, expected] of cases) {
    const {run} = fixture(t, {body});
    const result = run();
    if (expected) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    } else assert.equal(result.status, 0, result.stderr);
  }
});

test('existing AC identifiers and escaped table pipes remain intact', t => {
  const body = discovery.replaceAll('AC-1', 'AC-FE-03').replaceAll('expected result', 'expected \\| result')
    .replace('One bounded outcome.', 'One bounded outcome using @grafana/ui.');
  const {root, state, run} = fixture(t, {body,approved:true});
  assert.deepEqual(validateState(state, root), []);
  const result = run('--text');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AC-FE-03/);
  assert.match(result.stdout, /G1 승인 완료/);
});

test('G1 rejects unresolved human decisions without blocking draft exploration', t => {
  for (const timing of ['now','g1']) {
    const {root, state, run} = fixture(t, {body:withDecision({timing,status:'open'}),approved:true});
    assert.match(validateState(state, root).join('\n'), /D-1.*unresolved/);
    state.gates.G1.status = 'pending';
    state.phase = 'discover';
    assert.equal(run().status, 0);
  }
});

test('G1 accepts a disclosed ordinary recommendation without rewriting the approved document', t => {
  const {root, state, run} = fixture(t, {body:withDecision(),approved:true});
  assert.deepEqual(validateState(state, root), []);
  const result = run('--text');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /G1 승인 완료/);
  assert.match(result.stdout, /recommended/);
  delete state.gates.G1.approval;
  assert.match(validateState(state, root).join('\n'), /human approval record required/);
});

test('high-impact G1 recommendations require specific observed confirmations', t => {
  const {root, state, run} = fixture(t, {body:withDecision({impact:'high'}),approved:true});
  const check = confirmations => {
    state.gates.G1.approval.decisions = confirmations;
    return validateState(state, root).join('\n');
  };
  assert.match(check(undefined), /D-1.*individual confirmation/);
  for (const confirmations of [
    ['D-1'],
    [{id:'D-1',reference:''}],
    [{id:'D-999',reference:'test:choice'}],
    [{id:'D-1',reference:'test:choice'},{id:'D-1',reference:'test:duplicate'}]
  ]) assert.match(check(confirmations), /confirmation/);
  assert.equal(check([{id:'D-1',reference:'test:explicit-choice'}]), '');
  const result = run('--text');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /개별 확인 완료.*D-1/);
  assert.doesNotMatch(result.stdout, /개별 확인 대상/);
});

test('confirmed decisions need provenance and record-only assumptions cannot carry high impact', t => {
  for (const [options, pattern] of [
    [{status:'confirmed'}, /D-1.*evidence/],
    [{timing:'record',impact:'high',status:'assumed',evidence:'test:existing-pattern'}, /D-1.*high.*record/],
    [{timing:'now',status:'recommended'}, /D-1.*recommended.*g1/],
    [{timing:'g1',status:'assumed',evidence:'test:pattern'}, /D-1.*assumed.*record/]
  ]) {
    const {root, state} = fixture(t, {body:withDecision(options),approved:true});
    assert.match(validateState(state, root).join('\n'), pattern);
  }
  const {root, state} = fixture(t, {body:withDecision({timing:'now',status:'confirmed',evidence:'test:owner-answer'}),approved:true});
  assert.deepEqual(validateState(state, root), []);
});

test('low-risk recorded assumptions need no human question or mandatory summary row', t => {
  const body = withDecision({timing:'record',status:'assumed',evidence:'Existing reversible implementation pattern'})
    .replace(/^\| D-1 \| assumed \|.*\n/m, '');
  const {root, state, run} = fixture(t, {body,approved:true});
  assert.deepEqual(validateState(state, root), []);
  const result = run('--text');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /미결정|개별 확인|D-1/);
});

test('deferral requires visible exclusion and cannot remain a dependency of an approved AC', t => {
  const deferred = withDecision({status:'deferred',choice:'Export is outside this scope'});
  const {root, state} = fixture(t, {body:deferred,approved:true});
  assert.match(validateState(state, root).join('\n'), /D-1.*Non-goals/);
  const excluded = deferred.replace('Deployment and unrelated behavior.', 'Deployment and unrelated behavior; @D-1 export is excluded.');
  bindDiscovery(root, state, excluded);
  assert.deepEqual(validateState(state, root), []);
  bindDiscovery(root, state, excluded.replace('| AC-1 | The expected result', '| AC-1 | Depends on @D-1; the expected result'));
  assert.match(validateState(state, root).join('\n'), /AC-1.*deferred.*D-1/);
});

test('new pinned runs bind the exact discovery document in G1 evidence', t => {
  const {root, state, run} = fixture(t, {approved:true,pinned:true});
  assert.deepEqual(validateState(state, root), []);
  state.gates.G1.evidence = state.gates.G0.evidence;
  assert.match(validateState(state, root).join('\n'), /G1.*01-discovery.md.*approval evidence/);
  const result = run();
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
});

test('stale discovery and escaped evidence cannot produce an approved summary', t => {
  const {repo, root, state, run} = fixture(t, {approved:true});
  writeFileSync(join(root, '01-discovery.md'), discovery + '\nChanged after approval\n');
  assert.match(validateState(state, root).join('\n'), /hash mismatch/);
  assert.notEqual(run().status, 0);
  const outside = join(repo, 'outside.md');
  writeFileSync(outside, discovery);
  rmSync(join(root, '01-discovery.md'));
  symlinkSync(outside, join(root, '01-discovery.md'));
  state.gates.G1.evidence[0].sha256 = digest(discovery);
  assert.match(validateState(state, root).join('\n'), /invalid evidence path/);
  assert.notEqual(run().status, 0);
  state.gates.G1.status = 'pending';
  state.phase = 'discover';
  assert.notEqual(run().status, 0, 'even a draft cannot escape its run directory');
});

test('legacy unpinned records keep their existing gate contract until explicit adoption', t => {
  const {root, state} = fixture(t, {approved:true,pinned:false});
  state.gates.G1.evidence = state.gates.G0.evidence;
  rmSync(join(root, '01-discovery.md'));
  assert.deepEqual(validateState(state, root), []);
});

test('legacy discovery filenames do not opt an unpinned run into the new contract', t => {
  const {repo, root, state, run} = fixture(t, {
    body:'# Legacy discovery\n\nAC-1: Previously approved behavior.\n',
    approved:true,pinned:false
  });
  assert.deepEqual(validateState(state, root), []);
  const result = run('--text');
  assert.notEqual(result.status, 0, 'the new summary command still requires the new document format');
  assert.match(result.stderr, /Approval summary/);
  assert.equal(result.stdout, '');
  pinRun(state, root, repo);
  assert.match(validateState(state, root).join('\n'), /Approval summary/);
});

test('discovery rejects invalid state and unsupported options rather than printing a usable review', t => {
  const {state, run} = fixture(t);
  assert.notEqual(run('--unknown').status, 0);
  state.phase = 'unknown';
  const result = run();
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
});
