import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
test("real MCP stdio tool delegates to WASM and rejects malformed payloads", {timeout:20000}, async()=>{
  const client=new Client({name:"execution-gates",version:"1.0.0"});
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL("../dist/index.js",import.meta.url))],stderr:"pipe"});
  try {
    await client.connect(transport);
    const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name).sort(),["verify_artifact","verify_mmr"]);
    const result=await client.callTool({name:"verify_artifact",arguments:{kind:"blake3",payloadHex:"616263"}});
    assert.notEqual(result.isError,true);
    const digest=JSON.parse(result.content[0].text);
    assert.equal(digest.digestHex,"6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85");
    assert.equal(digest.status,"DIGEST_COMPUTED");assert.equal(digest.verification,"NOT_PERFORMED");assert.equal(Object.hasOwn(digest,"valid"),false);
    let rejected=false;
    try {rejected=(await client.callTool({name:"verify_artifact",arguments:{kind:"blake3",payloadHex:"ffzz"}})).isError===true;}catch{rejected=true;}
    assert.equal(rejected,true);
    assert.notEqual((await client.callTool({name:"verify_artifact",arguments:{kind:"blake3",payloadHex:""}})).isError,true);
    const invalid=await client.callTool({name:"verify_mmr",arguments:{leafHex:"00",leafCount:1,expectedRootHex:"00".repeat(32),proof:[]}});
    assert.notEqual(invalid.isError,true);
    const proof=JSON.parse(invalid.content[0].text);assert.equal(proof.status,"PROOF_INVALID");assert.equal(proof.authority,false);
    const vector=JSON.parse(await readFile(new URL("../../../verification/vectors/mmr/1-leaves.json",import.meta.url),"utf8"));
    const valid=await client.callTool({name:"verify_mmr",arguments:{leafHex:vector.input.leaves[0],leafCount:1,expectedRootHex:vector.expected_output.root_hash_hex,proof:[]}});
    const verified=JSON.parse(valid.content[0].text);assert.equal(verified.status,"PROOF_VALID");assert.equal(verified.checkpointAuthentication,"NOT_PERFORMED");
  } finally {await client.close();}
});
