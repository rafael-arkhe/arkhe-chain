const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const solc = require('solc');
const ganache = require('ganache');
const { ethers } = require('ethers');
const sourceRoot = path.resolve(process.argv[2] || '../starknet-staking-scope');
const outputDir = path.resolve(process.argv[3] || 'results');
const expectedCommit = '5c11a5689f2d2e08ffecebf30d3e49569accbfca';
assert.equal(cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: sourceRoot, encoding: 'utf8'}).trim(), expectedCommit);
assert.equal(cp.execFileSync('git', ['status', '--porcelain'], {cwd: sourceRoot, encoding: 'utf8'}).trim(), '', 'source checkout must be clean');
fs.mkdirSync(outputDir, {recursive: true});
const l1 = path.join(sourceRoot, 'workspace/apps/staking/L1');
const targets = ['starkware/solidity/stake/MintManager.sol', 'starkware/solidity/stake/RewardSupplier.sol'];
const sources = Object.fromEntries(targets.map(name => [name, {content: fs.readFileSync(path.join(l1,name),'utf8')}]));
sources['Fixtures.sol'] = {content: fs.readFileSync(path.join(__dirname,'Fixtures.sol'),'utf8')};
const input = {language:'Solidity', sources, settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const imports = {};
const compiled = JSON.parse(solc.compile(JSON.stringify(input), {import: name => {
  const file = path.resolve(l1,name);
  if (!file.startsWith(l1+path.sep)) return {error:'outside source root'};
  try {const content=fs.readFileSync(file,'utf8'); imports[name]=crypto.createHash('sha256').update(content).digest('hex'); return {contents:content};}
  catch {return {error:'missing '+name};}
}}));
const errors=(compiled.errors||[]).filter(e=>e.severity==='error');
if(errors.length) throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
const results = {classification:'TESTED_LOCAL_SUBSET',checked_at_utc:new Date().toISOString(),source_commit:expectedCommit,compiler:solc.version(),chain:'in-memory Ganache; no upstream RPC',optimizer:input.settings.optimizer,evm_version:'shanghai',import_sha256:imports,tests:[],confirmed_vulnerabilities:[],limitations:['Mock token, bridge, messaging and minimal proxy; not production deployments','No Cairo execution, no production-state fork, no complete program audit','Passing tests validate only exercised cases; mock controls are not reported as vulnerabilities']};
for(const [name,s] of Object.entries(sources)) results.import_sha256[name]=crypto.createHash('sha256').update(s.content).digest('hex');
const evm=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337,time:new Date('2026-10-18T00:00:00Z')},wallet:{deterministic:true,totalAccounts:5}});
const provider=new ethers.BrowserProvider(evm); provider.pollingInterval=10;
let owner,a,b,outsider;
function artifact(file,name){return compiled.contracts[file][name];}
async function deploy(file,name,args=[]){const c=artifact(file,name);const contract=await new ethers.ContractFactory(c.abi,c.evm.bytecode.object,owner).deploy(...args);await contract.waitForDeployment();return contract;}
async function sent(p){return (await p).wait();}
async function revertReason(action,expected){let reason;try{await action();}catch(e){reason=e.reason||e.shortMessage||e.message;}assert.ok(reason,'expected EVM revert');assert.ok(reason.includes(expected),`expected ${expected}, got ${reason}`);}
async function test(name,fn){const snap=await evm.request({method:'evm_snapshot',params:[]});try{await fn();results.tests.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.tests.push({name,status:'FAIL',error:e.message});console.log('FAIL '+name+': '+e.message);}finally{await evm.request({method:'evm_revert',params:[snap]});}}
const W=10n**18n, CAP=6500000n*W, BASE=1300000n*W;
async function setup(){
 const token=await deploy('Fixtures.sol','TestToken');
 const manager=await deploy(targets[0],'MintManager');
 await sent(manager.registerAppRoleAdmin(await owner.getAddress()));
 await sent(manager.registerAppGovernor(await owner.getAddress()));
 await sent(manager.registerTokenAdmin(await owner.getAddress()));
 for(const s of [a,b]){await sent(manager.registerTokenMinter(token.target,await s.getAddress()));await sent(manager.setMintingAllowance(token.target,await s.getAddress(),CAP*4n));}
 return {token,manager};
}
async function rewardSetup(){
 const {token,manager}=await setup();
 const bridge=await deploy('Fixtures.sol','TestBridge');const messaging=await deploy('Fixtures.sol','TestMessaging');
 const impl=await deploy(targets[1],'RewardSupplier');
 const data=ethers.AbiCoder.defaultAbiCoder().encode(['address','address','address','address','uint256','uint256','uint256'],[bridge.target,token.target,manager.target,messaging.target,123n,456n,789n]);
 const proxy=await deploy('Fixtures.sol','TestProxy',[impl.target,ethers.concat([ethers.ZeroHash,data])]);
 const reward=new ethers.Contract(proxy.target,artifact(targets[1],'RewardSupplier').abi,owner);
 await sent(manager.registerTokenMinter(token.target,reward.target));await sent(manager.setMintingAllowance(token.target,reward.target,CAP*4n));
 return {token,manager,bridge,messaging,impl,reward};
}
async function main(){
 [owner,a,b,outsider]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
 const m=await setup();
 await test('unregistered caller cannot mint',async()=>revertReason(()=>m.manager.connect(outsider).mintRequest.staticCall(m.token.target,1),'NOT_A_REGISTERED_MINTER'));
 await test('outsider cannot grant own governance, minting or token-admin privileges',async()=>{
  for(const action of [()=>m.manager.connect(outsider).registerAppRoleAdmin.staticCall(awaitAddr),()=>m.manager.connect(outsider).registerAppGovernor.staticCall(awaitAddr),()=>m.manager.connect(outsider).registerTokenAdmin.staticCall(awaitAddr)])await revertReason(action,'AccessControl');
 });
 await test('outsider cannot register a minter',async()=>revertReason(()=>m.manager.connect(outsider).registerTokenMinter.staticCall(m.token.target,awaitAddr),'ONLY_APP_GOVERNOR'));
 await test('outsider cannot set allowance',async()=>revertReason(()=>m.manager.connect(outsider).setMintingAllowance.staticCall(m.token.target,awaitAddr,CAP),'ONLY_TOKEN_ADMIN'));
 await test('allowance blocks overdraw and uint256 maximum',async()=>{
  await sent(m.manager.setMintingAllowance(m.token.target,await a.getAddress(),10));
  for(const amount of [11n,ethers.MaxUint256])await revertReason(()=>m.manager.connect(a).mintRequest.staticCall(m.token.target,amount),'INSUFFICIENT_MINTING_ALLOWANCE');
  assert.equal(await m.token.totalSupply(),0n);
 });
 await test('successful mint credits caller and debits exact allowance',async()=>{
  const before=await m.manager['mintingAllowance(address,address)'](m.token.target,await a.getAddress());
  await sent(m.manager.connect(a).mintRequest(m.token.target,1234));
  assert.equal(await m.token.balanceOf(await a.getAddress()),1234n);assert.equal(await m.manager['mintingAllowance(address,address)'](m.token.target,await a.getAddress()),before-1234n);
 });
 await test('weekly cap aggregates across two registered callers',async()=>{
  await sent(m.manager.connect(a).mintRequest(m.token.target,CAP-1n));await sent(m.manager.connect(b).mintRequest(m.token.target,1));
  await revertReason(()=>m.manager.connect(b).mintRequest.staticCall(m.token.target,1),'EXCEED_PERIOD_MINTING');assert.equal(await m.token.totalSupply(),CAP);
 });
 await test('32 deterministic quota boundary samples cannot exceed cap',async()=>{
  let seed=0x51a7n;
  for(let i=0;i<32;i++){seed=(seed*1664525n+1013904223n)&0xffffffffn;await revertReason(()=>m.manager.connect(a).mintRequest.staticCall(m.token.target,CAP+1n+seed),'EXCEED_PERIOD_MINTING');}
  assert.equal(await m.token.totalSupply(),0n);
 });
 await test('reverting token mint rolls back allowance and quota',async()=>{
  const before=await m.manager['mintingAllowance(address,address)'](m.token.target,await a.getAddress());
  await sent(m.token.setFailMint(true));await revertReason(()=>m.manager.connect(a).mintRequest.staticCall(m.token.target,CAP),'FIXTURE_MINT_FAILED');
  let failed=false;try{await sent(m.manager.connect(a).mintRequest(m.token.target,CAP,{gasLimit:1000000}));}catch{failed=true;}assert.ok(failed);
  assert.equal(await m.manager['mintingAllowance(address,address)'](m.token.target,await a.getAddress()),before);
  await sent(m.token.setFailMint(false));await sent(m.manager.connect(a).mintRequest(m.token.target,CAP));assert.equal(await m.token.totalSupply(),CAP);
 });
 await test('revoked minter loses access and allowance',async()=>{
  await sent(m.manager.revokeTokenMinter(m.token.target,await a.getAddress()));assert.equal(await m.manager['mintingAllowance(address,address)'](m.token.target,await a.getAddress()),0n);await revertReason(()=>m.manager.connect(a).mintRequest.staticCall(m.token.target,1),'NOT_A_REGISTERED_MINTER');
 });
 await test('quota resets only at next time period',async()=>{
  await sent(m.manager.connect(a).mintRequest(m.token.target,CAP));await revertReason(()=>m.manager.connect(a).mintRequest.staticCall(m.token.target,1),'EXCEED_PERIOD_MINTING');
  await evm.request({method:'evm_increaseTime',params:[604800]});await evm.request({method:'evm_mine',params:[]});await sent(m.manager.connect(a).mintRequest(m.token.target,CAP));assert.equal(await m.token.totalSupply(),CAP*2n);
 });
 const r=await rewardSetup();
 await test('direct implementation initialize rejected',async()=>revertReason(()=>r.impl.initialize.staticCall(ethers.ZeroHash),'DIRECT_CALL_DISALLOWED'));
 await test('zero authenticated messages cannot produce mint',async()=>{
  assert.deepEqual(Array.from(await r.reward.requiredMinting()),[0n,0n]);await sent(r.reward.connect(outsider).tick());assert.equal(await r.token.totalSupply(),0n);assert.equal(await r.bridge.deposited(),0n);
 });
 await test('wrong L2 origin does not match a mint request',async()=>{
  await sent(r.messaging.seed(124,r.reward.target,BASE,1));assert.deepEqual(Array.from(await r.reward.requiredMinting()),[0n,0n]);await sent(r.reward.tick());assert.equal(await r.token.totalSupply(),0n);
 });
 await test('wrong message recipient or amount cannot trigger mint',async()=>{
  await sent(r.messaging.seed(123,await a.getAddress(),BASE,1));await sent(r.messaging.seed(123,r.reward.target,BASE+1n,1));assert.deepEqual(Array.from(await r.reward.requiredMinting()),[0n,0n]);
 });
 await test('valid messages limited to five; fixed L2 destinations and supply update',async()=>{
  await sent(r.messaging.seed(123,r.reward.target,BASE,7));assert.deepEqual(Array.from(await r.reward.requiredMinting()),[CAP,5n]);
  await sent(r.reward.connect(outsider).tick());assert.equal(await r.bridge.deposited(),CAP);assert.equal(await r.bridge.lastRecipient(),456n);assert.equal(await r.messaging.lastDestination(),789n);assert.equal(await r.messaging.lastSupply(),CAP);assert.deepEqual(Array.from(await r.reward.requiredMinting()),[BASE*2n,2n]);
  await revertReason(()=>r.reward.tick.staticCall(),'EXCEED_PERIOD_MINTING');assert.equal(await r.token.totalSupply(),CAP);
 });
 for(const mode of ['bridge','messaging'])await test(mode+' failure atomically restores message, mint, allowance and quota',async()=>{
  await sent(r.messaging.seed(123,r.reward.target,BASE,1));const allowance=await r.manager['mintingAllowance(address,address)'](r.token.target,r.reward.target);
  if(mode==='bridge')await sent(r.bridge.setFailDeposit(true));else await sent(r.messaging.setFailSend(true));
  await revertReason(()=>r.reward.tick.staticCall(),mode==='bridge'?'FIXTURE_BRIDGE_FAILED':'FIXTURE_SEND_FAILED');
  let failed=false;try{await sent(r.reward.tick({gasLimit:2000000}));}catch{failed=true;}assert.ok(failed);
  assert.equal(await r.token.totalSupply(),0n);assert.equal(await r.bridge.deposited(),0n);assert.equal(await r.messaging.sent(),0n);assert.equal(await r.manager['mintingAllowance(address,address)'](r.token.target,r.reward.target),allowance);assert.deepEqual(Array.from(await r.reward.requiredMinting()),[BASE,1n]);
  await sent(r.bridge.setFailDeposit(false));await sent(r.messaging.setFailSend(false));await sent(r.reward.tick());assert.equal(await r.token.totalSupply(),BASE);
 });
 results.status=results.tests.every(t=>t.status==='PASS')?'PASS':'FAIL';
}
let awaitAddr;
(async()=>{awaitAddr=await (await provider.getSigner(3)).getAddress();await main();})().catch(e=>{results.status='HARNESS_ERROR';results.error=e.message;process.exitCode=1;}).finally(async()=>{
 results.passed=results.tests.filter(t=>t.status==='PASS').length;results.failed=results.tests.filter(t=>t.status==='FAIL').length;
 fs.writeFileSync(path.join(outputDir,'results.json'),JSON.stringify(results,null,2)+'\n');
 if(results.failed)process.exitCode=1; console.log(JSON.stringify({status:results.status,passed:results.passed,failed:results.failed,confirmed_vulnerabilities:0}));await evm.disconnect();
});
