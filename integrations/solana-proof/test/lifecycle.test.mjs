import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { PHASES, lifecycleBytes, exportLifecycle, verifyLifecycle } from '../src/lifecycle.mjs';
import { testCurve } from '../src/meteora-config.mjs';
const address = Keypair.generate().publicKey.toBase58();
const events = PHASES.map((phase, sequence) => ({ phase, sequence, genesisHash: address, program: sequence < 6 ? 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN' : 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', config: address, dbcPool: address, dammPool: address, baseMint: address, quoteMint: address, signature: '1'.repeat(63) + String(sequence + 1), slot: sequence, messageHash: 'a'.repeat(64), observations: [['testOnly', 'synthetic']] }));

test('complete lifecycle includes every phase under explicit trusted checkpoint', () => {
  const bundle = exportLifecycle(events);
  assert(verifyLifecycle(bundle, bundle.rootHex, PHASES.length));
  assert.equal(verifyLifecycle(bundle, '0'.repeat(64), PHASES.length), false);
  assert.equal(verifyLifecycle(bundle, bundle.rootHex, 7), false);
});
test('lifecycle rejects omitted, reordered, duplicated, cross-network and altered evidence', () => {
  const original = exportLifecycle(events);
  for (const alter of [
    b => b.receipts.pop(),
    b => b.receipts.reverse(),
    b => b.receipts[1] = b.receipts[0],
    b => b.receipts[2].event.observations[0][1] = 'modified',
    b => b.receipts[2].event.genesisHash = Keypair.generate().publicKey.toBase58(),
    b => b.receipts[5].event.program = address,
    b => b.receipts[5].event.signature = b.receipts[4].event.signature,
    b => b.receipts[5].proof[0].hash[0] ^= 1,
    b => b.receipts[3].event.slot = -1,
  ]) {
    const changed = structuredClone(original); alter(changed);
    assert.equal(verifyLifecycle(changed, original.rootHex, 8), false);
  }
});
test('even a fresh root cannot hide a missing expected phase', () => {
  const changed = structuredClone(events); changed[3].phase = 'buy';
  const bundle = exportLifecycle(changed);
  assert.equal(verifyLifecycle(bundle, bundle.rootHex, 8), false);
});
test('valid membership proofs cannot hide a different order inside the committed MMR', () => {
  const permuted = [events[1], events[0], ...events.slice(2)];
  const bundle = exportLifecycle(permuted);
  bundle.receipts.sort((a, b) => a.event.sequence - b.event.sequence);
  assert.equal(verifyLifecycle(bundle, bundle.rootHex, 8), false);
});
test('leaf encoding rejects malformed observations and floating slots', () => {
  assert.throws(() => lifecycleBytes({ ...events[0], observations: [['amount', 1.5]] }));
  assert.throws(() => lifecycleBytes({ ...events[0], slot: 0.5 }));
  assert.throws(() => lifecycleBytes({ ...events[0], config: 'not-a-key' }));
});
test('test curve stays Token-2022 with DAMM v2 and a bounded quote threshold', () => {
  const curve = testCurve();
  assert.equal(curve.tokenType, 1);
  assert.equal(curve.migrationOption, 1);
  assert.equal(curve.tokenDecimal, 6);
  assert(curve.migrationQuoteThreshold.gtn(0));
  assert(curve.migrationQuoteThreshold.lt(new (curve.migrationQuoteThreshold.constructor)('30000000000')));
});
