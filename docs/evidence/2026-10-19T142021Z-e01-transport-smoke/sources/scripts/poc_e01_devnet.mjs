import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { RPC, GENESIS, newSigner, publicAddress, payload, transaction, rpc, sha256, checkReceipt } from './e01_solana_transport.mjs';

export async function run(input, output, fund=false) {
  await mkdir(output,{recursive:true});
  const report = {schema:1,run_id:randomUUID(),status:'INCOMPLETE',anchoring:'NOT_RUN',
    runtime_verified:false,rpc:RPC,reader_independent:false,attempts:[],events:[]};
  // Keys live only in memory for this run; secret material is never serialized.
  const signer = newSigner(), payer = publicAddress(signer); report.public_address = payer;
  const save = () => writeFile(join(output,'devnet-results.json'),JSON.stringify(report,null,2)+'\n');
  try {
    if (await rpc('getGenesisHash') !== GENESIS) throw new Error('wrong cluster genesis');
    const fixtures = JSON.parse(await readFile(input,'utf8'));
    const balance = await rpc('getBalance',[payer,{commitment:'finalized'}]);
    report.initial_balance_lamports = balance.value;
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
    for (const batch of fixtures.batches) {
      const commitment = payload({runId:report.run_id,leafCount:batch.leaf_count,rootHex:batch.root_hex,datasetSha256:batch.dataset_sha256});
      const block = await rpc('getLatestBlockhash',[{commitment:'finalized'}]);
      const tx = transaction(signer,block.value.blockhash,commitment);
      const attempt = {leaf_count:batch.leaf_count,payload_utf8:commitment.toString(),payload_sha256:sha256(commitment),
        signature:tx.signature,last_valid_block_height:block.value.lastValidBlockHeight,
        transaction_base64:tx.bytes.toString('base64'),status:'PREPARED'};
      report.attempts.push(attempt); await save();
      attempt.estimated_fee = await rpc('getFeeForMessage',[tx.message.toString('base64'),{commitment:'finalized'}]);
      attempt.simulation = await rpc('simulateTransaction',[tx.bytes.toString('base64'),{encoding:'base64',sigVerify:true,commitment:'finalized'}]);
      attempt.status = attempt.simulation.value.err === null ? 'SIMULATED' : 'SIMULATION_REJECTED'; await save();
      if (!fund) continue;
      if (attempt.simulation.value.err !== null) throw new Error('simulation failed; no broadcast');
      const start = performance.now();
      attempt.status='SUBMISSION_PENDING'; await save(); // preserve signed identity BEFORE submit
      const signature = await rpc('sendTransaction',[tx.bytes.toString('base64'),{encoding:'base64',skipPreflight:false,maxRetries:0}]);
      if (signature !== tx.signature) throw new Error('unexpected returned signature');
      attempt.status='SUBMITTED'; await save();
      const deadline = Date.now()+60000;
      while (Date.now()<deadline) {
        const receipt = await rpc('getTransaction',[tx.signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);
        if (receipt) {
          attempt.receipt=receipt; attempt.verified=checkReceipt(receipt,tx,commitment,payer);
          attempt.finalization_ms=performance.now()-start; attempt.status='FINALIZED_MATCHED'; break;
        }
        await new Promise(r=>setTimeout(r,2000));
      }
      if (attempt.status !== 'FINALIZED_MATCHED') throw new Error('finalization deadline; reconcile signature before retry');
      await save();
    }
    report.status=fund?'SMOKE_FINALIZED_SAME_RPC':'PREPARED_SMOKE';
    report.anchoring=fund?'SMOKE_ONLY':'NOT_RUN';
  } catch (error) { report.error=error.message; }
  await save(); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input,output,flag] = process.argv.slice(2);
  if (!input || !output || (flag && flag!=='--devnet-airdrop-and-send')) throw new Error('usage: node scripts/poc_e01_devnet.mjs fixtures.json output-dir [--devnet-airdrop-and-send]');
  const report=await run(input,output,flag==='--devnet-airdrop-and-send');
  console.log(JSON.stringify({status:report.status,error:report.error,attempts:report.attempts.length,report:join(output,'devnet-results.json')}));
  if (report.error) process.exitCode=1;
}
