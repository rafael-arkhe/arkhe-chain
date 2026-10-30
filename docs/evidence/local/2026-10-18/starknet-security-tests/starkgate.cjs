const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const solc=require('solc820'),ganache=require('ganache'),{ethers}=require('ethers');
const root=path.resolve(process.argv[2]||'../starkgate-scope'),out=path.resolve(process.argv[3]||'starkgate-results');
const expected='2c2729d47b9b5c7421c16fd258b2fa7e3ad6ddfc';
assert.equal(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),expected);
assert.equal(cp.execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),'');
const deps=path.join(__dirname,'starkgate-deps'),hashes={};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const sources=Object.fromEntries(['Fixtures.sol','StarkgateFixtures.sol'].map(n=>[n,{content:fs.readFileSync(path.join(__dirname,n),'utf8')}]));
for(const [n,s]of Object.entries(sources))hashes[n]=sha(s.content);
const compilation=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:n=>{
 const base=n.startsWith('src/')?root:deps,file=path.resolve(base,n);
 if(!file.startsWith(base+path.sep))return{error:'outside source root'};
 try{const content=fs.readFileSync(file,'utf8');hashes[n]=sha(content);return{contents:content};}catch{return{error:'missing '+n};}
}}));
const errors=(compilation.errors||[]).filter(x=>x.severity==='error');if(errors.length)throw new Error(errors.map(x=>x.formattedMessage).join('\n'));
fs.mkdirSync(out,{recursive:true});
const result={classification:'TESTED_LOCAL_SUBSET',checked_at_utc:new Date().toISOString(),source_commit:expected,compiler:solc.version(),dependencies_archive_sha256:sha(fs.readFileSync(path.join(root,'.dep/starkware-solidity-dependencies.tar'))),source_sha256:hashes,tests:[],confirmed_vulnerabilities:[],limitations:['Constructor-initialized subclass; no overridden withdrawal methods; not production proxy','Local mock token and messaging; mock seed functions not attack capabilities','No Cairo execution, production fork, web test or complete program audit']};
const evm=ganache.provider({logging:{quiet:true},chain:{chainId:31337,hardfork:'shanghai',time:new Date('2026-10-18T00:00:00Z')},wallet:{deterministic:true,totalAccounts:4}}),provider=new ethers.BrowserProvider(evm);provider.pollingInterval=10;
let owner,alice,bob,attacker,bridge,token,messages;
async function sent(p){return(await p).wait();}
async function deploy(file,name,args=[]){const a=compilation.contracts[file][name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;}
async function rejects(action,reason){let got,data;try{await action();}catch(e){got=e.reason||e.shortMessage||e.message;data=e.data;}assert.ok(got,'expected revert');const nested=typeof data==='string' && data.toLowerCase().includes(Buffer.from(reason,'utf8').toString('hex'));assert.ok(got.includes(reason)||nested,`expected ${reason}; got ${got}`);}
async function test(name,fn){const snapshot=await evm.request({method:'evm_snapshot',params:[]});try{await fn();result.tests.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){result.tests.push({name,status:'FAIL',error:e.message});console.log('FAIL '+name+': '+e.message);}finally{await evm.request({method:'evm_revert',params:[snapshot]});}}
const L2=123n,AMOUNT=100n;
function payload(t,amount,recipient){return[0n,BigInt(recipient),BigInt(t),amount&((1n<<128n)-1n),amount>>128n];}
async function seed(amount=AMOUNT,recipient=alice.address,t=token.target,from=L2){await sent(messages.seedPayload(from,bridge.target,payload(t,amount,recipient),1));}
async function withdrawal(caller=attacker,amount=AMOUNT,recipient=alice.address,t=token.target){return sent(bridge.connect(caller)['withdraw(address,uint256,address)'](t,amount,recipient));}
const callWithdrawal=(amount=AMOUNT,recipient=alice.address,t=token.target)=>bridge.connect(attacker)['withdraw(address,uint256,address)'].staticCall(t,amount,recipient);
async function main(){
 [owner,alice,bob,attacker]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
 for(const s of [alice,bob,attacker])s.address=await s.getAddress();
 token=await deploy('Fixtures.sol','TestToken');messages=await deploy('Fixtures.sol','TestMessaging');bridge=await deploy('StarkgateFixtures.sol','LocalStarkgate',[messages.target,L2]);
 await sent(token.mint(bridge.target,10000));
 await sent(bridge.registerAppRoleAdmin(await owner.getAddress()));await sent(bridge.registerAppGovernor(await owner.getAddress()));await sent(bridge.registerSecurityAgent(await owner.getAddress()));
 await test('withdrawal without authenticated message rejected',async()=>rejects(()=>callWithdrawal(),'FIXTURE_NO_MESSAGE'));
 await test('withdrawal message binds recipient',async()=>{await seed();await rejects(()=>callWithdrawal(AMOUNT,bob.address),'FIXTURE_NO_MESSAGE');assert.equal(await token.balanceOf(bob.address),0n);});
 await test('withdrawal message binds amount',async()=>{await seed();await rejects(()=>callWithdrawal(AMOUNT+1n),'FIXTURE_NO_MESSAGE');});
 await test('withdrawal message binds token',async()=>{const other=await deploy('Fixtures.sol','TestToken');await seed();await rejects(()=>callWithdrawal(AMOUNT,alice.address,other.target),'FIXTURE_NO_MESSAGE');});
 await test('withdrawal message binds L2 bridge origin',async()=>{await seed(AMOUNT,alice.address,token.target,L2+1n);await rejects(()=>callWithdrawal(),'FIXTURE_NO_MESSAGE');});
 await test('relayer cannot redirect payout to itself',async()=>{await seed();await withdrawal();assert.equal(await token.balanceOf(alice.address),AMOUNT);assert.equal(await token.balanceOf(attacker.address),0n);});
 await test('consumed message cannot be replayed',async()=>{await seed();await withdrawal();await rejects(()=>callWithdrawal(),'FIXTURE_NO_MESSAGE');assert.equal(await token.balanceOf(alice.address),AMOUNT);});
 await test('zero recipient rejected even if matching message seeded',async()=>{await seed(AMOUNT,ethers.ZeroAddress);await rejects(()=>callWithdrawal(AMOUNT,ethers.ZeroAddress),'INVALID_RECIPIENT');});
 await test('outsider cannot change bridge or disable withdrawal limit',async()=>{await rejects(()=>bridge.connect(attacker).setL2TokenBridge.staticCall(456),'ONLY_APP_GOVERNOR');await rejects(()=>bridge.connect(attacker).disableWithdrawalLimit.staticCall(token.target),'ONLY_SECURITY_ADMIN');await rejects(()=>bridge.connect(attacker).setMaxTotalBalance.staticCall(token.target,1),'ONLY_APP_GOVERNOR');});
 await test('enabled daily quota blocks excess and preserves message',async()=>{await sent(bridge.enableWithdrawalLimit(token.target));assert.equal(await bridge.getRemainingIntradayAllowance(token.target),500n);await seed(501n);await rejects(()=>callWithdrawal(501n),'EXCEEDS_GLOBAL_WITHDRAW_LIMIT');let failed=false;try{await sent(bridge['withdraw(address,uint256,address)'](token.target,501,alice.address,{gasLimit:1000000}));}catch{failed=true;}assert.ok(failed);assert.equal(await token.balanceOf(bridge.target),10000n);assert.equal(await bridge.getRemainingIntradayAllowance(token.target),500n);await sent(bridge.disableWithdrawalLimit(token.target));await withdrawal(attacker,501n);assert.equal(await token.balanceOf(alice.address),501n);});
 await test('daily quota cumulative across distinct recipients',async()=>{await sent(bridge.enableWithdrawalLimit(token.target));await seed(300n);await withdrawal(attacker,300n);await seed(200n,bob.address);await withdrawal(attacker,200n,bob.address);assert.equal(await bridge.getRemainingIntradayAllowance(token.target),0n);await seed(1n);await rejects(()=>callWithdrawal(1n),'EXCEEDS_GLOBAL_WITHDRAW_LIMIT');});
 await test('token transfer failure restores quota and message',async()=>{await sent(bridge.enableWithdrawalLimit(token.target));await seed();await sent(token.setFailTransfer(true));await rejects(()=>callWithdrawal(),'FIXTURE_TRANSFER_FAILED');let failed=false;try{await sent(bridge['withdraw(address,uint256,address)'](token.target,AMOUNT,alice.address,{gasLimit:1000000}));}catch{failed=true;}assert.ok(failed);assert.equal(await bridge.getRemainingIntradayAllowance(token.target),500n);await sent(token.setFailTransfer(false));await withdrawal();assert.equal(await token.balanceOf(alice.address),AMOUNT);assert.equal(await bridge.getRemainingIntradayAllowance(token.target),400n);});
 await test('32 deterministic altered-amount messages cannot authorize withdrawals',async()=>{await seed();for(let i=1n;i<=32n;i++)await rejects(()=>callWithdrawal(AMOUNT+i),'FIXTURE_NO_MESSAGE');assert.equal(await token.balanceOf(bridge.target),10000n);});
 result.status=result.tests.every(t=>t.status==='PASS')?'PASS':'FAIL';
}
main().catch(e=>{result.status='HARNESS_ERROR';result.error=e.message;process.exitCode=1;}).finally(async()=>{result.passed=result.tests.filter(x=>x.status==='PASS').length;result.failed=result.tests.filter(x=>x.status==='FAIL').length;if(result.failed)process.exitCode=1;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,passed:result.passed,failed:result.failed}));await evm.disconnect();});
