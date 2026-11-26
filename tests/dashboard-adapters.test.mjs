import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { discoverSessions as discoverCopilot, readEvents as readCopilot } from '../scripts/dashboard/adapters/copilot.mjs';
import { discoverSessions as discoverClaude, readEvents as readClaude } from '../scripts/dashboard/adapters/claude.mjs';
import { discoverSessions as discoverCodex, readEvents as readCodex } from '../scripts/dashboard/adapters/codex.mjs';
import { MAX_TRANSCRIPT_BYTES } from '../scripts/dashboard/model.mjs';

const fixtures = resolve('tests/fixtures/dashboard');

function homeFixture(t, host) {
  const homeDir = mkdtempSync(join(tmpdir(), `dashboard-${host}-`));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  cpSync(join(fixtures, host), homeDir, { recursive: true });
  return homeDir;
}

const hosts = [
  { name: 'Copilot CLI', directory: 'copilot', discover: discoverCopilot, read: readCopilot, id: 'copilot-session' },
  { name: 'Claude Code', directory: 'claude', discover: discoverClaude, read: readClaude, id: 'claude-session' },
  { name: 'Codex CLI', directory: 'codex', discover: discoverCodex, read: readCodex, id: '11111111-2222-4333-8444-555555555555' }
];

for (const host of hosts) {
  test(`${host.name} sessions expose workspace metadata and normalized events`, async t => {
    const homeDir = homeFixture(t, host.directory);
    const sessions = await host.discover({ homeDir });
    assert.equal(sessions.length, 1);
    const [session] = sessions;
    assert.equal(session.id, host.id);
    assert.equal(session.cwd, `/tmp/dashboard-fixture/${host.directory}`);
    assert.equal(session.host, host.directory);
    assert.ok(session.startedAt);
    assert.ok(session.updatedAt);
    assert.ok(realpathSync.native(session.transcriptPath).startsWith(realpathSync.native(homeDir)));

    const events = await host.read(session, { maxBytes: 1024 * 1024 });
    assert.ok(events.some(event => event.actor === 'user' && event.kind === 'question'));
    assert.ok(events.some(event => event.actor === 'assistant' && event.kind === 'message'));
    assert.ok(events.some(event => event.actor === 'tool' && event.kind === 'tool'));
    assert.ok(events.some(event => event.kind === 'skill' && event.label.includes('test-driven-development')));
    assert.ok(events.some(event => event.kind === 'skill' && event.label.includes('cross-review')));
    if (host.directory === 'copilot') assert.ok(events.some(event => event.kind === 'approval' && event.outcome === 'unknown'));
    assert.ok(events.every(event => event.source === host.directory));
    assert.ok(events.every(event => event.excerpt.length <= 240));
    assert.ok(events.some(event => event.command?.includes('api')));
    assert.ok(events.some(event => event.command?.includes('e2e')));
    if (host.directory === 'copilot') {
      assert.ok(events.some(event => event.command?.includes('api') && event.outcome === 'passed'));
      assert.ok(events.some(event => event.command?.includes('e2e') && event.outcome === 'passed'));
    }
  });
}

test('missing optional event fields are normalized to null', async t => {
  const homeDir = homeFixture(t, 'copilot');
  const [session] = await discoverCopilot({ homeDir });
  const events = await readCopilot(session, { maxBytes: 1024 * 1024 });
  const event = events.find(candidate => candidate.actor === 'user');
  assert.equal(event.command, null);
  assert.equal(event.outcome, 'none');
  assert.equal(event.runId, null);
  assert.deepEqual(event.relatedTo, []);
});

test('newest sessions are capped and the returned collection reports omissions', async t => {
  const homeDir = mkdtempSync(join(tmpdir(), 'dashboard-copilot-cap-'));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const sessionsRoot = join(homeDir, '.copilot/session-state');
  for (const [id, timestamp] of [['old', '2026-01-01T00:00:00.000Z'], ['new', '2026-02-01T00:00:00.000Z']]) {
    const directory = join(sessionsRoot, id);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'events.jsonl'), `${JSON.stringify({
      type: 'session.start',
      data: { sessionId: id, startTime: timestamp, context: { cwd: `/tmp/${id}` } },
      timestamp
    })}\n`);
  }
  const sessions = await discoverCopilot({ homeDir, maxSessions: 1 });
  assert.deepEqual(sessions.map(session => session.id), ['new']);
  assert.match(sessions.warnings.join(' '), /omitted 1 older session/i);
});

test('unsupported Copilot event log versions are refused with a safe warning', async t => {
  const homeDir = mkdtempSync(join(tmpdir(), 'dashboard-copilot-version-'));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const directory = join(homeDir, '.copilot/session-state/unsupported-session');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'events.jsonl'), `${JSON.stringify({
    type: 'session.start',
    data: { sessionId: 'unsupported-session', version: 2, startTime: '2026-11-26T10:00:00.000Z', context: { cwd: '/tmp/workspace' } },
    timestamp: '2026-11-26T10:00:00.000Z'
  })}\n`);
  const sessions = await discoverCopilot({ homeDir });
  assert.equal(sessions.length, 0);
  assert.match(sessions.warnings.join(' '), /unsupported.*version/i);
});

test('a malformed trailing JSONL record preserves earlier events and reports a warning', async t => {
  const homeDir = homeFixture(t, 'copilot');
  const [session] = await discoverCopilot({ homeDir });
  writeFileSync(session.transcriptPath, `${JSON.stringify({
    type: 'user.message', data: { content: 'valid earlier event' }, timestamp: '2026-11-26T10:00:00.000Z', id: 'valid'
  })}\n{"type":"assistant.message","data":{"content":"partial secret`);
  const events = await readCopilot(session, { maxBytes: 1024 * 1024 });
  assert.ok(events.some(event => event.id === 'valid'));
  assert.match(events.warnings.join(' '), /malformed trailing/i);
  assert.doesNotMatch(events.warnings.join(' '), /partial secret/);
});

test('compressed Codex rollouts are reported as unsupported instead of silently skipped', async t => {
  const homeDir = homeFixture(t, 'codex');
  const [session] = await discoverCodex({ homeDir });
  writeFileSync(join(dirname(session.transcriptPath), 'rollout-2026-11-26T10-30-00-compressed.jsonl.zst'), 'compressed fixture');
  const sessions = await discoverCodex({ homeDir });
  assert.equal(sessions.length, 1);
  assert.match(sessions.warnings.join(' '), /compressed.*not supported/i);
});

test('Codex archived rollouts are discoverable and their events remain readable', async t => {
  const homeDir = homeFixture(t, 'codex');
  const [activeSession] = await discoverCodex({ homeDir });
  const archivedDirectory = join(homeDir, '.codex/archived_sessions/2026/11/26');
  mkdirSync(archivedDirectory, { recursive: true });
  const archivedPath = join(archivedDirectory, 'rollout-2026-11-26T10-00-00-11111111-2222-4333-8444-555555555555.jsonl');
  writeFileSync(archivedPath, readFileSync(activeSession.transcriptPath));
  const sessions = await discoverCodex({ homeDir });
  assert.equal(sessions.length, 2);
  const archivedSession = sessions.find(session => session.transcriptPath.includes('archived_sessions'));
  assert.ok(archivedSession);
  const events = await readCodex(archivedSession, { maxBytes: 1024 * 1024 });
  assert.ok(events.some(event => event.actor === 'user'));
});

test('Codex rollouts expose SKILL.md reads, paired command outcomes, and only human conversation', async t => {
  const homeDir = homeFixture(t, 'codex');
  const [fixtureSession] = await discoverCodex({ homeDir });
  const lines = readFileSync(fixtureSession.transcriptPath, 'utf8').split('\n');
  const meta = JSON.parse(lines[0]);
  meta.payload.base_instructions = { text: 'x'.repeat(70 * 1024) };
  writeFileSync(fixtureSession.transcriptPath, [JSON.stringify(meta), ...lines.slice(1)].join('\n'));

  const sessions = await discoverCodex({ homeDir });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].cwd, '/tmp/dashboard-fixture/codex');
  const events = await readCodex(sessions[0], { maxBytes: 1024 * 1024 });
  assert.deepEqual(events.filter(event => event.kind === 'skill' && event.relatedTo.length === 0).map(event => event.label),
    ['test-driven-development', 'cross-review']);
  const outcomes = events.filter(event => event.relatedTo.length && event.command)
    .map(event => [event.command, event.outcome]);
  assert.deepEqual(outcomes, [
    ["sed -n '1,200p' /home/fixture/.agents/skills/test-driven-development/SKILL.md", 'passed'],
    ['npm run test:api', 'passed'],
    ['npm run test:e2e', 'failed']
  ]);
  assert.deepEqual(events.filter(event => event.actor === 'user').map(event => event.label),
    ['Can you run TDD, cross-review, API tests, and E2E tests?']);
  assert.ok(events.every(event => !event.label.includes('developer instructions')));
  assert.deepEqual(events.warnings, []);
});

test('Codex SKILL.md reads from Windows PowerShell and wrapped shells are recognized', async t => {
  const homeDir = homeFixture(t, 'codex');
  const [fixtureSession] = await discoverCodex({ homeDir });
  const [meta] = readFileSync(fixtureSession.transcriptPath, 'utf8').split('\n');
  const call = (ordinal, name, args) => JSON.stringify({
    timestamp: `2026-11-26T11:00:0${ordinal}.000Z`, ordinal, type: 'response_item',
    payload: { type: 'function_call', id: `fc-win-${ordinal}`, name, arguments: JSON.stringify(args), call_id: `call-win-${ordinal}` }
  });
  writeFileSync(fixtureSession.transcriptPath, [
    meta,
    call(1, 'exec_command', { cmd: 'Get-Content -Raw C:\\Users\\dev\\.agents\\skills\\brainstorming\\SKILL.md' }),
    call(2, 'exec_command', { cmd: 'gc .\\skills\\writing-plans\\SKILL.md -TotalCount 120' }),
    call(3, 'exec_command', { cmd: 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "type skills\\verification-before-completion\\SKILL.md"' }),
    call(4, 'shell', { command: ['pwsh', '-NoLogo', '-Command', 'Get-Content skills/tdd/SKILL.md'] }),
    call(5, 'shell', { command: ['bash', '-lc', "sed -n '1,80p' skills/grilling/SKILL.md"] }),
    call(6, 'exec_command', { cmd: "Set-Content skills\\tdd\\SKILL.md 'draft'; Copy-Item skills\\tdd\\SKILL.md backup.md" })
  ].join('\n') + '\n');

  const [session] = await discoverCodex({ homeDir });
  const events = await readCodex(session, { maxBytes: 1024 * 1024 });
  assert.deepEqual(events.filter(event => event.kind === 'skill').map(event => event.label),
    ['brainstorming', 'writing-plans', 'verification-before-completion', 'tdd', 'grilling']);
});

test('Claude tool results are paired with their tool use and inherit its command', async t => {
  const homeDir = homeFixture(t, 'claude');
  const [session] = await discoverClaude({ homeDir });
  const events = await readClaude(session, { maxBytes: 1024 * 1024 });
  assert.deepEqual(events.filter(event => event.relatedTo.length).map(event => [event.command, event.relatedTo]), [
    ['npm run test:api', ['call-1']],
    ['npm run test:e2e', ['call-2']]
  ]);
});

test('Copilot bookkeeping records and session directories without transcripts produce no warnings', async t => {
  const homeDir = homeFixture(t, 'copilot');
  mkdirSync(join(homeDir, '.copilot/session-state/checkpoint-only'), { recursive: true });
  writeFileSync(join(homeDir, '.copilot/session-state/checkpoint-only/workspace.yaml'), 'cwd: /tmp\n');
  const sessions = await discoverCopilot({ homeDir });
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions.warnings, []);

  const bookkeeping = ['hook.start', 'assistant.turn_start', 'session.usage_record', 'skill.invoked', 'subagent.started',
    'model.response', 'system.message', 'external_tool.requested', 'abort']
    .map((type, index) => JSON.stringify({ type, id: `bookkeeping-${index}`, timestamp: '2026-11-26T10:30:00.000Z', data: {} }));
  writeFileSync(sessions[0].transcriptPath, `${readFileSync(sessions[0].transcriptPath, 'utf8')}${bookkeeping.join('\n')}\n`);
  const events = await readCopilot(sessions[0], { maxBytes: 1024 * 1024 });
  assert.deepEqual(events.warnings, []);
});

test('unsupported schemas and transcript paths outside the host store fail without exposing contents', async t => {
  const homeDir = homeFixture(t, 'copilot');
  const [session] = await discoverCopilot({ homeDir });
  writeFileSync(session.transcriptPath, `${JSON.stringify({ type: 'future.event', data: { content: 'private fixture text' } })}\n`);
  const events = await readCopilot(session, { maxBytes: 1024 });
  assert.match(events.warnings.join(' '), /unsupported/i);
  assert.doesNotMatch(events.warnings.join(' '), /private fixture text/);

  const outsidePath = join(tmpdir(), 'dashboard-outside-transcript.jsonl');
  writeFileSync(outsidePath, 'private outside content');
  t.after(() => rmSync(outsidePath, { force: true }));
  const escapedSession = { ...session, transcriptPath: outsidePath };
  await assert.rejects(readCopilot(escapedSession, { maxBytes: 1024 }), error => {
    assert.match(error.message, /outside|invalid/i);
    assert.doesNotMatch(error.message, /private outside content/);
    return true;
  });
});

test('transcript reads are bounded and report when the first record was truncated', async t => {
  const homeDir = homeFixture(t, 'copilot');
  const [session] = await discoverCopilot({ homeDir });
  const largeRecord = JSON.stringify({
    type: 'assistant.message',
    id: 'oversized',
    timestamp: '2026-11-26T10:00:00.000Z',
    data: { content: 'x'.repeat(MAX_TRANSCRIPT_BYTES + 512) }
  });
  writeFileSync(session.transcriptPath, `${largeRecord}\n${JSON.stringify({
    type: 'user.message', id: 'tail', timestamp: '2026-11-26T10:01:00.000Z', data: { content: 'tail' }
  })}\n`);
  const events = await readCopilot(session, { maxBytes: MAX_TRANSCRIPT_BYTES });
  assert.ok(events.every(event => event.id !== 'oversized'));
  assert.ok(events.warnings.some(warning => /truncated/i.test(warning)));
});

test('a symlinked transcript outside the host store is rejected before reading', async t => {
  const homeDir = homeFixture(t, 'copilot');
  const [session] = await discoverCopilot({ homeDir });
  const external = join(tmpdir(), 'dashboard-external-source.jsonl');
  writeFileSync(external, 'sensitive fixture');
  t.after(() => rmSync(external, { force: true }));
  const linkPath = join(dirname(session.transcriptPath), 'linked.jsonl');
  symlinkSync(external, linkPath, process.platform === 'win32' ? 'file' : undefined);
  await assert.rejects(readCopilot({ ...session, transcriptPath: linkPath }, { maxBytes: 1024 }), /outside|invalid/i);
});

test('host store symlinks that escape home are reported without scanning the target', async t => {
  for (const host of hosts) {
    const homeDir = mkdtempSync(join(tmpdir(), `dashboard-${host.directory}-home-`));
    const outsideDir = mkdtempSync(join(tmpdir(), `dashboard-${host.directory}-outside-`));
    t.after(() => rmSync(homeDir, { recursive: true, force: true }));
    t.after(() => rmSync(outsideDir, { recursive: true, force: true }));
    const store = host.directory === 'copilot' ? '.copilot/session-state'
      : host.directory === 'claude' ? '.claude/projects' : '.codex/sessions';
    const storePath = join(homeDir, store);
    mkdirSync(dirname(storePath), { recursive: true });
    symlinkSync(outsideDir, storePath, process.platform === 'win32' ? 'junction' : undefined);
    const sessions = await host.discover({ homeDir });
    assert.equal(sessions.length, 0, host.name);
    assert.match(sessions.warnings.join(' '), /outside|invalid|unsupported/i, host.name);
  }
});
