import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare} from './prepare-rekor.mjs';
const checkpoint=JSON.parse(readFileSync(new URL('./fixtures/besu-checkpoint.json',import.meta.url)));
test('public proposal contains only a synthetic commitment and no private key or raw credential',()=>{
  const result=prepare(checkpoint);
  assert.equal(result.status,'PREPARED_NOT_PUBLISHED');
  assert.deepEqual(Object.keys(JSON.parse(result.signature.statement)).sort(),['checkpointDigest','profile','scope']);
  assert.equal(JSON.stringify(result).includes('PRIVATE KEY'),false);
  assert.equal(result.entry.kind,'hashedrekord');
});
test('private namespaces and changed checkpoint commitments cannot enter this preparation path',()=>{
  const other=structuredClone(checkpoint);other.checkpoint.tenant_id='private';assert.throws(()=>prepare(other));
  const digest=structuredClone(checkpoint);digest.checkpoint_digest='00'.repeat(32);assert.throws(()=>prepare(digest));
});
