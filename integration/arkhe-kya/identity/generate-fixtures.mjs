import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { makeFixture, TEST_CNPJ } from './fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.argv[2]??new URL('./fixtures/generated',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const run=spawnSync('cargo',['run','--quiet','--locked','--example','fixture'],{cwd:root,encoding:'utf8',timeout:60000});
if(run.status!==0) throw new Error(run.stderr);
const native=JSON.parse(run.stdout);
const wasm=createRequire(import.meta.url)('../pkg/arkhe_kya_experimental.js');
const challenge=JSON.parse(wasm.principal_authorization_challenge(JSON.stringify(native.passport),JSON.stringify(native.context)));
if(challenge.outcome!=='CHALLENGE_READY') throw new Error('Invalid base fixture');
const fixture=await makeFixture(challenge.challenge,native.context.now);
// Existing destination is rejected. Private keys never leave makeFixture memory.
mkdirSync(output,{recursive:false});
const save=(name,value)=>writeFileSync(join(output,name),value,{flag:'wx'});
save('certificate.der',Buffer.from(fixture.leaf_certificate,'base64'));
save('issuer.der',Buffer.from(fixture.anchors[0],'base64'));
save('cms.der',Buffer.from(fixture.cms_base64,'base64'));
for(const kind of ['clean','revoked','expired','future','tooOld']) save(`${kind}.crl`,Buffer.from(fixture[kind],'base64'));
save('inputs.json',JSON.stringify({label:'synthetic-poc',receipt:native.passport,context:native.context,
 evidence:{cms_base64:fixture.cms_base64,crl_base64:fixture.clean},
 trust:{trust_profile:'synthetic-test-pki@1',anchors:fixture.anchors,expected_cnpj:TEST_CNPJ,now:native.context.now,max_crl_age_seconds:300},
 warning:'Throwaway CA; no private keys; not ICP-Brasil identity; random keys make regeneration byte-distinct.'},null,2)+'\n');
console.log(`Synthetic public fixtures written to ${output}`);
