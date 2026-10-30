import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, Transaction, PublicKey } from '@solana/web3.js';
import { createTransferCheckedInstruction, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractTokenEvents, scanFinalizedRange } from '../src/indexer.mjs';
import { AuditJournal } from '../src/audit-journal.mjs';
const payer = Keypair.generate(), source = Keypair.generate().publicKey, mint = Keypair.generate().publicKey, destination = Keypair.generate().publicKey;
function transaction() {
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: PublicKey.default.toBase58() });
  tx.add(createTransferCheckedInstruction(source, mint, destination, payer.publicKey, 42n, 6, [], TOKEN_2022_PROGRAM_ID));
  const message = tx.compileMessage();
  return { transaction: { message, signatures: ['synthetic-signature'] }, meta: { err: null, preTokenBalances: [], postTokenBalances: [], innerInstructions: [{ index: 0, instructions: [{ ...message.compiledInstructions[0], data: bs58.encode(message.compiledInstructions[0].data) }] }] } };
}
test('indexes multiple outer and inner token instructions with distinct identities', () => {
  const events = extractTokenEvents(transaction(), 1, 'local', mint.toBase58());
  assert.equal(events.length, 2); assert.notEqual(events[0].id, events[1].id); assert.equal(events[1].payload.amount, '42');
  const failed = transaction(); failed.meta.err = { InstructionError: [0, 'error'] }; assert.equal(extractTokenEvents(failed, 1, 'local', mint.toBase58()).length, 0);
});
test('RPC outage/missing block cannot commit partial progress; recovery resumes without gaps', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'arkhe-indexer-'));
  const journal = new AuditJournal(join(dir, 'journal.db'), { network: 'local', mint: mint.toBase58(), startSlot: 1 }); t.after(() => { journal.close(); assert(dir.startsWith(join(tmpdir(), 'arkhe-indexer-'))); rmSync(dir, { recursive: true, force: true }); });
  const rpc = { getGenesisHash: async () => 'local', getSlot: async () => 3, getBlocks: async () => [1, 2], getBlock: async slot => slot === 2 ? null : { blockhash: 'hash', transactions: [transaction()] } };
  await assert.rejects(() => scanFinalizedRange(rpc, journal, 1, 2), /missing/); assert.equal(journal.cursor, -1); assert.equal(journal.read().length, 0);
  rpc.getBlock = async slot => { const tx = transaction(); tx.transaction.signatures = [`synthetic-${slot}`]; return { blockhash: `hash-${slot}`, transactions: [tx] }; };
  await scanFinalizedRange(rpc, journal, 1, 2); assert.equal(journal.cursor, 2); assert.equal(journal.read().length, 4);
  await assert.rejects(() => scanFinalizedRange(rpc, journal, 1, 2), /noncontiguous/);
});
test('indexer rejects unfinalized ranges, wrong networks and divergent providers', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'arkhe-indexer-'));
  const journal = new AuditJournal(join(dir, 'journal.db'), { network: 'local', mint: mint.toBase58(), startSlot: 1 }); t.after(() => { journal.close(); assert(dir.startsWith(join(tmpdir(), 'arkhe-indexer-'))); rmSync(dir, { recursive: true, force: true }); });
  const rpc = { getGenesisHash: async () => 'local', getSlot: async () => 1, getBlocks: async () => [1], getBlock: async () => ({ blockhash: 'a', transactions: [] }) };
  await assert.rejects(() => scanFinalizedRange(rpc, journal, 1, 2), /unfinalized/);
  await assert.rejects(() => scanFinalizedRange(rpc, journal, 1, 1, { ...rpc, getBlocks: async () => [] }), /disagree/);
  await assert.rejects(() => scanFinalizedRange(rpc, journal, 1, 1, { ...rpc, getBlock: async () => ({ blockhash: 'b' }) }), /disagreement/);
  assert.equal(journal.cursor, -1);
});
