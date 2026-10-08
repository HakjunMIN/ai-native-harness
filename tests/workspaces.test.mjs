import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync, cpSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, invalidate } from '../scripts/state.mjs';
import { renderTask } from '../scripts/workflow.mjs';
import { prepareTasks } from '../scripts/tasks.mjs';
import { pinRun } from '../scripts/harness.mjs';

const tool = resolve('scripts/workspaces.mjs');
function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t, dependencies = [[], []], objectFormat) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-workspaces-'));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  const repo = join(root,'repo');
  mkdirSync(repo);
  git(repo,'init','-q',...(objectFormat ? [`--object-format=${objectFormat}`] : []));
  git(repo,'config','user.name','Test User');
  git(repo,'config','user.email','test@example.invalid');
  const directory = join(repo,'docs/sdlc/local-work');
  mkdirSync(directory,{recursive:true});
  const evidence = (name, body) => {
    writeFileSync(join(directory,name),body);
    return {path:name,sha256:digest(body)};
  };
  const intake = evidence('intake.md','Implement independent changes.\n');
  const approval = {actor:'human',reference:'test:approval',at:'2026-09-29T00:00:00Z'};
  const policy = {version:1,profile:'strict',changeKind:'documentation',risks:[],
    requireDifferentFamily:false,allowHumanReview:false,verificationReason:'Static validation'};
  const tasks = dependencies.map((blockedBy, index) => {
    const id = index + 1;
    const ticket = {id,title:`Outcome ${id}`,goal:`Result ${id}`,scope:[`src/${id}.js`],
      nonGoals:['Unrelated paths'],blockedBy,acceptanceCriteria:[{id:`T${id}-AC1`,
        requirement:`AC-${id}`,text:'Works',checks:['static']}]};
    ticket.document = evidence(`ticket-${id}.md`,renderTask(ticket,'local-work'));
    return ticket;
  });
  const plan = evidence('tasks.json',JSON.stringify({format:'canonical-v1',parent:'local-work',policy,tasks}));
  const state = {schemaVersion:2,ticket:'local-work',intake:{kind:'local',request:intake},
    classification:'architectural',uiChange:false,phase:'implement',policy,
    gates:{G0:{status:'passed',evidence:[intake]},G1:{status:'passed',evidence:[intake],approval},
      G2:{status:'passed',evidence:[plan],approval,reviews:[{axis:'plan',blocking:0,
        reviewerType:'model',authorModel:'author',authorFamily:'openai',authorSession:'author-session',
        reviewerModel:'reviewer',reviewerFamily:'openai',reviewerSession:'review-session',evidence:intake}]},
      G3:{status:'pending'},G4:{status:'pending'},G5a:{status:'pending'},G5b:{status:'pending'}},
    taskPlan:plan,slices:tasks.map(({id}) => ({id,status:'pending'})),publications:[],history:[]};
  const statePath = join(directory,'state.json');
  writeFileSync(statePath,JSON.stringify(state));
  const scopePath = join(repo,'scopes.json');
  writeFileSync(scopePath,JSON.stringify(Object.fromEntries(tasks.map(({id}) => [id,[`src/${id}.js`]]))));
  git(repo,'add','.');
  git(repo,'commit','-qm','approved work');
  const run = (command, scopes) => spawnSync(process.execPath,
    [tool,command,statePath,...(scopes ? [scopePath] : [])],{cwd:repo,encoding:'utf8'});
  return {repo,root,statePath,scopePath,run};
}

function reapprove(context, gate = 'G2') {
  const {repo,statePath} = context;
  const previous = JSON.parse(readFileSync(statePath));
  const manifest = JSON.parse(readFileSync(join(dirname(statePath),previous.taskPlan.path)));
  const reset = invalidate(previous,gate,'Test fixture: revise the approved plan');
  reset.gates.G0 = previous.gates.G0;
  reset.gates.G1 = previous.gates.G1;
  reset.phase = 'plan';
  writeFileSync(statePath,JSON.stringify(reset));
  manifest.tasks[0].title += ' revised';
  prepareTasks(statePath,{workflow:{boundedProfile:'strict'},review:{requireDifferentFamily:false}},
    {changeKind:'documentation',risks:[],verificationReason:'Static validation',tasks:manifest.tasks});
  const state = JSON.parse(readFileSync(statePath));
  state.gates.G2 = {...previous.gates.G2,evidence:[state.taskPlan]};
  state.phase = 'implement';
  writeFileSync(statePath,JSON.stringify(state));
  git(repo,'add','.');
  git(repo,'commit','-qm','reapproved test plan');
  return previous;
}

test('one ready ticket uses only an integration branch in the current checkout', t => {
  const {repo,root,statePath,run} = fixture(t,[[]]);
  const preview = run('plan');
  assert.equal(preview.status,0,preview.stderr);
  assert.equal(JSON.parse(preview.stdout).mode,'branch');
  const started = run('start');
  assert.equal(started.status,0,started.stderr);
  const state = JSON.parse(readFileSync(statePath));
  assert.equal(git(repo,'branch','--show-current'),'sdlc/local-work/integration');
  assert.equal(state.slices[0].status,'in_progress');
  assert.equal(state.slices[0].workspace.mode,'branch');
  assert.equal(git(repo,'worktree','list','--porcelain').match(/^worktree /gm).length,1);
  assert.equal(existsSync(join(root,'repo.sdlc-worktrees')),false);
  assert.notEqual(run('start').status,0);
});

test('disjoint ready tasks start in distinct worktrees at the same base revision', t => {
  const {repo,statePath,run} = fixture(t);
  assert.match(run('plan').stderr,/scope/i);
  const preview = run('plan',true);
  assert.equal(preview.status,0,preview.stderr);
  assert.equal(JSON.parse(preview.stdout).mode,'worktree');
  const started = run('start',true);
  assert.equal(started.status,0,started.stderr);
  const state = JSON.parse(readFileSync(statePath));
  const base = git(repo,'rev-parse','HEAD');
  assert.equal(git(repo,'branch','--show-current'),'sdlc/local-work/integration');
  assert.equal(new Set(state.slices.map(slice => slice.workspace.path)).size,2);
  assert.equal(git(repo,'worktree','list','--porcelain').match(/^worktree /gm).length,3);
  for (const slice of state.slices) {
    assert.equal(slice.status,'in_progress');
    assert.equal(slice.workspace.mode,'worktree');
    assert.equal(slice.workspace.baseHead,base);
    assert.equal(git(slice.workspace.path,'rev-parse','HEAD'),base);
    assert.equal(git(slice.workspace.path,'branch','--show-current'),slice.workspace.branch);
  }
  assert.notEqual(run('start',true).status,0);
});

test('overlapping edits defer a ticket instead of running it in parallel', t => {
  const {repo,scopePath,statePath,run} = fixture(t);
  writeFileSync(scopePath,JSON.stringify({'1':['src/shared'],'2':['src/shared/config.js']}));
  git(repo,'add','.');
  git(repo,'commit','-qm','scope audit');
  const preview = JSON.parse(run('plan',true).stdout);
  assert.equal(preview.mode,'branch');
  assert.deepEqual(preview.selected,[1]);
  assert.deepEqual(preview.deferred,[2]);
  const started = run('start',true);
  assert.equal(started.status,0,started.stderr);
  assert.deepEqual(JSON.parse(readFileSync(statePath)).slices.map(slice => slice.status),['in_progress','pending']);
});

test('narrow disjoint tasks take priority over one broad overlapping ticket', t => {
  const {repo,scopePath,run} = fixture(t,[[],[],[]]);
  writeFileSync(scopePath,JSON.stringify({'1':['src'],'2':['src/a.js'],'3':['src/b.js']}));
  git(repo,'add','.');
  git(repo,'commit','-qm','scope audit');
  const preview = run('plan',true);
  assert.equal(preview.status,0,preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout),{mode:'worktree',selected:[2,3],deferred:[1]});
});

test('active worktree keeps a new independent ticket on a worktree', t => {
  const {repo,statePath,run} = fixture(t,[[],[],[1]]);
  assert.equal(run('start',true).status,0);
  const state = JSON.parse(readFileSync(statePath));
  writeFileSync(join(state.slices[0].workspace.path,'first.js'),'implemented\n');
  git(state.slices[0].workspace.path,'add','first.js');
  git(state.slices[0].workspace.path,'commit','-qm','first outcome');
  state.slices[0].status = 'done';
  state.slices[0].attempts = 1;
  state.slices[0].subjectHead = git(state.slices[0].workspace.path,'rev-parse','HEAD');
  state.slices[0].green = state.intake.request;
  state.slices[0].reviews = [{axis:'spec',blocking:0,reviewerType:'model',
    authorModel:'author',authorFamily:'openai',authorSession:'author-session',
    reviewerModel:'reviewer',reviewerFamily:'openai',reviewerSession:'review-session',
    subjectHead:state.slices[0].subjectHead,evidence:state.intake.request},
    {axis:'standards',blocking:0,reviewerType:'model',authorModel:'author',authorFamily:'openai',
      authorSession:'author-session',reviewerModel:'reviewer',reviewerFamily:'openai',
      reviewerSession:'review-session',subjectHead:state.slices[0].subjectHead,evidence:state.intake.request}];
  writeFileSync(statePath,JSON.stringify(state));
  const blocked = run('plan',true);
  assert.equal(blocked.status,0,blocked.stderr);
  assert.deepEqual(JSON.parse(blocked.stdout).selected,[]);
  git(repo,'merge','--no-ff','-m','integrate first outcome',state.slices[0].workspace.branch);
  writeFileSync(join(state.slices[0].workspace.path,'late.js'),'unverified\n');
  assert.deepEqual(JSON.parse(run('plan',true).stdout).selected,[]);
  rmSync(join(state.slices[0].workspace.path,'late.js'));
  const preview = run('plan',true);
  assert.equal(preview.status,0,preview.stderr);
  assert.equal(JSON.parse(preview.stdout).mode,'worktree');
  assert.deepEqual(JSON.parse(preview.stdout).selected,[3]);
  const started = run('start',true);
  assert.equal(started.status,0,started.stderr);
  assert.equal(JSON.parse(readFileSync(statePath)).slices[2].workspace.mode,'worktree');
});

test('dirty base and invalid shared-state scopes never create a branch or workspace', t => {
  const {repo,scopePath,run} = fixture(t);
  writeFileSync(scopePath,JSON.stringify({'1':['docs'],'2':['src/two.js']}));
  const unsafe = run('start',true);
  assert.notEqual(unsafe.status,0);
  assert.match(unsafe.stderr,/shared|docs\/sdlc/i);
  assert.equal(git(repo,'branch','--show-current').startsWith('sdlc/'),false);
  writeFileSync(scopePath,JSON.stringify({'1':['src/one.js'],'2':['src/two.js']}));
  writeFileSync(join(repo,'dirty.js'),'uncommitted');
  const dirty = run('start',true);
  assert.notEqual(dirty.status,0);
  assert.match(dirty.stderr,/clean|uncommitted/i);
  assert.equal(git(repo,'branch','--show-current').startsWith('sdlc/'),false);
});

test('physical symlink aliases cannot masquerade as disjoint scopes', t => {
  const {repo,scopePath,run} = fixture(t);
  mkdirSync(join(repo,'src/real'),{recursive:true});
  symlinkSync('real',join(repo,'src/link'));
  writeFileSync(scopePath,JSON.stringify({'1':['src/link/one.js'],'2':['src/real/two.js']}));
  git(repo,'add','.');
  git(repo,'commit','-qm','alias scopes');
  const result = run('start',true);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/symlink|alias/i);
  assert.equal(git(repo,'branch','--show-current').startsWith('sdlc/'),false);
});

test('G3 revalidation reuses its recorded integration branch, not a second branch', t => {
  const {repo,statePath,run} = fixture(t,[[]]);
  assert.equal(run('start').status,0);
  const state = JSON.parse(readFileSync(statePath));
  state.history.push({event:'invalidate',gate:'G3',previous:{taskPlan:state.taskPlan,
    slices:structuredClone(state.slices)}});
  state.slices = [{id:1,status:'pending'}];
  writeFileSync(statePath,JSON.stringify(state));
  const resumed = run('start');
  assert.equal(resumed.status,0,resumed.stderr);
  assert.equal(git(repo,'branch','--show-current'),'sdlc/local-work/integration');
  assert.equal(JSON.parse(readFileSync(statePath)).slices[0].status,'in_progress');
});

for (const gate of ['G0','G1','G2']) test(`${gate} replanning explicitly reconciles the existing integration branch`, testContext => {
  const context = fixture(testContext,[[]]);
  const {repo,statePath,run} = context;
  assert.equal(run('start').status,0);
  writeFileSync(join(repo,'existing.txt'),'preserve implemented work\n');
  git(repo,'add','.');
  git(repo,'commit','-qm','existing implementation');
  const previous = reapprove(context,gate);
  const head = git(repo,'rev-parse','HEAD');
  assert.notEqual(run('start').status,0,'replanning must not silently reuse the branch');
  const reconciled = run('reconcile');
  assert.equal(reconciled.status,0,reconciled.stderr);
  const state = JSON.parse(readFileSync(statePath));
  assert.equal(state.history.at(-1).event,'workspaces-reconciled');
  assert.equal(state.history.at(-1).baseHead,head);
  assert.deepEqual(state.history.at(-1).taskPlan,state.taskPlan);
  assert.ok(state.history.some(entry => entry.previous?.taskPlan?.sha256 === previous.taskPlan.sha256));
  assert.equal(git(repo,'rev-parse','HEAD'),head);
  const original = readFileSync(statePath,'utf8');
  assert.equal(run('reconcile').status,0);
  assert.equal(readFileSync(statePath,'utf8'),original,'reconciliation is idempotent');
  const resumed = run('start');
  assert.equal(resumed.status,0,resumed.stderr);
  assert.equal(git(repo,'branch','--show-current'),'sdlc/local-work/integration');
  assert.equal(readFileSync(join(repo,'existing.txt'),'utf8'),'preserve implemented work\n');
  assert.equal(JSON.parse(readFileSync(statePath)).slices[0].workspace.baseHead,head);
});

test('reconciliation preserves old worktrees and refuses to bypass their cleanup', testContext => {
  const context = fixture(testContext);
  const {repo,statePath,run} = context;
  assert.equal(run('start',true).status,0);
  const previous = reapprove(context);
  const worktree = previous.slices[0].workspace;
  writeFileSync(join(worktree.path,'unfinished.txt'),'keep this work\n');
  const original = readFileSync(statePath,'utf8');
  const blocked = run('reconcile');
  assert.notEqual(blocked.status,0);
  assert.match(blocked.stderr,/old|archived|worktree/i);
  assert.equal(readFileSync(statePath,'utf8'),original);
  assert.equal(readFileSync(join(worktree.path,'unfinished.txt'),'utf8'),'keep this work\n');
  rmSync(join(worktree.path,'unfinished.txt'));
  for (const slice of previous.slices) git(repo,'worktree','remove',slice.workspace.path);
  assert.notEqual(run('reconcile').status,0,'retained task branches still need reconciliation');
  for (const slice of previous.slices) git(repo,'branch','-d',slice.workspace.branch);
  const reconciled = run('reconcile');
  assert.equal(reconciled.status,0,reconciled.stderr);
  const resumed = run('start',true);
  assert.equal(resumed.status,0,resumed.stderr);
  assert.equal(JSON.parse(resumed.stdout).plan.mode,'worktree');
});

test('reconciliation supports SHA-256 Git workspace revisions', testContext => {
  const context = fixture(testContext,[[]],'sha256');
  const {statePath,run} = context;
  assert.equal(run('start').status,0);
  reapprove(context);
  const reconciled = run('reconcile');
  assert.equal(reconciled.status,0,reconciled.stderr);
  assert.equal(JSON.parse(reconciled.stdout).baseHead.length,64);
  const resumed = run('start');
  assert.equal(resumed.status,0,resumed.stderr);
  assert.equal(JSON.parse(readFileSync(statePath)).slices[0].workspace.baseHead.length,64);
});

test('reconciliation cannot adopt an unrelated branch or bypass renewed approval', testContext => {
  const context = fixture(testContext,[[]]);
  const {repo,statePath,run} = context;
  git(repo,'switch','-c','sdlc/local-work/integration');
  const original = readFileSync(statePath,'utf8');
  const unrelated = run('reconcile');
  assert.notEqual(unrelated.status,0);
  assert.match(unrelated.stderr,/history|recorded|invalidation/i);
  assert.equal(readFileSync(statePath,'utf8'),original);
  git(repo,'switch','-c','unrelated');
  git(repo,'branch','-d','sdlc/local-work/integration');
  assert.equal(run('start').status,0);
  const state = invalidate(JSON.parse(readFileSync(statePath)),'G2','Test fixture: not yet approved');
  writeFileSync(statePath,JSON.stringify(state));
  assert.notEqual(run('reconcile').status,0);
  assert.equal(readFileSync(statePath,'utf8'),JSON.stringify(state));
});

test('reconciliation rejects missing worktree paths that are still registered', testContext => {
  const context = fixture(testContext);
  const {repo,statePath,run} = context;
  assert.equal(run('start',true).status,0);
  const previous = reapprove(context);
  for (const slice of previous.slices) {
    git(repo,'branch','-m',slice.workspace.branch,`archived/t${slice.id}`);
    renameSync(slice.workspace.path,`${slice.workspace.path}.saved`);
  }
  const original = readFileSync(statePath,'utf8');
  const result = run('reconcile');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/still exists or is registered/i);
  assert.equal(readFileSync(statePath,'utf8'),original);
  for (const slice of previous.slices) {
    assert.ok(existsSync(`${slice.workspace.path}.saved`));
    assert.ok(git(repo,'worktree','list','--porcelain').includes(slice.workspace.path));
  }
  git(repo,'worktree','prune');
  const reconciled = run('reconcile');
  assert.equal(reconciled.status,0,reconciled.stderr);
});

test('reconciliation is bound to the current revision and latest plan invalidation', testContext => {
  const context = fixture(testContext,[[]]);
  const {repo,run} = context;
  assert.equal(run('start').status,0);
  reapprove(context);
  assert.equal(run('reconcile').status,0);
  git(repo,'add','.');
  git(repo,'commit','-qm','record reconciliation');
  assert.notEqual(run('start').status,0,'a changed HEAD needs a fresh reconciliation');
  assert.equal(run('reconcile').status,0);
  reapprove(context);
  assert.notEqual(run('start').status,0,'an earlier reconciliation cannot cover a new plan');
  assert.equal(run('reconcile').status,0);
  assert.equal(run('start').status,0);
});

for (const condition of ['dirty source','different branch','uncommitted plan','unrelated ancestry']) {
  test(`reconciliation rejects ${condition} without changing state or Git`, testContext => {
    const context = fixture(testContext,[[]]);
    const {repo,statePath,run} = context;
    assert.equal(run('start').status,0);
    reapprove(context);
    let expected;
    if (condition === 'dirty source') {
      writeFileSync(join(repo,'unfinished.txt'),'preserve this work\n');
      expected = /clean source/i;
    } else if (condition === 'different branch') {
      git(repo,'switch','-c','unrelated');
      expected = /integration branch/i;
    } else if (condition === 'uncommitted plan') {
      git(repo,'reset','--soft','HEAD^');
      expected = /commit.*approved plan/i;
    } else {
      git(repo,'checkout','--orphan','replacement');
      git(repo,'commit','-qm','unrelated history with copied state');
      git(repo,'branch','-f','sdlc/local-work/integration','HEAD');
      git(repo,'switch','sdlc/local-work/integration');
      expected = /ancestor|history/i;
    }
    const original = readFileSync(statePath,'utf8');
    const head = git(repo,'rev-parse','HEAD');
    const status = git(repo,'status','--porcelain');
    const result = run('reconcile');
    assert.notEqual(result.status,0);
    assert.match(result.stderr,expected);
    assert.equal(readFileSync(statePath,'utf8'),original);
    assert.equal(git(repo,'rev-parse','HEAD'),head);
    assert.equal(git(repo,'status','--porcelain'),status);
  });
}

test('reconciliation rejects orphaned task branches and active assignments', testContext => {
  const context = fixture(testContext,[[]]);
  const {repo,statePath,run} = context;
  assert.equal(run('start').status,0);
  reapprove(context);
  git(repo,'branch','sdlc/local-work/t99');
  const original = readFileSync(statePath,'utf8');
  const orphan = run('reconcile');
  assert.notEqual(orphan.status,0);
  assert.match(orphan.stderr,/task branch/i);
  assert.equal(readFileSync(statePath,'utf8'),original);
  git(repo,'branch','-d','sdlc/local-work/t99');
  assert.equal(run('reconcile').status,0);
  assert.equal(run('start').status,0);
  const assigned = readFileSync(statePath,'utf8');
  const active = run('reconcile');
  assert.notEqual(active.status,0);
  assert.match(active.stderr,/pending|assigned|active/i);
  assert.equal(readFileSync(statePath,'utf8'),assigned);
});

test('old G3 history cannot bypass a later G2 reset even for an unchanged plan', testContext => {
  const {repo,statePath,run} = fixture(testContext,[[]]);
  assert.equal(run('start').status,0);
  const revalidation = invalidate(JSON.parse(readFileSync(statePath)),'G3','Test fixture: revalidate');
  writeFileSync(statePath,JSON.stringify(revalidation));
  assert.equal(run('start').status,0);
  const previous = JSON.parse(readFileSync(statePath));
  const reset = invalidate(previous,'G2','Test fixture: renew approval for the same plan');
  reset.taskPlan = previous.taskPlan;
  reset.gates.G2 = previous.gates.G2;
  reset.slices = [{id:1,status:'pending'}];
  reset.phase = 'implement';
  writeFileSync(statePath,JSON.stringify(reset));
  git(repo,'add','.');
  git(repo,'commit','-qm','reapprove unchanged test plan');
  const blocked = run('start');
  assert.notEqual(blocked.status,0,'old G3 resume must not authorize a later G2 reset');
  assert.match(blocked.stderr,/reconcile/i);
  assert.equal(run('reconcile').status,0);
  assert.equal(run('start').status,0);
});

test('harness upgrade can reconcile and resume through the newly pinned runtime', testContext => {
  const {root,repo,statePath,run} = fixture(testContext,[[]]);
  const source = join(root,'harness-source');
  mkdirSync(source);
  for (const directory of ['skills','agents','hooks','scripts','templates','docs']) {
    cpSync(resolve(directory),join(source,directory),{recursive:true});
  }
  writeFileSync(join(repo,'.git/info/exclude'),'.ai-native-sdlc-revisions/\n');
  const approved = JSON.parse(readFileSync(statePath));
  const original = pinRun(approved,dirname(statePath),repo,source);
  writeFileSync(statePath,JSON.stringify(approved));
  git(repo,'add','.');
  git(repo,'commit','-qm','pin test harness');
  assert.equal(run('start').status,0);
  const skill = join(source,'skills/sdlc/SKILL.md');
  writeFileSync(skill,readFileSync(skill,'utf8')+'\nTest fixture workflow revision\n');
  const upgraded = spawnSync(process.execPath,[resolve('scripts/harness.mjs'),'upgrade',statePath,
    '--source',source,'--reason','Test fixture: upgrade active work','--confirm'],{cwd:repo,encoding:'utf8'});
  assert.equal(upgraded.status,0,upgraded.stderr);
  const reset = JSON.parse(readFileSync(statePath));
  assert.equal(reset.phase,'discover');
  assert.ok(Object.values(reset.gates).every(gate => gate.status === 'pending'));
  const lock = JSON.parse(readFileSync(join(dirname(statePath),'harness.lock.json')));
  assert.notEqual(lock.harness.contentSha256,original.contentSha256);
  assert.notEqual(run('reconcile').status,0,'upgrade is not gate approval');
  reset.gates.G0 = approved.gates.G0;
  reset.gates.G1 = approved.gates.G1;
  reset.phase = 'plan';
  writeFileSync(statePath,JSON.stringify(reset));
  const manifest = JSON.parse(readFileSync(join(dirname(statePath),approved.taskPlan.path)));
  prepareTasks(statePath,{workflow:{boundedProfile:'strict'},review:{requireDifferentFamily:false}},
    {changeKind:'documentation',risks:[],verificationReason:'Static validation',tasks:manifest.tasks});
  const replanned = JSON.parse(readFileSync(statePath));
  replanned.gates.G2 = {...approved.gates.G2,evidence:[replanned.taskPlan]};
  replanned.phase = 'implement';
  writeFileSync(statePath,JSON.stringify(replanned));
  git(repo,'add','.');
  git(repo,'commit','-qm','approve test plan under upgraded harness');
  const head = git(repo,'rev-parse','HEAD');
  assert.notEqual(run('start').status,0);
  const reconciled = run('reconcile');
  assert.equal(reconciled.status,0,reconciled.stderr);
  assert.equal(JSON.parse(reconciled.stdout).baseHead,head);
  const resumed = run('start');
  assert.equal(resumed.status,0,resumed.stderr);
  const state = JSON.parse(readFileSync(statePath));
  assert.equal(state.slices[0].workspace.baseHead,head);
  assert.deepEqual(state.harness,replanned.harness);
  assert.ok(state.history.some(entry => entry.event === 'harness-upgrade'));
  assert.equal(git(repo,'rev-parse','HEAD'),head);
});

test('G3 integration rejects an unmerged worktree commit', t => {
  const {repo,statePath,run} = fixture(t);
  assert.equal(run('start',true).status,0);
  const state = JSON.parse(readFileSync(statePath));
  const slice = state.slices[0];
  writeFileSync(join(slice.workspace.path,'outcome.js'),'implemented\n');
  git(slice.workspace.path,'add','outcome.js');
  git(slice.workspace.path,'commit','-qm','implement first outcome');
  slice.status = 'done';
  slice.attempts = 1;
  slice.subjectHead = git(slice.workspace.path,'rev-parse','HEAD');
  slice.green = state.intake.request;
  const review = axis => ({axis,blocking:0,reviewerType:'model',authorModel:'author',authorFamily:'openai',
    authorSession:'author-session',reviewerModel:'reviewer',reviewerFamily:'openai',
    reviewerSession:'review-session',subjectHead:slice.subjectHead,evidence:state.intake.request});
  slice.reviews = [review('spec'),review('standards')];
  state.slices[1].status = 'done';
  state.slices[1].attempts = 1;
  state.slices[1].subjectHead = git(repo,'rev-parse','HEAD');
  state.slices[1].green = state.intake.request;
  state.slices[1].reviews = [review('spec'),review('standards')].map(item =>
    ({...item,subjectHead:state.slices[1].subjectHead}));
  state.gates.G3 = {status:'passed',subjectHead:git(repo,'rev-parse','HEAD'),evidence:[state.intake.request]};
  state.phase = 'verify';
  writeFileSync(statePath,JSON.stringify(state));
  const notMerged = spawnSync(process.execPath,[resolve('scripts/state.mjs'),'check',statePath],
    {cwd:repo,encoding:'utf8'});
  assert.notEqual(notMerged.status,0);
  assert.match(notMerged.stderr,/not integrated|ancestor/i);
  git(repo,'merge','--no-ff','-m','integrate first outcome',slice.workspace.branch);
  state.gates.G3.subjectHead = git(repo,'rev-parse','HEAD');
  writeFileSync(statePath,JSON.stringify(state));
  writeFileSync(join(slice.workspace.path,'dirty.js'),'unverified\n');
  const dirty = spawnSync(process.execPath,[resolve('scripts/state.mjs'),'check',statePath],
    {cwd:repo,encoding:'utf8'});
  assert.notEqual(dirty.status,0);
  assert.match(dirty.stderr,/unverified/i);
  rmSync(join(slice.workspace.path,'dirty.js'));
  const merged = spawnSync(process.execPath,[resolve('scripts/state.mjs'),'check',statePath],
    {cwd:repo,encoding:'utf8'});
  assert.equal(merged.status,0,merged.stderr);
});
