import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pinRun } from '../scripts/harness.mjs';

test('maintainer skill is available locally but excluded from the shipped runtime', t => {
  const skillPath = '.agents/skills/harness-dev/SKILL.md';
  const skill = readFileSync(skillPath, 'utf8');
  assert.match(skill, /^name: harness-dev$/m);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.match(readFileSync('.agents/skills/harness-dev/agents/openai.yaml', 'utf8'),
    /^policy:\n {2}allow_implicit_invocation: false$/m);
  assert.match(readFileSync('AGENTS.md', 'utf8'), /\.agents\/skills\/harness-dev\/SKILL\.md/);
  assert.equal(readdirSync('skills').includes('harness-dev'), false);

  for (const file of ['plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\.agents\/skills\/harness-dev/);
  }

  const root = mkdtempSync(join(tmpdir(), 'harness-maintainer-skill-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const repository = join(root, 'service');
  mkdirSync(source);
  mkdirSync(join(repository, 'docs/sdlc'), { recursive: true });

  for (const directory of ['agents', 'hooks', 'scripts', 'skills', 'templates', 'docs']) {
    cpSync(resolve(directory), join(source, directory), { recursive: true });
  }
  const copiedSkill = join(source, skillPath);
  mkdirSync(join(source, '.agents/skills/harness-dev'), { recursive: true });
  writeFileSync(copiedSkill, skill);
  const createRun = id => {
    const runRoot = join(repository, 'docs/sdlc', id);
    mkdirSync(runRoot, { recursive: true });
    return runRoot;
  };
  const before = pinRun({ ticket: 'local-before', history: [] },
    createRun('local-before'), repository, source);

  writeFileSync(copiedSkill, `${skill}\nA maintainer-only edit.\n`);
  const after = pinRun({ ticket: 'local-after', history: [] },
    createRun('local-after'), repository, source);

  assert.equal(after.contentSha256, before.contentSha256);
  assert.equal(existsSync(join(before.root, '.agents')), false);
  assert.equal(existsSync(join(after.root, '.agents')), false);
});
