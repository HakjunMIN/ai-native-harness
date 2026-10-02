import { readFileSync, writeFileSync, renameSync, mkdirSync, lstatSync, realpathSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createPolicy, renderTask, taskDefinitionErrors } from './workflow.mjs';
import { digest, validateState, nextPhase } from './state.mjs';
import { dispatchPinned } from './harness.mjs';

function safeDirectory(root, relativePath) {
  let directory = root;
  for (const component of relativePath.split('/')) {
    directory = join(directory,component);
    if (existsSync(directory)) {
      if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) throw new Error('generated directory cannot be a symlink or file');
    } else mkdirSync(directory);
  }
  return directory;
}

function writeGenerated(root, path, body) {
  const directory = safeDirectory(root,dirname(path));
  const full = resolve(root,path);
  if (existsSync(full)) {
    if (lstatSync(full).isSymbolicLink() || readFileSync(full,'utf8') !== body) throw new Error(`immutable generated artifact conflict: ${path}`);
    return;
  }
  const temporary = join(directory,`.${randomUUID()}.tmp`);
  writeFileSync(temporary,body,{flag:'wx'});
  renameSync(temporary,full);
}

export function prepareTasks(statePath, config, draft) {
  const path = resolve(statePath), root = realpathSync(dirname(path));
  if (lstatSync(path).isSymbolicLink()) throw new Error('state file cannot be a symlink');
  const state = JSON.parse(readFileSync(path,'utf8'));
  if (state.gates?.G1?.status !== 'passed' || state.gates?.G2?.status === 'passed' || nextPhase(state) !== 'plan') throw new Error('prepare requires valid G1 and unapproved G2; invalidate G2 before editing approved work');
  const entry = structuredClone(state);
  if (!entry.taskPlan) delete entry.policy;
  const errors = validateState(entry,root);
  if (errors.length) throw new Error(errors.join('\n'));
  const policy = createPolicy(config,state.classification,draft);
  const definitionErrors = taskDefinitionErrors(draft.tasks);
  if (definitionErrors.length) throw new Error(definitionErrors.join('\n'));
  if (policy.profile === 'light' && (draft.tasks.length !== 1 || draft.tasks[0].blockedBy.length)) throw new Error('light policy requires one independent outcome; use strict for decomposed work');
  const tasks = draft.tasks.map(task => {
    const result = structuredClone(task);
    delete result.document;
    return result;
  });
  const definition = {format:'canonical-v1',parent:state.ticket,policy,tasks};
  const revision = `plans/${digest(JSON.stringify(definition))}`;
  if (policy.profile === 'strict') for (const task of tasks) {
    const body = renderTask(task,state.ticket);
    const document = `${revision}/tasks/${task.id}.md`;
    writeGenerated(root,document,body);
    task.document = {path:document,sha256:digest(body)};
  }
  const body = `${JSON.stringify(definition,null,2)}\n`;
  const manifest = `${revision}/tasks.json`;
  writeGenerated(root,manifest,body);
  const updated = {...state,policy,taskPlan:{path:manifest,sha256:digest(body)},
    slices:tasks.map(task => ({id:task.id,status:'pending'}))};
  updated.history.push({at:new Date().toISOString(),event:'plan-prepared',taskPlan:updated.taskPlan,
    previous:{taskPlan:state.taskPlan ?? null,policy:state.policy}});
  const preparedErrors = validateState(updated,root);
  if (preparedErrors.length) throw new Error(preparedErrors.join('\n'));
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary,`${JSON.stringify(updated,null,2)}\n`,{flag:'wx'});
  renameSync(temporary,path);
  return {profile:policy.profile,taskPlan:updated.taskPlan,tasks:tasks.length,gate:'G2 pending'};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command,statePath,configPath,draftPath,...extra] = process.argv.slice(2);
    if (command !== 'prepare' || !statePath || !configPath || !draftPath || extra.length) throw new Error('Usage: tasks.mjs prepare STATE CONFIG DRAFT');
    if (!dispatchPinned('tasks.mjs',statePath)) {
      console.log(JSON.stringify(prepareTasks(statePath,JSON.parse(readFileSync(configPath,'utf8')),JSON.parse(readFileSync(draftPath,'utf8')))));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
