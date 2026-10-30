const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ASSETS = {'/':'index.html','/dashboard':'index.html','/index.html':'index.html','/dashboard.js':'dashboard.js','/dashboard.css':'dashboard.css','/protocol.js':'protocol.js','/three.min.js':'three.min.js'};
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:7474 ws://127.0.0.1:7474 ws://[::1]:7474; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
function allowedHost(value) { return /^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(value || ''); }
async function integrationHealth({kernelConfigPath, fetchImpl=globalThis.fetch, legacyHealth}={}) {
  const result = {version:'27.0',authority:'none',deployment:legacyHealth?'installed':'preview',verification:{status:'not_performed',mmr:'not_integrated'},legacy:{status:'unavailable',authority:'reference_telemetry'},kernel:{status:'not_configured',endpoint:'http://127.0.0.1:8788/health'}};
  if(typeof fetchImpl!=='function'){result.kernel.status='unsupported_node';return result;}
  try {
    if (legacyHealth) { legacyHealth(); result.legacy.status='reachable'; }
    else {const response=await fetchImpl('http://127.0.0.1:7473/health',{signal:AbortSignal.timeout(1200)});if(response.ok) result.legacy.status='reachable';}
  } catch {}
  if(!kernelConfigPath && legacyHealth){
    try{
      const response=await fetchImpl('http://127.0.0.1:7475/api/kernel-health',{signal:AbortSignal.timeout(2500)});
      const proxy=await response.json();
      if(response.ok && ['healthy','unavailable','not_configured','unsupported_node'].includes(proxy.status)){
        result.kernel.status=proxy.status;result.kernel.source='read_only_observer';
      }
    }catch{result.kernel.status='observer_unavailable';}
  }
  if (kernelConfigPath) {
    try {
      const cfg=JSON.parse(fs.readFileSync(kernelConfigPath,'utf8'));
      if(typeof cfg.token!=='string'||! /^[a-f0-9]{64}$/.test(cfg.token)) throw new Error('Invalid configuration');
      const response=await fetchImpl(result.kernel.endpoint,{headers:{Authorization:'Bearer '+cfg.token},signal:AbortSignal.timeout(1500)});
      result.kernel.status=response.ok?'healthy':'unavailable';
    } catch { result.kernel.status='unavailable'; }
  }
  return result;
}
function createDashboardServer(options={}) {
  const publicDir=options.publicDir||path.join(__dirname,'public');
  return http.createServer(async(req,res)=>{
    const headers={'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','X-Frame-Options':'DENY'};
    function send(status,type,body){res.writeHead(status,{...headers,'Content-Type':type});res.end(req.method==='HEAD'?'':body);}
    if(!allowedHost(req.headers.host)) return send(403,'text/plain','Host rejected');
    if(req.headers.origin){try {const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host||origin.protocol!=='http:')throw new Error();}catch{return send(403,'text/plain','Origin rejected');}}
    if(!['GET','HEAD'].includes(req.method))return send(405,'text/plain','Read-only dashboard');
    let url;try{url=new URL(req.url,'http://localhost');}catch{return send(400,'text/plain','Invalid URL');}
    if(url.pathname==='/api/kernel-health'){const health=await integrationHealth(options);return send(200,'application/json',JSON.stringify({status:health.kernel.status,authority:'none',verification:'not_performed'}));}
    if(url.pathname==='/api/integration-health')return send(200,'application/json',JSON.stringify(await integrationHealth(options)));
    if(url.pathname==='/health')return send(200,'application/json',JSON.stringify({status:'ok',version:'27.0',authority:'none'}));
    const file=ASSETS[url.pathname];if(!file)return send(404,'text/plain','Not found');
    try {send(200,TYPES[path.extname(file)]||'application/octet-stream',fs.readFileSync(path.join(publicDir,file)));}
    catch {send(503,'text/plain','Dashboard asset unavailable');}
  });
}
module.exports={createDashboardServer,integrationHealth,allowedHost,CSP};
