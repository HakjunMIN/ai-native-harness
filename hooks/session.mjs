import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { validateState } from '../scripts/state.mjs';
import { resolveRun } from '../scripts/harness.mjs';
import { listRuns } from '../scripts/run-workspace.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const cwd = resolve(input.cwd ?? process.cwd());
  const lines = ['ai-native-sdlc: use sdlc-setup once, then sdlc with a Jira key, natural-language request, or existing local ID. Every run lives in its own git worktree on sdlc/<ID>/integration that start creates; do all run work there, never in the primary checkout. Human gates cannot be self-approved.'];
  let runs = [];
  if (existsSync(cwd)) {
    try { runs = listRuns(cwd); } catch (error) { lines.push(`run discovery failed (${error.message})`); }
  }
  for (const {id, state: file, worktree} of runs) {
    try {
      const state = JSON.parse(readFileSync(file,'utf8'));
      const directory = dirname(file);
      if (state.harness || existsSync(join(directory,'harness.lock.json'))) {
        const revision = resolveRun(file);
        lines.push(`${id}: recorded phase ${state.phase}; harness ${revision.contentSha256.slice(0,12)}; worktree ${worktree}; state ${file}; run the pinned state checker before resuming`);
      } else {
        const errors = validateState(state, directory);
        lines.push(`${id}: ${errors.length ? 'INVALID - run state check' : state.phase}; worktree ${worktree}; state ${file}; UNPINNED - explicit harness adoption required before resuming`);
      }
    } catch (error) { lines.push(`${id}: INVALID (${error.message})`); }
  }
  const context = lines.join('\n');
  console.log(JSON.stringify(['claude','codex'].includes(process.argv[2])
    ? {hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:context}}
    : {additionalContext:context}));
} catch (error) { console.error(`SDLC bootstrap failed: ${error.message}`); process.exitCode = 1; }
