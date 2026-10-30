import { createHash, createPublicKey, verify } from 'node:crypto';

export const check = (condition, reason) => { if (!condition) throw new Error(reason); };
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function fields(value, names) {
  check(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)), 'FIELDS_INVALID');
}
export function base64(value) {
  check(typeof value === 'string' && value.length <= 16384, 'BASE64_INVALID');
  const bytes = Buffer.from(value, 'base64');
  check(bytes.toString('base64') === value, 'BASE64_NON_CANONICAL');
  return bytes;
}
const nameOK = name => typeof name === 'string' && Buffer.byteLength(name) <= 255 && name.length > 0 && !/[\s+\p{Cc}]/u.test(name);

// Narrow profile: three-line checkpoint body, no opaque extensions.
export function checkpointBody(envelope) {
  check(typeof envelope === 'string' && Buffer.byteLength(envelope) <= 16384, 'CHECKPOINT_TOO_LARGE');
  const parts = envelope.split('\n\n');
  check(parts.length === 2 && parts[1].endsWith('\n'), 'CHECKPOINT_FRAMING_INVALID');
  const [origin, size, hash, ...extra] = parts[0].split('\n');
  check(extra.length === 0 && nameOK(origin) && /^(0|[1-9][0-9]*)$/.test(size) &&
    BigInt(size) > 0n && BigInt(size) <= BigInt(Number.MAX_SAFE_INTEGER), 'CHECKPOINT_BODY_INVALID');
  check(base64(hash).length === 32, 'CHECKPOINT_HASH_INVALID');
  return { body: parts[0] + '\n', origin, size, hash };
}

// C2SP Ed25519 checkpoint cosignatures (type 0x04), not log signatures (0x01).
export function verifyWitnessQuorum(note, authenticatedEnvelope, policy) {
  fields(policy, ['origin', 'quorum', 'now', 'maxAgeSeconds', 'witnesses']);
  check(nameOK(policy.origin) && Number.isSafeInteger(policy.now) && policy.now >= 0 &&
    Number.isSafeInteger(policy.maxAgeSeconds) && policy.maxAgeSeconds > 0 && policy.maxAgeSeconds <= 86400 &&
    Array.isArray(policy.witnesses) && policy.witnesses.length >= 2 && policy.witnesses.length <= 16 &&
    Number.isSafeInteger(policy.quorum) && policy.quorum >= 2 && policy.quorum <= policy.witnesses.length, 'WITNESS_POLICY_INVALID');
  const authenticated = checkpointBody(authenticatedEnvelope);
  const received = checkpointBody(note);
  check(received.body === authenticated.body && received.origin === policy.origin, 'WITNESS_CHECKPOINT_MISMATCH');
  const trusted = new Map(), publicKeys = new Set();
  for (const witness of policy.witnesses) {
    fields(witness, ['name', 'publicKeyPem']);
    check(nameOK(witness.name) && !trusted.has(witness.name) && typeof witness.publicKeyPem === 'string' && witness.publicKeyPem.length <= 1024, 'WITNESS_KEY_INVALID');
    const key = createPublicKey(witness.publicKeyPem);
    check(key.asymmetricKeyType === 'ed25519', 'WITNESS_ALGORITHM_INVALID');
    const raw = Buffer.from(key.export({ format: 'jwk' }).x, 'base64url');
    check(raw.length === 32 && !publicKeys.has(raw.toString('hex')), 'WITNESS_KEY_ALIAS');
    publicKeys.add(raw.toString('hex'));
    const keyId = Buffer.from(sha256(Buffer.concat([Buffer.from(witness.name + '\n'), Buffer.from([4]), raw])), 'hex').subarray(0, 4);
    trusted.set(witness.name, { key, keyId });
  }
  const lines = note.split('\n\n')[1].slice(0, -1).split('\n');
  check(lines.length >= 1 && lines.length <= 32, 'WITNESS_SIGNATURE_LIMIT');
  const accepted = new Set(), seen = new Set(), times = [];
  for (const line of lines) {
    const match = /^— ([^\s+]+) ([A-Za-z0-9+/]+={0,2})$/u.exec(line);
    check(match, 'NOTE_SIGNATURE_INVALID');
    check(nameOK(match[1]), 'NOTE_SIGNER_NAME_INVALID');
    const encoded = base64(match[2]);
    check(encoded.length >= 4, 'NOTE_SIGNATURE_INVALID');
    const id = encoded.subarray(0, 4);
    const identity = match[1] + ':' + id.toString('hex');
    check(!seen.has(identity), 'WITNESS_DUPLICATE_SIGNATURE'); seen.add(identity);
    const witness = trusted.get(match[1]);
    if (!witness || !id.equals(witness.keyId)) continue;
    check(encoded.length === 76, 'WITNESS_SIGNATURE_INVALID');
    const time = encoded.readBigUInt64BE(4);
    check(time <= BigInt(policy.now) && BigInt(policy.now) - time <= BigInt(policy.maxAgeSeconds), 'WITNESS_TIME_INVALID');
    const message = Buffer.from(`cosignature/v1\ntime ${time}\n${received.body}`);
    check(verify(null, message, witness.key, encoded.subarray(12)), 'WITNESS_SIGNATURE_INVALID');
    accepted.add(match[1]);
    times.push(Number(time));
  }
  check(accepted.size >= policy.quorum, 'WITNESS_QUORUM_NOT_MET');
  return { quorum: policy.quorum, witnesses: [...accepted], cosigned_at: times, checkpoint_body_sha256: sha256(Buffer.from(received.body)),
    independence: 'CALLER_TRUST_ASSUMPTION', consistency_history: 'WITNESS_ASSERTION_NOT_REEXECUTED' };
}
