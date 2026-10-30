import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.env.ARKHE_INTRA_DATA_DIR=mkdtempSync(join(tmpdir(),'arkhe-pix-intra-'));
const cwd=fileURLToPath(new URL('../',import.meta.url));
execFileSync(process.execPath,['scripts/setup.mjs'],{cwd,env:process.env,stdio:'pipe'});
const {handle}=await import('../lib/http.mjs');
const {events,auditIntegrity}=await import('../lib/store.mjs');
const credentials=JSON.parse(readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR,'credentials.json')));
const receipt=readFileSync(new URL('../../../integration/arkhe-pix/tests/fixtures/receipt-clear.json',import.meta.url),'utf8');
const key=readFileSync(new URL('../../../integration/arkhe-pix/tests/fixtures/keys/test-signer.pub.hex',import.meta.url),'utf8').trim();
const origin='http://127.0.0.1:3003';let cookie='';
async function request(path,data,auth=true,source=origin){const response=await handle(new Request(origin+'/api/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:source,'Content-Type':'application/json',Cookie:auth?cookie:''},...(data===undefined?{}:{body:JSON.stringify(data)})}),path.split('/'));return {status:response.status,value:await response.json(),response};}
const login=await request('login',credentials.find(c=>c.email.startsWith('owner@')),false);
assert.equal(login.status,200);cookie=login.response.headers.get('set-cookie').split(';')[0];
test('Pix API gates, pinned crypto verification and settlement policy',async t=>{
 await t.test('auth, flag and CSRF remain enforced',async()=>{
  delete process.env.ARKHE_PIX_RECEIPTS;
  assert.equal((await request('enterprise/receipts/policy',undefined,false)).status,401);
  assert.equal((await request('enterprise/receipts/policy')).status,404);
  process.env.ARKHE_PIX_RECEIPTS='1';
  assert.equal((await request('enterprise/receipts/verify',{receipt},true,'https://other.invalid')).status,403);
  delete process.env.ARKHE_PIX_SIGNER_PUBLIC_HEX;
  assert.equal((await request('enterprise/receipts/verify',{receipt})).status,503);
 });
 process.env.ARKHE_PIX_SIGNER_PUBLIC_HEX=key;
 await t.test('operator key cannot be overridden and forged result flags fail',async()=>{
  assert.equal((await request('enterprise/receipts/verify',{receipt,signer:key})).status,400);
  assert.equal((await request('enterprise/receipts/verify',{receipt,verified:true})).status,400);
  assert.equal((await request('enterprise/receipts/verify',{receipt:' '.repeat(32769)})).status,413);
 });
 await t.test('valid synthetic signature never grants payment or onboarding',async()=>{
  delete process.env.ARKHE_PIX_REQUIRE_SETTLEMENT;
  assert.equal((await request('enterprise/receipts/policy')).value.requireSettlement,true);
  const result=await request('enterprise/receipts/verify',{receipt});assert.equal(result.status,200);
  assert.equal(result.value.verification.verdict,'signature_valid_synthetic');
  assert.equal(result.value.decision,'REJECT_SETTLEMENT_UNVERIFIED');
  assert.equal(result.value.paymentConfirmed,false);assert.equal(result.value.onboardingEligible,false);
  process.env.ARKHE_PIX_REQUIRE_SETTLEMENT='0';
  assert.equal((await request('enterprise/receipts/verify',{receipt})).value.decision,'ACCEPT_SYNTHETIC_ONLY');
 });
 await t.test('tampered amount and wrong operator pin reject',async()=>{
  const tampered=JSON.parse(receipt);tampered.receipt.amount_cents=1;
  assert.equal((await request('enterprise/receipts/verify',{receipt:JSON.stringify(tampered)})).value.decision,'REJECT');
  process.env.ARKHE_PIX_SIGNER_PUBLIC_HEX='00'.repeat(32);
  assert.equal((await request('enterprise/receipts/verify',{receipt})).value.decision,'REJECT');
 });
 await t.test('audit retains minimal decisions rather than receipts or parties',()=>{
  const audit=events().filter(row=>row.event.action==='pix-receipt-evaluated');assert.equal(audit.length,4);
  for(const row of audit){assert.deepEqual(Object.keys(row.event.details).sort(),row.event.details.receiptDigest?['decision','profile','receiptDigest']:['decision','profile']);}
  assert.equal(auditIntegrity(),true);
 });
});
