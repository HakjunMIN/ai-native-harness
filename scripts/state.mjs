import { readFileSync, realpathSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const gates = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5a', 'G5b'];
const phases = ['discover', 'discover', 'plan', 'implement', 'verify', 'release', 'release'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const sha = v => typeof v === 'string' && /^[a-f0-9]{40,64}$/.test(v);
export const digest = data => createHash('sha256').update(data).digest('hex');

export function nextPhase(state) {
  if (state?.outcome === 'spike-complete' && state.classification === 'spike' && state.gates?.G1?.status === 'passed') return 'done';
  const index = gates.findIndex(g => state?.gates?.[g]?.status !== 'passed');
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

function reviewErrors(reviews, axes, root, label) {
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
    if (!text(r.authorModel) || !text(r.reviewerModel) || !text(r.authorFamily) || !text(r.reviewerFamily) ||
        r.authorFamily.toLowerCase() === r.reviewerFamily.toLowerCase()) errors.push(`${label}: distinct verified model family required`);
    if (r.blocking !== 0) errors.push(`${label}: blocking review findings remain`);
    errors.push(...evidenceErrors(r.evidence, root, `${label}/${key}`));
  }
  return errors;
}

export function validateState(state, root, currentHead) {
  if (!object(state)) return ['state must be an object'];
  const errors = [];
  if (state.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(state.ticket ?? '')) errors.push('invalid ticket key');
  if (!['bounded', 'architectural', 'spike'].includes(state.classification)) errors.push('invalid classification');
  if (typeof state.uiChange !== 'boolean') errors.push('uiChange must be boolean');
  if (!object(state.gates)) return [...errors, 'gates must be an object'];
  if (!Array.isArray(state.history)) errors.push('history must be an array');
  if (!Array.isArray(state.slices)) errors.push('slices must be an array');
  if (state.phase !== nextPhase(state)) errors.push(`phase must be ${nextPhase(state)}`);
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
    if (name === 'G2') errors.push(...reviewErrors(gate.reviews, ['plan'], root, name));
    if (name === 'G4') errors.push(...reviewErrors(gate.reviews, ['final'], root, name));
    if (name === 'G5b' && (!text(gate.deployment?.digest) || gate.deployment?.health !== 'Healthy' || gate.deployment?.sync !== 'Synced')) errors.push('G5b: observed production digest and health required');
  }
  if (state.gates.G3?.status === 'passed') {
    if (!Array.isArray(state.slices) || !state.slices.length) errors.push('G3: nonempty completed slices required');
    else {
      const ids = new Set();
      for (const slice of state.slices) {
        if (!object(slice)) { errors.push('invalid slice'); continue; }
        if (!Number.isInteger(slice.id) || slice.id < 1 || ids.has(slice.id)) errors.push('slice id must be unique positive integer');
        ids.add(slice.id);
        if (slice.status !== 'done' || !Number.isInteger(slice.attempts) || slice.attempts < 1) errors.push(`slice ${slice.id}: not completed`);
        if (!sha(slice.subjectHead)) errors.push(`slice ${slice.id}: revision required`);
        errors.push(...evidenceErrors(slice.red, root, `slice ${slice.id} RED`), ...evidenceErrors(slice.green, root, `slice ${slice.id} GREEN`));
        errors.push(...reviewErrors(slice.reviews, ['spec','standards'], root, `slice ${slice.id}`));
      }
    }
  }
  if (state.outcome && !(state.outcome === 'spike-complete' && state.classification === 'spike' && state.gates.G1?.status === 'passed')) errors.push('invalid spike outcome');
  return errors;
}

export function invalidate(state, gate, reason) {
  const index = gates.indexOf(gate);
  if (index < 0 || !text(reason)) throw new Error('known gate and nonempty reason required');
  const result = structuredClone(state);
  for (const g of gates.slice(index)) result.gates[g] = {status: 'pending'};
  if (index <= 3) result.slices = [];
  delete result.outcome;
  result.phase = nextPhase(result);
  result.history.push({ at: new Date().toISOString(), event: 'invalidate', gate, reason });
  return result;
}

function main() {
  const [command, file, gate, reason] = process.argv.slice(2);
  if (!file || !['check','next','invalidate','hash'].includes(command)) throw new Error('Usage: state.mjs check|next|invalidate|hash FILE [GATE REASON]');
  if (command === 'hash') { console.log(digest(readFileSync(file))); return; }
  const path = resolve(file);
  const state = JSON.parse(readFileSync(path, 'utf8'));
  if (command === 'invalidate') {
    const updated = invalidate(state, gate, reason);
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
  const errors = validateState(state, dirname(path), head);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(command === 'next' ? nextPhase(state) : `OK ${state.ticket}: ${state.phase}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
