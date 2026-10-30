import { base58, unbase58 } from './e01_solana_transport.mjs';

export const MAX_MEMO_BYTES = 566;
export const MAX_DATASET_BYTES = 16 * 1024 * 1024;
export const REF_PREFIX = 'ARKHE:REF:v1';
export const ANCHOR_PREFIX = 'ARKHE:ANCHOR:v1';
export const MMR_PROFILE = Object.freeze({
  id: 'arkhe-mmr',
  version: 1,
  digest: 'bcd07a275061ef385fccdd184030c2358fdd0937477cb0ef30cf8148342f2450',
});
export const ARTIFACT_KINDS = Object.freeze([
  'e01-run',
  'gguf-supply-chain',
  'stage8-alert',
  'gov-synthetic',
]);
export const ARTIFACT_LABELS = Object.freeze(['synthetic-poc', 'production']);
export const DOMAINS = Object.freeze({
  leaf: 'AKG:E02:LEAF:v1\0',
  op: 'AKG:E02:OP:v1\0',
  dataset: 'AKG:E02:DATASET:v1\0',
});

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const PRINTABLE = /^[\x21-\x7E]+$/;
const PRINTABLE_OR_SPACE = /^[\x20-\x7E]+$/;

const fail = (reason, detail) => ({ ok: false, reason, detail });

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
    bytes = Buffer.from(input, 'utf8');
  } else if (input instanceof Uint8Array) {
    bytes = Buffer.from(input);
    if (bytes.length === 0) return fail('MEMO_MALFORMED', 'empty');
    for (const byte of bytes) {
      if (byte < 0x21 || byte > 0x7e) return fail('MEMO_MALFORMED', 'non_ascii');
    }
    text = bytes.toString('ascii');
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

export function encodeReference({ opId, leafHash, root, n, anchorRef }) {
  if (!isHex64(opId)) throw new Error('invalid op_id');
  if (!isHex64(leafHash)) throw new Error('invalid leaf_hash');
  if (!isHex64(root)) throw new Error('invalid root');
  if (!isLeafCount(n)) throw new Error('invalid n');
  if (!isSignature(anchorRef)) throw new Error('invalid anchor_ref');
  const memo = `${REF_PREFIX}:${opId}:${leafHash}:${root}:${Number(n)}:${anchorRef}`;
  if (Buffer.byteLength(memo, 'ascii') > MAX_MEMO_BYTES) throw new Error('memo too large');
  return memo;
}

export function encodeAnchor({ root, n, datasetDigest }) {
  if (!isHex64(root)) throw new Error('invalid root');
  if (!isLeafCount(n)) throw new Error('invalid n');
  if (!isHex64(datasetDigest)) throw new Error('invalid dataset_digest');
  const memo = `${ANCHOR_PREFIX}:${root}:${Number(n)}:${datasetDigest}`;
  if (Buffer.byteLength(memo, 'ascii') > MAX_MEMO_BYTES) throw new Error('memo too large');
  return memo;
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
  } catch (error) {
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
  const artifactBytes = Buffer.byteLength(value.artifact, 'ascii');
  if (artifactBytes < 1 || artifactBytes > 256) return fail('ARTIFACT_INVALID', 'artifact');
  if (!isHex64(value.producer)) return fail('ARTIFACT_INVALID', 'producer');
  if (!isHex64(value.subject)) return fail('ARTIFACT_INVALID', 'subject');

  let json;
  try {
    json = canonicalJson(value);
  } catch {
    return fail('ARTIFACT_INVALID', 'canonical');
  }
  if (Buffer.byteLength(json, 'utf8') > 1024) return fail('ARTIFACT_INVALID', 'size');

  return {
    ok: true,
    value,
    json,
    inScope: value.label === 'synthetic-poc',
    leafBytes: Buffer.concat([Buffer.from(DOMAINS.leaf, 'ascii'), Buffer.from(json, 'utf8')]),
    opIdPreimage: Buffer.concat([
      Buffer.from(DOMAINS.op, 'ascii'),
      Buffer.from(value.kind, 'utf8'),
      Buffer.from([0x00]),
      Buffer.from(value.subject, 'hex'),
    ]),
  };
}

const DATASET_KEYS = ['leaves', 'n', 'profile', 'root', 'v'];

export function parseDataset(input) {
  if (typeof input === 'string' && Buffer.byteLength(input, 'utf8') > MAX_DATASET_BYTES) {
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
    leaves.push(Buffer.from(leaf, 'hex'));
  }

  let proofs;
  if (Object.hasOwn(value, 'proofs')) {
    if (!Array.isArray(value.proofs)) return fail('DATASET_INVALID', 'proofs');
    proofs = [];
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
      proofs.push({
        index: proof.index,
        steps: proof.steps.map((step) => ({
          kind: step.kind,
          direction: step.direction,
          hash: Buffer.from(step.hash, 'hex'),
        })),
      });
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
      proofs,
      provenance,
      signed: provenance !== null,
    },
  };
}

export function datasetSigningPreimage(dataset) {
  const body = { ...dataset };
  delete body.provenance;
  return Buffer.concat([
    Buffer.from(DOMAINS.dataset, 'ascii'),
    Buffer.from(canonicalJson(body), 'utf8'),
  ]);
}
