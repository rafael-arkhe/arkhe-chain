import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
function call(name,args,live=false) {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[...(live?['--use-env-proxy']:[]),'dist/plugin.mjs'],{stdio:['pipe','pipe','pipe'],env:process.env});
  let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(new Error('Tool exceeded its deadline'));},9500);
  child.stdout.on('data',chunk=>{stdout+=chunk;for(const line of stdout.split('\n').filter(Boolean)){try{const response=JSON.parse(line);if(response.id===1){clearTimeout(timer);child.kill();resolve(response);return;}}catch{}}});
  child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>16384){child.kill();reject(new Error('Excess stderr'));}});
  child.on('error',reject);
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'arkhe-acceptance',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}}}})+'\n');
 });
}
const report={mode:'Local bundle MCP calls; proposals not signed or sent',checks:[]};
const capabilities=await call('arkhe_capabilities',{});assert.equal(capabilities.result.resultType,'complete');assert.equal(capabilities.result.structuredContent.paymentNetwork,'solana:mainnet');report.checks.push('Capabilities and network distinction');
const input={sender:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',network:'solana:mainnet',amountSol:'0.000000101',recipients:[{address:'Vote111111111111111111111111111111111111111',basisPoints:10000}]};
const proposal=await call('arkhe_propose_split',input);assert(!proposal.result.isError);assert.equal(proposal.result.structuredContent['io.paybox/transactionProposal'].kind,'solana');report.checks.push('Unsigned payment proposal through MCP');
for(const args of [{...input,amountSol:'2'},{...input,network:'devnet'},{...input,recipients:[{...input.recipients[0],basisPoints:9000}]}]){const result=await call('arkhe_propose_split',args);assert(result.error||result.result?.isError);assert(!result.result?.structuredContent?.['io.paybox/transactionProposal']);}report.checks.push('Invalid payments never return proposals');
if(process.env.LIVE_READS==='1'){
 for(const name of ['arkhe_repository_info','arkhe_verify_record']){
  const result=await call(name,name==='arkhe_verify_record'?{signature:'2'.repeat(88)}:{},true);
  if(name==='arkhe_repository_info'){report.repositoryLiveRead=result.result?.isError?'unavailable':'passed';if(!result.result?.isError)assert.equal(result.result.structuredContent.repository,'Arkhe-Super/arkhe-solana');}
  else {assert(result.result?.isError);report.invalidReceiptLiveRead='No false confirmation';}
 }
}
report.passed=true;await writeFile('evidence/bundle-tools.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
