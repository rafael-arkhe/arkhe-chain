import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { db, transaction, appendEvent } from './store.mjs';
import { demand } from './documents.mjs';
import { verifySignature } from './crypto.mjs';
import { sourceSnapshot, sandboxReady, getRun, validateProposal, catalog } from './development.mjs';
import { evaluationTables, freezeArtifact, checkoutArtifact, artifactManifest } from './evaluation-artifacts.mjs';
import { protocol, policy, hash, canonical, makeTasks, metrics, compare, evaluatorIdentity } from './evaluation-core.mjs';
import { evaluateWorker } from './evaluation-worker.mjs';
import { claimLab, labBusy } from './lab-lock.mjs';
const boot=randomUUID(),now=()=>new Date().toISOString(),secret=()=>randomBytes(32).toString('hex');
const evaluator=()=>hash({core:evaluatorIdentity(),worker:evaluateWorker.toString()});
const legacyHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const owner=user=>demand(user.role==='owner',403,'A avaliação exige credencial de governança.');
function get(table,id) {evaluationTables();const row=db().prepare(`SELECT value FROM ${table} WHERE id=?`).get(id);demand(row,404,'Registro de avaliação não encontrado.');return JSON.parse(row.value);}
function saveStudy(value) {db().prepare('INSERT INTO evaluation_studies(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(value.id,JSON.stringify(value));}
function saveCycle(value) {db().prepare('INSERT INTO evaluation_cycles(id,study_id,value) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(value.id,value.studyId,JSON.stringify(value));}
function saveSecret(id,value) {db().prepare('INSERT INTO evaluation_secrets(id,value) VALUES(?,?)').run(id,JSON.stringify(value));}
function history(studyId) {
  evaluationTables();let previous='0'.repeat(64);
  const rows=db().prepare('SELECT * FROM evaluation_history WHERE study_id=? ORDER BY seq').all(studyId);
  for(const row of rows) {demand(row.previous===previous&&row.hash===hash(previous+'\n'+row.value),409,'Histórico de avaliação alterado.');previous=row.hash;}
  return rows;
}
function record(studyId,event) {
  const rows=history(studyId),previous=rows.at(-1)?.hash||'0'.repeat(64),value=canonical({...event,at:now()});
  db().prepare('INSERT INTO evaluation_history(study_id,value,previous,hash) VALUES(?,?,?,?)').run(studyId,value,previous,hash(previous+'\n'+value));
}
export function evaluationOverview(user) {
  owner(user);evaluationTables();
  const studies=db().prepare('SELECT value FROM evaluation_studies ORDER BY rowid DESC LIMIT 30').all().map(row=>{
    const study=JSON.parse(row.value);if(study.state==='measuring'&&study.boot!==boot){study.state='interrupted';saveStudy(study);}return {...study,compatible:study.evaluator===evaluator()};
  });
  const cycles=db().prepare('SELECT value FROM evaluation_cycles ORDER BY rowid DESC LIMIT 100').all().map(row=>{
    const cycle=JSON.parse(row.value);if(cycle.state==='measuring'&&cycle.boot!==boot){cycle.state='interrupted';saveCycle(cycle);}return cycle;
  });
  return {studies,cycles,busy:labBusy(),policy,protocol,scope:'synthetic-capabilities-not-agi'};
}
export function readEvaluation(user,id) {
  owner(user);const study=get('evaluation_studies',id);return {study,cycles:db().prepare('SELECT value FROM evaluation_cycles WHERE study_id=? ORDER BY rowid').all(id).map(row=>JSON.parse(row.value)),history:history(id).map(row=>({...row,event:JSON.parse(row.value)}))};
}
async function measured(artifact,image,tasks,onProgress) {
  let previous,result; const receipts=[];
  for(let repetition=0;repetition<policy.repetitions;repetition++) {
    const snapshot=mkdtempSync(join(tmpdir(),'arkhe-evaluation-'));checkoutArtifact(artifact,snapshot);
    result=await evaluateWorker(image,snapshot,tasks);
    const digest=hash(result.outcomes);if(previous)demand(previous===digest,409,'Resultado não reproduzível entre repetições.');previous=digest;
    receipts.push({repetition:repetition+1,outcomesDigest:digest,buildLogDigest:result.buildLogDigest,toolCalls:result.toolCalls});
    onProgress?.(repetition+1);
  }
  return {outcomes:result.outcomes,receipts};
}
export async function createStudy(user,input) {
  owner(user);demand(typeof input.name==='string'&&input.name.trim().length>=3&&input.name.length<=100,400,'Nome do estudo: 3 a 100 caracteres.');
  const release=claimLab();let started=false;
  try {
    const image=await sandboxReady(),snapshot=mkdtempSync(join(tmpdir(),'arkhe-baseline-')),manifest=sourceSnapshot(snapshot),artifact=freezeArtifact(snapshot,manifest);
    demand(manifest['cognition/arkhe-agent/src/bin/arkhe-eval-worker.rs'],409,'O workspace precisa conter o adaptador arkhe-eval-worker.');
    const study={id:randomUUID(),name:input.name.trim(),state:'measuring',boot,createdAt:now(),actorId:user.id,baseline:artifact,head:artifact,revision:0,image,protocol,policy,evaluator:evaluator(),progress:'baseline',authority:false};
    saveSecret(study.id,{retentionSeed:secret(),initialSeed:secret()});saveStudy(study);record(study.id,{action:'baseline-frozen',artifact,image,evaluator:study.evaluator});
    appendEvent(user.id,'evaluation_baseline_frozen','evaluation:'+study.id,{artifact});started=true;
    void (async()=>{
      try {
        const seeds=get('evaluation_secrets',study.id),tasks=makeTasks(seeds.retentionSeed,seeds.initialSeed);
        const result=await measured(artifact,image,tasks,count=>{study.progress='baseline '+count+'/'+policy.repetitions;saveStudy(study);});
        study.baselineReport={taskCommitment:hash(tasks),metrics:metrics(tasks,result.outcomes),receipts:result.receipts,evaluator:study.evaluator,image,policy};
        study.baselineReportDigest=hash(study.baselineReport);study.state='ready';study.progress='baseline concluído';
      }catch{study.state='failed';study.failure='baseline-evaluation-failed';}
      finally{study.finishedAt=now();saveStudy(study);record(study.id,{action:'baseline-measured',state:study.state,reportDigest:study.baselineReportDigest||null});appendEvent(user.id,'evaluation_baseline_measured','evaluation:'+study.id,{state:study.state});}
    })().catch(()=>console.error('Baseline evidence persistence failed')).finally(release);
    return study;
  }finally{if(!started)release();}
}
export function checkoutStudyHead(studyId,destination) {
  const study=get('evaluation_studies',studyId);demand(study.state==='ready',409,'O baseline ainda não está disponível.');
  demand(study.evaluator===evaluator(),409,'O avaliador mudou; crie outro baseline antes de gerar candidatos.');
  return {manifest:checkoutArtifact(study.head,destination),artifact:study.head,revision:study.revision};
}
export async function replayBaseline(user,input) {
  owner(user);const study=get('evaluation_studies',input.studyId);
  demand(study.state==='ready'&&study.evaluator===evaluator()&&hash(study.baselineReport)===study.baselineReportDigest,409,'Baseline indisponível, alterado ou incompatível.');
  const release=claimLab();
  try {
    const image=await sandboxReady();demand(image===study.image,409,'A imagem difere do baseline.');
    record(study.id,{action:'baseline-replay-started',artifact:study.baseline});
    const seeds=get('evaluation_secrets',study.id),tasks=makeTasks(seeds.retentionSeed,seeds.initialSeed);
    demand(hash(tasks)===study.baselineReport.taskCommitment,409,'O conjunto reservado diverge do compromisso.');
    const result=await measured(study.baseline,image,tasks);
    demand(result.receipts.every(receipt=>receipt.outcomesDigest===study.baselineReport.receipts[0].outcomesDigest)&&hash(metrics(tasks,result.outcomes))===hash(study.baselineReport.metrics),409,'O baseline não reproduziu o resultado congelado.');
    study.lastReplay={status:'PASS',at:now(),reportDigest:study.baselineReportDigest,receipts:result.receipts};saveStudy(study);record(study.id,{action:'baseline-replayed',...study.lastReplay});
    appendEvent(user.id,'evaluation_baseline_replayed','evaluation:'+study.id,{reportDigest:study.baselineReportDigest});
    return study.lastReplay;
  }catch(error){
    study.lastReplay={status:'FAIL',at:now()};study.state='replay-failed';saveStudy(study);record(study.id,{action:'baseline-replay-failed'});
    throw error;
  }finally{release();}
}
export async function createCycle(user,input) {
  owner(user);const study=get('evaluation_studies',input.studyId);
  demand(study.state==='ready'&&study.evaluator===evaluator(),409,'Baseline indisponível ou avaliador alterado.');
  const run=getRun(input.runId);demand(['passed','approved'].includes(run.state),409,'O candidato precisa concluir os testes de desenvolvimento.');
  demand(run.studyId===study.id&&run.parentArtifact===study.head&&hash(run.baseline)===study.head,409,'O candidato não deriva do baseline ativo deste estudo.');
  demand(legacyHash(run.proposal)===run.proposalDigest,409,'Proposta de desenvolvimento alterada.');
  const module=catalog().find(item=>item.id===run.moduleId),proposal=validateProposal(run.proposal,module);
  const release=claimLab();let started=false;
  try {
    const image=await sandboxReady();demand(image===study.image,409,'A imagem difere da usada no baseline.');
    const snapshot=mkdtempSync(join(tmpdir(),'arkhe-candidate-')),manifest=checkoutArtifact(study.head,snapshot);
    for(const file of proposal.files){mkdirSync(dirname(join(snapshot,file.path)),{recursive:true});writeFileSync(join(snapshot,file.path),file.content);manifest[file.path]=hash(file.content);}
    const artifact=freezeArtifact(snapshot,manifest);demand(artifact!==study.head,409,'O candidato é idêntico ao baseline ativo.');
    const attempt=db().prepare('SELECT COUNT(*) AS count FROM evaluation_cycles WHERE study_id=?').get(study.id).count+1;
    const cycle={id:randomUUID(),studyId:study.id,runId:run.id,state:'measuring',boot,createdAt:now(),baseline:study.baseline,incumbent:study.head,revision:study.revision,candidate:artifact,image,evaluator:study.evaluator,attempt,alpha:policy.maximumP/(attempt*(attempt+1)),progress:'baseline',authority:false};
    saveSecret(cycle.id,{seed:secret()});saveCycle(cycle);record(study.id,{action:'cycle-started',cycleId:cycle.id,parent:study.head,candidate:artifact});started=true;
    void (async()=>{
      try {
        const seeds=get('evaluation_secrets',study.id),fresh=get('evaluation_secrets',cycle.id),tasks=makeTasks(seeds.retentionSeed,fresh.seed);
        const measuredArtifacts={};
        for(const [role,artifactId] of [['baseline',study.baseline],['incumbent',study.head],['candidate',artifact]]) {
          if(!measuredArtifacts[artifactId])measuredArtifacts[artifactId]=await measured(artifactId,image,tasks,count=>{cycle.progress=role+' '+count+'/'+policy.repetitions;saveCycle(cycle);});
        }
        const baseline=measuredArtifacts[study.baseline],incumbent=measuredArtifacts[study.head],candidate=measuredArtifacts[artifact];
        cycle.report={protocol,evaluator:study.evaluator,policy,image,baseline:study.baseline,incumbent:study.head,candidate:artifact,taskCommitment:hash(tasks),comparison:compare(tasks,baseline.outcomes,incumbent.outcomes,candidate.outcomes,cycle.alpha),receipts:Object.fromEntries(Object.entries(measuredArtifacts).map(([id,value])=>[id,value.receipts])),reproducible:true};
        cycle.evidenceDigest=hash(cycle.report);cycle.state=cycle.report.comparison.eligible?'eligible':'blocked';cycle.progress='comparação concluída';
      }catch{cycle.state='failed';cycle.failure='independent-evaluation-failed';}
      finally{cycle.finishedAt=now();saveCycle(cycle);record(study.id,{action:'cycle-measured',cycleId:cycle.id,state:cycle.state,evidenceDigest:cycle.evidenceDigest||null});appendEvent(user.id,'evaluation_cycle_measured','evaluation:'+study.id,{cycleId:cycle.id,state:cycle.state});}
    })().catch(()=>console.error('Cycle evidence persistence failed')).finally(release);
    return cycle;
  }finally{if(!started)release();}
}
function decision(user,input) {
  owner(user);const study=get('evaluation_studies',input.studyId);demand(study.state==='ready',409,'Baseline indisponível.');history(study.id);
  demand(study.evaluator===evaluator(),409,'O avaliador mudou.');
  if(input.action==='promote') {
    const cycle=get('evaluation_cycles',input.cycleId);
    demand(cycle.studyId===study.id&&cycle.state==='eligible'&&cycle.report?.comparison.eligible&&hash(cycle.report)===cycle.evidenceDigest,409,'O ciclo não é elegível ou a evidência foi alterada.');
    demand(cycle.incumbent===study.head&&cycle.revision===study.revision,409,'O baseline ativo mudou; execute outra comparação.');
    artifactManifest(cycle.candidate);
    return {study,cycle,target:cycle.candidate,evidence:cycle.evidenceDigest};
  }
  demand(input.action==='rollback',400,'Decisão inválida.');
  const allowed=new Set([study.baseline,...history(study.id).map(row=>JSON.parse(row.value)).filter(event=>event.action==='promote').map(event=>event.target)]);
  demand(allowed.has(input.target)&&input.target!==study.head,409,'Rollback exige um baseline ou candidato previamente promovido.');
  artifactManifest(input.target);return {study,target:input.target,evidence:study.baselineReportDigest};
}
export function evaluationChallenge(user,input) {
  const {study,cycle,target,evidence}=decision(user,input);
  return {statement:canonical({domain:'arkhe-intra/evaluation-decision/v1',studyId:study.id,revision:study.revision,currentHead:study.head,action:input.action,cycleId:cycle?.id||null,target,evidenceDigest:evidence,actorId:user.id})};
}
export function decideEvaluation(user,input) {
  const {statement}=evaluationChallenge(user,input);demand(verifySignature(statement,input.signature,user.publicKey),403,'Assinatura de governança inválida.');
  return transaction(()=>{
    demand(evaluationChallenge(user,input).statement===statement,409,'A decisão ficou desatualizada.');
    const {study,cycle,target,evidence}=decision(user,input),previous=study.head;
    // Verify all bytes again; promotion/rollback changes only an isolated study pointer.
    checkoutArtifact(target,mkdtempSync(join(tmpdir(),'arkhe-decision-check-')));
    study.head=target;study.revision++;saveStudy(study);
    if(cycle){cycle.state='promoted';cycle.review={statement,signature:input.signature,publicKey:user.publicKey,at:now()};saveCycle(cycle);}
    record(study.id,{action:input.action,cycleId:cycle?.id||null,previous,target,revision:study.revision,evidenceDigest:evidence,statement,signature:input.signature,publicKey:user.publicKey});
    appendEvent(user.id,'evaluation_'+input.action,'evaluation:'+study.id,{previous,target,revision:study.revision});
    return {studyId:study.id,head:target,revision:study.revision,action:input.action,liveWorkspaceModified:false};
  });
}
