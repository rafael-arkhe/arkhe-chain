// E01 devnet-only legacy Memo transaction. No wallet discovery or secret output.
import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';
export const RPC = 'https://api.devnet.solana.com';
export const GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const PROFILE = 'bcd07a275061ef385fccdd184030c2358fdd0937477cb0ef30cf8148342f2450';
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
  let n = BigInt('0x' + (Buffer.from(bytes).toString('hex') || '0')), out = '';
  while (n) { out = alphabet[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
  return out;
}
export function unbase58(s) {
  if (typeof s !== 'string' || !s.length || s.length > 2048) throw new Error('invalid base58');
  let n = 0n;
  for (const c of s) { const i = alphabet.indexOf(c); if (i < 0) throw new Error('invalid base58'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
  const leading = s.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(leading), n ? Buffer.from(hex, 'hex') : Buffer.alloc(0)]);
}
export function shortvec(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 65535) throw new Error('invalid length');
  const bytes = []; do { let b = n & 127; n >>>= 7; if (n) b |= 128; bytes.push(b); } while (n);
  return Buffer.from(bytes);
}
export function payload({runId, leafCount, rootHex, datasetSha256}) {
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(runId) || ![1000,5000,10000].includes(leafCount)
    || !/^[a-f0-9]{64}$/.test(rootHex) || !/^[a-f0-9]{64}$/.test(datasetSha256)) throw new Error('invalid E01 commitment');
  // Fixed key insertion order is the wire encoding v1; UTF-8 JSON, no whitespace.
  return Buffer.from(JSON.stringify({type:'arkhe:e01:mmr',v:1,genesis:GENESIS,
    run:runId,profile:PROFILE,n:leafCount,root:rootHex,dataset:datasetSha256}), 'utf8');
}
export function newSigner() { return generateKeyPairSync('ed25519'); }
export function publicAddress(signer) {
  return base58(signer.publicKey.export({type:'spki',format:'der'}).subarray(-32));
}
export function transaction(signer, blockhash, commitment) {
  const payer = unbase58(publicAddress(signer)), block = unbase58(blockhash), program = unbase58(MEMO);
  if (payer.length !== 32 || block.length !== 32 || program.length !== 32 || commitment.length > 566) throw new Error('invalid transaction fields');
  // Header: one signer; Memo program is the sole read-only unsigned account.
  // Memo receives payer as signer account to bind approval to the fee payer.
  const message = Buffer.concat([Buffer.from([1,0,1]), shortvec(2), payer, program, block,
    shortvec(1), Buffer.from([1]), shortvec(1), Buffer.from([0]), shortvec(commitment.length), commitment]);
  const signature = sign(null,message,signer.privateKey);
  if (!verify(null,message,signer.publicKey,signature)) throw new Error('signature self-check failed');
  const bytes = Buffer.concat([shortvec(1),signature,message]);
  if (bytes.length > 1232) throw new Error('legacy packet budget exceeded');
  return {message,bytes,blockhash,signature:base58(signature)};
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function rpc(method, params=[], endpoint=RPC) {
  if (endpoint !== RPC) throw new Error('E01 endpoint allowlist: devnet only');
  const response = await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const data = await response.json(); if (data.error) throw new Error(`RPC ${JSON.stringify(data.error)}`);
  if (!Object.hasOwn(data,'result')) throw new Error('missing RPC result');
  return data.result;
}
export function checkReceipt(receipt, tx, commitment, payer) {
  if (!receipt || receipt.meta?.err !== null || !Number.isSafeInteger(receipt.slot)
    || receipt.transaction?.signatures?.[0] !== tx.signature) throw new Error('receipt identity/status mismatch');
  const msg = receipt.transaction.message;
  if (msg.recentBlockhash !== tx.blockhash || msg.header?.numRequiredSignatures !== 1 || msg.header?.numReadonlySignedAccounts !== 0
    || msg.header?.numReadonlyUnsignedAccounts !== 1 || msg.accountKeys?.length !== 2
    || msg.accountKeys[0] !== payer || msg.accountKeys[1] !== MEMO
    || msg.instructions?.length !== 1) throw new Error('receipt message mismatch');
  const ix = msg.instructions[0];
  if (ix.programIdIndex !== 1 || JSON.stringify(ix.accounts) !== '[0]'
    || !unbase58(ix.data).equals(commitment)) throw new Error('receipt commitment mismatch');
  return {slot:receipt.slot,fee_lamports:receipt.meta.fee};
}
