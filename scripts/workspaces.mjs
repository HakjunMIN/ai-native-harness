import { readFileSync, writeFileSync, renameSync, realpathSync, lstatSync, rmSync } from 'node:fs';
import { dirname, basename, join, relative, resolve, isAbsolute } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dispatchPinned } from './harness.mjs';

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
          path.split('/').some(part => !part || part === '.' || part === '..' || /[*?\[\]]/.test(part))) throw new Error(`scope ${id}: use safe repo-relative paths without globs`);
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

function cleanSource(repo) {
  const changes = execFileSync('git',['-C',repo,'status','--porcelain','-z','--untracked-files=all'],{encoding:'utf8'}).split('\0').filter(Boolean);
  if (changes.some(line => !line.slice(3).startsWith('docs/sdlc/'))) throw new Error('clean source checkout required before starting branches/worktrees');
}

export function startWorkspaces(statePath, state, repo, plan, scopes, original) {
  if (!plan.selected.length) throw new Error('no ready nonconflicting ticket to start');
  const integrationBranch = `sdlc/${state.ticket}/integration`;
  const previous = state.slices.filter(slice => slice.workspace);
  const initial = !previous.length;
  const currentBranch = git(repo,'symbolic-ref','--short','HEAD');
  const integrationExists = branchExists(repo,integrationBranch);
  const resuming = state.history?.some(entry => entry.event === 'invalidate' && entry.gate === 'G3' &&
    entry.previous?.taskPlan?.sha256 === state.taskPlan?.sha256 &&
    entry.previous?.slices?.some(slice => slice.workspace?.integrationBranch === integrationBranch));
  if (initial && integrationExists && !(resuming && currentBranch === integrationBranch)) throw new Error('integration branch already exists; reconcile before resuming');
  if (!initial && (currentBranch !== integrationBranch || !branchExists(repo,integrationBranch))) throw new Error('switch to the recorded integration branch before resuming');
  for (const slice of state.slices.filter(item => item.status === 'in_progress')) {
    if (slice.workspace.mode === 'worktree' && (!exists(slice.workspace.path) ||
        git(slice.workspace.path,'symbolic-ref','--short','HEAD') !== slice.workspace.branch)) throw new Error(`slice ${slice.id}: reconcile missing worktree`);
  }
  cleanSource(repo);
  const committed = JSON.parse(git(repo,'show',`HEAD:${relative(repo,statePath)}`));
  if (committed.gates?.G2?.status !== 'passed' || committed.taskPlan?.sha256 !== state.taskPlan?.sha256) throw new Error('commit the approved plan before starting workspaces');
  const baseHead = git(repo,'rev-parse','HEAD');
  const worktreeRoot = join(dirname(repo),`${basename(repo)}.sdlc-worktrees`,state.ticket);
  const assignments = plan.selected.map(id => ({id, mode:plan.mode,
    branch:plan.mode === 'branch' ? integrationBranch : `sdlc/${state.ticket}/t${id}`,
    integrationBranch, baseHead, path:plan.mode === 'branch' ? repo : join(worktreeRoot,`t${id}`),
    paths:scopes?.get(id) ?? []}));
  for (const item of assignments) {
    if (plan.mode === 'worktree' && (exists(item.path) || branchExists(repo,item.branch))) throw new Error(`slice ${item.id}: branch or worktree already exists; reconcile it`);
  }
  let createdIntegration = false;
  const created = [];
  let temporary;
  try {
    if (initial && !integrationExists) { git(repo,'switch','-c',integrationBranch); createdIntegration = true; }
    for (const item of assignments) if (item.mode === 'worktree') {
      git(repo,'worktree','add','-b',item.branch,item.path,baseHead);
      created.push(item);
    }
    if (readFileSync(statePath,'utf8') !== original) throw new Error('state changed during workspace creation; reconcile assignments');
    const updated = structuredClone(state);
    for (const item of assignments) {
      const slice = updated.slices.find(candidate => candidate.id === item.id);
      slice.status = 'in_progress';
      slice.workspace = Object.fromEntries(Object.entries(item).filter(([field]) => field !== 'id'));
    }
    temporary = `${statePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary,`${JSON.stringify(updated,null,2)}\n`,{flag:'wx'});
    renameSync(temporary,statePath);
    temporary = undefined;
  } catch (error) {
    if (temporary && exists(temporary)) rmSync(temporary);
    for (const item of created.reverse()) {
      git(repo,'worktree','remove','--force',item.path);
      git(repo,'branch','-D',item.branch);
    }
    if (createdIntegration) {
      git(repo,'switch',currentBranch);
      git(repo,'branch','-D',integrationBranch);
    }
    throw error;
  }
  return assignments;
}

function main() {
  const [command,file,scopeFile] = process.argv.slice(2);
  if (!['plan','start'].includes(command) || !file || process.argv.length > 5) throw new Error('Usage: workspaces.mjs plan|start STATE [SCOPES.json]');
  if (dispatchPinned('workspaces.mjs',file)) return;
  const statePath = realpathSync(resolve(file));
  const original = readFileSync(statePath,'utf8');
  const state = JSON.parse(original);
  const repo = realpathSync(git(dirname(statePath),'rev-parse','--show-toplevel'));
  if (relative(repo,statePath).startsWith('..') || isAbsolute(relative(repo,statePath))) throw new Error('state must be inside the source repository');
  const ready = JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./state.mjs',import.meta.url)),'ready',statePath],{encoding:'utf8'}));
  const scopes = scopesFor(scopeFile,ready,repo);
  const plan = planWorkspaces(state,ready,scopes);
  if (command === 'plan') console.log(JSON.stringify(plan));
  else console.log(JSON.stringify({plan,assignments:startWorkspaces(statePath,state,repo,plan,scopes,original)}));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
