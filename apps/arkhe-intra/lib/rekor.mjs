import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
const sha = bytes => createHash('sha256').update(bytes).digest();
export function hashedRekord(signature) {
  return { apiVersion: '0.0.1', kind: 'hashedrekord', spec: { data: { hash: { algorithm: 'sha256', value: sha(signature.statement).toString('hex') } }, signature: { content: signature.signature, publicKey: { content: Buffer.from(signature.publicKey).toString('base64') } } } };
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}
export const canonical = value => JSON.stringify(sorted(value));
// RFC6962 audit path. The root is checked structurally; SET authenticates the entry,
// not a witnessed tree checkpoint. The UI reports that distinction explicitly.
export function inclusion(body, index, proof) {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(proof?.treeSize) || index < 0 || index >= proof.treeSize || proof.logIndex !== index || !Array.isArray(proof.hashes) || proof.hashes.length > 64 || !/^[a-f0-9]{64}$/.test(proof.rootHash)) return false;
  let node = sha(Buffer.concat([Buffer.from([0]), Buffer.from(body, 'base64')]));
  let fn = index, sn = proof.treeSize - 1;
  for (const hash of proof.hashes) {
    if (sn === 0 || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return false;
    const neighbor = Buffer.from(hash, 'hex');
    if (fn % 2 === 1 || fn === sn) {
      node = sha(Buffer.concat([Buffer.from([1]), neighbor, node]));
      while (fn !== 0 && fn % 2 === 0) { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); }
    } else node = sha(Buffer.concat([Buffer.from([1]), node, neighbor]));
    fn = Math.floor(fn / 2); sn = Math.floor(sn / 2);
  }
  return sn === 0 && node.toString('hex') === proof.rootHash;
}
export function checkReceipt(receipt, signature, pinnedKey) {
  try {
    const entries = Object.entries(receipt);
    if (entries.length !== 1) return false;
    const [uuid, entry] = entries[0];
    if (!/^[a-f0-9]{64,160}$/.test(uuid) || typeof entry.body !== 'string' || entry.body.length > 65536 || !Number.isSafeInteger(entry.integratedTime) || entry.integratedTime <= 0 || !Number.isSafeInteger(entry.logIndex)) return false;
    const expected = hashedRekord(signature);
    const body = JSON.parse(Buffer.from(entry.body, 'base64').toString('utf8'));
    if (canonical(body) !== canonical(expected)) return false;
    const key = createPublicKey(pinnedKey);
    if (sha(key.export({ type: 'spki', format: 'der' })).toString('hex') !== entry.logID) return false;
    const payload = canonical({ body: entry.body, integratedTime: entry.integratedTime, logID: entry.logID, logIndex: entry.logIndex });
    if (!verify('sha256', Buffer.from(payload), key, Buffer.from(entry.verification.signedEntryTimestamp, 'base64'))) return false;
    return inclusion(entry.body, entry.logIndex, entry.verification.inclusionProof);
  } catch { return false; }
}
export function rekorConfig() {
  const endpoint = process.env.ARKHE_REKOR_URL;
  const path = process.env.ARKHE_REKOR_PUBLIC_KEY_FILE;
  if (!endpoint || !path) return null;
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Rekor exige origem HTTPS e chave pública fixada.');
  return { url: url.origin, key: readFileSync(path, 'utf8') };
}
export async function anchor(signature, config) {
  const response = await fetch(config.url + '/api/v1/log/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hashedRekord(signature)), redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Resposta Rekor pendente de reconciliação.');
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 131072) { await reader.cancel(); throw new Error('Recibo Rekor excede o limite.'); } chunks.push(value); }
  const receipt = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!checkReceipt(receipt, signature, config.key)) throw new Error('Recibo inválido ou prova ainda indisponível; reconcilie com recibo completo.');
  return receipt;
}
