import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { assertLocalGenesis, PUBLIC_GENESIS_HASHES } from '../src/transaction.mjs';
test('full public genesis hashes are rejected even through a loopback RPC proxy', () => {
  for (const hash of PUBLIC_GENESIS_HASHES) assert.throws(() => assertLocalGenesis(hash), /public cluster forbidden/);
  assert.doesNotThrow(() => assertLocalGenesis(Keypair.generate().publicKey.toBase58()));
  assert.throws(() => assertLocalGenesis('not-a-genesis'));
});
