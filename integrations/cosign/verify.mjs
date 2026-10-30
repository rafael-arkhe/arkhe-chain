import { createHash } from 'node:crypto';
import { bundleFromJSON } from '@sigstore/bundle';
import { TrustedRoot } from '@sigstore/protobuf-specs';
import { Verifier, toSignedEntity, toTrustMaterial } from '@sigstore/verify';

export const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function validatePolicy(policy) {
  const fields = ['certificateIdentity', 'certificateOidcIssuer', 'trustedRootSha256', 'earliestSigningTime', 'latestSigningTime'];
  requireCondition(policy && typeof policy === 'object' && !Array.isArray(policy), 'identity policy required');
  requireCondition(Object.keys(policy).length === fields.length && fields.every((key) => Object.hasOwn(policy, key)), 'unsupported or missing policy fields');
  for (const key of ['certificateIdentity', 'certificateOidcIssuer']) {
    requireCondition(typeof policy[key] === 'string' && policy[key].length > 0 && policy[key].length <= 2048, `exact ${key} required`);
  }
  requireCondition(/^[0-9a-f]{64}$/.test(policy.trustedRootSha256), 'trusted root SHA-256 required');
  requireCondition(Number.isSafeInteger(policy.earliestSigningTime) && Number.isSafeInteger(policy.latestSigningTime)
    && policy.earliestSigningTime >= 0 && policy.latestSigningTime >= policy.earliestSigningTime
    && policy.latestSigningTime <= 8640000000000, 'invalid signing time bounds');
}

/** Pure, offline verification: no discovery, TUF refresh, network or ambient clock. */
export function verifySigstoreBlob(artifact, bundleJSON, trustedRootBytes, policy) {
  validatePolicy(policy);
  requireCondition(Buffer.isBuffer(artifact) && artifact.length <= MAX_ARTIFACT_BYTES, 'artifact exceeds profile size limit');
  requireCondition(Buffer.isBuffer(trustedRootBytes) && trustedRootBytes.length <= 1024 * 1024, 'trusted root exceeds size limit');
  requireCondition(sha256(trustedRootBytes) === policy.trustedRootSha256, 'trusted root digest mismatch');
  requireCondition(bundleJSON?.messageSignature && !bundleJSON.dsseEnvelope, 'only Sigstore messageSignature bundles are supported; DSSE requires a separate subject policy');
  const bundle = bundleFromJSON(bundleJSON);
  requireCondition(bundle.content.$case === 'messageSignature', 'message signature required');
  requireCondition(['certificate', 'x509CertificateChain'].includes(bundle.verificationMaterial.content.$case), 'Fulcio signing certificate required; public-key bundles are not accepted');
  const message = bundle.content.messageSignature;
  const digest = message.messageDigest;
  // protobuf-specs uses enum 1 for SHA2_256. Bind the declared digest too, as
  // verifying only the detached signature need not validate this JSON field.
  requireCondition(digest?.algorithm === 1 && Buffer.from(digest.digest).toString('hex') === sha256(artifact), 'artifact/message digest mismatch');
  const entries = bundle.verificationMaterial.tlogEntries;
  requireCondition(entries.length >= 1 && entries.length <= 8, 'one to eight Rekor entries required');
  for (const entry of entries) {
    requireCondition(entry.inclusionProof?.checkpoint?.envelope && entry.inclusionProof.hashes.length <= 64,
      'Rekor inclusion proof and signed checkpoint required; inclusion promise alone is insufficient');
    requireCondition(/^(0|[1-9][0-9]*)$/.test(entry.logIndex) && entry.logIndex === entry.inclusionProof.logIndex,
      'Rekor entry index and inclusion proof index must match');
  }
  const root = TrustedRoot.fromJSON(JSON.parse(trustedRootBytes.toString('utf8')));
  requireCondition(root.certificateAuthorities.length > 0 && root.ctlogs.length > 0 && root.tlogs.length > 0,
    'Fulcio, CT and Rekor trust authorities required');
  const entity = toSignedEntity(bundle, artifact);
  // Compare identity literally after cryptographic verification. The library's
  // SAN policy supports regular expressions, which this adapter never accepts.
  let signer;
  const entryIDs = new Set();
  for (const entry of entries) {
    const id = Buffer.from(entry.logId.keyId).toString('hex');
    const entryID = `${id}:${entry.logIndex}`;
    requireCondition(!entryIDs.has(entryID), 'duplicate Rekor entry');
    entryIDs.add(entryID);
    // A checkpoint can be valid even if an unrelated, unused JSON logId was
    // changed. Restrict each verification to the authority named by this entry.
    const authorities = root.tlogs.filter((log) => Buffer.from(log.logId?.keyId ?? []).toString('hex') === id);
    requireCondition(authorities.length > 0, 'Rekor log ID is not trusted');
    const verifier = new Verifier(toTrustMaterial({ ...root, tlogs: authorities }), {
      ctlogThreshold: 1, tlogThreshold: 1, timestampThreshold: 1,
    });
    signer = verifier.verify({ ...entity, tlogEntries: [entry],
      timestamps: entity.timestamps.filter((timestamp) => timestamp.$case === 'timestamp-authority' || timestamp.tlogEntry === entry),
    }, { extensions: { issuer: policy.certificateOidcIssuer } });
  }
  requireCondition(signer.identity?.subjectAlternativeName === policy.certificateIdentity, 'certificate identity mismatch');
  requireCondition(signer.identity?.extensions?.issuer === policy.certificateOidcIssuer, 'certificate OIDC issuer mismatch');
  const signingTimes = entity.timestamps.map((timestamp) => timestamp.$case === 'timestamp-authority'
    ? timestamp.timestamp.signingTime.getTime() / 1000
    : Number(timestamp.tlogEntry.integratedTime));
  requireCondition(signingTimes.length > 0 && signingTimes.every((time) => Number.isFinite(time)
    && time >= policy.earliestSigningTime && time <= policy.latestSigningTime), 'authenticated signing time outside policy bounds');
  return {
    valid: true,
    profile: 'arkhe-sigstore-message@1',
    artifact_sha256: sha256(artifact),
    trusted_root_sha256: policy.trustedRootSha256,
    certificate_identity: signer.identity.subjectAlternativeName,
    certificate_oidc_issuer: signer.identity.extensions.issuer,
    signing_times: signingTimes,
    rekor_entries: entries.map((entry) => ({ log_id: Buffer.from(entry.logId.keyId).toString('hex'),
      log_index: entry.logIndex, tree_size: entry.inclusionProof.treeSize })),
    checks: ['artifact_signature', 'fulcio_certificate_chain', 'exact_identity_and_issuer',
      'certificate_valid_at_authenticated_time', 'ct_sct', 'rekor_entry_binding', 'rekor_signed_checkpoint', 'rekor_merkle_inclusion'],
  };
}
