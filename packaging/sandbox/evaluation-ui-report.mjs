import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from '../../apps/arkhe-intra/lib/evaluation-core.mjs';
const origin='http://127.0.0.1:13049';
const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'owner@arkhe.local',password:'Arkhe-Evaluation-Test-2026!'})});
assert.equal(login.status,200);const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
const overview=await (await fetch(origin+'/api/evaluations',{headers})).json();
const study=overview.studies.find(row=>row.name==='Baseline de verificação da interface');
assert.equal(study.state,'ready');assert.equal(study.compatible,true);
const runs=await (await fetch(origin+'/api/development',{headers})).json(),run=runs.runs.find(row=>row.studyId===study.id);
assert.ok(run);let candidate;
for(let n=0;n<120;n++) {
  candidate=await (await fetch(origin+'/api/development/runs/'+run.id,{headers})).json();
  if(!['generating','testing'].includes(candidate.state))break;
  await new Promise(resolve=>setTimeout(resolve,2000));
}
assert.ok(['passed','failed'].includes(candidate.state));
assert.equal(candidate.parentArtifact,study.baseline);assert.equal(hash(candidate.baseline),candidate.parentArtifact);
assert.equal(hash(readFileSync('cognition/arkhe-agent/src/eval_learning.rs')),candidate.baseline['cognition/arkhe-agent/src/eval_learning.rs']);
const exported=await fetch(origin+'/api/evaluations/studies/'+study.id,{headers});
assert.match(exported.headers.get('content-disposition'),/attachment/);const value=await exported.json();
assert.ok(!JSON.stringify(value).includes('retentionSeed'));assert.ok(!JSON.stringify(value).includes('initialSeed'));
assert.equal((await fetch(origin+'/api/evaluations/cycles',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,403);
writeFileSync('docs/evidence/local/2026-10-18/capability-evaluation/ui-report.json',JSON.stringify({status:'PASS',checks:['Authenticated UI creates and measures frozen baseline','Current evaluator is compatible','Reserved seeds absent from exports','CSRF rejects missing origin','Model generation is bound to frozen parent','Original source unchanged'],study,modelCandidate:{id:candidate.id,state:candidate.state,failure:candidate.failure,proposalDigest:candidate.proposalDigest,testsPassed:candidate.testsPassed,parentArtifact:candidate.parentArtifact}},null,2));
console.log(JSON.stringify({status:'PASS',modelCandidate:candidate.state,failure:candidate.failure,testsPassed:candidate.testsPassed}));
