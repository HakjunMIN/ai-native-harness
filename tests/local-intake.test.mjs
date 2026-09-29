import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, symlinkSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, validateState, nextPhase } from '../scripts/state.mjs';

function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(),'sdlc-local-'));
  t.after(() => rmSync(repo,{recursive:true,force:true}));
  const request = join(repo,'request.md');
  writeFileSync(request,'# Local request\n\nUpdate the documentation without Jira.\n');
  const start = (id = 'local-doc-change') => spawnSync(process.execPath,
    ['scripts/intake.mjs','start',id,request,repo],{encoding:'utf8'});
  const statePath = join(repo,'docs/sdlc/local-doc-change/state.json');
  return {repo,request,start,statePath};
}

test('starts a resumable local SDLC without Jira or gate approval', t => {
  const {repo,start,statePath,request} = fixture(t);
  const result = start();
  assert.equal(result.status,0,result.stderr);
  const state = JSON.parse(readFileSync(statePath,'utf8'));
  assert.equal(state.ticket,'local-doc-change');
  assert.equal(state.intake.kind,'local');
  assert.equal(state.uiChange,false);
  assert.equal(state.jira,undefined);
  assert.deepEqual(state.publications,[]);
  assert.equal(state.gates.G0.status,'pending');
  assert.equal(readFileSync(join(repo,'docs/sdlc/local-doc-change/intake.md'),'utf8'),readFileSync(request,'utf8'));
  assert.deepEqual(validateState(state,join(repo,'docs/sdlc/local-doc-change')),[]);
  const check = spawnSync(process.execPath,['scripts/state.mjs','check',statePath],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  assert.match(check.stdout,/discover/);
  assert.equal(spawnSync(process.execPath,['scripts/state.mjs','next',statePath],{encoding:'utf8'}).stdout.trim(),'discover');
  assert.notEqual(start().status,0);
});

test('starts from the target repository working directory without a root argument', t => {
  const {repo,statePath} = fixture(t);
  const result = spawnSync(process.execPath,
    [resolve('scripts/intake.mjs'),'start','local-doc-change','./request.md'],
    {cwd:repo,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(realpathSync(result.stdout.trim()),realpathSync(statePath));
  assert.equal(JSON.parse(readFileSync(statePath,'utf8')).intake.kind,'local');
});

test('local intake is immutable evidence and G0 must bind it before planning', t => {
  const {repo,start,statePath} = fixture(t);
  assert.equal(start().status,0);
  const root = join(repo,'docs/sdlc/local-doc-change');
  const state = JSON.parse(readFileSync(statePath,'utf8'));
  writeFileSync(join(root,'other.md'),'Synthetic discovery evidence.\n');
  const other = {path:'other.md',sha256:digest(readFileSync(join(root,'other.md')))};
  state.gates.G0 = {status:'passed',evidence:[other]};
  assert.match(validateState(state,root).join('\n'),/G0.*local intake/);
  state.gates.G0.evidence = {path:'other.md'};
  assert.match(validateState(state,root).join('\n'),/G0.*local intake/);
  state.gates.G0.evidence = [other];
  state.gates.G0.evidence.push(state.intake.request);
  state.phase = 'discover';
  assert.deepEqual(validateState(state,root),[]);
  state.intake.request = other;
  assert.match(validateState(state,root).join('\n'),/reference intake.md/);
  state.intake.request = {path:'intake.md',sha256:digest(readFileSync(join(root,'intake.md')))};
  state.ticket = 'local-other';
  assert.match(validateState(state,root).join('\n'),/match its state directory/);
  state.ticket = 'local-doc-change';
  writeFileSync(join(root,'intake.md'),'changed request');
  assert.match(validateState(state,root).join('\n'),/local intake.*hash mismatch/);
});

test('local light work uses the same ID without requiring model plan review or Jira', t => {
  const {repo,start,statePath} = fixture(t);
  assert.equal(start().status,0);
  const root = join(repo,'docs/sdlc/local-doc-change');
  const state = JSON.parse(readFileSync(statePath,'utf8'));
  const approval = {actor:'human',reference:'synthetic:approval',at:'2026-09-29T00:00:00Z'};
  state.classification = 'bounded';
  state.gates.G0 = {status:'passed',evidence:[state.intake.request]};
  state.gates.G1 = {status:'passed',evidence:[state.intake.request],approval};
  state.phase = 'plan';
  writeFileSync(statePath,JSON.stringify(state));
  writeFileSync(join(repo,'draft.json'),JSON.stringify({changeKind:'documentation',risks:[],
    verificationReason:'Validate links',tickets:[{id:1,title:'Guide',goal:'Readable guidance',
      scope:['Docs'],nonGoals:['Runtime'],blockedBy:[],acceptanceCriteria:[{
        id:'T1-AC1',requirement:'local-AC-1',text:'Valid link',checks:['static']
      }]}]}));
  writeFileSync(join(repo,'config.json'),JSON.stringify({workflow:{boundedProfile:'light'},
    review:{requireDifferentFamily:false,allowHumanReview:true}}));
  const prepare = spawnSync(process.execPath,['scripts/tickets.mjs','prepare',statePath,
    join(repo,'config.json'),join(repo,'draft.json')],{encoding:'utf8'});
  assert.equal(prepare.status,0,prepare.stderr);
  const prepared = JSON.parse(readFileSync(statePath,'utf8'));
  prepared.gates.G2 = {status:'passed',evidence:[prepared.ticketPlan],approval};
  prepared.phase = 'implement';
  assert.deepEqual(validateState(prepared,root),[]);
  assert.equal(nextPhase(prepared),'implement');
  writeFileSync(statePath,JSON.stringify(prepared));
  const ready = spawnSync(process.execPath,['scripts/state.mjs','ready',statePath],{encoding:'utf8'});
  assert.equal(ready.status,0,ready.stderr);
  assert.deepEqual(JSON.parse(ready.stdout),[{id:1,key:'local-doc-change'}]);
});

test('local strict plan proceeds without child Jira publication while preserving G2 review', t => {
  const {repo,start,statePath} = fixture(t);
  assert.equal(start().status,0);
  const root = join(repo,'docs/sdlc/local-doc-change');
  const state = JSON.parse(readFileSync(statePath,'utf8'));
  const approval = {actor:'human',reference:'synthetic:approval',at:'2026-09-29T00:00:00Z'};
  state.gates.G0 = {status:'passed',evidence:[state.intake.request]};
  state.gates.G1 = {status:'passed',evidence:[state.intake.request],approval};
  state.phase = 'plan';
  writeFileSync(statePath,JSON.stringify(state));
  const draft = {changeKind:'documentation',risks:[],verificationReason:'Check Markdown links',tickets:[{
    id:1,title:'Local documentation',goal:'Accurate guidance',scope:['README'],nonGoals:['Code'],blockedBy:[],
    acceptanceCriteria:[{id:'T1-AC1',requirement:'local-AC-1',text:'The guidance is accurate',checks:['static']}]
  }]};
  const config = {workflow:{boundedProfile:'strict'}};
  writeFileSync(join(repo,'draft.json'),JSON.stringify(draft));
  writeFileSync(join(repo,'config.json'),JSON.stringify(config));
  const prepare = spawnSync(process.execPath,['scripts/tickets.mjs','prepare',statePath,
    join(repo,'config.json'),join(repo,'draft.json')],{encoding:'utf8'});
  assert.equal(prepare.status,0,prepare.stderr);
  const planned = JSON.parse(readFileSync(statePath,'utf8'));
  assert.equal(planned.policy.profile,'strict');
  assert.equal(planned.gates.G2.status,'pending');
  planned.gates.G2 = {status:'passed',evidence:[planned.ticketPlan],approval,reviews:[{
    axis:'plan',reviewerType:'model',authorModel:'author',authorFamily:'openai',authorSession:'author-session',
    reviewerModel:'reviewer',reviewerFamily:'anthropic',reviewerSession:'review-session',blocking:0,
    evidence:planned.intake.request
  }]};
  planned.phase = 'implement';
  writeFileSync(statePath,JSON.stringify(planned));
  assert.deepEqual(validateState(planned,root),[]);
  assert.equal(nextPhase(planned),'implement');
  const ready = spawnSync(process.execPath,['scripts/state.mjs','ready',statePath],{encoding:'utf8'});
  assert.equal(ready.status,0,ready.stderr);
  assert.deepEqual(JSON.parse(ready.stdout),[{id:1,key:'local-doc-change'}]);
  planned.publications.push({id:1,status:'pending'});
  assert.match(validateState(planned,root).join('\n'),/local.*publication/);
});

test('refuses unsafe IDs, empty requests, symlink output and existing local runs', t => {
  const {repo,request,start,statePath} = fixture(t);
  for (const id of ['ABC-123','../escape','local-../../escape','local--invalid']) {
    const result = start(id);
    assert.notEqual(result.status,0,id);
    assert.match(result.stderr,/local ID/);
  }
  assert.equal(existsSync(statePath),false);
  writeFileSync(request,'   \n');
  assert.match(start().stderr,/nonempty/);
  writeFileSync(request,'Safe input\n');
  mkdirSync(join(repo,'docs'));
  symlinkSync(tmpdir(),join(repo,'docs/sdlc'));
  assert.match(start().stderr,/symlink/);
  assert.equal(existsSync(statePath),false);
});

test('refuses to replace an existing broken symlink at the chosen local ID', t => {
  const {repo,start,statePath} = fixture(t);
  mkdirSync(join(repo,'docs/sdlc'),{recursive:true});
  symlinkSync(join(repo,'missing'),join(repo,'docs/sdlc/local-doc-change'));
  const result = start();
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/already exists/);
  assert.equal(existsSync(statePath),false);
});

test('local intake rejects a missing request while preserving pending human gates', t => {
  const {repo,start,statePath} = fixture(t);
  assert.equal(start().status,0);
  const root = join(repo,'docs/sdlc/local-doc-change');
  const state = JSON.parse(readFileSync(statePath,'utf8'));
  assert.equal(state.gates.G1.status,'pending');
  assert.equal(state.gates.G2.status,'pending');
  rmSync(join(root,'intake.md'));
  assert.match(validateState(state,root).join('\n'),/local intake: evidence unreadable/);
  const check = spawnSync(process.execPath,['scripts/state.mjs','check',statePath],{encoding:'utf8'});
  assert.notEqual(check.status,0);
});
