import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { base58 } from './e01_solana_transport.mjs';
import {
  ANCHOR_PREFIX,
  ARTIFACT_KINDS,
  DOMAINS,
  MAX_MEMO_BYTES,
  MMR_PROFILE,
  REF_PREFIX,
  canonicalJson,
  datasetSigningPreimage,
  encodeAnchor,
  encodeReference,
  isLeafCount,
  isSignature,
  parseArtifact,
  parseDataset,
  parseJsonStrict,
  parseMemo,
} from './e02_memo_commitment.mjs';

const sig = (fill) => base58(Buffer.alloc(64, fill));
const hex = (char) => char.repeat(64);

const wireVectors = new URL('../verification/vectors/e02/', import.meta.url);
for (const name of readdirSync(wireVectors).filter((name) => name.endsWith('.json')).sort()) {
  const vector = JSON.parse(readFileSync(new URL(name, wireVectors), 'utf8'));
  test(`E02 wire golden vector ${vector.id}`, () => {
    for (const input of [vector.input, Buffer.from(vector.input, 'utf8')]) {
      const result = parseMemo(input);
      for (const [key, value] of Object.entries(vector.expected)) assert.equal(result[key], value);
      if (result.ok) {
        const encode = result.profile === 'ref' ? encodeReference : encodeAnchor;
        assert.equal(encode(result.fields), vector.input);
      }
    }
  });
}

function artifact(overrides = {}) {
  return {
    artifact: 'e01 sm newsletter run',
    kind: 'e01-run',
    label: 'synthetic-poc',
    producer: hex('1'),
    subject: hex('2'),
    v: 1,
    ...overrides,
  };
}

function dataset(overrides = {}) {
  return {
    leaves: ['00', 'abcd', 'ff00'],
    n: 3,
    profile: { id: MMR_PROFILE.id, version: 1, digest: MMR_PROFILE.digest },
    root: hex('d'),
    v: 1,
    ...overrides,
  };
}

test('reference memo round-trips and stays inside the byte budget', () => {
  const fields = { opId: hex('a'), leafHash: hex('b'), root: hex('c'), n: 5, anchorRef: sig(7) };
  const memo = encodeReference(fields);
  assert.ok(memo.startsWith(`${REF_PREFIX}:`));
  assert.ok(Buffer.byteLength(memo, 'ascii') <= MAX_MEMO_BYTES);
  const parsed = parseMemo(memo);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.profile, 'ref');
  assert.deepEqual(parsed.fields, fields);
});

test('anchor memo round-trips', () => {
  const fields = { root: hex('c'), n: 4294967295, datasetDigest: hex('e') };
  const memo = encodeAnchor(fields);
  assert.ok(memo.startsWith(`${ANCHOR_PREFIX}:`));
  const parsed = parseMemo(Buffer.from(memo, 'ascii'));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.profile, 'anchor');
  assert.deepEqual(parsed.fields, fields);
});

test('parser rejects non-ASCII, oversized and empty memos', () => {
  assert.equal(parseMemo('ARKHE:REF:v1:ç').detail, 'non_ascii');
  assert.equal(parseMemo('A'.repeat(MAX_MEMO_BYTES + 1)).reason, 'MEMO_TOO_LARGE');
  assert.equal(parseMemo('').detail, 'empty');
  assert.equal(parseMemo(42).detail, 'type');
});

test('parser rejects unknown profiles and versions', () => {
  assert.equal(parseMemo('ARKHE:OTHER:v1:x').reason, 'MEMO_PROFILE_UNKNOWN');
  assert.equal(parseMemo('ARKHE:REF:v2:x').reason, 'MEMO_PROFILE_UNKNOWN');
  assert.equal(parseMemo('NOPE:REF:v1:x').reason, 'MEMO_PROFILE_UNKNOWN');
});

test('parser rejects malformed references with specific details', () => {
  const good = encodeReference({ opId: hex('a'), leafHash: hex('b'), root: hex('c'), n: 5, anchorRef: sig(7) });
  const tokens = good.split(':');
  const join = (parts) => parts.join(':');

  assert.equal(parseMemo(join([...tokens.slice(0, 4), hex('A'), ...tokens.slice(5)])).detail, 'leaf_hash');
  assert.equal(parseMemo(join([...tokens.slice(0, 4), hex('a').slice(0, 63), ...tokens.slice(5)])).detail, 'leaf_hash');
  assert.equal(parseMemo(join([...tokens.slice(0, 6), '05', ...tokens.slice(7)])).detail, 'n');
  assert.equal(parseMemo(join([...tokens.slice(0, 6), '0', ...tokens.slice(7)])).detail, 'n');
  assert.equal(parseMemo(join([...tokens.slice(0, 6), '4294967296', ...tokens.slice(7)])).detail, 'n');
  assert.equal(parseMemo(`${good.slice(0, -1)}0`).detail, 'anchor_ref');
  assert.equal(parseMemo(good.replace('ARKHE:REF:v1:', 'ARKHE:REF:v1: ')).detail, 'non_ascii');
  assert.equal(parseMemo(join([...tokens.slice(0, 7)])).detail, 'field_count');
  assert.equal(parseMemo(`${good}:${hex('a')}`).detail, 'field_count');
});

test('parser enforces canonical base58', () => {
  assert.equal(isSignature('1'.repeat(64)), true);
  assert.equal(isSignature('1'.repeat(63)), false);
  assert.equal(isSignature(`${'1'.repeat(64)}1`), false);
  assert.equal(isSignature(sig(7).replace(/.$/, '0')), false);
});

test('leaf count bounds are enforced', () => {
  assert.equal(isLeafCount(1), true);
  assert.equal(isLeafCount(0xffffffff), true);
  assert.equal(isLeafCount(0), false);
  assert.equal(isLeafCount(0x100000000), false);
  assert.equal(isLeafCount('4294967295'), true);
  assert.equal(isLeafCount('04294967295'), false);
});

test('canonical JSON sorts keys and rejects non-ASCII or floats', () => {
  assert.equal(
    canonicalJson({ v: 1, kind: 'e01-run', label: 'synthetic-poc' }),
    '{"kind":"e01-run","label":"synthetic-poc","v":1}',
  );
  assert.throws(() => canonicalJson({ a: 1.5 }));
  assert.throws(() => canonicalJson({ a: 'ç' }));
  assert.throws(() => canonicalJson({ a: undefined }));
});

test('artifact parsing produces leaf and op_id preimages', () => {
  const parsed = parseArtifact(artifact());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.inScope, true);
  assert.deepEqual(parsed.leafBytes.subarray(0, 16), Buffer.from(DOMAINS.leaf, 'ascii'));
  assert.deepEqual(parsed.opIdPreimage.subarray(0, 14), Buffer.from(DOMAINS.op, 'ascii'));
  assert.deepEqual(parsed.opIdPreimage.subarray(14, 21), Buffer.from('e01-run', 'utf8'));
  assert.equal(parsed.opIdPreimage[21], 0x00);
  assert.equal(parsed.opIdPreimage.length, 14 + 7 + 1 + 32);
});

test('artifact parsing rejects foreign keys, bad kinds and malformed JSON', () => {
  assert.equal(parseArtifact(artifact({ extra: 1 })).detail, 'keys');
  assert.equal(parseArtifact(artifact({ kind: 'other' })).detail, 'kind');
  assert.equal(parseArtifact(artifact({ label: 'production' })).ok, true);
  assert.equal(parseArtifact(artifact({ label: 'production' })).inScope, false);
  assert.equal(parseArtifact('{"v":1,"v":1}').detail, 'json');
  assert.equal(parseArtifact(artifact({ producer: hex('A') })).detail, 'producer');
  assert.equal(parseArtifact(artifact({ artifact: 'x'.repeat(257) })).detail, 'artifact');
  assert.equal(parseArtifact('[]').detail, 'shape');
  assert.equal(parseArtifact(artifact()).value.kind, ARTIFACT_KINDS[0]);
});

test('dataset parsing validates shape, profile and provenance', () => {
  const parsed = parseDataset(dataset());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dataset.n, 3);
  assert.equal(parsed.dataset.signed, false);
  assert.equal(parsed.dataset.leaves[2].toString('hex'), 'ff00');

  const signed = parseDataset(dataset({ provenance: { kid: 'arkhe-poc', sig: 'f'.repeat(128) } }));
  assert.equal(signed.ok, true);
  assert.equal(signed.dataset.signed, true);

  assert.equal(parseDataset(dataset({ n: 2 })).detail, 'leaves');
  assert.equal(parseDataset(dataset({ v: 2 })).detail, 'v');
  assert.equal(parseDataset(dataset({ root: hex('D') })).detail, 'root');
  assert.equal(parseDataset(dataset({ leaves: ['00', 'AB', 'ff'] })).detail, 'leaf');
  assert.equal(parseDataset(dataset({ extra: true })).detail, 'unknown:extra');
  assert.equal(parseDataset(dataset({ profile: { ...MMR_PROFILE, digest: hex('0') } })).detail, 'profile');
  assert.equal(parseDataset('{"v":1,"v":1}').detail, 'json');
  assert.equal(parseDataset(dataset({ provenance: { kid: 'x', sig: 'f'.repeat(127) } })).detail, 'provenance');
});

test('dataset signing preimage excludes provenance and is canonical', () => {
  const base = dataset();
  const withProvenance = dataset({ provenance: { kid: 'k', sig: 'f'.repeat(128) } });
  assert.deepEqual(datasetSigningPreimage(base), datasetSigningPreimage(withProvenance));
  const text = datasetSigningPreimage(base).toString('utf8');
  assert.ok(text.startsWith(DOMAINS.dataset));
  assert.ok(text.endsWith('}'));
});

test('strict JSON rejects duplicate keys', () => {
  assert.throws(() => parseJsonStrict('{"a":1,"a":2}'));
  assert.deepEqual(parseJsonStrict('{"a":1}'), { a: 1 });
});
