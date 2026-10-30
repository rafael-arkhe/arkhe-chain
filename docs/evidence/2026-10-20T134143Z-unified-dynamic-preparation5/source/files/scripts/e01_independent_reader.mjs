// Independent RPC operator and process, not an independent consensus client.
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicKey,verify} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {GENESIS,checkReceipt,unbase58,sha256} from './e01_solana_transport.mjs';
export const READER='https://solana-devnet.api.onfinality.io/public';
let lastCall=0;
async function readRpc(method,params=[],journal=[]) {
  if (!['getGenesisHash','getTransaction'].includes(method)) throw new Error('reader method forbidden');
  for(let retry=0;retry<4;retry++) {
  const pause=Math.max(0,2000-(Date.now()-lastCall));
  if(pause)await new Promise(r=>setTimeout(r,pause));
  lastCall=Date.now();
  const response=await fetch(READER,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
  journal.push({method,retry,http_status:response.status,at:new Date().toISOString()});
  if(response.status===429 && retry<3) {await new Promise(r=>setTimeout(r,2000*(retry+1)));continue;}
  if (!response.ok) throw new Error(`reader HTTP ${response.status}`);
  const data=await response.json();if(data.error)throw new Error(`reader RPC ${JSON.stringify(data.error)}`);
  return data.result;
  }
}
export async function observe(input,output) {
  const bytes=await readFile(input),run=JSON.parse(bytes.toString('utf8'));
  const report={schema:1,status:'INCOMPLETE',sender_rpc:run.rpc,reader_rpc:READER,
    operator_endpoint_distinct:true,consensus_independently_verified:false,
    source_report_sha256:sha256(bytes),observations:[],rpc_attempts:[],runtime_verified:false};
  const save=()=>writeFile(output,JSON.stringify(report,null,2)+'\n');
  try {
    if(await readRpc('getGenesisHash',[],report.rpc_attempts)!==GENESIS)throw new Error('reader genesis mismatch');
    const publicBytes=unbase58(run.public_address);
    if(publicBytes.length!==32)throw new Error('invalid sender address');
    const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),publicBytes]),format:'der',type:'spki'});
    for(const attempt of run.attempts) {
      if(attempt.status!=='FINALIZED_MATCHED')continue;
      const observation={sequence:attempt.sequence??report.observations.length,signature:attempt.signature,status:'PENDING'};
      report.observations.push(observation);
      try {
        const tx=Buffer.from(attempt.transaction_base64,'base64');
        if(tx[0]!==1 || !verify(null,tx.subarray(65),publicKey,tx.subarray(1,65))
          || !tx.subarray(1,65).equals(unbase58(attempt.signature)))throw new Error('local transaction signature mismatch');
        const receipt=await readRpc('getTransaction',[attempt.signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}],report.rpc_attempts);
        observation.receipt=receipt;
        const blockhash=attempt.blockhash??attempt.receipt?.transaction?.message?.recentBlockhash;
        observation.verified=checkReceipt(receipt,{signature:attempt.signature,blockhash},Buffer.from(attempt.payload_utf8),run.public_address);
        if(observation.verified.slot!==attempt.verified.slot || observation.verified.fee_lamports!==attempt.verified.fee_lamports)throw new Error('provider observations disagree');
        observation.status='FINALIZED_MATCHED';
      } catch(error) {observation.status='UNASSESSED';observation.error=error.message;}
      await save();
      await new Promise(r=>setTimeout(r,300));
    }
    report.finalized_in_source=run.attempts.filter(a=>a.status==='FINALIZED_MATCHED').length;
    report.matched=report.observations.filter(a=>a.status==='FINALIZED_MATCHED').length;
    report.status=report.matched>0 && report.matched===report.finalized_in_source?'MATCHED_ALL_SOURCE_FINALIZATIONS':'INCOMPLETE';
  } catch(error) {report.error=error.message;}
  await save();return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error('usage: reader input-report.json output.json');
  const report=await observe(input,output);console.log(JSON.stringify({status:report.status,matched:report.matched,error:report.error}));
  if(report.status==='INCOMPLETE')process.exitCode=1;
}
