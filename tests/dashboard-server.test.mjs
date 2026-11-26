import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { startLocalText } from '../scripts/intake.mjs';
import { startDashboardServer } from '../scripts/dashboard/server.mjs';
import { projectRepo } from './helpers/run-fixture.mjs';

// Windows temp paths can carry 8.3 short names (RUNNER~1) that Git reports in long form.
const canonicalRepo = (t, options) => realpathSync.native(projectRepo(t, options).repo);

function temporaryDirectory(t, prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeCopilotSession(homeDir, cwd) {
  const directory = join(homeDir, '.copilot/session-state/session-1');
  mkdirSync(directory, { recursive: true });
  const records = [
    {
      type: 'session.start',
      id: 'start',
      timestamp: '2026-11-26T10:00:00.000Z',
      data: { sessionId: 'session-1', version: 1, startTime: '2026-11-26T10:00:00.000Z', context: { cwd } }
    },
    {
      type: 'tool.execution_start',
      id: 'run-reference',
      timestamp: '2026-11-26T10:01:00.000Z',
      data: {
        toolCallId: 'run-reference-call',
        toolName: 'shell',
        arguments: { command: 'node scripts/state.mjs check docs/sdlc/local-alpha/state.json' }
      }
    }
  ];
  writeFileSync(join(directory, 'events.jsonl'), `${records.map(record => JSON.stringify(record)).join('\n')}\n`);
}

async function dashboardFixture(t) {
  const repo = canonicalRepo(t);
  const runStatePath = startLocalText('local-alpha', 'Implement the synthetic dashboard feature.\n', repo);
  startLocalText('local-beta', 'Implement the second synthetic dashboard feature.\n', repo);
  const remoteRepo = canonicalRepo(t, { name: 'remote-repo' });
  startLocalText('local-remote', 'Run outside the session workspace.\n', remoteRepo);
  const homeDir = temporaryDirectory(t, 'dashboard-server-home-');
  const env = { AI_NATIVE_HARNESS_CONFIG_HOME: join(homeDir, 'config') };
  writeCopilotSession(homeDir, repo);
  const transcriptPath = join(homeDir, '.copilot/session-state/session-1/events.jsonl');
  const sourceBytes = [readFileSync(runStatePath), readFileSync(transcriptPath)];
  const server = await startDashboardServer({ port: 0, homeDir, env });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return {
    server, homeDir, env, runStatePath, transcriptPath, sourceBytes
  };
}

function request(server, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port: server.address().port,
      method,
      path,
      headers
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function sameOrigin(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

function postAssociation(server, runId) {
  const body = JSON.stringify({ host: 'copilot', sessionId: 'session-1', runId });
  return request(server, {
    method: 'POST',
    path: '/api/associations',
    headers: {
      Origin: sameOrigin(server),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    },
    body
  });
}

test('server binds to loopback and returns a no-store snapshot without transcript paths', async t => {
  const { server } = await dashboardFixture(t);
  assert.equal(server.address().address, '127.0.0.1');

  const response = await request(server, {
    path: '/api/dashboard',
    headers: { Host: `127.0.0.1:${server.address().port}` }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.headers['content-type'], /^application\/json/);
  assert.match(response.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.doesNotMatch(response.body, /transcriptPath|events\.jsonl|\/Users\//);
  const snapshot = JSON.parse(response.body);
  assert.equal(snapshot.workspaces[0].sessions[0].runId, 'local-alpha');
});

test('same-origin association routes add, update, and remove only the selected run mapping', async t => {
  const { server, homeDir, env, runStatePath, transcriptPath, sourceBytes } = await dashboardFixture(t);
  assert.equal((await postAssociation(server, 'local-alpha')).status, 200);
  assert.equal((await postAssociation(server, 'local-beta')).status, 200);

  const invalidRun = await postAssociation(server, 'local-remote');
  assert.equal(invalidRun.status, 409);
  const saved = await request(server, { path: '/api/dashboard' });
  assert.equal(JSON.parse(saved.body).workspaces[0].sessions[0].runId, 'local-beta');

  const removed = await request(server, {
    method: 'DELETE',
    path: '/api/associations?host=copilot&sessionId=session-1',
    headers: { Origin: sameOrigin(server) }
  });
  assert.equal(removed.status, 200);
  const afterRemoval = await request(server, { path: '/api/dashboard' });
  assert.equal(JSON.parse(afterRemoval.body).workspaces[0].sessions[0].runId, 'local-alpha');
  assert.equal(env.AI_NATIVE_HARNESS_CONFIG_HOME, join(homeDir, 'config'));
  assert.deepEqual(readFileSync(runStatePath), sourceBytes[0]);
  assert.deepEqual(readFileSync(transcriptPath), sourceBytes[1]);
});

test('rejects hostile hosts and origins, missing mutation origins, and wrong content types', async t => {
  const { server } = await dashboardFixture(t);
  const hostileHost = await request(server, {
    path: '/api/dashboard',
    headers: { Host: 'attacker.example' }
  });
  assert.equal(hostileHost.status, 403);

  const hostileOrigin = await request(server, {
    path: '/api/dashboard',
    headers: { Origin: 'http://attacker.example' }
  });
  assert.equal(hostileOrigin.status, 403);

  const missingOrigin = await request(server, {
    method: 'POST',
    path: '/api/associations',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: 'copilot', sessionId: 'session-1', runId: 'local-alpha' })
  });
  assert.equal(missingOrigin.status, 403);

  const wrongContentType = await request(server, {
    method: 'POST',
    path: '/api/associations',
    headers: { Origin: sameOrigin(server), 'Content-Type': 'text/plain' },
    body: '{}'
  });
  assert.equal(wrongContentType.status, 415);
});

test('bounds association request bodies and rejects unknown routes and methods', async t => {
  const { server } = await dashboardFixture(t);
  const body = 'x'.repeat(16 * 1024 + 1);
  const oversized = await request(server, {
    method: 'POST',
    path: '/api/associations',
    headers: {
      Origin: sameOrigin(server),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    },
    body
  });
  assert.equal(oversized.status, 413);
  const chunkedOversized = await request(server, {
    method: 'POST',
    path: '/api/associations',
    headers: { Origin: sameOrigin(server), 'Content-Type': 'application/json' },
    body
  });
  assert.equal(chunkedOversized.status, 413);

  assert.equal((await request(server, { path: '/api/not-a-route' })).status, 404);
  assert.equal((await request(server, { method: 'POST', path: '/api/dashboard' })).status, 405);
});

test('rejects encoded traversal and symlink escapes from the static asset root', async t => {
  const { server } = await dashboardFixture(t);
  const traversal = await request(server, { path: '/%2e%2e/package.json' });
  assert.ok([400, 403, 404].includes(traversal.status));

  const assetRoot = temporaryDirectory(t, 'dashboard-assets-');
  const outsideRoot = temporaryDirectory(t, 'dashboard-outside-');
  mkdirSync(join(assetRoot, 'assets'));
  writeFileSync(join(assetRoot, 'index.html'), 'safe');
  writeFileSync(join(outsideRoot, 'app.js'), 'sensitive');
  symlinkSync(join(outsideRoot, 'app.js'), join(assetRoot, 'assets/app.js'));

  const handlerModule = await import('../scripts/dashboard/server.mjs');
  const assetServer = createServer(handlerModule.createDashboardHandler({ assetRoot }));
  await new Promise(resolve => assetServer.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => assetServer.close(resolve)));
  const escapedAsset = await request(assetServer, { path: '/assets/app.js' });
  assert.ok(escapedAsset.status >= 400);
  assert.doesNotMatch(escapedAsset.body, /sensitive/);
});

test('CLI validates its port and prints the allocated loopback URL before closing on SIGTERM', async t => {
  const script = fileURLToPath(new URL('../scripts/dashboard.mjs', import.meta.url));
  const invalidPort = spawnSync(process.execPath, [script, '--port', '65536'], { encoding: 'utf8' });
  assert.notEqual(invalidPort.status, 0);
  assert.match(invalidPort.stderr, /port/i);

  const child = spawn(process.execPath, [script, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CLI did not print its URL: ${output}`)), 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', code => {
      if (!output.includes('http://127.0.0.1:')) {
        clearTimeout(timeout);
        reject(new Error(`CLI exited before printing its URL (${code}): ${output}`));
      }
    });
  });
  const url = await ready;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  child.kill('SIGTERM');
  const exit = await exited;
  // Windows has no POSIX signal delivery: kill() terminates the process without running handlers.
  if (process.platform === 'win32') assert.ok(exit.code !== null || exit.signal !== null);
  else assert.deepEqual(exit, { code: 0, signal: null });
});

test('CLI closes cleanly on a SIGTERM that arrives as soon as it prints its URL', { skip: process.platform === 'win32' && 'Windows has no POSIX signal handlers' }, t => {
  const directory = mkdtempSync(join(tmpdir(), 'dashboard-signal-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const preload = join(directory, 'signal-on-url.mjs');
  writeFileSync(preload, `const write = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => {
  const result = write(chunk, ...rest);
  if (String(chunk).includes('http://127.0.0.1:')) process.kill(process.pid, 'SIGTERM');
  return result;
};
`);
  const script = fileURLToPath(new URL('../scripts/dashboard.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, script, '--port', '0'], {
    encoding: 'utf8',
    timeout: 10000
  });
  assert.match(result.stdout, /^http:\/\/127\.0\.0\.1:\d+$/m);
  assert.deepEqual({ status: result.status, signal: result.signal }, { status: 0, signal: null }, result.stderr);
});
