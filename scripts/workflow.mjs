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
    Array.isArray(draft.tickets) && draft.tickets.length === 1
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

export function ticketDefinitionErrors(tickets) {
  if (!Array.isArray(tickets) || !tickets.length) return ['nonempty tickets required'];
  const errors = [], ids = new Map();
  const list = value => Array.isArray(value) && value.length > 0 && value.every(text);
  const checks = ['junit','jest','playwright-bdd','go','chart','manual','static'];
  for (const ticket of tickets) {
    if (!object(ticket) || !Number.isInteger(ticket.id) || ticket.id < 1) { errors.push('invalid ticket id'); continue; }
    if (ids.has(ticket.id)) errors.push(`duplicate ticket id ${ticket.id}`);
    ids.set(ticket.id,ticket);
    if (!text(ticket.title) || !text(ticket.goal) || !list(ticket.scope) || !list(ticket.nonGoals)) errors.push(`ticket ${ticket.id}: title, goal, scope and nonGoals required`);
    if (ticket.details !== undefined && !text(ticket.details)) errors.push(`ticket ${ticket.id}: details must be text`);
    if (!Array.isArray(ticket.blockedBy) || ticket.blockedBy.some(id => !Number.isInteger(id)) ||
        new Set(ticket.blockedBy).size !== ticket.blockedBy.length) errors.push(`ticket ${ticket.id}: invalid dependencies`);
    const acIds = new Set();
    if (!Array.isArray(ticket.acceptanceCriteria) || !ticket.acceptanceCriteria.length) errors.push(`ticket ${ticket.id}: acceptance criteria required`);
    else for (const criterion of ticket.acceptanceCriteria) {
      if (!object(criterion) || !text(criterion.id) || acIds.has(criterion.id) || !text(criterion.requirement) || !text(criterion.text) ||
          !list(criterion.checks) || criterion.checks.some(check => !checks.includes(check))) errors.push(`ticket ${ticket.id}: invalid acceptance criteria/checks`);
      if (object(criterion)) acIds.add(criterion.id);
    }
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`ticket ${id}: dependency cycle`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const ticket = ids.get(id);
    for (const dependency of Array.isArray(ticket.blockedBy) ? ticket.blockedBy : []) {
      if (!ids.has(dependency)) errors.push(`ticket ${id}: unknown dependency ${dependency}`);
      else visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids.keys()) visit(id);
  return errors;
}

export function renderTicket(ticket, parent) {
  const items = values => values.map(value => `- ${value}`).join('\n');
  return [
    '<!-- Generated from tickets.json; edit the canonical draft, not this view. -->',
    `# T${ticket.id}: ${ticket.title}`, `Parent: ${parent}`, '## Goal', ticket.goal,
    '## Scope', items(ticket.scope), '## Non-goals', items(ticket.nonGoals),
    '## Acceptance criteria', ...ticket.acceptanceCriteria.map(criterion =>
      `- ${criterion.id} → ${criterion.requirement}: ${criterion.text} (${criterion.checks.join(', ')})`),
    '## Dependencies', ticket.blockedBy.length ? ticket.blockedBy.join(', ') : 'None',
    '## References and verification', ticket.details ?? 'Use the approved acceptance criteria and scoped handoff.'
  ].join('\n\n')+'\n';
}
