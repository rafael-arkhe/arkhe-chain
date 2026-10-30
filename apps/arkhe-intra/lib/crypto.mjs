import { createRequire } from 'node:module';
import { createPublicKey, verify } from 'node:crypto';
import { resolve } from 'node:path';
import { root } from './paths.mjs';
const require = createRequire(import.meta.url);
let verifier;
export function digest(bytes) {
  verifier ??= require(resolve(root, 'verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js'));
  return verifier.blake3_hex(Buffer.from(bytes));
}
// Versioned application envelope; not an AKG identity or a canonical CBOR WER.
export function contentBytes(document) {
  return JSON.stringify({ domain: 'arkhe-intra/document/v1', id: document.id, revision: document.revision, title: document.title, department: document.department, body: document.body, authorId: document.authorId });
}
export function statement(document, action, actorId) {
  return JSON.stringify({ domain: 'arkhe-intra/transition/v1', documentId: document.id, revision: document.revision, digest: document.digest, previousState: document.state, action, actorId });
}
export function verifySignature(bytes, signature, publicKey) {
  try {
    if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return false;
    const key = createPublicKey(publicKey);
    return key.asymmetricKeyType === 'ed25519' && verify(null, Buffer.from(bytes), key, Buffer.from(signature, 'base64'));
  } catch { return false; }
}
