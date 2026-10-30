// Separate public-key profile; the Fulcio verification policy is unchanged.
import { createHash, createPublicKey } from 'node:crypto';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bundleFromJSON } from '@sigstore/bundle';
import { TrustedRoot } from '@sigstore/protobuf-specs';
import { Verifier, toSignedEntity, toTrustMaterial } from '@sigstore/verify';

export const PROFILE = 'arkhe/memo-rekor/v1';
export const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const check = (v, message) => { if (!v) throw new Error(message); };
function fields(value, names) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every(k => Object.hasOwn(value, k)), 'unsupported or missing fields');
}
export function checkpointBytes(graph) {
  fields(graph, ['tenant_id', 'stream_id', 'root', 'leaf_count', 'profile_digest']);
  for (const k of ['tenant_id', 'stream_id']) check(typeof graph[k] === 'string' && graph[k].length > 0 && graph[k].length <= 1024, 'invalid graph identifier');
  check(Array.isArray(graph.root) && graph.root.length === 32 && graph.root.every(x => Number.isInteger(x) && x >= 0 && x <= 255), 'invalid graph root');
  check(Number.isSafeInteger(graph.leaf_count) && graph.leaf_count > 0 && graph.leaf_count <= 1_000_000, 'invalid graph count');
  check(/^[0-9a-f]{64}$/.test(graph.profile_digest), 'invalid graph profile');
  // Fixed ordered array, JSON UTF-8, no newline. Publish only its SHA-256.
  return Buffer.from(JSON.stringify(['arkhe/memo-graph-checkpoint/v1', graph.tenant_id,
    graph.stream_id, Buffer.from(graph.root).toString('hex'), graph.leaf_count, graph.profile_digest]));
}

/** Pure Sigstore check; root and policy arrive separately from the untrusted bundle. */
export function verifyMemoAnchor(anchor, rootBytes, policy) {
  fields(anchor, ['profile', 'durable_export', 'signer_public_key', 'sigstore_bundle']);
  check(anchor.profile === PROFILE, 'unsupported memo anchor profile');
  fields(policy, ['profile', 'trustedRootSha256', 'checkpointSha256', 'signerSpkiSha256', 'earliestSigningTime', 'latestSigningTime']);
  check(policy.profile === PROFILE, 'unsupported policy profile');
  for (const k of ['trustedRootSha256', 'checkpointSha256', 'signerSpkiSha256']) check(/^[0-9a-f]{64}$/.test(policy[k]), 'invalid external pin');
  check(Number.isSafeInteger(policy.earliestSigningTime) && Number.isSafeInteger(policy.latestSigningTime)
    && policy.earliestSigningTime >= 0 && policy.latestSigningTime >= policy.earliestSigningTime
    && policy.latestSigningTime <= 8640000000000, 'invalid signing window');
  check(Buffer.isBuffer(rootBytes) && rootBytes.length <= 1_048_576 && sha256(rootBytes) === policy.trustedRootSha256, 'trusted root digest mismatch');
  const artifact = checkpointBytes(anchor.durable_export.graph);
  check(sha256(artifact) === policy.checkpointSha256, 'checkpoint commitment differs from external policy');
  check(typeof anchor.signer_public_key === 'string' && anchor.signer_public_key.length <= 4096, 'invalid signer public key');
  const key = createPublicKey(anchor.signer_public_key);
  check(key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails.namedCurve === 'prime256v1', 'only P-256 signer supported');
  const der = key.export({ type: 'spki', format: 'der' });
  check(sha256(der) === policy.signerSpkiSha256, 'signer public key differs from external policy');
  const json = anchor.sigstore_bundle;
  check(json?.messageSignature && !json.dsseEnvelope && json.verificationMaterial?.publicKey, 'public-key messageSignature required');
  const bundle = bundleFromJSON(json);
  check(bundle.verificationMaterial.content.$case === 'publicKey' && bundle.content.$case === 'messageSignature', 'wrong bundle type');
  check(bundle.verificationMaterial.content.publicKey.hint === policy.signerSpkiSha256, 'wrong signer hint');
  const sig = bundle.content.messageSignature;
  check(sig.messageDigest.algorithm === 1 && Buffer.from(sig.messageDigest.digest).toString('hex') === sha256(artifact), 'artifact digest mismatch');
  const entries = bundle.verificationMaterial.tlogEntries;
  check(entries.length === 1 && !bundle.verificationMaterial.timestampVerificationData, 'one Rekor entry and no extra TSA data required');
  const entry = entries[0];
  check(entry.kindVersion.kind === 'hashedrekord' && entry.kindVersion.version === '0.0.1', 'only hashedrekord v0.0.1 supported');
  check(entry.inclusionPromise?.signedEntryTimestamp?.length && entry.inclusionProof?.checkpoint?.envelope, 'SET and inclusion proof both required');
  const p = entry.inclusionProof;
  for (const v of [entry.logIndex, p.logIndex, p.treeSize, entry.integratedTime]) check(/^(0|[1-9][0-9]*)$/.test(v) && BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER), 'unsafe log integer');
  // Rekor v1's outer logIndex is global across shards; proof.logIndex is shard-local.
  // Both are cryptographically checked by SET / signed checkpoint respectively.
  check(BigInt(p.treeSize) > BigInt(p.logIndex) && p.hashes.length <= 64 && p.hashes.every(h => h.length === 32), 'invalid inclusion bounds');
  const lines = p.checkpoint.envelope.split('\n');
  check(lines[1] === p.treeSize && Buffer.from(lines[2], 'base64').equals(p.rootHash) && p.rootHash.length === 32, 'proof/checkpoint metadata mismatch');
  const time = Number(entry.integratedTime);
  check(time >= policy.earliestSigningTime && time <= policy.latestSigningTime, 'integrated time outside policy window');
  const root = TrustedRoot.fromJSON(JSON.parse(rootBytes));
  const authorities = root.tlogs.filter(t => Buffer.from(t.logId?.keyId ?? []).equals(entry.logId.keyId)
    && t.baseUrl === 'https://rekor.sigstore.dev');
  check(authorities.length > 0, 'Rekor log ID is not independently trusted');
  const body = JSON.parse(entry.canonicalizedBody.toString('utf8'));
  const bodyKey = createPublicKey(Buffer.from(body.spec.signature.publicKey.content, 'base64'));
  check(bodyKey.export({ type: 'spki', format: 'der' }).equals(der), 'Rekor body signer mismatch');
  new Verifier(toTrustMaterial({ ...root, tlogs: authorities }, {
    [policy.signerSpkiSha256]: { rawBytes: der },
  }), { tlogThreshold: 1, timestampThreshold: 1 }).verify(toSignedEntity(bundle, artifact));
  return { valid: true, profile: PROFILE, checkpoint_sha256: sha256(artifact),
    log_id: entry.logId.keyId.toString('hex'), log_index: entry.logIndex,
    proof_log_index: p.logIndex, tree_size: p.treeSize, integrated_time: time };
}

/** Complete offline check: official Sigstore verifier followed by native Rust MMR + memo verification. */
export function verifyAnchoredMemo(anchor, rootBytes, policy, rustVerifier) {
  const report = verifyMemoAnchor(anchor, rootBytes, policy);
  const dir = mkdtempSync(join(tmpdir(), 'arkhe-memo-rekor-'));
  try {
    const exportPath = join(dir, 'export.json'), pinPath = join(dir, 'graph.json');
    writeFileSync(exportPath, JSON.stringify(anchor.durable_export));
    writeFileSync(pinPath, JSON.stringify(anchor.durable_export.graph));
    const result = spawnSync(rustVerifier, ['verify', exportPath, pinPath], { encoding: 'utf8', timeout: 30_000, maxBuffer: 1_048_576, shell: false });
    check(!result.error && result.status === 0, `Rust durable verification failed: ${result.error?.message ?? result.stderr?.trim()}`);
    return { ...report, decision: JSON.parse(result.stdout), checks: ['rekor_SET', 'rekor_signed_checkpoint', 'rekor_inclusion',
      'checkpoint_signature_and_commitment', 'durable_MMR', 'raw_memo', 'reconciliation_reexecution'] };
  } finally {
    // Delete only our two known files, without recursive or computed-tree removal.
    for (const name of ['export.json', 'graph.json']) {
      try { unlinkSync(join(dir, name)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    rmdirSync(dir);
  }
}
