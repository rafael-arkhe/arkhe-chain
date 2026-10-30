import test from 'node:test';
import assert from 'node:assert/strict';
import {deliver} from './e01_rebroadcast.mjs';

async function harness(behavior,overrides={}) {
  let clock=0,sends=0,reads=0;const wires=[];
  const tx={bytes:Buffer.from('one immutable signed transaction'),signature:'expected-signature'};
  const attempt={last_valid_block_height:100,status:'SIMULATED'};
  const protocol={max_broadcasts_per_transaction:4,rebroadcast_interval_ms:2,finalization_timeout_ms:12,poll_interval_ms:1,...overrides};
  const options={tx,attempt,protocol,now:()=>clock,sleep:async ms=>{clock+=ms;},persist:async()=>{},
    validateReceipt:r=>{assert.equal(r.marker,'valid');return {slot:1,fee_lamports:5000};},
    call:async(method,params)=>{
      if(method==='sendTransaction'){sends++;wires.push(params);}
      if(method==='getBlockHeight')reads++;
      const result=await behavior({method,params,sends,reads});
      return result;
    }};
  try {await deliver(options);return {attempt,sends,wires};}
  catch(error){return {attempt,sends,wires,error};}
}
function defaults({method}) {
  if(method==='getBlockHeight')return 1;
  if(method==='getSignatureStatuses')return {value:[null]};
  if(method==='getTransaction')return null;
  if(method==='sendTransaction')return 'expected-signature';
  throw new Error('unexpected method');
}
test('lost first broadcast recovers with identical bytes and signature',async()=>{
  const r=await harness(ctx=>ctx.method==='getTransaction'&&ctx.sends>=2?{marker:'valid'}:defaults(ctx));
  assert.equal(r.error,undefined);assert.equal(r.sends,2);assert.equal(r.attempt.status,'FINALIZED_MATCHED');
  assert.equal(r.wires[0][0],r.wires[1][0]);
  for(const [,config]of r.wires){assert.equal(config.skipPreflight,false);assert.equal(config.maxRetries,0);}
  assert.equal(r.attempt.delivery.replacement_transactions,0);
});
test('ambiguous send error is reconciled before any second broadcast',async()=>{
  const r=await harness(ctx=>{
    if(ctx.method==='sendTransaction')throw new Error('response lost');
    if(ctx.method==='getTransaction'&&ctx.sends===1)return {marker:'valid'};
    return defaults(ctx);
  });
  assert.equal(r.sends,1);assert.equal(r.attempt.status,'FINALIZED_MATCHED');
  assert.equal(r.attempt.delivery.sends[0].status,'UNKNOWN');
});
test('expired absent signature stops without broadcast or replacement',async()=>{
  const r=await harness(ctx=>ctx.method==='getBlockHeight'?101:defaults(ctx));
  assert.equal(r.sends,0);assert.equal(r.attempt.status,'EXPIRED_UNOBSERVED');assert.match(r.error.message,/expired/);
});
test('landed transaction can finalize after blockhash expiry without resending',async()=>{
  const r=await harness(ctx=>{
    if(ctx.method==='getBlockHeight')return 101;
    if(ctx.method==='getSignatureStatuses')return {value:[{err:null,confirmationStatus:'confirmed'}]};
    if(ctx.method==='getTransaction'&&ctx.reads>=3)return {marker:'valid'};
    return defaults(ctx);
  });
  assert.equal(r.sends,0);assert.equal(r.attempt.status,'FINALIZED_MATCHED');
});
test('chain rejection is terminal and never rebroadcast',async()=>{
  const r=await harness(ctx=>ctx.method==='getSignatureStatuses'?{value:[{err:{InstructionError:[0,'Custom']}}]}:defaults(ctx));
  assert.equal(r.sends,0);assert.equal(r.attempt.status,'CHAIN_REJECTED');
});
test('read errors never authorize broadcasting',async()=>{
  const r=await harness(()=>{throw new Error('RPC unavailable');});
  assert.equal(r.sends,0);assert.equal(r.attempt.status,'DEADLINE_UNRESOLVED');
});
test('send cap and deadline remain enforced for permanently absent transactions',async()=>{
  const r=await harness(defaults);
  assert.equal(r.sends,4);assert.equal(r.attempt.status,'DEADLINE_UNRESOLVED');
  assert.equal(new Set(r.wires.map(x=>x[0])).size,1);
});
test('unexpected returned signature stops immediately',async()=>{
  const r=await harness(ctx=>ctx.method==='sendTransaction'?'other-signature':defaults(ctx));
  assert.equal(r.sends,1);assert.match(r.error.message,/unexpected returned signature/);
});
test('malformed finalized receipt cannot be admitted',async()=>{
  const r=await harness(ctx=>ctx.method==='getTransaction'?{marker:'tampered'}:defaults(ctx));
  assert(r.error);assert.notEqual(r.attempt.status,'FINALIZED_MATCHED');assert.equal(r.sends,0);
});
test('journal failure before send prevents broadcasting',async()=>{
  let clock=0,sends=0;
  const attempt={last_valid_block_height:100};
  await assert.rejects(deliver({tx:{bytes:Buffer.from('signed'),signature:'sig'},attempt,
    protocol:{max_broadcasts_per_transaction:4,rebroadcast_interval_ms:2,finalization_timeout_ms:12,poll_interval_ms:1},
    now:()=>clock,sleep:async ms=>{clock+=ms;},validateReceipt:()=>{},
    persist:async()=>{if(attempt.delivery.sends.length)throw new Error('journal unavailable');},
    call:async(method)=>{if(method==='sendTransaction'){sends++;return 'sig';}if(method==='getBlockHeight')return 1;
      if(method==='getSignatureStatuses')return {value:[null]};return null;}
  }),/journal unavailable/);
  assert.equal(sends,0);
});
