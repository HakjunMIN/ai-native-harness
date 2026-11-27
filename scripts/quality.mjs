import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const qualityKinds = ['lint','format-check','typecheck'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);
const relativePath = value => value === '.' || (text(value) && !/[:\\\0]/.test(value) &&
  value.split('/').every(part => part && part !== '.' && part !== '..'));
export const qualityDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function qualityPolicyErrors(quality, tasks) {
  if (!object(quality) || quality.version !== 1 || !Array.isArray(quality.modules) || !quality.modules.length) {
    return ['quality: version 1 and nonempty module assessments required'];
  }
  const errors = [], ids = new Set(), covered = new Set();
  for (const module of quality.modules) {
    if (!object(module) || !identifier(module.id) || ids.has(module.id) || !relativePath(module.path) ||
        !Array.isArray(module.tasks) || !module.tasks.length ||
        module.tasks.some(id => !Number.isInteger(id) || id < 1 || (tasks && !tasks.some(task => task?.id === id))) ||
        new Set(module.tasks).size !== module.tasks.length) {
      errors.push('quality: modules need unique IDs, relative paths and known task IDs');
      continue;
    }
    ids.add(module.id);
    module.tasks.forEach(id => covered.add(id));
    if (!object(module.checks) || Object.keys(module.checks).length !== qualityKinds.length ||
        qualityKinds.some(kind => !Object.hasOwn(module.checks,kind))) {
      errors.push(`quality ${module.id}: assess lint, format-check and typecheck`);
      continue;
    }
    for (const kind of qualityKinds) {
      const check = module.checks[kind], label = `quality ${module.id}/${kind}`;
      if (!object(check) || Object.keys(check).length !== 1) {
        errors.push(`${label}: select a command or a non-applicability reason`);
      } else if ('reason' in check) {
        if (!text(check.reason)) errors.push(`${label}: non-applicability needs a reason`);
      } else {
        const command = check.command;
        if (!object(command) || !text(command.id) || !relativePath(command.cwd) ||
            !Array.isArray(command.argv) || !command.argv.length || !command.argv.every(text) ||
            command.argv.some(arg => arg.includes('\0')) || !text(command.purpose)) {
          errors.push(`${label}: check command needs id, relative cwd, argv and purpose`);
        }
      }
    }
  }
  if (tasks?.some(task => !covered.has(task?.id))) errors.push('quality: every task needs a module assessment');
  return errors;
}

// Resolves draft command IDs from config.commands into the exact argv that G2 approves.
export function createQualityPolicy(config, draft) {
  if (!object(draft.quality) || !Array.isArray(draft.quality.modules)) throw new Error('quality: explicit module assessments required for this run');
  const quality = {version:1,modules:structuredClone(draft.quality.modules)};
  for (const module of quality.modules) {
    if (!object(module?.checks)) continue;
    for (const kind of qualityKinds) {
      const check = module.checks[kind];
      if (!object(check) || !('command' in check)) continue;
      const id = check.command;
      const command = typeof id === 'string' && object(config.commands) && Object.hasOwn(config.commands,id)
        ? config.commands[id] : undefined;
      if (!object(command)) throw new Error(`quality ${module.id}/${kind}: unknown project command ${id}`);
      check.command = {id,cwd:command.cwd,argv:structuredClone(command.argv),purpose:command.purpose};
    }
  }
  const errors = qualityPolicyErrors(quality,draft.tasks);
  if (errors.length) throw new Error(errors.join('\n'));
  return quality;
}

export function selectedQualityChecks(quality, scope) {
  return quality.modules.filter(module => scope === 'integration' || module.tasks.includes(scope))
    .flatMap(module => qualityKinds.filter(kind => module.checks[kind].command)
      .map(kind => ({module:module.id,kind,command:module.checks[kind].command})));
}

// artifactErrors validates a hashed run-directory artifact reference; state.mjs injects evidenceErrors.
export function qualityReportErrors(reference, quality, root, subjectHead, scope, artifactErrors) {
  const label = `quality ${scope}`;
  const errors = qualityPolicyErrors(quality);
  if (errors.length) return errors;
  const required = selectedQualityChecks(quality,scope);
  if (!required.length && reference === undefined) return [];
  errors.push(...artifactErrors(reference,root,`${label} report`));
  if (errors.length) return errors;
  let report;
  try { report = JSON.parse(readFileSync(resolve(root,reference.path),'utf8')); }
  catch (error) { return [`${label}: unreadable report (${error.message})`]; }
  if (!object(report) || report.schemaVersion !== 1 || report.scope !== scope ||
      !/^[a-f0-9]{40,64}$/.test(subjectHead ?? '') || report.subjectHead !== subjectHead ||
      report.policySha256 !== qualityDigest(quality) || !Array.isArray(report.checks)) {
    return [`${label}: report must match the approved quality policy, scope and source revision`];
  }
  const seen = new Set();
  for (const check of report.checks) {
    const expected = required.find(item => item.module === check?.module && item.kind === check?.kind);
    const key = `${check?.module}/${check?.kind}`;
    if (!expected || seen.has(key)) {
      errors.push(`${label}: unexpected or duplicate check ${key}`);
      continue;
    }
    seen.add(key);
    if (!isDeepStrictEqual(check.command,expected.command) || check.status !== 'passed' || check.exitCode !== 0 ||
        !text(check.startedAt) || !text(check.finishedAt) ||
        !Number.isFinite(Date.parse(check.startedAt)) || !Number.isFinite(Date.parse(check.finishedAt)) ||
        Date.parse(check.finishedAt) < Date.parse(check.startedAt)) {
      errors.push(`${label}: ${key} requires successful check-only execution with command and timestamps`);
    }
    errors.push(...artifactErrors(check.evidence,root,`${label} ${key}`));
  }
  if (seen.size !== required.length) errors.push(`${label}: missing required check results`);
  return errors;
}
