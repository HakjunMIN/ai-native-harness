import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateState } from '../scripts/state.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const root = resolve(input.cwd ?? process.cwd(), 'docs/sdlc');
  const lines = ['ai-native-sdlc: use sdlc-setup once, then sdlc with a Jira key. Human gates cannot be self-approved.'];
  if (existsSync(root)) {
    for (const dir of readdirSync(root, {withFileTypes:true}).filter(d => d.isDirectory())) {
      const file = resolve(root, dir.name, 'state.json');
      if (!existsSync(file)) continue;
      try {
        const state = JSON.parse(readFileSync(file,'utf8'));
        const errors = validateState(state, resolve(root,dir.name));
        lines.push(`${dir.name}: ${errors.length ? 'INVALID - run state check' : state.phase}`);
      } catch (error) { lines.push(`${dir.name}: INVALID (${error.message})`); }
    }
  }
  const context = lines.join('\n');
  console.log(JSON.stringify(['claude','codex'].includes(process.argv[2])
    ? {hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:context}}
    : {additionalContext:context}));
} catch (error) { console.error(`SDLC bootstrap failed: ${error.message}`); process.exitCode = 1; }
