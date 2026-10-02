import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
test('SDLC stages and domain review share the project governance reference', () => {
  for (const name of ['sdlc-setup', 'sdlc-discover', 'sdlc-plan', 'sdlc-implement',
    'sdlc-verify', 'sdlc-release', 'sdlc-handoff', 'domain-context', 'code-review']) {
    const body = readFileSync(resolve(`skills/${name}/SKILL.md`), 'utf8');
    assert.match(body, /\]\(\.\.\/sdlc\/references\/project-governance\.md\)/, name);
  }
  const protocol = readFileSync(resolve('skills/sdlc/references/protocol.md'), 'utf8');
  assert.match(protocol, /\]\(project-governance\.md\)/);
  const handoff = readFileSync(resolve('templates/handoff.md'), 'utf8');
  assert.match(handoff, /## Project baseline/);
  assert.match(handoff, /<PLUGIN_ROOT>\/skills\/sdlc\/references\/project-governance\.md/);
});
test('missing project governance blocks package validation', t => {
  const root = copy(t);
  rmSync(join(root, 'skills/sdlc/references/project-governance.md'));
  assert.match(validatePackage(root).join('\n'), /missing or escaped path .*project-governance\.md/);
});
test('package requires the Bash installation entrypoint', t => {
  const root = copy(t);
  rmSync(join(root,'install.sh'));
  assert.match(validatePackage(root).join('\n'),/install\.sh/);
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
for (const name of ['signoz-oss', 'clickstack', 'sdlc-tasks', 'mimir-oss', 'prometheus-query-api']) {
  test(`requires ${name} in the distributable skill catalog`, t => {
    const root = copy(t);
    rmSync(join(root, `skills/${name}`), {recursive:true, force:true});
    assert.match(validatePackage(root).join('\n'), new RegExp(name));
  });
}
test('checks local links inside skill reference guides, not just entrypoints', t => {
  const root = copy(t);
  const path = join(root, 'skills/sdlc/references/source-map.md');
  writeFileSync(path, '[Missing deeper source](missing-source.md)\n');
  assert.match(validatePackage(root).join('\n'), /missing-source.md/);
});
test('checks nested reference guides and accepts their relative links', t => {
  const root = copy(t);
  const directory = join(root, 'skills/signoz-oss/references/nested');
  mkdirSync(directory);
  const path = join(directory, 'guide.md');
  writeFileSync(path, '[Source map](../sources.md)\n');
  assert.deepEqual(validatePackage(root), []);
  writeFileSync(path, '[Missing](missing-nested.md)\n');
  assert.match(validatePackage(root).join('\n'), /missing-nested.md/);
});
