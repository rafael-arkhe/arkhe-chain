import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sha256, verifySigstoreBlob } from '../verify.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const artifact = fixture('artifact.txt');
const root = fixture('trusted-root.public.json');
const originalBundle = JSON.parse(fixture('message.sigstore.json'));
const originalPolicy = JSON.parse(fixture('policy.public.json'));
const bundle = () => structuredClone(originalBundle);
const policy = () => structuredClone(originalPolicy);

test('real Fulcio certificate, CT SCT, TSA timestamp and Rekor v2 proof verify offline', () => {
  const report = verifySigstoreBlob(artifact, bundle(), root, policy());
  assert.equal(report.valid, true);
  assert.equal(report.certificate_identity, 'brian@dehamer.com');
  assert.equal(report.rekor_entries[0].tree_size, '547662');
  assert.ok(report.checks.includes('fulcio_certificate_chain'));
  assert.ok(report.checks.includes('rekor_merkle_inclusion'));
});

test('rejects changed artifact and changed declared message digest', () => {
  assert.throws(() => verifySigstoreBlob(Buffer.from('hello, attacker!'), bundle(), root, policy()), /digest mismatch/);
  const bad = bundle(); bad.messageSignature.messageDigest.digest = Buffer.alloc(32).toString('base64');
  assert.throws(() => verifySigstoreBlob(artifact, bad, root, policy()), /digest mismatch/);
});

test('identity is exact, never a regular expression; issuer is mandatory and exact', () => {
  for (const identity of ['.*', 'brian@dehamer.com.attacker', 'brian@dehamerXcom']) {
    assert.throws(() => verifySigstoreBlob(artifact, bundle(), root, { ...policy(), certificateIdentity: identity }), /identity mismatch/);
  }
  assert.throws(() => verifySigstoreBlob(artifact, bundle(), root, { ...policy(), certificateOidcIssuer: 'https://attacker.example' }));
  const missing = policy(); delete missing.certificateOidcIssuer;
  assert.throws(() => verifySigstoreBlob(artifact, bundle(), root, missing), /missing policy/);
});

test('rejects root replacement, empty trust, untrusted Fulcio CA and wrong CT log', () => {
  assert.throws(() => verifySigstoreBlob(artifact, bundle(), Buffer.from('{}'), policy()), /root digest mismatch/);
  for (const mutate of [
    (r) => { r.certificateAuthorities = []; },
    (r) => { r.certificateAuthorities = r.certificateAuthorities.slice(0, 1); },
    (r) => { r.ctlogs = r.ctlogs.map((log) => ({ ...log, logId: { keyId: Buffer.alloc(32).toString('base64') } })); },
  ]) {
    const changed = JSON.parse(root); mutate(changed);
    const bytes = Buffer.from(JSON.stringify(changed));
    assert.throws(() => verifySigstoreBlob(artifact, bundle(), bytes, { ...policy(), trustedRootSha256: sha256(bytes) }));
  }
});

test('rejects altered certificate, artifact signature and RFC3161 timestamp', () => {
  for (const mutate of [
    (b) => { const cert = Buffer.from(b.verificationMaterial.certificate.rawBytes, 'base64'); cert[cert.length - 1] ^= 1; b.verificationMaterial.certificate.rawBytes = cert.toString('base64'); },
    (b) => { b.messageSignature.signature = Buffer.alloc(72).toString('base64'); },
    (b) => { const timestamp = b.verificationMaterial.timestampVerificationData.rfc3161Timestamps[0]; const raw = Buffer.from(timestamp.signedTimestamp, 'base64'); raw[raw.length-1] ^= 1; timestamp.signedTimestamp = raw.toString('base64'); },
  ]) {
    const changed = bundle(); mutate(changed);
    assert.throws(() => verifySigstoreBlob(artifact, changed, root, policy()));
  }
});

test('requires inclusion proof: no promise-only or missing log/timestamp shortcuts', () => {
  for (const mutate of [
    (b) => { b.verificationMaterial.tlogEntries = []; },
    (b) => { delete b.verificationMaterial.tlogEntries[0].inclusionProof; },
    (b) => { delete b.verificationMaterial.tlogEntries[0].inclusionProof.checkpoint; },
    (b) => { delete b.verificationMaterial.timestampVerificationData; },
  ]) {
    const changed = bundle(); mutate(changed);
    assert.throws(() => verifySigstoreBlob(artifact, changed, root, policy()));
  }
});

test('rejects Rekor body, proof, index, checkpoint and log-key substitution', () => {
  for (const mutate of [
    (entry) => { entry.canonicalizedBody = Buffer.from('{}').toString('base64'); },
    (entry) => { entry.inclusionProof.hashes[0] = Buffer.alloc(32).toString('base64'); },
    (entry) => { entry.inclusionProof.logIndex = '0'; },
    (entry) => { entry.logIndex = '0'; },
    (entry) => { entry.inclusionProof.checkpoint.envelope = entry.inclusionProof.checkpoint.envelope.replace('547662', '547663'); },
    (entry) => { entry.logId.keyId = Buffer.alloc(32).toString('base64'); },
  ]) {
    const changed = bundle(); mutate(changed.verificationMaterial.tlogEntries[0]);
    assert.throws(() => verifySigstoreBlob(artifact, changed, root, policy()));
  }
});

test('rejects signing time outside retained policy, malformed bounds and unknown policy fields', () => {
  for (const changed of [
    { ...policy(), earliestSigningTime: 1765756800, latestSigningTime: 1765843200 },
    { ...policy(), earliestSigningTime: -1 },
    { ...policy(), latestSigningTime: 0 },
    { ...policy(), ignoreTlog: true },
  ]) assert.throws(() => verifySigstoreBlob(artifact, bundle(), root, changed));
});

test('does not accept a raw key, DSSE or the custom Stage 10 laboratory bundle', () => {
  const publicKey = bundle(); delete publicKey.verificationMaterial.certificate;
  publicKey.verificationMaterial.publicKey = { hint: 'attacker-key' };
  assert.throws(() => verifySigstoreBlob(artifact, publicKey, root, policy()));
  const dsse = bundle(); delete dsse.messageSignature; dsse.dsseEnvelope = {};
  assert.throws(() => verifySigstoreBlob(artifact, dsse, root, policy()), /messageSignature/);
  assert.throws(() => verifySigstoreBlob(artifact, { statement: {} }, root, policy()), /messageSignature/);
});

test('rejects duplicated log entries instead of counting the same proof twice', () => {
  const changed = bundle();
  changed.verificationMaterial.tlogEntries.push(structuredClone(changed.verificationMaterial.tlogEntries[0]));
  assert.throws(() => verifySigstoreBlob(artifact, changed, root, policy()), /duplicate Rekor entry/);
});

test('CLI verifies the public artifact without network and exits nonzero without a success report on tampering', () => {
  const cli = new URL('../cli.mjs', import.meta.url);
  const fixtures = new URL('./fixtures/', import.meta.url);
  const args = ['verify-blob', fileURLToPath(new URL('artifact.txt', fixtures)),
    '--bundle', fileURLToPath(new URL('message.sigstore.json', fixtures)),
    '--trusted-root', fileURLToPath(new URL('trusted-root.public.json', fixtures)),
    '--policy', fileURLToPath(new URL('policy.public.json', fixtures))];
  const prefix = ['--import', new URL('./deny-network.mjs', import.meta.url).href, fileURLToPath(cli)];
  const result = spawnSync(process.execPath, [...prefix, ...args], { encoding: 'utf8', timeout: 30000,
    env: { ...process.env, HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).valid, true);
  const temporary = mkdtempSync(join(tmpdir(), 'arkhe-sigstore-'));
  try {
    const changed = join(temporary, 'changed.bin'); writeFileSync(changed, 'changed');
    args[1] = changed;
    const rejected = spawnSync(process.execPath, [...prefix, ...args], { encoding: 'utf8', timeout: 30000 });
    assert.equal(rejected.status, 1);
    assert.equal(rejected.stdout, '');
    assert.match(rejected.stderr, /digest mismatch/);
  } finally { unlinkSync(join(temporary, 'changed.bin')); rmdirSync(temporary); }
});
