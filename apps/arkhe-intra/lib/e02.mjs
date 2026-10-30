import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { root } from './paths.mjs';

const require = createRequire(import.meta.url);
const MAX_FILE_BYTES = 262144;
let verifier;

function load() {
  verifier ??= require(resolve(root, 'scripts/e02_verify.mjs'));
  return verifier;
}

export class E02InputError extends Error {}

function demand(condition, message) {
  if (!condition) throw new E02InputError(message);
}

function receipt(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    demand(value.length > 0 && Buffer.byteLength(value, 'utf8') <= MAX_FILE_BYTES, `${label} inválido.`);
    try {
      return JSON.parse(value);
    } catch {
      throw new E02InputError(`${label} inválido.`);
    }
  }
  demand(typeof value === 'object' && !Array.isArray(value), `${label} inválido.`);
  return value;
}

export function normalizeRequest(body) {
  demand(body && typeof body === 'object' && !Array.isArray(body), 'Pedido inválido.');
  const dataset = body.dataset;
  demand(
    typeof dataset === 'string' && dataset.length > 0 && Buffer.byteLength(dataset, 'utf8') <= MAX_FILE_BYTES,
    'Dataset inválido.',
  );
  const ref = receipt(body.ref, 'Recibo de referência');
  const anchor = receipt(body.anchor, 'Recibo de âncora');
  demand(ref, 'Recibo de referência ausente.');
  const signature = body.signature ?? ref.transaction?.signatures?.[0];
  demand(typeof signature === 'string', 'Assinatura ausente.');
  const cluster = body.cluster ?? 'devnet';
  demand(typeof cluster === 'string' && cluster.length <= 32, 'Cluster inválido.');
  const origin = typeof body.origin === 'string' && body.origin.length <= 200 ? body.origin : '<upload>';
  return { signature, ref, anchor, dataset, cluster, origin };
}

export function verifyE02(body) {
  const input = normalizeRequest(body);
  return load().verifyReference({
    signature: input.signature,
    receipt: input.ref,
    anchorReceipt: input.anchor,
    datasetText: input.dataset,
    cluster: input.cluster,
    datasetOrigin: input.origin,
    expectedLeafCount: body.expectedLeafCount,
  });
}
