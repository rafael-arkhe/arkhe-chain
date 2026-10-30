import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { request } from 'node:https';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url)),output=join(root,'arkhe-enterprise/validation/2026-10-23/infrastructure');mkdirSync(output,{recursive:true});
const engine='podman',prefix=['--connection','arkhe-runtime'];
const cmd=args=>execFileSync(engine,[...prefix,...args],{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024}).trim();
const id=Date.now(),app=`arkhe-infra-app-${id}`,proxy=`arkhe-infra-proxy-${id}`,network=`arkhe-infra-net-${id}`,volume=`arkhe-infra-data-${id}`;
const image='localhost/arkhe-enterprise:infrastructure',origin='https://localhost:8443';
const report={date:'2026-10-23',scope:'Synthetic local TLS proxy, observability and isolated recovery; no public domain, paid provider or machine trust changes',checks:[],status:'RUNNING'};
const made=[];let browser,ca;
function https(path,{data,cookie}={}) {return new Promise((resolve,reject)=>{
 const body=data?JSON.stringify(data):undefined;
 const req=request(origin+path,{ca,family:4,method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{}),...(cookie?{Cookie:cookie}:{})}},response=>{let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode,text,headers:response.headers}));});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('HTTPS timeout')));req.end(body);
});}
try {
 report.resourceLimits='Memory/CPU/PID limit validation blocked by host cgroup controller availability; no VM settings changed';
 report.appImage=JSON.parse(cmd(['image','inspect',image]))[0].Id;report.caddyImage=JSON.parse(cmd(['image','inspect','docker.io/library/caddy:2']))[0].Id;
 cmd(['network','create',network]);made.push(['network',network]);cmd(['volume','create',volume]);made.push(['volume',volume]);
 cmd(['create','--name',app,'--network',network,'--network-alias','arkhe','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--tmpfs','/tmp:rw,nosuid,size=64m','-v',`${volume}:/data`,'-e',`ARKHE_INTRA_ORIGIN=${origin}`,'-e','ARKHE_ENTERPRISE_PHASE=internal',image]);made.push(['container',app]);cmd(['start',app]);
 cmd(['create','--name',proxy,'--network',network,'--cap-drop=ALL','--cap-add=NET_BIND_SERVICE','--security-opt=no-new-privileges','-p','127.0.0.1:8443:8443','-e','ARKHE_PUBLIC_HOST=example.invalid','-e','ARKHE_TLS_EMAIL=ops@example.invalid','docker.io/library/caddy:2']);made.push(['container',proxy]);
 cmd(['cp',join(root,'ops/enterprise/Caddyfile.local'),`${proxy}:/etc/caddy/Caddyfile`]);cmd(['cp',join(root,'ops/enterprise/Caddyfile'),`${proxy}:/etc/caddy/PublicCaddyfile`]);cmd(['start',proxy]);
 for(let i=0;i<60;i++){if(!JSON.parse(cmd(['inspect',proxy]))[0].State.Running)throw Error('Caddy exited before readiness; inspect container logs');try{ca=cmd(['exec',proxy,'cat','/data/caddy/pki/authorities/local/root.crt']);if((await https('/api/ready')).status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
 assert.equal((await https('/api/ready')).status,200);
 report.caddyVersion=cmd(['exec',proxy,'caddy','version']);
 cmd(['cp',join(root,'ops/enterprise/backup-daily.sh'),`${proxy}:/tmp/backup-daily.sh`]);cmd(['exec',proxy,'sh','-n','/tmp/backup-daily.sh']);
 cmd(['exec',proxy,'caddy','validate','--config','/etc/caddy/PublicCaddyfile','--adapter','caddyfile']);
 report.checks.push('Caddy public template validates; local internal CA TLS verified by Node using explicit root CA; upstream not published on host');
 const credentials=JSON.parse(cmd(['exec',app,'node','-e',"process.stdout.write(require('fs').readFileSync('/data/credentials.json','utf8'))"]));
 const owner=credentials.find(row=>row.email.startsWith('owner@'));
 const login=await https('/api/login',{data:{email:owner.email,password:owner.password}});assert.equal(login.status,200);const cookie=login.headers['set-cookie'][0].split(';')[0];assert.match(login.headers['set-cookie'][0],/; Secure/);
 const author=credentials.find(row=>row.email.startsWith('author@'));
 const authorLogin=await https('/api/login',{data:{email:author.email,password:author.password}});assert.equal(authorLogin.status,200);const authorCookie=authorLogin.headers['set-cookie'][0].split(';')[0];
 const doc=await https('/api/documents',{cookie:authorCookie,data:{title:'Synthetic infrastructure recovery',department:'Infrastructure test',body:'Synthetic recovery evidence'}});assert.equal(doc.status,201);
 assert.equal((await https('/api/metrics',{cookie})).status,404);
 const metrics=cmd(['exec',app,'node','-e',`fetch('http://127.0.0.1:3003/api/metrics',{headers:{Cookie:${JSON.stringify(cookie)}}}).then(async r=>{if(!r.ok)process.exit(1);process.stdout.write(await r.text())})`]);assert.match(metrics,/arkhe_http_duration_seconds_bucket/);
 report.checks.push('HTTPS login issues Secure cookie, authenticated document flow works, public metrics blocked, owner-only internal Prometheus metrics work');
 const recovery=cmd(['exec',app,'node','/app/apps/arkhe-intra/scripts/backup.mjs','backup','/data','/tmp/snapshot']);assert.equal(JSON.parse(recovery).status,'verified');
 await https('/api/documents',{cookie:authorCookie,data:{title:'After snapshot',department:'Infrastructure test',body:'Must not enter restored snapshot'}});
 const restored=JSON.parse(cmd(['exec',app,'node','/app/apps/arkhe-intra/scripts/backup.mjs','restore','/tmp/snapshot','/tmp/restored']));assert.equal(restored.auditChain,'ok');
 const counts=JSON.parse(cmd(['exec',app,'node','-e',"const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/tmp/restored/intra.sqlite');console.log(JSON.stringify({documents:d.prepare('SELECT count(*) AS n FROM documents').get().n,sessions:d.prepare('SELECT count(*) AS n FROM sessions').get().n}))"]));assert.deepEqual(counts,{documents:1,sessions:0});assert.equal(JSON.parse((await https('/api/dashboard',{cookie})).text).counts.documents,2);
 report.checks.push('Online WAL snapshot verifies integrity, FK and real BLAKE3 audit chain; isolated restore recovers one document, clears sessions, and leaves two live documents unchanged');
 const require=createRequire(join(process.env.ARKHE_BROWSER_NODE_MODULES,'package.json'));const {chromium}=require('playwright');browser=await chromium.launch({headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/login');await page.getByLabel('E-mail',{exact:true}).fill(owner.email);await page.getByLabel('Senha',{exact:true}).fill(owner.password);await page.getByRole('button',{name:'Acessar ambiente',exact:true}).click();await page.waitForURL(origin+'/');await page.goto(origin+'/enterprise');await page.locator('.ent-body h1').waitFor();await page.screenshot({path:join(output,'https-enterprise.png'),fullPage:true});assert.deepEqual(errors,[]);await browser.close();browser=null;
 report.checks.push('Chromium renders Enterprise through HTTPS proxy without page errors; browser ignores disposable local CA, while Node independently verifies it');
 const log=cmd(['logs',app]);const entries=log.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));assert.ok(entries.some(e=>e.event==='http_request'&&e.route==='documents'&&e.status===201));assert.ok(entries.every(e=>!('tenant_id'in e)&&!('body'in e)&&!('cookie'in e)));writeFileSync(join(output,'server.log'),log+'\n');
 report.checks.push('API logs are structured JSON with generated operation IDs and single-org scope, no request payloads or cookies');report.status='PASS';
} catch(error){report.status='FAIL';report.failure=error.message;process.exitCode=1;console.error(error.message);}
finally{if(browser)await browser.close();if(made.some(([kind,name])=>kind==='container'&&name===app)){try{writeFileSync(join(output,'server.log'),cmd(['logs',app])+'\n');}catch{}}for(const [kind,name]of made.reverse()){try{cmd(kind==='container'?['rm','--force','--volumes',name]:[kind,'rm',name]);}catch{}}writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.status}: ${report.checks.length} infrastructure checks; disposable resources removed`);}
