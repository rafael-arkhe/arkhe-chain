import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFrame,mmrPeaks,reconnectDelay} from '../public/protocol.js';
const signal=(metric,value)=>JSON.stringify({type:'signal',data:{source:'test',topic:'/arkhe/evidence',metric,value}});
test('typed message validation rejects malformed, oversized and forged scalar types',()=>{
 for(const raw of ['[]','null','{',signal('evidence_count',-1),signal('wer_linked','false'),signal('mmr_root','not-a-digest'),signal('confidence',1.01),signal('r_dsa','1'),signal('route',{}),' '.repeat(65537)]) assert.throws(()=>parseFrame(raw));
 assert.throws(()=>parseFrame('{"type":"subscribed","__proto__":{"admin":true}}'));
 assert.equal(parseFrame(signal('wer_linked',false)).data.value,false);
 assert.equal(parseFrame(signal('mmr_root','ab'.repeat(32))).data.value,'ab'.repeat(32));
});
test('history must consist of independently validated signals',()=>{
 assert.throws(()=>parseFrame(JSON.stringify({type:'history',signals:[{topic:'/x',metric:'wer_linked',value:'true'}]})));
 assert.throws(()=>parseFrame(JSON.stringify({type:'history',signals:Array(101).fill({})})));
});
test('MMR peak visualization terminates correctly beyond 32-bit and at safe integer limit',()=>{
 for(const n of [0,1,3,2**32,2**40+7,Number.MAX_SAFE_INTEGER]){
  const peaks=mmrPeaks(n);assert.equal(peaks.reduce((sum,p)=>sum+p.size,0),n);assert.ok(peaks.length<=53);
 }
 assert.deepEqual(mmrPeaks(-1),[]);assert.deepEqual(mmrPeaks(Infinity),[]);
});
test('backoff is bounded with jitter and increases across failed attempts',()=>{
 assert.equal(reconnectDelay(1,1),1000);assert.equal(reconnectDelay(2,1),2000);assert.equal(reconnectDelay(50,1),30000);assert.equal(reconnectDelay(1,0),800);
});
test('backend error messages remain plain text and cannot supply state or prototype mutations',()=>{
 assert.deepEqual(parseFrame(JSON.stringify({error:'<img src=x onerror=alert(1)>'})),{type:'error',message:'<img src=x onerror=alert(1)>'});
 assert.throws(()=>parseFrame('{"error":"bad","__proto__":{"admin":true}}'));
});
test('nested attestation flags and metrics cannot bypass scalar validation',()=>{
 for(const [metric,value] of [['identity_attestation',{passed:'false'}],['identity_attestation',{confidence:5}],['identity_attestation',{tpm_anchor:{available:true,fingerprint:{}}}],['multiplicity_attestation',{ambiguity:'1'}],['cycle_stats',{cycle:{}}],['cycle_stats',{r2:2}]])assert.throws(()=>parseFrame(signal(metric,value)));
 assert.equal(parseFrame(signal('identity_attestation',{confidence:0.9,passed:true,tpm_anchor:{available:false}})).data.value.passed,true);
});
