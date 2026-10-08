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
test('technical skills route to live documentation and official HTTPS sources', () => {
  const names = ['mimir-oss', 'prometheus-query-api', 'signoz-oss', 'signoz-query-service',
    'clickstack', 'otel-observability', 'react-ts', 'spring-boot-bff', 'spring-testing',
    'grafana-plugin-dev', 'grafana-plugin-testing', 'helm-argocd-release'];
  const allowedHosts = new Set(['grafana.com', 'prometheus.io', 'signoz.io',
    'clickhouse.com', 'opentelemetry.io', 'react.dev', 'www.typescriptlang.org',
    'docs.spring.io', 'docs.gradle.org', 'docs.junit.org', 'wiremock.org',
    'java.testcontainers.org', 'playwright.dev', 'vitalets.github.io',
    'testing-library.com', 'jestjs.io', 'helm.sh', 'argo-cd.readthedocs.io',
    'kubernetes.io', 'github.com']);
  const officialRepositories = new Set(['grafana/mimir', 'grafana/mcp-grafana',
    'grafana/grafana', 'SigNoz/agent-skills', 'SigNoz/signoz',
    'SigNoz/signoz-otel-collector', 'ClickHouse/agent-skills', 'hyperdxio/hyperdx',
    'open-telemetry/opentelemetry-collector-contrib', 'rest-assured/rest-assured',
    'dequelabs/axe-core-npm']);
  const links = body => [...body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map(match => match[1]);
  for (const name of names) {
    const skill = readFileSync(resolve(`skills/${name}/SKILL.md`), 'utf8');
    const skillLinks = links(skill);
    assert.ok(skillLinks.includes('../sdlc/references/live-documentation.md'), name);
    assert.ok(skillLinks.includes('references/sources.md'), name);
    const sources = readFileSync(resolve(`skills/${name}/references/sources.md`), 'utf8');
    const sourceLinks = links(sources);
    assert.ok(sourceLinks.includes('../../sdlc/references/live-documentation.md'), name);
    const remoteLinks = sourceLinks.filter(link => /^[a-z]+:\/\//i.test(link));
    assert.ok(remoteLinks.length > 0, `${name}: no URLs to retrieve`);
    for (const link of remoteLinks) {
      const url = new URL(link);
      assert.equal(url.protocol, 'https:', `${name}: ${link}`);
      assert.ok(allowedHosts.has(url.hostname), `${name}: ${link}`);
      assert.equal(url.username + url.password, '', `${name}: credentials in URL`);
      if (url.hostname === 'github.com') {
        assert.ok(officialRepositories.has(url.pathname.split('/').slice(1, 3).join('/')), `${name}: ${link}`);
      }
    }
  }
});
test('missing live documentation protocol blocks package validation', t => {
  const root = copy(t);
  rmSync(join(root, 'skills/sdlc/references/live-documentation.md'));
  assert.match(validatePackage(root).join('\n'), /missing or escaped path .*live-documentation\.md/);
});
test('SDLC stages and domain review share the project governance reference', () => {
  for (const name of ['sdlc-setup', 'sdlc-discover', 'sdlc-plan', 'sdlc-implement',
    'sdlc-verify', 'sdlc-release', 'sdlc-handoff', 'domain-context', 'code-review', 'retro']) {
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
test('release paths write PR bodies with pr and retro feeds governed standards', () => {
  const read = path => readFileSync(resolve(path), 'utf8');
  for (const path of ['skills/sdlc-release/SKILL.md', 'skills/helm-argocd-release/SKILL.md',
    'agents/sdlc-release-engineer.agent.md']) {
    assert.match(read(path), /`pr`/, path);
  }
  const pr = read('skills/pr/SKILL.md');
  for (const section of ['## Summary', '## Evidence', '## Merge Danger', '## Traceability']) {
    assert.ok(pr.includes(section), section);
  }
  const retro = read('skills/retro/SKILL.md');
  assert.match(retro, /^disable-model-invocation: true$/m);
  assert.match(retro, /`Enforcement: review`/);
  assert.match(read('skills/sdlc/SKILL.md'), /user-invoked `retro`/);
  const governance = read('skills/sdlc/references/project-governance.md');
  assert.match(governance, /## Standard rule record/);
  assert.match(governance, /\| Enforcement \| `check: .*` or `review`/);
  assert.match(governance, /CODING_STANDARDS\.md/);
  assert.match(read('skills/code-review/SKILL.md'), /`check` rules confirm the\s+named check ran/);
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
for (const name of ['signoz-oss', 'clickstack', 'sdlc-tasks', 'mimir-oss', 'prometheus-query-api', 'pr', 'retro']) {
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
