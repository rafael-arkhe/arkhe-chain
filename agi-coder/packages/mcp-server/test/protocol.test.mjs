import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
test('real stdio initialization, tools/list, proof, costs, unsupported hardware, and invalid input',async()=>{
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../dist/index.js',import.meta.url))],stderr:'pipe'});
  const client=new Client({name:'integration-test',version:'1.0.0'});
  try{
    await client.connect(transport);
    const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name).sort(),['attest_gpu','get_cost','verify_mmr_inclusion']);
    const fixture=JSON.parse(readFileSync(new URL('../../../tests/golden/mmr_vectors.json',import.meta.url)));const v=fixture.vectors.find(v=>v.count===7);
    const result=await client.callTool({name:'verify_mmr_inclusion',arguments:{value:v.values[2],root:v.root,proof:v.proofs[2]}});assert.equal(JSON.parse(result.content[0].text).valid,true);
    const bad=await client.callTool({name:'verify_mmr_inclusion',arguments:{value:'00'.repeat(32),root:v.root,proof:v.proofs[2]}});assert.equal(JSON.parse(bad.content[0].text).valid,false);
    const cost=await client.callTool({name:'get_cost',arguments:{entries:[{category:'verification',micro_usd:12,measured:true}]}});assert.equal(JSON.parse(cost.content[0].text).total_micro_usd,12);
    const gpu=await client.callTool({name:'attest_gpu',arguments:{}});assert.equal(gpu.isError,true);assert.equal(JSON.parse(gpu.content[0].text).verified,false);
    const invalid=await client.callTool({name:'get_cost',arguments:{entries:[{category:'x',micro_usd:-1,measured:false}]}});assert.equal(invalid.isError,true);
  }finally{await client.close();}
});
