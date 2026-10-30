import test from 'node:test';
import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { base58,unbase58,shortvec,newSigner,publicAddress,payload,transaction,checkReceipt,rpc,MEMO,GENESIS } from './e01_solana_transport.mjs';
const args={runId:'test-1',leafCount:1000,rootHex:'ab'.repeat(32),datasetSha256:'cd'.repeat(32)};
test('base58 roundtrips leading zeros and long memo bytes',()=>{
  for (const b of [Buffer.alloc(32),Buffer.from([0,0,1,255]),payload(args)]) assert.deepEqual(unbase58(base58(b)),b);
  assert.equal(base58(Buffer.from('Hello World')),'JxF12TrwUP45BMd');
  assert.throws(()=>unbase58('0OIl'));
});
test('shortvec boundaries and invalid lengths',()=>{
  assert.deepEqual([...shortvec(127)],[127]); assert.deepEqual([...shortvec(128)],[128,1]);
  for(const n of [-1,1.5,65536]) assert.throws(()=>shortvec(n));
});
test('commitment fixes schema, cluster and fields',()=>{
  assert.equal(payload(args).toString(),payload({...args}).toString());
  assert.equal(JSON.parse(payload(args)).genesis,GENESIS);
  for (const bad of [{leafCount:2},{rootHex:'ff'},{datasetSha256:'zz'.repeat(32)},{runId:'with space'}]) assert.throws(()=>payload({...args,...bad}));
});
test('legacy memo transaction signature covers payload, program, payer and blockhash',()=>{
  const signer=newSigner(), memo=payload(args), tx=transaction(signer,base58(Buffer.alloc(32,3)),memo);
  assert.equal(tx.bytes[0],1); assert.deepEqual([...tx.message.subarray(0,4)],[1,0,1,2]);
  assert(verify(null,tx.message,signer.publicKey,tx.bytes.subarray(1,65)));
  const altered=Buffer.from(tx.message); altered[altered.length-1]^=1;
  assert.equal(verify(null,altered,signer.publicKey,tx.bytes.subarray(1,65)),false);
  assert(tx.bytes.length<1232); assert.equal(unbase58(publicAddress(signer)).length,32);
  assert.throws(()=>transaction(signer,'1',memo));
});
test('receipt matching rejects wrong status, signature, payer, blockhash, program and commitment',()=>{
  const signer=newSigner(), memo=payload(args), payer=publicAddress(signer),tx=transaction(signer,base58(Buffer.alloc(32,3)),memo);
  const receipt={slot:1,meta:{err:null,fee:5000},transaction:{signatures:[tx.signature],message:{recentBlockhash:tx.blockhash,
    header:{numRequiredSignatures:1,numReadonlySignedAccounts:0,numReadonlyUnsignedAccounts:1},accountKeys:[payer,MEMO],
    instructions:[{programIdIndex:1,accounts:[0],data:base58(memo)}]}}};
  assert.equal(checkReceipt(receipt,tx,memo,payer).fee_lamports,5000);
  for(const mutate of [r=>r.meta.err='bad',r=>r.transaction.signatures[0]='bad',r=>r.transaction.message.accountKeys[0]='bad',
    r=>r.transaction.message.recentBlockhash='bad',r=>r.transaction.message.instructions[0].programIdIndex=0,
    r=>r.transaction.message.instructions[0].data=base58(Buffer.from('altered'))]) {
    const bad=structuredClone(receipt); mutate(bad); assert.throws(()=>checkReceipt(bad,tx,memo,payer));
  }
});
test('RPC refuses mainnet and custom endpoints before network access',async()=>{
  await assert.rejects(rpc('getVersion',[],'https://api.mainnet-beta.solana.com'),/allowlist/);
});
