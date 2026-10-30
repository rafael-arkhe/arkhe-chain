import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import { unbase58 } from './e01_solana_transport.mjs';
import { verifyReference, OBSERVATION_WARNING } from './e02_verify.mjs';
import { parseDataset, parseMemo, encodeReference, MAX_DATASET_BYTES, datasetSigningPreimage } from './e02_memo_commitment.mjs';
import { loadNodeVerifier } from './e02_mmr.mjs';
import { verifyE02Browser, parseDataset as parseBrowserDataset, parseMemo as parseBrowserMemo } from '../apps/arkhe-intra/lib/e02-browser.mjs';

const dir = new URL('../verification/vectors/e02/conformance/', import.meta.url);
const wasm = loadNodeVerifier();
const vectors = readdirSync(dir).filter(n => n.endsWith('.json')).sort()
  .map(n => JSON.parse(readFileSync(new URL(n, dir), 'utf8')));
const browserInput = i => ({ signature: i.signature, refText: i.receipt,
  anchorText: i.anchorReceipt, datasetText: i.datasetText, cluster: i.cluster, datasetOrigin: i.datasetOrigin });

test('positive provenance vector has a valid Ed25519 signature independently of the verifier', () => {
  const dataset = JSON.parse(vectors.find(v => v.id === '05-signed-provenance').input.datasetText);
  const publicKey = createPublicKey({ key: Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'), unbase58(dataset.provenance.kid),
  ]), format: 'der', type: 'spki' });
  assert.equal(verify(null, datasetSigningPreimage(dataset), publicKey, Buffer.from(dataset.provenance.sig, 'hex')), true);
});

test('all pure wire vectors have identical Node and browser parser results', () => {
  const wireDir = new URL('../verification/vectors/e02/', import.meta.url);
  for (const name of readdirSync(wireDir).filter(n => n.endsWith('.json'))) {
    const vector = JSON.parse(readFileSync(new URL(name, wireDir), 'utf8'));
    for (const input of [vector.input, Buffer.from(vector.input)]) {
      assert.deepEqual(parseBrowserMemo(input), parseMemo(input));
    }
  }
});

for (const vector of vectors) {
  test(`E02 conformance ${vector.id} (Node and browser WASM)`, () => {
    const before = JSON.stringify(vector.input);
    const node = verifyReference(vector.input);
    const browser = verifyE02Browser(browserInput(vector.input), wasm);
    assert.deepEqual(browser, node);
    assert.equal(node.outcome, vector.expected.outcome);
    assert.equal(node.reason, vector.expected.reason);
    assert.equal(node.observation_warning, OBSERVATION_WARNING);
    if (node.outcome === 'VERIFIED') {
      assert.match(node.statement, /não prova quem produziu.*nem que ele é verdadeiro/);
    } else {
      assert.equal(node.statement, `Não verificável (${node.reason}). Nenhuma afirmação foi confirmada.`);
      assert.doesNotMatch(node.statement, /verificado/i);
    }
    assert.equal(JSON.stringify(vector.input), before);
  });
}

test('16 MiB boundary is measured in UTF-8 bytes before dataset parsing in both engines', () => {
  const input = vectors.find(v => v.expected.outcome === 'VERIFIED').input;
  const exact = input.datasetText + ' '.repeat(MAX_DATASET_BYTES - Buffer.byteLength(input.datasetText));
  assert.equal(parseDataset(exact).ok, true);
  assert.equal(parseBrowserDataset(exact).ok, true);
  assert.equal(parseDataset(exact + ' ').detail, 'size');
  assert.equal(parseDataset(exact.slice(0, -1) + 'é').detail, 'size');
  for (const text of [exact + ' ', exact.slice(0, -1) + 'é']) {
    const changed = { ...input, datasetText: text };
    assert.equal(verifyReference(changed).reason, 'DATASET_INVALID');
    assert.equal(verifyE02Browser(browserInput(changed), wasm).reason, 'DATASET_INVALID');
  }
});

test('dataset structural limits accept boundaries and reject boundary plus one', () => {
  const d = JSON.parse(vectors[0].input.datasetText);
  for (const parser of [parseDataset, parseBrowserDataset]) {
  assert.equal(parser({ ...d, n: 4096, leaves: Array(4096).fill('00') }).ok, true);
  assert.equal(parser({ ...d, n: 4097, leaves: Array(4097).fill('00') }).ok, false);
  assert.equal(parser({ ...d, n: 1, leaves: ['00'.repeat(1040)] }).ok, true);
  assert.equal(parser({ ...d, n: 1, leaves: ['00'.repeat(1041)] }).ok, false);
  const step = { kind: 'node', direction: 'left', hash: '0'.repeat(64) };
  assert.equal(parser({ ...d, proofs: [{ index: 0, steps: Array(32).fill(step) }] }).ok, true);
  assert.equal(parser({ ...d, proofs: [{ index: 0, steps: Array(33).fill(step) }] }).ok, false);
  }
});

test('memo numeric, separator and encoding rejection cases are explicit', () => {
  const good = encodeReference({ opId: 'a'.repeat(64), leafHash: 'b'.repeat(64), root: 'c'.repeat(64), n: 1, anchorRef: '1'.repeat(64) });
  for (const invalid of [good + '\n', good + ':', good.replace(':1:', ':0:'),
    good.replace(':1:', ':+1:'), good.replace(':1:', ':-1:'), good.replace(':1:', ':4294967296:'),
    good.replace('v1:', 'v1:0x'), good.replace('v1:', 'v1:['), good.replace('v1:', 'v1::'),
    good + '1']) {
    assert.equal(parseMemo(invalid).ok, false, invalid);
    assert.equal(parseMemo(Buffer.from(invalid)).ok, false);
  }
});

test('exceptions fail closed and browser WASM errors never become success', () => {
  const input = vectors[0].input;
  assert.equal(verifyReference({ ...input, receipt: { get meta() { throw Error('bad receipt'); } } }).reason, 'INVALID_INPUT');
  const throwingWasm = { blake3_hex() { throw Error('WASM unavailable'); }, verify_mmr() { throw Error('unreachable'); } };
  const result = verifyE02Browser(browserInput(input), throwingWasm);
  assert.equal(result.outcome, 'NOT_VERIFIABLE');
  assert.equal(result.observation_warning, OBSERVATION_WARNING);
});

test('a divergent precomputed proof for a non-target leaf is also rejected', () => {
  const input = structuredClone(vectors.find(v => v.id === '04-precomputed-proofs').input);
  const dataset = JSON.parse(input.datasetText);
  dataset.proofs[4].steps = dataset.proofs[0].steps;
  input.datasetText = JSON.stringify(dataset);
  assert.equal(verifyReference(input).reason, 'PROOF_INVALID');
  assert.equal(verifyE02Browser(browserInput(input), wasm).reason, 'PROOF_INVALID');
});

test('real devnet smoke remains reproducible with the observation warning in both engines', () => {
  const smoke = new URL('../docs/evidence/2026-10-23-e02-devnet-smoke/', import.meta.url);
  const receipt = JSON.parse(readFileSync(new URL('ref.json', smoke), 'utf8'));
  const input = { signature: receipt.transaction.signatures[0], receipt,
    anchorReceipt: JSON.parse(readFileSync(new URL('anchor.json', smoke), 'utf8')),
    datasetText: readFileSync(new URL('dataset.json', smoke), 'utf8'), datasetOrigin: '<smoke>' };
  const node = verifyReference(input);
  assert.equal(node.outcome, 'VERIFIED');
  assert.equal(node.observation_warning, OBSERVATION_WARNING);
  assert.deepEqual(verifyE02Browser(browserInput(input), wasm), node);
});

test('coherent fabricated receipts can pass but always declare the observation trust boundary', () => {
  const input = structuredClone(vectors[0].input);
  input.receipt.slot = 999999;
  input.anchorReceipt.slot = 999998;
  input.anchorReceipt.transaction.message.accountKeys[0] = '1'.repeat(32);
  const result = verifyReference(input);
  assert.equal(result.outcome, 'VERIFIED');
  assert.equal(result.observed.anchor_payer, '1'.repeat(32));
  assert.equal(result.observed.anchor_slot, 999998);
  assert.match(result.observation_warning, /não autentica recibos RPC/);
  assert.deepEqual(verifyE02Browser(browserInput(input), wasm), result);
});

test('E02-12 verifier runs without write permission or signing and preserves its inputs', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'e02-readonly-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const verifierUrl = new URL('./e02_verify.mjs', import.meta.url).href;
  const vectorUrl = new URL('01-positive-n1.json', dir).href;
  const code = `
    import crypto from 'node:crypto';
    import {syncBuiltinESMExports} from 'node:module';
    import {readFileSync} from 'node:fs';
    crypto.sign = () => { throw Error('signing forbidden'); };
    crypto.generateKeyPairSync = () => { throw Error('key generation forbidden'); };
    syncBuiltinESMExports();
    const {verifyReference} = await import(${JSON.stringify(verifierUrl)});
    const {input} = JSON.parse(readFileSync(new URL(${JSON.stringify(vectorUrl)}), 'utf8'));
    const freeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } };
    freeze(input);
    console.log(JSON.stringify(verifyReference(input)));
  `;
  const stdout = execFileSync(process.execPath, ['--permission', '--allow-fs-read=*', '--input-type=module', '-e', code], { cwd: scratch, encoding: 'utf8' });
  assert.equal(JSON.parse(stdout).outcome, 'VERIFIED');
  assert.deepEqual(readdirSync(scratch), []);
});
