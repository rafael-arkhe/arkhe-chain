import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicAddress, rpc, RPC, transaction } from './e01_solana_transport.mjs';
import {
  MMR_PROFILE,
  encodeAnchor,
  encodeReference,
  isHex64,
  isSignature,
  parseArtifact,
  parseDataset,
  datasetSigningPreimage,
} from './e02_memo_commitment.mjs';
import { createMmr, loadNodeVerifier } from './e02_mmr.mjs';
import { artifactFromLeaf, receiptFacts } from './e02_verify.mjs';

const wasm = loadNodeVerifier();
const blake3Hex = (bytes) => wasm.blake3_hex(bytes);
const mmr = createMmr(blake3Hex);
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const KEY_CHECK = Buffer.from('arkhe-e02-key-check', 'ascii');
const DEFAULT_SLEEP = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const devnetRpc = (method, params = []) => rpc(method, params, RPC);

export function signerFromSeed(seedHex) {
  if (typeof seedHex !== 'string' || !isHex64(seedHex)) throw new Error('invalid seed');
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seedHex, 'hex')]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = createPublicKey(privateKey);
  if (!verify(null, KEY_CHECK, publicKey, sign(null, KEY_CHECK, privateKey))) {
    throw new Error('key self-check failed');
  }
  return { privateKey, publicKey };
}

export function createSignerFile(path) {
  const seed = randomBytes(32).toString('hex');
  const signer = signerFromSeed(seed);
  writeFileSync(path, `${seed}\n`, { mode: 0o600, flag: 'wx' });
  return publicAddress(signer);
}

export function loadSigner(path) {
  const seed = readFileSync(path, 'utf8').trim();
  if (!isHex64(seed)) throw new Error('keypair file must be one lowercase hex seed');
  return signerFromSeed(seed);
}

export function buildDataset(artifactTexts) {
  if (!Array.isArray(artifactTexts) || artifactTexts.length === 0) {
    throw new Error('at least one artifact is required');
  }
  const items = artifactTexts.map((text) => parseArtifact(text));
  if (items.some((item) => !item.ok)) throw new Error('ARTIFACT_INVALID');
  if (items.some((item) => !item.inScope)) throw new Error('LABEL_OUT_OF_SCOPE');
  const leaves = items.map((item) => item.leafBytes);
  const { root } = mmr.build(leaves, 0);
  return {
    v: 1,
    profile: { id: MMR_PROFILE.id, version: MMR_PROFILE.version, digest: MMR_PROFILE.digest },
    n: leaves.length,
    root: root.toString('hex'),
    leaves: leaves.map((leaf) => leaf.toString('hex')),
  };
}

// Provenance identifies a signing key; it does not establish publisher trust.
export function signDataset(dataset, signer) {
  const parsed = parseDataset(dataset);
  if (!parsed.ok) throw new Error('DATASET_INVALID');
  const root = mmr.build(parsed.dataset.leaves, 0).root.toString('hex');
  if (root !== dataset.root) throw new Error('ROOT_MISMATCH');
  const preimage = datasetSigningPreimage(dataset);
  const signature = sign(null, preimage, signer.privateKey);
  if (!verify(null, preimage, signer.publicKey, signature)) throw new Error('signature self-check failed');
  return { ...dataset, provenance: { kid: publicAddress(signer), sig: signature.toString('hex') } };
}

export function loadDataset(path) {
  const bytes = readFileSync(path);
  const parsed = parseDataset(bytes.toString('utf8'));
  if (!parsed.ok) throw new Error(`DATASET_INVALID:${parsed.detail}`);
  const root = mmr.build(parsed.dataset.leaves, 0).root.toString('hex');
  if (root !== parsed.dataset.root) throw new Error('ROOT_MISMATCH');
  return { bytes, dataset: parsed.dataset, rootHex: root, digest: blake3Hex(bytes) };
}

export function findLeafIndex(dataset, artifactText) {
  const artifact = parseArtifact(artifactText);
  if (!artifact.ok) throw new Error('ARTIFACT_INVALID');
  const index = dataset.leaves.findIndex((leaf) =>
    (Buffer.isBuffer(leaf) ? leaf : Buffer.from(leaf, 'hex')).equals(artifact.leafBytes),
  );
  if (index < 0) throw new Error('LEAF_NOT_IN_DATASET');
  return { index, artifact };
}

export async function confirmSignature(
  rpcCall,
  signature,
  { timeoutMs = 30000, intervalMs = 500, sleep = DEFAULT_SLEEP, now = Date.now } = {},
) {
  if (!isSignature(signature)) throw new Error('invalid signature');
  const deadline = now() + timeoutMs;
  for (;;) {
    const status = await rpcCall('getSignatureStatuses', [
      [signature],
      { searchTransactionHistory: true },
    ]);
    const entry = status?.value?.[0];
    if (entry?.err) throw new Error('transaction failed');
    if (entry?.confirmationStatus === 'confirmed' || entry?.confirmationStatus === 'finalized') {
      return entry;
    }
    if (now() >= deadline) throw new Error('confirmation timeout');
    await sleep(intervalMs);
  }
}

export async function fetchReceipt(
  rpcCall,
  signature,
  { tries = 40, intervalMs = 500, sleep = DEFAULT_SLEEP } = {},
) {
  if (!isSignature(signature)) throw new Error('invalid signature');
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const receipt = await rpcCall('getTransaction', [
      signature,
      { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ]);
    if (receipt) return receipt;
    await sleep(intervalMs);
  }
  throw new Error('receipt unavailable');
}

export async function sendMemo({ signer, memo, rpcCall = devnetRpc, sleep = DEFAULT_SLEEP }) {
  if (Buffer.byteLength(memo, 'ascii') > 566) throw new Error('MEMO_TOO_LARGE');
  const latest = await rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const blockhash = latest?.value?.blockhash;
  if (typeof blockhash !== 'string') throw new Error('missing blockhash');
  const built = transaction(signer, blockhash, Buffer.from(memo, 'ascii'));
  const wire = built.bytes.toString('base64');
  await rpcCall('sendTransaction', [
    wire,
    { encoding: 'base64', preflightCommitment: 'confirmed' },
  ]);
  await confirmSignature(rpcCall, built.signature, { sleep });
  const receipt = await fetchReceipt(rpcCall, built.signature, { sleep });
  const facts = receiptFacts(receipt, built.signature);
  if (!facts.ok || !facts.bytes.equals(Buffer.from(memo, 'ascii'))) {
    throw new Error(`receipt mismatch:${facts.ok ? 'memo' : facts.error}`);
  }
  return { signature: built.signature, slot: receipt.slot, receipt };
}

export async function airdrop({ signer, lamports, rpcCall = devnetRpc, sleep = DEFAULT_SLEEP }) {
  if (!Number.isSafeInteger(lamports) || lamports < 1) throw new Error('invalid lamports');
  let signature;
  try {
    signature = await rpcCall('requestAirdrop', [publicAddress(signer), lamports]);
  } catch (error) {
    throw new Error(`airdrop failed: ${error.message}`);
  }
  await confirmSignature(rpcCall, signature, { sleep });
  return signature;
}

export async function commitDataset({
  datasetBytes,
  signer,
  rpcCall = devnetRpc,
  index = 0,
  sleep = DEFAULT_SLEEP,
}) {
  const bytes = Buffer.isBuffer(datasetBytes) ? datasetBytes : Buffer.from(datasetBytes, 'utf8');
  const parsed = parseDataset(bytes.toString('utf8'));
  if (!parsed.ok) throw new Error(`DATASET_INVALID:${parsed.detail}`);
  const dataset = parsed.dataset;
  const root = mmr.build(dataset.leaves, 0).root.toString('hex');
  if (root !== dataset.root) throw new Error('ROOT_MISMATCH');
  const datasetDigest = blake3Hex(bytes);
  let prepared = null;
  if (index !== null) {
    if (!Number.isInteger(index) || index < 0 || index >= dataset.n) {
      throw new Error('index out of range');
    }
    const leaf = dataset.leaves[index];
    const artifact = artifactFromLeaf(leaf);
    if (!artifact) throw new Error('ARTIFACT_INVALID');
    if (!artifact.inScope) throw new Error('LABEL_OUT_OF_SCOPE');
    prepared = {
      index,
      opId: blake3Hex(artifact.opIdPreimage),
      leafHash: mmr.leafHash(leaf).toString('hex'),
      artifact: artifact.value.artifact,
    };
  }
  const anchor = await sendMemo({
    signer,
    memo: encodeAnchor({ root, n: dataset.n, datasetDigest }),
    rpcCall,
    sleep,
  });
  let reference = null;
  if (prepared) {
    reference = await sendMemo({
      signer,
      memo: encodeReference({
        opId: prepared.opId,
        leafHash: prepared.leafHash,
        root,
        n: dataset.n,
        anchorRef: anchor.signature,
      }),
      rpcCall,
      sleep,
    });
    reference.index = prepared.index;
    reference.artifact = prepared.artifact;
  }
  return { root, n: dataset.n, datasetDigest, anchor, reference };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      options[name] = true;
      continue;
    }
    i += 1;
    if (name === 'artifact') {
      options.artifact = [...(options.artifact ?? []), next];
    } else {
      options[name] = next;
    }
  }
  return options;
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string') throw new Error(`--${name} is required`);
  return value;
}

const USAGE = [
  'node scripts/e02_anchor.mjs init --keypair <seed.txt>',
  'node scripts/e02_anchor.mjs dataset --out <dataset.json> --artifact <a.json> [--artifact <b.json> ...]',
  '  [--keypair <seed.txt>] (optional Ed25519 dataset provenance)',
  'node scripts/e02_anchor.mjs anchor --keypair <seed.txt> --dataset <dataset.json> --out <dir>',
  '  [--artifact <a.json>] [--index <n>] [--no-reference] [--airdrop <lamports>]',
  'node scripts/e02_anchor.mjs fetch --signature <base58> --out <receipt.json>',
].join('\n');

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') {
    console.log(USAGE);
    return;
  }
  const options = parseArgs(rest);

  if (command === 'init') {
    const address = createSignerFile(requireOption(options, 'keypair'));
    console.log(JSON.stringify({ address }, null, 2));
    return;
  }

  if (command === 'dataset') {
    const out = requireOption(options, 'out');
    const texts = (options.artifact ?? []).map((path) => readFileSync(path, 'utf8'));
    let dataset = buildDataset(texts);
    if (Object.hasOwn(options, 'keypair')) {
      dataset = signDataset(dataset, loadSigner(requireOption(options, 'keypair')));
    }
    const text = `${JSON.stringify(dataset, null, 2)}\n`;
    writeFileSync(out, text);
    console.log(
      JSON.stringify(
        {
          out,
          n: dataset.n,
          root: dataset.root,
          digest: blake3Hex(Buffer.from(text, 'utf8')),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === 'anchor') {
    const signer = loadSigner(requireOption(options, 'keypair'));
    const datasetPath = requireOption(options, 'dataset');
    const outDir = requireOption(options, 'out');
    const { bytes, dataset } = loadDataset(datasetPath);
    let index = options['no-reference'] ? null : Number(options.index ?? 0);
    if (options.artifact) {
      const paths = [].concat(options.artifact);
      const artifactText = readFileSync(paths[paths.length - 1], 'utf8');
      index = findLeafIndex(dataset, artifactText).index;
    }
    if (options.airdrop !== undefined) {
      const lamports = Number(options.airdrop);
      await airdrop({ signer, lamports });
    }
    const result = await commitDataset({ datasetBytes: bytes, signer, index });
    mkdirSync(outDir, { recursive: true });
    const anchorPath = join(outDir, 'anchor.json');
    writeFileSync(anchorPath, `${JSON.stringify(result.anchor.receipt, null, 2)}\n`);
    const files = { anchor: anchorPath };
    if (result.reference) {
      const refPath = join(outDir, 'ref.json');
      writeFileSync(refPath, `${JSON.stringify(result.reference.receipt, null, 2)}\n`);
      files.ref = refPath;
    }
    console.log(
      JSON.stringify(
        {
          cluster: 'devnet',
          address: publicAddress(signer),
          root: result.root,
          n: result.n,
          dataset_digest: result.datasetDigest,
          anchor: { signature: result.anchor.signature, slot: result.anchor.slot },
          reference: result.reference
            ? {
                signature: result.reference.signature,
                slot: result.reference.slot,
                index: result.reference.index,
                artifact: result.reference.artifact,
              }
            : null,
          files,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === 'fetch') {
    const signature = requireOption(options, 'signature');
    const out = requireOption(options, 'out');
    const receipt = await fetchReceipt(devnetRpc, signature);
    const facts = receiptFacts(receipt, signature);
    if (!facts.ok) throw new Error(facts.error);
    writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(
      JSON.stringify({ out, signature, slot: facts.slot, payer: facts.payer, bytes: facts.bytes.length }, null, 2),
    );
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
