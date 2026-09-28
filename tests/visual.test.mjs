import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';
import { startVisualServer } from '../scripts/visual-server.mjs';

async function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-visual-'));
  writeFileSync(join(root,'index.html'), '<h1>Choose</h1>');
  writeFileSync(join(root,'options.json'), JSON.stringify(['map','table']));
  const server = await startVisualServer(root, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(r => server.close(r)); rmSync(root,{recursive:true}); });
  return {root, base};
}
test('serves local mockup and persists selection without treating it as approval', async t => {
  const {root,base} = await setup(t);
  assert.match(await (await fetch(base)).text(), /Choose/);
  const response = await fetch(`${base}/selection`, {method:'POST', headers:{'Content-Type':'application/json', Origin:base}, body:JSON.stringify({option:'map'})});
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(readFileSync(join(root,'selection.json'))).option,'map');
  assert.equal(JSON.parse(readFileSync(join(root,'selection.json'))).approved, false);
});
test('rejects foreign origins, wrong host, traversal, symlinks and non-options', async t => {
  const {root,base} = await setup(t);
  assert.equal((await fetch(`${base}/selection`, {method:'POST',headers:{Origin:'https://evil.example'}, body:'{}'})).status,403);
  const status = await new Promise((resolve, reject) => {
    get(base, {headers:{Host:'evil.example'}}, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status,403);
  assert.equal((await fetch(`${base}/%2e%2e%2fpackage.json`)).status,403);
  symlinkSync(join(process.cwd(),'package.json'),join(root,'escape.json'));
  assert.equal((await fetch(`${base}/escape.json`)).status,403);
  assert.equal((await fetch(`${base}/selection`, {method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{"option":"unknown"}'})).status,400);
});
