import { buildProof, verifyLeaf } from './proof.mjs';
import { PublicKey } from '@solana/web3.js';
export const PHASES = ['config', 'create', 'buy', 'sell', 'graduate', 'migrate', 'damm-buy', 'damm-sell'];
export function lifecycleBytes(event) {
  if (!PHASES.includes(event.phase) || !Number.isSafeInteger(event.sequence) || event.sequence < 0 || !Number.isSafeInteger(event.slot) || event.slot < 0) throw Error('invalid lifecycle event');
  for (const key of ['genesisHash', 'program', 'config', 'dbcPool', 'dammPool', 'baseMint', 'quoteMint']) if (new PublicKey(event[key]).toBase58() !== event[key]) throw Error(`invalid ${key}`);
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(event.signature) || !/^[a-f0-9]{64}$/.test(event.messageHash)) throw Error('invalid transaction reference');
  // Observations are ordered string pairs, committed as supplied; no floating point.
  if (!Array.isArray(event.observations) || event.observations.length > 64 || event.observations.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => typeof v !== 'string' || v.length > 256))) throw Error('invalid observations');
  return Buffer.from(JSON.stringify(['arkhe-meteora-event/v1', event.sequence, event.phase, event.genesisHash, event.program, event.config, event.dbcPool, event.dammPool, event.baseMint, event.quoteMint, event.signature, event.slot, event.messageHash, event.observations]));
}
export function exportLifecycle(events) {
  const leaves = events.map(lifecycleBytes);
  const receipts = events.map((event, index) => ({ event, ...buildProof(leaves, index) }));
  return { schema: 'arkhe-meteora-lifecycle/v1', rootHex: receipts[0].rootHex, leafCount: leaves.length, receipts };
}
export function verifyLifecycle(bundle, trustedRoot, trustedCount) {
  try {
    if (bundle.schema !== 'arkhe-meteora-lifecycle/v1' || bundle.rootHex !== trustedRoot || bundle.leafCount !== trustedCount || trustedCount !== PHASES.length || bundle.receipts.length !== trustedCount) return false;
    // The full export must commit to this order, not merely contain these leaves.
    if (buildProof(bundle.receipts.map(r => lifecycleBytes(r.event)), 0).rootHex !== trustedRoot) return false;
    const first = bundle.receipts[0].event;
    const seen = new Set();
    return bundle.receipts.every((receipt, index) => {
      const e = receipt.event;
      if (receipt.rootHex !== trustedRoot || receipt.leafCount !== trustedCount || e.sequence !== index || e.phase !== PHASES[index] || (index && e.slot < bundle.receipts[index - 1].event.slot) || seen.has(e.signature)) return false;
      seen.add(e.signature);
      for (const k of ['genesisHash', 'config', 'dbcPool', 'dammPool', 'baseMint', 'quoteMint']) if (e[k] !== first[k]) return false;
      const expected = index < 6 ? 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN' : 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';
      return e.program === expected && verifyLeaf(lifecycleBytes(e), receipt.proof, trustedRoot, trustedCount);
    });
  } catch { return false; }
}
