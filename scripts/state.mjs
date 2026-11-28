import { readFileSync, realpathSync, writeFileSync, renameSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { executionPolicy, grantKinds, isLight, isLocal, policyErrors, preferencesErrors, verificationMode, renderTask, taskDefinitionErrors } from './workflow.mjs';
import { dispatchPinned, readRunLock } from './harness.mjs';
import { inspectDiscovery, renderDiscovery } from './discovery.mjs';
import { qualityPolicyErrors, qualityReportErrors } from './quality.mjs';

export const gates = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5a', 'G5b'];
const phases = ['discover', 'discover', 'plan', 'implement', 'verify', 'release', 'release'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const humanRecord = v => object(v) && v.actor === 'human' && text(v.reference) && text(v.at) && !Number.isNaN(Date.parse(v.at));
const sha = v => typeof v === 'string' && /^[a-f0-9]{40,64}$/.test(v);
export const digest = data => createHash('sha256').update(data).digest('hex');
const ticketKey = v => typeof v === 'string' && /^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(v);
const published = (state, id) => Array.isArray(state.publications) && state.publications.some(p =>
  object(p) && p.id === id && p.status === 'confirmed' && text(state.taskPlan?.sha256) &&
  p.planSha256 === state.taskPlan.sha256);
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

function discoveryReview(state, root) {
  const gate = state.gates?.G1;
  const approved = gate?.status === 'passed';
  const path = '01-discovery.md';
  if (approved) {
    const evidence = Array.isArray(gate.evidence) && gate.evidence.find(item => item?.path === path);
    if (!evidence) return {errors:[`G1: ${path} must be bound in approval evidence`]};
    const errors = evidenceErrors(evidence, root, 'G1 discovery');
    if (errors.length) return {errors};
  }
  let body, sha256;
  try {
    const base = realpathSync(root), file = realpathSync(resolve(base, path));
    const rel = relative(base, file);
    if (rel.startsWith('..') || isAbsolute(rel) || !statSync(file).isFile()) return {errors:['discovery: invalid evidence path']};
    const bytes = readFileSync(file);
    body = bytes.toString('utf8');
    sha256 = digest(bytes);
  } catch (error) {
    return {errors:[`discovery: unreadable ${path}: ${error.code ?? error.message}`]};
  }
  const report = inspectDiscovery(body, {approved,confirmations:approved ? gate.approval?.decisions : []});
  return {...report,sha256,errors:report.errors.map(error => `discovery: ${error}`)};
}

function readTaskPlan(state, root, contract) {
  const errors = evidenceErrors(state.taskPlan,root,'task plan');
  if (errors.length) return {tasks:[],errors};
  let plan;
  try { plan = JSON.parse(readFileSync(resolve(root,state.taskPlan.path),'utf8')); }
  catch (error) { return {tasks:[],errors:[`task plan: invalid JSON: ${error.message}`]}; }
  if (!object(plan) || plan.parent !== state.ticket || !Array.isArray(plan.tasks) || !plan.tasks.length) {
    return {tasks:[],errors:['task plan: matching parent and nonempty tasks required']};
  }
  if (!isDeepStrictEqual(plan.policy,state.policy)) errors.push('task plan policy must match the state policy');
  if (state.policy?.quality !== undefined) errors.push(...qualityPolicyErrors(state.policy.quality,plan.tasks));
  if (state.policy && plan.format !== 'canonical-v1') errors.push('policy requires canonical-v1 task plan');
  if (isLight(state) && (plan.tasks.length !== 1 || plan.tasks[0]?.blockedBy?.length)) errors.push('light policy requires one independent outcome');
  errors.push(...taskDefinitionErrors(plan.tasks,{
    runContract:contract,sliceReview:state.policy?.sliceReview,risks:state.policy?.risks
  }));
  if (contract === 2 && state.uiChange === true && object(state.policy?.verification) && state.policy.verification.e2e !== 'none' &&
      !plan.tasks.some(t => object(t) && Array.isArray(t.acceptanceCriteria) && t.acceptanceCriteria.some(criterion =>
        Array.isArray(criterion?.checks) && criterion.checks.some(check => ['playwright','playwright-bdd'].includes(check))))) {
    errors.push('uiChange with E2E requires a playwright or playwright-bdd acceptance check');
  }
  for (const t of plan.tasks) {
    if (!object(t)) continue;
    if (!isLight(state) || t.document !== undefined) {
      const documentErrors = evidenceErrors(t.document,root,`task ${t.id} document`);
      errors.push(...documentErrors);
      if (!documentErrors.length && plan.format === 'canonical-v1') {
        try {
          if (readFileSync(resolve(root,t.document.path),'utf8') !== renderTask(t,plan.parent)) errors.push(`task ${t.id}: generated document differs from canonical definition`);
        } catch { errors.push(`task ${t.id}: invalid canonical definition`); }
      }
    }
  }
  return {tasks:plan.tasks.filter(object),errors};
}

function taskErrors(state, root, contract) {
  const approved = state.gates.G2?.status === 'passed';
  const errors = [];
  const {tasks,errors:planErrors} = approved || state.taskPlan ? readTaskPlan(state,root,contract) : {tasks:[],errors:[]};
  errors.push(...planErrors);
  if (approved && (!Array.isArray(state.gates.G2.evidence) || !state.gates.G2.evidence.some(e => object(e) &&
      e.path === state.taskPlan?.path && e.sha256 === state.taskPlan?.sha256))) errors.push('G2: task plan must be bound in approval evidence');
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
    const task = tasks.find(t => t.id === s.id);
    if (s.status !== 'pending' && task && Array.isArray(task.blockedBy)) {
      for (const id of task.blockedBy) if (!slices.some(d => object(d) && d.id === id && d.status === 'done')) errors.push(`slice ${s.id}: unfinished blocker ${id}`);
    }
  }
  if (approved && (ids.size !== tasks.length || tasks.some(t => !ids.has(t.id)))) errors.push('slices must map every approved task exactly');
  if (!Array.isArray(state.publications)) return {errors:[...errors,'publications must be an array'],tasks};
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
    const task = tasks.find(t => t.id === p.id);
    if (p.status !== 'stale' && p.planSha256 === state.taskPlan?.sha256 && !task) errors.push(`publication ${p.id}: unknown approved task`);
    if (p.status !== 'confirmed') continue;
    if (!ticketKey(p.key)) errors.push(`publication ${p.id}: confirmed Jira key required`);
    errors.push(...evidenceErrors(p.evidence,root,`publication ${p.id} readback`));
    if (p.planSha256 !== state.taskPlan?.sha256) continue;
    if (!task) continue;
    const expected = (Array.isArray(task.blockedBy) ? task.blockedBy : []).map(id =>
      state.publications.find(r => object(r) && r.id === id && published(state,id))?.key);
    if (!Array.isArray(p.blockedBy) || expected.some(k => !ticketKey(k)) ||
        p.blockedBy.length !== expected.length || new Set(p.blockedBy).size !== p.blockedBy.length ||
        p.blockedBy.some(k => !expected.includes(k))) errors.push(`publication ${p.id}: blocking links do not match task plan`);
  }
  return {errors,tasks};
}

// Decision IDs logged in the run's decisions.md table; a missing file has none.
function decisionRows(root) {
  try {
    const base = realpathSync(root), file = realpathSync(resolve(base,'decisions.md'));
    if (relative(base,file) !== 'decisions.md' || !statSync(file).isFile()) return new Set();
    return new Set([...readFileSync(file,'utf8').matchAll(/^\|\s*(D-[1-9][0-9]*)\s*\|/gm)].map(match => match[1]));
  } catch { return new Set(); }
}

function agentAcceptanceErrors(r, root, label, policy, contract) {
  if (contract !== 2) return [`${label}: agent acceptance requires a contract-2 run`];
  const a = r.acceptance, errors = [];
  if (policy?.autonomy?.residualFindings !== 'follow-up') errors.push(`${label}: agent acceptance requires residualFindings follow-up`);
  if (r.round !== 2) errors.push(`${label}: agent acceptance requires review round 2`);
  if (r.critical !== 0) errors.push(`${label}: agent acceptance requires zero critical findings`);
  if (!Number.isInteger(r.blocking) || r.blocking < 1) errors.push(`${label}: agent acceptance requires remaining blocking findings`);
  if (!Array.isArray(a.followUps) || !a.followUps.length || !a.followUps.every(text)) errors.push(`${label}: agent acceptance requires follow-ups`);
  if (typeof a.decision !== 'string' || !/^D-[1-9][0-9]*$/.test(a.decision)) errors.push(`${label}: agent acceptance requires a D-n decision`);
  else if (!decisionRows(root).has(a.decision)) errors.push(`${label}: decision ${a.decision} is not recorded in decisions.md`);
  return errors;
}

function reviewErrors(reviews, axes, root, label, policy, subjectHead, contract = 1) {
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
      if (policy?.requireDifferentModel && text(r.authorModel) && text(r.reviewerModel) &&
          r.authorModel.trim().toLowerCase() === r.reviewerModel.trim().toLowerCase()) errors.push(`${label}: reviewer model must differ from author model`);
      if (policy && (r.reviewerType !== 'model' || !text(r.authorSession) || !text(r.reviewerSession) ||
          r.authorSession === r.reviewerSession)) errors.push(`${label}: independent review session required`);
    }
    if (policy && subjectHead && r.subjectHead !== subjectHead) errors.push(`${label}: review revision must match subjectHead`);
    if (policy && (r.axis === 'combined' || label === 'G4')) {
      const coverage = label === 'G4' ? ['spec','standards','security'] : ['spec','standards'];
      for (const area of coverage) if (!Array.isArray(r.coverage) || !r.coverage.includes(area)) errors.push(`${label}: review coverage missing ${area}`);
    }
    if (contract === 2) {
      if (r.round !== undefined && ![1,2].includes(r.round)) errors.push(`${label}: review round must be 1 or 2`);
      if (r.critical !== undefined && (!Number.isInteger(r.critical) || r.critical < 0 || !Number.isInteger(r.blocking) ||
          r.critical > r.blocking)) errors.push(`${label}: review critical must be an integer from 0 to blocking`);
    }
    if (object(r.acceptance) && r.acceptance.actor === 'agent') errors.push(...agentAcceptanceErrors(r,root,label,policy,contract));
    else if (r.acceptance !== undefined) {
      const a = r.acceptance;
      if (!Number.isInteger(r.blocking) || r.blocking < 1 || !humanRecord(a) || !Array.isArray(a.followUps) ||
          !a.followUps.length || !a.followUps.every(text)) errors.push(`${label}: residual finding acceptance requires a human record and follow-ups`);
    } else if (r.blocking !== 0) errors.push(`${label}: blocking review findings remain`);
    errors.push(...evidenceErrors(r.evidence, root, `${label}/${key}`));
  }
  return errors;
}

// Contract-2 data is valid only in contract-2 runs, which require each policy part once planning starts.
function contractErrors(state, contract) {
  const errors = [];
  const planning = state.policy !== undefined || state.taskPlan != null || state.gates?.G2?.status === 'passed';
  const G1 = state.gates?.G1, preferences = object(G1) && object(G1.approval) ? G1.approval.preferences : undefined;
  const revocations = (Array.isArray(state.history) ? state.history : []).filter(event => object(event) && event.event === 'grants-revoked');
  if (contract === 2) {
    if (planning && state.policy?.quality?.version !== 1) errors.push('quality: this run requires an approved quality policy');
    if (planning && state.policy?.verification === undefined) errors.push('verification: this run requires an approved verification policy');
    if (planning && state.policy?.autonomy === undefined) errors.push('autonomy: this run requires an approved autonomy policy');
    // G2 approves the plan's proceed agreement; the gate loop checks the bound hash.
    const G2 = state.gates?.G2;
    if (G2?.status === 'passed' && !(Array.isArray(G2.evidence) && G2.evidence.some(item => object(item) && item.path === '02-plan.md'))) {
      errors.push('G2: 02-plan.md must be bound in approval evidence');
    }
    for (const event of revocations) {
      if (!text(event.at) || Number.isNaN(Date.parse(event.at)) || !text(event.reference) || !Array.isArray(event.grants) ||
          !event.grants.length || event.grants.some(grant => !grantKinds.includes(grant))) errors.push('grants-revoked: at, reference and known grants required');
    }
    if (G1?.status === 'passed') {
      const problems = preferencesErrors(preferences);
      errors.push(...problems.map(error => `G1: ${error}`));
      if (!problems.length && state.uiChange !== preferences.uiChange) errors.push('uiChange must match the approved G1 preferences; re-approve G1 to change it');
      // A stale policy kept after G1 invalidation is replaced by the next prepare, so only a current plan must match.
      if (!problems.length && state.taskPlan != null && object(state.policy)) {
        const expected = executionPolicy(preferences);
        for (const part of ['verification','autonomy']) if (!isDeepStrictEqual(state.policy[part],expected[part])) {
          errors.push(`policy.${part} must match the approved G1 preferences; re-approve G1 or prepare a new plan`);
        }
      }
    }
    return errors;
  }
  if (preferences !== undefined) errors.push('G1: contract-1 runs cannot carry execution preferences');
  if (state.policy?.verification !== undefined) errors.push('verification: contract-1 runs cannot carry a verification policy');
  if (state.policy?.autonomy !== undefined) errors.push('autonomy: contract-1 runs cannot carry an autonomy policy');
  if (state.policy?.sliceReview !== undefined) errors.push('slice review: contract-1 runs cannot carry a review policy');
  if (revocations.length) errors.push('grants-revoked: contract-1 runs have no standing grants');
  if (state.policy?.quality !== undefined) errors.push('quality: contract-1 runs cannot carry a quality policy');
  if ((Array.isArray(state.slices) && state.slices.some(slice => object(slice) && slice.quality !== undefined)) ||
      ['G3','G4'].some(name => object(state.gates?.[name]) && state.gates[name].quality !== undefined)) {
    errors.push('quality: contract-1 runs cannot carry quality reports');
  }
  return errors;
}

// Runs without a lock predate the marker and use contract 1.
function lockedContract(state, root) {
  if (!state.harness && !existsSync(resolve(root,'harness.lock.json'))) return 1;
  return readRunLock(state,root).runContract ?? 1;
}

export function validateState(state, root, currentHead, {checkPhase = true} = {}) {
  if (!object(state)) return ['state must be an object'];
  const errors = [];
  let contract = 1;
  try { contract = lockedContract(state,root); }
  catch (error) { errors.push(error.message); }
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
  errors.push(...contractErrors(state,contract));
  if (state.impactAnalysis !== undefined) errors.push(...evidenceErrors(state.impactAnalysis,root,'impact analysis'));
  const taskResult = taskErrors(state,root,contract);
  errors.push(...taskResult.errors);
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
    if (name === 'G1' && (state.harness || existsSync(resolve(root,'harness.lock.json')))) {
      errors.push(...discoveryReview(state, root).errors);
    }
    if (index >= 3) {
      if (!sha(gate.subjectHead) || (currentHead && currentHead !== gate.subjectHead)) errors.push(`${name}: source revision changed or missing`);
    }
    if (name === 'G2' && (!isLight(state) || gate.reviews !== undefined)) errors.push(...reviewErrors(gate.reviews, ['plan'], root, name,state.policy,undefined,contract));
    if (name === 'G4') errors.push(...reviewErrors(gate.reviews, isLight(state) ? ['combined'] : ['final'], root, name,state.policy,gate.subjectHead,contract));
    if (['G3','G4'].includes(name) && state.policy?.quality !== undefined) {
      errors.push(...qualityReportErrors(gate.quality,state.policy.quality,root,gate.subjectHead,'integration',evidenceErrors));
      if (gate.quality !== undefined && !(Array.isArray(gate.evidence) && gate.evidence.some(item => object(item) &&
          item.path === gate.quality?.path && item.sha256 === gate.quality?.sha256))) errors.push(`${name}: quality report must be bound in gate evidence`);
    }
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
      const task = taskResult.tasks.find(item => item.id === slice.id);
      const riskMappedReview = contract === 2 && state.policy?.sliceReview === 'risk-mapped';
      const axes = riskMappedReview && Array.isArray(task?.risks)
        ? task.risks.length ? ['spec','standards'] : []
        : isLight(state) ? ['combined'] : ['spec','standards'];
      errors.push(...reviewErrors(riskMappedReview && axes.length === 0 ? slice.reviews ?? [] : slice.reviews,
        axes,root,`slice ${slice.id}`,state.policy,slice.subjectHead,contract));
      if (state.policy?.quality !== undefined) errors.push(...qualityReportErrors(slice.quality,state.policy.quality,root,slice.subjectHead,slice.id,evidenceErrors));
    }
  }
  if (state.outcome && !(state.outcome === 'spike-complete' && state.classification === 'spike' && state.gates.G1?.status === 'passed')) errors.push('invalid spike outcome');
  return errors;
}

export function invalidate(state, gate, reason, {sliceIds,tasks,impact} = {}) {
  const index = gates.indexOf(gate);
  if (index < 0 || !text(reason)) throw new Error('known gate and nonempty reason required');
  const result = structuredClone(state);
  const previous = {taskPlan:result.taskPlan ?? null,slices:structuredClone(result.slices),policy:result.policy,impactAnalysis:result.impactAnalysis};
  let affected;
  if (sliceIds !== undefined) {
    if (gate !== 'G3' || !Array.isArray(sliceIds) || !sliceIds.length ||
        sliceIds.some(id => !Number.isInteger(id) || !state.slices.some(slice => slice.id === id))) throw new Error('selective invalidation requires known G3 slice IDs');
    if (!object(impact) || !text(impact.path) || !/^[a-f0-9]{64}$/.test(impact.sha256 ?? '')) throw new Error('selective invalidation requires hashed impact evidence');
    if (!Array.isArray(tasks) || tasks.length !== state.slices.length ||
        state.slices.some(slice => !tasks.some(task => task.id === slice.id)) ||
        tasks.some(task => !Array.isArray(task.blockedBy) || task.blockedBy.some(id => !tasks.some(other => other.id === id)))) throw new Error('selective invalidation requires the complete task dependency graph');
    affected = new Set(sliceIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of tasks) if (!affected.has(task.id) && task.blockedBy.some(id => affected.has(id))) {
        affected.add(task.id);
        changed = true;
      }
    }
  }
  for (const g of gates.slice(index)) result.gates[g] = {status: 'pending'};
  if (index <= 2) {
    result.slices = [];
    result.taskPlan = null;
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

function renderProgress(state, errors, textOnly) {
  const id = ticketKey(state?.ticket) || /^local-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state?.ticket ?? '')
    ? state.ticket : 'unknown';
  if (errors.length) {
    return [
      `**${id} · BLOCKED**`,
      `차단 사유: 상태/증거 검증 실패 (${errors.length}건). 상세 원인은 stderr를 확인하세요.`,
      ...(textOnly ? [] : ['```mermaid', 'flowchart LR', '  blocked["상태 검증 실패 · 차단"]', '```']),
      '다음 행동: 검증 오류를 해결하고 다시 조회하세요. 승인이나 완료 상태를 추정하지 마세요.'
    ].join('\n');
  }
  const phase = nextPhase(state);
  const spike = state.outcome === 'spike-complete';
  const pending = gates.find(g => state.gates[g].status !== 'passed');
  const failed = pending && state.gates[pending].status === 'failed';
  const approval = ['G1','G5b'].includes(pending) || (pending === 'G2' && state.taskPlan);
  const steps = [
    ['discover', '요구사항', state.gates.G1.status === 'passed'],
    ...(!spike ? [
      ['plan', '계획', state.gates.G2.status === 'passed'],
      ...(!isLocal(state) && !isLight(state) ? [
        ['publish', '티켓 발행', state.gates.G2.status === 'passed' && allPublished(state)]
      ] : []),
      ['implement', '구현', state.gates.G3.status === 'passed'],
      ['verify', '검증', state.gates.G4.status === 'passed'],
      ['release', '릴리스', state.gates.G5b.status === 'passed']
    ] : [])
  ].map(([name, label, complete]) => ({
    label,
    status: complete ? '완료' : name !== phase ? '대기' : failed ? '차단' : approval ? '승인 대기' : '현재',
    active: name === phase
  }));
  const lines = [`**${id} · ${spike ? '조사 완료' : phase === 'done' ? '완료' : phase}**`];
  if (textOnly) lines.push(steps.map(step => `${step.label} · ${step.status}`).join(' → '));
  else {
    lines.push('```mermaid', 'flowchart LR');
    steps.forEach((step, index) => lines.push(`  p${index}["${step.label} · ${step.status}"]`));
    if (steps.length > 1) lines.push(`  ${steps.map((_, index) => `p${index}`).join(' --> ')}`);
    const active = steps.findIndex(step => step.active);
    if (active >= 0) lines.push(`  style p${active} fill:${failed ? '#f8d7da' : '#fff3cd'},stroke:#8a6500,stroke-width:3px`);
    lines.push('```');
  }
  if (state.slices.length && !spike) {
    const count = status => state.slices.filter(slice => slice.status === status).length;
    lines.push(`하위 작업: 완료 ${count('done')}/${state.slices.length} · 진행 ${count('in_progress')} · 대기 ${count('pending')}`);
  }
  const actions = {
    G0: '요청, 수용 기준과 영향 모듈을 확인하고 G0 증거를 기록하세요.',
    G1: '요구사항에 대한 G1 사람 승인을 받으세요.',
    G2: '계획과 검토를 준비하고 G2 사람 승인을 받으세요.',
    G3: '승인된 하위 작업의 구현·검증·독립 리뷰를 완료하세요.',
    G4: '통합 검증과 최종 리뷰 증거를 확인하세요.',
    G5a: '정확한 리비전의 CI와 dev/staging 배포 증거를 확인하세요.',
    G5b: 'G5b 사람 승인과 실제 production 상태를 확인하세요.'
  };
  const action = spike ? '조사 결과를 인계하세요. 제품 구현·배포 완료가 아님.'
    : phase === 'done' ? '완료 결과와 배포 증거를 인계하세요.'
    : failed ? `${pending} 실패 원인을 확인하고 해당 단계의 증거를 재검증하세요.`
    : phase === 'publish' ? '승인된 하위 티켓을 발행하고 원격 발행 결과를 확인하세요.'
    : actions[pending];
  lines.push(`다음 행동: ${action}`);
  return lines.join('\n');
}

function main() {
  const [command, file, gate, reason, ...options] = process.argv.slice(2);
  if (!file || !['check','next','ready','progress','discovery','invalidate','hash'].includes(command)) throw new Error('Usage: state.mjs check|next|ready|progress|discovery|invalidate|hash FILE [GATE REASON] [--text (progress/discovery only)]');
  if (command === 'hash') { console.log(digest(readFileSync(file))); return; }
  if (dispatchPinned('state.mjs',file)) return;
  const textOnly = ['progress','discovery'].includes(command) && parseArgs({
    args:process.argv.slice(4), options:{text:{type:'boolean'}}
  }).values.text === true;
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
      const {tasks,errors} = readTaskPlan(state,root,lockedContract(state,root));
      errors.push(...evidenceErrors(impact,root,'impact analysis'));
      if (errors.length) throw new Error(errors.join('\n'));
      selection = {sliceIds:values.slices.split(',').map(Number),tasks,impact};
    }
    const updated = invalidate(state, gate, reason,selection);
    const temp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temp, `${JSON.stringify(updated, null, 2)}\n`, {flag: 'wx'});
    renameSync(temp, path);
    console.log(updated.phase);
    return;
  }
  let head;
  const errors = [];
  if (gates.slice(3).some(g => state?.gates?.[g]?.status === 'passed')) {
    head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: dirname(path), encoding:'utf8'}).trim();
    // Evidence must be collected after source changes, not over a dirty source tree.
    const status = execFileSync('git', ['status','--porcelain','--untracked-files=all'], {cwd: dirname(path), encoding:'utf8'});
    const sourceChanges = status.split('\n').filter(Boolean).filter(line => !/^docs\/sdlc\//.test(line.slice(3)));
    if (sourceChanges.length) errors.push('Uncommitted source changes invalidate release evidence; commit source and rerun verification');
  }
  errors.push(...validateState(state, dirname(path), head, {checkPhase: !['next','progress','discovery'].includes(command)}));
  if (head) errors.push(...integrationErrors(state, dirname(path),head));
  if (command === 'progress') {
    console.log(renderProgress(state, errors, textOnly));
    if (errors.length) throw new Error(errors.join('\n'));
    return;
  }
  if (errors.length) throw new Error(errors.join('\n'));
  if (command === 'discovery') {
    const report = discoveryReview(state, dirname(path));
    if (report.errors.length) throw new Error(report.errors.join('\n'));
    const approved = state.gates.G1.status === 'passed';
    const status = approved ? 'G1 승인 완료' : 'G1 검토용 초안 (미승인)';
    const root = dirname(path);
    const link = `[01-discovery.md](<${resolve(root, '01-discovery.md')}>)`;
    console.log(`**${state.ticket} · ${status} · ${report.sha256.slice(0, 12)}**\n${link}\n\n${renderDiscovery(report, {textOnly,approved,root})}`);
    return;
  }
  if (command === 'ready') {
    if (nextPhase(state) !== 'implement') throw new Error('ready requires implement phase and required publication');
    const {tasks} = readTaskPlan(state,dirname(path),lockedContract(state,dirname(path)));
    const needsIntegration = state.slices.some(slice => slice.status === 'done' && slice.workspace);
    const repo = needsIntegration ? execFileSync('git',['rev-parse','--show-toplevel'],{cwd:dirname(path),encoding:'utf8'}).trim() : null;
    const revision = repo ? execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim() : null;
    const branch = repo ? execFileSync('git',['-C',repo,'branch','--show-current'],{encoding:'utf8'}).trim() : null;
    const integrated = slice => slice.status === 'done' && (!slice.workspace ||
      (branch === `sdlc/${state.ticket}/integration` && !sliceIntegrationErrors(slice,repo,revision).length));
    console.log(JSON.stringify(tasks.filter(t => state.slices.some(s => s.id === t.id && s.status === 'pending') &&
      t.blockedBy.every(id => state.slices.some(s => s.id === id && integrated(s))))
      .map(t => ({id:t.id,key:isLocal(state) || isLight(state) ? state.ticket : state.publications.find(p => p.id === t.id).key}))));
    return;
  }
  console.log(command === 'next' ? nextPhase(state) : `OK ${state.ticket}: ${state.phase}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
