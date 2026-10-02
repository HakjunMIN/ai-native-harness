import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillNames = [
  'sdlc','sdlc-setup','sdlc-discover','sdlc-plan','sdlc-tasks','sdlc-implement','sdlc-verify','sdlc-release','sdlc-handoff',
  'grilling','domain-context','visual-companion','prototype','bdd-gherkin','tdd','api-contract','code-review',
  'verification-gate','jira-sync','diagnosing-bugs','spring-boot-bff','spring-testing','signoz-query-service','signoz-oss','clickstack',
  'grafana-plugin-dev','grafana-plugin-testing','react-ts','otel-observability','helm-argocd-release'
];
const agents = ['architect','ux-designer','test-writer','implementer','spec-reviewer','code-reviewer','cross-reviewer','verifier','release-engineer'];

export function validatePackage(root) {
  const errors = [];
  const read = path => {
    try { return readFileSync(resolve(root,path),'utf8'); }
    catch (error) { errors.push(`${path}: ${error.code}`); return ''; }
  };
  const checkPath = (path, label) => {
    const full = resolve(root,path);
    if (relative(root,full).startsWith('..') || !existsSync(full)) errors.push(`${label}: missing or escaped path ${path}`);
  };
  const json = path => {
    try { return JSON.parse(read(path)); }
    catch (error) { errors.push(`${path}: invalid JSON: ${error.message}`); return null; }
  };
  function links(file, body) {
    for (const match of body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (!link || /^[a-z]+:\/\//i.test(link)) continue;
      checkPath(relative(root,resolve(root,dirname(file),link)), file);
    }
  }
  function referenceLinks(directory) {
    if (!existsSync(resolve(root,directory))) return;
    for (const entry of readdirSync(resolve(root,directory),{withFileTypes:true})) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) referenceLinks(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) links(path,read(path));
    }
  }
  for (const name of skillNames) {
    const path = `skills/${name}/SKILL.md`;
    const body = read(path);
    const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) { errors.push(`${path}: frontmatter required`); continue; }
    if (fm[1].length > 1024) errors.push(`${path}: frontmatter too long`);
    if (!new RegExp(`^name: ${name}$`,'m').test(fm[1])) errors.push(`${path}: name must match directory`);
    if (!/^description: ["']?Use when .+/m.test(fm[1])) errors.push(`${path}: description needs use conditions`);
    links(path,body);
    referenceLinks(`skills/${name}/references`);
  }
  if (existsSync(resolve(root,'skills'))) {
    const discovered = readdirSync(resolve(root,'skills'),{withFileTypes:true}).filter(d => d.isDirectory()).map(d => d.name);
    for (const name of discovered) if (!skillNames.includes(name)) errors.push(`Unexpected skill: ${name}`);
  }
  for (const name of agents) {
    const path = `agents/sdlc-${name}.agent.md`;
    const body = read(path);
    if (!/^---\n[\s\S]*?\ndescription: .+\n/m.test(body)) errors.push(`${path}: description required`);
    links(path,body);
  }
  const manifests = ['plugin.json','.claude-plugin/plugin.json','.codex-plugin/plugin.json'];
  for (const file of manifests) {
    const m = json(file);
    if (!m) continue;
    if (m.name !== 'ai-native-sdlc' || m.version !== '0.1.0') errors.push(`${file}: inconsistent plugin identity`);
    for (const field of ['skills','agents','hooks']) {
      if (typeof m[field] === 'string') checkPath(m[field],file);
      else if (Array.isArray(m[field])) for (const p of m[field]) checkPath(p,file);
    }
  }
  json('.claude-plugin/marketplace.json');
  checkPath('templates/project-AGENTS.md','installer template');
  for (const file of ['hooks/copilot.json','hooks/hooks.json','templates/state.json','templates/ai-native-sdlc.config.json']) json(file);
  for (const file of ['install.sh','install-shared.sh','hooks/session-start.sh','hooks/gate-guard.sh','scripts/validate.sh']) {
    checkPath(file,'executable');
    if (existsSync(resolve(root,file)) && !(statSync(resolve(root,file)).mode & 0o111)) errors.push(`${file}: executable permission missing`);
  }
  for (const file of ['install-shared.ps1','scripts/install-shared.mjs']) checkPath(file,'shared installer');
  for (const file of ['README.md','docs/install.md','docs/compatibility.md','docs/operations.md','templates/handoff.md']) {
    links(file,read(file));
  }
  return errors;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = validatePackage(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`Package valid: ${skillNames.length} skills, ${agents.length} agents, manifests, hooks and links`);
}
