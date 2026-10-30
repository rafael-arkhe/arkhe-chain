// Pure presentation rules for the Arkhe cockpit components. Fail-closed: any
// malformed or missing evidence renders as blocked/incomplete, never as passed.

export const TAU = Object.freeze(['LEMMA', 'CONJECTURE', 'REFUTED', 'PENDING']);

/** Layer names follow docs/ARKHE-ARQUITETURA-COMPLETA.md; L2/L3 hold authority. */
export const LAYERS = Object.freeze([
  { id: 'L0', name: 'Base de execução e cadeia de suprimento', authority: false },
  { id: 'L1', name: 'Primitivas canônicas', authority: false },
  { id: 'L2', name: 'Kernel (TCB)', authority: true },
  { id: 'L3', name: 'Governança', authority: true },
  { id: 'L4', name: 'Evidência', authority: false },
  { id: 'L5', name: 'Verificação pura', authority: false },
  { id: 'L6', name: 'Cognição', authority: false },
  { id: 'L7', name: 'Trabalho e orquestração', authority: false },
  { id: 'L8', name: 'Distribuição', authority: false },
  { id: 'L9', name: 'Interfaces e descoberta', authority: false },
]);

export function isTau(value) {
  return TAU.includes(value);
}

/**
 * Per-layer display state. A refuted layer blocks every layer above it; an
 * unknown or missing state is PENDING, never LEMMA.
 * @param {Record<string, string>} states layer id -> tau
 */
export function cascade(states = {}) {
  let blockedBy = null;
  return LAYERS.map((layer) => {
    const raw = states[layer.id];
    const tau = isTau(raw) ? raw : 'PENDING';
    const row = { ...layer, tau, blockedBy };
    if (!blockedBy && tau === 'REFUTED') blockedBy = layer.id;
    return row;
  });
}

const STEP_STATUS = ['pass', 'fail', 'pending', 'skipped'];

/**
 * Verdict over verification steps. Any failure rejects; any required step not
 * passed (pending, skipped, unknown) leaves the result incomplete; an empty
 * list is incomplete. Optional steps may be skipped without blocking.
 */
export function proofVerdict(steps = []) {
  const normalized = steps.map((step) => ({
    ...step,
    status: STEP_STATUS.includes(step.status) ? step.status : 'pending',
  }));
  const failed = normalized.find((s) => s.status === 'fail');
  if (failed) return { verdict: 'Rejected', tau: 'REFUTED', reason: `Refuted{${failed.id}}` };
  const missing = normalized.filter((s) => s.status !== 'pass' && !(s.optional && s.status === 'skipped'));
  if (normalized.length === 0 || missing.length > 0) {
    const ids = missing.map((s) => s.id).join(',') || 'no-steps';
    return { verdict: 'Incomplete', tau: 'CONJECTURE', reason: `Incomplete{${ids}}` };
  }
  return { verdict: 'Verified', tau: 'LEMMA', reason: null };
}

const BLOCK_KINDS = ['Incomplete', 'Refuted', 'Pending'];

/**
 * Gate for an action. Only `{ ok: true }` enables it; everything else is a
 * typed block. There is deliberately no override parameter.
 */
export function gateState(evidence) {
  if (evidence && evidence.ok === true) return { enabled: true, reason: null };
  const kind = BLOCK_KINDS.includes(evidence?.kind) ? evidence.kind : 'Incomplete';
  const detail = typeof evidence?.detail === 'string' && evidence.detail ? evidence.detail : 'evidence-missing';
  return { enabled: false, reason: `${kind}{${detail}}` };
}

/**
 * Triad gauge state from a k-of-n style observation. A claimed LEMMA that the
 * numbers do not support is downgraded; impossible numbers are PENDING.
 */
export function triadState({ have, need, tau }) {
  const valid = Number.isInteger(have) && Number.isInteger(need) && have >= 0 && need > 0;
  if (!valid) return { tau: 'PENDING', fraction: 0, label: '—' };
  const fraction = Math.min(have / need, 1);
  let shown = isTau(tau) ? tau : 'PENDING';
  if (shown === 'LEMMA' && have < need) shown = 'CONJECTURE';
  return { tau: shown, fraction, label: `${have}/${need}` };
}
