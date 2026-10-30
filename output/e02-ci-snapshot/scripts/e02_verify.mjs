import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { MEMO, unbase58 } from './e01_solana_transport.mjs';
import { MAX_MEMO_BYTES, isSignature, parseArtifact, parseDataset, parseMemo } from './e02_memo_commitment.mjs';
import { createMmr, loadNodeVerifier, wasmVerify, toWasmProof } from './e02_mmr.mjs';

const DEVNET = 'devnet';
export const OBSERVATION_WARNING = 'O verificador E02 não autentica recibos RPC. A verificação offline é reprodutível, mas a fidelidade ao estado on-chain depende do canal de observação. Um adversário que controle esse canal pode fabricar recibos e um dataset coerentes.';
const wasm = loadNodeVerifier();
const blake3Hex = (bytes) => wasm.blake3_hex(bytes);
const mmr = createMmr(blake3Hex);
const LEAF_PREFIX = Buffer.from('AKG:E02:LEAF:v1\0', 'ascii');

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

export function artifactFromLeaf(leaf) {
  if (leaf.length <= LEAF_PREFIX.length) return null;
  if (!leaf.subarray(0, LEAF_PREFIX.length).equals(LEAF_PREFIX)) return null;
  const artifact = parseArtifact(leaf.subarray(LEAF_PREFIX.length).toString('utf8'));
  if (!artifact.ok) return null;
  if (!artifact.leafBytes.equals(leaf)) return null;
  return artifact;
}

export function verifyReference(input = {}) {
  try {
    return verifyReferenceUnchecked(input);
  } catch {
    return {
      outcome: 'NOT_VERIFIABLE', reason: 'INVALID_INPUT',
      observed: { root: null, n: null, anchor_ref: null, anchor_slot: null, anchor_payer: null,
        cluster: 'devnet', dataset_digest: null, dataset_origin: null, provenance_kid: null, signed: false },
      statement: 'Não verificável (INVALID_INPUT). Nenhuma afirmação foi confirmada.',
      observation_warning: OBSERVATION_WARNING,
    };
  }
}

function verifyReferenceUnchecked({
  signature,
  receipt,
  anchorReceipt,
  datasetText,
  cluster = DEVNET,
  datasetOrigin = '<memory>',
  expectedLeafCount,
}) {
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
  const failure = (reason) => ({
    outcome: 'NOT_VERIFIABLE',
    reason,
    observed,
    statement: `Não verificável (${reason}). Nenhuma afirmação foi confirmada.`,
    observation_warning: OBSERVATION_WARNING,
  });

  if (!isSignature(signature)) return failure('INVALID_INPUT');
  if (cluster !== DEVNET) return failure('CLUSTER_NOT_ALLOWED');

  const refFacts = receiptFacts(receipt, signature);
  if (!refFacts.ok) return failure(refFacts.error);

  const memo = parseMemo(refFacts.bytes);
  if (!memo.ok) return failure(memo.reason);
  if (memo.profile !== 'ref') return failure('MEMO_PROFILE_UNKNOWN');

  const datasetBytes = Buffer.isBuffer(datasetText)
    ? datasetText
    : Buffer.from(String(datasetText ?? ''), 'utf8');
  const parsedDataset = parseDataset(datasetBytes.toString('utf8'));
  if (!parsedDataset.ok) return failure('DATASET_INVALID');
  const dataset = parsedDataset.dataset;

  const matches = [];
  dataset.leaves.forEach((leaf, index) => {
    if (mmr.leafHash(leaf).toString('hex') === memo.fields.leafHash) matches.push(index);
  });
  if (matches.length === 0) return failure('LEAF_NOT_IN_DATASET');
  if (matches.length > 1) return failure('LEAF_AMBIGUOUS');
  const index = matches[0];

  if (expectedLeafCount !== undefined) {
    if (!Number.isInteger(expectedLeafCount) || expectedLeafCount < 1 || expectedLeafCount > 4096) return failure('INVALID_INPUT');
    if (dataset.n !== expectedLeafCount) return failure('EXPECTED_N_MISMATCH');
  }
  if (dataset.n !== memo.fields.n) return failure('N_MISMATCH');
  const built = mmr.build(dataset.leaves, index);
  const builtRoot = built.root.toString('hex');
  if (dataset.root !== builtRoot || builtRoot !== memo.fields.root) {
    return failure('ROOT_MISMATCH');
  }
  for (const supplied of dataset.proofs ?? []) {
    const expected = mmr.build(dataset.leaves, supplied.index).proof;
    if (toWasmProof(supplied.steps) !== toWasmProof(expected)) return failure('PROOF_INVALID');
  }
  if (!wasmVerify(dataset.leaves[index], dataset.n, built.proof, built.root)) {
    return failure('PROOF_INVALID');
  }

  const anchorRef = memo.fields.anchorRef;
  if (!anchorReceipt) return failure('ANCHOR_NOT_FOUND');
  const anchorFacts = receiptFacts(anchorReceipt, anchorRef);
  if (!anchorFacts.ok) {
    return failure(anchorFacts.error === 'RECEIPT_MISMATCH' ? 'ANCHOR_NOT_FOUND' : anchorFacts.error);
  }
  const anchorMemo = parseMemo(anchorFacts.bytes);
  if (!anchorMemo.ok) return failure(anchorMemo.reason);
  if (anchorMemo.profile !== 'anchor') return failure('MEMO_PROFILE_UNKNOWN');
  if (anchorMemo.fields.root !== memo.fields.root) return failure('ANCHOR_ROOT_MISMATCH');
  if (anchorMemo.fields.n !== memo.fields.n) return failure('ANCHOR_N_MISMATCH');

  const datasetDigest = blake3Hex(datasetBytes);
  if (anchorMemo.fields.datasetDigest !== datasetDigest) {
    return failure('ANCHOR_DATASET_MISMATCH');
  }

  const leaf = dataset.leaves[index];
  const artifact = artifactFromLeaf(leaf);
  if (!artifact) return failure('ARTIFACT_INVALID');
  if (blake3Hex(artifact.opIdPreimage) !== memo.fields.opId) return failure('OP_ID_MISMATCH');
  if (!artifact.inScope) return failure('LABEL_OUT_OF_SCOPE');

  observed.root = memo.fields.root;
  observed.n = memo.fields.n;
  observed.anchor_ref = anchorRef;
  observed.anchor_slot = anchorFacts.slot;
  observed.anchor_payer = anchorFacts.payer;
  observed.dataset_digest = datasetDigest;
  observed.provenance_kid = dataset.provenance?.kid ?? null;
  observed.signed = dataset.signed;

  return {
    outcome: 'VERIFIED',
    reason: null,
    observation_warning: OBSERVATION_WARNING,
    observed,
    statement:
      `O pagador da transação referenciou o artefacto ${artifact.value.artifact}; ` +
      `${artifact.value.artifact} está incluído na root ${observed.root} (n=${observed.n}); ` +
      `a root foi publicada pelo pagador ${observed.anchor_payer} no slot ${observed.anchor_slot}; ` +
      'o dataset recomputa a root. Isto não prova quem produziu o artefacto nem que ele é verdadeiro.',
  };
}

const USAGE = [
  'node scripts/e02_verify.mjs --receipt <ref.json> --anchor <anchor.json> --dataset <dataset.json>',
  '  [--signature <base58>] [--cluster devnet] [--origin <path>]',
].join('\n');

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return undefined;
  return args[index + 1];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log(USAGE);
    return;
  }
  const receiptPath = option(args, '--receipt');
  const anchorPath = option(args, '--anchor');
  const datasetPath = option(args, '--dataset');
  if (!receiptPath || !anchorPath || !datasetPath) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const receipt = readJson(receiptPath);
  const signature = option(args, '--signature') ?? receipt.transaction?.signatures?.[0];
  const result = verifyReference({
    signature,
    receipt,
    anchorReceipt: readJson(anchorPath),
    datasetText: readFileSync(datasetPath),
    cluster: option(args, '--cluster') ?? DEVNET,
    datasetOrigin: option(args, '--origin') ?? datasetPath,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.outcome === 'VERIFIED' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
