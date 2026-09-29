#!/usr/bin/env node
import {existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const defaultSource = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const quote = value => `'${value.replaceAll("'","'\\''")}'`;
const link = (path, sourcePath) => ({path, kind:'link', value:relative(dirname(path),sourcePath)});
const file = (path, value) => ({path, kind:'file', value});

function requireDirectory(path) {
  if (!lstatSync(path,{throwIfNoEntry:false})?.isDirectory()) {
    throw new Error(`Expected directory: ${path}`);
  }
}

export function planInstall(target, source) {
  requireDirectory(target);
  for (const name of ['skills','agents','hooks','scripts','templates']) requireDirectory(join(source,name));
  for (const name of ['hooks/guard.mjs','hooks/session.mjs','hooks/gate-guard.sh',
    'hooks/session-start.sh','scripts/state.mjs','templates/state.json']) {
    if (!existsSync(join(source,name))) throw new Error(`Missing harness asset: ${name}`);
  }
  if (source === target || target.startsWith(`${source}${sep}`) || source.startsWith(`${target}${sep}`)) {
    throw new Error('Source and target must be separate directories');
  }
  const names = readdirSync(join(source,'skills'),{withFileTypes:true})
    .filter(entry => entry.isDirectory() && existsSync(join(source,'skills',entry.name,'SKILL.md')))
    .map(entry => entry.name).sort();
  const agents = readdirSync(join(source,'agents'))
    .filter(name => name.endsWith('.agent.md')).sort();
  if (!names.length || !agents.length) throw new Error('Harness has no skills or agents');

  const root = join(target,'.ai-native-sdlc');
  const entries = [link(root,source)];
  for (const name of names) {
    entries.push(link(join(target,'.agents','skills',name),join(root,'skills',name)));
  }
  for (const name of agents) {
    const profile = join(root,'agents',name);
    entries.push(link(join(target,'.github','agents',name),profile));
    const content = readFileSync(join(source,'agents',name),'utf8');
    const title = /^name:\s*(.+)$/m.exec(content)?.[1];
    const description = /^description:\s*(.+)$/m.exec(content)?.[1];
    if (!title || !description) throw new Error(`Invalid agent profile: ${name}`);
    const instructions = `Read ${profile} before acting and follow its role instructions. Respect the host's actual tools and permissions; Markdown tools metadata does not configure Codex permissions.`;
    entries.push(file(join(target,'.codex','agents',name.replace(/\.agent\.md$/,'.toml')),
      `name = ${JSON.stringify(title)}\ndescription = ${JSON.stringify(description)}\ndeveloper_instructions = ${JSON.stringify(instructions)}\n`));
  }
  const command = (script,adapter) => `bash ${quote(join(root,'hooks',script))} ${adapter}`;
  entries.push(file(join(target,'.github','hooks','ai-native-sdlc.json'),
    `${JSON.stringify({version:1,hooks:{
      sessionStart:[{type:'command',bash:command('session-start.sh','copilot'),timeoutSec:10}],
      preToolUse:[{type:'command',bash:command('gate-guard.sh','copilot'),timeoutSec:10}]
    }},null,2)}\n`));
  entries.push(file(join(target,'.codex','hooks.json'),
    `${JSON.stringify({description:'ai-native-sdlc project hooks',hooks:{
      SessionStart:[{hooks:[{type:'command',command:command('session-start.sh','codex'),timeout:10}]}],
      PreToolUse:[{matcher:'.*',hooks:[{type:'command',command:command('gate-guard.sh','codex'),timeout:10}]}]
    }},null,2)}\n`));
  return entries;
}

export function preflight(target, entries) {
  for (const entry of entries) {
    let parent = dirname(entry.path);
    while (parent !== target) {
      const stat = lstatSync(parent,{throwIfNoEntry:false});
      if (stat && !stat.isDirectory()) throw new Error(`Conflict at parent: ${parent}`);
      const next = dirname(parent);
      if (next === parent) throw new Error(`Path outside target: ${entry.path}`);
      parent = next;
    }
    const stat = lstatSync(entry.path,{throwIfNoEntry:false});
    if (!stat) continue;
    const match = entry.kind === 'link'
      ? stat.isSymbolicLink() && readlinkSync(entry.path) === entry.value && existsSync(entry.path)
      : stat.isFile() && readFileSync(entry.path,'utf8') === entry.value;
    if (!match) throw new Error(`Conflict at existing path: ${entry.path}`);
  }
}

export function install(target, entries) {
  const created = [];
  const directories = [];
  try {
    for (const entry of entries) {
      if (lstatSync(entry.path,{throwIfNoEntry:false})) continue;
      const missing = [];
      let parent = dirname(entry.path);
      while (!existsSync(parent)) {
        missing.push(parent);
        parent = dirname(parent);
      }
      for (const dir of missing.reverse()) {
        mkdirSync(dir);
        directories.push(dir);
      }
      if (entry.kind === 'link') symlinkSync(entry.value,entry.path);
      else writeFileSync(entry.path,entry.value,{flag:'wx'});
      created.push(entry.path);
    }
  } catch (error) {
    for (const path of created.reverse()) unlinkSync(path);
    for (const dir of directories.reverse()) rmdirSync(dir);
    throw error;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  if (process.argv.length < 3 || process.argv.length > 4) {
    throw new Error('Usage: node scripts/install-project.mjs TARGET [SOURCE]');
  }
  const target = realpathSync(resolve(process.argv[2]));
  const source = realpathSync(resolve(process.argv[3] ?? defaultSource));
  const entries = planInstall(target,source);
  preflight(target,entries);
  install(target,entries);
  console.log(`Installed ${entries.length} harness entries in ${target}`);
} catch (error) {
  console.error(`Installation failed: ${error.message}`);
  process.exitCode = 1;
}
