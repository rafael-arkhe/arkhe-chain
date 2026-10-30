import { createPublicKey } from 'node:crypto';
import { createRequire } from 'node:module';
import { check, fields, sha256, checkpointBody } from './witness.mjs';

// Reuse the already installed/pinned official Sigstore SDK, not a new verifier.
const require = createRequire(new URL('../package.json', import.meta.url));
const { bundleFromJSON } = require('@sigstore/bundle');
const { TrustedRoot } = require('@sigstore/protobuf-specs');
const { Verifier, toSignedEntity, toTrustMaterial } = require('@sigstore/verify');
export const ANCHOR_PROFILE = 'arkhe-kya-rekor-experimental@1';

export function commitmentBytes(checkpoint) {
  fields(checkpoint, ['profile', 'label', 'mmr_root', 'leaf_count']);
  check(checkpoint.profile === 'arkhe-kya-experimental@1' && checkpoint.label === 'synthetic-poc' &&
    /^[0-9a-f]{64}$/.test(checkpoint.mmr_root) && Number.isSafeInteger(checkpoint.leaf_count) &&
    checkpoint.leaf_count >= 1 && checkpoint.leaf_count <= 1_000_000, 'KYA_COMMITMENT_INVALID');
  return Buffer.from(JSON.stringify(['ARKHE:KYA:ANCHOR:v1', checkpoint.profile, checkpoint.label, checkpoint.mmr_root, checkpoint.leaf_count]));
}

export function verifyRekorAnchor(anchor, rootBytes, policy) {
  fields(anchor, ['profile', 'checkpoint', 'signer_public_key', 'sigstore_bundle']);
  check(anchor.profile === ANCHOR_PROFILE, 'ANCHOR_PROFILE_INVALID');
  check(Buffer.byteLength(JSON.stringify(anchor)) <= 1024 * 1024, 'ANCHOR_TOO_LARGE');
  fields(policy, ['trustedRootSha256', 'signerSpkiSha256', 'logBaseUrl', 'earliestSigningTime', 'latestSigningTime']);
  for (const pin of [policy.trustedRootSha256, policy.signerSpkiSha256]) check(/^[0-9a-f]{64}$/.test(pin), 'TRUST_PIN_INVALID');
  check(Number.isSafeInteger(policy.earliestSigningTime) && Number.isSafeInteger(policy.latestSigningTime) &&
    policy.earliestSigningTime >= 0 && policy.latestSigningTime >= policy.earliestSigningTime &&
    policy.latestSigningTime <= 8640000000000, 'SIGNING_WINDOW_INVALID');
  const base = new URL(policy.logBaseUrl);
  check(base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash, 'LOG_URL_INVALID');
  check(Buffer.isBuffer(rootBytes) && rootBytes.length <= 1024 * 1024 && sha256(rootBytes) === policy.trustedRootSha256, 'TRUST_ROOT_MISMATCH');
  const artifact = commitmentBytes(anchor.checkpoint);
  check(typeof anchor.signer_public_key === 'string' && anchor.signer_public_key.length <= 4096, 'SIGNER_INVALID');
  const key = createPublicKey(anchor.signer_public_key);
  check(key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails.namedCurve === 'prime256v1', 'SIGNER_ALGORITHM_INVALID');
  const der = key.export({ type: 'spki', format: 'der' });
  check(sha256(der) === policy.signerSpkiSha256, 'SIGNER_PIN_MISMATCH');
  const json = anchor.sigstore_bundle;
  check(json?.messageSignature && !json.dsseEnvelope && json.verificationMaterial?.publicKey, 'PUBLIC_KEY_BUNDLE_REQUIRED');
  const bundle = bundleFromJSON(json);
  check(bundle.content.$case === 'messageSignature' && bundle.verificationMaterial.content.$case === 'publicKey' &&
    bundle.verificationMaterial.content.publicKey.hint === policy.signerSpkiSha256, 'SIGNER_HINT_INVALID');
  const message = bundle.content.messageSignature;
  check(message.messageDigest.algorithm === 1 && Buffer.from(message.messageDigest.digest).toString('hex') === sha256(artifact), 'COMMITMENT_DIGEST_MISMATCH');
  const entries = bundle.verificationMaterial.tlogEntries;
  check(entries.length === 1 && !bundle.verificationMaterial.timestampVerificationData, 'SINGLE_REKOR_V1_ENTRY_REQUIRED');
  const entry = entries[0];
  check(entry.kindVersion.kind === 'hashedrekord' && entry.kindVersion.version === '0.0.1' &&
    entry.inclusionPromise?.signedEntryTimestamp?.length && entry.inclusionProof?.checkpoint?.envelope, 'REKOR_V1_PROOF_REQUIRED');
  const p = entry.inclusionProof;
  for (const value of [entry.logIndex, p.logIndex, p.treeSize, entry.integratedTime]) check(/^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER), 'LOG_INTEGER_INVALID');
  check(BigInt(p.treeSize) > BigInt(p.logIndex) && p.hashes.length <= 64 && p.hashes.every(h => h.length === 32), 'INCLUSION_BOUNDS_INVALID');
  const cp = checkpointBody(p.checkpoint.envelope);
  check(cp.size === p.treeSize && Buffer.from(cp.hash, 'base64').equals(p.rootHash), 'CHECKPOINT_METADATA_MISMATCH');
  const time = Number(entry.integratedTime);
  check(time >= policy.earliestSigningTime && time <= policy.latestSigningTime, 'INTEGRATED_TIME_INVALID');
  const root = TrustedRoot.fromJSON(JSON.parse(rootBytes));
  const logs = root.tlogs.filter(log => Buffer.from(log.logId?.keyId ?? []).equals(entry.logId.keyId) && log.baseUrl === policy.logBaseUrl);
  check(logs.length > 0, 'LOG_NOT_TRUSTED');
  const body = JSON.parse(entry.canonicalizedBody.toString('utf8'));
  const bodyKey = createPublicKey(Buffer.from(body.spec.signature.publicKey.content, 'base64'));
  check(bodyKey.export({ type: 'spki', format: 'der' }).equals(der), 'REKOR_BODY_SIGNER_MISMATCH');
  new Verifier(toTrustMaterial({ ...root, tlogs: logs }, {
    [policy.signerSpkiSha256]: { rawBytes: der },
  }), { tlogThreshold: 1, timestampThreshold: 1 }).verify(toSignedEntity(bundle, artifact));
  return { profile: ANCHOR_PROFILE, commitment_sha256: sha256(artifact), checkpoint_envelope: p.checkpoint.envelope,
    log_id: entry.logId.keyId.toString('hex'), tree_size: p.treeSize, integrated_time: time };
}
