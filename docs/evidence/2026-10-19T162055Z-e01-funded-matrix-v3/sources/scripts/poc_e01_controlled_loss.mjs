// Explicit fault injection: first broadcast is NOT forwarded to the network.
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createPrivateKey,createPublicKey,randomUUID} from 'node:crypto';
import {RPC,GENESIS,rpc,payload,transaction,publicAddress,sha256,checkReceipt} from './e01_solana_transport.mjs';
import {deliver} from './e01_rebroadcast.mjs';
import {writeReport} from './e01_atomic_report.mjs';

const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('usage: controlled-loss fixtures.json new-output-dir < signer-via-stdin');
let raw='';for await(const chunk of process.stdin)raw+=chunk.toString('utf8');
let privateKey;
try {privateKey=createPrivateKey({key:Buffer.from(raw.trim(),'base64'),type:'pkcs8',format:'der'});}
catch {throw new Error('invalid stdin signer');}
raw='';const signer={privateKey,publicKey:createPublicKey(privateKey)},payer=publicAddress(signer);
if(payer!=='CNTyUf1Ddv7YSJvyqZhqFPZipnMjDaTouUvpHes6R6yb')throw new Error('unexpected E01 wallet');
await mkdir(resolve(output,'..'),{recursive:true});await mkdir(output);
const report={schema:1,run_id:randomUUID(),status:'INCOMPLETE',anchoring:'NOT_RUN',rpc:RPC,
  public_address:payer,runtime_verified:false,reader_independent:false,
  fault_injection:'first sendTransaction call rejected locally before forwarding; second may transmit identical bytes',
  attempts:[],planned_attempts:1,planned_order:[1000],events:[]};
const save=()=>writeReport(join(output,'devnet-results.json'),report);
try {
  if(await rpc('getGenesisHash')!==GENESIS)throw new Error('wrong cluster');
  const protocolBytes=await readFile(new URL('../config/e01-devnet-protocol-v3.json',import.meta.url));
  const protocol=JSON.parse(protocolBytes);report.protocol=protocol;report.protocol_sha256=sha256(protocolBytes);
  const fixturesBytes=await readFile(input);if(sha256(fixturesBytes)!==protocol.fixture_sha256)throw new Error('fixture mismatch');
  const batch=JSON.parse(fixturesBytes).batches.find(b=>b.leaf_count===1000);
  report.initial_balance_lamports=(await rpc('getBalance',[payer,{commitment:'finalized'}])).value;
  if(report.initial_balance_lamports<protocol.reserve_lamports+protocol.max_fee_lamports_per_transaction)throw new Error('insufficient reserve');
  const commitment=payload({runId:report.run_id,leafCount:1000,rootHex:batch.root_hex,datasetSha256:batch.dataset_sha256});
  const block=await rpc('getLatestBlockhash',[{commitment:'finalized'}]),tx=transaction(signer,block.value.blockhash,commitment);
  const attempt={sequence:0,leaf_count:1000,status:'PREPARED',blockhash:tx.blockhash,signature:tx.signature,
    transaction_base64:tx.bytes.toString('base64'),last_valid_block_height:block.value.lastValidBlockHeight,
    payload_utf8:commitment.toString(),payload_sha256:sha256(commitment)};
  report.attempts.push(attempt);await save();
  const fee=await rpc('getFeeForMessage',[tx.message.toString('base64'),{commitment:'finalized'}]);
  if(!Number.isSafeInteger(fee.value)||fee.value<0||fee.value>protocol.max_fee_lamports_per_transaction)throw new Error('fee cap');
  attempt.estimated_fee=fee;
  attempt.simulation=await rpc('simulateTransaction',[tx.bytes.toString('base64'),{encoding:'base64',sigVerify:true,commitment:'finalized'}]);
  if(attempt.simulation.value.err!==null)throw new Error('simulation rejected');
  let calls=0;
  await deliver({tx,attempt,protocol,persist:save,validateReceipt:r=>checkReceipt(r,tx,commitment,payer),
    call:async(method,params)=>{
      if(method==='sendTransaction'&&calls++===0) {
        report.events.push({kind:'CONTROLLED_DROP_BEFORE_NETWORK',wire_sha256:sha256(tx.bytes)});await save();
        throw new Error('CONTROLLED_FIRST_BROADCAST_NOT_FORWARDED');
      }
      if(method==='sendTransaction') {
        report.events.push({kind:'FORWARDED_TO_RPC',wire_sha256:sha256(Buffer.from(params[0],'base64'))});await save();
      }
      return rpc(method,params);
    }});
  report.final_balance_lamports=(await rpc('getBalance',[payer,{commitment:'finalized'}])).value;
  report.forwarded_broadcasts=report.events.filter(e=>e.kind==='FORWARDED_TO_RPC').length;
  report.status='CONTROLLED_LOSS_RECOVERED_SAME_RPC';report.anchoring='CONTROLLED_TRIAL_ONLY';
} catch(error) {report.error=error.message;}
await save();console.log(JSON.stringify({status:report.status,error:report.error,report:join(output,'devnet-results.json')}));
if(report.error)process.exitCode=1;
