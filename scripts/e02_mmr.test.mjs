import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { base58 } from './e01_solana_transport.mjs';
import {
  createMmr,
  loadNodeVerifier,
  mmrSize,
  peakWidths,
  toWasmProof,
  wasmVerify,
} from './e02_mmr.mjs';
import {
  MMR_PROFILE,
  encodeAnchor,
  encodeReference,
  parseArtifact,
  parseDataset,
  parseMemo,
} from './e02_memo_commitment.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const vectorsDir = join(repoRoot, 'verification', 'vectors', 'mmr');
const wasm = loadNodeVerifier();
const blake3Hex = (bytes) => wasm.blake3_hex(bytes);
const mmr = createMmr(blake3Hex);
const hex = (char) => char.repeat(64);

function artifact(overrides = {}) {
  return parseArtifact({
    artifact: 'e01 sm newsletter run',
    kind: 'e01-run',
    label: 'synthetic-poc',
    producer: hex('1'),
    subject: hex('2'),
    v: 1,
    ...overrides,
  });
}

test('peak decomposition matches the frozen profile', () => {
  assert.deepEqual(peakWidths(1), [1]);
  assert.deepEqual(peakWidths(3), [2, 1]);
  assert.deepEqual(peakWidths(5), [4, 1]);
  assert.deepEqual(peakWidths(7), [4, 2, 1]);
  assert.equal(mmrSize(1), 1);
  assert.equal(mmrSize(3), 4);
  assert.equal(mmrSize(7), 11);
});

test('empty MMR and out-of-range targets are rejected', () => {
  assert.throws(() => mmr.build([], 0));
  assert.throws(() => mmr.build([Buffer.from([1])], 1));
});

for (const file of readdirSync(vectorsDir).filter((name) => /^\d+-leaves\.json$/.test(name))) {
  test(`MMR golden vector ${file}`, () => {
    const vector = JSON.parse(readFileSync(join(vectorsDir, file), 'utf8'));
    const leaves = vector.input.leaves.map((leaf) => Buffer.from(leaf, 'hex'));
    assert.equal(mmrSize(vector.input.leaf_count), vector.input.mmr_size);
    for (const expected of vector.expected_output.proofs) {
      const built = mmr.build(leaves, expected.target_index);
      assert.equal(built.root.toString('hex'), vector.expected_output.root_hash_hex);
      assert.deepEqual(built.proof.map((step) => step.kind), expected.inclusion_proof_kinds);
      assert.deepEqual(built.proof.map((step) => step.direction), expected.inclusion_proof_directions);
      assert.deepEqual(
        built.proof.map((step) => step.hash.toString('hex')),
        expected.inclusion_proof_hashes,
      );
      assert.equal(
        mmr.verify(leaves[expected.target_index], vector.input.leaf_count, built.proof, built.root),
        true,
      );
      assert.equal(
        wasmVerify(leaves[expected.target_index], vector.input.leaf_count, built.proof, built.root),
        true,
      );
    }
  });
}

test('the WASM verifier rejects a wrong root and a mutated proof', () => {
  const leaves = [Buffer.from([1]), Buffer.from([2]), Buffer.from([3])];
  const { root, proof } = mmr.build(leaves, 1);
  assert.equal(wasmVerify(leaves[1], 3, proof, root), true);
  assert.equal(wasmVerify(leaves[1], 3, proof, Buffer.alloc(32)), false);
  const mutated = proof.map((step, index) =>
    index === 0 ? { ...step, hash: Buffer.alloc(32) } : step,
  );
  assert.equal(wasmVerify(leaves[1], 3, mutated, root), false);
  assert.equal(toWasmProof(proof).includes('"kind"'), true);
});

test('reference and anchor commitments verify end to end', () => {
  const artifacts = [
    artifact({ artifact: 'run-a', subject: hex('a') }),
    artifact({ artifact: 'run-b', subject: hex('b') }),
    artifact({ artifact: 'run-c', kind: 'gguf-supply-chain', subject: hex('c') }),
  ];
  const leaves = artifacts.map((item) => item.leafBytes);
  const { root, proof } = mmr.build(leaves, 1);
  const rootHex = root.toString('hex');
  const leafHash = mmr.leafHash(leaves[1]).toString('hex');
  const opId = Buffer.from(blake3Hex(artifacts[1].opIdPreimage), 'hex').toString('hex');
  const anchorRef = base58(Buffer.alloc(64, 9));

  const memo = parseMemo(encodeReference({ opId, leafHash, root: rootHex, n: 3, anchorRef }));
  assert.equal(memo.ok, true);
  assert.equal(memo.fields.n, 3);
  assert.equal(memo.fields.anchorRef, anchorRef);

  const datasetText = JSON.stringify({
    leaves: leaves.map((leaf) => leaf.toString('hex')),
    n: 3,
    profile: { digest: MMR_PROFILE.digest, id: MMR_PROFILE.id, version: 1 },
    root: rootHex,
    v: 1,
  });
  const parsedDataset = parseDataset(datasetText);
  assert.equal(parsedDataset.ok, true);
  const rebuilt = mmr.build(parsedDataset.dataset.leaves, 1);
  assert.equal(rebuilt.root.toString('hex'), rootHex);
  assert.deepEqual(rebuilt.proof, proof);
  assert.equal(wasmVerify(parsedDataset.dataset.leaves[1], 3, rebuilt.proof, root), true);

  const datasetDigest = blake3Hex(Buffer.from(datasetText, 'utf8'));
  const anchor = parseMemo(encodeAnchor({ root: rootHex, n: 3, datasetDigest }));
  assert.equal(anchor.ok, true);
  assert.equal(anchor.fields.root, rootHex);
  assert.equal(anchor.fields.datasetDigest, datasetDigest);

  const referenced = parseDataset(datasetText).dataset.leaves[1];
  assert.equal(mmr.leafHash(referenced).toString('hex'), memo.fields.leafHash);
  assert.equal(Buffer.from(blake3Hex(artifacts[1].opIdPreimage), 'hex').toString('hex'), memo.fields.opId);
});

test('a production artifact parses but is out of v1 scope', () => {
  const parsed = artifact({ label: 'production' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.inScope, false);
});
