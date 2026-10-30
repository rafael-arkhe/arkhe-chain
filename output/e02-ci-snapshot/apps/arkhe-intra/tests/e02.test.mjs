import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { root } from '../lib/paths.mjs';
import { E02InputError, normalizeRequest, verifyE02 } from '../lib/e02.mjs';
import { isCompleteE02Report } from '../lib/e02-report.mjs';
import { verifyE02Browser, createMmr, parseArtifact, unbase58, base58 } from '../lib/e02-browser.mjs';

const require = createRequire(import.meta.url);
const wasm = require(resolve(root, 'verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js'));

const dir = fileURLToPath(new URL('../public/e02/fixtures/', import.meta.url));
const dataset = readFileSync(resolve(dir, 'dataset.json'), 'utf8');
const ref = JSON.parse(readFileSync(resolve(dir, 'ref.json'), 'utf8'));
const anchor = JSON.parse(readFileSync(resolve(dir, 'anchor.json'), 'utf8'));
const refText = readFileSync(resolve(dir, 'ref.json'), 'utf8');
const anchorText = readFileSync(resolve(dir, 'anchor.json'), 'utf8');

function browserVerify(overrides = {}) {
  return verifyE02Browser(
    { refText, anchorText, datasetText: dataset, ...overrides },
    wasm,
  );
}

test('the E02 fixture with real repo artifacts verifies', () => {
  const result = verifyE02({ dataset, ref: JSON.stringify(ref), anchor });
  assert.equal(result.outcome, 'VERIFIED');
  assert.equal(result.reason, null);
  assert.equal(result.observed.n, 2);
  assert.equal(result.observed.anchor_slot, 101);
  assert.equal(result.observed.signed, false);
  assert.match(result.statement, /stage10-gguf\/bundle\.json/);
  assert.match(result.statement, /não prova quem produziu/);
});

test('the browser WASM engine agrees with the server engine', () => {
  const server = verifyE02({ dataset, ref: JSON.stringify(ref), anchor });
  const browser = browserVerify();
  assert.equal(browser.outcome, 'VERIFIED');
  assert.deepEqual(browser, server);
});

test('a tampered root fails closed in both engines', () => {
  const tampered = dataset.replace(/"root": "[0-9a-f]{64}"/, `"root": "${'0'.repeat(64)}"`);
  const server = verifyE02({ dataset: tampered, ref, anchor });
  const browser = browserVerify({ datasetText: tampered });
  assert.equal(server.outcome, 'NOT_VERIFIABLE');
  assert.equal(server.reason, 'ROOT_MISMATCH');
  assert.deepEqual(browser, server);
});

test('the dataset digest binds the exact bytes in both engines', () => {
  const compact = JSON.stringify(JSON.parse(dataset));
  const server = verifyE02({ dataset: compact, ref, anchor });
  const browser = browserVerify({ datasetText: compact });
  assert.equal(server.reason, 'ANCHOR_DATASET_MISMATCH');
  assert.deepEqual(browser, server);
});

test('missing anchor and mismatched receipts stay verifiable failures', () => {
  assert.equal(verifyE02({ dataset, ref, anchor: null }).reason, 'ANCHOR_NOT_FOUND');
  const result = verifyE02({ dataset, ref, anchor, signature: '1'.repeat(64) });
  assert.equal(result.reason, 'RECEIPT_MISMATCH');
  assert.equal(browserVerify({ anchorText: null }).reason, 'ANCHOR_NOT_FOUND');
});

test('the browser engine fails closed without a verifier', () => {
  const result = verifyE02Browser({ refText, anchorText, datasetText: dataset }, null);
  assert.equal(result.outcome, 'NOT_VERIFIABLE');
  assert.equal(result.reason, 'VERIFIER_UNAVAILABLE');
});

test('request validation rejects malformed input', () => {
  assert.throws(() => normalizeRequest({}), E02InputError);
  assert.throws(() => normalizeRequest({ dataset: '{}' }), /Recibo de referência ausente/);
  assert.throws(() => normalizeRequest({ dataset: '{}', ref: 'not json' }), /inválido/);
  assert.throws(() => normalizeRequest({ dataset: '', ref }), /Dataset inválido/);
  assert.throws(() => normalizeRequest({ dataset: '{}', ref: [] }), /inválido/);
});

test('detailed browser result records actual stages and portable MMR path', () => {
  const detailed = browserVerify({ includeDetails: true });
  assert.equal(detailed.complete, true);
  assert.equal(detailed.aborted, null);
  assert.equal(detailed.checks.length, 9);
  assert.ok(detailed.checks.every(check => check.status === 'PASS'));
  assert.equal(detailed.proof_details.recomputed_root, detailed.observed.root);
  assert.equal(detailed.proof_details.recomputed_dataset_digest, detailed.observed.dataset_digest);
  assert.equal(detailed.proof_details.leaf_index, 0);
  assert.equal(detailed.proof_details.steps.length, 1);
  const { checks, proof_details, complete, aborted, ...verdict } = detailed;
  assert.deepEqual(verdict, browserVerify());
});

test('detailed failure never marks subsequent stages as passed', () => {
  const tampered = dataset.replace(/"root": "[0-9a-f]{64}"/, `"root": "${'0'.repeat(64)}"`);
  const result = browserVerify({ includeDetails: true, datasetText: tampered });
  assert.equal(result.reason, 'ROOT_MISMATCH');
  assert.equal(result.complete, false);
  assert.equal(result.aborted, 4);
  assert.deepEqual(result.checks.map(check => check.status),
    ['PASS', 'PASS', 'PASS', 'PASS', 'FAIL', 'NOT_RUN', 'NOT_RUN', 'NOT_RUN', 'NOT_RUN']);
  assert.equal(result.checks[4].reason, 'ROOT_MISMATCH');
  assert.equal(result.observed.root, null);
});

test('missing anchor and corrupt dataset bytes expose the exact failed stage', () => {
  const missing = browserVerify({ includeDetails: true, anchorText: null });
  assert.equal(missing.checks[6].status, 'FAIL');
  assert.equal(missing.checks[7].status, 'NOT_RUN');
  const modified = browserVerify({ includeDetails: true, datasetText: JSON.stringify(JSON.parse(dataset)) });
  assert.equal(modified.checks[7].reason, 'ANCHOR_DATASET_MISMATCH');
  assert.equal(modified.checks[8].status, 'NOT_RUN');
});

test('WASM inclusion rejection is reported as failure even with a coherent dataset', () => {
  const result = verifyE02Browser({ refText, anchorText, datasetText: dataset, includeDetails: true },
    { blake3_hex: wasm.blake3_hex, verify_mmr: () => false });
  assert.equal(result.outcome, 'NOT_VERIFIABLE');
  assert.equal(result.checks[5].reason, 'PROOF_INVALID');
  assert.equal(result.checks[6].status, 'NOT_RUN');
});


test('detailed report consumers reject incomplete or contradictory envelopes', () => {
  const valid = browserVerify({ includeDetails: true });
  assert.equal(isCompleteE02Report(valid), true);
  for (const patch of [ { complete: false }, { aborted: 5 }, { checks: valid.checks.slice(0, 5) },
    { reason: 'PROOF_INVALID' }, { checks: valid.checks.map((check, i) => i === 8 ? { ...check, status: 'NOT_RUN' } : check) } ]) {
    assert.equal(isCompleteE02Report({ ...valid, ...patch }), false);
  }
  assert.equal(isCompleteE02Report(browserVerify()), false);
  const unavailable = verifyE02Browser({ refText, anchorText, datasetText: dataset, includeDetails: true }, null);
  assert.equal(unavailable.complete, false);
  assert.equal(unavailable.aborted, 0);
});

const vectorsDir = resolve(root, 'verification/vectors/mmr');
for (const file of readdirSync(vectorsDir).filter(name => /^\d+-leaves\.json$/.test(name))) {
  test(`browser MMR matches frozen vector and WASM: ${file}`, () => {
    const vector = JSON.parse(readFileSync(resolve(vectorsDir, file), 'utf8'));
    const leaves = vector.input.leaves.map(hex => Buffer.from(hex, 'hex'));
    const mmr = createMmr(wasm.blake3_hex);
    const { root: built, peaks, hashes } = mmr.rootOf(leaves);
    assert.equal(Buffer.from(built).toString('hex'), vector.expected_output.root_hash_hex);
    for (const expected of vector.expected_output.proofs) {
      const proof = mmr.proofFor(peaks, hashes, expected.target_index, leaves.length);
      assert.deepEqual(proof.map(step => Buffer.from(step.hash).toString('hex')), expected.inclusion_proof_hashes);
      assert.deepEqual(proof.map(step => step.kind), expected.inclusion_proof_kinds);
      assert.deepEqual(proof.map(step => step.direction), expected.inclusion_proof_directions);
      const json = JSON.stringify(proof.map(step => ({ ...step, hash: Array.from(step.hash) })));
      assert.equal(wasm.verify_mmr(leaves[expected.target_index], leaves.length, json, built), true);
      const corrupted = Uint8Array.from(built); corrupted[0] ^= 1;
      assert.equal(wasm.verify_mmr(leaves[expected.target_index], leaves.length, json, corrupted), false);
    }
  });
}

test('E02 OperationId preimage is domain + kind + NUL + subject bytes; parameters rejected', () => {
  const artifact = JSON.parse(readFileSync(resolve(dir, 'artifacts/stage10-gguf.json'), 'utf8'));
  const parsed = parseArtifact(artifact);
  assert.equal(parsed.ok, true);
  assert.deepEqual(Buffer.from(parsed.opIdPreimage), Buffer.concat([
    Buffer.from('AKG:E02:OP:v1\0'), Buffer.from(artifact.kind), Buffer.from([0]), Buffer.from(artifact.subject, 'hex'),
  ]));
  assert.equal(parseArtifact({ ...artifact, parameters: {} }).ok, false);
});


function receiptWithCount(receipt, n) {
  const changed = structuredClone(receipt);
  const ix = changed.transaction.message.instructions[0];
  const memo = new TextDecoder().decode(unbase58(ix.data)).split(':');
  memo[memo[1] === 'REF' ? 6 : 4] = String(n);
  ix.data = base58(new TextEncoder().encode(memo.join(':')));
  return changed;
}

test('leaf count is bound to dataset leaves, REF memo and ANCHOR memo in both engines', () => {
  const alteredDataset = JSON.stringify({ ...JSON.parse(dataset), n: 1 });
  const scenarios = [
    { data: alteredDataset, reference: ref, anchoring: anchor, reason: 'DATASET_INVALID', stage: 2 },
    { data: dataset, reference: receiptWithCount(ref, 1), anchoring: anchor, reason: 'N_MISMATCH', stage: 4 },
    { data: dataset, reference: ref, anchoring: receiptWithCount(anchor, 1), reason: 'ANCHOR_N_MISMATCH', stage: 6 },
  ];
  for (const item of scenarios) {
    const result = browserVerify({ datasetText: item.data, refText: item.reference, anchorText: item.anchoring, includeDetails: true });
    assert.equal(result.reason, item.reason); assert.equal(result.complete, false); assert.equal(result.aborted, item.stage);
    assert.equal(verifyE02({ dataset: item.data, ref: item.reference, anchor: item.anchoring }).reason, item.reason);
  }
});

test('externally expected leaf count rejects even an internally coherent packet', () => {
  assert.equal(browserVerify({ expectedLeafCount: 2 }).outcome, 'VERIFIED');
  assert.equal(verifyE02({ dataset, ref, anchor, expectedLeafCount: 2 }).outcome, 'VERIFIED');
  const result = browserVerify({ expectedLeafCount: 1, includeDetails: true });
  assert.equal(result.reason, 'EXPECTED_N_MISMATCH'); assert.equal(result.aborted, 4); assert.equal(result.complete, false);
  assert.equal(verifyE02({ dataset, ref, anchor, expectedLeafCount: 1 }).reason, 'EXPECTED_N_MISMATCH');
  for (const invalid of [0, -1, 1.5, '2', 4097]) {
    assert.equal(browserVerify({ expectedLeafCount: invalid }).reason, 'INVALID_INPUT');
  }
});
