import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyArtifact } from "../dist/tools/verify-artifact.js";
import { verifyMmr } from "../dist/tools/verify-mmr.js";

test("canonicalization of a claim with a bogus signature never declares verification",async()=>{
  const claim={instanceID:"urn:test",claim_generator_info:[],signature:"not-a-signature",created_assertions:[]};
  const result=await verifyArtifact({kind:"c2pa",json:JSON.stringify(claim)});
  assert.equal(result.status,"CANONICALIZED");assert.equal(result.operation,"C2PA_CLAIM_CANONICALIZATION");
  assert.equal(Object.hasOwn(result,"valid"),false);
  for(const key of ["verification","signatureVerification","provenanceVerification","policyAuthorization"])assert.equal(result[key],"NOT_PERFORMED");
  assert.equal(result.authority,false);
});

test("malformed claims and unsupported verification requests fail",async()=>{
  await assert.rejects(verifyArtifact({kind:"c2pa",json:'{}'}));
  await assert.rejects(verifyArtifact({kind:"c2pa",json:'{'}));
  await assert.rejects(verifyArtifact({kind:"signature",json:'{}'}));
  await assert.rejects(verifyArtifact({kind:"blake3",payloadHex:"00",signature:"pretend"}));
  await assert.rejects(verifyArtifact({kind:"blake3",payloadHex:"00".repeat(65537)}));
});

const vectors=await Promise.all([1,3,4,5,7].map(async n=>JSON.parse(await readFile(new URL(`../../../verification/vectors/mmr/${n}-leaves.json`,import.meta.url),"utf8"))));
const request=(vector,p)=>({leafHex:vector.input.leaves[p.target_index],leafCount:vector.input.leaf_count,
  expectedRootHex:vector.expected_output.root_hash_hex,
  proof:p.inclusion_proof_hashes.map((hashHex,i)=>({hashHex,kind:p.inclusion_proof_kinds[i],direction:p.inclusion_proof_directions[i]}))});

test("real WASM verifies every committed MMR inclusion vector without authenticating its root",async()=>{
  let checked=0;
  for(const vector of vectors)for(const p of vector.expected_output.proofs){
    const result=await verifyMmr(request(vector,p));
    assert.equal(result.status,"PROOF_VALID");assert.equal(result.inclusionVerified,true);
    assert.equal(result.checkpointAuthentication,"NOT_PERFORMED");assert.equal(result.authority,false);checked++;
  }
  assert.equal(checked,20);
});

test("changed leaf, root or proof hash cannot pass the original inclusion proof",async()=>{
  const vector=vectors[1],input=request(vector,vector.expected_output.proofs[0]);
  for(const change of [r=>{r.leafHex="ff".repeat(32);},r=>{r.expectedRootHex="00".repeat(32);},r=>{r.proof[0].hashHex="ff".repeat(32); }]){
    const bad=structuredClone(input);change(bad);
    assert.equal((await verifyMmr(bad)).inclusionVerified,false);
  }
});

test("leaf count and peak/bag shape must agree, even when a hash path matches",async()=>{
  const one=request(vectors[0],vectors[0].expected_output.proofs[0]);
  const result=await verifyMmr({...one,leafCount:2});
  assert.equal(result.inclusionVerified,false);assert.equal(result.proofShapeValid,false);
  const four=request(vectors[2],vectors[2].expected_output.proofs[0]);
  assert.equal((await verifyMmr({...four,leafCount:8})).inclusionVerified,false);
});

test("MMR rejects malformed and oversized inputs before accepting an inclusion claim",async()=>{
  const good=request(vectors[1],vectors[1].expected_output.proofs[0]);
  for(const input of [{...good,leafCount:0},{...good,leafCount:0x100000000},{...good,expectedRootHex:"00"},
    {...good,leafHex:"zz"},{...good,proof:Array(65).fill(good.proof[0])},
    {...good,proof:[{...good.proof[0],direction:"up"}]},{...good,valid:true}]){
    await assert.rejects(verifyMmr(input));
  }
});
