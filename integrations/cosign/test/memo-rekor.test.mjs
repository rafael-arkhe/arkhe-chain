import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyMemoAnchor, verifyAnchoredMemo, sha256, checkpointBytes } from '../memo-rekor.mjs';

const fixture = name => readFileSync(new URL(`./fixtures/memo-rekor/${name}`, import.meta.url));
const original = JSON.parse(fixture('bundle.json'));
const root = fixture('trusted_root.json');
const policy = JSON.parse(fixture('policy.json'));
const rust = fileURLToPath(new URL(`../../../target/debug/examples/memo_persistence${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
const fresh = () => structuredClone(original);
const entry = b => b.sigstore_bundle.verificationMaterial.tlogEntries[0];
const flip = b64 => { const b = Buffer.from(b64, 'base64'); b[0] ^= 1; return b.toString('base64'); };

test('live Rekor v1 receipt and durable memo verify offline, with distinct global/shard indices', () => {
  const report = verifyAnchoredMemo(fresh(), root, policy, rust);
  assert.equal(report.valid, true);
  assert.equal(report.decision.status, 'Matched');
  assert.equal(report.log_index, '3418197865');
  assert.notEqual(report.log_index, report.proof_log_index);
});
test('MMR proof tamper passes Rekor layer but fails native durable verification', () => {
  const b = fresh();
  b.durable_export.steps.push({ kind: 'node', direction: 'right', hash: Array(32).fill(0) });
  assert.equal(verifyMemoAnchor(b, root, policy).valid, true);
  assert.throws(() => verifyAnchoredMemo(b, root, policy, rust), /Rust durable verification failed/);
});
test('package byte corruption passes Rekor layer but fails native verification', () => {
  const b = fresh(); b.durable_export.package_bytes[0] ^= 1;
  assert.equal(verifyMemoAnchor(b, root, policy).valid, true);
  assert.throws(() => verifyAnchoredMemo(b, root, policy, rust), /Rust durable verification failed/);
});
for (const [name, mutate] of [
  ['inclusion hash', b => { entry(b).inclusionProof.hashes[0] = flip(entry(b).inclusionProof.hashes[0]); }],
  ['signed checkpoint signature', b => { const p = entry(b).inclusionProof; const i = p.checkpoint.envelope.lastIndexOf(' '); p.checkpoint.envelope = p.checkpoint.envelope.slice(0, i + 1) + flip(p.checkpoint.envelope.slice(i + 1).trim()) + '\n'; }],
  ['SET', b => { entry(b).inclusionPromise.signedEntryTimestamp = flip(entry(b).inclusionPromise.signedEntryTimestamp); }],
  ['global index', b => { entry(b).logIndex = String(Number(entry(b).logIndex) + 1); }],
  ['shard index', b => { entry(b).inclusionProof.logIndex = String(Number(entry(b).inclusionProof.logIndex) + 1); }],
  ['integrated time', b => { entry(b).integratedTime = String(Number(entry(b).integratedTime) + 1); }],
  ['log ID', b => { entry(b).logId.keyId = flip(entry(b).logId.keyId); }],
  ['canonical body', b => { entry(b).canonicalizedBody = flip(entry(b).canonicalizedBody); }],
  ['proof removal despite valid SET', b => { delete entry(b).inclusionProof; }],
  ['SET removal despite valid proof', b => { delete entry(b).inclusionPromise; }],
  ['proof tree size metadata', b => { entry(b).inclusionProof.treeSize = String(Number(entry(b).inclusionProof.treeSize) + 1); }],
  ['proof root metadata', b => { entry(b).inclusionProof.rootHash = flip(entry(b).inclusionProof.rootHash); }],
  ['artifact signature', b => { b.sigstore_bundle.messageSignature.signature = flip(b.sigstore_bundle.messageSignature.signature); }],
]) test(`Rekor layer rejects changed ${name}`, () => {
  const b = fresh(); mutate(b);
  assert.throws(() => verifyAnchoredMemo(b, root, policy, rust));
});
test('external commitment is required even when attacker changes local checkpoint policy pin', () => {
  const b = fresh(); b.durable_export.graph.root[0] ^= 1;
  assert.throws(() => verifyMemoAnchor(b, root, policy), /checkpoint commitment/);
  // Changing the policy commitment does not repair the actual signed artifact.
  assert.throws(() => verifyMemoAnchor(b, root, { ...policy, checkpointSha256: sha256(checkpointBytes(b.durable_export.graph)) }), /artifact digest mismatch/);
});
test('root replacement, removed authority, changed signer and invalid time window reject', () => {
  assert.throws(() => verifyMemoAnchor(fresh(), Buffer.from('{}'), policy), /root digest/);
  const removed = JSON.parse(root); removed.tlogs = [];
  const bytes = Buffer.from(JSON.stringify(removed));
  assert.throws(() => verifyMemoAnchor(fresh(), bytes, { ...policy, trustedRootSha256: sha256(bytes) }), /not independently trusted/);
  assert.throws(() => verifyMemoAnchor(fresh(), root, { ...policy, signerSpkiSha256: '0'.repeat(64) }), /signer public key/);
  assert.throws(() => verifyMemoAnchor(fresh(), root, { ...policy, latestSigningTime: policy.earliestSigningTime }), /time outside/);
});
test('CLI performs complete verification without sockets', () => {
  const path = name => fileURLToPath(new URL(`./fixtures/memo-rekor/${name}`, import.meta.url));
  const result = spawnSync(process.execPath, ['--import', new URL('./deny-network.mjs', import.meta.url).href,
    fileURLToPath(new URL('../memo-rekor-cli.mjs', import.meta.url)), 'verify', path('bundle.json'), path('trusted_root.json'), path('policy.json'), rust],
  { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision.status, 'Matched');
});
