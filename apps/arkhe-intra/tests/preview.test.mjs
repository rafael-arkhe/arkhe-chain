import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign,verify} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createPreviewBridge,cockpitBinding} from '../lib/preview.mjs';
import {digest} from '../lib/crypto.mjs';
const pair=generateKeyPairSync('ed25519');const pub=pair.publicKey.export({format:'pem',type:'spki'});
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('cockpit binds native review to run, authenticated identity and CLI admission',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'arkhe-preview-bridge-test-'));const id='11111111-1111-4111-8111-111111111111';
  const run={id,actorId:'builder',moduleId:'arkhe-agent',state:'passed',exitCode:0,testsPassed:1,image:'sha256:'+'a'.repeat(64),baseline:{a:'b'},proposal:{files:[]},log:'ok'};
  run.baselineDigest=sha(run.baseline);run.proposalDigest=sha(run.proposal);run.evidenceDigest=sha({baselineDigest:run.baselineDigest,proposalDigest:run.proposalDigest,image:run.image,exitCode:run.exitCode,log:run.log});
  const user={id:'governor',role:'owner',publicKey:pub};
  const trust=join(dir,'trust.json');const path=join(dir,id+'.json');
  writeFileSync(trust,JSON.stringify({reviewer:'governor',requested_by:'builder',reviewer_key:[...Buffer.from(pair.publicKey.export({format:'jwk'}).x,'base64url')]}));
  const request={spec:{cockpit_binding:[...Buffer.from(cockpitBinding(run),'hex')],module:run.moduleId,image:run.image},intent:{request_identity:[...Buffer.from(digest(Buffer.concat([Buffer.from('AKG:REQUEST:v1\0'),Buffer.from(run.id)])),'hex')]},reviewer_signature:''};
  writeFileSync(path,JSON.stringify(request));let linked;let calls=0;
  const operation='b'.repeat(64),payload=Buffer.from('native deterministic CBOR challenge fixture');
  const bridge=createPreviewBridge({configuration:()=>({binary:join(dir,'supervisor.exe'),trust,requestsRoot:dir}),runFor:()=>run,linkFor:()=>linked,saveLink:(_,op)=>{linked=op;},execute:async(binary,args)=>{
    calls++;assert.ok(args.includes('--trust'));assert.ok(!args.some(arg=>arg.includes('private')));
    if(args.includes('--review-payload'))return {stdout:JSON.stringify({signing_payload_hex:payload.toString('hex'),operation_id:operation,spec:request.spec})};
    if(args.includes('--status'))return {stdout:JSON.stringify({dispatch:{state:'LEASED',attempts:1,fence:1}})};
    const submitted=JSON.parse(readFileSync(args[args.indexOf('--request')+1]));
    assert.ok(verify(null,payload,pair.publicKey,Buffer.from(submitted.reviewer_signature,'hex')));
    return {stdout:JSON.stringify({status:'ADMITTED_PENDING',executed:false,operation_id:operation})};
  }});
  try{
    await assert.rejects(bridge.challenge({...user,role:'author'},id),/governança/);
    await assert.rejects(bridge.challenge({...user,id:'other'},id),/Identidade/);assert.equal(calls,0);
    const challenge=await bridge.challenge(user,id);assert.equal(challenge.operation_id,operation);
    const signature=sign(null,payload,pair.privateKey).toString('base64');
    assert.equal((await bridge.approve(user,id,{signature})).status,'ADMITTED_PENDING');
    assert.equal((await bridge.status(user,id)).state,'LEASED');assert.equal(linked,operation);
    run.proposalDigest='tampered';await assert.rejects(bridge.challenge(user,id),/alteradas/);
  }finally{unlinkSync(trust);unlinkSync(path);rmdirSync(dir);}
});
test('absent supervisor stays unavailable and never invokes a process',async()=>{
  const bridge=createPreviewBridge({configuration:()=>null,runFor:()=>({}),execute:()=>assert.fail('must not execute'),linkFor:()=>null,saveLink:()=>{}});
  const user={role:'owner'};const id='11111111-1111-4111-8111-111111111111';
  assert.equal((await bridge.status(user,id)).configured,false);await assert.rejects(bridge.challenge(user,id),/não configurado/);
});
