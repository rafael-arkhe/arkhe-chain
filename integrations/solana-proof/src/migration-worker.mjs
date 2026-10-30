// Resume a migration from PUBLIC state only; no original creator keys are read.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { allowedEndpoint, assertLocalGenesis } from './transaction.mjs';
import { hash } from './proof.mjs';
const [stateFile, resultFile] = process.argv.slice(2);
const state = JSON.parse(readFileSync(stateFile, 'utf8'));
const connection = new Connection(allowedEndpoint(state.endpoint), 'finalized');
const payer = Keypair.generate();
async function finalized(signature) {
  for (let i = 0; i < 180; i++) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) {
      const error = Error(JSON.stringify(status.err)); error.signature = signature;
      error.logs = (await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }))?.meta?.logMessages ?? [];
      throw error;
    }
    if (status?.confirmationStatus === 'finalized') return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error('worker finalization timeout');
}
try {
  assert(new URL(state.endpoint).protocol === 'http:');
  const network = await connection.getGenesisHash(); assertLocalGenesis(network); assert.equal(network, state.genesisHash);
  await finalized(await connection.requestAirdrop(payer.publicKey, 2000000000));
  const client = new DynamicBondingCurveClient(connection, 'finalized');
  const migration = await client.migration.migrateToDammV2({ pool: new PublicKey(state.pool), dammConfig: new PublicKey(state.dammConfig), payer: payer.publicKey });
  const tx = migration.transaction; tx.feePayer = payer.publicKey; tx.recentBlockhash = (await connection.getLatestBlockhash('finalized')).blockhash;
  tx.sign(payer, migration.firstPositionNftKeypair, migration.secondPositionNftKeypair);
  const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: 'finalized' }); await finalized(signature);
  const record = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  assert(record?.meta && record.meta.err === null); assert.equal(hash(record.transaction.message.serialize()), hash(tx.serializeMessage()));
  writeFileSync(resultFile, JSON.stringify({ status: 'PASS', workerPayer: payer.publicKey.toBase58(), originalKeysRead: false, record: { signature, slot: record.slot, messageHash: hash(tx.serializeMessage()), wireTransactionBase64: tx.serialize().toString('base64'), fee: record.meta.fee, logMessages: record.meta.logMessages, preTokenBalances: record.meta.preTokenBalances, postTokenBalances: record.meta.postTokenBalances } }, null, 2));
} catch (error) { writeFileSync(resultFile, JSON.stringify({ status: 'FAIL', signature: error.signature ?? null, logs: error.logs ?? error.transactionLogs ?? [], message: error.message }, null, 2)); process.exitCode = 2; }
