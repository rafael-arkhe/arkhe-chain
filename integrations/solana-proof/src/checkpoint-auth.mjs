import { sign, verify, createPublicKey } from 'node:crypto';
import { canonicalBytes } from './audit-journal.mjs';
import { hash } from './proof.mjs';
const HEX = /^[0-9a-f]{64}$/;
export const keyId = publicKey => hash((publicKey.type === 'public' ? publicKey : createPublicKey(publicKey)).export({ type: 'spki', format: 'der' }));
function payloadBytes(payload) {
  if (payload.schema !== 'arkhe-signed-checkpoint/v1' || payload.profile !== 'arkhe-mmr-v1-blake3' || !HEX.test(payload.rootHex) || !HEX.test(payload.kid)) throw Error('invalid checkpoint identity');
  for (const key of ['network', 'mint', 'logId']) if (typeof payload[key] !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(payload[key])) throw Error('invalid checkpoint scope');
  for (const key of ['sequence', 'leafCount', 'issuedAt', 'expiresAt']) if (!Number.isSafeInteger(payload[key]) || payload[key] < 0) throw Error('invalid checkpoint number');
  if (payload.leafCount < 1 || payload.leafCount > 10000 || payload.expiresAt <= payload.issuedAt || payload.expiresAt - payload.issuedAt > 3600 || (payload.previousDigest !== null && !HEX.test(payload.previousDigest))) throw Error('invalid checkpoint bounds');
  return Buffer.concat([Buffer.from('ARKHE:SIGNED-CHECKPOINT:v1\0'), canonicalBytes(payload)]);
}
export function signCheckpoint(payload, privateKey) {
  const signed = { ...payload, schema: 'arkhe-signed-checkpoint/v1', profile: 'arkhe-mmr-v1-blake3', kid: keyId(privateKey) };
  return { payload: signed, signature: sign(null, payloadBytes(signed), privateKey).toString('base64') };
}
export function checkpointDigest(envelope) { return hash(canonicalBytes(envelope)); }
export function verifyCheckpoint(envelope, trustedPublicKeys, context) {
  try {
    const p = envelope.payload;
    const bytes = payloadBytes(p);
    for (const key of ['network', 'mint', 'logId']) if (p[key] !== context[key]) return false;
    if (p.issuedAt > context.now || p.expiresAt <= context.now || p.sequence !== context.nextSequence || p.previousDigest !== context.previousDigest || p.leafCount < context.minimumLeafCount) return false;
    const key = trustedPublicKeys.find(k => keyId(k) === p.kid);
    if (!key || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) return false;
    return verify(null, bytes, key, Buffer.from(envelope.signature, 'base64'));
  } catch { return false; }
}
