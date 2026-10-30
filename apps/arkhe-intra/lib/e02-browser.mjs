// E02 browser verifier — spec docs/E02-PROOF-COMMITMENT.md §5, fail-closed.
// Pure ESM port of scripts/e02_verify.mjs with no Node APIs; all hashing and
// the inclusion-proof check run in the injected arkhe-verify-wasm instance,
// which must be the same crate build (scripts/build_verifier.py).
const MAX_MEMO_BYTES = 566;
const MMR_PROFILE = Object.freeze({
  id: 'arkhe-mmr',
  version: 1,
  digest: 'bcd07a275061ef385fccdd184030c2358fdd0937477cb0ef30cf8148342f2450',
});
const ARTIFACT_KINDS = Object.freeze([
  'e01-run',
  'gguf-supply-chain',
  'stage8-alert',
  'gov-synthetic',
]);
const ARTIFACT_LABELS = Object.freeze(['synthetic-poc', 'production']);
const DOMAINS = Object.freeze({
  leaf: 'AKG:E02:LEAF:v1\0',
  op: 'AKG:E02:OP:v1\0',
  dataset: 'AKG:E02:DATASET:v1\0',
});
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const DEVNET = 'devnet';
const LEAF_PREFIX = asciiBytes(DOMAINS.leaf);
const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const PRINTABLE = /^[\x21-\x7E]+$/;
const PRINTABLE_OR_SPACE = /^[\x20-\x7E]+$/;
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const fail = (reason, detail) => ({ ok: false, reason, detail });

export function asciiBytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

export function bytesToAscii(bytes) {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

export function utf8Bytes(text) {
  return encoder.encode(text);
}

export function bytesToUtf8(bytes) {
  return decoder.decode(bytes);
}

export function toHex(bytes) {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(text) {
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function concatBytes(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function u64be(value) {
  const bytes = new Uint8Array(8);
  let n = BigInt(value);
  for (let i = 7; i >= 0; i -= 1) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

export function base58(bytes) {
  let n = BigInt('0x' + (toHex(bytes) || '0'));
  let out = '';
  while (n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = '1' + out;
  }
  return out;
}

export function unbase58(value) {
  if (typeof value !== 'string' || !value.length || value.length > 2048) {
    throw new Error('invalid base58');
  }
  let n = 0n;
  for (const char of value) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('invalid base58');
    n = n * 58n + BigInt(index);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const leading = value.match(/^1*/)[0].length;
  const body = n ? fromHex(hex) : new Uint8Array(0);
  return concatBytes([new Uint8Array(leading), body]);
}

export function isHex64(value) {
  return typeof value === 'string' && HEX64.test(value);
}

export function isLeafCount(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 1 && value <= 0xffffffff;
  }
  if (typeof value === 'string') {
    if (!/^[1-9][0-9]{0,9}$/.test(value)) return false;
    return Number(value) <= 0xffffffff;
  }
  return false;
}

export function isSignature(value) {
  if (typeof value !== 'string' || value.length < 64 || value.length > 88) return false;
  if (!BASE58.test(value)) return false;
  try {
    const bytes = unbase58(value);
    return bytes.length === 64 && base58(bytes) === value;
  } catch {
    return false;
  }
}

export function parseMemo(input) {
  let bytes;
  let text;
  if (typeof input === 'string') {
    if (input.length === 0) return fail('MEMO_MALFORMED', 'empty');
    if (!PRINTABLE.test(input)) return fail('MEMO_MALFORMED', 'non_ascii');
    text = input;
    bytes = asciiBytes(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
    if (bytes.length === 0) return fail('MEMO_MALFORMED', 'empty');
    for (const byte of bytes) {
      if (byte < 0x21 || byte > 0x7e) return fail('MEMO_MALFORMED', 'non_ascii');
    }
    text = bytesToAscii(bytes);
  } else {
    return fail('MEMO_MALFORMED', 'type');
  }
  if (bytes.length === 0) return fail('MEMO_MALFORMED', 'empty');
  if (bytes.length > MAX_MEMO_BYTES) return fail('MEMO_TOO_LARGE', String(bytes.length));

  const tokens = text.split(':');
  if (tokens.length < 3 || tokens[0] !== 'ARKHE') {
    return fail('MEMO_PROFILE_UNKNOWN', tokens[1] === undefined ? text.slice(0, 16) : tokens[0]);
  }
  if (tokens[1] !== 'REF' && tokens[1] !== 'ANCHOR') {
    return fail('MEMO_PROFILE_UNKNOWN', `ARKHE:${tokens[1]}`);
  }
  if (tokens[2] !== 'v1') return fail('MEMO_PROFILE_UNKNOWN', `ARKHE:${tokens[1]}:${tokens[2]}`);

  if (tokens[1] === 'REF') {
    if (tokens.length !== 8) return fail('MEMO_MALFORMED', 'field_count');
    const [, , , opId, leafHash, root, nRaw, anchorRef] = tokens;
    for (const [name, value] of [['op_id', opId], ['leaf_hash', leafHash], ['root', root]]) {
      if (!isHex64(value)) return fail('MEMO_MALFORMED', name);
    }
    if (!isLeafCount(nRaw)) return fail('MEMO_MALFORMED', 'n');
    if (!isSignature(anchorRef)) return fail('MEMO_MALFORMED', 'anchor_ref');
    return {
      ok: true,
      profile: 'ref',
      bytes: bytes.length,
      text,
      fields: { opId, leafHash, root, n: Number(nRaw), anchorRef },
    };
  }

  if (tokens.length !== 6) return fail('MEMO_MALFORMED', 'field_count');
  const [, , , root, nRaw, datasetDigest] = tokens;
  if (!isHex64(root)) return fail('MEMO_MALFORMED', 'root');
  if (!isLeafCount(nRaw)) return fail('MEMO_MALFORMED', 'n');
  if (!isHex64(datasetDigest)) return fail('MEMO_MALFORMED', 'dataset_digest');
  return {
    ok: true,
    profile: 'anchor',
    bytes: bytes.length,
    text,
    fields: { root, n: Number(nRaw), datasetDigest },
  };
}

export function canonicalJson(value) {
  const encode = (item) => {
    if (item === null) return 'null';
    if (typeof item === 'boolean') return item ? 'true' : 'false';
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) throw new Error('non-integer number');
      return String(item);
    }
    if (typeof item === 'string') {
      if (!/^[\x20-\x7E]*$/.test(item)) throw new Error('non-ascii string');
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) return `[${item.map(encode).join(',')}]`;
    if (item !== null && typeof item === 'object') {
      const keys = Object.keys(item).sort();
      return `{${keys
        .map((key) => {
          if (!PRINTABLE_OR_SPACE.test(key)) throw new Error('invalid key');
          return `${JSON.stringify(key)}:${encode(item[key])}`;
        })
        .join(',')}}`;
    }
    throw new Error('unsupported value');
  };
  return encode(value);
}

function assertNoDuplicateKeys(text) {
  let index = 0;
  const error = (message) => {
    throw new Error(message);
  };
  const skip = () => {
    while (index < text.length && ' \t\r\n'.includes(text[index])) index += 1;
  };
  const string = (allowEscape) => {
    index += 1;
    let out = '';
    while (index < text.length) {
      const char = text[index];
      index += 1;
      if (char === '"') return out;
      if (char === '\\') {
        if (!allowEscape) error('escape in key');
        out += text[index];
        index += 1;
        continue;
      }
      out += char;
    }
    return error('unterminated string');
  };
  const value = () => {
    skip();
    const char = text[index];
    if (char === '"') return string(true);
    if (char === '{') return object();
    if (char === '[') return array();
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|^true|^false|^null/.exec(
      text.slice(index),
    );
    if (!match) error('invalid literal');
    index += match[0].length;
    return undefined;
  };
  const object = () => {
    index += 1;
    const keys = new Set();
    skip();
    if (text[index] === '}') {
      index += 1;
      return undefined;
    }
    for (;;) {
      skip();
      if (text[index] !== '"') error('invalid key');
      const key = string(false);
      if (keys.has(key)) error('duplicate key');
      keys.add(key);
      skip();
      if (text[index] !== ':') error('missing colon');
      index += 1;
      value();
      skip();
      if (text[index] === ',') {
        index += 1;
        continue;
      }
      if (text[index] === '}') {
        index += 1;
        return undefined;
      }
      error('invalid object');
    }
  };
  const array = () => {
    index += 1;
    skip();
    if (text[index] === ']') {
      index += 1;
      return undefined;
    }
    for (;;) {
      value();
      skip();
      if (text[index] === ',') {
        index += 1;
        continue;
      }
      if (text[index] === ']') {
        index += 1;
        return undefined;
      }
      error('invalid array');
    }
  };
  value();
  skip();
  if (index !== text.length) error('trailing data');
}

export function parseJsonStrict(text) {
  if (typeof text !== 'string') throw new Error('json text required');
  assertNoDuplicateKeys(text);
  return JSON.parse(text);
}

const ARTIFACT_KEYS = ['artifact', 'kind', 'label', 'producer', 'subject', 'v'];

export function parseArtifact(input) {
  let value;
  try {
    value = typeof input === 'string' ? parseJsonStrict(input) : input;
  } catch {
    return fail('ARTIFACT_INVALID', 'json');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('ARTIFACT_INVALID', 'shape');
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== ARTIFACT_KEYS.length || keys.some((key, i) => key !== ARTIFACT_KEYS[i])) {
    return fail('ARTIFACT_INVALID', 'keys');
  }
  if (value.v !== 1) return fail('ARTIFACT_INVALID', 'v');
  if (!ARTIFACT_KINDS.includes(value.kind)) return fail('ARTIFACT_INVALID', 'kind');
  if (!ARTIFACT_LABELS.includes(value.label)) return fail('ARTIFACT_INVALID', 'label');
  if (typeof value.artifact !== 'string' || !PRINTABLE_OR_SPACE.test(value.artifact)) {
    return fail('ARTIFACT_INVALID', 'artifact');
  }
  const artifactBytes = value.artifact.length;
  if (artifactBytes < 1 || artifactBytes > 256) return fail('ARTIFACT_INVALID', 'artifact');
  if (!isHex64(value.producer)) return fail('ARTIFACT_INVALID', 'producer');
  if (!isHex64(value.subject)) return fail('ARTIFACT_INVALID', 'subject');

  let json;
  try {
    json = canonicalJson(value);
  } catch {
    return fail('ARTIFACT_INVALID', 'canonical');
  }
  if (utf8Bytes(json).length > 1024) return fail('ARTIFACT_INVALID', 'size');

  return {
    ok: true,
    value,
    json,
    inScope: value.label === 'synthetic-poc',
    leafBytes: concatBytes([asciiBytes(DOMAINS.leaf), utf8Bytes(json)]),
    opIdPreimage: concatBytes([
      asciiBytes(DOMAINS.op),
      utf8Bytes(value.kind),
      new Uint8Array([0x00]),
      fromHex(value.subject),
    ]),
  };
}

const DATASET_KEYS = ['leaves', 'n', 'profile', 'root', 'v'];

export function parseDataset(input) {
  if (typeof input === 'string' && utf8Bytes(input).length > 16 * 1024 * 1024) {
    return fail('DATASET_INVALID', 'size');
  }
  let value;
  try {
    value = typeof input === 'string' ? parseJsonStrict(input) : input;
  } catch {
    return fail('DATASET_INVALID', 'json');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('DATASET_INVALID', 'shape');
  }
  const allowed = new Set([...DATASET_KEYS, 'proofs', 'provenance']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return fail('DATASET_INVALID', `unknown:${key}`);
  }
  for (const key of DATASET_KEYS) {
    if (!Object.hasOwn(value, key)) return fail('DATASET_INVALID', `missing:${key}`);
  }
  if (value.v !== 1) return fail('DATASET_INVALID', 'v');
  const profile = value.profile;
  if (
    profile === null ||
    typeof profile !== 'object' ||
    profile.id !== MMR_PROFILE.id ||
    profile.version !== MMR_PROFILE.version ||
    profile.digest !== MMR_PROFILE.digest
  ) {
    return fail('DATASET_INVALID', 'profile');
  }
  if (!Number.isInteger(value.n) || value.n < 1 || value.n > 4096) {
    return fail('DATASET_INVALID', 'n');
  }
  if (!isHex64(value.root)) return fail('DATASET_INVALID', 'root');
  if (!Array.isArray(value.leaves) || value.leaves.length !== value.n) {
    return fail('DATASET_INVALID', 'leaves');
  }
  const leaves = [];
  for (const leaf of value.leaves) {
    if (typeof leaf !== 'string' || leaf.length === 0 || leaf.length % 2 !== 0) {
      return fail('DATASET_INVALID', 'leaf');
    }
    if (leaf.length > 2080 || !/^[0-9a-f]+$/.test(leaf)) {
      return fail('DATASET_INVALID', 'leaf');
    }
    leaves.push(fromHex(leaf));
  }

  if (Object.hasOwn(value, 'proofs')) {
    if (!Array.isArray(value.proofs)) return fail('DATASET_INVALID', 'proofs');
    for (const proof of value.proofs) {
      if (proof === null || typeof proof !== 'object' || Array.isArray(proof)) {
        return fail('DATASET_INVALID', 'proof');
      }
      if (Object.keys(proof).some((key) => !['index', 'steps'].includes(key))) {
        return fail('DATASET_INVALID', 'proof_keys');
      }
      if (!Number.isInteger(proof.index) || proof.index < 0 || proof.index >= value.n) {
        return fail('DATASET_INVALID', 'proof_index');
      }
      if (!Array.isArray(proof.steps) || proof.steps.length > 32) {
        return fail('DATASET_INVALID', 'proof_steps');
      }
      for (const step of proof.steps) {
        if (step === null || typeof step !== 'object') {
          return fail('DATASET_INVALID', 'proof_step');
        }
        if (Object.keys(step).some((key) => !['kind', 'direction', 'hash'].includes(key))) {
          return fail('DATASET_INVALID', 'proof_step_keys');
        }
        if (step.kind !== 'node' && step.kind !== 'bag') {
          return fail('DATASET_INVALID', 'proof_kind');
        }
        if (step.direction !== 'left' && step.direction !== 'right') {
          return fail('DATASET_INVALID', 'proof_direction');
        }
        if (!isHex64(step.hash)) return fail('DATASET_INVALID', 'proof_hash');
      }
    }
  }

  let provenance = null;
  if (Object.hasOwn(value, 'provenance')) {
    const item = value.provenance;
    if (
      item === null ||
      typeof item !== 'object' ||
      typeof item.kid !== 'string' ||
      !PRINTABLE.test(item.kid) ||
      item.kid.length > 64 ||
      typeof item.sig !== 'string' ||
      !HEX128.test(item.sig)
    ) {
      return fail('DATASET_INVALID', 'provenance');
    }
    if (Object.keys(item).some((key) => !['kid', 'sig'].includes(key))) {
      return fail('DATASET_INVALID', 'provenance_keys');
    }
    provenance = { kid: item.kid, sig: item.sig };
  }

  return {
    ok: true,
    dataset: {
      v: 1,
      profile: { id: profile.id, version: profile.version, digest: profile.digest },
      n: value.n,
      root: value.root,
      leaves,
      proofs: value.proofs?.map(proof => ({ index: proof.index,
        steps: proof.steps.map(step => ({ ...step, hash: fromHex(step.hash) })) })),
      provenance,
      signed: provenance !== null,
    },
  };
}

function mmrSize(leafCount) {
  let value = leafCount >>> 0;
  let bits = 0;
  while (value) {
    bits += value & 1;
    value >>>= 1;
  }
  return 2 * leafCount - bits;
}

function peakWidths(leafCount) {
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
  const digest = (bytes) => fromHex(blake3Hex(bytes));
  const leafHash = (leaf) => digest(concatBytes([new Uint8Array([0x00]), leaf]));
  const nodeHash = (left, right) =>
    digest(concatBytes([new Uint8Array([0x01]), left, right]));
  const bagHash = (left, right, leafCount) =>
    digest(concatBytes([new Uint8Array([0x02]), u64be(mmrSize(leafCount)), left, right]));

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

  // Root recomputation only; the inclusion proof is always checked by the
  // injected WASM verify_mmr, never by this fold (invariant E02-6).
  function rootOf(leaves) {
    if (!Array.isArray(leaves) || leaves.length === 0) throw new Error('empty MMR');
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
    return { root, peaks, hashes };
  }

  function proofFor(peaks, hashes, target, leafCount) {
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
        accumulator = bagHash(peaks[i].hash, accumulator, leafCount);
      }
      steps.push({ kind: 'bag', direction: 'right', hash: accumulator });
    }
    for (let i = peakIndex - 1; i >= 0; i -= 1) {
      steps.push({ kind: 'bag', direction: 'left', hash: peaks[i].hash });
    }
    return steps;
  }

  return { leafHash, nodeHash, bagHash, rootOf, proofFor };
}

export function receiptFacts(receipt, signature) {
  if (!receipt || typeof receipt !== 'object') return { ok: false, error: 'RECEIPT_MISSING' };
  if (!receipt.meta || typeof receipt.meta !== 'object') return { ok: false, error: 'RECEIPT_MISSING' };
  if (receipt.meta.err !== null) return { ok: false, error: 'TX_FAILED' };
  if (!Number.isSafeInteger(receipt.slot)) return { ok: false, error: 'RECEIPT_MISMATCH' };
  const message = receipt.transaction?.message;
  const signatures = receipt.transaction?.signatures;
  if (!message || !Array.isArray(signatures) || signatures.length === 0) {
    return { ok: false, error: 'RECEIPT_MISMATCH' };
  }
  if (signatures[0] !== signature) return { ok: false, error: 'RECEIPT_MISMATCH' };
  if (message.header && message.header.numRequiredSignatures !== signatures.length) {
    return { ok: false, error: 'RECEIPT_MISMATCH' };
  }
  const keys = (message.accountKeys ?? []).map((key) =>
    typeof key === 'string' ? key : key?.pubkey,
  );
  if (keys.length < 2 || typeof keys[0] !== 'string') {
    return { ok: false, error: 'RECEIPT_MISMATCH' };
  }
  const instructions = message.instructions;
  if (!Array.isArray(instructions)) return { ok: false, error: 'RECEIPT_MISMATCH' };
  const memos = instructions.filter((ix) => {
    const program = ix?.programId ?? keys[ix?.programIdIndex];
    return program === MEMO;
  });
  if (memos.length === 0) return { ok: false, error: 'MEMO_MISSING' };
  if (memos.length > 1) return { ok: false, error: 'MEMO_MULTIPLE' };
  const data = memos[0].data;
  if (typeof data !== 'string') return { ok: false, error: 'MEMO_MALFORMED' };
  let bytes;
  try {
    bytes = unbase58(data);
  } catch {
    return { ok: false, error: 'MEMO_MALFORMED' };
  }
  if (bytes.length === 0 || bytes.length > MAX_MEMO_BYTES) {
    return { ok: false, error: 'MEMO_TOO_LARGE' };
  }
  return { ok: true, slot: receipt.slot, payer: keys[0], bytes };
}

function artifactFromLeaf(leaf) {
  if (leaf.length <= LEAF_PREFIX.length) return null;
  if (!bytesEqual(leaf.subarray(0, LEAF_PREFIX.length), LEAF_PREFIX)) return null;
  const artifact = parseArtifact(bytesToUtf8(leaf.subarray(LEAF_PREFIX.length)));
  if (!artifact.ok) return null;
  if (!bytesEqual(artifact.leafBytes, leaf)) return null;
  return artifact;
}

function toWasmProof(proof) {
  return JSON.stringify(
    proof.map((step) => ({
      kind: step.kind,
      direction: step.direction,
      hash: Array.from(step.hash),
    })),
  );
}

export function verifyE02Browser(
  { signature, refText, anchorText, datasetText, cluster = DEVNET, datasetOrigin = '<upload>', includeDetails = false, expectedLeafCount },
  wasm,
) {
  const observationWarning = 'O verificador E02 não autentica recibos RPC. A verificação offline é reprodutível, mas a fidelidade ao estado on-chain depende do canal de observação. Um adversário que controle esse canal pode fabricar recibos e um dataset coerentes.';
  const observed = {
    root: null,
    n: null,
    anchor_ref: null,
    anchor_slot: null,
    anchor_payer: null,
    cluster,
    dataset_digest: null,
    dataset_origin: datasetOrigin,
    provenance_kid: null,
    signed: false,
  };
  const checks = ['Motor WASM', 'Recibo e memo REF', 'Formato do dataset', 'Folha referenciada',
    'Root e contagem MMR', 'Prova de inclusão WASM', 'Recibo e memo ANCHOR',
    'Digest dos bytes do dataset', 'Artefacto e OperationId'].map((label, index) =>
      ({ id: index, label, status: 'NOT_RUN', reason: null }));
  const proofDetails = {};
  let stage = 0;
  const advance = () => { checks[stage].status = 'PASS'; stage += 1; };
  const details = () => includeDetails ? {
    complete: stage === checks.length,
    aborted: stage < checks.length ? checks[stage].id : null,
    checks, proof_details: proofDetails,
  } : {};
  const failure = (reason) => {
    stage = Math.min(stage, checks.length - 1);
    checks[stage].status = 'FAIL';
    checks[stage].reason = reason;
    return {
      outcome: 'NOT_VERIFIABLE',
      reason,
      observed,
      statement: `Não verificável (${reason}). Nenhuma afirmação foi confirmada.`,
      observation_warning: observationWarning,
      ...details(),
    };
  };
  try {
    if (typeof wasm?.blake3_hex !== 'function' || typeof wasm?.verify_mmr !== 'function') {
      return failure('VERIFIER_UNAVAILABLE');
    }
    advance();
    const blake3Hex = (bytes) => wasm.blake3_hex(bytes);
    const mmr = createMmr(blake3Hex);

    let ref = null;
    let anchor = null;
    try {
      ref = typeof refText === 'string' ? JSON.parse(refText) : refText;
      anchor = anchorText == null ? null : typeof anchorText === 'string' ? JSON.parse(anchorText) : anchorText;
    } catch {
      return failure('RECEIPT_MISSING');
    }
    const transactionSignature = signature ?? ref?.transaction?.signatures?.[0];
    if (!isSignature(transactionSignature)) return failure('INVALID_INPUT');
    if (cluster !== DEVNET) return failure('CLUSTER_NOT_ALLOWED');

    const refFacts = receiptFacts(ref, transactionSignature);
    if (!refFacts.ok) return failure(refFacts.error);

    const memo = parseMemo(refFacts.bytes);
    if (!memo.ok) return failure(memo.reason);
    if (memo.profile !== 'ref') return failure('MEMO_PROFILE_UNKNOWN');

    advance();
    if (typeof datasetText !== 'string' || datasetText.length === 0) {
      return failure('DATASET_INVALID');
    }
    const datasetBytes = utf8Bytes(datasetText);
    const parsedDataset = parseDataset(datasetText);
    if (!parsedDataset.ok) return failure('DATASET_INVALID');
    const dataset = parsedDataset.dataset;

    advance();
    const matches = [];
    dataset.leaves.forEach((leaf, index) => {
      if (toHex(mmr.leafHash(leaf)) === memo.fields.leafHash) matches.push(index);
    });
    if (matches.length === 0) return failure('LEAF_NOT_IN_DATASET');
    if (matches.length > 1) return failure('LEAF_AMBIGUOUS');
    const index = matches[0];
    Object.assign(proofDetails, { leaf_index: index, leaf_hash: memo.fields.leafHash,
      operation_id: memo.fields.opId, reference_signature: transactionSignature,
      reference_payer: refFacts.payer, reference_slot: refFacts.slot,
      declared_root: dataset.root, reference_root: memo.fields.root,
      anchor_reference: memo.fields.anchorRef, profile: dataset.profile });

    advance();
    if (expectedLeafCount !== undefined) {
      if (!Number.isInteger(expectedLeafCount) || expectedLeafCount < 1 || expectedLeafCount > 4096) return failure('INVALID_INPUT');
      proofDetails.expected_leaf_count = expectedLeafCount;
      if (dataset.n !== expectedLeafCount) return failure('EXPECTED_N_MISMATCH');
    }
    if (dataset.n !== memo.fields.n) return failure('N_MISMATCH');
    const { root: builtRoot, peaks, hashes } = mmr.rootOf(dataset.leaves);
    const builtRootHex = toHex(builtRoot);
    proofDetails.recomputed_root = builtRootHex;
    if (dataset.root !== builtRootHex || builtRootHex !== memo.fields.root) {
      return failure('ROOT_MISMATCH');
    }
    advance();
    const proof = mmr.proofFor(peaks, hashes, index, dataset.leaves.length);
    proofDetails.steps = proof.map(step => ({ ...step, hash: toHex(step.hash) }));
    for (const supplied of dataset.proofs ?? []) {
      const expected = mmr.proofFor(peaks, hashes, supplied.index, dataset.leaves.length);
      if (toWasmProof(supplied.steps) !== toWasmProof(expected)) return failure('PROOF_INVALID');
    }
    if (
      !wasm.verify_mmr(
        dataset.leaves[index],
        dataset.n,
        toWasmProof(proof),
        fromHex(memo.fields.root),
      )
    ) {
      return failure('PROOF_INVALID');
    }

    advance();
    const anchorRef = memo.fields.anchorRef;
    if (!anchor) return failure('ANCHOR_NOT_FOUND');
    const anchorFacts = receiptFacts(anchor, anchorRef);
    if (!anchorFacts.ok) {
      return failure(anchorFacts.error === 'RECEIPT_MISMATCH' ? 'ANCHOR_NOT_FOUND' : anchorFacts.error);
    }
    const anchorMemo = parseMemo(anchorFacts.bytes);
    if (!anchorMemo.ok) return failure(anchorMemo.reason);
    if (anchorMemo.profile !== 'anchor') return failure('MEMO_PROFILE_UNKNOWN');
    Object.assign(proofDetails, { anchor_root: anchorMemo.fields.root, anchor_dataset_digest: anchorMemo.fields.datasetDigest });
    if (anchorMemo.fields.root !== memo.fields.root) return failure('ANCHOR_ROOT_MISMATCH');
    if (anchorMemo.fields.n !== memo.fields.n) return failure('ANCHOR_N_MISMATCH');

    advance();
    const datasetDigest = blake3Hex(datasetBytes);
    proofDetails.recomputed_dataset_digest = datasetDigest;
    if (anchorMemo.fields.datasetDigest !== datasetDigest) {
      return failure('ANCHOR_DATASET_MISMATCH');
    }

    advance();
    const leaf = dataset.leaves[index];
    const artifact = artifactFromLeaf(leaf);
    if (!artifact) return failure('ARTIFACT_INVALID');
    if (blake3Hex(artifact.opIdPreimage) !== memo.fields.opId) return failure('OP_ID_MISMATCH');
    if (!artifact.inScope) return failure('LABEL_OUT_OF_SCOPE');

    advance();
    proofDetails.artifact = artifact.value;
    proofDetails.provenance = { declared: dataset.provenance, status: 'NOT_CHECKED' };
    observed.root = memo.fields.root;
    observed.n = memo.fields.n;
    observed.anchor_ref = anchorRef;
    observed.anchor_slot = anchorFacts.slot;
    observed.anchor_payer = anchorFacts.payer;
    observed.dataset_digest = datasetDigest;
    observed.provenance_kid = dataset.provenance?.kid ?? null;
    observed.signed = dataset.signed;

    return {
      ...details(),
      outcome: 'VERIFIED',
      reason: null,
      observation_warning: observationWarning,
      observed,
      statement:
        `O pagador da transação referenciou o artefacto ${artifact.value.artifact}; ` +
        `${artifact.value.artifact} está incluído na root ${observed.root} (n=${observed.n}); ` +
        `a root foi publicada pelo pagador ${observed.anchor_payer} no slot ${observed.anchor_slot}; ` +
        'o dataset recomputa a root. Isto não prova quem produziu o artefacto nem que ele é verdadeiro.',
    };
  } catch {
    return failure('INVALID_INPUT');
  }
}
