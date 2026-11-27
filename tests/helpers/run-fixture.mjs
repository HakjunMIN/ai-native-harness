import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// A project repository with one commit. Run worktrees are created in its ignored
// .worktrees/sdlc directory, so everything is removed with the temporary root.
export function projectRepo(t, { name = 'repo', commit = true, objectFormat } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sdlc-run-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, name);
  mkdirSync(repo);
  git(repo, 'init', '-q', '--initial-branch=main', ...(objectFormat ? [`--object-format=${objectFormat}`] : []));
  git(repo, 'config', 'user.name', 'Test User');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'core.autocrlf', 'false');
  if (commit) {
    writeFileSync(join(repo, '.gitignore'), '.ai-native-sdlc-revisions/\n/.worktrees/\n');
    writeFileSync(join(repo, 'README.md'), '# fixture\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'initial');
  }
  return { root, repo };
}

export const runWorktree = (repo, id) => join(repo, '.worktrees', 'sdlc', id, 'integration');
export const sliceWorktree = (repo, id, slice) => join(repo, '.worktrees', 'sdlc', id, `t${slice}`);
export const runRoot = (repo, id) => join(runWorktree(repo, id), 'docs/sdlc', id);
export const runState = (repo, id) => join(runRoot(repo, id), 'state.json');
export const worktreeCount = repo => (git(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm) ?? []).length;
export const runBranches = repo => git(repo, 'branch', '--list', 'sdlc/*', '--format=%(refname:short)').split('\n').filter(Boolean);

// Contract-2 task drafts assess every module; documentation-only work has no applicable check.
export const documentationQuality = (tasks = [1]) => ({ modules: [{ id: 'docs', path: '.', tasks, checks: Object.fromEntries(
  ['lint', 'format-check', 'typecheck'].map(kind => [kind, { reason: 'Documentation-only change has no code to check' }])) }] });

// Contract-2 G2 binds the plan document that holds the proceed agreement.
export const proceedPlan = '# Plan\n\n## Proceed agreement\n\n- Continue: implement, test and fix review findings in the approved sub tasks.\n' +
  '- Stop: a real external connection or a new write permission.\n';
export function planEvidence(run, body = proceedPlan) {
  writeFileSync(join(run, '02-plan.md'), body);
  return { path: '02-plan.md', sha256: createHash('sha256').update(body).digest('hex') };
}

// Rewrites a run lock without its marker, as a pre-0.3.0 run would have it.
export function asContract1(run, state) {
  const path = join(run, 'harness.lock.json'), lock = JSON.parse(readFileSync(path, 'utf8'));
  delete lock.runContract;
  const body = JSON.stringify(lock);
  writeFileSync(path, body);
  state.harness.sha256 = createHash('sha256').update(body).digest('hex');
}
