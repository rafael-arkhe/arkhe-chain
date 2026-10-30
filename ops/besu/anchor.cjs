// Local B0 experiment. Packages are pinned and installed under ignored ops/local.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
// Resolve the pinned B0 toolchain explicitly; NODE_PATH loses to root node_modules.
const toolRequire = require('node:module').createRequire(path.join(root, 'ops/local/besu-tools/package.json'));
const { ethers } = toolRequire('ethers');
const solc = toolRequire('solc');
if (!solc.version().startsWith('0.8.30+')) throw Error('B0 requires pinned solc 0.8.30');
const local = path.join(root,'ops/local/besu-b0');
if (process.argv[2] === 'wallet') {
 fs.mkdirSync(local,{recursive:true});
 const file=path.join(local,'wallet.json');
 if(!fs.existsSync(file)) {const w=ethers.Wallet.createRandom(); fs.writeFileSync(file,JSON.stringify({address:w.address,privateKey:w.privateKey}),{mode:0o600});}
 fs.writeSync(1,JSON.parse(fs.readFileSync(file)).address+'\n');
} else {
function head(m,n) {if(n<24)return Buffer.from([m*32+n]); if(n<256)return Buffer.from([m*32+24,n]);if(n<65536){let b=Buffer.alloc(3);b[0]=m*32+25;b.writeUInt16BE(n,1);return b;}let b=Buffer.alloc(9);b[0]=m*32+27;b.writeBigUInt64BE(BigInt(n),1);return b;}
function cbor(v) {if(typeof v==='number') {if(!Number.isSafeInteger(v)||v<0)throw Error('invalid checkpoint integer');if(v<65536)return head(0,v);if(v<=0xffffffff){let b=Buffer.alloc(5);b[0]=26;b.writeUInt32BE(v,1);return b;}return head(0,v);}if(typeof v==='string'){let b=Buffer.from(v);return Buffer.concat([head(3,b.length),b]);}const entries=Object.entries(v).map(([k,x])=>[cbor(k),cbor(x)]).sort((a,b)=>Buffer.compare(a[0],b[0]));return Buffer.concat([head(5,entries.length),...entries.flat()]);}
(async()=>{
 const bundle=JSON.parse(fs.readFileSync(process.argv[2]));
 const wasm=require(path.join(root,'verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js'));
 const canonical=cbor(bundle.checkpoint);
 if(canonical.toString('hex')!==bundle.checkpoint_cbor_hex)throw Error('checkpoint canonical mismatch');
 const digest=wasm.blake3_hex(Buffer.concat([Buffer.from('AKG:CHECKPOINT:v1\0'),canonical]));
 if(digest!==bundle.checkpoint_digest)throw Error('checkpoint digest mismatch');
 const c=bundle.checkpoint;
 if(c.version!==1 || c.profile_digest!=='bcd07a275061ef385fccdd184030c2358fdd0937477cb0ef30cf8148342f2450')throw Error('unsupported checkpoint profile');
 if(!Number.isSafeInteger(c.leaf_count)||c.leaf_count<1||c.leaf_count>0xffffffff)throw Error('unsupported leaf count');
 if(c.mmr_size!==2*c.leaf_count-c.leaf_count.toString(2).replace(/0/g,'').length || c.covered_up_to_hash!==bundle.leaf_hex)throw Error('checkpoint shape mismatch');
 if(!wasm.verify_mmr(Buffer.from(bundle.leaf_hex,'hex'),c.leaf_count,JSON.stringify(bundle.proof),Buffer.from(c.mmr_root,'hex')))throw Error('MMR proof rejected');
 const mutated=Buffer.from(bundle.leaf_hex,'hex');mutated[0]^=1;
 if(wasm.verify_mmr(mutated,c.leaf_count,JSON.stringify(bundle.proof),Buffer.from(c.mmr_root,'hex')))throw Error('tampered MMR accepted');
 const provider=new ethers.JsonRpcProvider('http://127.0.0.1:18545');
 const version=await provider.send('web3_clientVersion',[]);
 const m=/besu\/v(\d+)\.(\d+)\.(\d+)/i.exec(version);
 if(!m || (Number(m[1])*1000000+Number(m[2])*1000+Number(m[3]))<26007001)throw Error('Besu minimum 26.7.1 required');
 const validators=await provider.send('qbft_getValidatorsByBlockNumber',['latest']);
 if(validators.length!==4)throw Error('B0 requires exactly four validators');
 const wallet=new ethers.Wallet(JSON.parse(fs.readFileSync(path.join(local,'wallet.json'))).privateKey,provider);
 const source=fs.readFileSync(path.join(__dirname,'AnchorRegistry.sol'),'utf8');
 const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'AnchorRegistry.sol':{content:source}},settings:{evmVersion:'berlin',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 const errors=(compiled.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw Error(JSON.stringify(errors));
 const artifact=compiled.contracts['AnchorRegistry.sol'].AnchorRegistry;
 const factory=new ethers.ContractFactory(artifact.abi,artifact.evm.bytecode.object,wallet);
 const stream=ethers.keccak256(ethers.toUtf8Bytes(c.tenant_id+':'+c.stream_id));
 const contract=await factory.deploy(stream);await contract.waitForDeployment();
 const tx=await contract.anchor('0x'+digest,c.leaf_count);const receipt=await tx.wait();
 if(receipt.status!==1)throw Error('anchor failed');
 if((await contract.checkpointDigests(c.leaf_count)).toLowerCase()!=='0x'+digest)throw Error('on-chain digest mismatch');
 // Read back state and verify both a permitted retry and forbidden conflicting payload.
 await contract.anchor.staticCall('0x'+digest,c.leaf_count);
 let rejected=false;try{await contract.anchor.staticCall(ethers.ZeroHash,c.leaf_count);}catch{rejected=true;}if(!rejected)throw Error('empty digest accepted');
 rejected=false;try{await contract.anchor.staticCall('0x'+'ff'.repeat(32),c.leaf_count);}catch{rejected=true;}if(!rejected)throw Error('conflicting checkpoint accepted');
 rejected=false;try{await contract.anchor.staticCall('0x'+'ee'.repeat(32),c.leaf_count-1);}catch{rejected=true;}if(!rejected)throw Error('non-monotonic checkpoint accepted');
 const outsider=contract.connect(ethers.Wallet.createRandom().connect(provider));
 rejected=false;try{await outsider.anchor.staticCall('0x'+digest,c.leaf_count);}catch{rejected=true;}if(!rejected)throw Error('unauthorized anchor accepted');
 const result={scope:'local B0 only; no consortium or production attestation',version,validators,contract:await contract.getAddress(),transaction:tx.hash,blockNumber:receipt.blockNumber,checkpoint_digest:digest,leaf_count:c.leaf_count,offline_mmr_verified:true,tampered_proof_rejected:true,conflict_rejected:true,unauthorized_rejected:true,non_monotonic_rejected:true};
 fs.writeFileSync(path.join(local,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exit(1);});

}
