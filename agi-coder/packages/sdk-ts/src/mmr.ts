import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex, hexToBytes, concatBytes } from '@noble/hashes/utils.js';
export interface InclusionProof { leaf_index: number; leaf_count: number; siblings: string[]; peaks: string[] }
const text = new TextEncoder();
function u64(n: bigint): Uint8Array { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n); return b; }
export function hash(data: Uint8Array): string { return bytesToHex(blake3(data)); }
export function domain(name: string, parts: Uint8Array[]): string {
  const d = text.encode(name);
  return hash(concatBytes(u64(BigInt(d.length)), d, ...parts.flatMap(p => [u64(BigInt(p.length)), p])));
}
function bytes(h: string): Uint8Array { if (!/^[a-f0-9]{64}$/.test(h)) throw new Error('Expected a lowercase 32-byte hash'); return hexToBytes(h); }
const node = (a: string, b: string) => domain('AGI/MMR/NODE/v1', [bytes(a), bytes(b)]);
export function mmrRoot(count: number, peaks: string[]): string {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid leaf count');
  let bag: string | undefined;
  for (const peak of [...peaks].reverse()) bag = bag === undefined
    ? domain('AGI/MMR/BAG/v1', [new Uint8Array([0]), bytes(peak)])
    : domain('AGI/MMR/BAG/v1', [new Uint8Array([1]), bytes(peak), bytes(bag)]);
  return domain('AGI/MMR/ROOT/v1', [u64(BigInt(count)), bytes(bag ?? domain('AGI/MMR/EMPTY/v1', []))]);
}
export function verifyMmrInclusion(value: string, proof: InclusionProof, expectedRoot: string): boolean {
  try {
    bytes(expectedRoot);
    if (!Number.isSafeInteger(proof.leaf_index) || !Number.isSafeInteger(proof.leaf_count) || proof.leaf_index < 0 || proof.leaf_index >= proof.leaf_count) return false;
    const count = BigInt(proof.leaf_count); const index = BigInt(proof.leaf_index);
    const ranges: {start: bigint; size: bigint; height: number}[] = []; let start = 0n;
    for (let height = 52; height >= 0; height--) { const size = 1n << BigInt(height); if ((count & size) !== 0n) { ranges.push({start, size, height}); start += size; } }
    const peak = ranges.findIndex(r => index >= r.start && index < r.start + r.size); const range = ranges[peak];
    if (!range || proof.peaks.length !== ranges.length || proof.siblings.length !== range.height) return false;
    let at = index - range.start; let h = domain('AGI/MMR/LEAF/v1', [bytes(value)]);
    for (const sibling of proof.siblings) { h = (at & 1n) === 0n ? node(h, sibling) : node(sibling, h); at >>= 1n; }
    return h === proof.peaks[peak] && mmrRoot(proof.leaf_count, proof.peaks) === expectedRoot;
  } catch { return false; }
}
