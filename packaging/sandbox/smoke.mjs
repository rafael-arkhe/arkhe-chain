import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
process.env.ARKHE_INTRA_DATA_DIR = mkdtempSync(join(tmpdir(),'arkhe-development-live-'));
const { sandboxReady, sandboxArguments, catalog, sourceSnapshot, startRun, getRun, reviewChallenge, decideRun } = await import('../../apps/arkhe-intra/lib/development.mjs');
const image = await sandboxReady();
const snapshot = mkdtempSync(join(tmpdir(),'arkhe-isolation-live-'));
sourceSnapshot(snapshot);
const name = 'arkhe-isolation-' + Date.now();
const args = sandboxArguments(image,name,snapshot,catalog()[0]);
args.splice(args.indexOf('-c')+1,3,'test "$(id -u)" = 10001 && ! touch /input/host-marker && ! touch /etc/host-marker && test ! -S /var/run/docker.sock && test "$(wc -l < /proc/net/route)" = 1 && echo ISOLATION_PASS');
let isolation;
try { isolation = execFileSync('podman',args,{encoding:'utf8',timeout:30000}); }
finally {execFileSync('podman',['--connection',process.env.ARKHE_SANDBOX_CONNECTION || 'arkhe-runtime','rm','-f',name]);}
if (!isolation.includes('ISOLATION_PASS') || existsSync(join(snapshot,'host-marker'))) throw Error('Isolation check failed');
console.log('PASS actual sandbox: UID, resource limits, no network route, read-only input/root, no engine socket');
const pair = generateKeyPairSync('ed25519');
const user = { id:'synthetic-governance',role:'owner',publicKey:pair.publicKey.export({type:'spki',format:'pem'}) };
const run = await startRun(user,{moduleId:'arkhe-agent',objective:'Add an integration regression test for PlanStep.clone(): protected=true remains true and the original fields remain unchanged. Import arkhe_agent::PlanStep. Test the existing behavior, no changes to src/lib.rs.'});
console.log('Started model proposal',run.id);
let result;
for (let i=0;i<180;i++) { await new Promise(resolve => setTimeout(resolve,2000)); result=getRun(run.id); if (!['generating','testing'].includes(result.state)) break; }
if (result.state === 'passed') {
  const {statement}=reviewChallenge(user,run.id);
  result=decideRun(user,run.id,{signature:sign(null,Buffer.from(statement),pair.privateKey).toString('base64')});
  console.log('PASS generated regression test and signed export approval');
}
const output=resolve('docs/evidence/local/2026-10-18/development-sandbox'); mkdirSync(output,{recursive:true});
writeFileSync(join(output,'live-run.json'),JSON.stringify({isolation: isolation.trim(),run:result},null,2));
console.log(JSON.stringify({state:result.state,failure:result.failure,testsPassed:result.testsPassed,evidenceDigest:result.evidenceDigest}));
if(result.state!=='approved') process.exitCode=1;
