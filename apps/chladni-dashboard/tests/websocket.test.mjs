import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import WebSocket from 'ws';
const require=createRequire(import.meta.url);const security=require('../telegraph-security.cjs');
function legacyFixture(){
 const module={exports:{}};
 class Logger{verifyChain(){return true}getChain(){return []}}
 class Prover{prove(){return {testFixture:true}}}
 const sandbox={module,exports:module.exports,Buffer,process,console:{log(){}},require:name=>name==='ws'?require('ws'):name.includes('temporal-chain')?Logger:name.includes('zkwasm')?Prover:name.includes('telegraph-security')?security:require(name)};
 vm.runInNewContext(readFileSync(new URL('../deployment/telegraph.js',import.meta.url),'utf8'),sandbox);return module.exports.Telegraph;
}
async function connect(url,origin){const client=new WebSocket(url,{origin});await once(client,'open');return client;}
test('security validation denies unbounded history, prototype keys and excessive operational cycles',()=>{
 for(const msg of [{action:'history',topic:'/x',limit:-1},{action:'history',topic:'/x',limit:101},{action:'publish',signal:{source:'test',topic:'/cathedral/control',metric:'cycle',value:{count:10000}}},JSON.parse('{"action":"status","__proto__":{}}')])assert.throws(()=>security.validateMessage(msg));
 assert.equal(security.verifyClient({origin:'https://evil.example',req:{socket:{remoteAddress:'127.0.0.1'}}}),false);
 assert.equal(security.verifyClient({origin:'http://localhost:7473',req:{socket:{remoteAddress:'10.0.0.1'}}}),false);
});
test('real patched WebSocket listener binds loopback, rejects foreign Origin and survives oversized frames',async(t)=>{
 const Telegraph=legacyFixture();const telegraph=new Telegraph(0);telegraph.start();await once(telegraph.wss,'listening');assert.equal(telegraph.wss.address().address,'127.0.0.1');
 t.after(async()=>{for(const socket of telegraph.wss.clients)socket.terminate();await new Promise(resolve=>telegraph.wss.close(resolve));});
 const url=`ws://127.0.0.1:${telegraph.wss.address().port}`;
 await new Promise((resolve,reject)=>{const bad=new WebSocket(url,{origin:'https://evil.example'});bad.on('error',()=>{});bad.on('unexpected-response',(request,response)=>{try{assert.equal(response.statusCode,401);bad.terminate();resolve();}catch(error){reject(error)}});bad.on('open',()=>reject(new Error('Foreign Origin accepted')));});
 const large=await connect(url,'http://localhost:7473');const closed=once(large,'close');large.send('x'.repeat(65537));assert.equal((await closed)[0],1009);
 const good=await connect(url,'http://localhost:7473');const response=once(good,'message');good.send(JSON.stringify({action:'status'}));assert.equal(JSON.parse((await response)[0]).type,'status');good.close();
});
