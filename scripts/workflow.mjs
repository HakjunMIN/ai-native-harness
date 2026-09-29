export const changeKinds = ['behavior','documentation','config','refactor'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function policyErrors(policy, classification) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return ['policy must be an object'];
  const errors = [];
  if (policy.version !== 1 || !['light','strict'].includes(policy.profile)) errors.push('invalid policy version/profile');
  if (!changeKinds.includes(policy.changeKind)) errors.push('invalid policy changeKind');
  if (!Array.isArray(policy.risks) || !policy.risks.every(text)) errors.push('policy risks must be a string array');
  if (typeof policy.requireDifferentFamily !== 'boolean' || typeof policy.allowHumanReview !== 'boolean') errors.push('policy review flags must be boolean');
  if (policy.profile === 'light' && classification !== 'bounded') errors.push('light policy requires bounded classification');
  if (policy.profile === 'light' && policy.risks?.length) errors.push('light policy cannot include high-risk changes');
  if (policy.requireDifferentFamily && policy.allowHumanReview) errors.push('different-family policy cannot substitute human review');
  if (policy.changeKind !== 'behavior' && !text(policy.verificationReason)) errors.push('non-behavior policy requires verificationReason');
  return errors;
}

export function createPolicy(config, classification, draft) {
  if (!object(config) || !object(draft)) throw new Error('config and draft must be objects');
  if (config.workflow !== undefined && (!object(config.workflow) ||
      (config.workflow.boundedProfile !== undefined && !['light','strict'].includes(config.workflow.boundedProfile)))) throw new Error('workflow.boundedProfile must be light or strict');
  if (config.review !== undefined && !object(config.review)) throw new Error('review must be an object');
  for (const flag of ['requireDifferentFamily','allowHumanReview']) {
    if (config.review?.[flag] !== undefined && typeof config.review[flag] !== 'boolean') throw new Error(`review.${flag} must be boolean`);
  }
  const profile = classification === 'bounded' && Array.isArray(draft.risks) && draft.risks.length === 0 &&
    Array.isArray(draft.tasks) && draft.tasks.length === 1
    ? config.workflow?.boundedProfile ?? 'strict' : 'strict';
  const requireDifferentFamily = config.review?.requireDifferentFamily ?? false;
  const policy = {
    version:1,profile,changeKind:draft.changeKind,risks:draft.risks,
    requireDifferentFamily,
    allowHumanReview:requireDifferentFamily ? false : config.review?.allowHumanReview ?? false,
    ...(draft.changeKind !== 'behavior' ? {verificationReason:draft.verificationReason} : {})
  };
  const errors = policyErrors(policy,classification);
  if (errors.length) throw new Error(errors.join('\n'));
  return policy;
}

export const isLight = state => state?.policy?.profile === 'light';
export const isLocal = state => state?.intake?.kind === 'local';
export const verificationMode = state => state.policy?.changeKind ?? 'behavior';

export function taskDefinitionErrors(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) return ['nonempty tasks required'];
  const errors = [], ids = new Map();
  const list = value => Array.isArray(value) && value.length > 0 && value.every(text);
  const checks = ['junit','jest','playwright-bdd','go','chart','manual','static'];
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
