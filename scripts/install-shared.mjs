import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  readlinkSync, realpathSync, renameSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

const manifestName = '.ai-native-sdlc.links.json';
const present = path => {
  try { lstatSync(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const locks = [];
const temporary = [];
const createdDirectories = [];
const installed = [];
const backups = [];
let success = false;

function git(directory, ...arguments_) {
  const result = spawnSync('git', ['-C', directory, ...arguments_], { encoding: 'utf8' });
  if (result.error || result.status !== 0) fail(result.error?.message ?? result.stderr.trim());
  return result.stdout.trim();
}

function lock(path) {
  try { mkdirSync(path); }
  catch { fail(`Installation already running or lock exists: ${path}`); }
  locks.push(path);
}

function safeParents(target, path) {
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    if (present(parent)) {
      const metadata = lstatSync(parent);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail(`Conflict at parent: ${parent}`);
      if (process.platform !== 'win32' && (metadata.mode & 0o002)) fail(`Insecure world-writable directory: ${parent}`);
    }
    if (parent === target) break;
  }
}

function managedPath(path) {
  return typeof path === 'string' && !isAbsolute(path) && !path.includes('\\') &&
    !path.split('/').some(part => !part || part === '.' || part === '..') &&
    /^(?:\.ai-native-sdlc|AGENTS\.md|\.agents\/skills\/[a-zA-Z0-9._-]+|\.github\/agents\/[a-zA-Z0-9._-]+\.agent\.md|\.codex\/agents\/[a-zA-Z0-9._-]+\.toml|\.github\/hooks\/ai-native-sdlc\.json|\.codex\/hooks\.json)$/.test(path);
}

function fingerprint(path, kind) {
  const metadata = lstatSync(path);
  if (kind === 'link' && metadata.isSymbolicLink()) return digest(readlinkSync(path));
  if (kind === 'file' && metadata.isFile() && !metadata.isSymbolicLink()) return digest(readFileSync(path));
  fail(`Modified managed entry: ${path}`);
}

function plan(target, shared) {
  const entries = [];
  const link = (path, source, directory = false) => entries.push({
    path, kind: 'link', value: relative(dirname(join(target, path)), source), directory
  });
  const file = (path, value) => entries.push({ path, kind: 'file', value });
  link('.ai-native-sdlc', shared, true);
  for (const name of readdirSync(join(shared, 'skills'))) {
    if (!existsSync(join(shared, 'skills', name, 'SKILL.md'))) continue;
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) fail(`Invalid skill name: ${name}`);
    link(`.agents/skills/${name}`, join(target, '.ai-native-sdlc/skills', name), true);
  }
  for (const name of readdirSync(join(shared, 'agents')).filter(name => name.endsWith('.agent.md'))) {
    if (!/^[a-zA-Z0-9._-]+\.agent\.md$/.test(name)) fail(`Invalid agent name: ${name}`);
    link(`.github/agents/${name}`, join(target, '.ai-native-sdlc/agents', name));
    const profile = readFileSync(join(shared, 'agents', name), 'utf8');
    const title = profile.match(/^name: *(.+)$/m)?.[1];
    const description = profile.match(/^description: *(.+)$/m)?.[1];
    if (!title || !description) fail(`Invalid agent profile: ${name}`);
    const instructions = `Read ${join(target, '.ai-native-sdlc/agents', name).replaceAll('\\', '/')} before acting and follow its role instructions. Respect the host's actual tools and permissions; Markdown tools metadata does not configure Codex permissions.`;
    file(`.codex/agents/${name.replace(/\.agent\.md$/, '.toml')}`,
      `name = ${JSON.stringify(title)}\ndescription = ${JSON.stringify(description)}\ndeveloper_instructions = ${JSON.stringify(instructions)}\n`);
  }
  const command = (module, host, shell = 'posix') => {
    const path = join(target, '.ai-native-sdlc/hooks', module).replaceAll('\\', '/');
    if (shell === 'powershell') return `node '${path.replaceAll("'", "''")}' ${host}`;
    if (shell === 'native' && process.platform === 'win32') {
      if (/["%$`\r\n]/.test(path)) fail(`Unsupported Windows command path: ${target}`);
      return `node "${path}" ${host}`;
    }
    return `node '${path.replaceAll("'", "'\\''")}' ${host}`;
  };
  const copilotHook = module => ({ type: 'command', bash: command(module, 'copilot'),
    powershell: command(module, 'copilot', 'powershell'), timeoutSec: 10 });
  file('.github/hooks/ai-native-sdlc.json', JSON.stringify({ version: 1, hooks: {
    sessionStart: [copilotHook('session.mjs')], preToolUse: [copilotHook('guard.mjs')]
  } }, null, 2) + '\n');
  const codexHook = module => ({ hooks: [{ type: 'command', command: command(module, 'codex', 'native'), timeout: 10 }] });
  file('.codex/hooks.json', JSON.stringify({ description: 'ai-native-sdlc project hooks', hooks: {
    SessionStart: [codexHook('session.mjs')],
    PreToolUse: [{ matcher: '.*', ...codexHook('guard.mjs') }]
  } }, null, 2) + '\n');

  const manifestPath = join(target, manifestName);
  safeParents(target, manifestPath);
  let previous = [];
  if (present(manifestPath)) {
    if (!lstatSync(manifestPath).isFile() || lstatSync(manifestPath).isSymbolicLink()) fail(`Conflict at ${manifestPath}`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== 1 || !Array.isArray(manifest.entries)) fail(`Invalid manifest: ${manifestPath}`);
    previous = manifest.entries;
    const seen = new Set();
    for (const entry of previous) {
      if (!managedPath(entry.path) || !['file', 'link'].includes(entry.kind) ||
          !/^[a-f0-9]{64}$/.test(entry.hash) || seen.has(entry.path)) fail(`Invalid manifest: ${manifestPath}`);
      seen.add(entry.path);
      const path = join(target, entry.path);
      safeParents(target, path);
      if (!present(path) || fingerprint(path, entry.kind) !== entry.hash) fail(`Modified managed entry: ${path}`);
    }
  }
  const agentsPath = join(target, 'AGENTS.md');
  if (!present(agentsPath) || previous.some(entry => entry.path === 'AGENTS.md')) {
    link('AGENTS.md', join(target, '.ai-native-sdlc/templates/project-AGENTS.md'));
  } else {
    if (!existsSync(agentsPath) || !lstatSync(realpathSync(agentsPath)).isFile()) fail(`Conflict at ${agentsPath}`);
    console.warn(`Existing AGENTS.md preserved; integrate instructions from ${join(shared, 'templates/project-AGENTS.md')}. Do not edit a shared AGENTS.md link for project-specific rules.`);
  }
  for (const entry of entries) {
    const path = join(target, entry.path);
    safeParents(target, path);
    if (present(path) && !previous.some(old => old.path === entry.path)) fail(`Conflict at existing path: ${path}; copy installations are not migrated automatically`);
  }
  return { target, entries, previous, manifestPath };
}

function ensureParents(target, path) {
  const missing = [];
  for (let parent = dirname(path); parent !== target && !present(parent); parent = dirname(parent)) missing.push(parent);
  for (const parent of missing.reverse()) {
    mkdirSync(parent, { mode: 0o700 });
    createdDirectories.push(parent);
  }
}

function apply(plan_) {
  const { target, entries, previous, manifestPath } = plan_;
  const stage = mkdtempSync(join(target, '.ai-native-sdlc.stage.'));
  temporary.push(stage);
  for (const path of [...previous.map(entry => join(target, entry.path)), manifestPath]) {
    if (!present(path)) continue;
    const backup = join(stage, String(backups.length));
    renameSync(path, backup);
    backups.push({ path, backup });
  }
  for (const entry of entries) {
    const path = join(target, entry.path);
    ensureParents(target, path);
    if (entry.kind === 'link') symlinkSync(entry.value, path, entry.directory ? 'dir' : 'file');
    else writeFileSync(path, entry.value, { mode: 0o600, flag: 'wx' });
    installed.push(path);
  }
  writeFileSync(manifestPath, JSON.stringify({ version: 1, source: '.ai-native-sdlc', entries:
    entries.map(entry => ({ path: entry.path, kind: entry.kind, hash: digest(entry.value) }))
  }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  installed.push(manifestPath);
}

try {
  if (Number(process.versions.node.split('.')[0]) < 22) fail('Node.js 22 or newer is required');
  const arguments_ = process.argv.slice(2);
  const targets = [];
  const options = { repo: process.env.AI_NATIVE_SDLC_REPO_URL ?? 'https://github.com/HakjunMIN/ai-native-harness.git',
    ref: process.env.AI_NATIVE_SDLC_REF ?? 'main' };
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === '--help') {
      console.log('Usage: install-shared TARGET [TARGET ...] [--shared-dir PATH] [--repo-url URL] [--ref BRANCH]');
      success = true;
      process.exit(0);
    }
    const key = { '--shared-dir': 'shared', '--repo-url': 'repo', '--ref': 'ref' }[argument];
    if (key) {
      if (!arguments_[index + 1] || arguments_[index + 1].startsWith('--')) fail(`Missing value for ${argument}`);
      options[key] = arguments_[++index];
    } else if (argument.startsWith('--')) fail(`Unknown option: ${argument}`);
    else targets.push(realpathSync(resolve(argument)));
  }
  if (!targets.length || new Set(targets).size !== targets.length) fail('Specify one or more distinct existing target repositories');
  if (!/^[a-zA-Z0-9._-]+$/.test(options.ref) || ['.', '..'].includes(options.ref)) fail(`Invalid source ref: ${options.ref}`);
  if (!options.repo || options.repo.startsWith('-')) fail('Invalid repository URL');
  const parent = dirname(targets[0]);
  if (targets.some(target => dirname(target) !== parent || !lstatSync(target).isDirectory())) fail('All targets must be sibling directories');
  const requestedShared = resolve(options.shared ?? join(parent, 'ai-native-harness'));
  const sharedPath = join(realpathSync(dirname(requestedShared)), basename(requestedShared));
  if (dirname(sharedPath) !== parent || targets.includes(sharedPath)) fail('Shared clone must be a separate sibling of the target repositories');
  if (present(sharedPath) && lstatSync(sharedPath).isSymbolicLink()) fail(`Shared clone must not be a link: ${sharedPath}`);
  lock(join(parent, `.${basename(sharedPath)}.shared-install-lock`));
  for (const target of targets) lock(join(target, '.ai-native-sdlc.install-lock'));
  if (!present(sharedPath)) {
    const stage = mkdtempSync(join(parent, '.ai-native-harness.clone.'));
    temporary.push(stage);
    git(parent, 'clone', '--quiet', '--branch', options.ref, '--', options.repo, join(stage, 'source'));
    renameSync(join(stage, 'source'), sharedPath);
    console.log(`Cloned shared harness: ${sharedPath}`);
  } else {
    if (realpathSync(git(sharedPath, 'rev-parse', '--show-toplevel')) !== sharedPath) fail(`Not a standalone Git clone: ${sharedPath}`);
    if (git(sharedPath, 'remote', 'get-url', 'origin') !== options.repo) fail('Shared clone origin does not match --repo-url / AI_NATIVE_SDLC_REPO_URL');
    if (git(sharedPath, 'status', '--porcelain')) fail('Shared clone has local changes; commit or stash them before installing');
    if (git(sharedPath, 'branch', '--show-current') !== options.ref) fail(`Shared clone must be on branch ${options.ref}`);
    git(sharedPath, 'pull', '--ff-only', 'origin', options.ref);
    console.log(`Updated shared harness: ${sharedPath}`);
  }
  const shared = realpathSync(sharedPath);
  for (const path of ['skills/sdlc/SKILL.md', 'agents/sdlc-architect.agent.md', 'hooks/session.mjs',
    'hooks/guard.mjs', 'scripts/state.mjs', 'templates/project-AGENTS.md']) {
    if (!existsSync(join(shared, path)) || !lstatSync(join(shared, path)).isFile()) fail(`Missing harness asset: ${path}`);
  }
  const plans = targets.map(target => plan(target, shared));
  for (const plan_ of plans) apply(plan_);
  success = true;
  for (const target of targets) console.log(`Linked shared harness into ${target}`);
} catch (error) {
  console.error(`Installation failed: ${error.message}`);
  if (['EPERM', 'EACCES'].includes(error.code) && process.platform === 'win32') {
    console.error('Enable Windows Developer Mode or run PowerShell as Administrator to create symbolic links. No copy/junction fallback is used.');
  }
  process.exitCode = 1;
} finally {
  if (!success) {
    for (const path of installed.reverse()) unlinkSync(path);
    for (const { path, backup } of backups.reverse()) renameSync(backup, path);
    for (const path of createdDirectories.reverse()) rmdirSync(path);
  }
  for (const path of temporary.reverse()) rmSync(path, { recursive: true, force: true });
  for (const path of locks.reverse()) rmdirSync(path);
}
