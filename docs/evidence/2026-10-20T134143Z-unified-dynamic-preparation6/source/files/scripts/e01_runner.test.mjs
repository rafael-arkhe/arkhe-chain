import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run} from './poc_e01_devnet.mjs';
import {newSigner,GENESIS,base58} from './e01_solana_transport.mjs';

async function scenario(body) {
  const dir=await mkdtemp(join(tmpdir(),'arkhe-e01-'));const original=globalThis.fetch;
  try {await body(dir);}finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
}
function mockRpc(responses,called) {
  globalThis.fetch=async(_url,options)=>{
    const {method}=JSON.parse(options.body);called.push(method);
    if(!Object.hasOwn(responses,method))throw new Error(`unexpected call ${method}`);
    return {ok:true,json:async()=>({result:responses[method]})};
  };
}
test('wrong cluster stops before reading fixture or signing a transaction',()=>scenario(async dir=>{
  const called=[];mockRpc({getGenesisHash:'wrong'},called);
  const result=await run('missing',join(dir,'run'),true,newSigner());
  assert.match(result.error,/wrong cluster/);assert.deepEqual(called,['getGenesisHash']);
}));
test('changed fixture stops before balance and broadcast',()=>scenario(async dir=>{
  const input=join(dir,'bad.json');await writeFile(input,'{"batches":[]}');
  const called=[];mockRpc({getGenesisHash:GENESIS},called);
  const result=await run(input,join(dir,'run'),true,newSigner());
  assert.match(result.error,/fixture mismatch/);assert.deepEqual(called,['getGenesisHash']);
}));
test('fee cap rejects before simulation or broadcast',()=>scenario(async dir=>{
  const called=[];mockRpc({getGenesisHash:GENESIS,getBalance:{value:5000000000},
    getLatestBlockhash:{value:{blockhash:base58(Buffer.alloc(32,7)),lastValidBlockHeight:1}},getFeeForMessage:{value:10001}},called);
  const result=await run('ops/local/e01/fixtures.json',join(dir,'run'),true,newSigner());
  assert.match(result.error,/fee budget/);assert.equal(called.includes('sendTransaction'),false);
  assert.equal(called.includes('simulateTransaction'),false);
}));
