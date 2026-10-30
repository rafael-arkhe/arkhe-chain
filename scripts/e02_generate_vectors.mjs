// Deterministic synthetic conformance inputs. Never sends transactions.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { base58, MEMO } from './e01_solana_transport.mjs';
import { parseArtifact, MMR_PROFILE, encodeReference, encodeAnchor, canonicalJson } from './e02_memo_commitment.mjs';
import { createMmr, loadNodeVerifier } from './e02_mmr.mjs';
import { signerFromSeed, signDataset } from './e02_anchor.mjs';

const hash = (bytes) => loadNodeVerifier().blake3_hex(bytes);
const mmr = createMmr(hash);
const hex = (char) => char.repeat(64);
const refSig = base58(Buffer.alloc(64, 4));
const anchorSig = base58(Buffer.alloc(64, 5));
const payer = base58(Buffer.alloc(32, 3));
const dir = new URL('../verification/vectors/e02/conformance/', import.meta.url);
mkdirSync(dir, { recursive: true });
const receipt = (signature, memo) => ({ slot: 9, meta: { err: null }, transaction: {
  signatures: [signature], message: { accountKeys: [payer, MEMO],
    header: { numRequiredSignatures: 1 },
    instructions: [{ programIdIndex: 1, accounts: [0], data: base58(Buffer.from(memo)) }] },
} });
function make(n = 5, { proofs = false, signed = false, label = 'synthetic-poc', noncanonical = false, duplicate = false } = {}) {
  const artifacts = Array.from({ length: n }, (_, i) => parseArtifact({
    artifact: `synthetic-vector-${i}`, kind: 'e01-run', label,
    producer: hex('1'), subject: i.toString(16).padStart(64, '0'), v: 1,
  }));
  const leaves = artifacts.map(a => a.leafBytes);
  if (noncanonical) leaves[0] = Buffer.concat([Buffer.from('AKG:E02:LEAF:v1\0'), Buffer.from(JSON.stringify(artifacts[0].value, null, 1))]);
  if (duplicate) leaves[1] = leaves[0];
  const root = mmr.build(leaves, 0).root.toString('hex');
  let dataset = { v: 1, profile: MMR_PROFILE, n, root, leaves: leaves.map(b => b.toString('hex')) };
  if (proofs) dataset.proofs = leaves.map((_, index) => ({ index, steps: mmr.build(leaves, index).proof.map(s => ({ ...s, hash: s.hash.toString('hex') })) }));
  if (signed) dataset = signDataset(dataset, signerFromSeed('11'.repeat(32))); // Public test seed only.
  const datasetText = canonicalJson(dataset);
  const fields = { opId: hash(artifacts[0].opIdPreimage), leafHash: mmr.leafHash(leaves[0]).toString('hex'), root, n, anchorRef: anchorSig };
  return { fields, input: { signature: refSig, receipt: receipt(refSig, encodeReference(fields)),
    anchorReceipt: receipt(anchorSig, encodeAnchor({ root, n, datasetDigest: hash(Buffer.from(datasetText)) })),
    datasetText, datasetOrigin: '<vector>', cluster: 'devnet' } };
}
const vectors = [];
function add(id, input, reason = null, invariants = []) {
  vectors.push({ id, scope: 'synthetic conformance input; receipts are not authenticated', invariants,
    input, expected: { outcome: reason ? 'NOT_VERIFIABLE' : 'VERIFIED', reason } });
}
for (const n of [1, 5, 7]) add(`0${n === 1 ? 1 : n === 5 ? 2 : 3}-positive-n${n}`, make(n).input, null, ['E02-1','E02-2','E02-3','E02-4','E02-5','E02-6','E02-7','E02-8','E02-9','E02-11','E02-13']);
add('04-precomputed-proofs', make(5, { proofs: true }).input, null, ['E02-6']);
add('05-signed-provenance', make(5, { signed: true }).input, null, ['E02-7']);
function refCase(id, change, reason, invariants) {
  const s = make();
  s.input.receipt = receipt(refSig, change(encodeReference(s.fields), s.fields));
  add(id, s.input, reason, invariants);
}
refCase('06-567-bytes', () => 'x'.repeat(567), 'MEMO_TOO_LARGE', ['E02-1','E02-10']);
refCase('07-uppercase-hex', m => { const tokens = m.split(':'); tokens[3] = tokens[3].toUpperCase(); return tokens.join(':'); }, 'MEMO_MALFORMED', ['E02-2']);
refCase('08-leading-zero', m => m.replace(':5:', ':05:'), 'MEMO_MALFORMED', ['E02-2']);
refCase('09-invalid-base58', m => m.slice(0,-1)+'0', 'MEMO_MALFORMED', ['E02-2']);
refCase('10-future-version', m => m.replace(':v1:', ':v2:'), 'MEMO_PROFILE_UNKNOWN', ['E02-1']);
refCase('11-empty-field', m => m.replace(/v1:[^:]+:/, 'v1::'), 'MEMO_MALFORMED', ['E02-1']);
refCase('12-space', m => m+' ', 'MEMO_MALFORMED', ['E02-2']);
refCase('13-leaf-absent', (_, f) => encodeReference({ ...f, leafHash: hex('f') }), 'LEAF_NOT_IN_DATASET', ['E02-3']);
add('14-ambiguous-leaf', make(5, { duplicate: true }).input, 'LEAF_AMBIGUOUS', ['E02-3']);
function datasetCase(id, mutate, reason, invariants) {
  const s = make(5, { proofs: true });
  const d = JSON.parse(s.input.datasetText);
  mutate(d);
  s.input.datasetText = canonicalJson(d);
  add(id, s.input, reason, invariants);
}
datasetCase('15-root-mismatch', d => { d.root = hex('f'); }, 'ROOT_MISMATCH', ['E02-4']);
refCase('16-n-mismatch', (_, f) => encodeReference({ ...f, n: 4 }), 'N_MISMATCH', ['E02-5']);
datasetCase('17-wrong-precomputed-proof', d => { d.proofs[0].steps = d.proofs[1].steps; }, 'PROOF_INVALID', ['E02-6']);
const missing = make().input; missing.anchorReceipt = null;
add('18-missing-anchor', missing, 'ANCHOR_NOT_FOUND', ['E02-7']);
function anchorCase(id, change, reason, invariants) {
  const s = make();
  s.input.anchorReceipt = receipt(anchorSig, encodeAnchor(change({ root: s.fields.root, n: 5, datasetDigest: hash(Buffer.from(s.input.datasetText)) })));
  add(id, s.input, reason, invariants);
}
anchorCase('19-anchor-root', f => ({ ...f, root: hex('f') }), 'ANCHOR_ROOT_MISMATCH', ['E02-4']);
anchorCase('20-anchor-digest', f => ({ ...f, datasetDigest: hex('f') }), 'ANCHOR_DATASET_MISMATCH', ['E02-7']);
refCase('21-arbitrary-op', (_, f) => encodeReference({ ...f, opId: hex('f') }), 'OP_ID_MISMATCH', ['E02-8']);
add('22-production', make(1, { label: 'production' }).input, 'LABEL_OUT_OF_SCOPE', ['E02-9']);
datasetCase('23-4097-leaves', d => { d.n = 4097; d.leaves = Array(4097).fill('00'); }, 'DATASET_INVALID', ['E02-10']);
const duplicateKeys = make().input; duplicateKeys.datasetText = duplicateKeys.datasetText.replace('{', '{"v":1,');
add('24-duplicate-json-key', duplicateKeys, 'DATASET_INVALID', ['E02-2']);
const failed = make().input; failed.receipt.meta.err = { InstructionError: [0, 'invalid'] };
add('25-failed-transaction', failed, 'TX_FAILED', ['E02-10']);
for (const count of [0, 2]) {
  const s = make().input;
  s.receipt.transaction.message.instructions = Array(count).fill(s.receipt.transaction.message.instructions[0]);
  add(`26-${count}-memos`, s, count ? 'MEMO_MULTIPLE' : 'MEMO_MISSING', ['E02-1']);
}
add('27-noncanonical-artifact', make(1, { noncanonical: true }).input, 'ARTIFACT_INVALID', ['E02-2']);
anchorCase('28-anchor-n', f => ({ ...f, n: 4 }), 'ANCHOR_N_MISMATCH', ['E02-5']);
datasetCase('29-leaf-1041-bytes', d => { d.leaves[0] = '00'.repeat(1041); }, 'DATASET_INVALID', ['E02-10']);
datasetCase('30-proof-33-steps', d => { d.proofs[0].steps = Array(33).fill(d.proofs[0].steps[0]); }, 'DATASET_INVALID', ['E02-6']);
datasetCase('31-provenance-malformed', d => { d.provenance = { kid: 'unknown', sig: 'f'.repeat(127) }; }, 'DATASET_INVALID', ['E02-10']);
for (const v of vectors) writeFileSync(new URL(`${v.id}.json`, dir), JSON.stringify(v, null, 2)+'\n');
console.log(`${vectors.length} conformance vectors written to ${fileURLToPath(dir)}`);
