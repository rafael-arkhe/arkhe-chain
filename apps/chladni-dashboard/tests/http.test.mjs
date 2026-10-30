import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {createDashboardServer,integrationHealth}=require('../dashboard-http.cjs');
test('HTTP serves v27 with CSP, no inline handlers, no arbitrary paths or mutation routes',async(t)=>{
 const server=createDashboardServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(url);const html=await response.text();assert.equal(response.status,200);assert.ok(html.includes('v27.0'));assert.ok(!html.includes('onclick='));
 const csp=response.headers.get('content-security-policy');assert.ok(csp.includes("script-src 'self'"));assert.ok(!csp.includes('unsafe-eval'));assert.ok(csp.includes("frame-ancestors 'none'"));
 for(const asset of ['/dashboard.js','/protocol.js','/dashboard.css','/three.min.js'])assert.equal((await fetch(url+asset)).status,200);
 assert.equal((await fetch(url+'/api/work',{method:'POST'})).status,405);
 assert.equal((await fetch(url+'/../package.json')).status,404);
 assert.equal(await new Promise((resolve,reject)=>http.get(url,{headers:{Host:'attacker.example'}},response=>{response.resume();resolve(response.statusCode)}).on('error',reject)),403);
 assert.equal((await fetch(url,{headers:{Origin:'https://attacker.example'}})).status,403);
 assert.equal((await fetch(url,{method:'HEAD'})).status,200);
});
test('read-only integration health keeps kernel credentials server-side',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'arkhe-dashboard-'));const cfg=path.join(directory,'live.json');const token='a'.repeat(64);writeFileSync(cfg,JSON.stringify({token}));
 const calls=[];
 try{
  const health=await integrationHealth({kernelConfigPath:cfg,fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true}}});
  assert.equal(health.kernel.status,'healthy');assert.equal(health.authority,'none');assert.equal(health.verification.status,'not_performed');assert.ok(!JSON.stringify(health).includes(token));
  assert.equal(calls[1].url,'http://127.0.0.1:8788/health');assert.equal(calls[1].options.headers.Authorization,'Bearer '+token);
  const failed=await integrationHealth({kernelConfigPath:cfg,fetchImpl:async()=>{throw new Error(token)}});assert.equal(failed.kernel.status,'unavailable');assert.ok(!JSON.stringify(failed).includes(token));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('dashboard source has no fake MMR peaks, eval, or inline event injection',()=>{
 const source=readFileSync(new URL('../public/dashboard.js',import.meta.url),'utf8');assert.ok(!source.includes('onclick='));assert.ok(!source.includes('mmrLeaves || 4'));assert.ok(!source.includes('eval('));assert.ok(source.includes('mmrLeaves ?? 0'));assert.ok(source.includes('parseFrame(evt.data)'));
});
test('installed service reads only aggregate kernel health through the user observer, without shared credentials',async()=>{
 const calls=[];const health=await integrationHealth({legacyHealth:()=>true,fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({status:'healthy'})}}});
 assert.equal(health.kernel.status,'healthy');assert.equal(health.kernel.source,'read_only_observer');assert.equal(calls.length,1);assert.equal(calls[0].url,'http://127.0.0.1:7475/api/kernel-health');assert.equal(calls[0].options.headers,undefined);
});
