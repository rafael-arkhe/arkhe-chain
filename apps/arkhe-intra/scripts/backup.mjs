import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { root } from '../lib/paths.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (base,path) => { const rel=relative(base,path); return rel==='' || !rel.startsWith('..')&&!isAbsolute(rel); };
function regular(path) { if(!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())throw Error('Expected a regular file'); }
export function verifyDatabase(path) {
  regular(path); const database=new DatabaseSync(path,{readOnly:true});
  try {
    const check=database.prepare('PRAGMA integrity_check').all();
    if(check.length!==1 || check[0].integrity_check!=='ok')throw Error('SQLite integrity check failed');
    if(database.prepare('PRAGMA foreign_key_check').all().length)throw Error('SQLite foreign key check failed');
    const require=createRequire(import.meta.url), verifier=require(resolve(root,'verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js'));
    let previous='0'.repeat(64);
    for(const row of database.prepare('SELECT value,previous,hash FROM events ORDER BY seq').iterate()) {
      if(row.previous!==previous || verifier.blake3_hex(Buffer.from(previous+'\n'+row.value))!==row.hash)throw Error('Audit chain verification failed');
      previous=row.hash;
    }
    return {integrity:'ok',foreignKeys:'ok',auditChain:'ok'};
  } finally { database.close(); }
}
export async function createBackup(sourceDirectory,destinationDirectory) {
  const source=realpathSync(sourceDirectory), parent=realpathSync(resolve(destinationDirectory,'..')), destination=join(parent,resolve(destinationDirectory).split(/[\\/]/).at(-1));
  if(inside(source,destination))throw Error('Backup destination must be outside the data directory');
  const accountsPath=join(source,'accounts.json');regular(accountsPath);
  const accounts=readFileSync(accountsPath);JSON.parse(accounts);
  regular(join(source,'intra.sqlite'));
  mkdirSync(destination,{mode:0o700}); // Exclusive directory creation; never overwrite.
  const database=new DatabaseSync(join(source,'intra.sqlite'),{readOnly:true});
  try { await sqliteBackup(database,join(destination,'intra.sqlite')); } finally {database.close();}
  if(!accounts.equals(readFileSync(accountsPath)))throw Error('Bootstrap accounts changed during backup; discard incomplete snapshot');
  writeFileSync(join(destination,'accounts.json'),accounts,{mode:0o600,flag:'wx'});
  const verification=verifyDatabase(join(destination,'intra.sqlite'));
  const files=Object.fromEntries(['intra.sqlite','accounts.json'].map(name=>[name,sha(readFileSync(join(destination,name)))]));
  const manifest={format:'arkhe-intra/backup/v1',createdAt:new Date().toISOString(),files,verification,scope:'SQLite snapshot and bootstrap accounts; no private keys, credentials, environment or external artifacts'};
  writeFileSync(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {status:'verified',...verification};
}
export function restoreBackup(backupDirectory,destinationDirectory) {
  const source=realpathSync(backupDirectory);regular(join(source,'manifest.json'));
  const manifest=JSON.parse(readFileSync(join(source,'manifest.json'),'utf8'));
  if(manifest.format!=='arkhe-intra/backup/v1' || Object.keys(manifest.files||{}).sort().join(',')!=='accounts.json,intra.sqlite')throw Error('Invalid backup manifest');
  for(const [name,expected] of Object.entries(manifest.files)) {regular(join(source,name));if(sha(readFileSync(join(source,name)))!==expected)throw Error('Backup checksum mismatch');}
  verifyDatabase(join(source,'intra.sqlite'));JSON.parse(readFileSync(join(source,'accounts.json'),'utf8'));
  const parent=realpathSync(resolve(destinationDirectory,'..')), destination=join(parent,resolve(destinationDirectory).split(/[\\/]/).at(-1));
  if(inside(source,destination))throw Error('Restore must target a new directory outside backup');
  mkdirSync(destination,{mode:0o700});
  for(const name of ['accounts.json','intra.sqlite'])writeFileSync(join(destination,name),readFileSync(join(source,name)),{mode:0o600,flag:'wx'});
  // Do not resurrect bearer sessions from the snapshot.
  const database=new DatabaseSync(join(destination,'intra.sqlite'));
  try {database.exec('DELETE FROM sessions');}finally{database.close();}
  return {status:'restored',sessions:'cleared',...verifyDatabase(join(destination,'intra.sqlite'))};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode,source,destination]=process.argv.slice(2);
    if(!source||!destination||!['backup','restore'].includes(mode))throw Error('Usage: node backup.mjs backup|restore SOURCE_DIR NEW_DEST_DIR');
    console.log(JSON.stringify(mode==='backup'?await createBackup(source,destination):restoreBackup(source,destination)));
  } catch { console.error(JSON.stringify({level:'error',event:'backup_operation_failed',message:'Backup/restore refused or failed; inspect paths, permissions, integrity and manifest. Incomplete directories are not valid backups.'}));process.exitCode=1; }
}
