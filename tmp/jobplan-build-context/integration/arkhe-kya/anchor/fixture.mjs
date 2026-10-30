// LOCAL TEST LOG ONLY. No network or real log/witness keys.
import { generateKeyPairSync, sign } from 'node:crypto';
import { ANCHOR_PROFILE, commitmentBytes } from './rekor.mjs';
import { sha256 } from './witness.mjs';
const b64 = bytes => Buffer.from(bytes).toString('base64');
const canon = value => {
  if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canon(value[k])).join(',') + '}';
  return JSON.stringify(value);
};
export function fixture(rootHex, leafCount) {
  const signer = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const log = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = key => key.export({ type: 'spki', format: 'der' });
  const signerPem = signer.publicKey.export({ type: 'spki', format: 'pem' });
  const hint = sha256(spki(signer.publicKey));
  const logID = sha256(spki(log.publicKey));
  const checkpoint = { profile: 'arkhe-kya-experimental@1', label: 'synthetic-poc', mmr_root: rootHex, leaf_count: leafCount };
  const artifact = commitmentBytes(checkpoint);
  const signature = b64(sign('sha256', artifact, signer.privateKey));
  const body = Buffer.from(canon({ apiVersion: '0.0.1', kind: 'hashedrekord', spec: {
    data: { hash: { algorithm: 'sha256', value: sha256(artifact) } },
    signature: { content: signature, publicKey: { content: b64(signerPem) } },
  } }));
  const logRoot = Buffer.from(sha256(Buffer.concat([Buffer.from([0]), body])), 'hex');
  const cpBody = `rekor.example.test/log\n1\n${b64(logRoot)}\n`;
  const logSignature = Buffer.concat([Buffer.from(logID, 'hex').subarray(0,4), sign('sha256', Buffer.from(cpBody), log.privateKey)]);
  const envelope = cpBody + `\n— rekor.example.test ${b64(logSignature)}\n`;
  const set = sign('sha256', Buffer.from(canon({ body: b64(body), integratedTime: 1100, logID, logIndex: 0 })), log.privateKey);
  const rootBytes = Buffer.from(JSON.stringify({ mediaType: 'application/vnd.dev.sigstore.trustedroot+json;version=0.1', tlogs: [{
    baseUrl: 'https://rekor.example.test', hashAlgorithm: 'SHA2_256',
    publicKey: { rawBytes: b64(spki(log.publicKey)), keyDetails: 'PKIX_ECDSA_P256_SHA_256', validFor: { start: '1970-01-01T00:00:00Z' } },
    logId: { keyId: b64(Buffer.from(logID, 'hex')) },
  }] }));
  const anchor = { profile: ANCHOR_PROFILE, checkpoint, signer_public_key: signerPem,
    sigstore_bundle: { mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
      messageSignature: { messageDigest: { algorithm: 'SHA2_256', digest: b64(Buffer.from(sha256(artifact), 'hex')) }, signature },
      verificationMaterial: { publicKey: { hint }, tlogEntries: [{ logIndex: '0', logId: { keyId: b64(Buffer.from(logID, 'hex')) },
        kindVersion: { kind: 'hashedrekord', version: '0.0.1' }, integratedTime: '1100', canonicalizedBody: b64(body),
        inclusionPromise: { signedEntryTimestamp: b64(set) },
        inclusionProof: { logIndex: '0', treeSize: '1', rootHash: b64(logRoot), hashes: [], checkpoint: { envelope } },
      }] },
    },
  };
  const policy = { trustedRootSha256: sha256(rootBytes), signerSpkiSha256: hint,
    logBaseUrl: 'https://rekor.example.test', earliestSigningTime: 1000, latestSigningTime: 1200 };
  const witnesses = [], lines = [];
  for (let index = 0; index < 3; index++) {
    const key = generateKeyPairSync('ed25519');
    const name = `witness-${index}.example.test`;
    const raw = Buffer.from(key.publicKey.export({ format: 'jwk' }).x, 'base64url');
    const id = Buffer.from(sha256(Buffer.concat([Buffer.from(name + '\n'), Buffer.from([4]), raw])), 'hex').subarray(0,4);
    const time = Buffer.alloc(8); time.writeBigUInt64BE(1120n);
    const sig = sign(null, Buffer.from(`cosignature/v1\ntime 1120\n${cpBody}`), key.privateKey);
    witnesses.push({ name, publicKeyPem: key.publicKey.export({ type: 'spki', format: 'pem' }) });
    lines.push(`— ${name} ${b64(Buffer.concat([id, time, sig]))}\n`);
  }
  return { anchor, rootBytes, policy, note: envelope + lines.join(''), lines,
    witnessPolicy: { origin: 'rekor.example.test/log', quorum: 2, now: 1150, maxAgeSeconds: 300, witnesses } };
}
