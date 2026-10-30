import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const wasm=createRequire(import.meta.url)('../../verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js');
const web=await import('../../apps/arkhe-intra/public/verifier/arkhe_verify_wasm.js');
await web.default({module_or_path:readFileSync(new URL('../../apps/arkhe-intra/public/verifier/arkhe_verify_wasm_bg.wasm',import.meta.url))});
const fixture=JSON.parse(readFileSync(new URL('./fixtures/lifecycle-synthetic.json',import.meta.url)));
const check=(r=fixture.receipt,t=fixture.trust,c=fixture.context)=>wasm.verify_gov_lifecycle(JSON.stringify(r),JSON.stringify(t),JSON.stringify(c));
test('synthetic lifecycle receipt verifies only in the bound context and freshness window',()=>{
  assert.equal(check(),true);
  assert.equal(web.verify_gov_lifecycle(JSON.stringify(fixture.receipt),JSON.stringify(fixture.trust),JSON.stringify(fixture.context)),true);
  for(const mutate of [c=>c.now=1100,c=>c.now=800,c=>c.challenge[0]^=1,c=>c.audience='other',c=>c.credential_digest[0]^=1]) {
    const context=structuredClone(fixture.context);mutate(context);assert.equal(check(fixture.receipt,fixture.trust,context),false);
  }
  const policy=structuredClone(fixture.trust);policy.max_status_age=1;assert.equal(check(fixture.receipt,policy),false);
  const receipt=structuredClone(fixture.receipt);receipt.revocation='Revoked';assert.equal(check(receipt),false);
});
test('unsupported native qualification and absent/oversized inputs cannot be promoted',()=>{
  const receipt=structuredClone(fixture.receipt);receipt.qualification='GovernmentValidated';assert.throws(()=>check(receipt));
  const context=structuredClone(fixture.context);context.challenge=Array(32).fill(0);assert.throws(()=>check(fixture.receipt,fixture.trust,context));
  assert.throws(()=>wasm.verify_gov_lifecycle(' '.repeat(16385),'{}','{}'));
});
