import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
const require=createRequire(import.meta.url);
const wasm=require('../../verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js');
const web=await import('../../apps/arkhe-intra/public/verifier/arkhe_verify_wasm.js');
await web.default({module_or_path:readFileSync(new URL('../../apps/arkhe-intra/public/verifier/arkhe_verify_wasm_bg.wasm',import.meta.url))});
const fixture=JSON.parse(readFileSync(new URL('./fixtures/cin-synthetic.json',import.meta.url)));
const trust=readFileSync(new URL('./fixtures/test-trust-key.hex',import.meta.url),'utf8').trim();
const verify=(credential,bundle,key=trust)=>wasm.verify_gov_synthetic(Buffer.from(credential),JSON.stringify(bundle),key);
test('four synthetic QR payloads verify offline with independently pinned test trust',()=>{
  let calls=0;const fail=()=>{calls++;throw new Error('network forbidden');};
  const saved=[globalThis.fetch,net.connect,net.createConnection,http.request,https.request];
  try {
    globalThis.fetch=net.connect=net.createConnection=http.request=https.request=fail;
    for(let i=0;i<4;i++) {
      const bundle=fixture.bundles[i];
      assert.equal(verify(fixture.credentialPayloads[i],bundle),true);
      assert.equal(web.verify_gov_synthetic(Buffer.from(fixture.credentialPayloads[i]),JSON.stringify(bundle),trust),true);
      const preimage=Buffer.concat([Buffer.from('AKG:GOV:SYNTHETIC-EVIDENCE:v1\0'),Buffer.from(bundle.evidence.credential_digest)]);
      const leaf=Buffer.from(wasm.blake3_hex(preimage),'hex');
      assert.equal(wasm.verify_mmr(leaf,4,JSON.stringify(bundle.proof),Buffer.from(bundle.checkpoint_root)),true);
    }
    assert.equal(calls,0);
  } finally {[globalThis.fetch,net.connect,net.createConnection,http.request,https.request]=saved;}
});
test('tampered byte, proof replay, untrusted root/key and malformed proof are rejected',()=>{
  const bundle=fixture.bundles[0],payload=fixture.credentialPayloads[0];
  assert.equal(verify('X'+payload.slice(1),bundle),false);
  assert.equal(web.verify_gov_synthetic(Buffer.from('X'+payload.slice(1)),JSON.stringify(bundle),trust),false);
  assert.equal(web.verify_gov_synthetic(Buffer.from(fixture.credentialPayloads[1]),JSON.stringify(bundle),trust),false);
  assert.equal(verify(fixture.credentialPayloads[1],bundle),false);
  const changed=structuredClone(bundle);changed.checkpoint_root[0]^=1;assert.equal(verify(payload,changed),false);
  assert.equal(verify(payload,bundle,'00'.repeat(32)),false);
  const position=structuredClone(bundle);position.leaf_index=1;assert.throws(()=>verify(payload,position));
  const count=structuredClone(bundle);count.leaf_count=5;assert.throws(()=>verify(payload,count));
  const sibling=structuredClone(bundle);sibling.proof[0].hash[0]^=1;assert.equal(verify(payload,sibling),false);
  const proof=structuredClone(bundle);proof.proof.pop();assert.throws(()=>verify(payload,proof));
  const signature=structuredClone(bundle);signature.checkpoint_signature_hex='00'.repeat(64);assert.equal(verify(payload,signature),false);
});
test('saved local anchor receipt binds the generated checkpoint digest, without claiming consensus verification',()=>{
  const checkpoint=JSON.parse(readFileSync(new URL('./fixtures/besu-checkpoint.json',import.meta.url)));
  const receipt=JSON.parse(readFileSync(new URL('../../docs/evidence/gov/2026-10-21/besu-anchor.json',import.meta.url)));
  const digest=wasm.blake3_hex(Buffer.concat([Buffer.from('AKG:CHECKPOINT:v1\0'),Buffer.from(checkpoint.checkpoint_cbor_hex,'hex')]));
  assert.equal(digest,checkpoint.checkpoint_digest);
  assert.equal(receipt.checkpoint_digest,digest);
  for(const bundle of fixture.bundles) assert.equal(Buffer.from(bundle.checkpoint_root).toString('hex'),checkpoint.checkpoint.mmr_root);
  assert.equal(receipt.leaf_count,4);assert.equal(receipt.offline_mmr_verified,true);
  assert.match(receipt.transaction,/^0x[a-f0-9]{64}$/);
});
