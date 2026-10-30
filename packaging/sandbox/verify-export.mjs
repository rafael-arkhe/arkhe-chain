import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, verify } from 'node:crypto';
import assert from 'node:assert/strict';
const fixture=JSON.parse(readFileSync('ops/local/packaging/credential-ui-fixture.json'));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function login(role) {
  const response=await fetch(fixture.origin+'/api/login',{method:'POST',headers:{Origin:fixture.origin,'Content-Type':'application/json'},body:JSON.stringify({email:role+'@arkhe.local',password:'Arkhe-UI-Review-2026!'})});
  assert.equal(response.status,200); return response.headers.get('set-cookie').split(';')[0];
}
const cookie=await login('owner');
const headers={Cookie:cookie};
const overview=await (await fetch(fixture.origin+'/api/development',{headers})).json();
const selected=overview.runs.find(run=>run.state==='approved'); assert.ok(selected);
const response=await fetch(fixture.origin+'/api/development/runs/'+selected.id,{headers}); assert.equal(response.status,200);
const run=await response.json();
assert.equal(run.proposalDigest,sha(run.proposal)); assert.equal(run.baselineDigest,sha(run.baseline));
assert.equal(run.evidenceDigest,sha({baselineDigest:run.baselineDigest,proposalDigest:run.proposalDigest,image:run.image,exitCode:run.exitCode,log:run.log}));
const account=JSON.parse(readFileSync(join(fixture.directory,'accounts.json'))).find(row=>row.role==='owner');
assert.equal(verify(null,Buffer.from(run.review.statement),account.publicKey,Buffer.from(run.review.signature,'base64')),true);
const statement=JSON.parse(run.review.statement); assert.equal(statement.proposalDigest,run.proposalDigest); assert.equal(statement.evidenceDigest,run.evidenceDigest); assert.equal(statement.actorId,account.id);
const authorCookie=await login('author');
assert.equal((await fetch(fixture.origin+'/api/development',{headers:{Cookie:authorCookie}})).status,403);
assert.equal((await fetch(fixture.origin+'/api/development/runs/'+selected.id)).status,401);
for (const [path,hash] of Object.entries(run.baseline)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,'Original source changed: '+path);
writeFileSync('docs/evidence/local/2026-10-18/development-sandbox/ui-run.json',JSON.stringify(run,null,2));
console.log(JSON.stringify({status:'PASS',testsPassed:run.testsPassed,checks:['UI proposal and sandbox execution','Signed governance approval','Protected evidence export','Recomputed artifact hashes','Original workspace unchanged']}));
