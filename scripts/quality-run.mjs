import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { dispatchPinned, runContext, runContract } from './harness.mjs';
import { digest, validateState } from './state.mjs';
import { integrationBranch, worktrees } from './run-workspace.mjs';
import { qualityDigest, selectedQualityChecks } from './quality.mjs';

const canonical = path => realpathSync.native(path);
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

// Run evidence under docs/sdlc/ changes while a run proceeds, so it never counts as a dirty source
// (the same rule as workspaces.mjs). Reports and logs are written there too.
function cleanHead(root) {
  const changes = execFileSync('git', ['-C', root, 'status', '--porcelain', '-z', '--untracked-files=all'], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  if (changes.some(line => !line.slice(3).startsWith('docs/sdlc/'))) {
    throw new Error('quality requires a clean committed source outside docs/sdlc/; commit or preserve changes before checking');
  }
  return git(root, 'rev-parse', 'HEAD');
}

function directory(root, path) {
  const full = resolve(root, path);
  let actual;
  try { actual = canonical(full); }
  catch { throw new Error(`quality command directory is missing: ${path}`); }
  const rel = relative(root, actual);
  if (actual !== full || isAbsolute(rel) || rel === '..' || rel.startsWith('../') || !lstatSync(full).isDirectory()) {
    throw new Error(`quality command directory escapes source or uses a symlink: ${path}`);
  }
  return full;
}

function artifactDirectory(runRoot) {
  const parent = join(runRoot, 'quality');
  try { mkdirSync(parent); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory()) throw new Error('Unsafe quality artifact directory');
  const path = `quality/${randomUUID()}`;
  mkdirSync(join(runRoot, path), { mode: 0o700 });
  return path;
}

// Branch-mode slices and the integration scope use the run worktree; worktree-mode slices use their task worktree.
function sourceFor(state, runTree, slice, scope) {
  const separate = slice?.workspace?.mode === 'worktree';
  const expectedBranch = separate ? `sdlc/${state.ticket}/t${scope}` : integrationBranch(state.ticket);
  let source;
  try { source = canonical(separate ? slice.workspace.path : runTree); }
  catch { source = null; }
  const tree = source && worktrees(runTree).find(item => item.path === source && !item.bare && !item.prunable);
  if (!tree || tree.branch !== expectedBranch || git(source, 'branch', '--show-current') !== expectedBranch ||
      (slice?.workspace && (canonical(slice.workspace.path) !== source || slice.workspace.branch !== expectedBranch))) {
    throw new Error('quality source must be the registered run worktree or the assigned task worktree');
  }
  if (slice?.workspace?.baseHead &&
      spawnSync('git', ['-C', source, 'merge-base', '--is-ancestor', slice.workspace.baseHead, 'HEAD']).status !== 0) {
    throw new Error('quality source does not descend from the assigned base revision');
  }
  return { source, expectedBranch };
}

export function runQuality(statePath, scope = 'integration') {
  const context = runContext(statePath);
  const original = readFileSync(context.path);
  const state = context.state;
  if (state.gates?.G2?.status !== 'passed') throw new Error('quality execution requires approved G2');
  if (state.phase === 'done' || state.gates?.G5b?.status === 'passed') throw new Error('Completed runs are immutable');
  const errors = validateState(state, context.runRoot);
  if (errors.length) throw new Error(errors.join('\n'));
  if (runContract(state, context.runRoot) !== 2 || state.policy?.quality?.version !== 1) {
    throw new Error('This run has no quality execution contract; keep using its pinned workflow');
  }
  const slice = scope === 'integration' ? undefined : state.slices.find(item => item.id === scope);
  if (scope !== 'integration' && (!Number.isInteger(scope) || !slice || slice.status !== 'in_progress')) {
    throw new Error('quality --task requires an in-progress task');
  }
  const { source, expectedBranch } = sourceFor(state, canonical(context.repositoryRoot), slice, scope);
  const subjectHead = cleanHead(source);
  const checks = selectedQualityChecks(state.policy.quality, scope);
  for (const module of state.policy.quality.modules.filter(item => scope === 'integration' || item.tasks.includes(scope))) {
    directory(source, module.path);
  }
  const directories = checks.map(check => directory(source, check.command.cwd));
  const output = artifactDirectory(context.runRoot);
  const report = { schemaVersion: 1, scope, subjectHead, policySha256: qualityDigest(state.policy.quality), checks: [] };
  let failure;
  for (const [index, check] of checks.entries()) {
    const path = `${output}/${index + 1}.log`, fd = openSync(join(context.runRoot, path), 'wx', 0o600);
    const startedAt = new Date().toISOString();
    let result;
    try {
      result = spawnSync(check.command.argv[0], check.command.argv.slice(1), {
        cwd: directories[index], shell: false, stdio: ['ignore', fd, fd], timeout: 300000
      });
    } finally { closeSync(fd); }
    const record = { ...check, status: result.status === 0 && !result.error ? 'passed' : 'failed',
      exitCode: result.status, startedAt, finishedAt: new Date().toISOString(),
      evidence: { path, sha256: digest(readFileSync(join(context.runRoot, path))) } };
    if (result.error || result.signal) record.error = result.error?.message ?? `Terminated by ${result.signal}`;
    try {
      if (cleanHead(source) !== subjectHead || !readFileSync(context.path).equals(original) ||
          git(source, 'branch', '--show-current') !== expectedBranch) throw new Error('quality source or run state changed during execution');
    } catch (error) {
      record.status = 'failed';
      record.error = `quality source changed: ${error.message}`;
    }
    report.checks.push(record);
    if (record.status !== 'passed') {
      failure = record.error ?? `quality ${check.module}/${check.kind} failed (exit ${record.exitCode})`;
      break;
    }
  }
  const body = `${JSON.stringify(report, null, 2)}\n`, path = `${output}/report.json`;
  writeFileSync(join(context.runRoot, path), body, { flag: 'wx', mode: 0o600 });
  return { passed: !failure, evidence: { path, sha256: digest(body) }, subjectHead, scope, ...(failure ? { error: failure } : {}) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { positionals, values } = parseArgs({ allowPositionals: true, options: { task: { type: 'string' } } });
    const [command, file, ...extra] = positionals;
    if (command !== 'run' || !file || extra.length || (values.task !== undefined && !/^[1-9][0-9]*$/.test(values.task))) {
      throw new Error('Usage: quality-run.mjs run STATE [--task ID]');
    }
    if (!dispatchPinned('quality-run.mjs', file)) {
      const result = runQuality(file, values.task === undefined ? 'integration' : Number(values.task));
      console.log(JSON.stringify(result));
      if (!result.passed) { console.error(result.error); process.exitCode = 1; }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
