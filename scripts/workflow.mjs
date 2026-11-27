import { createQualityPolicy, qualityPolicyErrors } from './quality.mjs';
export const changeKinds = ['behavior','documentation','config','refactor'];
export const agentRoles = ['architect','code-reviewer','cross-reviewer','implementer','release-engineer',
  'spec-reviewer','test-writer','ux-designer','verifier'];
export const reasoningEffortLevels = ['low','medium','high','xhigh','max'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateRoleMap(name, map, valid, expected) {
  if (map === undefined) return;
  if (!object(map)) throw new Error(`${name} must map agent roles or default to values`);
  for (const [role, value] of Object.entries(map)) {
    if (role !== 'default' && !agentRoles.includes(role)) throw new Error(`${name}.${role}: unknown agent role; use ${agentRoles.join(', ')} or default`);
    if (!valid(value)) throw new Error(`${name}.${role}: ${expected}`);
  }
}

export const grantKinds = ['plan-commit','slice-commit','local-integration'];
export const e2eLevels = ['full','regression','none'];
export const residualFindingModes = ['follow-up','human'];
const preferenceKeys = ['grants','uiChange','e2e','reason','residualFindings'];

// Contract-2 G1 approvals record these answers; omitted fields take the recommended defaults.
export function preferencesErrors(preferences) {
  if (!object(preferences)) return ['execution preferences required'];
  const errors = [];
  for (const key of Object.keys(preferences)) if (!preferenceKeys.includes(key)) errors.push(`unknown execution preference ${key}`);
  const {grants,uiChange,e2e,reason,residualFindings} = preferences;
  if (typeof uiChange !== 'boolean') errors.push('preferences.uiChange must be boolean');
  if (grants !== undefined && (!Array.isArray(grants) || grants.some(grant => !grantKinds.includes(grant)) ||
      new Set(grants).size !== grants.length)) errors.push(`preferences.grants must be unique values from ${grantKinds.join(', ')}`);
  if (e2e !== undefined && !e2eLevels.includes(e2e)) errors.push(`preferences.e2e must be one of ${e2eLevels.join(', ')}`);
  if (reason !== undefined && !text(reason)) errors.push('preferences.reason must be nonempty text');
  if (residualFindings !== undefined && !residualFindingModes.includes(residualFindings)) errors.push(`preferences.residualFindings must be one of ${residualFindingModes.join(', ')}`);
  if (uiChange === true && e2e === 'none' && !text(reason)) errors.push('preferences: waiving E2E for a UI change requires a reason');
  return errors;
}

export const executionPolicy = preferences => ({
  verification:{e2e:preferences.e2e ?? 'full',...(preferences.reason !== undefined ? {reason:preferences.reason} : {})},
  autonomy:{residualFindings:preferences.residualFindings ?? 'follow-up'}
});

function verificationPolicyErrors(verification) {
  if (!object(verification) || Object.keys(verification).some(key => !['e2e','reason'].includes(key)) ||
      !e2eLevels.includes(verification.e2e) || (verification.reason !== undefined && !text(verification.reason))) {
    return [`policy.verification must be {e2e: ${e2eLevels.join('|')}, reason?}`];
  }
  return [];
}

export const validateModels = models => validateRoleMap('models', models, text, 'nonempty model ID required');
export const validateReasoningEfforts = efforts => validateRoleMap('reasoningEfforts', efforts,
  value => reasoningEffortLevels.includes(value), `use ${reasoningEffortLevels.join(', ')}`);

export function policyErrors(policy, classification) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return ['policy must be an object'];
  const errors = [];
  if (policy.version !== 1 || !['light','strict'].includes(policy.profile)) errors.push('invalid policy version/profile');
  if (!changeKinds.includes(policy.changeKind)) errors.push('invalid policy changeKind');
  if (!Array.isArray(policy.risks) || !policy.risks.every(text)) errors.push('policy risks must be a string array');
  if (typeof policy.requireDifferentFamily !== 'boolean' || typeof policy.allowHumanReview !== 'boolean' ||
      (policy.requireDifferentModel !== undefined && typeof policy.requireDifferentModel !== 'boolean')) errors.push('policy review flags must be boolean');
  if (policy.profile === 'light' && classification !== 'bounded') errors.push('light policy requires bounded classification');
  if (policy.profile === 'light' && policy.risks?.length) errors.push('light policy cannot include high-risk changes');
  if (policy.requireDifferentFamily && policy.allowHumanReview) errors.push('different-family policy cannot substitute human review');
  if (policy.changeKind !== 'behavior' && !text(policy.verificationReason)) errors.push('non-behavior policy requires verificationReason');
  if (policy.quality !== undefined) errors.push(...qualityPolicyErrors(policy.quality));
  if (policy.verification !== undefined) errors.push(...verificationPolicyErrors(policy.verification));
  if (policy.autonomy !== undefined && (!object(policy.autonomy) || Object.keys(policy.autonomy).length !== 1 ||
      !residualFindingModes.includes(policy.autonomy.residualFindings))) errors.push(`policy.autonomy must be {residualFindings: ${residualFindingModes.join('|')}}`);
  return errors;
}

// runContract 2 adds the parts that contract-2 runs require; contract-1 policies keep their original shape.
export function createPolicy(config, classification, draft, {runContract = 1, preferences} = {}) {
  if (!object(config) || !object(draft)) throw new Error('config and draft must be objects');
  if (runContract === 2) {
    const preferenceErrors = preferencesErrors(preferences);
    if (preferenceErrors.length) throw new Error(preferenceErrors.map(error => `G1: ${error}`).join('\n'));
  }
  if (config.workflow !== undefined && (!object(config.workflow) ||
      (config.workflow.boundedProfile !== undefined && !['light','strict'].includes(config.workflow.boundedProfile)))) throw new Error('workflow.boundedProfile must be light or strict');
  if (config.review !== undefined && !object(config.review)) throw new Error('review must be an object');
  for (const flag of ['requireDifferentFamily','requireDifferentModel','allowHumanReview']) {
    if (config.review?.[flag] !== undefined && typeof config.review[flag] !== 'boolean') throw new Error(`review.${flag} must be boolean`);
  }
  validateModels(config.models);
  validateReasoningEfforts(config.reasoningEfforts);
  const profile = classification === 'bounded' && Array.isArray(draft.risks) && draft.risks.length === 0 &&
    Array.isArray(draft.tasks) && draft.tasks.length === 1
    ? config.workflow?.boundedProfile ?? 'strict' : 'strict';
  const requireDifferentFamily = config.review?.requireDifferentFamily ?? false;
  const policy = {
    version:1,profile,changeKind:draft.changeKind,risks:draft.risks,
    requireDifferentFamily,
    requireDifferentModel:config.review?.requireDifferentModel ?? true,
    allowHumanReview:requireDifferentFamily ? false : config.review?.allowHumanReview ?? false,
    ...(draft.changeKind !== 'behavior' ? {verificationReason:draft.verificationReason} : {}),
    ...(runContract === 2 ? {quality:createQualityPolicy(config,draft),...executionPolicy(preferences)} : {})
  };
  const errors = policyErrors(policy,classification);
  if (errors.length) throw new Error(errors.join('\n'));
  return policy;
}

export const isLight = state => state?.policy?.profile === 'light';
export const isLocal = state => state?.intake?.kind === 'local';
export const verificationMode = state => state.policy?.changeKind ?? 'behavior';

export function taskDefinitionErrors(tasks, {runContract = 1} = {}) {
  if (!Array.isArray(tasks) || !tasks.length) return ['nonempty tasks required'];
  const errors = [], ids = new Map();
  const list = value => Array.isArray(value) && value.length > 0 && value.every(text);
  // Generic (non-Grafana, non-BDD) Playwright is a contract-2 check kind.
  const checks = ['junit','jest','playwright-bdd','go','chart','manual','static','playwright'];
  for (const task of tasks) {
    if (!object(task) || !Number.isInteger(task.id) || task.id < 1) { errors.push('invalid task id'); continue; }
    if (ids.has(task.id)) errors.push(`duplicate task id ${task.id}`);
    ids.set(task.id,task);
    if (!text(task.title) || !text(task.goal) || !list(task.scope) || !list(task.nonGoals)) errors.push(`task ${task.id}: title, goal, scope and nonGoals required`);
    if (task.details !== undefined && !text(task.details)) errors.push(`task ${task.id}: details must be text`);
    if (!Array.isArray(task.blockedBy) || task.blockedBy.some(id => !Number.isInteger(id)) ||
        new Set(task.blockedBy).size !== task.blockedBy.length) errors.push(`task ${task.id}: invalid dependencies`);
    const acIds = new Set();
    if (!Array.isArray(task.acceptanceCriteria) || !task.acceptanceCriteria.length) errors.push(`task ${task.id}: acceptance criteria required`);
    else for (const criterion of task.acceptanceCriteria) {
      if (!object(criterion) || !text(criterion.id) || acIds.has(criterion.id) || !text(criterion.requirement) || !text(criterion.text) ||
          !list(criterion.checks) || criterion.checks.some(check => !checks.includes(check))) errors.push(`task ${task.id}: invalid acceptance criteria/checks`);
      if (runContract !== 2 && Array.isArray(criterion?.checks) && criterion.checks.includes('playwright')) errors.push(`task ${task.id}: playwright check requires a contract-2 run`);
      if (object(criterion)) acIds.add(criterion.id);
    }
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`task ${id}: dependency cycle`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const task = ids.get(id);
    for (const dependency of Array.isArray(task.blockedBy) ? task.blockedBy : []) {
      if (!ids.has(dependency)) errors.push(`task ${id}: unknown dependency ${dependency}`);
      else visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids.keys()) visit(id);
  return errors;
}

export function renderTask(task, parent) {
  const items = values => values.map(value => `- ${value}`).join('\n');
  return [
    '<!-- Generated from tasks.json; edit the canonical draft, not this view. -->',
    `# T${task.id}: ${task.title}`, `Parent: ${parent}`, '## Goal', task.goal,
    '## Scope', items(task.scope), '## Non-goals', items(task.nonGoals),
    '## Acceptance criteria', ...task.acceptanceCriteria.map(criterion =>
      `- ${criterion.id} → ${criterion.requirement}: ${criterion.text} (${criterion.checks.join(', ')})`),
    '## Dependencies', task.blockedBy.length ? task.blockedBy.join(', ') : 'None',
    '## References and verification', task.details ?? 'Use the approved acceptance criteria and scoped handoff.'
  ].join('\n\n')+'\n';
}
