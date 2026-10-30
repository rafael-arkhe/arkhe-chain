import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProof, receiptFor, verifyReceipt, intentBytes, intentMemo, checkpointMemo } from '../src/proof.mjs';
import { Keypair } from '@solana/web3.js';
import { decodeTransferCheckedInstruction, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { transferTransaction, allowedEndpoint, MEMO_PROGRAM_ID } from '../src/transaction.mjs';
const event = i => ({ intent: { cluster: 'synthetic', mint: 'mint', source: 'alice', destination: 'bob', amount: String(i + 1), decimals: 6, operationId: `op-${i}` }, signature: '1'.repeat(64), slot: i });

for (const count of [1, 3, 4, 5, 7]) {
  test(`MMR ${count}: every proof matches frozen Arkhe vectors`, () => {
    const vector = JSON.parse(readFileSync(new URL(`../../../verification/vectors/mmr/${count}-leaves.json`, import.meta.url)));
    const leaves = vector.input.leaves.map(hex => Buffer.from(hex, 'hex'));
    for (const expected of vector.expected_output.proofs) {
      const result = buildProof(leaves, expected.target_index);
      assert.equal(result.rootHex, vector.expected_output.root_hash_hex);
      assert.deepEqual(result.proof.map(p => Buffer.from(p.hash).toString('hex')), expected.inclusion_proof_hashes);
      assert.deepEqual(result.proof.map(p => p.kind), expected.inclusion_proof_kinds);
      assert.deepEqual(result.proof.map(p => p.direction), expected.inclusion_proof_directions);
    }
  });
}
test('WASM checks all peaks; modified event, proof, checkpoint and amount fail', () => {
  const events = Array.from({ length: 13 }, (_, i) => event(i));
  for (let i = 0; i < events.length; i++) {
    const receipt = receiptFor(events, i);
    assert(verifyReceipt(receipt, receipt.rootHex, 13));
    for (const mutate of [r => r.intent.amount = '900', r => r.intent.destination = 'eve', r => r.signature = '2'.repeat(64), r => r.slot++, r => r.proof[0].hash[0] ^= 1, r => r.leafCount++]) {
      const changed = structuredClone(receipt); mutate(changed);
      assert.equal(verifyReceipt(changed, receipt.rootHex, 13), false);
    }
    assert.equal(verifyReceipt(receipt, '0'.repeat(64), 13), false);
    assert.equal(verifyReceipt(receipt, receipt.rootHex, 12), false);
  }
});
test('intent binds operation, network and transfer; rejects unsafe amounts', () => {
  const intent = event(0).intent;
  assert.notEqual(intentMemo(intent), intentMemo({ ...intent, operationId: 'other' }));
  assert.notEqual(intentMemo(intent), intentMemo({ ...intent, cluster: 'other' }));
  for (const amount of ['0', '-1', '1.2', '01', '18446744073709551616', 10]) assert.throws(() => intentBytes({ ...intent, amount }));
  assert.throws(() => checkpointMemo('bad', 1));
  assert.throws(() => buildProof([], 0));
});
test('real Token-2022 instruction encodes intent and immediately preceding memo', () => {
  const keys = Array.from({ length: 4 }, () => Keypair.generate().publicKey);
  const intent = { ...event(0).intent, mint: keys[0].toBase58(), source: keys[1].toBase58(), destination: keys[2].toBase58(), amount: '18446744073709551615' };
  const tx = transferTransaction(intent, keys[3]);
  assert.equal(tx.instructions.length, 2);
  assert(tx.instructions[0].programId.equals(MEMO_PROGRAM_ID));
  assert.equal(tx.instructions[0].data.toString(), intentMemo(intent));
  const decoded = decodeTransferCheckedInstruction(tx.instructions[1], TOKEN_2022_PROGRAM_ID);
  assert.equal(decoded.data.amount, 18446744073709551615n);
  assert(decoded.keys.destination.pubkey.equals(keys[2]));
  assert.equal(decoded.data.decimals, 6);
});
test('RPC selection rejects production, credentials and lookalike hosts', () => {
  for (const url of ['https://api.mainnet-beta.solana.com', 'https://api.testnet.solana.com', 'https://api.devnet.solana.com.evil', 'http://localhost.evil:8899', 'https://user:pass@api.devnet.solana.com', 'https://api.devnet.solana.com/?key=x']) assert.throws(() => allowedEndpoint(url));
  for (const url of ['http://127.0.0.1:8899', 'https://api.devnet.solana.com']) assert.equal(allowedEndpoint(url), url);
});
