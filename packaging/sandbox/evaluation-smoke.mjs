// Handwritten candidate fixtures test the evaluation protocol, not autonomous AGI efficacy.
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID, createHash, sign, scryptSync } from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const execute=promisify(execFile),data=mkdtempSync(join(tmpdir(),'arkhe-efficacy-live-'));
process.env.ARKHE_INTRA_DATA_DIR=data;
execFileSync(process.execPath,['scripts/setup.mjs'],{cwd:resolve('apps/arkhe-intra'),env:process.env,stdio:'pipe'});
const accounts=JSON.parse(readFileSync(join(data,'accounts.json')));
for(const user of accounts)user.passwordHash=scryptSync('Arkhe-Evaluation-Test-2026!',user.salt,64).toString('hex');
writeFileSync(join(data,'accounts.json'),JSON.stringify(accounts));
const user=accounts.find(row=>row.role==='owner'),key=readFileSync(join(data,'owner.private.pem'));
const {createStudy,createCycle,readEvaluation,evaluationChallenge,decideEvaluation,checkoutStudyHead,evaluationOverview}=await import('../../apps/arkhe-intra/lib/evaluations.mjs');
const {sandboxArguments,overview:developmentOverview}=await import('../../apps/arkhe-intra/lib/development.mjs');
const {db,auditIntegrity}=await import('../../apps/arkhe-intra/lib/store.mjs');
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function waitFor(studyId,cycleId) {
  let last='';
  for(let n=0;n<300;n++) {
    const detail=readEvaluation(user,studyId),value=cycleId?detail.cycles.find(row=>row.id===cycleId):detail.study;
    const phase=value.state+':'+value.progress;if(last!==phase){console.log(phase);last=phase;}
    if(value.state!=='measuring')return value;
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw Error('Evaluation did not finish');
}
function interpolation(degree) {
  return `use serde_json::Value;
pub fn predict(task: &Value) -> Option<i64> {
    let examples=task["examples"].as_array()?;
    if examples.len()<${degree+1} {return None;}
    let evaluate=|x:f64| -> Option<f64> {
        let mut result=0.0;
        for i in 0..${degree+1} {
            let xi=examples[i][0].as_i64()? as f64;
            let mut term=examples[i][1].as_i64()? as f64;
            for j in 0..${degree+1} {if i!=j {let xj=examples[j][0].as_i64()? as f64;if xi==xj{return None;}term*= (x-xj)/(xi-xj);}}
            result+=term;
        }
        Some(result)
    };
    for pair in examples {if (evaluate(pair[0].as_i64()? as f64)?-pair[1].as_i64()? as f64).abs()>0.000001{return None;}}
    let result=evaluate(task["query"].as_i64()? as f64)?;
    if !result.is_finite() || (result-result.round()).abs()>0.000001 {return None;}
    Some(result.round() as i64)
}
#[test] fn reference_example() {let t=serde_json::json!({"examples":[[0,1],[1,4],[2,9],[3,16]],"query":4});assert_eq!(predict(&t),Some(25));}
`;
}
const study=await createStudy(user,{name:'Smoke: capacidade sintética e rollback'});
developmentOverview(user);
mkdirSync('ops/local/evaluation-smoke',{recursive:true});writeFileSync('ops/local/evaluation-smoke/fixture.json',JSON.stringify({data,studyId:study.id}));
const initial=await waitFor(study.id);assert.equal(initial.state,'ready');
const start=evaluationOverview(user).studies.find(row=>row.id===study.id);assert.equal(start.baseline,start.head);
const cycles=[];
for(const degree of [2,3]) {
  const snapshot=mkdtempSync(join(tmpdir(),'arkhe-candidate-fixture-')),parent=checkoutStudyHead(study.id,snapshot),path='cognition/arkhe-agent/src/eval_learning.rs',content=interpolation(degree);
  writeFileSync(join(snapshot,path),content);
  const name='arkhe-evaluation-fixture-'+randomUUID(),args=sandboxArguments(study.image,name,snapshot,{id:'arkhe-agent'});
  try {const tested=await execute('podman',args,{windowsHide:true,timeout:120000,maxBuffer:1048576});assert.match(tested.stdout,/1 passed/);}
  finally{await execute('podman',[...args.slice(0,args.indexOf('run')),'rm','-f',name],{windowsHide:true,timeout:15000});}
  const proposal={summary:'Handwritten interpolation fixture of degree '+degree,files:[{path,content}]};
  const run={id:randomUUID(),studyId:study.id,parentArtifact:parent.artifact,moduleId:'arkhe-agent',state:'passed',baseline:parent.manifest,baselineDigest:sha(parent.manifest),proposal,proposalDigest:sha(proposal),objective:'Controlled handwritten fixture; not model generated',testsPassed:1};
  db().prepare('INSERT INTO development_runs(id,value) VALUES(?,?)').run(run.id,JSON.stringify(run));
  const cycle=await createCycle(user,{studyId:study.id,runId:run.id}),result=await waitFor(study.id,cycle.id);
  assert.equal(result.state,'eligible',JSON.stringify(result));
  const request={studyId:study.id,cycleId:cycle.id,action:'promote'},challenge=evaluationChallenge(user,request);
  const signature=sign(null,Buffer.from(challenge.statement),key).toString('base64');
  const decision=decideEvaluation(user,{...request,signature});assert.equal(decision.head,result.candidate);assert.equal(decision.liveWorkspaceModified,false);
  assert.throws(()=>decideEvaluation(user,{...request,signature}));
  cycles.push({cycleId:cycle.id,degree,comparison:result.report.comparison,evidenceDigest:result.evidenceDigest});
  console.log('PASS promotion',degree,JSON.stringify(result.report.comparison.paired));
}
const rollback={studyId:study.id,action:'rollback',target:initial.baseline},challenge=evaluationChallenge(user,rollback),signature=sign(null,Buffer.from(challenge.statement),key).toString('base64');
const decision=decideEvaluation(user,{...rollback,signature});assert.equal(decision.head,initial.baseline);assert.equal(decision.revision,3);assert.equal(auditIntegrity(),true);
assert.throws(()=>decideEvaluation(user,{...rollback,signature}));
const result=readEvaluation(user,study.id);
assert.ok(!JSON.stringify(result).includes('retentionSeed'));assert.ok(!JSON.stringify(result).includes('expected'));
assert.equal(JSON.stringify(result).includes('privateKey'),false);
const output=resolve('docs/evidence/local/2026-10-18/capability-evaluation');mkdirSync(output,{recursive:true});
writeFileSync(join(output,'live-smoke.json'),JSON.stringify({status:'PASS',scope:'handwritten synthetic capability fixtures; not autonomous improvement or AGI',baseline:initial.baselineReport,cycles,rollback:decision,history:result.history},null,2));
mkdirSync('ops/local/evaluation-smoke',{recursive:true});writeFileSync('ops/local/evaluation-smoke/fixture.json',JSON.stringify({data,studyId:study.id}));
console.log('PASS baseline replay, 2 real capability gains, signed promotions, stale-signature rejection and signed rollback');
