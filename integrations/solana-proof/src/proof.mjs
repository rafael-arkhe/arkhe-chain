import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const wasm = require('../../../verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js');
export const hash = bytes => wasm.blake3_hex(Buffer.from(bytes));
const digest = (...parts) => Buffer.from(hash(Buffer.concat(parts)), 'hex');
const HEX = /^[0-9a-f]{64}$/;

// Fixed positional encoding: no ambiguous object key ordering or floating amounts.
export function intentBytes(intent) {
  const { cluster, mint, source, destination, amount, decimals, operationId } = intent;
  for (const value of [cluster, mint, source, destination, operationId]) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(value)) throw Error('invalid intent field');
  }
  if (typeof amount !== 'string' || !/^[1-9][0-9]{0,19}$/.test(amount) || BigInt(amount) > 18446744073709551615n) throw Error('invalid u64 amount');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw Error('invalid decimals');
  return Buffer.from(JSON.stringify(['arkhe-solana-intent/v1', cluster, mint, source, destination, amount, decimals, operationId]));
}
export const intentMemo = intent => `ARKHE:v1:intent:${hash(intentBytes(intent))}`;
export function eventBytes(intent, signature, slot) {
  intentBytes(intent);
  if (typeof signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) throw Error('invalid signature');
  if (!Number.isSafeInteger(slot) || slot < 0) throw Error('invalid slot');
  return Buffer.from(JSON.stringify(['arkhe-solana-event/v1', intentMemo(intent), signature, slot, JSON.parse(intentBytes(intent))]));
}

// Arkhe MMR v1: BLAKE3 domains and size-bound right-to-left peak bagging.
export function buildProof(leaves, target) {
  if (!Array.isArray(leaves) || leaves.length < 1 || leaves.length > 10000 || !Number.isInteger(target) || target < 0 || target >= leaves.length) throw Error('invalid MMR input');
  const size = Buffer.alloc(8);
  const n = leaves.length;
  size.writeBigUInt64BE(BigInt(2 * n - n.toString(2).replaceAll('0', '').length));
  const node = (l, r) => digest(Buffer.from([1]), l, r);
  const bag = (l, r) => digest(Buffer.from([2]), size, l, r);
  const peaks = [];
  let start = 0;
  for (let remaining = n; remaining;) {
    const width = 2 ** Math.floor(Math.log2(remaining));
    let level = leaves.slice(start, start + width).map(leaf => digest(Buffer.from([0]), Buffer.from(leaf)));
    let index = target - start;
    const path = [];
    while (level.length > 1) {
      if (index >= 0 && index < level.length) path.push({ kind: 'node', direction: index % 2 ? 'left' : 'right', hash: [...level[index ^ 1]] });
      const next = [];
      for (let i = 0; i < level.length; i += 2) next.push(node(level[i], level[i + 1]));
      level = next; index = index < 0 ? -1 : Math.floor(index / 2);
    }
    peaks.push({ start, width, root: level[0], path });
    start += width; remaining -= width;
  }
  const bagRoots = items => items.slice(0, -1).reduceRight((acc, p) => bag(p.root, acc), items.at(-1).root);
  const peakIndex = peaks.findIndex(p => target >= p.start && target < p.start + p.width);
  const proof = [...peaks[peakIndex].path];
  if (peakIndex < peaks.length - 1) proof.push({ kind: 'bag', direction: 'right', hash: [...bagRoots(peaks.slice(peakIndex + 1))] });
  for (const p of peaks.slice(0, peakIndex).reverse()) proof.push({ kind: 'bag', direction: 'left', hash: [...p.root] });
  return { rootHex: bagRoots(peaks).toString('hex'), leafCount: n, proof };
}
export function checkpointMemo(rootHex, leafCount) {
  if (!HEX.test(rootHex) || !Number.isInteger(leafCount) || leafCount < 1 || leafCount > 10000) throw Error('invalid checkpoint');
  return `ARKHE:v1:checkpoint:${leafCount}:${rootHex}`;
}
export function verifyReceipt(receipt, trustedRootHex, trustedLeafCount) {
  if (!HEX.test(trustedRootHex) || !Number.isInteger(trustedLeafCount) || trustedLeafCount < 1 || trustedLeafCount > 10000) throw Error('invalid trusted checkpoint');
  if (receipt.schema !== 'arkhe-solana-receipt/v1' || receipt.leafCount !== trustedLeafCount || receipt.rootHex !== trustedRootHex) return false;
  if (!Array.isArray(receipt.proof) || receipt.proof.length > 64) return false;
  try {
    return wasm.verify_mmr(eventBytes(receipt.intent, receipt.signature, receipt.slot), trustedLeafCount, JSON.stringify(receipt.proof), Buffer.from(trustedRootHex, 'hex'));
  } catch { return false; }
}
export function receiptFor(events, index) {
  const event = events[index];
  return { schema: 'arkhe-solana-receipt/v1', ...event, ...buildProof(events.map(e => eventBytes(e.intent, e.signature, e.slot)), index) };
}
// Shared inclusion primitive for versioned adapters with their own leaf encoding.
export function verifyLeaf(leaf, proof, trustedRootHex, trustedLeafCount) {
  if (!HEX.test(trustedRootHex) || !Number.isInteger(trustedLeafCount) || trustedLeafCount < 1 || trustedLeafCount > 10000 || !Array.isArray(proof) || proof.length > 64) return false;
  try { return wasm.verify_mmr(Buffer.from(leaf), trustedLeafCount, JSON.stringify(proof), Buffer.from(trustedRootHex, 'hex')); }
  catch { return false; }
}
