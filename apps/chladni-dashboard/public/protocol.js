export const MAX_FRAME = 65536;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=128)=>typeof v==='string'&&v.length>0&&v.length<=max;
const count=v=>Number.isSafeInteger(v)&&v>=0;
const ratio=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const COUNTS=new Set(['cycle','cycle_count','prompt_version','execution_attestations','identity_ttl','evidence_count','evidence_verified','evidence_pending','evidence_rejected','wer_count','mmr_leaves']);
const RATIOS=new Set(['phiInterop','phi','rTeam','r_dsa','confidence','phi_confidence','identity_confidence','multiplicity_ambiguity','multiplicity_discrepancy','multiplicity_rashomon_capacity']);
const BOOLS=new Set(['wer_linked','safety_approved','identity_verified','deadman_active','multiplicity_passed']);
const TEXTS=new Set(['route','safety_reason','orchestrator_status','threat_level','biometric_status','contingency_status','gate_reason','mmr_profile']);
const HASHES=new Set(['mmr_root','wer_last_hash']);
export function boundedValue(v,depth=0,budget={nodes:0}) {
  if(++budget.nodes>512||depth>6)return false;
  if(v===null||typeof v==='boolean')return true;
  if(typeof v==='number')return Number.isFinite(v);
  if(typeof v==='string')return v.length<=4096;
  if(Array.isArray(v))return v.length<=100&&v.every(x=>boundedValue(x,depth+1,budget));
  if(!isObject(v))return false;
  const entries=Object.entries(v);return entries.length<=64&&entries.every(([k,x])=>!['__proto__','prototype','constructor'].includes(k)&&k.length<=128&&boundedValue(x,depth+1,budget));
}
export function validMetric(metric,value) {
  if(metric==='r2')return typeof value==='number'&&Number.isFinite(value)&&value<=1;
  if(metric==='multiplicity_attestation')return isObject(value)&&['ambiguity','discrepancy','rashomon_capacity'].every(k=>value[k]===undefined||ratio(value[k]))&&(value.passed===undefined||typeof value.passed==='boolean');
  if(metric==='identity_attestation')return isObject(value)&&(value.confidence===undefined||ratio(value.confidence))&&['passed','tpm_signature_verified'].every(k=>value[k]===undefined||typeof value[k]==='boolean')&&(value.tpm_signature===undefined||text(value.tpm_signature,4096))&&(value.tpm_anchor===undefined||(isObject(value.tpm_anchor)&&typeof value.tpm_anchor.available==='boolean'&&(value.tpm_anchor.fingerprint===undefined||text(value.tpm_anchor.fingerprint))));
  if(TEXTS.has(metric))return text(value,512);
  if(metric==='execution_attestation')return isObject(value)&&(!value.id||text(value.id))&&(value.policy_compliant===undefined||typeof value.policy_compliant==='boolean');
  if(COUNTS.has(metric))return count(value);
  if(RATIOS.has(metric))return ratio(value);
  if(BOOLS.has(metric))return typeof value==='boolean';
  if(HASHES.has(metric))return typeof value==='string'&&/^[a-fA-F0-9]{64}$/.test(value);
  if(metric==='latency_ms')return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=3600000;
  if(metric==='gate_status')return ['UNKNOWN','FAIL_CLOSED','REJECTED','ALLOWED','DENIED','OPEN','CLOSED','VERIFIED'].includes(value);
  if(metric==='cycle_stats')return isObject(value)&&Object.entries(value).every(([k,v])=>v===null||validMetric(k,v));
  return boundedValue(value);
}
export function validSignal(s) {
  return isObject(s)&&text(s.topic)&&/^\/[a-zA-Z0-9_/-]+$/.test(s.topic)&&text(s.metric)&&(!s.source||text(s.source))&&boundedValue(s.value)&&validMetric(s.metric,s.value)&&(!s.timestamp||(text(s.timestamp)&&Number.isFinite(Date.parse(s.timestamp))));
}
export function parseFrame(raw) {
  if(typeof raw!=='string'||raw.length>MAX_FRAME||new TextEncoder().encode(raw).byteLength>MAX_FRAME)throw new Error('Frame too large or not text');
  const m=JSON.parse(raw);
  if(!isObject(m)||!boundedValue(m))throw new Error('Invalid message shape');
  if(text(m.error,512))return {type:'error',message:m.error};
  if(!text(m.type,32))throw new Error('Invalid message type');
  if(m.type==='signal'&&!validSignal(m.data))throw new Error('Invalid signal');
  if(m.type==='history'&&(!Array.isArray(m.signals)||m.signals.length>100||!m.signals.every(validSignal)))throw new Error('Invalid history');
  if(m.type==='status'&&(!Array.isArray(m.topics)||m.topics.length>100||m.topics.some(t=>!isObject(t)||!text(t.topic)||!count(t.subscribers)||!count(t.signalCount)||(t.lastSignal!==null&&t.lastSignal!==undefined&&!validSignal(t.lastSignal)))||typeof m.chainValid!=='boolean'))throw new Error('Invalid status');
  if(!['signal','history','status','subscribed','unsubscribed'].includes(m.type))throw new Error('Unsupported frame');
  return m;
}
export function reconnectDelay(attempt,random=Math.random()) {return Math.min(30000,1000*2**Math.min(10,Math.max(0,attempt-1)))*(0.8+0.2*Math.max(0,Math.min(1,random)));}
export function mmrPeaks(leaves) {
  if(!count(leaves))return [];
  const peaks=[];let left=leaves,pos=0;
  while(left>0){let height=Math.floor(Math.log2(left));if(2**height>left)height--;const size=2**height;peaks.push({pos,size,height});pos+=size;left-=size;}
  return peaks;
}
