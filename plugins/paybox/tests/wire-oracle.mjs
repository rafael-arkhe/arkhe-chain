// Independent validation against the existing Solana SDK. No keys or network.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildUnsignedSplit } from '../src/logic.ts';
const require=createRequire(import.meta.url);
const {PublicKey,Transaction,SystemProgram,SystemInstruction}=require(process.env.SOLANA_REFERENCE_MODULE || '../../arkhe-devnet-deploy/frontend/node_modules/@solana/web3.js');
const sender='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const first='Vote111111111111111111111111111111111111111';
const second='Stake11111111111111111111111111111111111111';
for(const recipients of [[{address:first,basisPoints:3333},{address:second,basisPoints:6667}],[{address:sender,basisPoints:10000}]]){
 const input={sender,network:'solana:mainnet',amountSol:'0.000000101',recipients};
 const bytes=Buffer.from(buildUnsignedSplit(input),'base64');
 const decoded=Transaction.from(bytes);
 assert.equal(decoded.signatures.length,1);assert.equal(decoded.signatures[0].signature,null);assert.equal(decoded.feePayer.toBase58(),sender);
 assert.equal(decoded.instructions.length,recipients.length);
 const decodedTransfers=decoded.instructions.map(instruction=>SystemInstruction.decodeTransfer(instruction));
 assert.equal(decodedTransfers.reduce((sum,item)=>sum+item.lamports,0n),101n);
 const oracle=new Transaction({feePayer:new PublicKey(sender),recentBlockhash:'11111111111111111111111111111111'});
 for(const transfer of decodedTransfers)oracle.add(SystemProgram.transfer(transfer));
 const reference=Transaction.from(oracle.serialize({requireAllSignatures:false,verifySignatures:false}));
 assert.deepEqual(decoded.instructions.map(item=>({program:item.programId.toBase58(),keys:item.keys.map(key=>({address:key.pubkey.toBase58(),signer:key.isSigner,writable:key.isWritable})),data:item.data.toString('hex')})),reference.instructions.map(item=>({program:item.programId.toBase58(),keys:item.keys.map(key=>({address:key.pubkey.toBase58(),signer:key.isSigner,writable:key.isWritable})),data:item.data.toString('hex')})));
 assert.deepEqual(decodedTransfers.map(item=>({from:item.fromPubkey.toBase58(),to:item.toPubkey.toBase58(),lamports:String(item.lamports)})),recipients.map((item,index)=>({from:sender,to:item.address,lamports:recipients.length===1?'101':index===0?'33':'68'})));
 assert.equal(decoded.compileMessage().header.numRequiredSignatures,1);
}
console.log(JSON.stringify({status:'passed',cases:2,independentOracle:'@solana/web3.js',signed:false,broadcast:false}));
