import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { proposeSolana, solanaOutputSchema } from './paybox.js';
import { allocateSplit, boundedJson, buildUnsignedSplit, fingerprintSchema, inspectRegistration, signatureSchema, splitInput } from './logic.js';

const readOnly = {readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true};
function failure() {
  return {isError:true,content:[{type:'text' as const,text:'The request could not be completed. Check the inputs, network hosts and service availability. No payment was submitted.'}]};
}
export function createServer() {
  const server = new McpServer({name:'arkhe-creator-paybox',version:'0.1.0'},{supportedProtocolVersions:['2026-07-28']});
  server.registerTool('arkhe_capabilities',{
    title:'What can Arkhe do?', description:'Explains networks, payment limits and public evidence. No network call or payment.',
    inputSchema:z.object({}).strict(), outputSchema:z.object({recordNetwork:z.literal('devnet'),paymentNetwork:z.literal('solana:mainnet'),maximumPaymentSol:z.literal('1'),notice:z.string()}).strict(),
    annotations:{...readOnly,openWorldHint:false},
  },async()=>({content:[{type:'text',text:'Check Arkhe test records, inspect the source repository, and prepare unsigned mainnet collaborator payments. A proposal is not a payment or proof of ownership.'}],structuredContent:{recordNetwork:'devnet',paymentNetwork:'solana:mainnet',maximumPaymentSol:'1',notice:'Read tools do not prove ownership. Payment proposals use real SOL and require PayBox wallet approval. Network fees are additional. No transaction is broadcast by this plugin.'}}));
  server.registerTool('arkhe_verify_record',{
    title:'Check an Arkhe work record', description:'Queries one confirmed Arkhe Devnet registration through arkhe.computer. Optionally compares a locally obtained BLAKE3 fingerprint. Never proves authorship or payment authority.',
    inputSchema:z.object({signature:signatureSchema,fingerprint:fingerprintSchema.optional()}).strict(),
    outputSchema:z.object({status:z.literal('record_confirmed'),network:z.literal('devnet'),title:z.string(),creator:z.string(),signer:z.string(),fingerprint:fingerprintSchema,comparison:z.enum(['not_requested','match','different']),receiptUrl:z.string(),evidence:z.string()}).strict(),annotations:readOnly,
  },async({signature,fingerprint})=>{
    try { const result=inspectRegistration(await boundedJson('https://arkhe.computer/api/verify?signature='+encodeURIComponent(signature)),signature,fingerprint);return {content:[{type:'text',text:`Recorded work: ${result.title}. File comparison: ${result.comparison}. A declaration does not establish ownership.`}],structuredContent:result}; }catch{return failure();}
  });
  server.registerTool('arkhe_repository_info',{
    title:'Inspect the Arkhe source project',description:'Reads the fixed public Arkhe GitHub repository. Optional GitHub authorization is injected by PayBox as a host-scoped header; code never receives the credential.',inputSchema:z.object({}).strict(),
    outputSchema:z.object({repository:z.literal('Arkhe-Super/arkhe-solana'),url:z.literal('https://github.com/Arkhe-Super/arkhe-solana'),description:z.string(),defaultBranch:z.string(),updatedAt:z.string()}).strict(),annotations:readOnly,
  },async()=>{
    try {
      const body=z.object({full_name:z.literal('Arkhe-Super/arkhe-solana'),description:z.string().max(1000).nullable(),default_branch:z.string().max(100),updated_at:z.string().max(50)}).parse(await boundedJson('https://api.github.com/repos/Arkhe-Super/arkhe-solana',{Accept:'application/vnd.github+json','User-Agent':'arkhe-creator-paybox'}));
      const result={repository:body.full_name,url:'https://github.com/Arkhe-Super/arkhe-solana' as const,description:body.description??'',defaultBranch:body.default_branch,updatedAt:body.updated_at};
      return {content:[{type:'text',text:'Source repository metadata retrieved. Repository availability is not a security audit.'}],structuredContent:result};
    }catch{return failure();}
  });
  server.registerTool('arkhe_propose_split',{
    title:'Propose a collaborator payment — real SOL',description:'Builds one unsigned Solana MAINNET transaction with 1–4 native SOL transfers, at most 1 SOL plus network fees. Shares total 10000 basis points. Rounding remainder goes to the last recipient. No record confers payment rights. This tool never signs or broadcasts.',
    inputSchema:splitInput,outputSchema:solanaOutputSchema,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},
  },async input=>{
    try {
      const split=allocateSplit(input);const proposal=proposeSolana({transactionBase64:buildUnsignedSplit(input)});
      proposal.content[0]!.text='MAINNET: real SOL. Unsigned proposal only; nothing has been paid. Network fees are additional. '+split.recipients.map(item=>`${item.address}: ${item.lamports} lamports`).join('; ')+'. This is a voluntary collaborator payment, not verified royalties.';
      return proposal;
    }catch{return failure();}
  });
  return server;
}
serveStdio(createServer,{legacy:'reject'});
