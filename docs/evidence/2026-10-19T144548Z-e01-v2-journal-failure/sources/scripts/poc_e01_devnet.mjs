import { readFile, writeFile, mkdir, open, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createPrivateKey, createPublicKey } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { schedule } from './e01_schedule.mjs';
import {deliver} from './e01_rebroadcast.mjs';
import { RPC, GENESIS, newSigner, publicAddress, payload, transaction, rpc, sha256, checkReceipt } from './e01_solana_transport.mjs';

export async function run(input, output, fund=false, providedSigner=null, matrix=false, protocolVersion=1) {
  if (![1,2].includes(protocolVersion))throw new Error('unsupported protocol version');
  await mkdir(resolve(output,'..'),{recursive:true});
  await mkdir(output); // exclusive run directory: never overwrite earlier evidence
  const report = {schema:1,run_id:randomUUID(),status:'INCOMPLETE',anchoring:'NOT_RUN',
    runtime_verified:false,rpc:RPC,reader_independent:false,attempts:[],events:[]};
  // Keys live only in memory for this run; secret material is never serialized.
  const signer = providedSigner ?? newSigner(), payer = publicAddress(signer); report.public_address = payer;
  report.signer_mode = providedSigner ? 'DPAPI_PERSISTENT' : 'EPHEMERAL';
  const save = async () => {
    const temp=join(output,'devnet-results.json.tmp');
    const file=await open(temp,'w');
    try {await file.writeFile(JSON.stringify(report,null,2)+'\n');await file.sync();}
    finally {await file.close();}
    await rename(temp,join(output,'devnet-results.json'));
  };
  try {
    if (await rpc('getGenesisHash') !== GENESIS) throw new Error('wrong cluster genesis');
    const fixtureBytes=await readFile(input);
    const fixtures = JSON.parse(fixtureBytes.toString('utf8'));
    const protocolFile=protocolVersion===2?'e01-devnet-protocol-v2.json':'e01-devnet-protocol.json';
    const protocolBytes=await readFile(new URL(`../config/${protocolFile}`,import.meta.url));
    const protocol=JSON.parse(protocolBytes.toString('utf8'));
    if (sha256(fixtureBytes)!==protocol.fixture_sha256 || protocol.genesis!==GENESIS) throw new Error('protocol/fixture mismatch');
    report.fixture_sha256=sha256(fixtureBytes);
    report.protocol_sha256=sha256(protocolBytes);
    report.protocol=protocol;
    const plan=matrix?schedule(protocol.leaf_counts,protocol.repetitions_per_size,protocol.order_seed):protocol.leaf_counts;
    report.planned_order=plan; report.planned_attempts=plan.length;
    await save(); // protocol and planned order recorded before any send
    const balance = await rpc('getBalance',[payer,{commitment:'finalized'}]);
    report.initial_balance_lamports = balance.value;
    if (providedSigner && balance.value < protocol.reserve_lamports+plan.length*protocol.max_fee_lamports_per_transaction) throw new Error('wallet below protocol budget plus reserve');
    // Without funding flag this is a fully signed, non-broadcast smoke check.
    if (fund && balance.value === 0) {
      report.events.push({kind:'AIRDROP_REQUEST',lamports:10000000}); await save();
      const signature = await rpc('requestAirdrop',[payer,10000000,{commitment:'finalized'}]);
      report.events.push({kind:'AIRDROP_ACCEPTED',signature}); await save();
      const deadline = Date.now()+60000;
      while ((await rpc('getBalance',[payer,{commitment:'finalized'}])).value < 10000000) {
        if (Date.now()>deadline) throw new Error('airdrop funding deadline');
        await new Promise(r=>setTimeout(r,2000));
      }
    }
    let totalEstimated=0;
    for (const [sequence,size] of plan.entries()) {
      const batch=fixtures.batches.find(b=>b.leaf_count===size);
      if (!batch) throw new Error('planned fixture missing');
      const commitment = payload({runId:`${report.run_id}-${sequence}`,leafCount:batch.leaf_count,rootHex:batch.root_hex,datasetSha256:batch.dataset_sha256});
      const block = await rpc('getLatestBlockhash',[{commitment:'finalized'}]);
      const tx = transaction(signer,block.value.blockhash,commitment);
      const attempt = {sequence,leaf_count:batch.leaf_count,prepared_at:new Date().toISOString(),blockhash:tx.blockhash,payload_utf8:commitment.toString(),payload_sha256:sha256(commitment),
        signature:tx.signature,last_valid_block_height:block.value.lastValidBlockHeight,
        transaction_base64:tx.bytes.toString('base64'),status:'PREPARED'};
      report.attempts.push(attempt); await save();
      attempt.estimated_fee = await rpc('getFeeForMessage',[tx.message.toString('base64'),{commitment:'finalized'}]);
      const estimated=attempt.estimated_fee.value;
      if (!Number.isSafeInteger(estimated) || estimated<0 || estimated>protocol.max_fee_lamports_per_transaction
        || totalEstimated+estimated>protocol.max_total_estimated_fee_lamports) throw new Error('fee budget rejected');
      totalEstimated+=estimated;
      attempt.simulation = await rpc('simulateTransaction',[tx.bytes.toString('base64'),{encoding:'base64',sigVerify:true,commitment:'finalized'}]);
      attempt.status = attempt.simulation.value.err === null ? 'SIMULATED' : 'SIMULATION_REJECTED'; await save();
      if (!fund) continue;
      if (attempt.simulation.value.err !== null) throw new Error('simulation failed; no broadcast');
      if(protocolVersion===2) {
        await deliver({tx,attempt,protocol,call:rpc,persist:save,
          validateReceipt:receipt=>checkReceipt(receipt,tx,commitment,payer)});
      } else {
      const start = performance.now();
      attempt.status='SUBMISSION_PENDING'; await save(); // preserve signed identity BEFORE submit
      const signature = await rpc('sendTransaction',[tx.bytes.toString('base64'),{encoding:'base64',skipPreflight:false,maxRetries:0}]);
      if (signature !== tx.signature) throw new Error('unexpected returned signature');
      attempt.status='SUBMITTED'; await save();
      const deadline = Date.now()+protocol.finalization_timeout_ms;
      while (Date.now()<deadline) {
        const receipt = await rpc('getTransaction',[tx.signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);
        if (receipt) {
          attempt.receipt=receipt; attempt.verified=checkReceipt(receipt,tx,commitment,payer);
          attempt.finalization_ms=performance.now()-start; attempt.status='FINALIZED_MATCHED'; break;
        }
        await new Promise(r=>setTimeout(r,protocol.poll_interval_ms));
      }
      if (attempt.status !== 'FINALIZED_MATCHED') throw new Error('finalization deadline; reconcile signature before retry');
      }
      await save();
      console.log(JSON.stringify({completed:sequence+1,planned:plan.length,leaf_count:size,status:attempt.status}));
    }
    report.final_balance_lamports=(await rpc('getBalance',[payer,{commitment:'finalized'}])).value;
    report.status=fund?(matrix?'MATRIX_FINALIZED_SAME_RPC':'SMOKE_FINALIZED_SAME_RPC'):'PREPARED_SMOKE';
    report.anchoring=fund?(matrix?'MATRIX_SAME_RPC':'SMOKE_ONLY'):'NOT_RUN';
  } catch (error) { report.error=error.message; }
  await save(); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input,output,flag] = process.argv.slice(2);
  if (!input || !output || (flag && !['--devnet-airdrop-and-send','--wallet-stdin-send','--wallet-stdin-matrix','--wallet-stdin-send-v2','--wallet-stdin-matrix-v2'].includes(flag))) throw new Error('invalid E01 arguments');
  let signer=null;
  if (flag?.startsWith('--wallet-stdin-')) {
    let raw=''; for await (const chunk of process.stdin) raw+=chunk.toString('utf8');
    try {
      const privateKey=createPrivateKey({key:Buffer.from(raw.trim(),'base64'),format:'der',type:'pkcs8'});
      signer={privateKey,publicKey:createPublicKey(privateKey)};
    } catch { throw new Error('invalid stdin signer'); }
    raw='';
    if (publicAddress(signer)!=='CNTyUf1Ddv7YSJvyqZhqFPZipnMjDaTouUvpHes6R6yb') throw new Error('unexpected E01 wallet');
    if ((await rpc('getBalance',[publicAddress(signer),{commitment:'finalized'}])).value<1000000) throw new Error('E01 wallet balance below reserve; no airdrop requested');
  }
  const report=await run(input,output,Boolean(flag),signer,Boolean(flag?.includes('matrix')),flag?.endsWith('-v2')?2:1);
  console.log(JSON.stringify({status:report.status,error:report.error,attempts:report.attempts.length,report:join(output,'devnet-results.json')}));
  if (report.error) process.exitCode=1;
}
