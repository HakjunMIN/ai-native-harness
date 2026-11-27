import { readFileSync, writeFileSync, renameSync, realpathSync, lstatSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dispatchPinned } from './harness.mjs';
import { addWorktree, discardWorktree, integrationBranch as runBranchName, listRuns, mainWorktree,
  requireIgnoredWorkspace, runWorktreePath, sliceWorktreePath, worktrees } from './run-workspace.mjs';

const git = (repo, ...args) => execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
const overlaps = (first, second) => first === second || first.startsWith(`${second}/`) || second.startsWith(`${first}/`);
const exists = path => { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };

function scopesFor(file, ready, repo) {
  if (!file) return null;
  const scopes = JSON.parse(readFileSync(resolve(file),'utf8'));
  if (!scopes || typeof scopes !== 'object' || Array.isArray(scopes)) throw new Error('scope file must map ticket IDs to edit paths');
  const result = new Map();
  for (const {id} of ready) {
    const paths = scopes[id];
    if (!Array.isArray(paths) || !paths.length) throw new Error(`scope ${id}: nonempty exact files/directories required`);
    for (const path of paths) {
      if (typeof path !== 'string' || path.startsWith('/') || path.includes('\\') ||
          path.split('/').some(part => !part || part === '.' || part === '..' || /[*?[\]]/.test(part))) throw new Error(`scope ${id}: use safe repo-relative paths without globs`);
      if (overlaps(path,'docs/sdlc') || overlaps(path,'.git')) throw new Error(`scope ${id}: shared docs/sdlc and .git cannot be assigned`);
      let current = repo;
      for (const part of path.split('/')) {
        current = join(current,part);
        if (!exists(current)) break;
        if (lstatSync(current).isSymbolicLink()) throw new Error(`scope ${id}: symlink alias is not a safe edit path`);
      }
    }
    result.set(id,paths);
  }
  return result;
}

export function planWorkspaces(state, ready, scopes) {
  const active = state.slices.filter(slice => slice.status === 'in_progress');
  if (active.some(slice => !slice.workspace)) throw new Error('reconcile existing in-progress assignments before starting more');
  if (active.some(slice => slice.workspace.mode === 'branch')) return {mode:'waiting',selected:[],deferred:ready.map(item => item.id)};
  if ((ready.length > 1 || active.length) && !scopes) throw new Error('scope file required to audit parallel edits');
  const conflicts = (first, second) => first.some(path => second.some(other => overlaps(path,other)));
  const activePaths = active.flatMap(slice => slice.workspace.paths);
  const candidates = ready.filter(item => !conflicts(scopes?.get(item.id) ?? [],activePaths));
  const conflictCounts = new Map(candidates.map(item => [item.id,candidates.filter(other =>
    other.id !== item.id && conflicts(scopes?.get(item.id) ?? [],scopes?.get(other.id) ?? [])).length]));
  const occupied = [...activePaths], chosen = new Set();
  for (const item of [...candidates].sort((first,second) =>
    conflictCounts.get(first.id) - conflictCounts.get(second.id) || first.id - second.id)) {
    const paths = scopes?.get(item.id) ?? [];
    if (!conflicts(paths,occupied)) { chosen.add(item.id); occupied.push(...paths); }
  }
  const selected = ready.filter(item => chosen.has(item.id)).map(item => item.id);
  const deferred = ready.filter(item => !chosen.has(item.id)).map(item => item.id);
  return {mode:selected.length ? selected.length > 1 || active.length ? 'worktree' : 'branch' : 'waiting',selected,deferred};
}

function branchExists(repo, branch) {
  const check = spawnSync('git',['-C',repo,'show-ref','--verify','--quiet',`refs/heads/${branch}`]);
  if (check.status === 0) return true;
  if (check.status === 1) return false;
  throw new Error('unable to inspect existing Git branches');
}

function currentBranch(repo) {
  const result = spawnSync('git',['-C',repo,'symbolic-ref','--quiet','--short','HEAD'],{encoding:'utf8'});
  return result.status === 0 ? result.stdout.trim() : null;
}

// Workspace operations run only in the run's dedicated worktree on its integration branch.
// Returns the primary checkout, which holds the ignored .worktrees directory.
function requireRunWorktree(repo, ticket, action) {
  const main = mainWorktree(repo);
  const branch = runBranchName(ticket);
  const current = currentBranch(repo);
  if (repo !== main && current === branch) return main;
  const path = runWorktreePath(main,ticket);
  const holder = worktrees(repo).find(tree => tree.branch === branch && tree.path !== repo);
  let fix = `git -C ${repo} worktree add -b ${branch} ${path}`;
  if (repo === main && current === branch) fix = `switch the primary checkout back to its base branch, then git -C ${repo} worktree add ${path} ${branch}`;
  else if (holder) fix = `run ${action} with the state file inside ${holder.path}`;
  else if (branchExists(repo,branch)) fix = repo === main ? `git -C ${repo} worktree add ${path} ${branch}` : `git -C ${repo} switch ${branch}`;
  throw new Error(`${ticket}: ${action} must run in the dedicated worktree on integration branch ${branch}, but ${repo} is on ${current ?? 'a detached HEAD'}. Fix: ${fix}`);
}

function cleanSource(repo) {
  const changes = execFileSync('git',['-C',repo,'status','--porcelain','-z','--untracked-files=all'],{encoding:'utf8'}).split('\0').filter(Boolean);
  if (changes.some(line => !line.slice(3).startsWith('docs/sdlc/'))) throw new Error('clean source checkout required for workspace operations');
}

const samePlan = (first, second) => Boolean(first && second && first.path === second.path && first.sha256 === second.sha256);
const lastPlanInvalidation = state => (state.history ?? []).findLastIndex(entry =>
  entry.event === 'invalidate' && ['G0','G1','G2'].includes(entry.gate));

const archivedWorkspaces = (state, integrationBranch) => (state.history ?? [])
  .filter(entry => entry.event === 'invalidate')
  .flatMap(entry => entry.previous?.slices ?? []).map(slice => slice.workspace)
  .filter(workspace => workspace?.integrationBranch === integrationBranch);

function matchingReconciliation(state, integrationBranch, baseHead) {
  const history = state.history ?? [];
  const index = history.findLastIndex(entry => entry.event === 'workspaces-reconciled');
  const entry = history[index];
  const invalidation = lastPlanInvalidation(state);
  return invalidation >= 0 && index > invalidation && entry?.integrationBranch === integrationBranch &&
    entry.baseHead === baseHead && samePlan(entry.taskPlan,state.taskPlan) ? entry : null;
}

function requireCommittedPlan(statePath, state, repo) {
  const message = 'commit the approved plan before workspace operations';
  let committed;
  try { committed = JSON.parse(git(repo,'show',`HEAD:${relative(repo,statePath)}`)); }
  catch { throw new Error(message); }
  if (committed.gates?.G2?.status !== 'passed' || !samePlan(committed.taskPlan,state.taskPlan)) throw new Error(message);
}

function writeState(statePath, state, original) {
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary,`${JSON.stringify(state,null,2)}\n`,{flag:'wx'});
    if (readFileSync(statePath,'utf8') !== original) throw new Error('state changed during workspace operation; reconcile assignments');
    renameSync(temporary,statePath);
  } finally {
    if (exists(temporary)) rmSync(temporary);
  }
}

export function reconcileWorkspaces(statePath, state, repo, original) {
  requireRunWorktree(repo,state.ticket,'reconcile');
  const integrationBranch = runBranchName(state.ticket);
  if (state.slices.some(slice => slice.status !== 'pending' || slice.workspace)) throw new Error('reconciliation requires pending, unassigned slices; do not replace active assignments');
  if (lastPlanInvalidation(state) < 0) throw new Error('reconciliation requires recorded G0–G2 invalidation history');
  const archived = archivedWorkspaces(state,integrationBranch);
  if (!archived.length) throw new Error('no recorded workspace history owns this integration branch');
  cleanSource(repo);
  requireCommittedPlan(statePath,state,repo);
  const baseHead = git(repo,'rev-parse','HEAD');
  if (archived.some(workspace => !/^[a-f0-9]{40,64}$/.test(workspace.baseHead ?? '') ||
      spawnSync('git',['-C',repo,'merge-base','--is-ancestor',workspace.baseHead,baseHead]).status !== 0)) {
    throw new Error('recorded workspace base must be an ancestor of the current integration history');
  }
  const registered = git(repo,'worktree','list','--porcelain','-z').split('\0')
    .filter(field => field.startsWith('worktree ')).map(field => field.slice('worktree '.length));
  const remaining = archived.find(workspace => workspace.mode === 'worktree' &&
    (exists(workspace.path) || registered.includes(workspace.path)));
  if (remaining) throw new Error(`archived worktree still exists or is registered: ${remaining.path}; audit and preserve its work before cleanup`);
  const prefix = `sdlc/${state.ticket}/t`;
  const branches = git(repo,'for-each-ref','--format=%(refname:short)',`refs/heads/sdlc/${state.ticket}/`).split('\n')
    .filter(branch => branch.startsWith(prefix) && /^[1-9]\d*$/.test(branch.slice(prefix.length)));
  if (branches.length) throw new Error(`old task branches require audited integration or archival and cleanup: ${branches.join(', ')}`);
  const existing = matchingReconciliation(state,integrationBranch,baseHead);
  if (existing) return existing;
  const record = {at:new Date().toISOString(),event:'workspaces-reconciled',integrationBranch,baseHead,taskPlan:state.taskPlan};
  if (git(repo,'rev-parse','HEAD') !== baseHead || git(repo,'symbolic-ref','--short','HEAD') !== integrationBranch) throw new Error('integration branch changed during reconciliation');
  writeState(statePath,{...state,history:[...state.history,record]},original);
  return record;
}

export function startWorkspaces(statePath, state, repo, plan, scopes, original) {
  if (!plan.selected.length) throw new Error('no ready nonconflicting ticket to start');
  const main = requireRunWorktree(repo,state.ticket,'start');
  const integrationBranch = runBranchName(state.ticket);
  const initial = !state.slices.some(slice => slice.workspace);
  const baseHead = git(repo,'rev-parse','HEAD');
  const invalidation = lastPlanInvalidation(state);
  const resuming = state.history?.some((entry,index) => index > invalidation && entry.event === 'invalidate' && entry.gate === 'G3' &&
    samePlan(entry.previous?.taskPlan,state.taskPlan) &&
    entry.previous?.slices?.some(slice => slice.workspace?.integrationBranch === integrationBranch));
  const reconciled = matchingReconciliation(state,integrationBranch,baseHead);
  // The run worktree always holds the integration branch; work started under an older plan must be reconciled first.
  if (initial && archivedWorkspaces(state,integrationBranch).length && !resuming && !reconciled) {
    throw new Error(`integration branch already holds work from an earlier plan; after reapproval and cleanup run node ${JSON.stringify(fileURLToPath(import.meta.url))} reconcile ${JSON.stringify(statePath)}`);
  }
  for (const slice of state.slices.filter(item => item.status === 'in_progress')) {
    if (slice.workspace.mode === 'worktree' && (!exists(slice.workspace.path) ||
        git(slice.workspace.path,'symbolic-ref','--short','HEAD') !== slice.workspace.branch)) throw new Error(`slice ${slice.id}: reconcile missing worktree`);
  }
  cleanSource(repo);
  requireCommittedPlan(statePath,state,repo);
  const assignments = plan.selected.map(id => ({id, mode:plan.mode,
    branch:plan.mode === 'branch' ? integrationBranch : `sdlc/${state.ticket}/t${id}`,
    integrationBranch, baseHead, path:plan.mode === 'branch' ? repo : sliceWorktreePath(main,state.ticket,id),
    paths:scopes?.get(id) ?? []}));
  for (const item of assignments) {
    if (plan.mode === 'worktree' && (exists(item.path) || branchExists(repo,item.branch))) throw new Error(`slice ${item.id}: branch or worktree already exists; reconcile it`);
    if (plan.mode === 'worktree') requireIgnoredWorkspace(main,item.path);
  }
  const created = [];
  try {
    for (const item of assignments) if (item.mode === 'worktree') {
      addWorktree(repo,item.branch,item.path,baseHead);
      created.push(item);
    }
    const updated = structuredClone(state);
    for (const item of assignments) {
      const slice = updated.slices.find(candidate => candidate.id === item.id);
      slice.status = 'in_progress';
      slice.workspace = Object.fromEntries(Object.entries(item).filter(([field]) => field !== 'id'));
    }
    writeState(statePath,updated,original);
  } catch (error) {
    for (const item of created.reverse()) discardWorktree(repo,item.path,item.branch);
    throw error;
  }
  return assignments;
}

function main() {
  const [command,file,scopeFile] = process.argv.slice(2);
  if (command === 'list' && process.argv.length <= 4) {
    console.log(JSON.stringify(listRuns(file),null,2));
    return;
  }
  if (!['plan','start','reconcile'].includes(command) || !file || process.argv.length > 5 || (command === 'reconcile' && scopeFile)) {
    throw new Error('Usage: workspaces.mjs plan|start STATE [SCOPES.json] | reconcile STATE\n       workspaces.mjs list [REPOSITORY_ROOT]');
  }
  if (dispatchPinned('workspaces.mjs',file)) return;
  const statePath = realpathSync.native(resolve(file));
  const original = readFileSync(statePath,'utf8');
  const state = JSON.parse(original);
  const repo = realpathSync.native(git(dirname(statePath),'rev-parse','--show-toplevel'));
  if (relative(repo,statePath).startsWith('..') || isAbsolute(relative(repo,statePath))) throw new Error('state must be inside the source repository');
  const ready = JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./state.mjs',import.meta.url)),'ready',statePath],{encoding:'utf8'}));
  if (command === 'reconcile') {
    console.log(JSON.stringify(reconcileWorkspaces(statePath,state,repo,original)));
    return;
  }
  const scopes = scopesFor(scopeFile,ready,repo);
  const plan = planWorkspaces(state,ready,scopes);
  if (command === 'plan') console.log(JSON.stringify(plan));
  else console.log(JSON.stringify({plan,assignments:startWorkspaces(statePath,state,repo,plan,scopes,original)}));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
