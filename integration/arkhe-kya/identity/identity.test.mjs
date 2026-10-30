import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { makeFixture, TEST_CNPJ } from './fixture.mjs';
import { verifySyntheticPrincipal } from './verify.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=spawnSync('cargo',['run','--quiet','--locked','--example','fixture'],{cwd:root,encoding:'utf8',timeout:60000});
assert.equal(run.status,0,run.stderr);
const native=JSON.parse(run.stdout),receipt=JSON.stringify(native.passport),context=JSON.stringify(native.context);
const wasm=createRequire(import.meta.url)('../pkg/arkhe_kya_experimental.js');
const prepared=JSON.parse(wasm.principal_authorization_challenge(receipt,context));
assert.equal(prepared.outcome,'CHALLENGE_READY');
const fixture=await makeFixture(prepared.challenge,native.context.now);
const trust={trust_profile:'synthetic-test-pki@1',anchors:fixture.anchors,expected_cnpj:TEST_CNPJ,now:native.context.now,max_crl_age_seconds:300};
const check=(crl=fixture.clean,t=trust,cms=fixture.cms_base64,r=receipt)=>verifySyntheticPrincipal(r,context,{cms_base64:cms,crl_base64:crl},t);
const corrupt=b64=>{const bytes=Buffer.from(b64,'base64');bytes[bytes.length-1]^=1;return bytes.toString('base64');};
test('synthetic CMS chain and CRL pass without legal identity upgrade',async()=>{
 const result=await check();assert.equal(result.outcome,'SYNTHETIC_CMS_CHAIN_AND_CRL_PASSED',JSON.stringify(result));
 assert.equal(result.principal_legal_identity,'NOT_VERIFIED');assert.equal(result.authorization_granted,false);
});
for(const kind of ['revoked','expired','future','tooOld']) test(`reject ${kind} CRL`,async()=>assert.equal((await check(fixture[kind])).outcome,'NOT_VERIFIABLE'));
test('missing CRL fails closed',async()=>assert.equal((await check(null)).reason,'CRL_UNAVAILABLE'));
test('wrong CNPJ fails',async()=>assert.equal((await check(fixture.clean,{...trust,expected_cnpj:'00000000000000'})).outcome,'NOT_VERIFIABLE'));
test('untrusted CA fails',async()=>{const other=await makeFixture(prepared.challenge,trust.now);assert.equal((await check(fixture.clean,{...trust,anchors:other.anchors})).outcome,'NOT_VERIFIABLE');});
test('altered CMS fails',async()=>assert.equal((await check(fixture.clean,trust,corrupt(fixture.cms_base64))).outcome,'NOT_VERIFIABLE'));
test('altered CRL fails',async()=>assert.equal((await check(corrupt(fixture.clean))).outcome,'NOT_VERIFIABLE'));
test('invalid receipt fails before CMS',async()=>assert.equal((await check(fixture.clean,trust,fixture.cms_base64,'{}')).reason,'RECEIPT_CONTEXT_INVALID'));
test('chain bypass field rejected',async()=>assert.equal((await check(fixture.clean,{...trust,requireChain:false})).reason,'INPUT_FIELDS_INVALID'));
test('independent clock mismatch rejected',async()=>assert.equal((await check(fixture.clean,{...trust,now:trust.now+1})).reason,'CLOCK_POLICY_MISMATCH'));
test('required ICP axis still rejects synthetic evidence',()=>{
 const entry=native.policy_cases[0],policy={...JSON.parse(entry.policy_json),require_icp_brasil:true};
 const result=JSON.parse(wasm.verify_passport_json(receipt,context,entry.status_json,JSON.stringify(policy)));
 assert.equal(result.decision,'REJECT');assert.equal(result.authorization_granted,false);
});

test('revoked certificate is explicitly classified',async()=>{const result=await check(fixture.revoked);assert.equal(result.reason,'CERTIFICATE_REVOKED');assert.equal(result.certificate_revocation,'REVOKED');});

test('declared ICP result cannot replace CMS and signed CRL',async()=>{
 const declared={cnpj:TEST_CNPJ,certificate_sha256:'abc',revoked:false,crl_fetched_at:trust.now,expected_cnpj:TEST_CNPJ,verifier_timestamp:trust.now,ttl_ms:300000};
 const result=await verifySyntheticPrincipal(receipt,context,declared,trust);
 assert.equal(result.reason,'INPUT_FIELDS_INVALID');assert.equal(result.principal_legal_identity,'NOT_VERIFIED');assert.equal(result.authorization_granted,false);
});
test('refresh declaration cannot rescue signed stale CRL',async()=>{
 const result=await verifySyntheticPrincipal(receipt,context,{cms_base64:fixture.cms_base64,crl_base64:fixture.expired,crl_fetched_at:trust.now},trust);
 assert.equal(result.reason,'INPUT_FIELDS_INVALID');assert.equal((await check(fixture.expired)).outcome,'NOT_VERIFIABLE');
});
test('freshness policy is mandatory rather than implicit W3C default',async()=>{
 const {max_crl_age_seconds,...missing}=trust;
 assert.equal((await check(fixture.clean,missing)).reason,'INPUT_FIELDS_INVALID');
});
