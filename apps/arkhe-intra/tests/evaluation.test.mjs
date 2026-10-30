import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
process.env.ARKHE_INTRA_DATA_DIR=mkdtempSync(join(tmpdir(),'arkhe-evaluation-unit-'));
const {makeTasks,correct,toolResult,metrics,compare,hash,canonical,domains,policy}=await import('../lib/evaluation-core.mjs');
const {freezeArtifact,checkoutArtifact,artifactManifest,evaluationTables}=await import('../lib/evaluation-artifacts.mjs');
const {db}=await import('../lib/store.mjs');
test('reserved task banks replay exactly; fresh banks rotate and retained tasks remain fixed',()=>{
  const first=makeTasks('retention-secret','cycle-one'),repeat=makeTasks('retention-secret','cycle-one'),next=makeTasks('retention-secret','cycle-two');
  assert.equal(first.length,192);assert.equal(hash(first),hash(repeat));assert.notEqual(hash(first),hash(next));
  const retained=bank=>bank.filter(row=>row.split==='retention').sort((a,b)=>a.id.localeCompare(b.id));
  assert.equal(hash(retained(first)),hash(retained(next)));
  for(const domain of domains)assert.equal(first.filter(row=>row.domain===domain).length,48);
  for(const item of first){assert.ok(!Object.hasOwn(item.task,'expected'));assert.ok(!Object.hasOwn(item.task,'vault'));}
  assert.notEqual(hash(canonical({a:1,b:2})),hash(canonical({a:1,b:3})));
});
test('independent scoring rejects fake success, invalid plans, unknown tools and wrong answers',()=>{
  const tasks=makeTasks('r','f');
  const reasoning=tasks.find(row=>row.domain==='reasoning');
  assert.equal(correct(reasoning,{answer:reasoning.expected}),true);assert.equal(correct(reasoning,{passed:true}),false);assert.equal(correct(reasoning,{answer:String(reasoning.expected)}),false);
  const plan=tasks.find(row=>row.domain==='planning'&&row.task.edges.length);assert.equal(correct(plan,{answer:plan.task.nodes.map(()=>plan.task.nodes[0])}),false);
  const tools=tasks.find(row=>row.domain==='tools');assert.equal(toolResult(tools,{tool:'read',key:tools.task.keys[0]}),tools.vault[tools.task.keys[0]]);
  assert.throws(()=>toolResult(tools,{tool:'exec',command:'anything'}));assert.throws(()=>toolResult(tools,{tool:'read',key:'../secrets'}));
  assert.throws(()=>toolResult(reasoning,{tool:'read',key:'x'}));
});
test('promotion requires gains, retention, OOD floor and paired evidence with alpha spending',()=>{
  const tasks=makeTasks('r','f'),baseline=Object.fromEntries(tasks.map(row=>[row.id,!(row.domain==='learning'&&row.split==='generalization')]));
  const quadratic={...baseline};for(const item of tasks.filter(row=>row.domain==='learning'&&row.split==='generalization').slice(0,8))quadratic[item.id]=true;
  const first=compare(tasks,baseline,baseline,quadratic,0.025);assert.equal(first.eligible,true);assert.equal(first.paired.wins,8);assert.equal(first.paired.p,1/256);
  const cubic=Object.fromEntries(tasks.map(row=>[row.id,true]));assert.equal(compare(tasks,baseline,quadratic,cubic,0.05/6).eligible,true);
  const noGain=compare(tasks,baseline,baseline,baseline);assert.equal(noGain.eligible,false);assert.equal(noGain.paired.p,1);
  const regression={...quadratic};const retained=tasks.find(row=>row.split==='retention');regression[retained.id]=false;
  assert.ok(compare(tasks,baseline,baseline,regression).reasons.includes('capability-regression'));
  assert.equal(compare(tasks,baseline,baseline,quadratic,0.0001).eligible,false);
  assert.equal(metrics(tasks,cubic).generalization.learning.score,1);assert.equal(policy.repetitions,2);
});
test('frozen content-addressed baselines reject overwrite, corrupt blobs and path escapes',()=>{
  evaluationTables();const source=mkdtempSync(join(tmpdir(),'arkhe-evaluation-files-'));
  mkdirSync(join(source,'cognition/arkhe-agent/src'),{recursive:true});writeFileSync(join(source,'cognition/arkhe-agent/src/lib.rs'),'// frozen');
  const digest=hash('// frozen'),manifest={'cognition/arkhe-agent/src/lib.rs':digest},id=freezeArtifact(source,manifest);
  assert.deepEqual(artifactManifest(id),manifest);assert.throws(()=>db().prepare('UPDATE evaluation_artifacts SET value=? WHERE id=?').run('{}',id),/immutable/);
  const target=mkdtempSync(join(tmpdir(),'arkhe-evaluation-checkout-'));checkoutArtifact(id,target);assert.equal(readFileSync(join(target,'cognition/arkhe-agent/src/lib.rs'),'utf8'),'// frozen');
  assert.throws(()=>freezeArtifact(source,{'../outside':digest}));
  const blob=join(process.env.ARKHE_INTRA_DATA_DIR,'evaluation-artifacts',digest);chmodSync(blob,0o600);writeFileSync(blob,'corrupted');
  assert.throws(()=>checkoutArtifact(id,mkdtempSync(join(tmpdir(),'arkhe-corrupt-'))),/corrompido/);
});
test('evaluation routes require a session and owner; API never returns a private bank',async()=>{
  const {handle}=await import('../lib/http.mjs');
  const response=await handle(new Request('http://127.0.0.1:3003/api/evaluations'),['evaluations']);assert.equal(response.status,401);
  const {evaluationOverview}=await import('../lib/evaluations.mjs');assert.throws(()=>evaluationOverview({role:'author'}),/governança/);
  const overview=evaluationOverview({role:'owner'});assert.ok(!JSON.stringify(overview).includes('retentionSeed'));
});
test('signed study promotion and rollback bind exact evidence, revision and previously accepted artifacts',async()=>{
  const {evaluationChallenge,decideEvaluation,readEvaluation}=await import('../lib/evaluations.mjs');
  const {evaluatorIdentity}=await import('../lib/evaluation-core.mjs');
  const {evaluateWorker}=await import('../lib/evaluation-worker.mjs');
  const keys=generateKeyPairSync('ed25519'),owner={id:'owner-test',role:'owner',publicKey:keys.publicKey.export({type:'spki',format:'pem'})};
  function artifact(content){const folder=mkdtempSync(join(tmpdir(),'arkhe-decision-artifact-'));mkdirSync(join(folder,'cognition/arkhe-agent/src'),{recursive:true});writeFileSync(join(folder,'cognition/arkhe-agent/src/lib.rs'),content);return freezeArtifact(folder,{'cognition/arkhe-agent/src/lib.rs':hash(content)});}
  const baseline=artifact('// decision baseline'),candidate=artifact('// decision candidate'),unaccepted=artifact('// never accepted');
  const study={id:randomUUID(),state:'ready',baseline,head:baseline,revision:0,evaluator:hash({core:evaluatorIdentity(),worker:evaluateWorker.toString()}),baselineReportDigest:'baseline-report'};
  db().prepare('INSERT INTO evaluation_studies(id,value) VALUES(?,?)').run(study.id,JSON.stringify(study));
  const report={comparison:{eligible:true}},cycle={id:randomUUID(),studyId:study.id,state:'eligible',incumbent:baseline,candidate,revision:0,report,evidenceDigest:hash(report)};
  db().prepare('INSERT INTO evaluation_cycles(id,study_id,value) VALUES(?,?,?)').run(cycle.id,study.id,JSON.stringify(cycle));
  const input={studyId:study.id,cycleId:cycle.id,action:'promote'},challenge=evaluationChallenge(owner,input),signature=sign(null,Buffer.from(challenge.statement),keys.privateKey).toString('base64');
  assert.throws(()=>decideEvaluation(owner,{...input,signature:'invalid'}),/Assinatura/);
  assert.throws(()=>db().prepare('UPDATE evaluation_cycles SET value=? WHERE id=?').run(JSON.stringify({...cycle,report:{comparison:{eligible:false}}}),cycle.id),/immutable/);
  assert.throws(()=>db().prepare('UPDATE evaluation_studies SET value=? WHERE id=?').run(JSON.stringify({...study,baseline:unaccepted}),study.id),/immutable/);
  const forged={...cycle,id:randomUUID(),evidenceDigest:'wrong-digest'};db().prepare('INSERT INTO evaluation_cycles(id,study_id,value) VALUES(?,?,?)').run(forged.id,study.id,JSON.stringify(forged));
  assert.throws(()=>evaluationChallenge(owner,{...input,cycleId:forged.id}),/elegível/);
  assert.equal(decideEvaluation(owner,{...input,signature}).head,candidate);
  assert.throws(()=>decideEvaluation(owner,{...input,signature}));
  assert.throws(()=>evaluationChallenge(owner,{studyId:study.id,action:'rollback',target:unaccepted}),/previamente/);
  const rollback={studyId:study.id,action:'rollback',target:baseline},rollbackStatement=evaluationChallenge(owner,rollback).statement;
  assert.equal(decideEvaluation(owner,{...rollback,signature:sign(null,Buffer.from(rollbackStatement),keys.privateKey).toString('base64')}).head,baseline);
  const exported=readEvaluation(owner,study.id);assert.equal(exported.history.length,2);assert.equal(exported.study.revision,2);
  assert.throws(()=>db().prepare('DELETE FROM evaluation_history').run(),/append only/);
});
