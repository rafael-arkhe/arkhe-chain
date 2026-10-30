import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {writeReport,REPLACE_ATTEMPTS} from './e01_atomic_report.mjs';
async function sandbox(fn) {
  const dir=await mkdtemp(join(tmpdir(),'arkhe-e01-journal-'));
  try{await fn(join(dir,'report.json'));}finally{await rm(dir,{recursive:true,force:true});}
}
test('transient Windows sharing failures retry only the file replacement',()=>sandbox(async path=>{
  await writeFile(path,'{"old":true}');let calls=0;const sleeps=[];
  await writeReport(path,{next:true},{replace:async(src,dst)=>{
    calls++;if(calls<3)throw Object.assign(new Error('sharing violation'),{code:'EPERM'});await rename(src,dst);
  },sleep:async ms=>{sleeps.push(ms);}});
  assert.equal(calls,3);assert.deepEqual(sleeps,[25,50]);assert.deepEqual(JSON.parse(await readFile(path)),{next:true});
}));
test('persistent lock leaves prior report intact and retains candidate for diagnosis',()=>sandbox(async path=>{
  await writeFile(path,'{"old":true}');let calls=0;
  await assert.rejects(writeReport(path,{next:true},{replace:async()=>{
    calls++;throw Object.assign(new Error('locked'),{code:'EPERM'});
  },sleep:async()=>{}}),/locked/);
  assert.equal(calls,REPLACE_ATTEMPTS);assert.deepEqual(JSON.parse(await readFile(path)),{old:true});
  assert.deepEqual(JSON.parse(await readFile(path+'.tmp')),{next:true});
}));
test('non-sharing filesystem failures are not retried',()=>sandbox(async path=>{
  let calls=0;
  await assert.rejects(writeReport(path,{next:true},{replace:async()=>{
    calls++;throw Object.assign(new Error('storage error'),{code:'EIO'});
  },sleep:async()=>{throw new Error('unexpected retry');}}),/storage error/);
  assert.equal(calls,1);
}));
