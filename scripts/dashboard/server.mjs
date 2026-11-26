import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDashboardSnapshot } from './snapshot.mjs';
import { removeAssociation, saveAssociation } from './associations.mjs';
import { isWithinDirectory } from './model.mjs';

const dashboardRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../dashboard');
const maxBodyBytes = 16 * 1024;
const contentSecurityPolicy = "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/assets/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/assets/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);
const hosts = new Set(['copilot', 'claude', 'codex']);

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': contentSecurityPolicy,
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

function parsedTarget(rawUrl) {
  const queryStart = rawUrl.indexOf('?');
  const rawPath = queryStart < 0 ? rawUrl : rawUrl.slice(0, queryStart);
  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    throw new Error('Malformed request path');
  }
  if (pathname.includes('\0') || pathname.split(/[\\/]/).includes('..')) {
    throw new Error('Invalid request path');
  }
  return {
    pathname,
    searchParams: new URLSearchParams(queryStart < 0 ? '' : rawUrl.slice(queryStart + 1))
  };
}

function sameOriginRequest(request, origin, expectedOrigin) {
  if (request.headers.host !== expectedOrigin.slice('http://'.length)) return false;
  return origin === undefined || origin === expectedOrigin;
}

async function readJson(request) {
  const length = request.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) {
    request.resume();
    return { status: 413 };
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      request.resume();
      return { status: 413 };
    }
    chunks.push(chunk);
  }
  try {
    return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { status: 400 };
  }
}

function validAssociationBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 3 && keys[0] === 'host' && keys[1] === 'runId' && keys[2] === 'sessionId' &&
    hosts.has(value.host) && typeof value.sessionId === 'string' && value.sessionId.trim().length > 0 &&
    value.sessionId.length <= 256 && typeof value.runId === 'string';
}

function findCurrentAssociation(snapshot, { host, sessionId, runId }) {
  for (const workspace of snapshot.workspaces) {
    const session = workspace.sessions.find(item => item.host === host && item.id === sessionId);
    if (!session) continue;
    const run = workspace.runs.find(item => item.id === runId);
    if (run) return workspace;
  }
  return null;
}

async function serveAsset(response, pathname, assetRoot) {
  const asset = assets.get(pathname);
  if (!asset) return false;
  try {
    const root = await realpath(assetRoot);
    const path = resolve(root, asset[0]);
    const target = await realpath(path);
    if (!isWithinDirectory(root, target) || !(await stat(target)).isFile()) {
      send(response, 403, 'Invalid asset path');
      return true;
    }
    send(response, 200, await readFile(target), asset[1]);
  } catch (error) {
    send(response, error.code === 'ENOENT' ? 404 : 500,
      error.code === 'ENOENT' ? 'Not found' : 'Unable to serve dashboard asset');
  }
  return true;
}

export function createDashboardHandler({
  homeDir = homedir(),
  env = process.env,
  assetRoot = dashboardRoot
} = {}) {
  return async (request, response) => {
    const port = request.socket.localPort;
    const expectedHost = `127.0.0.1:${port}`;
    const expectedOrigin = `http://${expectedHost}`;
    if (!sameOriginRequest(request, request.headers.origin, expectedOrigin)) {
      send(response, 403, 'Loopback origin required');
      return;
    }

    let target;
    try {
      target = parsedTarget(request.url ?? '/');
    } catch (error) {
      send(response, 400, error.message);
      return;
    }

    if (target.pathname === '/api/dashboard') {
      if (request.method !== 'GET') {
        send(response, 405, 'Method not allowed');
        return;
      }
      try {
        const snapshot = await loadDashboardSnapshot({ homeDir, env });
        send(response, 200, JSON.stringify(snapshot), 'application/json; charset=utf-8');
      } catch {
        send(response, 500, 'Unable to load dashboard snapshot');
      }
      return;
    }

    if (target.pathname === '/api/associations') {
      if (request.method === 'POST') {
        if (request.headers.origin !== expectedOrigin) {
          send(response, 403, 'Same-origin mutation required');
          return;
        }
        if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
          send(response, 415, 'JSON content type required');
          return;
        }
        const parsed = await readJson(request);
        if (parsed.status) {
          send(response, parsed.status, parsed.status === 413 ? 'Request body too large' : 'Invalid JSON body');
          return;
        }
        if (!validAssociationBody(parsed.value)) {
          send(response, 400, 'Invalid association');
          return;
        }
        try {
          const snapshot = await loadDashboardSnapshot({ homeDir, env });
          const workspace = findCurrentAssociation(snapshot, parsed.value);
          if (!workspace) {
            send(response, 409, 'Session and run must belong to the same current workspace');
            return;
          }
          await saveAssociation({
            homeDir,
            env,
            host: parsed.value.host,
            sessionId: parsed.value.sessionId,
            workspaceRoot: workspace.id,
            runId: parsed.value.runId
          });
          send(response, 200, JSON.stringify({
            host: parsed.value.host,
            sessionId: parsed.value.sessionId,
            runId: parsed.value.runId
          }), 'application/json; charset=utf-8');
        } catch {
          send(response, 500, 'Unable to save dashboard association');
        }
        return;
      }
      if (request.method === 'DELETE') {
        if (request.headers.origin !== expectedOrigin) {
          send(response, 403, 'Same-origin mutation required');
          return;
        }
        const host = target.searchParams.get('host');
        const sessionId = target.searchParams.get('sessionId');
        if (target.searchParams.size !== 2 || !hosts.has(host) ||
            typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 256) {
          send(response, 400, 'Invalid association identity');
          return;
        }
        try {
          await removeAssociation({ homeDir, env, host, sessionId });
          send(response, 200, JSON.stringify({ removed: true }), 'application/json; charset=utf-8');
        } catch {
          send(response, 500, 'Unable to remove dashboard association');
        }
        return;
      }
      send(response, 405, 'Method not allowed');
      return;
    }

    if (target.pathname.startsWith('/api/')) {
      send(response, 404, 'Not found');
      return;
    }
    if (request.method !== 'GET') {
      send(response, 405, 'Method not allowed');
      return;
    }
    if (!await serveAsset(response, target.pathname, assetRoot)) {
      send(response, 404, 'Not found');
    }
  };
}

export async function startDashboardServer({ port = 0, homeDir = homedir(), env = process.env } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('port must be an integer from 0 to 65535');
  const server = createServer(createDashboardHandler({ homeDir, env }));
  await new Promise((resolveListen, rejectListen) => {
    const onError = error => {
      server.removeListener('listening', onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolveListen();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
  return server;
}
