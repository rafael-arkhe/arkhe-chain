import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { getAccount, getMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { AuditJournal, verifyJournalExtension } from './audit-journal.mjs';
import { scanFinalizedRange } from './indexer.mjs';
import { assertLocalGenesis, allowedEndpoint, memoInstruction } from './transaction.mjs';
import { signCheckpoint, verifyCheckpoint, checkpointDigest } from './checkpoint-auth.mjs';
import { buildProof, verifyLeaf } from './proof.mjs';
const source = process.argv[2] ?? 'output/prelaunch/fixtures-result';
const report = JSON.parse(readFileSync(`${source}/report.json`, 'utf8'));
assert.equal(report.status, 'PASS');
const transactions = JSON.parse(readFileSync(`${source}/transactions.json`, 'utf8'));
const events = JSON.parse(readFileSync(`${source}/events.json`, 'utf8'));
const connection = new Connection(allowedEndpoint(report.endpoint), 'finalized');
assert(new URL(report.endpoint).protocol === 'http:');
const network = await connection.getGenesisHash(); assertLocalGenesis(network); assert.equal(network, report.genesisHash);
const directory = `${source}/audit-${randomUUID()}`; mkdirSync(directory, { recursive: true });
const scope = { network, mint: report.mint, logId: 'prelaunch-block-indexer', startSlot: Math.min(...transactions.map(t => t.slot)) };
let journal = new AuditJournal(`${directory}/journal.db`, scope);
const end = Math.max(...transactions.map(t => t.slot));
const start = performance.now();
for (let from = scope.startSlot; from <= end; from += 64) await scanFinalizedRange(connection, journal, from, Math.min(from + 63, end));
const scanMs = performance.now() - start;
const backup = journal.export(), checkpoint = journal.checkpoint(), count = journal.read().length;
assert(count > 0);
const indexedSignatures = new Set(backup.events.map(e => e.payload.signature));
for (const event of events.filter(e => !['config', 'create'].includes(e.phase))) assert(indexedSignatures.has(event.signature), `missing swap/migration CPI: ${event.phase}`);
const balances = new Map();
for (const { payload: p } of backup.events) {
  const amount = BigInt(p.amount);
  if (p.source) balances.set(p.source, (balances.get(p.source) ?? 0n) - amount);
  if (p.destination) balances.set(p.destination, (balances.get(p.destination) ?? 0n) + amount);
}
for (const [account, expected] of balances) {
  const actual = await connection.getAccountInfo(new PublicKey(account));
  assert.equal(actual ? (await getAccount(connection, new PublicKey(account), 'finalized', TOKEN_2022_PROGRAM_ID)).amount : 0n, expected, `balance reconciliation failed: ${account}`);
}
const supply = (await getMint(connection, new PublicKey(report.mint), 'finalized', TOKEN_2022_PROGRAM_ID)).supply;
assert.equal([...balances.values()].reduce((sum, value) => sum + value, 0n), supply);
const root = checkpoint.rootHex; journal.close(); journal = new AuditJournal(`${directory}/journal.db`, scope);
assert.equal(journal.checkpoint().rootHex, root);
const restored = new AuditJournal(`${directory}/restored.db`, scope); restored.appendBatch(backup.events, backup.cursor); assert.equal(restored.checkpoint().rootHex, root);
assert(verifyJournalExtension(backup, restored.export())); restored.close(); journal.close();
const keys = generateKeyPairSync('ed25519');
const now = Math.floor(Date.now() / 1000);
const envelope = signCheckpoint({ network, mint: report.mint, logId: scope.logId, sequence: 0, rootHex: root, leafCount: count, previousDigest: null, issuedAt: now, expiresAt: now + 600 }, keys.privateKey);
assert(verifyCheckpoint(envelope, [keys.publicKey], { ...scope, now, nextSequence: 0, minimumLeafCount: count, previousDigest: null }));
writeFileSync(`${directory}/backup.json`, JSON.stringify(backup, null, 2));
writeFileSync(`${directory}/signed-checkpoint.json`, JSON.stringify(envelope, null, 2));
writeFileSync(`${directory}/trusted-public-key.pem`, keys.publicKey.export({ type: 'spki', format: 'pem' }));
const leaves = backup.events.map(e => Buffer.from(JSON.stringify(e.payload, Object.keys(e.payload).sort())));
for (const index of [0, Math.floor(count / 2), count - 1]) {
  const proof = buildProof(leaves, index); assert.equal(proof.rootHex, root); assert(verifyLeaf(leaves[index], proof.proof, root, count));
}
const anchorPayer = Keypair.generate();
async function wait(signature) {
  for (let i = 0; i < 180; i++) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) throw Error(JSON.stringify(status.err));
    if (status?.confirmationStatus === 'finalized') return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error('finalization timeout');
}
await wait(await connection.requestAirdrop(anchorPayer.publicKey, 100000000));
const memo = `ARKHE:v1:signed-checkpoint:${checkpointDigest(envelope)}`;
const signature = await connection.sendTransaction(new Transaction().add(memoInstruction(memo)), [anchorPayer], { preflightCommitment: 'finalized' }); await wait(signature);
const anchored = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
assert(anchored.meta.err === null && anchored.transaction.message.compiledInstructions.some(ix => Buffer.from(ix.data).toString() === memo));
const result = { status: 'PASS', directory, network, mint: report.mint, scopeStart: scope.startSlot, scopeEnd: end, indexedTokenEvents: count, reconciledAccounts: balances.size, reconciledSupply: supply.toString(), rootHex: root, scanMs, restartRecovery: true, backupRestore: true, allBusinessSignaturesCovered: true, checkpointSignatureVerified: true, anchorSignature: signature, publicChainConsensusVerifiedOffline: false };
writeFileSync(`${source}/audit-report.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
