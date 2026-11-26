import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadAssociations } from './associations.mjs';
import { discoverSessions as discoverClaude, readEvents as readClaude } from './adapters/claude.mjs';
import { discoverSessions as discoverCodex, readEvents as readCodex } from './adapters/codex.mjs';
import { discoverSessions as discoverCopilot, readEvents as readCopilot } from './adapters/copilot.mjs';
import { loadRuns } from './runs.mjs';

const adapters = [
  { host: 'copilot', discover: discoverCopilot, read: readCopilot },
  { host: 'claude', discover: discoverClaude, read: readClaude },
  { host: 'codex', discover: discoverCodex, read: readCodex }
];

function gitRoot(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) return null;
  let directory;
  try { directory = realpathSync.native(cwd); } catch { return null; }
  const result = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8', timeout: 3000
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) return null;
  try { return realpathSync.native(result.stdout.trim()); } catch { return null; }
}

function attributeRuns(events, runIds) {
  const touched = [];
  let current = null;
  const owners = events.map(event => {
    const refs = (event.runRefs ?? []).filter(id => runIds.has(id));
    if (refs.length === 1) current = refs[0];
    if (current && !touched.includes(current)) touched.push(current);
    return current;
  });
  return { owners, runIds: touched };
}

function summarizeWarnings(warnings) {
  const counts = new Map();
  for (const warning of warnings) counts.set(warning, (counts.get(warning) ?? 0) + 1);
  return [...counts].map(([warning, count]) => count > 1 ? `${warning} (×${count})` : warning);
}

function questionEvents(events) {
  return events.filter((event, index) => event.kind === 'question' && event.actor === 'assistant' &&
    !events.slice(index + 1).some(later => later.actor === 'user'));
}

function lastActivity(events, fallback) {
  return events.reduce((latest, event) => {
    const at = typeof event.at === 'string' && !Number.isNaN(Date.parse(event.at)) ? event.at : null;
    return at && (!latest || Date.parse(at) > Date.parse(latest)) ? at : latest;
  }, fallback ?? null);
}

export async function loadDashboardSnapshot({ homeDir = homedir(), env = process.env, maxBytes } = {}) {
  const warnings = [];
  let associations = [];
  try {
    associations = await loadAssociations({ homeDir, env });
  } catch (error) {
    warnings.push(error.message);
  }

  const discovered = [];
  for (const adapter of adapters) {
    try {
      const sessions = await adapter.discover({ homeDir });
      for (const warning of sessions.warnings ?? []) warnings.push(`${adapter.host}: ${warning}`);
      if (!sessions.length) warnings.push(`No local ${adapter.host} sessions were found.`);
      discovered.push(...sessions.map(session => ({ adapter, session })));
    } catch {
      warnings.push(`${adapter.host}: local sessions could not be discovered.`);
    }
  }

  const workspaces = new Map();
  const runCache = new Map();
  const rootCache = new Map();
  const withoutGit = new Map();
  const runlessRoots = new Set();
  for (const { adapter, session } of discovered) {
    if (!rootCache.has(session.cwd)) rootCache.set(session.cwd, gitRoot(session.cwd));
    const root = rootCache.get(session.cwd);
    if (!root) {
      withoutGit.set(adapter.host, (withoutGit.get(adapter.host) ?? 0) + 1);
      continue;
    }
    if (!runCache.has(root)) {
      try { runCache.set(root, await loadRuns(root)); }
      catch { runCache.set(root, []); }
    }
    const runs = runCache.get(root);
    if (!runs.length) {
      if (!runlessRoots.has(root)) warnings.push(`No harness runs were found for workspace ${root}.`);
      runlessRoots.add(root);
      continue;
    }
    let workspace = workspaces.get(root);
    if (!workspace) {
      workspace = { id: root, path: session.cwd, sessions: [], runs };
      workspaces.set(root, workspace);
    }

    const sessionWarnings = [];
    let events = [];
    try {
      events = await adapter.read(session, { maxBytes });
      sessionWarnings.push(...(events.warnings ?? []));
    } catch {
      sessionWarnings.push('Session events could not be read from the supported host source.');
    }
    const association = associations.find(item => item.host === adapter.host && item.sessionId === session.id);
    const runIds = new Set(runs.map(run => run.id));
    let runId = null;
    let touchedRunIds = [];
    let associationSource = null;
    if (association && association.workspaceRoot === root && runIds.has(association.runId)) {
      runId = association.runId;
      touchedRunIds = [runId];
      associationSource = 'override';
      for (const event of events) event.runId = runId;
    } else {
      if (association) sessionWarnings.push('Saved session-to-run association is stale or points to a different workspace.');
      const attribution = attributeRuns(events, runIds);
      events.forEach((event, index) => { event.runId = attribution.owners[index]; });
      touchedRunIds = attribution.runIds;
      runId = touchedRunIds.at(-1) ?? null;
      associationSource = runId ? 'activity' : null;
    }
    const questions = questionEvents(events);
    workspace.sessions.push({
      host: adapter.host,
      id: session.id,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      lastActivityAt: lastActivity(events, session.updatedAt),
      runId,
      runIds: touchedRunIds,
      associationSource,
      events,
      pendingQuestions: questions,
      warnings: summarizeWarnings(sessionWarnings)
    });
  }
  for (const [host, count] of withoutGit) {
    warnings.push(`${count} ${host} session${count === 1 ? ' has' : 's have'} no readable Git workspace.`);
  }

  for (const workspace of workspaces.values()) {
    for (const run of workspace.runs) {
      run.events = workspace.sessions
        .flatMap(session => session.events.filter(event => event.runId === run.id &&
          (event.kind === 'skill' || event.kind === 'tool')));
    }
  }
  return { workspaces: [...workspaces.values()], warnings: summarizeWarnings(warnings) };
}
