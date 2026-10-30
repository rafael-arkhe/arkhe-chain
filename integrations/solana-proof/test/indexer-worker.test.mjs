import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditJournal } from '../src/audit-journal.mjs';
import { pollIndexer } from '../src/indexer-worker.mjs';
test('polling worker retries RPC outage, persists progress and resumes after restart', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arkhe-poll-')); const file = join(directory, 'db.sqlite');
  let journal = new AuditJournal(file, { network: 'local', mint: 'test', startSlot: 1 });
  t.after(() => { journal.close(); assert(directory.startsWith(join(tmpdir(), 'arkhe-poll-'))); rmSync(directory, { recursive: true, force: true }); });
  let outage = true, calls = 0;
  const rpc = { getSlot: async () => 1, getGenesisHash: async () => 'local', getBlocks: async () => { calls++; if (outage) { outage = false; throw Error('temporary outage'); } return [1]; }, getBlock: async () => ({ blockhash: 'stable', transactions: [] }) };
  const first = await pollIndexer(rpc, journal, { maxPolls: 2, intervalMs: 0 }); assert.equal(first.failures, 1); assert.equal(first.batches, 1); assert.equal(journal.cursor, 1);
  journal.close(); journal = new AuditJournal(file, { network: 'local', mint: 'test', startSlot: 1 });
  await pollIndexer(rpc, journal, { maxPolls: 1, intervalMs: 0 }); assert.equal(calls, 2, 'processed finalized slots must not be rescanned');
});
