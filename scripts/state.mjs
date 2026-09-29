import { readFileSync, realpathSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { isLight, isLocal, policyErrors, verificationMode, renderTicket, ticketDefinitionErrors } from './workflow.mjs';

export const gates = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5a', 'G5b'];
const phases = ['discover', 'discover', 'plan', 'implement', 'verify', 'release', 'release'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const sha = v => typeof v === 'string' && /^[a-f0-9]{40,64}$/.test(v);
export const digest = data => createHash('sha256').update(data).digest('hex');
const ticketKey = v => typeof v === 'string' && /^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(v);
const published = (state, id) => Array.isArray(state.publications) && state.publications.some(p =>
  object(p) && p.id === id && p.status === 'confirmed' && text(state.ticketPlan?.sha256) &&
  p.planSha256 === state.ticketPlan.sha256);
const allPublished = state => Array.isArray(state.slices) && state.slices.length > 0 &&
  state.slices.every(s => object(s) && published(state,s.id));
const executionReady = state => isLocal(state) || isLight(state) || allPublished(state);

export function nextPhase(state) {
  if (state?.outcome === 'spike-complete' && state.classification === 'spike' && state.gates?.G1?.status === 'passed') return 'done';
  const index = gates.findIndex(g => state?.gates?.[g]?.status !== 'passed');
  if (index === 3 && !executionReady(state)) return 'publish';
  return index === -1 ? 'done' : phases[index];
}

export function evidenceErrors(item, root, label) {
  if (!object(item) || !text(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '')) return [`${label}: evidence path and SHA256 required`];
  if (isAbsolute(item.path) || item.path.split(/[\\/]/).includes('..')) return [`${label}: evidence path must remain inside ticket directory`];
  try {
    const base = realpathSync(root);
    const path = realpathSync(resolve(base, item.path));
    const rel = relative(base, path);
    if (rel.startsWith('..') || isAbsolute(rel) || !statSync(path).isFile()) return [`${label}: invalid evidence path`];
    if (digest(readFileSync(path)) !== item.sha256) return [`${label}: evidence hash mismatch (${item.path})`];
  } catch (error) {
    return [`${label}: evidence unreadable (${item.path}): ${error.code ?? error.message}`];
  }
  return [];
}

function readTicketPlan(state, root) {
  const errors = evidenceErrors(state.ticketPlan,root,'ticket plan');
  if (errors.length) return {tickets:[],errors};
  let plan;
  try { plan = JSON.parse(readFileSync(resolve(root,state.ticketPlan.path),'utf8')); }
  catch (error) { return {tickets:[],errors:[`ticket plan: invalid JSON: ${error.message}`]}; }
  if (!object(plan) || plan.parent !== state.ticket || !Array.isArray(plan.tickets) || !plan.tickets.length) {
    return {tickets:[],errors:['ticket plan: matching parent and nonempty tickets required']};
  }
  if (!isDeepStrictEqual(plan.policy,state.policy)) errors.push('ticket plan policy must match the state policy');
  if (state.policy && plan.format !== 'canonical-v1') errors.push('policy requires canonical-v1 ticket plan');
  if (isLight(state) && (plan.tickets.length !== 1 || plan.tickets[0]?.blockedBy?.length)) errors.push('light policy requires one independent outcome');
  errors.push(...ticketDefinitionErrors(plan.tickets));
  for (const t of plan.tickets) {
    if (!object(t)) continue;
    if (!isLight(state) || t.document !== undefined) {
      const documentErrors = evidenceErrors(t.document,root,`ticket ${t.id} document`);
      errors.push(...documentErrors);
      if (!documentErrors.length && plan.format === 'canonical-v1') {
        try {
          if (readFileSync(resolve(root,t.document.path),'utf8') !== renderTicket(t,plan.parent)) errors.push(`ticket ${t.id}: generated document differs from canonical definition`);
        } catch { errors.push(`ticket ${t.id}: invalid canonical definition`); }
      }
    }
  }
  return {tickets:plan.tickets.filter(object),errors};
}

function ticketErrors(state, root) {
  const approved = state.gates.G2?.status === 'passed';
  const errors = [];
  const {tickets,errors:planErrors} = approved || state.ticketPlan ? readTicketPlan(state,root) : {tickets:[],errors:[]};
  errors.push(...planErrors);
  if (approved && (!Array.isArray(state.gates.G2.evidence) || !state.gates.G2.evidence.some(e => object(e) &&
      e.path === state.ticketPlan?.path && e.sha256 === state.ticketPlan?.sha256))) errors.push('G2: ticket plan must be bound in approval evidence');
  const slices = Array.isArray(state.slices) ? state.slices : [];
  const ids = new Set();
  for (const s of slices) {
    if (!object(s) || !Number.isInteger(s.id) || s.id < 1 || ids.has(s.id)) {
      errors.push('slice id must be unique positive integer'); continue;
    }
    ids.add(s.id);
    if (!['pending','in_progress','done'].includes(s.status)) errors.push(`slice ${s.id}: invalid status`);
    if (s.workspace !== undefined) {
      const workspace = s.workspace;
      const integration = `sdlc/${state.ticket}/integration`;
      if (!object(workspace) || s.status === 'pending' || !['branch','worktree'].includes(workspace.mode) ||
          workspace.integrationBranch !== integration ||
          workspace.branch !== (workspace.mode === 'branch' ? integration : `sdlc/${state.ticket}/t${s.id}`) ||
          !sha(workspace.baseHead) || typeof workspace.path !== 'string' || !isAbsolute(workspace.path) ||
          !Array.isArray(workspace.paths) || workspace.paths.some(path => typeof path !== 'string' || !path) ||
          (workspace.mode === 'worktree' && !workspace.paths.length)) errors.push(`slice ${s.id}: invalid workspace assignment`);
    }
    if (s.revalidation !== undefined) {
      if (!object(s.revalidation) || !sha(s.revalidation.subjectHead)) errors.push(`slice ${s.id}: revalidation revision required`);
      errors.push(...evidenceErrors(s.revalidation?.red,root,`slice ${s.id} revalidation RED`));
    }
    if (s.status !== 'pending' && (!approved || !executionReady(state))) errors.push(`slice ${s.id}: G2 and required ticket publications required before execution`);
    const ticket = tickets.find(t => t.id === s.id);
    if (s.status !== 'pending' && ticket && Array.isArray(ticket.blockedBy)) {
      for (const id of ticket.blockedBy) if (!slices.some(d => object(d) && d.id === id && d.status === 'done')) errors.push(`slice ${s.id}: unfinished blocker ${id}`);
    }
  }
  if (approved && (ids.size !== tickets.length || tickets.some(t => !ids.has(t.id)))) errors.push('slices must map every approved ticket exactly');
  if (!Array.isArray(state.publications)) return [...errors,'publications must be an array'];
  const remoteKeys = new Set(), receiptIds = new Set();
  for (const p of state.publications) {
    if (!object(p) || !Number.isInteger(p.id) || p.id < 1) { errors.push('invalid publication'); continue; }
    if (isLocal(state)) errors.push('local intake cannot have Jira publication receipts');
    else if (isLight(state) && p.status !== 'stale') errors.push('light policy uses the parent issue, not active child publication receipts');
    if (receiptIds.has(p.id) || (p.key && remoteKeys.has(p.key))) errors.push('duplicate publication id or Jira key');
    receiptIds.add(p.id);
    if (p.key) remoteKeys.add(p.key);
    if (!['pending','unknown','confirmed','stale'].includes(p.status) ||
        p.parent !== state.ticket || p.marker !== `sdlc:${state.ticket}:ticket:${p.id}` ||
        !/^[a-f0-9]{64}$/.test(p.planSha256 ?? '') ||
        (p.key !== undefined && (!ticketKey(p.key) || p.key === state.ticket))) errors.push(`publication ${p.id}: invalid identity or status`);
    if (!approved && p.status !== 'stale') errors.push(`publication ${p.id}: G2 approval required`);
    const ticket = tickets.find(t => t.id === p.id);
    if (p.status !== 'stale' && p.planSha256 === state.ticketPlan?.sha256 && !ticket) errors.push(`publication ${p.id}: unknown approved ticket`);
    if (p.status !== 'confirmed') continue;
    if (!ticketKey(p.key)) errors.push(`publication ${p.id}: confirmed Jira key required`);
    errors.push(...evidenceErrors(p.evidence,root,`publication ${p.id} readback`));
    if (p.planSha256 !== state.ticketPlan?.sha256) continue;
    if (!ticket) continue;
    const expected = (Array.isArray(ticket.blockedBy) ? ticket.blockedBy : []).map(id =>
      state.publications.find(r => object(r) && r.id === id && published(state,id))?.key);
    if (!Array.isArray(p.blockedBy) || expected.some(k => !ticketKey(k)) ||
        p.blockedBy.length !== expected.length || new Set(p.blockedBy).size !== p.blockedBy.length ||
        p.blockedBy.some(k => !expected.includes(k))) errors.push(`publication ${p.id}: blocking links do not match ticket plan`);
  }
  return errors;
}

function reviewErrors(reviews, axes, root, label, policy, subjectHead) {
  if (!Array.isArray(reviews)) return [`${label}: reviews required`];
  const errors = [];
  for (const axis of axes) {
    if (!reviews.some(r => object(r) && r.axis === axis)) errors.push(`${label}: ${axis} review required`);
  }
  const scopes = new Set();
  for (const r of reviews) {
    if (!object(r) || !axes.includes(r.axis)) { errors.push(`${label}: invalid review axis`); continue; }
    const count = reviews.filter(other => object(other) && other.axis === r.axis).length;
    if (count > 1 && !text(r.scope)) errors.push(`${label}: split review scope required`);
    const key = `${r.axis}/${r.scope ?? 'whole-change'}`;
    if (scopes.has(key)) errors.push(`${label}: duplicate review scope ${key}`);
    scopes.add(key);
    if (policy && r.reviewerType === 'human') {
      const human = r.human;
      if (!policy.allowHumanReview || policy.requireDifferentFamily || !object(human) || human.actor !== 'human' ||
          !text(human.reference) || !text(human.at) || Number.isNaN(Date.parse(human.at))) errors.push(`${label}: evidenced human review is not permitted or missing`);
    } else {
      if (!text(r.authorModel) || !text(r.reviewerModel) || !text(r.authorFamily) || !text(r.reviewerFamily) ||
          ((!policy || policy.requireDifferentFamily) && r.authorFamily.toLowerCase() === r.reviewerFamily.toLowerCase())) errors.push(`${label}: distinct verified model family required`);
      if (policy && (r.reviewerType !== 'model' || !text(r.authorSession) || !text(r.reviewerSession) ||
          r.authorSession === r.reviewerSession)) errors.push(`${label}: independent review session required`);
    }
    if (policy && subjectHead && r.subjectHead !== subjectHead) errors.push(`${label}: review revision must match subjectHead`);
    if (policy && (r.axis === 'combined' || label === 'G4')) {
      const coverage = label === 'G4' ? ['spec','standards','security'] : ['spec','standards'];
      for (const area of coverage) if (!Array.isArray(r.coverage) || !r.coverage.includes(area)) errors.push(`${label}: review coverage missing ${area}`);
    }
    if (r.blocking !== 0) errors.push(`${label}: blocking review findings remain`);
    errors.push(...evidenceErrors(r.evidence, root, `${label}/${key}`));
  }
  return errors;
}

export function validateState(state, root, currentHead, {checkPhase = true} = {}) {
  if (!object(state)) return ['state must be an object'];
  const errors = [];
  if (state.schemaVersion !== 2) errors.push('schemaVersion must be 2; migrate legacy state using docs/operations.md before resuming');
  if (isLocal(state)) {
    if (!/^local-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state.ticket ?? '')) errors.push('invalid local ID');
    if (basename(resolve(root)) !== state.ticket) errors.push('local ID must match its state directory');
    if (state.intake.request?.path !== 'intake.md') errors.push('local intake must reference intake.md');
    errors.push(...evidenceErrors(state.intake.request,root,'local intake'));
    if (state.jira !== undefined) errors.push('local intake cannot have Jira sync state');
    if (state.gates?.G0?.status === 'passed' && !(Array.isArray(state.gates.G0.evidence) && state.gates.G0.evidence.some(item =>
      object(item) && item.path === state.intake.request?.path && item.sha256 === state.intake.request?.sha256))) errors.push('G0: local intake must be bound in evidence');
  } else {
    if (state.intake !== undefined) errors.push('invalid intake kind');
    if (!/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(state.ticket ?? '')) errors.push('invalid ticket key');
  }
  if (!['bounded', 'architectural', 'spike'].includes(state.classification)) errors.push('invalid classification');
  if (typeof state.uiChange !== 'boolean') errors.push('uiChange must be boolean');
  if (!object(state.gates)) return [...errors, 'gates must be an object'];
  if (!Array.isArray(state.history)) errors.push('history must be an array');
  if (!Array.isArray(state.slices)) errors.push('slices must be an array');
  if (state.policy !== undefined) errors.push(...policyErrors(state.policy,state.classification));
  if (state.impactAnalysis !== undefined) errors.push(...evidenceErrors(state.impactAnalysis,root,'impact analysis'));
  errors.push(...ticketErrors(state,root));
  if (![...phases,'publish','done'].includes(state.phase) || (checkPhase && state.phase !== nextPhase(state))) errors.push(`phase must be ${nextPhase(state)}`);
  for (const [index, name] of gates.entries()) {
    const gate = state.gates[name];
    if (!object(gate) || !['pending', 'failed', 'passed'].includes(gate.status)) { errors.push(`${name}: invalid gate status`); continue; }
    if (gate.status !== 'passed') continue;
    for (const prior of gates.slice(0, index)) {
      if (state.gates[prior]?.status !== 'passed') errors.push(`${name}: prerequisite ${prior} not passed`);
    }
    if (!Array.isArray(gate.evidence) || !gate.evidence.length) errors.push(`${name}: evidence required`);
    else for (const item of gate.evidence) errors.push(...evidenceErrors(item, root, name));
    if (['G1','G2','G5b'].includes(name)) {
      const a = gate.approval;
      if (!object(a) || a.actor !== 'human' || !text(a.reference) || !text(a.at) || Number.isNaN(Date.parse(a.at))) errors.push(`${name}: human approval record required`);
    }
    if (index >= 3) {
      if (!sha(gate.subjectHead) || (currentHead && currentHead !== gate.subjectHead)) errors.push(`${name}: source revision changed or missing`);
    }
    if (name === 'G2' && (!isLight(state) || gate.reviews !== undefined)) errors.push(...reviewErrors(gate.reviews, ['plan'], root, name,state.policy));
    if (name === 'G4') errors.push(...reviewErrors(gate.reviews, isLight(state) ? ['combined'] : ['final'], root, name,state.policy,gate.subjectHead));
    if (name === 'G5b' && (!text(gate.deployment?.digest) || gate.deployment?.health !== 'Healthy' || gate.deployment?.sync !== 'Synced')) errors.push('G5b: observed production digest and health required');
  }
  if (state.gates.G3?.status === 'passed' && (!Array.isArray(state.slices) || !state.slices.length || state.slices.some(s => !object(s) || s.status !== 'done'))) errors.push('G3: nonempty completed slices required');
  if (Array.isArray(state.slices)) {
    for (const slice of state.slices.filter(s => object(s) && s.status === 'done')) {
      if (!Number.isInteger(slice.attempts) || slice.attempts < 1) errors.push(`slice ${slice.id}: attempts required`);
      if (!sha(slice.subjectHead)) errors.push(`slice ${slice.id}: revision required`);
      if (verificationMode(state) === 'behavior') errors.push(...evidenceErrors(slice.red, root, `slice ${slice.id} RED`));
      if (verificationMode(state) === 'refactor') errors.push(...evidenceErrors(slice.before, root, `slice ${slice.id} before`));
      errors.push(...evidenceErrors(slice.green, root, `slice ${slice.id} GREEN`));
      errors.push(...reviewErrors(slice.reviews, isLight(state) ? ['combined'] : ['spec','standards'], root, `slice ${slice.id}`,state.policy,slice.subjectHead));
    }
  }
  if (state.outcome && !(state.outcome === 'spike-complete' && state.classification === 'spike' && state.gates.G1?.status === 'passed')) errors.push('invalid spike outcome');
  return errors;
}

export function invalidate(state, gate, reason, {sliceIds,tickets,impact} = {}) {
  const index = gates.indexOf(gate);
  if (index < 0 || !text(reason)) throw new Error('known gate and nonempty reason required');
  const result = structuredClone(state);
  const previous = {ticketPlan:result.ticketPlan ?? null,slices:structuredClone(result.slices),policy:result.policy,impactAnalysis:result.impactAnalysis};
  let affected;
  if (sliceIds !== undefined) {
    if (gate !== 'G3' || !Array.isArray(sliceIds) || !sliceIds.length ||
        sliceIds.some(id => !Number.isInteger(id) || !state.slices.some(slice => slice.id === id))) throw new Error('selective invalidation requires known G3 slice IDs');
    if (!object(impact) || !text(impact.path) || !/^[a-f0-9]{64}$/.test(impact.sha256 ?? '')) throw new Error('selective invalidation requires hashed impact evidence');
    if (!Array.isArray(tickets) || tickets.length !== state.slices.length ||
        state.slices.some(slice => !tickets.some(ticket => ticket.id === slice.id)) ||
        tickets.some(ticket => !Array.isArray(ticket.blockedBy) || ticket.blockedBy.some(id => !tickets.some(other => other.id === id)))) throw new Error('selective invalidation requires the complete ticket dependency graph');
    affected = new Set(sliceIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const ticket of tickets) if (!affected.has(ticket.id) && ticket.blockedBy.some(id => affected.has(id))) {
        affected.add(ticket.id);
        changed = true;
      }
    }
  }
  for (const g of gates.slice(index)) result.gates[g] = {status: 'pending'};
  if (index <= 2) {
    result.slices = [];
    result.ticketPlan = null;
    delete result.impactAnalysis;
    result.publications = (result.publications ?? []).map(p => ({...p,status:'stale'}));
  } else if (index === 3) {
    if (affected) result.impactAnalysis = impact;
    else delete result.impactAnalysis;
    result.slices = result.slices.map(s => affected && !affected.has(s.id) ? s : ({
    id:s.id,status:'pending',
    ...(s.status === 'done' && s.red ? {revalidation:{red:s.red,subjectHead:s.subjectHead}} :
      s.revalidation ? {revalidation:s.revalidation} : {})
    }));
  }
  delete result.outcome;
  result.phase = nextPhase(result);
  result.history.push({ at: new Date().toISOString(), event: 'invalidate', gate, reason, previous,
    ...(affected ? {affectedSlices:[...affected],impact} : {}) });
  return result;
}

function sliceIntegrationErrors(slice, repo, currentHead) {
  const errors = [];
  if (!sha(slice.subjectHead) || !currentHead || spawnSync('git',['-C',repo,'merge-base','--is-ancestor',slice.subjectHead,currentHead]).status !== 0) {
    errors.push(`G3: slice ${slice.id} revision is not integrated into the final source`);
  }
  if (slice.workspace.mode === 'worktree') {
    try {
      const worktree = realpathSync(slice.workspace.path);
      const source = execFileSync('git',['-C',worktree,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
      if (worktree !== source || execFileSync('git',['-C',worktree,'rev-parse','HEAD'],{encoding:'utf8'}).trim() !== slice.subjectHead ||
          execFileSync('git',['-C',worktree,'status','--porcelain','-z','--untracked-files=all'],{encoding:'utf8'}).length) {
        errors.push(`G3: slice ${slice.id} worktree has unverified changes or revision`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') errors.push(`G3: slice ${slice.id} worktree cannot be verified`);
    }
  }
  return errors;
}

export function integrationErrors(state, repo, currentHead) {
  if (state.gates?.G3?.status !== 'passed' || !state.slices?.some(slice => slice.workspace)) return [];
  const branch = `sdlc/${state.ticket}/integration`;
  const errors = [];
  if (execFileSync('git',['-C',repo,'branch','--show-current'],{encoding:'utf8'}).trim() !== branch) errors.push(`G3: check the integration branch ${branch}`);
  for (const slice of state.slices.filter(item => item.status === 'done' && item.workspace)) errors.push(...sliceIntegrationErrors(slice,repo,currentHead));
  return errors;
}

function main() {
  const [command, file, gate, reason, ...options] = process.argv.slice(2);
  if (!file || !['check','next','ready','invalidate','hash'].includes(command)) throw new Error('Usage: state.mjs check|next|ready|invalidate|hash FILE [GATE REASON]');
  if (command === 'hash') { console.log(digest(readFileSync(file))); return; }
  const path = resolve(file);
  const state = JSON.parse(readFileSync(path, 'utf8'));
  if (command === 'invalidate') {
    const {values} = parseArgs({args:options,options:{slices:{type:'string'},impact:{type:'string'}}});
    let selection;
    if (values.slices !== undefined || values.impact !== undefined) {
      if (!values.slices || !values.impact) throw new Error('--slices and --impact must be supplied together');
      const root = realpathSync(dirname(path));
      const impactPath = realpathSync(resolve(root,values.impact));
      if (isAbsolute(values.impact) || relative(root,impactPath).startsWith('..')) throw new Error('impact evidence must remain inside ticket directory');
      const impact = {path:values.impact,sha256:digest(readFileSync(impactPath))};
      const {tickets,errors} = readTicketPlan(state,root);
      errors.push(...evidenceErrors(impact,root,'impact analysis'));
      if (errors.length) throw new Error(errors.join('\n'));
      selection = {sliceIds:values.slices.split(',').map(Number),tickets,impact};
    }
    const updated = invalidate(state, gate, reason,selection);
    const temp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temp, `${JSON.stringify(updated, null, 2)}\n`, {flag: 'wx'});
    renameSync(temp, path);
    console.log(updated.phase);
    return;
  }
  let head;
  if (gates.slice(3).some(g => state.gates?.[g]?.status === 'passed')) {
    head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: dirname(path), encoding:'utf8'}).trim();
    // Evidence must be collected after source changes, not over a dirty source tree.
    const status = execFileSync('git', ['status','--porcelain','--untracked-files=all'], {cwd: dirname(path), encoding:'utf8'});
    const sourceChanges = status.split('\n').filter(Boolean).filter(line => !/^docs\/sdlc\//.test(line.slice(3)));
    if (sourceChanges.length) throw new Error('Uncommitted source changes invalidate release evidence; commit source and rerun verification');
  }
  const errors = validateState(state, dirname(path), head, {checkPhase: command !== 'next'});
  if (head) errors.push(...integrationErrors(state, dirname(path),head));
  if (errors.length) throw new Error(errors.join('\n'));
  if (command === 'ready') {
    if (nextPhase(state) !== 'implement') throw new Error('ready requires implement phase and required publication');
    const {tickets} = readTicketPlan(state,dirname(path));
    const needsIntegration = state.slices.some(slice => slice.status === 'done' && slice.workspace);
    const repo = needsIntegration ? execFileSync('git',['rev-parse','--show-toplevel'],{cwd:dirname(path),encoding:'utf8'}).trim() : null;
    const revision = repo ? execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim() : null;
    const branch = repo ? execFileSync('git',['-C',repo,'branch','--show-current'],{encoding:'utf8'}).trim() : null;
    const integrated = slice => slice.status === 'done' && (!slice.workspace ||
      (branch === `sdlc/${state.ticket}/integration` && !sliceIntegrationErrors(slice,repo,revision).length));
    console.log(JSON.stringify(tickets.filter(t => state.slices.some(s => s.id === t.id && s.status === 'pending') &&
      t.blockedBy.every(id => state.slices.some(s => s.id === id && integrated(s))))
      .map(t => ({id:t.id,key:isLocal(state) || isLight(state) ? state.ticket : state.publications.find(p => p.id === t.id).key}))));
    return;
  }
  console.log(command === 'next' ? nextPhase(state) : `OK ${state.ticket}: ${state.phase}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
