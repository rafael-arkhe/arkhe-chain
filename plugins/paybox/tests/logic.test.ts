import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressBytes, allocateSplit, boundedJson, buildUnsignedSplit, DEVNET_GENESIS, inspectRegistration, SYSTEM_PROGRAM } from '../src/logic.js';
import { proposeSolana } from '../src/paybox.js';
const sender='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const first='Vote111111111111111111111111111111111111111';
const second='Stake11111111111111111111111111111111111111';
const input={sender,network:'solana:mainnet' as const,amountSol:'0.000000101',recipients:[{address:first,basisPoints:3333},{address:second,basisPoints:6667}]};

test('integer shares conserve every lamport and disclose final rounding',()=>{
 const split=allocateSplit(input);assert.equal(split.total,101n);assert.deepEqual(split.recipients.map(item=>item.lamports),[33n,68n]);
 for(let amount=2;amount<300;amount++) { const result=allocateSplit({...input,amountSol:'0.'+String(amount).padStart(9,'0'),recipients:[{address:first,basisPoints:5000},{address:second,basisPoints:5000}]});assert.equal(result.recipients.reduce((sum,item)=>sum+item.lamports,0n),BigInt(amount)); }
});
test('rejects zero, negative, oversized and excess precision amounts',()=>{
 for(const amountSol of ['0','-1','1.000000001','0.0000000001','NaN','1e-3'])assert.throws(()=>allocateSplit({...input,amountSol}));
});
test('rejects duplicate, incomplete, dust and wrong-network allocations',()=>{
 assert.throws(()=>allocateSplit({...input,recipients:[{address:first,basisPoints:9999}]}));
 assert.throws(()=>allocateSplit({...input,recipients:[{address:first,basisPoints:5000},{address:first,basisPoints:5000}]}));
 assert.throws(()=>allocateSplit({...input,amountSol:'0.000000001'}));
 assert.throws(()=>allocateSplit({...input,network:'devnet' as 'solana:mainnet'}));
});
test('validates public addresses without accepting system address as payer',()=>{
 assert.equal(addressBytes(sender).length,32);assert.equal(addressBytes(SYSTEM_PROGRAM).length,32);
 for(const value of ['secret','0'.repeat(44),'1'.repeat(33)])assert.throws(()=>addressBytes(value));
 assert.throws(()=>allocateSplit({...input,sender:SYSTEM_PROGRAM}));
});
test('unsigned packet has one zero signature, fits limit and proposal does not execute',()=>{
 const base64=buildUnsignedSplit(input);const bytes=Buffer.from(base64,'base64');assert(bytes.length<=1232);assert.equal(bytes[0],1);assert(bytes.subarray(1,65).equals(Buffer.alloc(64)));assert.deepEqual([...bytes.subarray(65,68)],[1,0,1]);
 const proposal=proposeSolana({transactionBase64:base64});const envelope=proposal.structuredContent['io.paybox/transactionProposal'];assert.equal(envelope.chain,'solana:mainnet');assert.equal(envelope.transaction.transactionBase64,base64);assert(Date.parse(envelope.expiresAt)>Date.now());
});
const signature='3'.repeat(88);
const body={signature,verified:true,network:'devnet',slot:1,blockTime:null,memo:{domain:'arkhe.devnet.v1',schema:1,network:'devnet',genesis:DEVNET_GENESIS,kind:'register',owner:sender,hash:'a'.repeat(64),algorithm:'blake3',title:'Sample work',author:'Creator',size:3}};
test('receipt binding distinguishes match, difference and no requested comparison',()=>{
 assert.equal(inspectRegistration(body,signature).comparison,'not_requested');assert.equal(inspectRegistration(body,signature,'a'.repeat(64)).comparison,'match');assert.equal(inspectRegistration(body,signature,'b'.repeat(64)).comparison,'different');
});
test('rejects forged status, foreign network, wrong reference and payment masquerading as registration',()=>{
 assert.throws(()=>inspectRegistration({...body,verified:false},signature));assert.throws(()=>inspectRegistration({...body,network:'mainnet'},signature));assert.throws(()=>inspectRegistration(body,'2'.repeat(88)));assert.throws(()=>inspectRegistration({...body,memo:{...body.memo,genesis:'wrong'}},signature));assert.throws(()=>inspectRegistration({...body,memo:{...body.memo,kind:'payment'}},signature));
});
test('network access is bounded and refuses arbitrary hosts',async()=>{
 let calls=0;const fetcher=(async(_url:unknown,options:RequestInit)=>{calls++;assert.equal(options.redirect,'error');assert(options.signal);return new Response(JSON.stringify({ok:true}));}) as typeof fetch;
 assert.deepEqual(await boundedJson('https://api.github.com/repos/Arkhe-Super/arkhe-solana',{},fetcher),{ok:true});assert.equal(calls,1);
 for(const url of ['http://api.github.com','https://evil.example','https://api.github.com.evil.example','https://user:pass@api.github.com'])await assert.rejects(boundedJson(url,{},fetcher));assert.equal(calls,1);
});
test('rejects remote errors, invalid JSON and excessive responses',async()=>{
 for(const response of [new Response('{}',{status:503}),new Response('bad JSON'),new Response('x'.repeat(128*1024+1))])await assert.rejects(boundedJson('https://arkhe.computer/api/verify',{},(async()=>response) as typeof fetch));
});
