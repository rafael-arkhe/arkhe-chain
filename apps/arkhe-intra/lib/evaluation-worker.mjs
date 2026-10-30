import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { sandboxArguments } from './development.mjs';
import { policy, correct, toolResult, hash } from './evaluation-core.mjs';
const execute=promisify(execFile);

export async function evaluateWorker(image,snapshot,tasks) {
  const name='arkhe-eval-'+randomUUID(), args=sandboxArguments(image,name,snapshot,{id:'arkhe-agent'});
  args.splice(args.indexOf('run')+1,0,'--interactive');
  args.splice(args.indexOf('-c')+1,3,'cp -R /input/. /work/ && cargo build --locked --offline -p arkhe-agent --bin arkhe-eval-worker >&2 && exec /work/target/debug/arkhe-eval-worker');
  const child=spawn('podman',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let failure,waiting,queued=[],outputBytes=0,stderr='';
  const fail=error=>{failure??=error; if(waiting){const next=waiting;waiting=null;next.reject(failure);} child.kill();};
  child.on('error',()=>fail(Error('sandbox-start-failed')));
  child.on('exit',()=>{failure??=Error('worker-exited');if(waiting){const next=waiting;waiting=null;next.reject(failure);}});
  child.stdin.on('error',()=>fail(Error('worker-input-failed')));
  child.stdout.on('data',buffer=>{outputBytes+=buffer.length;if(outputBytes>1048576)fail(Error('worker-output-limit'));});
  child.stderr.on('data',buffer=>{stderr+=buffer.toString();if(Buffer.byteLength(stderr)>1048576)fail(Error('worker-build-output-limit'));});
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{
    if(Buffer.byteLength(line)>65536)return fail(Error('worker-message-limit'));
    if(waiting){const next=waiting;waiting=null;next.resolve(line);}else {queued.push(line);if(queued.length>2)fail(Error('unsolicited-worker-output'));}
  });
  function read(timeout) {
    if(failure)return Promise.reject(failure);
    if(queued.length)return Promise.resolve(queued.shift());
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>fail(Error('worker-timeout')),timeout);
      waiting={resolve:line=>{clearTimeout(timer);resolve(line);},reject:error=>{clearTimeout(timer);reject(error);}};
    });
  }
  const sessionTimer=setTimeout(()=>fail(Error('session-timeout')),policy.sessionTimeoutMs);
  const outcomes={}; let toolCalls=0;
  try {
    if(JSON.parse(await read(policy.buildTimeoutMs)).ready!=='arkhe-eval-worker/v1')throw Error('invalid-worker-protocol');
    for(const item of tasks) {
      const deadline=Date.now()+policy.taskTimeoutMs,observations=[],readKeys=new Set();let calculated=false;
      for(let call=0;call<=policy.maxToolCalls;call++) {
        const id=item.id+':'+call;
        child.stdin.write(JSON.stringify({id,task:item.task,observations})+'\n');
        const remaining=deadline-Date.now(); if(remaining<=0)throw Error('task-timeout');
        const message=JSON.parse(await read(remaining));
        if(message.id!==id||!message.response||typeof message.response!=='object')throw Error('invalid-worker-response');
        const response=message.response;
        if(Object.hasOwn(response,'answer')||response.abstain) {outcomes[item.id]=correct(item,response)&&(item.domain!=='tools'||(readKeys.size===item.task.keys.length&&calculated));break;}
        if(call===policy.maxToolCalls){outcomes[item.id]=false;break;}
        try {
          const result=toolResult(item,response);
          if(response.tool==='read')readKeys.add(response.key);
          if(response.tool==='calculate'&&readKeys.size===item.task.keys.length&&response.operation===item.task.operation&&JSON.stringify([...response.values].sort((a,b)=>a-b))===JSON.stringify(Object.values(item.vault).sort((a,b)=>a-b)))calculated=true;
          observations.push({tool:response.tool,result});toolCalls++;
        }
        catch {outcomes[item.id]=false;break;}
      }
    }
    return {outcomes,toolCalls,buildLogDigest:hash(stderr)};
  } finally {
    clearTimeout(sessionTimer); lines.close(); child.stdin.end(); child.kill();
    const engine=args.slice(0,args.indexOf('run'));
    await execute('podman',[...engine,'rm','-f',name],{windowsHide:true,timeout:15000,maxBuffer:65536});
  }
}
