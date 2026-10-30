import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const MMR_PROFILE_DIGEST =
  'bcd07a275061ef385fccdd184030c2358fdd0937477cb0ef30cf8148342f2450';

const WASM_ENTRY = '../verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js';

export function mmrSize(leafCount) {
  let value = leafCount >>> 0;
  let bits = 0;
  while (value) {
    bits += value & 1;
    value >>>= 1;
  }
  return 2 * leafCount - bits;
}

function u64be(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

export function peakWidths(leafCount) {
  const widths = [];
  let bit = 1 << (31 - Math.clz32(leafCount));
  let remaining = leafCount;
  while (bit > 0) {
    if (remaining >= bit) {
      widths.push(bit);
      remaining -= bit;
    }
    bit >>>= 1;
  }
  return widths;
}

export function createMmr(blake3Hex) {
  if (typeof blake3Hex !== 'function') throw new Error('blake3Hex required');
  const digest = (bytes) => Buffer.from(blake3Hex(bytes), 'hex');
  const leafHash = (leaf) => digest(Buffer.concat([Buffer.from([0x00]), leaf]));
  const nodeHash = (left, right) =>
    digest(Buffer.concat([Buffer.from([0x01]), left, right]));
  const bagHash = (left, right, leafCount) =>
    digest(
      Buffer.concat([Buffer.from([0x02]), u64be(mmrSize(leafCount)), left, right]),
    );

  function perfectRootAndPath(hashes, start) {
    let level = hashes.slice();
    const steps = [];
    let index = start;
    while (level.length > 1) {
      const sibling = index ^ 1;
      steps.push({
        kind: 'node',
        direction: sibling < index ? 'left' : 'right',
        hash: level[sibling],
      });
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(nodeHash(level[i], level[i + 1]));
      }
      level = next;
      index >>= 1;
    }
    return { root: level[0], steps };
  }

  function build(leaves, target) {
    if (!Array.isArray(leaves) || leaves.length === 0) throw new Error('empty MMR');
    if (target < 0 || target >= leaves.length) throw new Error('target out of range');
    const hashes = leaves.map(leafHash);
    const peaks = [];
    let start = 0;
    for (const width of peakWidths(leaves.length)) {
      const { root } = perfectRootAndPath(hashes.slice(start, start + width), 0);
      peaks.push({ start, width, hash: root });
      start += width;
    }
    let root = peaks[peaks.length - 1].hash;
    for (let i = peaks.length - 2; i >= 0; i -= 1) {
      root = bagHash(peaks[i].hash, root, leaves.length);
    }
    const peakIndex = peaks.findIndex(
      (peak) => peak.start <= target && target < peak.start + peak.width,
    );
    const peak = peaks[peakIndex];
    const { steps } = perfectRootAndPath(
      hashes.slice(peak.start, peak.start + peak.width),
      target - peak.start,
    );
    if (peakIndex < peaks.length - 1) {
      let accumulator = peaks[peaks.length - 1].hash;
      for (let i = peaks.length - 2; i > peakIndex; i -= 1) {
        accumulator = bagHash(peaks[i].hash, accumulator, leaves.length);
      }
      steps.push({ kind: 'bag', direction: 'right', hash: accumulator });
    }
    for (let i = peakIndex - 1; i >= 0; i -= 1) {
      steps.push({ kind: 'bag', direction: 'left', hash: peaks[i].hash });
    }
    return { root, proof: steps };
  }

  function verify(leaf, leafCount, proof, root) {
    let current = leafHash(leaf);
    for (const step of proof) {
      if (step.kind === 'node' && step.direction === 'left') {
        current = nodeHash(step.hash, current);
      } else if (step.kind === 'node' && step.direction === 'right') {
        current = nodeHash(current, step.hash);
      } else if (step.kind === 'bag' && step.direction === 'left') {
        current = bagHash(step.hash, current, leafCount);
      } else if (step.kind === 'bag' && step.direction === 'right') {
        current = bagHash(current, step.hash, leafCount);
      } else {
        throw new Error('invalid proof step');
      }
    }
    return current.equals(root);
  }

  return { leafHash, nodeHash, bagHash, build, verify };
}

export function toWasmProof(proof) {
  return JSON.stringify(
    proof.map((step) => ({
      kind: step.kind,
      direction: step.direction,
      hash: Array.from(step.hash),
    })),
  );
}

export function loadNodeVerifier() {
  const require = createRequire(import.meta.url);
  return require(fileURLToPath(new URL(WASM_ENTRY, import.meta.url)));
}

export function wasmVerify(leaf, leafCount, proof, root) {
  return loadNodeVerifier().verify_mmr(
    leaf,
    leafCount,
    toWasmProof(proof),
    root,
  );
}

export function datasetRoot(leaves, blake3Hex) {
  return createMmr(blake3Hex).build(leaves, 0).root;
}

export function datasetDigest(bytes, blake3Hex) {
  return blake3Hex(bytes);
}
