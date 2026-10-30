import {createPublicKey, createHash} from 'node:crypto';
import {readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync, existsSync} from 'node:fs';
import {join, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {local} from './paths.mjs';
import {getRun} from './development.mjs';
import {digest} from './crypto.mjs';
import {demand} from './documents.mjs';
import {db,appendEvent,transaction} from './store.mjs';
const exec=promisify(execFile);
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function load(path){const bytes=readFileSync(path);demand(bytes.length<=262144,422,'Arquivo de preview excede o limite.');return JSON.parse(bytes);}
export function cockpitBinding(run){
  return digest(Buffer.concat([Buffer.from('AKG:PREVIEW:COCKPIT:v1\0'),Buffer.from(JSON.stringify({runId:run.id,actorId:run.actorId,moduleId:run.moduleId,baselineDigest:run.baselineDigest,proposalDigest:run.proposalDigest,evidenceDigest:run.evidenceDigest,image:run.image}))]));
}
function table(){db().exec('CREATE TABLE IF NOT EXISTS development_preview_links(run_id TEXT PRIMARY KEY,operation_id TEXT NOT NULL)');}
// Dependency injection is for tests only; production paths are operator-controlled.
export function createPreviewBridge({configuration,runFor,execute,linkFor,saveLink}){
  function context(user,id,required=true){
    demand(user.role==='owner',403,'Preview exige governança.');
    demand(/^[a-f0-9-]{36}$/.test(id),400,'Execução inválida.');
    const run=runFor(id);const config=configuration();
    if(!config){demand(!required,503,'Supervisor de preview não configurado.');return {run,config:null};}
    demand(isAbsolute(config.binary)&&isAbsolute(config.trust)&&isAbsolute(config.requestsRoot),503,'Configure caminhos absolutos para o supervisor.');
    const trust=load(config.trust);
    const key=createPublicKey(user.publicKey).export({format:'jwk'});
    demand(key.crv==='Ed25519'&&Buffer.from(key.x,'base64url').equals(Buffer.from(trust.reviewer_key))&&trust.reviewer===user.id&&trust.requested_by===run.actorId,403,'Identidade não corresponde ao revisor ou ao ator do perfil nativo.');
    return {run,config,trust,path:join(config.requestsRoot,id+'.json')};
  }
  function prepared(c){
    const {run}=c;
    demand(['passed','approved'].includes(run.state)&&run.exitCode===0&&run.testsPassed>0&&!run.cleanupRequired,409,'Preview exige testes concluídos e cleanup confirmado.');
    demand(run.baselineDigest===sha(run.baseline)&&run.proposalDigest===sha(run.proposal)&&run.evidenceDigest===sha({baselineDigest:run.baselineDigest,proposalDigest:run.proposalDigest,image:run.image,exitCode:run.exitCode,log:run.log}),409,'Evidências da bancada foram alteradas.');
    demand(existsSync(c.path),409,'O supervisor ainda não preparou o pedido nativo desta execução.');
    const request=load(c.path);
    demand(Buffer.from(request.spec.cockpit_binding||[]).toString('hex')===cockpitBinding(run)&&request.spec.module===run.moduleId&&request.spec.image===run.image,409,'Pedido nativo não corresponde à execução selecionada.');
    const nonce=digest(Buffer.concat([Buffer.from('AKG:REQUEST:v1\0'),Buffer.from(run.id)]));
    demand(Buffer.from(request.intent?.request_identity||[]).toString('hex')===nonce,409,'Nonce nativo não corresponde à execução.');
    return request;
  }
  async function invoke(c,args){
    let result;
    try{result=await execute(c.config.binary,['--trust',c.config.trust,...args]);}catch{demand(false,503,'Supervisor rejeitou o pedido ou está indisponível.');}
    try{return JSON.parse(result.stdout);}catch{demand(false,503,'Resposta inválida do supervisor.');}
  }
  return {
    async status(user,id){
      const c=context(user,id,false);if(!c.config)return {configured:false,state:'NOT_CONFIGURED'};
      const operation=linkFor(id);
      if(!operation)return {configured:true,requestAvailable:existsSync(c.path),state:'AWAITING_REVIEW'};
      demand(/^[a-f0-9]{64}$/.test(operation),409,'Vínculo de operação inválido.');
      const result=await invoke(c,['--status','--operation',operation]);
      return {configured:true,operationId:operation,...result.dispatch,state:result.dispatch?.state||'PENDING'};
    },
    async challenge(user,id){const c=context(user,id);prepared(c);return invoke(c,['--request',c.path,'--review-payload']);},
    async approve(user,id,input){
      const c=context(user,id);const request=prepared(c);
      const checked=await invoke(c,['--request',c.path,'--review-payload']);
      const prior=linkFor(id);demand(!prior||prior===checked.operation_id,409,'Execução já vinculada a outra operação.');
      demand(typeof input.signature==='string'&&/^[A-Za-z0-9+/]{86}==$/.test(input.signature),422,'Assinatura inválida.');
      request.reviewer_signature=Buffer.from(input.signature,'base64').toString('hex');
      const dir=mkdtempSync(join(tmpdir(),'arkhe-preview-review-'));const path=join(dir,'request.json');
      try{
        writeFileSync(path,JSON.stringify(request),{flag:'wx',mode:0o600});
        const result=await invoke(c,['--request',path,'--enqueue']);
        demand(result.status==='ADMITTED_PENDING'&&result.executed===false&&/^[a-f0-9]{64}$/.test(result.operation_id),503,'Admissão não confirmada.');
        demand(result.operation_id===checked.operation_id,409,'Operação retornada diverge do pedido revisado.');
        saveLink(id,result.operation_id,user.id);return result;
      }finally{if(existsSync(path))unlinkSync(path);rmdirSync(dir);}
    }
  };
}
const bridge=createPreviewBridge({
  configuration:()=>{const path=join(local,'preview.json');return existsSync(path)?load(path):null;},runFor:getRun,
  execute:(binary,args)=>{
    const env={};for(const key of ['PATH','USERPROFILE','HOME','SYSTEMROOT','TEMP','TMP','ARKHE_PREVIEW_DATABASE_URL'])if(process.env[key])env[key]=process.env[key];
    return exec(binary,args,{windowsHide:true,timeout:30000,maxBuffer:262144,env});
  },
  linkFor:id=>{table();return db().prepare('SELECT operation_id FROM development_preview_links WHERE run_id=?').get(id)?.operation_id;},
  saveLink:(id,op,actor)=>transaction(()=>{table();db().prepare('INSERT INTO development_preview_links(run_id,operation_id) VALUES(?,?) ON CONFLICT DO NOTHING').run(id,op);appendEvent(actor,'preview_admitted','development:'+id,{operationId:op});})
});
export const previewStatus=(...args)=>bridge.status(...args);
export const previewChallenge=(...args)=>bridge.challenge(...args);
export const approvePreview=(...args)=>bridge.approve(...args);
