import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { base58, MEMO, publicAddress, transaction } from './e01_solana_transport.mjs';
import {
  MMR_PROFILE,
  encodeAnchor,
  encodeReference,
  parseArtifact,
  parseMemo,
  datasetSigningPreimage,
} from './e02_memo_commitment.mjs';
import { createMmr, loadNodeVerifier } from './e02_mmr.mjs';
import { artifactFromLeaf } from './e02_verify.mjs';
import {
  airdrop,
  buildDataset,
  commitDataset,
  confirmSignature,
  createSignerFile,
  findLeafIndex,
  loadDataset,
  loadSigner,
  sendMemo,
  signerFromSeed,
  signDataset,
} from './e02_anchor.mjs';

const wasm = loadNodeVerifier();
const blake3Hex = (bytes) => wasm.blake3_hex(bytes);
const mmr = createMmr(blake3Hex);
const scriptPath = fileURLToPath(new URL('./e02_anchor.mjs', import.meta.url));
const verifyPath = fileURLToPath(new URL('./e02_verify.mjs', import.meta.url));
const hex = (char) => char.repeat(64);
const SEED = '11'.repeat(32);
const BLOCKHASH = base58(Buffer.alloc(32, 7));

test('dataset provenance signs the canonical domain-separated body and detects tampering', () => {
  const source = JSON.parse(readFileSync(new URL('../apps/arkhe-intra/public/e02/fixtures/dataset.json', import.meta.url), 'utf8'));
  const signer = signerFromSeed(SEED);
  const signed = signDataset(source, signer);
  assert.equal(signed.provenance.kid, publicAddress(signer));
  assert.equal(verify(null, datasetSigningPreimage(signed), signer.publicKey,
    Buffer.from(signed.provenance.sig, 'hex')), true);
  assert.equal(verify(null, datasetSigningPreimage({ ...signed, root: '00'.repeat(32) }), signer.publicKey,
    Buffer.from(signed.provenance.sig, 'hex')), false);
  assert.deepEqual(signDataset(signed, signer), signed);
  assert.throws(() => signDataset({ ...source, root: '00'.repeat(32) }, signer), /ROOT_MISMATCH/);
});

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'e02-anchor-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function artifactText(name, label = 'synthetic-poc') {
  return JSON.stringify({
    artifact: name,
    kind: 'e01-run',
    label,
    producer: hex('1'),
    subject: hex('2'),
    v: 1,
  });
}

function fixture() {
  const signer = signerFromSeed(SEED);
  const address = publicAddress(signer);
  const dataset = buildDataset([artifactText('run-a'), artifactText('run-b')]);
  const datasetText = JSON.stringify(dataset);
  const bytes = Buffer.from(datasetText, 'utf8');
  const digest = blake3Hex(bytes);
  const anchorMemo = encodeAnchor({ root: dataset.root, n: dataset.n, datasetDigest: digest });
  const anchorSig = transaction(signer, BLOCKHASH, Buffer.from(anchorMemo, 'ascii')).signature;
  const leaf = Buffer.from(dataset.leaves[1], 'hex');
  const artifact = artifactFromLeaf(leaf);
  const refMemo = encodeReference({
    opId: blake3Hex(artifact.opIdPreimage),
    leafHash: mmr.leafHash(leaf).toString('hex'),
    root: dataset.root,
    n: dataset.n,
    anchorRef: anchorSig,
  });
  return { signer, address, dataset, datasetText, bytes, digest, anchorMemo, anchorSig, refMemo };
}

function receiptFor(signature, memo, payer) {
  return {
    slot: 42,
    meta: { err: null, fee: 5000 },
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [payer, MEMO],
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 1,
        },
        instructions: [
          {
            programIdIndex: 1,
            accounts: [0],
            data: base58(Buffer.from(memo, 'ascii')),
          },
        ],
      },
    },
  };
}

function rpcMock(memos, address) {
  const sent = [];
  const receipts = new Map();
  const calls = [];
  const rpcCall = async (method, params) => {
    calls.push(method);
    if (method === 'getLatestBlockhash') {
      return { context: { slot: 1 }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 99 } };
    }
    if (method === 'sendTransaction') {
      const wire = Buffer.from(params[0], 'base64');
      const signature = base58(wire.subarray(1, 65));
      const memo = memos[sent.length];
      sent.push({ signature, memo, wire, options: params[1] });
      receipts.set(signature, receiptFor(signature, memo, address));
      return signature;
    }
    if (method === 'getSignatureStatuses') {
      return {
        context: { slot: 2 },
        value: [{ slot: 2, confirmationStatus: 'confirmed', err: null }],
      };
    }
    if (method === 'getTransaction') return receipts.get(params[0]) ?? null;
    if (method === 'requestAirdrop') return base58(Buffer.alloc(64, 8));
    throw new Error(`unexpected:${method}`);
  };
  return { rpcCall, sent, calls };
}

test('keypair files hold only a seed and round-trip', (t) => {
  const dir = tempDir(t);
  const path = join(dir, 'seed.txt');
  const address = createSignerFile(path);
  assert.equal(publicAddress(loadSigner(path)), address);
  assert.match(readFileSync(path, 'utf8'), /^[0-9a-f]{64}\n$/);
  assert.throws(() => createSignerFile(path), (error) => error.code === 'EEXIST');
  assert.throws(() => signerFromSeed('ABC'));
  assert.throws(() => signerFromSeed('A'.repeat(64)));
});

test('datasets build from artifacts and recompute their root on load', (t) => {
  const dir = tempDir(t);
  const { dataset, datasetText } = fixture();
  assert.equal(dataset.n, 2);
  assert.equal(dataset.leaves.length, 2);
  assert.equal(dataset.profile.digest, MMR_PROFILE.digest);
  const root = mmr.build(dataset.leaves.map((leaf) => Buffer.from(leaf, 'hex')), 0).root;
  assert.equal(root.toString('hex'), dataset.root);

  const path = join(dir, 'dataset.json');
  writeFileSync(path, datasetText);
  const loaded = loadDataset(path);
  assert.equal(loaded.rootHex, dataset.root);
  assert.equal(loaded.digest, blake3Hex(Buffer.from(datasetText, 'utf8')));

  const tampered = { ...dataset, root: hex('0') };
  writeFileSync(path, JSON.stringify(tampered));
  assert.throws(() => loadDataset(path), /ROOT_MISMATCH/);
  writeFileSync(path, '{}');
  assert.throws(() => loadDataset(path), /DATASET_INVALID/);
  assert.throws(() => buildDataset([artifactText('x', 'production')]), /LABEL_OUT_OF_SCOPE/);
});

test('artifacts are located in the dataset by exact leaf bytes', () => {
  const { dataset } = fixture();
  assert.equal(findLeafIndex(dataset, artifactText('run-b')).index, 1);
  assert.throws(() => findLeafIndex(dataset, artifactText('run-z')), /LEAF_NOT_IN_DATASET/);
  assert.throws(() => findLeafIndex(dataset, '{"v":1}'), /ARTIFACT_INVALID/);
});

test('commitDataset anchors the root and references an artifact', async () => {
  const { signer, address, dataset, bytes, digest, anchorMemo, anchorSig, refMemo } = fixture();
  const mock = rpcMock([anchorMemo, refMemo], address);
  const result = await commitDataset({ datasetBytes: bytes, signer, index: 1, rpcCall: mock.rpcCall });

  assert.equal(result.root, dataset.root);
  assert.equal(result.n, 2);
  assert.equal(result.datasetDigest, digest);
  assert.equal(result.anchor.signature, anchorSig);
  assert.equal(result.anchor.slot, 42);
  assert.equal(result.reference.index, 1);
  assert.equal(result.reference.artifact, 'run-b');

  assert.equal(mock.sent.length, 2);
  assert.equal(mock.sent[0].memo, anchorMemo);
  assert.equal(mock.sent[1].memo, refMemo);
  for (const item of mock.sent) {
    assert.equal(item.wire[0], 1);
    assert.equal(item.options.encoding, 'base64');
    assert.ok(item.wire.length <= 1232);
  }
  assert.equal(parseMemo(anchorMemo).fields.datasetDigest, digest);
  assert.equal(parseMemo(refMemo).fields.anchorRef, anchorSig);
  assert.equal(parseMemo(refMemo).fields.root, dataset.root);
});

test('commitDataset can anchor without a reference', async () => {
  const { signer, address, bytes, anchorMemo } = fixture();
  const mock = rpcMock([anchorMemo], address);
  const result = await commitDataset({ datasetBytes: bytes, signer, index: null, rpcCall: mock.rpcCall });
  assert.equal(result.reference, null);
  assert.equal(mock.sent.length, 1);
});

test('commitDataset refuses inconsistent or out-of-scope input before sending', async () => {
  const { signer, address, dataset, anchorMemo } = fixture();
  const mock = rpcMock([anchorMemo], address);
  const tampered = Buffer.from(JSON.stringify({ ...dataset, root: hex('0') }), 'utf8');
  await assert.rejects(
    commitDataset({ datasetBytes: tampered, signer, index: 0, rpcCall: mock.rpcCall }),
    /ROOT_MISMATCH/,
  );
  assert.equal(mock.calls.length, 0);

  const production = parseArtifact({
    artifact: 'run-p',
    kind: 'e01-run',
    label: 'production',
    producer: hex('1'),
    subject: hex('2'),
    v: 1,
  });
  const leaves = [production.leafBytes];
  const root = mmr.build(leaves, 0).root.toString('hex');
  const outOfScope = Buffer.from(
    JSON.stringify({
      leaves: leaves.map((leaf) => leaf.toString('hex')),
      n: 1,
      profile: { digest: MMR_PROFILE.digest, id: MMR_PROFILE.id, version: 1 },
      root,
      v: 1,
    }),
    'utf8',
  );
  await assert.rejects(
    commitDataset({ datasetBytes: outOfScope, signer, index: 0, rpcCall: mock.rpcCall }),
    /LABEL_OUT_OF_SCOPE/,
  );
  assert.equal(mock.calls.length, 0);
});

test('confirmation fails closed on error and timeout', async () => {
  const { anchorSig } = fixture();
  await assert.rejects(
    confirmSignature(async () => ({ value: [{ err: { InstructionError: [0, 'x'] } }] }), anchorSig),
    /transaction failed/,
  );
  await assert.rejects(
    confirmSignature(async () => ({ value: [null] }), anchorSig, {
      timeoutMs: 0,
      sleep: async () => {},
    }),
    /confirmation timeout/,
  );
  await assert.rejects(confirmSignature(async () => ({ value: [] }), 'nope'), /invalid signature/);
  await assert.rejects(confirmSignature(async () => { throw new DOMException('RPC timeout', 'TimeoutError'); }, anchorSig), /RPC timeout/);
});

test('sendMemo rejects oversized memos and tampered receipts', async () => {
  const { signer, address, anchorSig } = fixture();
  const mock = rpcMock([], address);
  await assert.rejects(
    sendMemo({ signer, memo: 'A'.repeat(567), rpcCall: mock.rpcCall }),
    /MEMO_TOO_LARGE/,
  );

  const wrongMemo = encodeAnchor({ root: hex('a'), n: 1, datasetDigest: hex('b') });
  const tampered = rpcMock([wrongMemo], address);
  await assert.rejects(
    sendMemo({
      signer,
      memo: encodeAnchor({ root: hex('c'), n: 1, datasetDigest: hex('d') }),
      rpcCall: tampered.rpcCall,
    }),
    /receipt mismatch:memo/,
  );
  assert.equal(anchorSig.length > 0, true);
});

test('airdrop confirms the returned signature', async () => {
  const { signer, address } = fixture();
  const mock = rpcMock([], address);
  const signature = await airdrop({ signer, lamports: 1000000000, rpcCall: mock.rpcCall });
  assert.equal(signature, base58(Buffer.alloc(64, 8)));
  assert.ok(mock.calls.includes('requestAirdrop'));
  await assert.rejects(
    airdrop({
      signer,
      lamports: 1,
      rpcCall: async () => {
        throw new Error('RPC HTTP 429');
      },
    }),
    /airdrop failed: RPC HTTP 429/,
  );
});

test('the dataset CLI writes a loadable dataset', (t) => {
  const dir = tempDir(t);
  const first = join(dir, 'a.json');
  const second = join(dir, 'b.json');
  const out = join(dir, 'dataset.json');
  writeFileSync(first, artifactText('run-a'));
  writeFileSync(second, artifactText('run-b'));
  const stdout = execFileSync(
    process.execPath,
    [scriptPath, 'dataset', '--out', out, '--artifact', first, '--artifact', second],
    { encoding: 'utf8' },
  );
  const summary = JSON.parse(stdout);
  assert.equal(summary.n, 2);
  assert.equal(loadDataset(out).rootHex, summary.root);
  assert.equal(loadDataset(out).digest, summary.digest);
});

test('anchor receipts feed the verifier CLI', async (t) => {
  const dir = tempDir(t);
  const { signer, address, bytes, anchorMemo, refMemo } = fixture();
  const mock = rpcMock([anchorMemo, refMemo], address);
  const result = await commitDataset({ datasetBytes: bytes, signer, index: 1, rpcCall: mock.rpcCall });
  const datasetPath = join(dir, 'dataset.json');
  const anchorPath = join(dir, 'anchor.json');
  const refPath = join(dir, 'ref.json');
  writeFileSync(datasetPath, bytes);
  writeFileSync(anchorPath, JSON.stringify(result.anchor.receipt));
  writeFileSync(refPath, JSON.stringify(result.reference.receipt));
  const stdout = execFileSync(
    process.execPath,
    [
      verifyPath,
      '--receipt', refPath,
      '--anchor', anchorPath,
      '--dataset', datasetPath,
    ],
    { encoding: 'utf8' },
  );
  const verdict = JSON.parse(stdout);
  assert.equal(verdict.outcome, 'VERIFIED');
  assert.equal(verdict.observed.anchor_ref, result.anchor.signature);
  assert.equal(verdict.observed.anchor_slot, 42);
  assert.match(verdict.statement, /run-b/);
});
