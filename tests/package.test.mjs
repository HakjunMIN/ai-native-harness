import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { validatePackage } from '../scripts/validate.mjs';

function copy(t) {
  const root = mkdtempSync(join(tmpdir(),'sdlc-package-'));
  cpSync(process.cwd(),root,{recursive:true,filter:src => !['.git','node_modules','.worktrees'].includes(basename(src))});
  t.after(() => rmSync(root,{recursive:true}));
  return root;
}
test('package is discoverable and all local links resolve', () => {
  assert.deepEqual(validatePackage(resolve('.')), []);
});
test('rejects missing required skill rather than silently shipping a partial workflow', t => {
  const root = copy(t);
  rmSync(join(root,'skills/sdlc-plan'),{recursive:true});
  assert.match(validatePackage(root).join('\n'),/sdlc-plan/);
});
test('rejects invalid frontmatter and dangling skill reference', t => {
  const root = copy(t);
  const file = join(root,'skills/sdlc/SKILL.md');
  writeFileSync(file,'---\nname: wrong\ndescription: workflow\n---\n[missing](missing.md)\n');
  const errors = validatePackage(root).join('\n');
  assert.match(errors,/name/);
  assert.match(errors,/description/);
  assert.match(errors,/missing.md/);
});
test('rejects nonexistent manifest component path', t => {
  const root = copy(t);
  const file = join(root,'plugin.json');
  const manifest = JSON.parse(readFileSync(file));
  manifest.hooks = './hooks/missing.json';
  writeFileSync(file,JSON.stringify(manifest));
  assert.match(validatePackage(root).join('\n'),/missing.json/);
});
