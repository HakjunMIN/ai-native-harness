import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

function configAt(cwd) {
  let dir = resolve(cwd);
  while (true) {
    const file = resolve(dir, 'ai-native-sdlc.config.json');
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
    if (existsSync(resolve(dir, '.git')) || dirname(dir) === dir) return {};
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

function decide(payload) {
  const name = payload?.toolName ?? payload?.tool_name;
  let args = payload?.toolArgs ?? payload?.tool_input;
  if (typeof name !== 'string' || args === undefined) throw new Error('Unknown hook payload');
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
  const readOnlyDeployment = isReadOnlyDeploymentCommand(command);
  if (/\bgit\b[^;\n]*\bpush\b|\bgh\b[^;\n]*\bpr\s+merge\b/i.test(command)) reasons.push('Remote push/merge requires the human operator in v1');
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
  ? {hookSpecificOutput:{hookEventName:'PreToolUse',...result}} : result));
