import { readFileSync, writeFileSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { initTUF } from '@sigstore/tuf';
import { PROFILE, sha256, checkpointBytes, verifyAnchoredMemo } from './memo-rekor.mjs';

const base = 'https://rekor.sigstore.dev';
const json = (x) => JSON.stringify(x, null, 2);
function read(path, max) {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(max + 1);
    let n = 0, got;
    while (n < buffer.length && (got = readSync(fd, buffer, n, buffer.length - n, null))) n += got;
    if (n > max) throw new Error('file exceeds limit');
    return buffer.subarray(0, n);
  } finally { closeSync(fd); }
}
async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'ArkheMemoCheckpoint/0.1', ...options.headers } });
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length; if (size > 1_048_576) throw new Error('Rekor response exceeds limit');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  if (!response.ok) throw new Error(`Rekor HTTP ${response.status}: ${raw.toString().slice(0, 500)}`);
  return { raw, data: JSON.parse(raw) };
}
function makeBundle(entry, hint, digest, signature) {
  const p = entry.verification.inclusionProof;
  const hex64 = x => { if (!/^[0-9a-f]{64}$/.test(x)) throw new Error('bad Rekor hash'); return Buffer.from(x, 'hex').toString('base64'); };
  return { mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
    messageSignature: { messageDigest: { algorithm: 'SHA2_256', digest: Buffer.from(digest, 'hex').toString('base64') }, signature },
    verificationMaterial: { publicKey: { hint }, tlogEntries: [{ logIndex: String(entry.logIndex),
      logId: { keyId: hex64(entry.logID) }, kindVersion: { kind: 'hashedrekord', version: '0.0.1' },
      integratedTime: String(entry.integratedTime), canonicalizedBody: entry.body,
      inclusionPromise: { signedEntryTimestamp: entry.verification.signedEntryTimestamp },
      inclusionProof: { logIndex: String(p.logIndex), treeSize: String(p.treeSize), rootHash: hex64(p.rootHash),
        hashes: p.hashes.map(hex64), checkpoint: { envelope: p.checkpoint } } }] } };
}
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'verify' && args.length === 5) {
    const [_, bundle, root, policy, rust] = args;
    console.log(json(verifyAnchoredMemo(JSON.parse(read(bundle, 100_000_000)), read(root, 1_048_576), JSON.parse(read(policy, 16384)), resolve(rust))));
    return;
  }
  if (args[0] !== 'anchor' || args.length !== 4) throw new Error('usage: anchor EXPORT NEW_DIRECTORY RUST_VERIFIER | verify BUNDLE ROOT POLICY RUST_VERIFIER');
  const [_, input, output, rust] = args;
  const dir = resolve(output), rustPath = resolve(rust);
  const exported = JSON.parse(read(input, 100_000_000));
  const artifact = checkpointBytes(exported.graph);
  mkdirSync(dir); // Refuse overwrite, retain failed attempts for inspection.
  const put = (name, value) => writeFileSync(join(dir, name), value, { flag: 'wx' });
  put('export.json', json(exported)); put('graph-trust.json', json(exported.graph));
  const preflight = spawnSync(rustPath, ['verify', join(dir, 'export.json'), join(dir, 'graph-trust.json')],
    { encoding: 'utf8', shell: false, timeout: 30_000, maxBuffer: 1_048_576 });
  if (preflight.status !== 0 || preflight.error) throw new Error(`invalid durable export: ${preflight.error?.message ?? preflight.stderr}`);
  // Start with the independent bootstrap root embedded in the pinned official
  // TUF client. Refresh verifies rotations, signatures, rollback and expiration.
  const tuf = await initTUF({ cachePath: join(dir, 'tuf-cache'), timeout: 15_000, retry: { retries: 1 } });
  const rootBytes = Buffer.from(await tuf.getTarget('trusted_root.json'));
  put('trusted_root.json', rootBytes);
  put('checkpoint.json', artifact);
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const hint = sha256(publicKey.export({ type: 'spki', format: 'der' }));
  const digest = sha256(artifact), signature = sign('sha256', artifact, privateKey).toString('base64');
  const now = Math.floor(Date.now() / 1000);
  const policy = { profile: PROFILE, trustedRootSha256: sha256(rootBytes), checkpointSha256: digest,
    signerSpkiSha256: hint, earliestSigningTime: now - 300, latestSigningTime: now + 3600 };
  put('policy.json', json(policy));
  const proposed = { apiVersion: '0.0.1', kind: 'hashedrekord', spec: {
    data: { hash: { algorithm: 'sha256', value: digest } },
    signature: { content: signature, publicKey: { content: Buffer.from(pem).toString('base64') } } } };
  put('submission.json', json(proposed));
  // Only the digest, detached signature and ephemeral PUBLIC key leave the host.
  // No invoice, raw RPC response, tenant identifier or private key is submitted.
  const created = await request('/api/v1/log/entries', { method: 'POST', body: JSON.stringify(proposed) });
  put('rekor-create-response.json', created.raw);
  const uuids = Object.keys(created.data);
  if (uuids.length !== 1 || !/^[0-9a-f]{64,100}$/.test(uuids[0])) throw new Error('unexpected Rekor entry identifier');
  const uuid = uuids[0]; let entry = created.data[uuid];
  for (let i = 0; !entry.verification?.inclusionProof?.checkpoint && i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const result = await request(`/api/v1/log/entries/${uuid}`);
    put(`rekor-read-${i}.json`, result.raw); entry = result.data[uuid];
  }
  if (!entry.verification?.inclusionProof?.checkpoint) throw new Error('entry submitted but inclusion proof not ready; retain receipt and fetch later');
  const anchor = { profile: PROFILE, durable_export: exported, signer_public_key: pem,
    sigstore_bundle: makeBundle(entry, hint, digest, signature) };
  put('bundle.json', json(anchor));
  const report = verifyAnchoredMemo(anchor, rootBytes, policy, rustPath);
  put('report.json', json({ ...report, entry_url: `${base}/api/v1/log/entries/${uuid}`, tuf_client: '@sigstore/tuf@4.0.2',
    trust_bootstrap: 'official client embedded root; fresh cache and authenticated refresh', private_key_persisted: false }));
  console.log(json(report));
}
main().catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1; });
