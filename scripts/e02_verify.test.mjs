import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base58, MEMO } from './e01_solana_transport.mjs';
import {
  MMR_PROFILE,
  encodeAnchor,
  encodeReference,
  parseArtifact,
} from './e02_memo_commitment.mjs';
import { createMmr, loadNodeVerifier } from './e02_mmr.mjs';
import { receiptFacts, verifyReference } from './e02_verify.mjs';

const wasm = loadNodeVerifier();
const blake3Hex = (bytes) => wasm.blake3_hex(bytes);
const mmr = createMmr(blake3Hex);
const hex = (char) => char.repeat(64);
const payer = base58(Buffer.alloc(32, 3));
const refSig = base58(Buffer.alloc(64, 4));
const anchorSig = base58(Buffer.alloc(64, 5));
const LEAF_PREFIX = Buffer.from('AKG:E02:LEAF:v1\0', 'ascii');

function artifact(name, label = 'synthetic-poc') {
  return {
    artifact: name,
    kind: name === 'run-c' ? 'gguf-supply-chain' : 'e01-run',
    label,
    producer: hex('1'),
    subject: hex('2'),
    v: 1,
  };
}

function scenario({ label = 'synthetic-poc', extra = {} } = {}) {
  const items = ['run-a', 'run-b', 'run-c'].map((name) => parseArtifact(artifact(name, label)));
  const leaves = items.map((item) => item.leafBytes);
  const { root, proof } = mmr.build(leaves, 1);
  const rootHex = root.toString('hex');
  const datasetText = JSON.stringify({
    leaves: leaves.map((leaf) => leaf.toString('hex')),
    n: 3,
    profile: { digest: MMR_PROFILE.digest, id: MMR_PROFILE.id, version: 1 },
    root: rootHex,
    v: 1,
    ...extra,
  });
  const datasetDigest = blake3Hex(Buffer.from(datasetText, 'utf8'));
  const refMemo = encodeReference({
    opId: blake3Hex(items[1].opIdPreimage),
    leafHash: mmr.leafHash(leaves[1]).toString('hex'),
    root: rootHex,
    n: 3,
    anchorRef: anchorSig,
  });
  const anchorMemo = encodeAnchor({ root: rootHex, n: 3, datasetDigest });
  return { items, leaves, root, proof, rootHex, datasetText, datasetDigest, refMemo, anchorMemo };
}

function receipt(signature, memos, { slot = 9, err = null } = {}) {
  const list = (Array.isArray(memos) ? memos : [memos]).map((text) => ({
    programIdIndex: 1,
    accounts: [0],
    data: base58(Buffer.from(text, 'ascii')),
  }));
  return {
    slot,
    meta: { err, fee: 5000 },
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [payer, MEMO],
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 1,
        },
        instructions: list,
      },
    },
  };
}

function run(overrides = {}) {
  const state = scenario();
  return verifyReference({
    signature: refSig,
    receipt: receipt(refSig, state.refMemo),
    anchorReceipt: receipt(anchorSig, state.anchorMemo),
    datasetText: state.datasetText,
    ...overrides,
  });
}

test('a consistent reference and anchor verify offline', () => {
  const state = scenario();
  const result = run();
  assert.equal(result.outcome, 'VERIFIED');
  assert.equal(result.reason, null);
  assert.equal(result.observed.root, state.rootHex);
  assert.equal(result.observed.n, 3);
  assert.equal(result.observed.anchor_ref, anchorSig);
  assert.equal(result.observed.anchor_slot, 9);
  assert.equal(result.observed.anchor_payer, payer);
  assert.equal(result.observed.cluster, 'devnet');
  assert.equal(result.observed.dataset_digest, state.datasetDigest);
  assert.equal(result.observed.signed, false);
  assert.equal(result.observed.provenance_kid, null);
  assert.match(result.statement, /run-b/);
  assert.match(result.statement, /não prova quem produziu/);
});

test('receipt decoding accepts jsonParsed account keys', () => {
  const state = scenario();
  const parsedReceipt = receipt(refSig, state.refMemo);
  parsedReceipt.transaction.message.accountKeys = [{ pubkey: payer }, { pubkey: MEMO }];
  const facts = receiptFacts(parsedReceipt, refSig);
  assert.equal(facts.ok, true);
  assert.equal(facts.payer, payer);
  assert.equal(facts.slot, 9);
});

test('failed, missing and mismatched receipts fail closed', () => {
  const state = scenario();
  assert.equal(run({ receipt: receipt(refSig, state.refMemo, { err: { InstructionError: [0, 'x'] } }) }).reason, 'TX_FAILED');
  assert.equal(run({ receipt: receipt(refSig, []) }).reason, 'MEMO_MISSING');
  assert.equal(run({ receipt: receipt(refSig, [state.refMemo, state.refMemo]) }).reason, 'MEMO_MULTIPLE');
  assert.equal(run({ receipt: receipt(refSig, state.refMemo, { slot: 1.5 }) }).reason, 'RECEIPT_MISMATCH');
  const other = base58(Buffer.alloc(64, 6));
  assert.equal(run({ signature: other }).reason, 'RECEIPT_MISMATCH');
  assert.equal(run({ receipt: undefined }).reason, 'RECEIPT_MISSING');
  assert.equal(run({ signature: 'not-base58' }).reason, 'INVALID_INPUT');
  assert.equal(run({ receipt: receipt(refSig, 'hello') }).reason, 'MEMO_PROFILE_UNKNOWN');
});

test('only devnet is in scope', () => {
  assert.equal(run({ cluster: 'mainnet-beta' }).reason, 'CLUSTER_NOT_ALLOWED');
});

test('dataset and commitment mismatches map to distinct reasons', () => {
  const state = scenario();
  assert.equal(run({ datasetText: '{}' }).reason, 'DATASET_INVALID');
  const tamperedRoot = state.datasetText.replace(/"root":"[0-9a-f]{64}"/, `"root":"${hex('0')}"`);
  assert.equal(run({ datasetText: tamperedRoot }).reason, 'ROOT_MISMATCH');

  const wrongN = encodeReference({
    opId: blake3Hex(state.items[1].opIdPreimage),
    leafHash: mmr.leafHash(state.leaves[1]).toString('hex'),
    root: state.rootHex,
    n: 4,
    anchorRef: anchorSig,
  });
  assert.equal(run({ receipt: receipt(refSig, wrongN) }).reason, 'N_MISMATCH');

  const unknownLeaf = encodeReference({
    opId: blake3Hex(state.items[1].opIdPreimage),
    leafHash: hex('f'),
    root: state.rootHex,
    n: 3,
    anchorRef: anchorSig,
  });
  assert.equal(run({ receipt: receipt(refSig, unknownLeaf) }).reason, 'LEAF_NOT_IN_DATASET');

  const wrongRoot = encodeReference({
    opId: blake3Hex(state.items[1].opIdPreimage),
    leafHash: mmr.leafHash(state.leaves[1]).toString('hex'),
    root: hex('a'),
    n: 3,
    anchorRef: anchorSig,
  });
  assert.equal(run({ receipt: receipt(refSig, wrongRoot) }).reason, 'ROOT_MISMATCH');

  const wrongOp = encodeReference({
    opId: hex('f'),
    leafHash: mmr.leafHash(state.leaves[1]).toString('hex'),
    root: state.rootHex,
    n: 3,
    anchorRef: anchorSig,
  });
  assert.equal(run({ receipt: receipt(refSig, wrongOp) }).reason, 'OP_ID_MISMATCH');
});

test('duplicate leaves are ambiguous', () => {
  const state = scenario();
  const leaves = [state.leaves[0], state.leaves[1], state.leaves[1]];
  const rootHex = mmr.build(leaves, 1).root.toString('hex');
  const datasetText = JSON.stringify({
    leaves: leaves.map((leaf) => leaf.toString('hex')),
    n: 3,
    profile: { digest: MMR_PROFILE.digest, id: MMR_PROFILE.id, version: 1 },
    root: rootHex,
    v: 1,
  });
  const digest = blake3Hex(Buffer.from(datasetText, 'utf8'));
  const memo = encodeReference({
    opId: blake3Hex(state.items[1].opIdPreimage),
    leafHash: mmr.leafHash(state.leaves[1]).toString('hex'),
    root: rootHex,
    n: 3,
    anchorRef: anchorSig,
  });
  const result = verifyReference({
    signature: refSig,
    receipt: receipt(refSig, memo),
    anchorReceipt: receipt(anchorSig, encodeAnchor({ root: rootHex, n: 3, datasetDigest: digest })),
    datasetText,
  });
  assert.equal(result.reason, 'LEAF_AMBIGUOUS');
});

test('anchor mismatches are reported before the artifact claim', () => {
  const state = scenario();
  assert.equal(run({ anchorReceipt: undefined }).reason, 'ANCHOR_NOT_FOUND');
  assert.equal(
    run({ anchorReceipt: receipt(anchorSig, encodeAnchor({ root: hex('a'), n: 3, datasetDigest: state.datasetDigest })) }).reason,
    'ANCHOR_ROOT_MISMATCH',
  );
  assert.equal(
    run({ anchorReceipt: receipt(anchorSig, encodeAnchor({ root: state.rootHex, n: 4, datasetDigest: state.datasetDigest })) }).reason,
    'ANCHOR_N_MISMATCH',
  );
  assert.equal(
    run({ anchorReceipt: receipt(anchorSig, encodeAnchor({ root: state.rootHex, n: 3, datasetDigest: hex('b') })) }).reason,
    'ANCHOR_DATASET_MISMATCH',
  );
  assert.equal(
    run({ anchorReceipt: receipt(anchorSig, state.anchorMemo, { err: { InstructionError: [0, 'x'] } }) }).reason,
    'TX_FAILED',
  );
});

test('production artifacts parse but are out of scope for v1', () => {
  const state = scenario({ label: 'production' });
  const result = verifyReference({
    signature: refSig,
    receipt: receipt(refSig, state.refMemo),
    anchorReceipt: receipt(anchorSig, state.anchorMemo),
    datasetText: state.datasetText,
  });
  assert.equal(result.reason, 'LABEL_OUT_OF_SCOPE');
});

test('provenance is surfaced but does not change the commitment', () => {
  const unsigned = scenario();
  const signed = scenario({ extra: { provenance: { kid: 'arkhe-poc', sig: 'f'.repeat(128) } } });
  assert.notEqual(unsigned.datasetDigest, signed.datasetDigest);
  const result = run({
    receipt: receipt(refSig, signed.refMemo),
    anchorReceipt: receipt(anchorSig, signed.anchorMemo),
    datasetText: signed.datasetText,
  });
  assert.equal(result.outcome, 'VERIFIED');
  assert.equal(result.observed.signed, true);
  assert.equal(result.observed.provenance_kid, 'arkhe-poc');
});

test('non-canonical artifact bytes inside a valid leaf are rejected', () => {
  const source = artifact('run-a');
  const parsed = parseArtifact(source);
  const leaf = Buffer.concat([
    LEAF_PREFIX,
    Buffer.from(JSON.stringify(source, null, 1), 'utf8'),
  ]);
  const rootHex = mmr.build([leaf], 0).root.toString('hex');
  const datasetText = JSON.stringify({
    leaves: [leaf.toString('hex')],
    n: 1,
    profile: { digest: MMR_PROFILE.digest, id: MMR_PROFILE.id, version: 1 },
    root: rootHex,
    v: 1,
  });
  const memo = encodeReference({
    opId: blake3Hex(parsed.opIdPreimage),
    leafHash: mmr.leafHash(leaf).toString('hex'),
    root: rootHex,
    n: 1,
    anchorRef: anchorSig,
  });
  const digest = blake3Hex(Buffer.from(datasetText, 'utf8'));
  const result = verifyReference({
    signature: refSig,
    receipt: receipt(refSig, memo),
    anchorReceipt: receipt(anchorSig, encodeAnchor({ root: rootHex, n: 1, datasetDigest: digest })),
    datasetText,
  });
  assert.equal(result.reason, 'ARTIFACT_INVALID');
});

test('a negative result never claims verification', () => {
  const result = run({ datasetText: '{}' });
  assert.equal(result.outcome, 'NOT_VERIFIABLE');
  assert.match(result.statement, /^Não verificável \(DATASET_INVALID\)/);
});
