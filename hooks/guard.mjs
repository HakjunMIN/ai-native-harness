import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';

// A linked worktree holds only committed files, so an untracked project config
// lives in the primary checkout that the worktree's .git file points back to.
function primaryCheckout(root) {
  try {
    const pointer = readFileSync(resolve(root, '.git'), 'utf8').match(/^gitdir:\s*(.+)$/m)?.[1];
    if (!pointer) return null;
    const gitDirectory = resolve(root, pointer.trim());
    const common = resolve(gitDirectory, readFileSync(resolve(gitDirectory, 'commondir'), 'utf8').trim());
    return basename(common) === '.git' ? dirname(common) : null;
  } catch { return null; }
}

function inheritedConfig(root) {
  const primary = primaryCheckout(root);
  const file = primary && resolve(primary, 'ai-native-sdlc.config.json');
  return file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

function configAt(cwd) {
  let dir = resolve(cwd);
  while (true) {
    const file = resolve(dir, 'ai-native-sdlc.config.json');
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
    if (existsSync(resolve(dir, '.git')) || dirname(dir) === dir) return inheritedConfig(dir);
    dir = dirname(dir);
  }
}

function isReadOnlyDeploymentCommand(command) {
  if (!/^[\w \t./:=,@%+-]+$/.test(command)) return false;
  const [executable, ...args] = command.trim().split(/\s+/);
  const verbs = {
    kubectl: ['get','describe','rollout status','rollout history'],
    helm: ['template','status','history','get values','get manifest'],
    argocd: ['app get','app diff','app history']
  };
  const verb = verbs[executable]?.find(candidate => args.slice(0,candidate.split(' ').length).join(' ') === candidate);
  if (!verb) return false;
  const flags = {
    kubectl: ['-n','--namespace','--context','--kubeconfig','-o','--output','-l','--selector',
      '--field-selector','--timeout','--request-timeout','--watch','--revision'],
    helm: ['-n','--namespace','--kube-context','--kubeconfig','-f','--values','--set','--set-string',
      '--version','--timeout','-o','--output','--revision','--show-only','--include-crds','--debug'],
    argocd: ['-o','--output','--server','--grpc-web','--revision','--refresh','--hard-refresh']
  };
  return args.slice(verb.split(' ').length).every(argument =>
    !argument.startsWith('-') || flags[executable].includes(argument.split('=')[0]));
}

// The legacy pattern stays as the conservative fallback and for code embedded in quoted strings.
const remotePublication = /\bgit\b[^;\n]*\bpush\b|\bgh\b[^;\n]*\bpr\s+merge\b/i;
const gitValueOptions = new Set(['-C','-c','--git-dir','--work-tree','--namespace','--config-env','--super-prefix']);
const messageOptions = new Set(['-m','--message','--grep']);
const commandName = word => word.split(/[\\/]/).at(-1).toLowerCase().replace(/\.exe$/,'');

function shellSegments(command) {
  const segments = [[]];
  let word = null, quote = null;
  const end = () => { if (word !== null) segments.at(-1).push(word); word = null; };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") { if (c === "'") quote = null; else word += c; continue; }
    if (c === '\\') {
      if (command[i + 1] !== '\n') word = (word ?? '') + (command[i + 1] ?? '');
      i++;
      continue;
    }
    if (quote === '"') { if (c === '"') quote = null; else word += c; continue; }
    if (c === "'" || c === '"') { quote = c; word ??= ''; continue; }
    if (/[;&|()\n]/.test(c)) { end(); segments.push([]); continue; }
    if (/[\s<>]/.test(c)) { end(); continue; }
    word = (word ?? '') + c;
  }
  if (quote) return null;
  end();
  return segments.filter(words => words.length);
}

function gitSubcommand(words, start) {
  for (let i = start; i < words.length; i++) {
    if (!words[i].startsWith('-')) return words[i];
    if (gitValueOptions.has(words[i])) i++;
  }
  return null;
}

function remotePublicationCommand(command) {
  const segments = /[$`]|[<>]\(|\beval\b|\bxargs\b|\balias\./i.test(command) ? null : shellSegments(command);
  // Expansions, aliases and indirect execution cannot be resolved statically: fail closed.
  if (!segments) return remotePublication.test(command) ||
    (/\bgit\b/i.test(command) && /\bpush\b/i.test(command)) || (/\bgh\b/i.test(command) && /\bmerge\b/i.test(command));
  return segments.some(words => words.some((word, i) => {
    const name = commandName(word);
    if (name === 'git' && gitSubcommand(words, i + 1) === 'push') return true;
    if (name === 'gh') {
      const pr = words.indexOf('pr', i + 1);
      if (pr > i && words.indexOf('merge', pr + 1) > pr) return true;
    }
    if (!remotePublication.test(word)) return false;
    const message = messageOptions.has(words[i - 1]) || /^(?:-m|--message=|--grep=)/.test(word);
    return !(message && words.slice(0, i).some(other => commandName(other) === 'git'));
  }));
}

// az/gh: only read-only observation passes; every other subcommand needs the human operator.
const shells = new Set(['bash','sh','zsh','dash','ksh']);
const namesAzGh = /(?:^|[\s;&|()'"`=])(?:[^\s;&|()'"`]*[\\/])?(?:az|gh)(?:\.exe)?(?=$|[\s;&|()'"`])/i;
const indirect = /[$`]|[<>]\(|\beval\b|\bxargs\b/i;
const azCredentialWord = /^(?:.*-)?(?:keys?|credentials?|secrets?|connection-strings?|passwords?|tokens?)$|^(?:appsettings|sas)$/;
// Leaf commands that take positional arguments, so a trailing `list` would be an argument, not a subcommand.
const azPositionalLeaves = ['acr build','acr run','acr pack build','acr helm delete','acr helm push',
  'acr manifest delete','acr manifest restore','acr manifest update-metadata','acr manifest metadata update',
  'config set','config unset','config param-persist delete','demo secret-store save','storage blob sync','storage copy'];
const azDenied = ['rest','login','logout','aks get-credentials','acr login','account get-access-token',...azPositionalLeaves];
const shellKeywords = new Set(['if','then','elif','else','do','while','until','!','{','}']);
const cannotLaunch = new Set(['which','type','whereis','echo','printf','grep','egrep','fgrep','rg','man']);
const truthy = ['1','t','T','true','TRUE','True'];
const prCreateValueFlags = new Set(['--title','--body','--body-file','--base','--head','--assignee','--label',
  '--milestone','--project','--reviewer','--template','--recover','--repo']);

// pflag lets a value flag written without `=` take the next word, even `--draft`.
function prCreateDraft(args) {
  let draft = false;
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === '--') break;
    const long = argument.match(/^--draft(?:=(.*))?$/);
    if (long) { draft = long[1] === undefined || truthy.includes(long[1]); continue; }
    if (argument.startsWith('--')) { if (prCreateValueFlags.has(argument)) i++; continue; }
    if (!/^-./.test(argument)) continue;
    for (let j = 1; j < argument.length; j++) {
      if (argument[j] === 'd') {
        if (argument[j + 1] === '=') { draft = truthy.includes(argument.slice(j + 2)); break; }
        draft = true;
      } else if ('tbFBHalmprTR'.includes(argument[j])) { if (j === argument.length - 1) i++; break; }
    }
  }
  return draft;
}
const ghAllowed = {
  pr:{view:'observe',list:'observe',diff:'observe',checks:'observe',status:'observe',checkout:'allow',comment:'allow'},
  issue:{view:'observe',list:'observe',status:'observe',comment:'allow'},
  run:{view:'observe',list:'observe',watch:'observe',download:'allow'},
  workflow:{view:'observe',list:'observe'},
  release:{view:'observe',list:'observe',download:'allow'},
  repo:{view:'observe',list:'observe'},
  label:{list:'observe'},
  auth:{status:'observe'}
};

function skipOptions(words, valueOptions) {
  while (words[0]?.startsWith('-') && words[0] !== '-') {
    const option = words.shift();
    if (option === '--') break;
    if (valueOptions.includes(option)) words.shift();
  }
}

// Strip launchers that run their arguments as the real command.
function unwrap(segment) {
  const words = [...segment];
  while (words.length) {
    const name = commandName(words[0]);
    if (shellKeywords.has(words[0]) || /^[A-Za-z_]\w*=/.test(words[0])) { words.shift(); continue; }
    if (name === 'env') {
      words.shift();
      while (words[0]?.startsWith('-') && words[0] !== '-') {
        const option = words.shift();
        if (option === '--') break;
        if (option === '-S' || option === '--split-string') words.unshift(...(words.shift() ?? '').split(/\s+/).filter(Boolean));
        else if (option.startsWith('--split-string=')) words.unshift(...option.slice(15).split(/\s+/).filter(Boolean));
        else if (['-u','--unset','-C','--chdir'].includes(option)) words.shift();
      }
      continue;
    }
    if (name === 'command') {
      words.shift();
      if (['-v','-V'].includes(words[0])) return [];
      skipOptions(words, []);
      continue;
    }
    if (name === 'time' || name === 'nohup') { words.shift(); skipOptions(words, []); continue; }
    if (name === 'exec') { words.shift(); skipOptions(words, ['-a']); continue; }
    if (name === 'nice') { words.shift(); skipOptions(words, ['-n','--adjustment']); continue; }
    if (name === 'sudo') {
      words.shift();
      skipOptions(words, ['-u','-g','-h','-p','-C','-D','-r','-t','-U','-T','--user','--group','--host',
        '--prompt','--close-from','--chdir','--role','--type','--other-user','--command-timeout']);
      continue;
    }
    if (name === 'timeout') { words.shift(); skipOptions(words, ['-s','-k','--signal','--kill-after']); words.shift(); continue; }
    break;
  }
  return words;
}

function azVerdict(args) {
  const path = [];
  for (const argument of args) { if (argument.startsWith('-')) break; path.push(argument.toLowerCase()); }
  const joined = path.join(' '), label = ['az', ...path].join(' ');
  if (!path.length) return {verdict:args.length === 1 && args[0] === '--version' ? 'observe' : 'deny', label};
  if (path.some(word => azCredentialWord.test(word) || !/^[a-z][a-z0-9-]*$/.test(word)) ||
      (path[0] === 'iot' && path.includes('policy')) ||
      azDenied.some(d => joined === d || joined.startsWith(`${d} `))) return {verdict:'deny', label};
  const read = ['version','aks get-versions','aks get-upgrades'].includes(joined) ||
    (path.length > 1 && ['show','list','query'].includes(path.at(-1)));
  return {verdict:read ? 'observe' : 'deny', label};
}

function ghApiReadOnly(args) {
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === 'graphql') return false;
    if (/^-[A-Za-z]/.test(argument)) {
      for (let j = 1; j < argument.length; j++) {
        const option = argument[j];
        if (option === 'f' || option === 'F') return false;
        if (option === 'X') {
          const method = argument.slice(j + 1) || args[++i];
          if (method?.toUpperCase() !== 'GET') return false;
          break;
        }
        if ('Hqtp'.includes(option)) { if (j === argument.length - 1) i++; break; }
      }
      continue;
    }
    if (/^--(?:field|raw-field|input)(?:$|=)/.test(argument)) return false;
    if (argument === '--method' || argument.startsWith('--method=')) {
      const method = argument === '--method' ? args[++i] : argument.slice(9);
      if (method?.toUpperCase() !== 'GET') return false;
      continue;
    }
    if (['--header','--jq','--template','--preview','--hostname','--cache'].includes(argument)) i++;
  }
  return true;
}

// gh resolves its command path after removing flags it cannot know are boolean, so any flag
// other than --repo before the subcommand could swallow the real subcommand: deny it.
function ghVerdict(args) {
  if (args.length === 1 && args[0] === '--version') return {verdict:'observe', label:'gh --version'};
  const positional = [];
  let index = -1;
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === '-R' || argument === '--repo') { i++; continue; }
    if (/^(?:-R.|--repo=)/.test(argument)) continue;
    if (argument.startsWith('-')) return {verdict:'deny', label:`gh ${[...positional, argument].join(' ')}`};
    positional.push(argument);
    index = i;
    if (positional.length === 2 || ['api','search','status','version'].includes(argument)) break;
  }
  const [group, sub] = positional, label = ['gh', ...positional].join(' ');
  if (!group) return {verdict:'deny', label};
  if (group === 'api') return {verdict:ghApiReadOnly(args.slice(index + 1)) ? 'observe' : 'deny', label:'gh api'};
  if (['search','status','version'].includes(group)) return {verdict:'observe', label};
  if (group === 'pr' && sub === 'create') return {verdict:prCreateDraft(args.slice(index + 1)) ? 'allow' : 'deny', label};
  if (group === 'auth' && sub === 'status' &&
      args.slice(index + 1).some(a => /^--show-token(?:=|$)/.test(a) || /^-[^-]*t/.test(a))) return {verdict:'deny', label:`${label} --show-token`};
  return {verdict:ghAllowed[group]?.[sub] ?? 'deny', label};
}

// Returns the -c command string, or null when the shell reads a script or stdin.
function shellCommandString(words) {
  let command = false;
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (word === '--' || word === '-') return command ? words[i + 1] ?? null : null;
    if (word.startsWith('--')) { if (['--rcfile','--init-file'].includes(word)) i++; continue; }
    if (/^[-+]./.test(word)) {
      if (word[0] === '-' && word.includes('c')) command = true;
      i += [...word.slice(1)].filter(letter => letter === 'o' || letter === 'O').length;
      continue;
    }
    return command ? word : null;
  }
  return null;
}

// Returns denials for az/gh commands and whether every segment is a read-only observation.
function classifyCommand(command, depth = 0) {
  const result = {denials:[], observation:true};
  const segments = indirect.test(command) || depth > 4 ? null : shellSegments(command);
  if (!segments) {
    if (namesAzGh.test(command)) result.denials.push('az/gh with shell expansion or indirect execution requires the human operator; run it literally');
    result.observation = false;
    return result;
  }
  for (const segment of segments) {
    const words = unwrap(segment);
    if (!words.length) continue;
    const name = commandName(words[0]);
    // A shell may also be launched through another program, as in `find -exec sh -c …`.
    const launched = cannotLaunch.has(name) ? -1 : words.findIndex((word, i) => i > 0 && shells.has(commandName(word)));
    if (shells.has(name) || name === 'source' || name === '.' || launched > 0) {
      const script = name === 'source' || name === '.' ? null : shellCommandString(words.slice(Math.max(launched, 0)));
      if (script !== null) {
        const inner = classifyCommand(script, depth + 1);
        result.denials.push(...inner.denials);
        result.observation &&= inner.observation && launched < 0;
      } else {
        if (namesAzGh.test(command)) result.denials.push('az/gh fed to a shell script or stdin requires the human operator; run az/gh literally');
        result.observation = false;
      }
      if (launched < 0) continue;
    }
    if (name === 'az' || name === 'gh') {
      const {verdict, label} = (name === 'az' ? azVerdict : ghVerdict)(words.slice(1));
      if (verdict === 'deny') result.denials.push(`${label} requires the human operator; only read-only az/gh observation is allowed`);
      result.observation &&= verdict === 'observe';
      continue;
    }
    if (words.slice(1).some(word => ['az','gh'].includes(commandName(word))) &&
        (!cannotLaunch.has(name) || (name === 'rg' && words.some(word => word.startsWith('--pre'))))) {
      result.denials.push(`az/gh launched through ${name} requires the human operator; run az/gh literally`);
    }
    result.observation &&= isReadOnlyDeploymentCommand(words.join(' '));
  }
  return result;
}

function decide(payload) {
  const name = payload?.toolName ?? payload?.tool_name;
  let args = payload?.toolArgs ?? payload?.tool_input;
  if (typeof name !== 'string' || args === undefined) throw new Error('Unknown hook payload');
  if (process.argv[2] === 'codex' && name.toLowerCase() === 'apply_patch'
      && typeof args?.command === 'string') {
    args = {...args, patch:args.command};
  }
  if (typeof args === 'string') {
    // apply_patch may be a raw patch rather than JSON.
    if (args.startsWith('*** Begin Patch')) args = {patch:args};
    else args = JSON.parse(args);
  }
  if (!args || typeof args !== 'object') throw new Error('Invalid tool arguments');
  const config = configAt(payload.cwd ?? process.cwd());
  const paths = config.release?.productionPaths ?? [];
  if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string' || !p)) throw new Error('Invalid productionPaths configuration');
  const tool = name.toLowerCase().split(/[./]/).at(-1);
  const read = ['read','view','grep','rg','glob','web_fetch','web_search'].includes(tool);
  if (read) return {};
  const command = typeof args.command === 'string' ? args.command : '';
  const targets = ['path','file_path','filePath','target_file'].map(k => args[k]).filter(p => typeof p === 'string');
  const patches = ['apply_patch','edit'].includes(tool) ? [args.patch, args.input] : [];
  for (const value of patches) {
    if (typeof value !== 'string' || !value.startsWith('*** Begin Patch')) continue;
    for (const match of value.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)) targets.push(match[1]);
  }
  const protectedPath = path => {
    const normalized = resolve(payload.cwd ?? process.cwd(),path).replaceAll('\\','/');
    return /(?:^|\/)(?:prod|production)(?:\/|$)|(?:^|\/)values[-.]prod(?:uction)?\.ya?ml$/i.test(normalized) ||
      paths.some(p => normalized.includes(p.replaceAll('\\','/')));
  };
  const reasons = [];
  // A Codex patch carries file text, not a shell command; its target paths are checked below.
  const classified = tool === 'apply_patch' ? {denials:[], observation:false} : classifyCommand(command);
  const readOnlyDeployment = isReadOnlyDeploymentCommand(command) || (classified.observation && !/[<>]/.test(command));
  if (remotePublicationCommand(command)) reasons.push('Remote push/merge requires the human operator in v1');
  reasons.push(...new Set(classified.denials));
  if (!readOnlyDeployment && /\b(?:argocd|kubectl|helm)\b[^;\n]*\b(?:sync|apply|create|delete|patch|edit|upgrade|install|rollback|set|scale|rollout|exec)\b/i.test(command)) reasons.push('Direct deployment mutation is not allowed; prepare GitOps proposals');
  if (targets.some(protectedPath) ||
      (!readOnlyDeployment && (/(?:\/|\s)(?:prod|production)(?:\/|\s)|values[-.]prod(?:uction)?\.ya?ml/i.test(command) ||
      paths.some(p => command.includes(p.replaceAll('\\','/')))))) reasons.push('Production desired-state edits require a human; write a production-proposal instead');
  // A neutral result must not pre-authorize a call in the host's permission system.
  return reasons.length ? {permissionDecision:'deny',permissionDecisionReason:reasons.join('; ')} : {};
}

let result;
try { result = decide(JSON.parse(readFileSync(0, 'utf8'))); }
catch (error) { result = {permissionDecision:'deny',permissionDecisionReason:`SDLC guard could not evaluate input: ${error.message}`}; }
console.log(JSON.stringify(process.argv[2] === 'claude'
  ? {hookSpecificOutput:{hookEventName:'PreToolUse',...result}}
  : process.argv[2] === 'codex' && Object.keys(result).length
    ? {hookSpecificOutput:{hookEventName:'PreToolUse',...result}}
    : result));
