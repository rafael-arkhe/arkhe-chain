/** Alternate pure policy implementation: ordered predicates over retained facts.
 * No Python imports, shared rule table, generator, validator or expected outputs.
 * This is a local conformance CLI over host observations, not an admission API.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const integer = x => BigInt(x);
const ordered = xs => [...xs].sort();
const equal = (a, b) => canonical(a) === canonical(b);
const least = xs => xs.map(integer).reduce((a, b) => a < b ? a : b);

export function canonical(value) {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('unsafe number');
    return String(value);
  }
  if (typeof value === 'string') {
    if (!value.isWellFormed()) throw new Error('invalid Unicode');
    return JSON.stringify(value);
  }
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => canonical(k) + ':' + canonical(value[k])).join(',') + '}';
}

const hash = (tag, obj) => createHash('sha256')
  .update(`ARKHE:BROKER:${tag}:v1\0`).update(canonical(obj)).digest('hex');

function facts(d) {
  const p = d.policy, o = d.observations, b = o.bundle.body, q = d.candidate.query;
  const refs = ordered(d.chunks.map(c => c.record_hash));
  const safe = [...d.chunks].sort((a, b) => a.chunk_id < b.chunk_id ? -1 : a.chunk_id > b.chunk_id ? 1 : 0)
    .filter(c => c.per_chunk.integrity === 'OK' && c.per_chunk.access === 'Permitted'
      && c.per_chunk.state === 'Current' && c.per_chunk.transform === 'Accepted');
  const transformMap = new Map(o.transform_items.map(x => [x.transformation_ref, x.verdict]));
  let state;
  if (!q.historical_req && p.profile_id === 'arkhe-broker-local-v2'
      && integer(d.anchors.leaf_count) < integer(d.anchors.minimum_leaf_count)) state = 'Stale';
  else if (q.historical_req && (!p.historical_permitted || b.state === 'HistoricalDenied')) state = 'HistoricalDenied';
  else if (integer(b.observed_at) > integer(d.clock_ms)
    || integer(d.clock_ms) - integer(b.observed_at) > integer(p.max_state_age_ms)
    || integer(d.clock_ms) >= integer(b.expires_at.state)) state = 'Stale';
  else if (q.historical_req) {
    const at = integer(q.historical_req.requested_instant);
    state = b.state === 'Historical' && b.historical_state === 'Active'
      && integer(b.effective_from) <= at && at < integer(b.effective_to) ? 'Historical' : 'Unknown';
  } else state = ['Current', 'Revoked', 'Superseded', 'Unknown', 'Stale'].includes(b.state) ? b.state : 'Unknown';

  let doc = o.documental;
  const m = o.mechanism;
  if (m.kind === 'Derived') {
    const a = d.derivation_artifact;
    const valid = a && p.accepted_rules.includes(`${m.rule_id ?? ''}@${m.rule_version ?? ''}`)
      && m.derivation_binding_valid && m.derivation_artifact_ref === hash('DERIVATION', a)
      && equal(a.conclusion, a.premise_claim) && equal(a.conclusion, d.candidate.claim)
      && equal(m.premise_refs, refs) && d.chunks.every(c => c.per_chunk.state === 'Current');
    if (!valid) doc = 'Invalid';
  } else if (doc === 'Complete' && !m.predicate_span_valid) doc = 'Invalid';
  if (doc === 'Complete' && safe.length !== d.chunks.length) doc = 'Incomplete';
  const sem = o.semantic.body;
  const semanticBound = sem.claim_digest === hash('CLAIM', d.candidate.claim)
    && equal(sem.support_refs, refs) && sem.support_set_digest === hash('SUPPORT', sem.support_refs);
  const semanticAccepted = semanticBound && sem.outcome === 'Supported' && sem.method === 'Human'
    && sem.evaluator === p.accepted_evaluator && sem.evaluator_version === '1';
  let aggregateAccess = null;
  if (d.aggregation) {
    const entries = b.source_authorizations ?? [], grants = b.aggregate_authorizations ?? [];
    const auth = grants.find(a => a.aggregate_id === d.aggregation.aggregate_id) ?? {};
    const byId = new Map(entries.map(a => [a.chunk_id, a]));
    const binding = p.profile_id === 'arkhe-broker-local-v2' && grants.length === 1 && byId.size === entries.length
      && entries.length === d.chunks.length && equal(d.aggregation.constituent_refs, refs)
      && auth.aggregate_id === d.aggregation.aggregate_id && auth.principal === d.session.principal
      && equal(auth.constituent_refs ?? [], refs)
      && d.chunks.every(c => byId.get(c.chunk_id)?.tenant === c.record.tenant && byId.get(c.chunk_id)?.scope === c.record.scope);
    const cross = d.chunks.some(c => c.record.tenant !== d.session.tenant);
    aggregateAccess = !binding || (cross && !p.cross_tenant_aggregation_permitted)
      || auth.verdict === 'Denied' || entries.some(a => a.verdict === 'Denied') ? 'Denied'
      : auth.verdict !== 'Permitted' || entries.some(a => a.verdict !== 'Permitted') ? 'Unknown' : 'Permitted';
  }
  return { p, o, b, q, state, doc, safe, transformMap, semanticAccepted, semanticBound, aggregateAccess };
}

function select(d, f) {
  const { p, o, b, q, state, doc, safe, transformMap, semanticAccepted, aggregateAccess } = f;
  const rules = [
    ['REQUEST_INVALID', 'Reject', () => !d.session.principal || !d.chunks.length || d.chunks.length > 32
      || new Set(d.chunks.map(c => c.chunk_id)).size !== d.chunks.length
      || d.candidate.claim.qualifiers.length > 16
      || d.chunks.some(c => c.bytes_hex.length / 2 > 32768)
      || d.chunks.reduce((n, c) => n + c.bytes_hex.length / 2, 0) > 65536],
    ['POLICY_UNRESOLVED', 'Exclude', () => !['arkhe-broker-local-v1', 'arkhe-broker-local-v2'].includes(p.profile_id)
      || !p.purposes.includes(q.purpose) || !p.best_effort_permitted
      || !p.accepted_revision_combinations.some(r => equal(r, b.revisions)) || hash('POLICY', p) !== d.policy_digest],
    ['ACCESS_DENIED', 'Reject', () => b.access === 'Denied' || b.subject !== d.session.principal || aggregateAccess === 'Denied'
      || d.chunks.some(c => c.per_chunk.access === 'Denied' || (!d.aggregation && (c.record.tenant !== d.session.tenant
        || !d.session.scopes.includes(c.record.scope))))],
    ['ACCESS_UNKNOWN', 'Exclude', () => b.access === 'Unknown' || aggregateAccess === 'Unknown' || d.chunks.some(c => c.per_chunk.access === 'Unknown')],
    ['INTEGRITY_INVALID', 'Reject', () => o.integrity === 'Invalid' || d.chunks.some(c => c.per_chunk.integrity === 'Invalid')],
    ['INTEGRITY_UNKNOWN', 'Exclude', () => o.integrity !== 'OK' || d.chunks.some(c => c.per_chunk.integrity !== 'OK')],
    ['TRANSFORM_REJECTED', 'Reject', () => d.chunks.some(c => p.rejected_transforms.includes(c.record.transformation_ref))
      || o.transform_items.some(x => x.verdict === 'Rejected')],
    ['TRANSFORM_UNKNOWN', 'Exclude', () => d.chunks.some(c => !p.accepted_transforms.includes(c.record.transformation_ref)
      || transformMap.get(c.record.transformation_ref) !== 'Accepted')],
    ['HISTORICAL_DENIED', 'Reject', () => state === 'HistoricalDenied'],
    ['STATE_UNAVAILABLE', 'Exclude', () => ['Unknown', 'Stale'].includes(state)
      || integer(d.clock_ms) >= least(Object.values(b.expires_at))],
    ['STATE_DISALLOWED', 'Reject', () => ['Revoked', 'Superseded'].includes(state)],
    ['DOCUMENT_INVALID', 'Reject', () => ['Invalid', 'NotEvaluated'].includes(doc)],
    ['ANALYSIS_CHUNKS_ONLY', 'AdmitChunksOnly', () => q.purpose === 'Analysis' && state === 'Current' && doc === 'Incomplete' && safe.length > 0],
    ['DOCUMENT_INCOMPLETE', 'Reject', () => doc === 'Incomplete'],
    ['ASSERTION_UNSUPPORTED', 'Reject', () => q.purpose === 'Assertion' && !semanticAccepted],
    ['RELEASE_HISTORICAL', 'AdmitHistorical', () => doc === 'Complete' && state === 'Historical'],
    ['RELEASE_CURRENT', 'Admit', () => doc === 'Complete' && state === 'Current'],
    ['DEFAULT_EXCLUDE', 'Exclude', () => true],
  ];
  const [rule, decision] = rules.find(([, , matches]) => matches());
  return { rule, decision };
}

function accessLease(d) {
  const env = d.delivery.grant;
  if (!env) return 'Absent';
  const g = env.body;
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(d.anchors.public_key_hex, 'hex')]), type: 'spki', format: 'der' });
    const valid = env.key_id === d.anchors.key_id && verify(null,
      Buffer.from('ARKHE:BROKER:SIGN:GRANT:v1\0' + canonical(g)), key, Buffer.from(env.signature_hex, 'hex'));
    if (!valid) return 'Invalid';
  } catch { return 'Invalid'; }
  if (g.contract_id !== 'fixture-lease-v1' || g.issuer !== d.anchors.key_id || g.subject !== d.session.principal
    || !equal(g.resources, d.observations.bundle.body.resources) || !equal(g.operations, ['access_check'])
    || g.conditions.length || g.purpose !== d.candidate.query.purpose
    || g.revision !== d.observations.bundle.body.revisions.authorization) return 'Invalid';
  const at = integer(d.delivery.attempted_at);
  if (at < integer(g.not_before) || at >= integer(g.valid_until)) return 'Expired';
  return d.policy.grants_permitted ? 'Valid' : 'Unaccepted';
}

function deliver(d, decision, snap) {
  const result = (outcome, code) => ({ outcome, code });
  const lease = accessLease(d), event = d.delivery, at = integer(event.attempted_at);
  const unchanged = ['state', 'policy', 'anchor_set', ...(lease === 'Valid' ? [] : ['authorization'])]
    .every(k => event.observed_revisions[k] === snap.revisions[k]);
  const guards = [
    [['Reject', 'Exclude'].includes(decision), 'Blocked', 'DECISION_DENIED'],
    [lease === 'Invalid', 'Blocked', 'GRANT_INVALID'],
    [at >= integer(snap.valid_until), 'Reevaluate', 'SNAPSHOT_EXPIRED'],
    [!event.other_sources_available, 'Blocked', 'SOURCE_UNAVAILABLE'],
    [!unchanged, 'Reevaluate', 'REVISION_CHANGED'],
    [at < integer(snap.temporal_guarantee.validated_at)
      || at >= integer(snap.temporal_guarantee.validated_at) + integer(snap.temporal_guarantee.accepted_interval_ms),
    'Reevaluate', 'VALIDATION_WINDOW_EXPIRED'],
    [lease === 'Valid', 'Release', 'ACCESS_GRANT'],
    [!event.authorization_source_available, 'Blocked', 'SOURCE_UNAVAILABLE'],
    [true, 'Release', 'VALIDATION_WINDOW'],
  ];
  const [, outcome, code] = guards.find(([condition]) => condition);
  return result(outcome, code);
}

export function decide(d) {
  const f = facts(d), { rule, decision } = select(d, f);
  const historical = f.q.historical_req;
  const payload = { chunks: [], claim_status: 'Omitted',
    temporal_context: historical ? { mode: 'Historical', ...historical } : { mode: 'Current' }, restrictions: [] };
  let flags = [];
  if (!['Reject', 'Exclude'].includes(decision)) {
    payload.chunks = f.safe.map(c => ({ chunk_id: c.chunk_id, bytes_hex: c.bytes_hex,
      chunk_digest: c.record.chunk_digest, text_position: c.record.text_position,
      source_digest: c.record.source_digest, evidence_ref: c.record_hash }));
    if (decision === 'AdmitChunksOnly') {
      flags = ['RELATION_OMITTED'];
      payload.restrictions = ['ANALYSIS_ONLY', 'NO_RELATION_SUPPORT'];
    } else {
      payload.claim = d.candidate.claim;
      if (f.semanticBound) payload.semantic = f.o.semantic.body;
      payload.claim_status = f.q.purpose === 'Analysis' ? 'ForAnalysis' : 'SupportedByEvaluation';
    }
  }
  const snapshot = { evaluated_at: d.clock_ms,
    valid_until: least([...Object.values(f.b.expires_at), integer(d.clock_ms)+integer(f.p.max_decision_ttl_ms)]),
    revisions: f.b.revisions, policy_digest: d.policy_digest, anchor_set_digest: hash('ANCHORS', d.anchors),
    consistency: { mode: 'BestEffort', profile_id: 'frozen-observations-v1', observation_digest: hash('OBSERVATIONS', f.o) },
    temporal_guarantee: { kind: 'ValidatedAt', validated_at: d.clock_ms, accepted_interval_ms: f.p.accepted_interval_ms } };
  return { decision, applied_rule: rule, flags, reasons: [{ rule_id: rule, code: 'RULE_MATCH' }],
    released_payload: payload, snapshot, delivery: deliver(d, decision, snapshot) };
}

function parseExact(raw) {
  return JSON.parse(raw, (key, value, context) => {
    if (typeof value !== 'number') return value;
    if (!/^(0|[1-9][0-9]*)$/.test(context.source)) throw new Error('integer JSON required');
    const exact = BigInt(context.source);
    if (exact > 18446744073709551615n) throw new Error('u64 overflow');
    return exact <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(exact) : exact;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = parseExact(readFileSync(0, 'utf8'));
  const output = Array.isArray(input) ? input.map(decide) : decide(input);
  process.stdout.write(canonical(output));
}
