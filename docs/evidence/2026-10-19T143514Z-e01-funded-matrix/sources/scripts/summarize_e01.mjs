import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [source,reader,output,reconciliationPath]=process.argv.slice(2);
if(!source||!reader||!output)throw new Error('usage: summarize_e01 sender.json reader.json summary.json');
const sourceBytes=await readFile(source);
const run=JSON.parse(sourceBytes.toString('utf8')),independent=JSON.parse(await readFile(reader,'utf8'));
if(independent.source_report_sha256!==createHash('sha256').update(sourceBytes).digest('hex'))throw new Error('reader bound to another source snapshot');
const quantile=(xs,q)=>{const sorted=[...xs].sort((a,b)=>a-b);return sorted.length?sorted[Math.ceil(sorted.length*q)-1]:null;};
const groups=[1000,5000,10000].map(n=>{
  const attempted=run.attempts.filter(a=>a.leaf_count===n);
  const finalized=attempted.filter(a=>a.status==='FINALIZED_MATCHED');
  const matched=new Set(independent.observations.filter(o=>o.status==='FINALIZED_MATCHED').map(o=>o.signature));
  const planned=run.planned_order?.filter(x=>x===n).length??1;
  return {leaf_count:n,planned,attempted:attempted.length,finalized:finalized.length,
    not_attempted:planned-attempted.length,independent_matched:finalized.filter(a=>matched.has(a.signature)).length,
    successful_fraction_of_planned:finalized.length/planned,
    actual_fee_lamports:finalized.reduce((s,a)=>s+a.verified.fee_lamports,0),
    finalization_p50_ms:quantile(finalized.map(a=>a.finalization_ms),.5),
    finalization_p95_ms:quantile(finalized.map(a=>a.finalization_ms),.95)};
});
const actual=groups.reduce((s,g)=>s+g.actual_fee_lamports,0);
const planned=groups.reduce((s,g)=>s+g.planned,0),matched=groups.reduce((s,g)=>s+g.independent_matched,0);
const reconciliation=reconciliationPath?JSON.parse(await readFile(reconciliationPath,'utf8')):null;
const endingBalance=run.final_balance_lamports??reconciliation?.observations?.find(o=>o.endpoint===run.rpc)?.getBalance?.result?.value;
const balanceDelta=Number.isSafeInteger(endingBalance)?run.initial_balance_lamports-endingBalance:null;
const summary={schema:1,scope:'synthetic MMR commitments on devnet, no execution authority',
  status:planned===90&&matched===90?'MATRIX_MATCHED_TWO_RPC_OPERATORS':'INCOMPLETE',groups,
  actual_fee_lamports:actual,actual_fee_devnet_sol:actual/1e9,
  wallet_balance_delta_lamports:balanceDelta,
  ending_balance_lamports:endingBalance??null,
  ending_balance_source:run.final_balance_lamports!==undefined?'sender':'reconciliation',
  balance_delta_matches_fees:balanceDelta===actual,
  sender_error:run.error??null,attempted:run.attempts.length,
  finalized:run.attempts.filter(a=>a.status==='FINALIZED_MATCHED').length,
  not_attempted:planned-run.attempts.length,
  reconciliation_available:Boolean(reconciliation),
  usd_economics:'NOT_ASSESSED',mainnet_cost:'NOT_ASSESSED',runtime_verified:false,
  independent_consensus_client:false,provider_trust_required:true,
  sdk_onboarding:'NOT_ASSESSED',browser_performance:'NOT_ASSESSED'};
await writeFile(output,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
