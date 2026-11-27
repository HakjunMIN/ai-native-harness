import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { digest, validateState } from './state.mjs';
import { currentRunContract, pinRun } from './harness.mjs';
import { withRunWorkspace } from './run-workspace.mjs';

const localId = /^local-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function checkLocalId(id) {
  if (!localId.test(id ?? '') || id.length > 72) throw new Error('local ID must be a short lowercase slug, e.g. local-doc-change');
}

// Every run lives in its own worktree, so the CLI creates the run there, not in the invoking checkout.
function startInWorktree(id, content, repositoryRoot) {
  checkLocalId(id);
  if (!content.trim()) throw new Error('nonempty local request required');
  return withRunWorkspace(id,repositoryRoot,root => startLocalText(id,content,root,{runContract:currentRunContract}));
}

function safeDirectory(root, name) {
  const directory = join(root,name);
  if (pathExists(directory)) {
    if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) throw new Error('local output directory cannot be a symlink or file');
  } else mkdirSync(directory);
  return directory;
}

function pathExists(path) {
  try { lstatSync(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function startLocal(id, requestFile, repositoryRoot = process.cwd()) {
  checkLocalId(id);
  const content = readFileSync(resolve(requestFile),'utf8');
  return startLocalText(id,content,repositoryRoot);
}

// Direct helper calls keep the markerless contract-1 layout; the start commands pass the current contract.
export function startLocalText(id, content, repositoryRoot = process.cwd(), {runContract} = {}) {
  checkLocalId(id);
  if (!content.trim()) throw new Error('nonempty local request required');
  const root = realpathSync(repositoryRoot);
  const directory = safeDirectory(safeDirectory(root,'docs'),'sdlc');
  const target = join(directory,id);
  if (pathExists(target)) throw new Error(`local run already exists: ${id}`);
  const stageParent = join(directory,`.local-${randomUUID()}.tmp`);
  const stage = join(stageParent,id);
  mkdirSync(stageParent);
  try {
    mkdirSync(stage);
    writeFileSync(join(stage,'intake.md'),content,{flag:'wx'});
    const state = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../templates/state.json'),'utf8'));
    state.ticket = id;
    state.uiChange = false;
    state.intake = {kind:'local',request:{path:'intake.md',sha256:digest(content)}};
    delete state.jira;
    state.history.push({at:new Date().toISOString(),event:'local-intake-created',request:state.intake.request});
    pinRun(state,stage,root,undefined,{runContract});
    const errors = validateState(state,stage);
    if (errors.length) throw new Error(errors.join('\n'));
    writeFileSync(join(stage,'state.json'),`${JSON.stringify(state,null,2)}\n`,{flag:'wx'});
    if (pathExists(target)) throw new Error(`local run already exists: ${id}`);
    renameSync(stage,target);
    return join(target,'state.json');
  } finally { rmSync(stageParent,{recursive:true,force:true}); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command,id,...args] = process.argv.slice(2);
    if (command === 'start' && id && args.length >= 1 && args.length <= 2 && args[0]) {
      checkLocalId(id);
      console.log(startInWorktree(id,readFileSync(resolve(args[0]),'utf8'),args[1]));
    } else if (command === 'start-text' && id && args.length <= 1) {
      checkLocalId(id);
      console.log(startInWorktree(id,readFileSync(0,'utf8'),args[0]));
    } else {
      throw new Error('Usage: intake.mjs start LOCAL-ID REQUEST_FILE [REPOSITORY_ROOT]\n       intake.mjs start-text LOCAL-ID [REPOSITORY_ROOT] < request.md');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
