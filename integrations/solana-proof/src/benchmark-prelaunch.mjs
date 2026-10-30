import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { AuditJournal } from './audit-journal.mjs';
import { signCheckpoint, verifyCheckpoint } from './checkpoint-auth.mjs';
import { buildProof, verifyLeaf } from './proof.mjs';
const directory = `output/prelaunch/load-${randomUUID()}`; mkdirSync(directory, { recursive: true });
const scope = { network: 'synthetic', mint: 'synthetic', logId: 'load' };
const count = 5000;
let journal = new AuditJournal(`${directory}/journal.db`, scope);
const batch = Array.from({ length: count }, (_, i) => ({ id: `synthetic-${i}`, slot: i, payload: ['synthetic-load', String(i), '1'] }));
const start = performance.now(); journal.appendBatch(batch, count - 1); const ingestMs = performance.now() - start;
const rootStart = performance.now(); const checkpoint = journal.checkpoint(); const rootMs = performance.now() - rootStart;
const rows = journal.read();
const verificationTimes = [];
for (const index of [0, Math.floor(count / 2), count - 1]) {
  const proof = buildProof(rows.map(r => r.leaf), index); assert.equal(proof.rootHex, checkpoint.rootHex);
  for (let j = 0; j < 100; j++) { const began = performance.now(); assert(verifyLeaf(rows[index].leaf, proof.proof, checkpoint.rootHex, count)); verificationTimes.push(performance.now() - began); }
}
journal.close();
const moduleUrl = new URL('./audit-journal.mjs', import.meta.url).href;
const writer = "const {AuditJournal}=await import(process.argv[1]);const journal=new AuditJournal(process.argv[2],{network:'synthetic',mint:'synthetic',logId:'load'});journal.appendBatch(Array.from({length:64},(_,i)=>({id:process.argv[3]+'-'+i,slot:5000,payload:['concurrent-writer',process.argv[3],String(i)]})),5000);journal.close();";
const results = await Promise.all(['writerA', 'writerB'].map(id => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', writer, moduleUrl, `${directory}/journal.db`, id], { windowsHide: true });
  let stderr = ''; child.stderr.on('data', data => stderr += data); child.on('error', reject); child.on('exit', code => code === 0 ? resolve(id) : reject(Error(stderr)));
})));
journal = new AuditJournal(`${directory}/journal.db`, scope); assert.equal(journal.read().length, count + 128); journal.close();
const keys = generateKeyPairSync('ed25519'); const now = Math.floor(Date.now() / 1000);
const signed = signCheckpoint({ ...scope, rootHex: checkpoint.rootHex, leafCount: count, sequence: 0, previousDigest: null, issuedAt: now, expiresAt: now + 600 }, keys.privateKey);
assert(verifyCheckpoint(signed, [keys.publicKey], { ...scope, now, nextSequence: 0, minimumLeafCount: count, previousDigest: null }));
verificationTimes.sort((a, b) => a - b);
const report = { status: 'PASS', synthetic: true, directory, events: count, ingestMs, eventsPerSecond: count * 1000 / ingestMs, rootBuildMs: rootMs, proofVerifications: verificationTimes.length, proofVerificationP50Ms: verificationTimes[149], proofVerificationP95Ms: verificationTimes[284], concurrentWriters: results.length, persistedEventsAfterConcurrentWriters: count + 128, heapUsedBytes: process.memoryUsage().heapUsed, productionSloDefined: false };
writeFileSync('output/prelaunch/load-report.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
