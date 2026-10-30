import { createHash } from 'node:crypto';
import { verifyArtifact } from '../../verify-mcp/dist/tools/verify-artifact.js';
import { verifyMmr } from '../../verify-mcp/dist/tools/verify-mmr.js';
import { verifyC2paSignature } from '../../verify-mcp/dist/tools/verify-c2pa-signature.js';

export class BriefError extends Error {}
export const help = 'Please send one complete JSON request, alone or in a ```json block: {"operation":"sha256","input":{"payloadHex":"68656c6c6f","expectedDigestHex":"<64 hex characters>"}}. Other operations: verify_mmr, verify_artifact, verify_claim_signature. See the listing for schemas. Maximum request: 160 KiB; binary payload: 64 KiB. URLs and local file paths are not fetched. For rework, send the full replacement JSON request.';

export function parseBrief(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 163840) throw new BriefError('Request too large or missing.');
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (fenced.length > 1) throw new BriefError('Send exactly one JSON request.');
  let request;
  try { request = JSON.parse(fenced.length ? fenced[0][1] : text.trim()); }
  catch { throw new BriefError('A complete JSON request is required.'); }
  if (!request || Array.isArray(request) || Object.keys(request).sort().join(',') !== 'input,operation' ||
      !request.input || typeof request.input !== 'object' || Array.isArray(request.input)) throw new BriefError('Expected operation and input only.');
  if (!['sha256', 'verify_mmr', 'verify_artifact', 'verify_claim_signature'].includes(request.operation)) throw new BriefError('Unsupported operation.');
  return request;
}

export async function execute(request) {
  const { operation, input } = request;
  try {
    if (operation === 'verify_mmr') return await verifyMmr(input);
    if (operation === 'verify_artifact') return await verifyArtifact(input);
    if (operation === 'verify_claim_signature') return await verifyC2paSignature(input);
    if (operation !== 'sha256') throw new Error();
    if (Object.keys(input).some(k => !['payloadHex', 'expectedDigestHex'].includes(k)) ||
        typeof input.payloadHex !== 'string' || input.payloadHex.length > 131072 || !/^(?:[a-f\d]{2})*$/i.test(input.payloadHex) ||
        (input.expectedDigestHex !== undefined && !/^[a-f\d]{64}$/i.test(input.expectedDigestHex))) throw new Error();
    const digestHex = createHash('sha256').update(Buffer.from(input.payloadHex, 'hex')).digest('hex');
    return { schema: 'arkhe-sha256-result/v1', operation: 'SHA256', digestHex,
      status: input.expectedDigestHex === undefined ? 'DIGEST_COMPUTED' :
        digestHex === input.expectedDigestHex.toLowerCase() ? 'DIGEST_MATCH' : 'DIGEST_MISMATCH',
      provenanceVerification: 'NOT_PERFORMED', policyAuthorization: 'NOT_PERFORMED', authority: false };
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' || error?.code === 'ENOENT') throw error;
    throw new BriefError('The request does not match the operation schema or cannot be parsed by the verifier.');
  }
}

export function report(request, result) {
  // No buyer-controlled text is interpolated into prose or Markdown fences.
  return '# Arkhe verification report\n\nOperation: ' + request.operation +
    '\n\n```json\n' + JSON.stringify(result, null, 2).replaceAll('`', '\\u0060') + '\n```\n\n' +
    'Scope: results apply only to the supplied bytes and evidence. MMR inclusion is relative to the supplied root; its checkpoint is not authenticated. Claim signatures use the Arkhe Ed25519 profile and caller-supplied trust roots, not standard C2PA/COSE validation. Digests and canonicalization do not authenticate provenance. No model-execution proof, policy authorization, regulatory certification, external timestamp or payment authorization is established.\n';
}
