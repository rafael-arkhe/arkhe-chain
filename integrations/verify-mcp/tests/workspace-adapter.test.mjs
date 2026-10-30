import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyArtifact } from "../dist/tools/verify-artifact.js";
const contract=JSON.parse(await readFile(new URL("../../../verification/tests/golden_vectors.json",import.meta.url),"utf8"));
test("relocated MCP adapter loads the workspace WASM and matches ready vectors",async()=>{
  for(const vector of contract.vectors){
    if(vector.status!=="READY") continue;
    if(vector.component==="BLAKE3"){
      const result=await verifyArtifact({kind:"blake3",payloadHex:vector.input.data_hex});
      assert.equal(result.digestHex,vector.expected_output.hash_hex);
    }else if(vector.component==="GGUF Canonicalization"){
      const result=await verifyArtifact({kind:"gguf",json:JSON.stringify(vector.input.metadata)});
      assert.equal(result.canonicalCborHex,vector.expected_output.canonical_cbor_hex);
    }else if(vector.component==="C2PA Manifest Parsing"){
      await assert.rejects(verifyArtifact({kind:"c2pa",json:JSON.stringify(vector.input.claim_json)}));
    }
  }
});
test("adapter rejects malformed hex rather than truncating it",async()=>{
  for(const value of ["a","not-hex","ffzz"]){await assert.rejects(verifyArtifact({kind:"blake3",payloadHex:value}));}
});
