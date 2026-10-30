import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
process.env.ARKHE_INTRA_DATA_DIR=mkdtempSync(join(tmpdir(),'arkhe-resilience-'));
const {db,transaction,readiness}=await import('../lib/store.mjs');
test('SQLite FK enforcement, rollback, unique constraints and plans match real queries',()=>{
  assert.equal(readiness(),true); assert.equal(db().prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.throws(()=>db().prepare("INSERT INTO credential_requests(id,invitation_id,email,name,role,public_key,salt,password_hash,possession_statement,possession_signature,created_at,status) VALUES('x','missing','e','n','author','k','s','p','s','s','now','pending')").run(),/FOREIGN KEY/);
  assert.throws(()=>transaction(()=>{db().prepare("INSERT INTO documents VALUES('rollback','{}')").run();throw Error('abort');}),/abort/);
  assert.equal(db().prepare("SELECT * FROM documents WHERE id='rollback'").get(),undefined);
  db().prepare("INSERT INTO documents VALUES('unique','{}')").run();
  assert.throws(()=>db().prepare("INSERT INTO documents VALUES('unique','{}')").run(),/UNIQUE/);
  for (const [sql,index] of [
    ['SELECT user_id FROM sessions WHERE hash=? AND expires>?','sqlite_autoindex_sessions'],
    ['DELETE FROM sessions WHERE expires<=?','sessions_expiry'],
    ['SELECT * FROM credential_requests ORDER BY created_at DESC LIMIT 200','credential_requests_created'],
    ['DELETE FROM login_attempts WHERE until_ms<=?','login_attempts_expiry'],
  ]) {
    const count=(sql.match(/\?/g)||[]).length;
    const plan=db().prepare('EXPLAIN QUERY PLAN '+sql).all(...Array(count).fill(0)).map(r=>r.detail).join('\n');
    assert.ok(plan.includes(index),plan);
  }
});
test('SQLite contention retries acquisition, executes callback once and fails within budget',async()=>{
  db().exec('PRAGMA busy_timeout=40');
  const code=`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(workerData);d.exec('BEGIN IMMEDIATE');parentPort.postMessage('locked');setTimeout(()=>{d.exec('COMMIT');d.close();},100);`;
  const worker=new Worker(code,{eval:true,workerData:join(process.env.ARKHE_INTRA_DATA_DIR,'intra.sqlite')});
  await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
  let calls=0;transaction(()=>{calls++;db().prepare("INSERT INTO documents VALUES('after-lock','{}')").run();});
  assert.equal(calls,1);await new Promise(resolve=>worker.once('exit',resolve));
  // Keep the lock until the parent explicitly releases it. A timer can expire
  // before the parent is scheduled under concurrent compilation/test load.
  const heldCode=code.replace("setTimeout(()=>{d.exec('COMMIT');d.close();},100)","parentPort.once('message',()=>{d.exec('COMMIT');d.close();})");
  const worker2=new Worker(heldCode,{eval:true,workerData:join(process.env.ARKHE_INTRA_DATA_DIR,'intra.sqlite')});
  const exited=new Promise((resolve,reject)=>{worker2.once('exit',resolve);worker2.once('error',reject);});
  await new Promise((resolve,reject)=>{worker2.once('message',resolve);worker2.once('error',reject);});
  try {
    assert.throws(()=>transaction(()=>assert.fail('callback ran under lock')), /locked|busy/i);
  } finally {
    worker2.postMessage('release');
    await exited;
  }
  db().exec('PRAGMA busy_timeout=5000'); assert.equal(readiness(),true);
});
