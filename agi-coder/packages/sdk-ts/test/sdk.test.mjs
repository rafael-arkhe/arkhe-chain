import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyMmrInclusion, mmrRoot, totalCost, attestGpu } from '../dist/index.js';
const fixture=JSON.parse(readFileSync(new URL('../../../tests/golden/mmr_vectors.json',import.meta.url)));
test('independent Python vectors match TypeScript; tampering fails',()=>{
  for(const vector of fixture.vectors){
    assert.equal(mmrRoot(vector.count,vector.proofs[0]?.peaks??[]),vector.root);
    vector.proofs.forEach((proof,i)=>{
      assert.equal(verifyMmrInclusion(vector.values[i],proof,vector.root),true);
      assert.equal(verifyMmrInclusion('00'.repeat(32),proof,vector.root),false);
      assert.equal(verifyMmrInclusion(vector.values[i],{...proof,leaf_index:proof.leaf_count},vector.root),false);
      assert.equal(verifyMmrInclusion(vector.values[i],{...proof,leaf_count:proof.leaf_count+1},vector.root),false);
      assert.equal(verifyMmrInclusion(vector.values[i],{...proof,siblings:[...proof.siblings,'00'.repeat(32)]},vector.root),false);
    });
  }
});
test('untrusted JavaScript proof shapes fail closed',()=>{
  for(const proof of [null,{}, {leaf_index:-1,leaf_count:1},{leaf_index:0,leaf_count:2**54,siblings:[],peaks:[]}]) assert.equal(verifyMmrInclusion('00'.repeat(32),proof,'00'.repeat(32)),false);
});
test('cost accounting rejects fractional and overflowing amounts',()=>{
  assert.equal(totalCost([{category:'anchor',micro_usd:123,measured:true}]),123);
  assert.throws(()=>totalCost([{micro_usd:-1}]));assert.throws(()=>totalCost([{micro_usd:0.1}]));assert.throws(()=>totalCost([{micro_usd:Number.MAX_SAFE_INTEGER},{micro_usd:1}]));
});
test('GPU provider never invents verified hardware',()=>assert.equal(attestGpu().verified,false));
