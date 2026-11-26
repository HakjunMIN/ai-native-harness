import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { listRuns } from '../run-workspace.mjs';
import { nextPhase, validateState } from '../state.mjs';
import { isWithinDirectory } from './model.mjs';

const gateIds = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5a', 'G5b'];
const humanGates = new Set(['G1', 'G2', 'G5b']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function evidencePaths(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(evidence => {
    const path = evidence?.path;
    if (typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/).includes('..')) return [];
    return [path];
  });
}

// validateState checks a review only once the gate or slice holding it has passed, so a clean
// review is reported as passed only then; open blocking findings are shown whether checked or not.
// Blocking findings a human accepted (residual-finding acceptance) count as passed once checked.
function reviewSummaries(state, valid) {
  const reviews = [];
  const addReviews = (entries, { stage, sliceId = null, validated }) => {
    if (!Array.isArray(entries)) return;
    for (const review of entries) {
      if (!object(review)) continue;
      const blocking = Number.isInteger(review.blocking) ? review.blocking : null;
      const accepted = Boolean(valid && validated && blocking > 0 && object(review.acceptance));
      let status = 'unknown';
      if (valid && blocking !== null) {
        if (accepted) status = 'passed';
        else if (blocking > 0) status = 'failed';
        else if (validated) status = 'passed';
      }
      reviews.push({
        stage,
        sliceId,
        axis: typeof review.axis === 'string' ? review.axis : stage,
        reviewerType: typeof review.reviewerType === 'string' ? review.reviewerType : 'unknown',
        status,
        blocking,
        accepted,
        evidencePaths: evidencePaths(review.evidence ? [review.evidence] : [])
      });
    }
  };
  addReviews(state.gates?.G2?.reviews, { stage: 'plan', validated: state.gates?.G2?.status === 'passed' });
  addReviews(state.gates?.G4?.reviews, { stage: 'final', validated: state.gates?.G4?.status === 'passed' });
  for (const slice of Array.isArray(state.slices) ? state.slices : []) {
    if (object(slice)) addReviews(slice.reviews, { stage: 'slice', sliceId: slice.id ?? null, validated: slice.status === 'done' });
  }
  return reviews;
}

function verificationSummaries(state, valid) {
  const verification = [];
  for (const slice of Array.isArray(state.slices) ? state.slices : []) {
    if (!object(slice)) continue;
    const id = slice.id ?? 'unknown';
    const red = evidencePaths(slice.red ? [slice.red] : []);
    const green = evidencePaths(slice.green ? [slice.green] : []);
    if (red.length) verification.push({ name: `Slice ${id} TDD RED evidence`, outcome: 'unknown', evidencePaths: red });
    if (green.length) {
      verification.push({
        name: `Slice ${id} GREEN verification`,
        outcome: valid && slice.status === 'done' ? 'passed' : 'unknown',
        evidencePaths: green
      });
    }
    const before = evidencePaths(slice.before ? [slice.before] : []);
    if (before.length) verification.push({ name: `Slice ${id} baseline evidence`, outcome: 'unknown', evidencePaths: before });
  }
  for (const id of ['G3', 'G4']) {
    const gate = state.gates?.[id];
    const paths = evidencePaths(gate?.evidence);
    if (paths.length) {
      verification.push({
        name: `${id} verification`,
        outcome: valid && gate.status === 'passed' ? 'passed' : 'unknown',
        evidencePaths: paths
      });
    }
  }
  return verification;
}

function summarize(entry) {
  const runRoot = dirname(entry.state);
  let state;
  let warnings = [];
  try {
    const expectedStatePath = resolve(entry.state);
    const realRunRoot = realpathSync(runRoot);
    const realStatePath = realpathSync(expectedStatePath);
    if (lstatSync(expectedStatePath).isSymbolicLink() || !isWithinDirectory(realRunRoot, realStatePath)) {
      throw new Error('Run state path escapes its run directory');
    }
    state = JSON.parse(readFileSync(realStatePath, 'utf8'));
    if (!object(state)) throw new Error('Run state must be an object');
    warnings = validateState(state, realRunRoot, undefined, { checkPhase: false });
  } catch (error) {
    warnings = [error.message.includes('JSON') || error instanceof SyntaxError
      ? 'Run state contains malformed JSON.'
      : error.message.includes('escapes') ? error.message : 'Run state could not be read.'];
  }
  const valid = warnings.length === 0 && object(state);
  const gates = gateIds.map(id => {
    const gate = state?.gates?.[id];
    return {
      id,
      status: valid && ['pending', 'failed', 'passed'].includes(gate?.status) ? gate.status : 'unknown',
      owner: humanGates.has(id) ? 'human' : 'system',
      evidencePaths: evidencePaths(gate?.evidence)
    };
  });
  return {
    id: entry.id,
    title: typeof state?.title === 'string' && state.title.trim() ? state.title : state?.ticket ?? entry.id,
    phase: valid && object(state) ? nextPhase(state) : 'unknown',
    valid,
    gates,
    reviews: object(state) ? reviewSummaries(state, valid) : [],
    verification: object(state) ? verificationSummaries(state, valid) : [],
    events: [],
    warnings
  };
}

export async function loadRuns(workspaceRoot) {
  return listRuns(workspaceRoot).map(summarize);
}
