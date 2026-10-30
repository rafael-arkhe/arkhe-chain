import { createRequire } from 'node:module';
import { check } from './witness.mjs';
import { verifyWitnessQuorum } from './witness.mjs';
import { verifyRekorAnchor } from './rekor.mjs';

export function verifyAnchoredPassport(passportJson, contextJson, anchor, rootBytes, logPolicy, witnessNote, witnessPolicy) {
  try {
    check(typeof passportJson === 'string' && Buffer.byteLength(passportJson) <= 32768 &&
      typeof contextJson === 'string' && Buffer.byteLength(contextJson) <= 4096, 'INPUT_TOO_LARGE');
    const log = verifyRekorAnchor(anchor, rootBytes, logPolicy);
    const witnesses = verifyWitnessQuorum(witnessNote, log.checkpoint_envelope, witnessPolicy);
    check(witnessPolicy.now >= log.integrated_time, 'OBSERVATION_TIME_INVALID');
    const context = JSON.parse(contextJson);
    check(context.now === witnessPolicy.now && witnesses.cosigned_at.every(time => time >= log.integrated_time), 'OBSERVATION_TIME_INVALID');
    check(!Object.hasOwn(context, 'expected_root') && !Object.hasOwn(context, 'expected_leaf_count'), 'ANCHOR_CONTEXT_MUST_NOT_OVERRIDE_ROOT');
    const wasm = createRequire(import.meta.url)('../pkg/arkhe_kya_experimental.js');
    // Preserve original JSON text so Rust still rejects duplicate known fields.
    const raw = contextJson.trim();
    const added = JSON.stringify({ expected_root: anchor.checkpoint.mmr_root, expected_leaf_count: anchor.checkpoint.leaf_count });
    const derived = raw.slice(0, -1) + (Object.keys(context).length ? ',' : '') + added.slice(1);
    const result = JSON.parse(wasm.verify_agent_integrity_record(passportJson, derived));
    if (result.outcome !== 'CRYPTOGRAPHIC_CHECKS_PASSED') return result;
    return { ...result, anchor_authenticity: 'LOG_INCLUSION_AND_WITNESS_QUORUM_VERIFIED',
      anchor_profile: log.profile, log_id: log.log_id, log_tree_size: log.tree_size, witnesses,
      warning: 'Experimental synthetic receipt. Authenticated log inclusion and pinned witness signatures; witness independence and historical consistency rely on external trust. No legal identity, runtime attestation, revocation or authorization grant.' };
  } catch (error) {
    return { outcome: 'NOT_VERIFIABLE', profile: 'arkhe-kya-experimental@1', label: 'synthetic-poc', reason: error.message };
  }
}
