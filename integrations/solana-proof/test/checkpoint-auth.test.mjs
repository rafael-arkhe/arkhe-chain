import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { signCheckpoint, verifyCheckpoint, checkpointDigest } from '../src/checkpoint-auth.mjs';
const key = generateKeyPairSync('ed25519'), other = generateKeyPairSync('ed25519');
const payload = { network: 'local', mint: 'test', logId: 'prelaunch', sequence: 0, rootHex: 'a'.repeat(64), leafCount: 1, previousDigest: null, issuedAt: 100, expiresAt: 200 };
const context = { network: 'local', mint: 'test', logId: 'prelaunch', now: 150, nextSequence: 0, minimumLeafCount: 1, previousDigest: null };
test('checkpoint verifies only against an independently pinned signer', () => {
  const envelope = signCheckpoint(payload, key.privateKey);
  assert(verifyCheckpoint(envelope, [key.publicKey], context)); assert.equal(verifyCheckpoint(envelope, [other.publicKey], context), false);
});
test('checkpoint rejects signature tampering, wrong network/mint/log and expiration', () => {
  const envelope = signCheckpoint(payload, key.privateKey);
  for (const update of [{ network: 'mainnet' }, { mint: 'different' }, { logId: 'other' }, { now: 200 }, { now: 99 }, { minimumLeafCount: 2 }, { nextSequence: 1 }, { previousDigest: 'b'.repeat(64) }]) assert.equal(verifyCheckpoint(envelope, [key.publicKey], { ...context, ...update }), false);
  const changed = structuredClone(envelope); changed.payload.rootHex = 'b'.repeat(64); assert.equal(verifyCheckpoint(changed, [key.publicKey], context), false);
});
test('chained checkpoints reject replay, rollback and signer substitution', () => {
  const first = signCheckpoint(payload, key.privateKey);
  const nextPayload = { ...payload, sequence: 1, leafCount: 2, previousDigest: checkpointDigest(first) };
  const next = signCheckpoint(nextPayload, key.privateKey);
  const nextContext = { ...context, nextSequence: 1, minimumLeafCount: 1, previousDigest: checkpointDigest(first) };
  assert(verifyCheckpoint(next, [key.publicKey], nextContext));
  assert.equal(verifyCheckpoint(first, [key.publicKey], nextContext), false);
  assert.equal(verifyCheckpoint(signCheckpoint(nextPayload, other.privateKey), [key.publicKey], nextContext), false);
});
