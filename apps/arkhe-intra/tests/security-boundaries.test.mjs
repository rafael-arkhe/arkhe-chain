import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.ARKHE_INTRA_DATA_DIR = mkdtempSync(join(tmpdir(), 'arkhe-security-'));
const { canReadDocument, readAudit } = await import('../lib/documents.mjs');
const { providerEnvironment } = await import('../lib/ollama.mjs');
test('draft privacy and review visibility are explicit', () => {
  const draft = {authorId:'alice', state:'draft'};
  assert.equal(canReadDocument({id:'bob',role:'author'},draft),false);
  assert.equal(canReadDocument({id:'r',role:'reviewer'},draft),false);
  assert.equal(canReadDocument({id:'alice',role:'author'},draft),true);
  assert.equal(canReadDocument({id:'o',role:'owner'},draft),true);
  assert.equal(canReadDocument({id:'r',role:'reviewer'},{...draft,state:'review'}),true);
  assert.throws(()=>readAudit({role:'author'}), /governança/);
});
test('provider never inherits unrelated credentials', () => {
  const env=providerEnvironment({PATH:'test',AWS_SECRET_ACCESS_KEY:'synthetic',ARKHE_API_TOKEN:'synthetic',ARKHE_OLLAMA_CONFIG:'fixture'});
  assert.deepEqual(env,{PATH:'test',ARKHE_OLLAMA_CONFIG:'fixture'});
});

test('failed logins for one account do not block another account', async () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/setup.mjs', import.meta.url))], {env:process.env,stdio:'pipe'});
  const {login}=await import('../lib/auth.mjs');
  const credentials=JSON.parse(readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR,'credentials.json')));
  for(let i=0;i<10;i++) assert.throws(()=>login('author@arkhe.local','synthetic-wrong'));
  assert.throws(()=>login('author@arkhe.local','synthetic-wrong'), error=>error.status===429);
  const other=credentials.find(c=>c.email==='owner@arkhe.local');
  assert.equal(login(other.email,other.password).user.role,'owner');
});
test('HTTP denies cross-author draft read, export, verification, listing and global audit', async () => {
  const {writeFileSync}=await import('node:fs');
  const file=join(process.env.ARKHE_INTRA_DATA_DIR,'accounts.json');
  const accounts=JSON.parse(readFileSync(file));
  const author=accounts.find(a=>a.role==='author');
  accounts.push({...author,id:'second-author',email:'second@arkhe.local'});
  writeFileSync(file,JSON.stringify(accounts));
  const {login}=await import('../lib/auth.mjs');
  const credentials=JSON.parse(readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR,'credentials.json')));
  const credential=credentials.find(c=>c.email==='author@arkhe.local');
  // Clear the prior test's lock for its synthetic account only.
  const {db}=await import('../lib/store.mjs');db().exec('DELETE FROM login_attempts');
  const first=login(credential.email,credential.password), second=login('second@arkhe.local',credential.password);
  const {handle}=await import('../lib/http.mjs');
  async function call(path,token,method='GET',data) {
    return handle(new Request('http://127.0.0.1:3003/api/'+path,{method,headers:{Origin:'http://127.0.0.1:3003','Content-Type':'application/json',Cookie:'arkhe_session='+token},...(data?{body:JSON.stringify(data)}:{})}),path.split('/'));
  }
  const created=await call('documents',first.token,'POST',{title:'Private',department:'Synthetic',body:'Synthetic private draft'});
  assert.equal(created.status,201);const doc=await created.json();
  for(const suffix of ['', '/export', '/verify']) assert.equal((await call('documents/'+doc.id+suffix,second.token)).status,404);
  assert.equal((await call('audit',second.token)).status,403);
  const dashboard=await (await call('dashboard',second.token)).json();
  assert.equal(dashboard.documents.some(d=>d.id===doc.id),false);
});

test('inference telemetry has a fixed schema and never copies arbitrary model metadata', async () => {
  const {inferenceEvent}=await import('../lib/ollama.mjs');
  const event=inferenceEvent('synthetic-request','success',12.6,'sensitive-path-or-content');
  assert.deepEqual(event,{event:'ai.inference',requestId:'synthetic-request',provider:'ollama',outcome:'success',durationMs:13,modelDigest:null});
  assert.equal(inferenceEvent('id','error',1,'a'.repeat(64)).modelDigest,'a'.repeat(64));
});
