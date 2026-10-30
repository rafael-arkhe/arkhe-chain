import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { AuditJournal, canonicalBytes, verifyJournalExtension } from '../src/audit-journal.mjs';
const scope = { network: 'local', mint: 'test', logId: 'prelaunch' };
const event = i => ({ id: `event-${i}`, slot: i, payload: ['event', String(i)] });
function fixture(t) { const directory = mkdtempSync(join(tmpdir(), 'arkhe-journal-')); t.after(() => rmSync(directory, { recursive: true, force: true })); return join(directory, 'journal.db'); }
test('journal restart and exported backup reproduce the same root', t => {
  const file = fixture(t); let journal = new AuditJournal(file, scope);
  journal.appendBatch([event(0), event(1)], 1); const root = journal.checkpoint().rootHex; const backup = journal.export(); journal.close();
  journal = new AuditJournal(file, scope); assert.equal(journal.checkpoint().rootHex, root); journal.close();
  const restored = new AuditJournal(`${file}.restored`, scope); restored.appendBatch(backup.events, backup.cursor); assert.equal(restored.checkpoint().rootHex, root); restored.close();
});
test('repeated ingestion deduplicates and conflicting replay atomically rolls back', t => {
  const journal = new AuditJournal(fixture(t), scope);
  try {
    journal.appendBatch([event(0)], 0); journal.appendBatch([event(0)], 0); assert.equal(journal.read().length, 1);
    assert.throws(() => journal.appendBatch([event(1), { ...event(0), payload: ['altered'] }], 2), /conflicting/);
    assert.equal(journal.read().length, 1); assert.equal(journal.cursor, 0);
  } finally { journal.close(); }
});
test('process death during transaction leaves neither partial events nor advanced cursor', t => {
  const file = fixture(t); const journal = new AuditJournal(file, scope); journal.appendBatch([event(0)], 0); journal.close();
  const script = "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.argv[1]); db.exec('BEGIN IMMEDIATE'); db.prepare('INSERT INTO events VALUES (?,?,?,?,?)').run(1,'unfinished',Buffer.from('x'),'bad',1); db.prepare('UPDATE metadata SET value=? WHERE key=?').run('1','cursor'); process.exit(23);";
  const killed = spawnSync(process.execPath, ['-e', script, file]); assert.equal(killed.status, 23);
  const reopened = new AuditJournal(file, scope); assert.equal(reopened.read().length, 1); assert.equal(reopened.cursor, 0); reopened.close();
});
test('journal rejects different scope and decreasing slot/cursor', t => {
  const file = fixture(t); const journal = new AuditJournal(file, scope);
  journal.appendBatch([event(2)], 2); assert.throws(() => journal.appendBatch([event(1)], 2)); assert.throws(() => journal.appendBatch([], 1)); journal.close();
  assert.throws(() => new AuditJournal(file, { ...scope, network: 'other' }));
});
test('full-prefix consistency detects truncation and rewritten history', t => {
  const journal = new AuditJournal(fixture(t), scope); journal.appendBatch([event(0)], 0); const old = journal.export();
  journal.appendBatch([event(1)], 1); const next = journal.export(); assert(verifyJournalExtension(old, next));
  assert.equal(verifyJournalExtension(next, old), false); next.events[0].payload = ['changed']; assert.equal(verifyJournalExtension(old, next), false); journal.close();
});
test('canonical leaves reject unsafe floats, excessive nesting and unstable values', () => {
  assert(canonicalBytes({ b: 1, a: 2 }).equals(canonicalBytes({ a: 2, b: 1 })));
  for (const value of [NaN, Infinity, 0.1, undefined, BigInt(2), 'x'.repeat(8193)]) assert.throws(() => canonicalBytes(value));
});
