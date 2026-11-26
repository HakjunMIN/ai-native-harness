import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { test } from 'node:test';
import { startLocalText } from '../scripts/intake.mjs';
import {
  loadAssociations,
  removeAssociation,
  saveAssociation
} from '../scripts/dashboard/associations.mjs';
import { loadDashboardSnapshot } from '../scripts/dashboard/snapshot.mjs';
import { loadRuns } from '../scripts/dashboard/runs.mjs';
import { projectRepo } from './helpers/run-fixture.mjs';

// Windows temp paths can carry 8.3 short names (RUNNER~1) that Git reports in long form.
const canonicalRepo = t => realpathSync.native(projectRepo(t).repo);

function runWorkspace(t) {
  const repo = canonicalRepo(t);
  const firstState = startLocalText('local-alpha', 'Implement the first synthetic feature.\n', repo);
  const secondState = startLocalText('local-beta', 'Implement the second synthetic feature.\n', repo);
  return { repo, firstState, secondState };
}

function homeDirectory(t) {
  const homeDir = mkdtempSync(join(tmpdir(), 'dashboard-data-home-'));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  return homeDir;
}

function configOptions(homeDir) {
  const configHome = join(homeDir, 'dashboard-config');
  return { homeDir, env: { AI_NATIVE_HARNESS_CONFIG_HOME: configHome }, configHome };
}

function writeCopilotSession(homeDir, { id, cwd, records = [] }) {
  const sessionDirectory = join(homeDir, '.copilot/session-state', id);
  mkdirSync(sessionDirectory, { recursive: true });
  const start = {
    type: 'session.start',
    id: `${id}-start`,
    timestamp: '2026-11-26T10:00:00.000Z',
    data: { sessionId: id, version: 1, startTime: '2026-11-26T10:00:00.000Z', context: { cwd } }
  };
  writeFileSync(join(sessionDirectory, 'events.jsonl'), [start, ...records].map(record => JSON.stringify(record)).join('\n') + '\n');
}

const assistantMessage = (id, at, content) => ({
  type: 'assistant.message', id, timestamp: at, data: { content }
});
const userMessage = (id, at, content) => ({
  type: 'user.message', id, timestamp: at, data: { content }
});
const toolCall = (id, at, toolName, args) => ({
  type: 'tool.execution_start', id, timestamp: at,
  data: { toolCallId: `${id}-call`, toolName, arguments: args }
});
const toolStart = (id, at, command) => toolCall(id, at, 'shell', { command });

test('loadRuns validates evidence and derives phase from gate state instead of the saved phase', async t => {
  const { repo, firstState } = runWorkspace(t);
  const state = JSON.parse(readFileSync(firstState, 'utf8'));
  state.phase = 'release';
  writeFileSync(firstState, JSON.stringify(state));

  const runs = await loadRuns(repo);
  const run = runs.find(candidate => candidate.id === 'local-alpha');
  assert.ok(run);
  assert.equal(run.valid, true);
  assert.equal(run.phase, 'discover');
  assert.equal(run.title, 'local-alpha');
  assert.equal(run.gates.find(gate => gate.id === 'G0').status, 'pending');
});

test('invalid evidence and malformed run state never produce passed gates', async t => {
  const { repo, firstState, secondState } = runWorkspace(t);
  const state = JSON.parse(readFileSync(firstState, 'utf8'));
  state.gates.G0 = { status: 'passed', evidence: [{ ...state.intake.request, sha256: '0'.repeat(64) }] };
  state.phase = 'discover';
  writeFileSync(firstState, JSON.stringify(state));
  writeFileSync(secondState, '{malformed state');

  const runs = await loadRuns(repo);
  for (const id of ['local-alpha', 'local-beta']) {
    const run = runs.find(candidate => candidate.id === id);
    assert.ok(run);
    assert.equal(run.valid, false);
    assert.ok(run.gates.every(gate => gate.status !== 'passed'));
    assert.ok(run.warnings.length > 0);
  }
});

test('invalid evidence cannot make a run appear complete', async t => {
  const { repo, firstState } = runWorkspace(t);
  const state = JSON.parse(readFileSync(firstState, 'utf8'));
  for (const gate of Object.values(state.gates)) gate.status = 'passed';
  state.gates.G0.evidence = [{ ...state.intake.request, sha256: '0'.repeat(64) }];
  writeFileSync(firstState, JSON.stringify(state));

  const run = (await loadRuns(repo)).find(candidate => candidate.id === 'local-alpha');
  assert.ok(run);
  assert.equal(run.valid, false);
  assert.equal(run.phase, 'unknown');
  assert.ok(run.gates.every(gate => gate.status !== 'passed'));
});

test('local association config is keyed by host and session, replaceable, removable, and private', async t => {
  const homeDir = homeDirectory(t);
  const options = configOptions(homeDir);
  await saveAssociation({
    ...options,
    host: 'copilot',
    sessionId: 'session-1',
    workspaceRoot: '/work/repo',
    runId: 'local-alpha'
  });
  await saveAssociation({
    ...options,
    host: 'copilot',
    sessionId: 'session-1',
    workspaceRoot: '/work/repo',
    runId: 'local-beta'
  });
  await saveAssociation({
    ...options,
    host: 'claude',
    sessionId: 'session-1',
    workspaceRoot: '/work/repo',
    runId: 'local-alpha'
  });

  const associations = await loadAssociations(options);
  assert.equal(associations.length, 2);
  assert.equal(associations.find(item => item.host === 'copilot').runId, 'local-beta');
  assert.equal(associations.find(item => item.host === 'claude').runId, 'local-alpha');
  const configPath = join(options.configHome, 'dashboard.json');
  if (process.platform !== 'win32') assert.equal(statSync(configPath).mode & 0o777, 0o600);

  await removeAssociation({ ...options, host: 'copilot', sessionId: 'session-1' });
  assert.deepEqual(await loadAssociations(options), [{
    host: 'claude', sessionId: 'session-1', workspaceRoot: resolve('/work/repo'), runId: 'local-alpha'
  }]);
});

test('unsupported association config versions fail visibly without overwriting the file', async t => {
  const homeDir = homeDirectory(t);
  const options = configOptions(homeDir);
  mkdirSync(options.configHome, { recursive: true });
  const configPath = join(options.configHome, 'dashboard.json');
  writeFileSync(configPath, JSON.stringify({ schemaVersion: 2, associations: [] }));

  await assert.rejects(loadAssociations(options), /unsupported.*schema/i);
  await assert.rejects(saveAssociation({
    ...options, host: 'copilot', sessionId: 'session-1', workspaceRoot: '/work/repo', runId: 'local-alpha'
  }), /unsupported.*schema/i);
  assert.equal(readFileSync(configPath, 'utf8'), '{"schemaVersion":2,"associations":[]}');
});

test('snapshot keeps concurrent runs distinct, links harness activity, applies overrides, and resolves questions', async t => {
  const { repo } = runWorkspace(t);
  const homeDir = homeDirectory(t);
  const options = configOptions(homeDir);
  writeCopilotSession(homeDir, {
    id: 'explicit-link',
    cwd: repo,
    records: [
      assistantMessage('explicit-question', '2026-11-26T10:01:00.000Z', 'Should I continue with docs/sdlc/local-alpha?'),
      toolStart('explicit-state', '2026-11-26T10:01:30.000Z',
        'node .ai-native-sdlc/scripts/state.mjs check docs/sdlc/local-alpha/state.json'),
      toolStart('explicit-tool', '2026-11-26T10:02:00.000Z', 'npm run test:api')
    ]
  });
  writeCopilotSession(homeDir, {
    id: 'unlinked',
    cwd: repo,
    records: [assistantMessage('unlinked-message', '2026-11-26T10:01:00.000Z', 'No run is referenced here.')]
  });
  writeCopilotSession(homeDir, {
    id: 'override',
    cwd: repo,
    records: [
      assistantMessage('override-link', '2026-11-26T10:01:00.000Z', 'This transcript mentions docs/sdlc/local-alpha.'),
      toolStart('override-tool', '2026-11-26T10:02:00.000Z', 'npm run test:e2e')
    ]
  });
  writeCopilotSession(homeDir, {
    id: 'answered-question',
    cwd: repo,
    records: [
      assistantMessage('answered-prompt', '2026-11-26T10:01:00.000Z', 'Which API should I test?'),
      userMessage('answer', '2026-11-26T10:02:00.000Z', 'Use the public API.')
    ]
  });

  await saveAssociation({
    ...options, host: 'copilot', sessionId: 'override', workspaceRoot: realpathSync.native(repo), runId: 'local-beta'
  });
  const snapshot = await loadDashboardSnapshot(options);
  assert.equal(snapshot.workspaces.length, 1);
  const workspace = snapshot.workspaces[0];
  assert.equal(workspace.id, realpathSync.native(repo));
  assert.equal(workspace.runs.length, 2);
  const sessions = new Map(workspace.sessions.map(session => [session.id, session]));
  assert.equal(sessions.get('explicit-link').runId, 'local-alpha');
  assert.equal(sessions.get('explicit-link').associationSource, 'activity');
  assert.equal(sessions.get('unlinked').runId, null);
  assert.equal(sessions.get('unlinked').associationSource, null);
  assert.equal(sessions.get('override').runId, 'local-beta');
  assert.equal(sessions.get('override').associationSource, 'override');
  assert.equal(sessions.get('explicit-link').pendingQuestions.length, 1);
  assert.equal(sessions.get('answered-question').pendingQuestions.length, 0);
  assert.ok(workspace.runs.find(run => run.id === 'local-alpha').events.some(event => event.command?.includes('api')));
  assert.ok(workspace.runs.find(run => run.id === 'local-beta').events.some(event => event.command?.includes('e2e')));
  assert.ok(workspace.sessions.every(session => !('transcriptPath' in session)));
});

test('messages and listings that name several runs do not block linking from harness tool activity', async t => {
  const { repo } = runWorkspace(t);
  const homeDir = homeDirectory(t);
  writeCopilotSession(homeDir, {
    id: 'listing',
    cwd: repo,
    records: [
      assistantMessage('listing-message', '2026-11-26T10:01:00.000Z',
        'I found docs/sdlc/local-alpha and docs/sdlc/local-beta in the request.'),
      toolStart('listing-ls', '2026-11-26T10:02:00.000Z', 'ls docs/sdlc/local-alpha docs/sdlc/local-beta'),
      toolStart('listing-state', '2026-11-26T10:03:00.000Z',
        'node .ai-native-sdlc/scripts/state.mjs check docs/sdlc/local-beta/state.json')
    ]
  });
  writeCopilotSession(homeDir, {
    id: 'message-only',
    cwd: repo,
    records: [assistantMessage('message-only-link', '2026-11-26T10:01:00.000Z', 'Continue docs/sdlc/local-alpha next.')]
  });
  const snapshot = await loadDashboardSnapshot({ homeDir, env: { AI_NATIVE_HARNESS_CONFIG_HOME: join(homeDir, 'config') } });
  const sessions = new Map(snapshot.workspaces[0].sessions.map(session => [session.id, session]));
  assert.equal(sessions.get('listing').runId, 'local-beta');
  assert.deepEqual(sessions.get('listing').runIds, ['local-beta']);
  assert.equal(sessions.get('listing').associationSource, 'activity');
  assert.deepEqual(sessions.get('listing').warnings, []);
  assert.equal(sessions.get('message-only').runId, null);
  assert.deepEqual(sessions.get('message-only').runIds, []);
});

test('a session that moves between runs links to the latest run and attributes activity to each run', async t => {
  const { repo } = runWorkspace(t);
  const homeDir = homeDirectory(t);
  const longPrefix = 'cd . && '.repeat(40);
  writeCopilotSession(homeDir, {
    id: 'moving',
    cwd: repo,
    records: [
      toolStart('early-test', '2026-11-26T10:01:00.000Z', 'npm test'),
      toolCall('alpha-plan', '2026-11-26T10:02:00.000Z', 'view', { path: join(repo, 'docs/sdlc/local-alpha/02-plan.md') }),
      toolStart('alpha-api', '2026-11-26T10:03:00.000Z', 'npm run test:api'),
      toolStart('beta-switch', '2026-11-26T10:04:00.000Z',
        `${longPrefix}node .ai-native-sdlc/scripts/harness.mjs status docs/sdlc/local-beta/state.json`),
      toolStart('beta-e2e', '2026-11-26T10:05:00.000Z', 'npm run test:e2e')
    ]
  });
  const snapshot = await loadDashboardSnapshot({ homeDir, env: { AI_NATIVE_HARNESS_CONFIG_HOME: join(homeDir, 'config') } });
  const workspace = snapshot.workspaces[0];
  const session = workspace.sessions.find(item => item.id === 'moving');
  assert.equal(session.runId, 'local-beta');
  assert.deepEqual(session.runIds, ['local-alpha', 'local-beta']);
  assert.equal(session.associationSource, 'activity');
  assert.equal(session.events.find(event => event.id === 'early-test').runId, null);
  const runEventIds = id => workspace.runs.find(run => run.id === id).events.map(event => event.id);
  assert.deepEqual(runEventIds('local-alpha'), ['alpha-plan', 'alpha-api']);
  assert.deepEqual(runEventIds('local-beta'), ['beta-switch', 'beta-e2e']);
});

test('repeated snapshot and session warnings are summarized once with a count', async t => {
  const { repo } = runWorkspace(t);
  const homeDir = homeDirectory(t);
  const plainDirectory = mkdtempSync(join(tmpdir(), 'dashboard-no-git-'));
  t.after(() => rmSync(plainDirectory, { recursive: true, force: true }));
  writeCopilotSession(homeDir, { id: 'no-git-1', cwd: plainDirectory });
  writeCopilotSession(homeDir, { id: 'no-git-2', cwd: plainDirectory });
  const future = id => ({ type: 'future.event', id, timestamp: '2026-11-26T10:01:00.000Z', data: {} });
  writeCopilotSession(homeDir, { id: 'noisy', cwd: repo, records: [future('future-1'), future('future-2')] });
  const snapshot = await loadDashboardSnapshot({ homeDir, env: { AI_NATIVE_HARNESS_CONFIG_HOME: join(homeDir, 'config') } });
  assert.deepEqual(snapshot.warnings.filter(warning => /Git workspace/.test(warning)),
    ['2 copilot sessions have no readable Git workspace.']);
  const noisy = snapshot.workspaces[0].sessions.find(session => session.id === 'noisy');
  assert.deepEqual(noisy.warnings, ['Unsupported Copilot transcript schema (×2)']);
});

test('sessions sharing a working directory resolve its Git workspace once per snapshot', {
  skip: process.platform === 'win32' && 'uses a POSIX git shim on PATH'
}, async t => {
  const { repo } = runWorkspace(t);
  const homeDir = homeDirectory(t);
  const plainDirectory = mkdtempSync(join(tmpdir(), 'dashboard-shared-plain-'));
  t.after(() => rmSync(plainDirectory, { recursive: true, force: true }));
  const source = join(repo, 'src');
  mkdirSync(source);
  for (const id of ['repo-1', 'repo-2', 'repo-3']) writeCopilotSession(homeDir, { id, cwd: source });
  for (const id of ['plain-1', 'plain-2']) writeCopilotSession(homeDir, { id, cwd: plainDirectory });

  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  const shimDirectory = mkdtempSync(join(tmpdir(), 'dashboard-git-shim-'));
  const log = join(shimDirectory, 'calls.log');
  writeFileSync(join(shimDirectory, 'git'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  const originalPath = process.env.PATH;
  process.env.PATH = `${shimDirectory}${delimiter}${originalPath}`;
  t.after(() => {
    process.env.PATH = originalPath;
    rmSync(shimDirectory, { recursive: true, force: true });
  });

  const snapshot = await loadDashboardSnapshot({ homeDir, env: { AI_NATIVE_HARNESS_CONFIG_HOME: join(homeDir, 'config') } });
  const calls = readFileSync(log, 'utf8').split('\n');
  const lookups = directory => calls.filter(line => line === `-C ${realpathSync.native(directory)} rev-parse --show-toplevel`).length;
  assert.equal(lookups(source), 1);
  assert.equal(lookups(plainDirectory), 1);
  assert.equal(snapshot.workspaces[0].sessions.length, 3);
});

test('sessions whose working directory differs only by letter case share one canonical workspace', async t => {
  const { repo } = runWorkspace(t);
  const homeDir = homeDirectory(t);
  const caseVariant = join(repo, '..', repo.split(/[\\/]/).at(-1).toUpperCase());
  try { realpathSync(caseVariant); } catch {
    t.skip('file system is case-sensitive');
    return;
  }
  writeCopilotSession(homeDir, { id: 'lower', cwd: repo });
  writeCopilotSession(homeDir, { id: 'upper', cwd: caseVariant });
  const snapshot = await loadDashboardSnapshot({ homeDir, env: { AI_NATIVE_HARNESS_CONFIG_HOME: join(homeDir, 'config') } });
  assert.deepEqual(snapshot.workspaces.map(workspace => workspace.id), [realpathSync.native(repo)]);
  assert.equal(snapshot.workspaces[0].sessions.length, 2);
});
