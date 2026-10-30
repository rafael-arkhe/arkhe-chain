'use strict';
const ORIGINS=new Set(['http://localhost:7473','http://127.0.0.1:7473','http://[::1]:7473','http://localhost:7475','http://127.0.0.1:7475','http://[::1]:7475']);
const local=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
function verifyClient(info){return local(info.req.socket.remoteAddress)&&(!info.origin||ORIGINS.has(info.origin));}
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const label=v=>typeof v==='string'&&v.length>0&&v.length<=128;
function bounded(v,depth=0,budget={nodes:0}){
 if(++budget.nodes>512||depth>6)return false;
 if(v===null||typeof v==='boolean')return true;
 if(typeof v==='number')return Number.isFinite(v);
 if(typeof v==='string')return v.length<=4096;
 if(Array.isArray(v))return v.length<=100&&v.every(x=>bounded(x,depth+1,budget));
 return object(v)&&Object.entries(v).length<=64&&Object.entries(v).every(([k,x])=>!['__proto__','prototype','constructor'].includes(k)&&k.length<=128&&bounded(x,depth+1,budget));
}
function validateMessage(msg){
 if(!object(msg)||!bounded(msg))throw new Error('Invalid message');
 if(!['publish','subscribe','unsubscribe','status','history'].includes(msg.action))throw new Error('Unknown action');
 if(['subscribe','unsubscribe','history'].includes(msg.action)&&(!label(msg.topic)||!/^\/[A-Za-z0-9_/-]+$/.test(msg.topic)))throw new Error('Invalid topic');
 if(msg.action==='history'&&msg.limit!==undefined&&(!Number.isSafeInteger(msg.limit)||msg.limit<1||msg.limit>100))throw new Error('History limit must be 1..100');
 if(msg.action==='publish'){
  const s=msg.signal;
  if(!object(s)||!label(s.source)||!label(s.topic)||!/^\/[A-Za-z0-9_/-]+$/.test(s.topic)||!label(s.metric)||!bounded(s.value))throw new Error('Invalid signal');
  if(s.timestamp!==undefined&&(!label(s.timestamp)||!Number.isFinite(Date.parse(s.timestamp))))throw new Error('Invalid timestamp');
  if(s.topic==='/cathedral/control'){
   const allowed=new Set(['start_loop','stop_loop','cycle','reset','evolve','audit','train','attest_identity','multiplicity_check','status']);
   if(!allowed.has(s.metric)&&!s.metric.endsWith('_response'))throw new Error('Unknown operational command');
   if(s.metric==='cycle'&&(!object(s.value)||!Number.isSafeInteger(s.value.count)||s.value.count<1||s.value.count>10))throw new Error('Cycle count must be 1..10');
  }
 }
 return msg;
}
module.exports={verifyClient,validateMessage,bounded};
