import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { BUCKETS, createAirdrop, verifyAllocation, validateSupplyBudget } from '../src/airdrop.mjs';
const address = () => Keypair.generate().publicKey.toBase58();
test('1B supply and 60/20/15/5 allocations conserve supply exactly', () => {
  assert(validateSupplyBudget(BUCKETS, 0n));
  assert.throws(() => validateSupplyBudget(BUCKETS, 1n), /no additional DBC/);
});
test('ten recipient allocations prove 600M token total through Arkhe WASM MMR', () => {
  const network = address(), mint = address(); const receipts = createAirdrop(network, mint, Array.from({ length: 10 }, address));
  assert.equal(receipts.reduce((sum, r) => sum + BigInt(r.allocation.amount), 0n), BUCKETS.community);
  for (const receipt of receipts) {
    const context = { ...receipt.allocation };
    assert(verifyAllocation(receipt, receipt.rootHex, context));
    for (const update of [{ network: address() }, { mint: address() }, { recipient: address() }, { dropId: 'other' }]) assert.equal(verifyAllocation(receipt, receipt.rootHex, { ...context, ...update }), false);
    const altered = structuredClone(receipt); altered.allocation.amount = '1'; assert.equal(verifyAllocation(altered, receipt.rootHex, context), false);
  }
});
test('airdrop refuses duplicate recipient list', () => {
  assert.throws(() => createAirdrop(address(), address(), Array(10).fill(address())), /distinct/);
});
