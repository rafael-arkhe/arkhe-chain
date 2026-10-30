// Trusted evaluator. This module and private seeds are NEVER copied into a worker.
import { createHash, createHmac } from 'node:crypto';
export const protocol = 'arkhe-capability-evaluation/v1';
export const domains = ['reasoning','planning','learning','tools'];
export const splits = ['retention','fresh','generalization'];
export const policy = Object.freeze({ casesPerDomain:16, minimumGain:0.05, maximumP:0.05, minimumGeneralization:0.5,
  taskTimeoutMs:1500, buildTimeoutMs:120000, sessionTimeoutMs:240000, maxToolCalls:8, repetitions:2 });
export function canonical(value) {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
function random(seed,label) { let counter=0; return (min,max)=>min+(createHmac('sha256',seed).update(label+':'+counter++).digest().readUInt32BE()%(max-min+1)); }
function expression(rng,depth) {
  if (!depth) {const value=rng(-12,12); return {input:value,answer:value};}
  const a=expression(rng,depth-1),b=expression(rng,depth-1),op=['add','sub','mul'][rng(0,2)];
  return {input:{op,a:a.input,b:b.input},answer:op==='add'?a.answer+b.answer:op==='sub'?a.answer-b.answer:a.answer*b.answer};
}
export function makeTasks(retentionSeed,cycleSeed,cases=policy.casesPerDomain) {
  const tasks=[];
  for(const split of splits) for(const domain of domains) for(let i=0;i<cases;i++) {
    const seed=split==='retention'?retentionSeed:cycleSeed, label=split+':'+domain+':'+i, rng=random(seed,label);
    const id=createHmac('sha256',seed).update(label).digest('hex').slice(0,24);
    const item={id,split,domain};
    if(domain==='reasoning') {const e=expression(rng,split==='generalization'?3:2); item.task={domain,expression:e.input}; item.expected=e.answer;}
    if(domain==='planning') {
      const size=split==='generalization'?8:4,nodes=Array.from({length:size},(_,j)=>'n'+rng(1000,9999)+'_'+j),edges=[];
      for(let a=0;a<size;a++) for(let b=a+1;b<size;b++) if(rng(0,2)===0) edges.push([nodes[a],nodes[b]]);
      const shuffled=[...nodes]; for(let n=size-1;n>0;n--) {const j=rng(0,n); [shuffled[n],shuffled[j]]=[shuffled[j],shuffled[n]];}
      item.task={domain,nodes:shuffled,edges};
    }
    if(domain==='learning') {
      const degree=split==='generalization'?2+i%2:1, a=rng(1,4),b=rng(-3,3),c=rng(-10,10),offset=rng(-5,5);
      const f=x=>a*x**degree+b*x+c, xs=Array.from({length:4},(_,j)=>offset+j),query=offset+rng(5,9);
      item.task={domain,examples:xs.map(x=>[x,f(x)]),query}; item.expected=f(query);
    }
    if(domain==='tools') {
      const size=split==='generalization'?4:2, keys=Array.from({length:size},(_,j)=>'item_'+rng(1000,9999)+'_'+j);
      item.vault=Object.fromEntries(keys.map(key=>[key,rng(1,8)]));
      const operation=split==='generalization'?'product':'sum';
      item.task={domain,keys,operation}; item.expected=Object.values(item.vault).reduce((a,b)=>operation==='sum'?a+b:a*b,operation==='sum'?0:1);
    }
    tasks.push(item);
  }
  // Fixed paired order, privately shuffled across domains and splits.
  const rng=random(cycleSeed,'order'); for(let n=tasks.length-1;n>0;n--){const j=rng(0,n);[tasks[n],tasks[j]]=[tasks[j],tasks[n]];}
  return tasks;
}
export function correct(item,response) {
  if (!response || typeof response !== 'object' || !Object.hasOwn(response,'answer')) return false;
  if(item.domain!=='planning') return Number.isSafeInteger(response.answer) && response.answer===item.expected;
  const answer=response.answer;
  return Array.isArray(answer) && answer.length===item.task.nodes.length && new Set(answer).size===answer.length && answer.every(node=>item.task.nodes.includes(node)) && item.task.edges.every(([a,b])=>answer.indexOf(a)<answer.indexOf(b));
}
export function toolResult(item,request) {
  if(item.domain!=='tools') throw Error('Tool use outside tool task');
  if(request.tool==='read' && typeof request.key==='string' && Object.hasOwn(item.vault,request.key)) return item.vault[request.key];
  if(request.tool==='calculate' && ['sum','product'].includes(request.operation) && Array.isArray(request.values) && request.values.length>0 && request.values.length<=4 && request.values.every(x=>Number.isSafeInteger(x)&&Math.abs(x)<=10000)) {
    const result=request.values.reduce((a,b)=>request.operation==='sum'?a+b:a*b,request.operation==='sum'?0:1);
    if(Number.isSafeInteger(result)) return result;
  }
  throw Error('Invalid or unavailable tool');
}
export function metrics(tasks,results) {
  return Object.fromEntries(splits.map(split=>[split,Object.fromEntries(domains.map(domain=>{
    const rows=tasks.filter(task=>task.split===split&&task.domain===domain),passed=rows.filter(task=>results[task.id]===true).length;
    return [domain,{passed,total:rows.length,score:passed/rows.length}];
  }))]));
}
export function compare(tasks,baseline,incumbent,candidate,alpha=policy.maximumP) {
  let wins=0,losses=0,regressions=0,freshTotal=0; const reasons=[];
  for(const task of tasks) {
    if((baseline[task.id]||incumbent[task.id])&&!candidate[task.id]) regressions++;
    if(task.split!=='retention') {freshTotal++; if(candidate[task.id]&&!incumbent[task.id]) wins++; if(!candidate[task.id]&&incumbent[task.id]) losses++;}
  }
  const n=wins+losses; let p=n?0:1, term=2**-n;
  if(n)for(let k=0;k<=n;k++) {if(k>=wins) p+=term; term=term*(n-k)/(k+1);}
  const gain=(wins-losses)/freshTotal,cm=metrics(tasks,candidate),im=metrics(tasks,incumbent);
  if(regressions) reasons.push('capability-regression');
  if(gain<policy.minimumGain) reasons.push('insufficient-gain');
  if(p>alpha) reasons.push('insufficient-paired-evidence');
  for(const domain of domains) {
    if(cm.retention[domain].score<im.retention[domain].score) reasons.push('retention:'+domain);
    if(cm.generalization[domain].score<policy.minimumGeneralization) reasons.push('generalization-floor:'+domain);
  }
  return {eligible:reasons.length===0,reasons,paired:{wins,losses,p,alpha,gain,regressions},baseline:metrics(tasks,baseline),incumbent:im,candidate:cm};
}
export function evaluatorIdentity() { return hash({protocol,policy,functions:[canonical,random,expression,makeTasks,correct,toolResult,metrics,compare].map(fn=>fn.toString())}); }
