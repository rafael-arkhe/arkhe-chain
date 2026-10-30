import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,writeFileSync,readdirSync,lstatSync,existsSync,mkdirSync,mkdtempSync,chmodSync,openSync,closeSync,rmSync} from 'node:fs';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {resolve,relative,join,isAbsolute,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=process.env.ARKHE_INSTALL_ROOT?resolve(process.env.ARKHE_INSTALL_ROOT):resolve(fileURLToPath(new URL('../../../',import.meta.url)));
if(!existsSync(join(root,'config/architecture.json')))throw Error('Arkhe installation root unavailable');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const limit=256*1024*1024;
function secure(path) {
 if(process.platform==='win32') {
  const output=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true});
  const sid=output.match(/S-1-5-[0-9-]+/)?.[0];if(!sid)throw Error('Cannot resolve account SID');
  execFileSync('icacls',[resolve(path),'/inheritance:r','/grant:r',`*${sid}:F`],{stdio:'pipe',windowsHide:true});
 }else chmodSync(path,lstatSync(path).isDirectory()?0o700:0o600);
}
function childPath(parent,name) {
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.startsWith('/')||name.split('/').some(part=>part==='..'||part==='.'||!part))throw Error('Unsafe archive path');
 const target=resolve(parent,name);if(!target.startsWith(resolve(parent)+sep))throw Error('Archive path escapes target');return target;
}
function outside(path,source) {return path!==source&&!path.startsWith(source+sep);}
function files(source,prefix='') {
 const result=[];
 for(const entry of readdirSync(join(source,prefix),{withFileTypes:true})) {
  const name=prefix?prefix+'/'+entry.name:entry.name,path=join(source,name),stat=lstatSync(path);
  if(stat.isSymbolicLink())throw Error('Symlinks/reparse points are not permitted');
  if(stat.isDirectory())result.push(...files(source,name));
  else if(stat.isFile()&&!/(^|\/)(server\.json|server\.log)$|-(wal|shm)$|\.lock$/.test(name))result.push(name);
  if(result.length>5000)throw Error('Too many files');
 }
 return result;
}
export async function ensureStopped(port=3003) {
 await new Promise((accept,reject)=>{const socket=createConnection({host:'127.0.0.1',port});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();reject(Error('Stop Arkhe before backup/restore'));});socket.once('error',error=>{socket.destroy();if(error.code==='ECONNREFUSED')accept();else reject(Error('Cannot verify stopped service'));});socket.once('timeout',()=>{socket.destroy();reject(Error('Cannot verify stopped service'));});});
}
function databaseCheck(file) {
 const database=new DatabaseSync(file,{readOnly:true});
 try {
  if(database.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('SQLite integrity check failed');
  const hasEvents=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
  if(hasEvents) {
   const wasm=createRequire(import.meta.url)(join(root,'verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js'));
   let previous='0'.repeat(64);
   for(const row of database.prepare('SELECT * FROM events ORDER BY seq').all()) {if(row.previous!==previous||wasm.blake3_hex(Buffer.from(previous+'\n'+row.value))!==row.hash)throw Error('Audit chain mismatch');previous=row.hash;}
  }
 }finally{database.close();}
}
export async function createBackup(source,archive,keyFile,port=3003) {
 source=resolve(source);archive=resolve(archive);keyFile=resolve(keyFile);
 if(!outside(archive,source)||!outside(keyFile,source)||archive===keyFile||existsSync(archive))throw Error('Backup must be new; archive/key must be outside source');
 await ensureStopped(port);
 if(!existsSync(join(source,'accounts.json'))||!existsSync(join(source,'intra.sqlite')))throw Error('Initialized data directory required');
 const temporary=mkdtempSync(join(tmpdir(),'arkhe-backup-'));secure(temporary);
 try {
  const names=files(source),entries=[];let total=0;
  const initial=new Map(names.map(name=>[name,sha(readFileSync(join(source,name)))]));
  const walState=()=>JSON.stringify(names.filter(name=>/\.(sqlite|db)$/.test(name)).map(name=>[name,existsSync(join(source,name+'-wal'))?sha(readFileSync(join(source,name+'-wal'))):null]));
  const initialWal=walState();
  for(const name of names) {
   let bytes;
   if(/\.(sqlite|db)$/.test(name)) {
    const snapshot=join(temporary,'snapshot-'+entries.length+'.sqlite'),database=new DatabaseSync(join(source,name),{readOnly:true});
    try{await backup(database,snapshot);}finally{database.close();}
    databaseCheck(snapshot);bytes=readFileSync(snapshot);
   }else bytes=readFileSync(join(source,name));
   total+=bytes.length;if(total>limit)throw Error('Backup exceeds 256 MiB');
   entries.push({name,sha256:sha(bytes),base64:bytes.toString('base64')});
  }
  if(walState()!==initialWal||JSON.stringify(files(source).sort())!==JSON.stringify([...names].sort())||names.some(name=>sha(readFileSync(join(source,name)))!==initial.get(name)))throw Error('Source changed during backup; retry with all writers stopped');
  let key;
  if(existsSync(keyFile)){if(lstatSync(keyFile).isSymbolicLink())throw Error('Key symlink rejected');key=readFileSync(keyFile);}else{writeFileSync(keyFile,randomBytes(32),{flag:'wx',mode:0o600});key=readFileSync(keyFile);}
  if(key.length!==32)throw Error('AES-256 key must be 32 bytes');secure(keyFile);
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('arkhe-intra/backup/v1'));
  const payload=gzipSync(Buffer.from(JSON.stringify({format:'arkhe-intra/snapshot/v1',createdAt:new Date().toISOString(),entries})));
  const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
  writeFileSync(archive,JSON.stringify({format:'arkhe-intra/backup/v1',iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:ciphertext.toString('base64')}),{flag:'wx',mode:0o600});secure(archive);
  return {status:'PASS',format:'AES-256-GCM',files:entries.length,bytes:total,archiveSha256:sha(readFileSync(archive))};
 }finally{if(!resolve(temporary).startsWith(resolve(tmpdir())+sep+'arkhe-backup-'))throw Error('Unsafe temporary cleanup');rmSync(temporary,{recursive:true});}
}
export async function restoreBackup(archive,keyFile,target,port=3003) {
 archive=resolve(archive);keyFile=resolve(keyFile);target=resolve(target);await ensureStopped(port);
 if(existsSync(target))throw Error('Restore requires a new directory; live data is never overwritten');
 if(lstatSync(archive).size>limit*2)throw Error('Archive too large');
 const envelope=JSON.parse(readFileSync(archive,'utf8'));
 if(envelope.format!=='arkhe-intra/backup/v1'||!/^[a-f0-9]{24}$/.test(envelope.iv)||!/^[a-f0-9]{32}$/.test(envelope.tag))throw Error('Unknown encrypted backup');
 const key=readFileSync(keyFile);if(key.length!==32)throw Error('Invalid key');
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'hex'));decipher.setAAD(Buffer.from(envelope.format));decipher.setAuthTag(Buffer.from(envelope.tag,'hex'));
 const compressed=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);
 const snapshot=JSON.parse(gunzipSync(compressed,{maxOutputLength:limit*2}).toString('utf8'));
 if(snapshot.format!=='arkhe-intra/snapshot/v1'||!Array.isArray(snapshot.entries)||snapshot.entries.length>5000)throw Error('Invalid snapshot');
 const seen=new Set();let total=0;
 for(const entry of snapshot.entries){childPath(target,entry.name);if(seen.has(entry.name))throw Error('Duplicate archive path');seen.add(entry.name);const bytes=Buffer.from(entry.base64,'base64');total+=bytes.length;if(total>limit||sha(bytes)!==entry.sha256)throw Error('Snapshot hash/size mismatch');}
 if(!seen.has('intra.sqlite')||!seen.has('accounts.json'))throw Error('Missing data roots');
 mkdirSync(target,{mode:0o700});secure(target);
 try {
  for(const entry of snapshot.entries){const path=childPath(target,entry.name);mkdirSync(resolve(path,'..'),{recursive:true,mode:0o700});writeFileSync(path,Buffer.from(entry.base64,'base64'),{flag:'wx',mode:0o600});}
  databaseCheck(join(target,'intra.sqlite'));
  const database=new DatabaseSync(join(target,'intra.sqlite'));
  try {
   database.exec('BEGIN IMMEDIATE');
   for(const table of ['sessions','account_recovery_grants','account_actions','account_recovery_requests','credential_requests','credential_invitations'])if(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
    if(table==='sessions')database.exec('DELETE FROM sessions');
    else if(table==='account_recovery_grants')database.exec('UPDATE account_recovery_grants SET expires=0');
    else if(table==='account_actions')database.exec('UPDATE account_actions SET consumed=1');
    else if(table==='account_recovery_requests')database.exec("UPDATE account_recovery_requests SET status='invalidated' WHERE status='pending'");
    else if(table==='credential_requests')database.exec("UPDATE credential_requests SET status='rejected',salt='',password_hash='' WHERE status='pending'");
    else database.exec('UPDATE credential_invitations SET expires_at=0 WHERE consumed_at IS NULL');
   }
   const wasm=createRequire(import.meta.url)(join(root,'verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js'));
   const previous=database.prepare('SELECT hash FROM events ORDER BY seq DESC LIMIT 1').get()?.hash||'0'.repeat(64);
   const value=JSON.stringify({at:new Date().toISOString(),actor:'operational-restore',action:'restore-invalidated-access',documentId:'operational:restore',details:{archiveSha256:sha(readFileSync(archive))}});
   database.prepare('INSERT INTO events(value,previous,hash) VALUES(?,?,?)').run(value,previous,wasm.blake3_hex(Buffer.from(previous+'\n'+value)));
   database.exec('COMMIT');
   database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }finally{database.close();}
  return {status:'PASS',files:snapshot.entries.length,sqliteIntegrity:'PASS',auditChain:'PASS',sessionsAndPendingAccess:'INVALIDATED',archiveSha256:sha(readFileSync(archive))};
 }catch(error){throw Error('Restore failed; isolated target retained for inspection: '+error.message);}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const [command,source,output,key,port]=process.argv.slice(2);
 try {
  if(!['backup','restore'].includes(command)||!source||!output||!key)throw Error('Usage: recovery.mjs backup <data> <new.archive> <key-file> [port] | restore <archive> <new-data> <key-file> [port]');
  const result=command==='backup'?await createBackup(source,output,key,Number(port||3003)):await restoreBackup(source,key,output,Number(port||3003));console.log(JSON.stringify(result));
 }catch(error){console.error('Recovery failed:',error.message);process.exitCode=1;}
}
