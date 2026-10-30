import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesOutputSchema } from './output-schema.mjs';
import { readFileSync } from 'node:fs';
import { Publication, approvedDocument, intent, digest, OperationConflictError, ForeignDecisionError } from './publication.mjs';
const stencil = JSON.parse(readFileSync(new URL('./stencil.json', import.meta.url)));
function setup() {
  const service = new Publication(stencil);
  service.seed('doc-1', approvedDocument());
  service.setRoles('alice', ['publisher']);
  return service;
}
test('publishes once; exact replay returns the same evidence', () => {
  const s = setup(), request = intent(), ticket = s.evaluate(request);
  const first = s.apply(ticket);
  assert.equal(first.observedEffect, 'DOCUMENT_PUBLISHED');
  assert.equal(s.document('doc-1').state, 'published');
  assert.deepEqual(s.apply(s.evaluate(request)), first);
  assert.equal(s.records().length, 1);
});
for (const [name, change, expected] of [
  ['unauthorized', s => s.setRoles('alice', []), 'DENY'],
  ['unavailable', s => s.setAvailable(false), 'INDETERMINATE'],
  ['unapproved content', s => s.seed('doc-1', { ...approvedDocument(), body: 'Changed' }), 'DENY'],
  ['required field', s => s.seed('doc-1', { ...approvedDocument(), title: '' }), 'DENY'],
]) test(name + ' blocks without mutation', () => {
  const s = setup(); change(s); const before = s.document('doc-1');
  const record = s.apply(s.evaluate(intent()));
  assert.equal(record.decision, expected);
  assert.equal(record.enforcement, 'BLOCKED');
  assert.deepEqual(s.document('doc-1'), before);
  assert.deepEqual(record.before, record.after);
});
for (const [name, change] of [
  ['document revision', s => s.seed('doc-1', { ...approvedDocument(), revision: 2 })],
  ['permission revocation', s => s.setRoles('alice', [])],
  ['stencil change', s => s.setStencil({ ...stencil, version: '2.0.0' })],
  ['evaluator outage', s => s.setAvailable(false)],
]) test('TOCTOU: ' + name, () => {
  const s = setup(), ticket = s.evaluate(intent());
  assert.equal(ticket.decision, 'ALLOW'); change(s);
  const before = s.document('doc-1'), record = s.apply(ticket);
  assert.equal(record.enforcement, 'BLOCKED');
  assert.deepEqual(s.document('doc-1'), before);
});
test('forged decisions and OperationId collisions are rejected', () => {
  const s = setup(), request = intent();
  assert.throws(() => s.apply({ decision: 'ALLOW' }), /Unknown decision/);
  s.apply(s.evaluate(request));
  assert.throws(() => s.apply(s.evaluate({ ...request, actorId: 'mallory' })), /collision/);
});
test('caller cannot mutate proposal, decision, document or evidence through references', () => {
  const s = setup(), request = intent(), ticket = s.evaluate(request);
  request.documentId = 'other';
  assert.throws(() => { ticket.decision = 'DENY'; }, TypeError);
  const record = s.apply(ticket); record.after.state = 'corrupt';
  const doc = s.document('doc-1'); doc.state = 'corrupt';
  assert.equal(s.document('doc-1').state, 'published');
  assert.equal(s.records()[0].after.state, 'published');
});
test('broken evidence contract blocks publication', () => {
  const s = setup(); s.setStencil({ ...stencil, evidenceFields: ['missing'] });
  assert.throws(() => s.apply(s.evaluate(intent())), /Evidence contract/);
  assert.equal(s.document('doc-1').state, 'approved');
  assert.equal(s.records().length, 0);
});

test('stale evidence exposes evaluated revision separately from application state', () => {
  const s = setup(), original = s.document('doc-1');
  const ticket = s.evaluate(intent());
  s.seed('doc-1', { ...original, revision: 2 });
  const record = s.apply(ticket);
  assert.deepEqual(record.evaluatedSnapshot, original);
  assert.equal(record.evaluatedSnapshot.revision, 1);
  assert.equal(record.before.revision, 2);
  assert.equal(record.evaluatedSnapshot.approvedHash, record.before.approvedHash);
  assert.equal(record.evaluationDecision, 'ALLOW');
  assert.equal(record.rule, 'decision.stale');
  assert.equal(record.revalidationOutcome, 'SNAPSHOT_MISMATCH');
  assert.deepEqual(record.mismatchFields, ['revision']);
  assert.equal(record.decision, 'DENY');
  assert.deepEqual(record.before, record.after);
  record.evaluatedSnapshot.revision = 999;
  assert.equal(s.records()[0].evaluatedSnapshot.revision, 1);
});

test('all outcomes contain snapshots and parseable evaluation/application timestamps', () => {
  for (const scenario of ['valid', 'invalid', 'unavailable']) {
    const s = setup();
    if (scenario === 'invalid') s.setRoles('alice', []);
    if (scenario === 'unavailable') s.setAvailable(false);
    const before = s.document('doc-1'), record = s.apply(s.evaluate(intent()));
    assert.deepEqual(record.evaluatedSnapshot, before);
    assert.equal(record.revalidationOutcome, 'SNAPSHOT_MATCH');
    assert.deepEqual(record.mismatchFields, []);
    for (const field of ['evaluatedAt', 'appliedAt']) {
      assert.equal(new Date(record[field]).toISOString(), record[field]);
    }
    assert.ok(stencil.evidenceFields.every(field => Object.hasOwn(record, field)));
  }
});

test('content and revision changes expose every changed field in sorted order', () => {
  const s = setup(), ticket = s.evaluate(intent());
  const content = { title: approvedDocument().title, body: 'Novo conteúdo aprovado administrativamente.' };
  s.seed('doc-1', { ...content, state: 'approved', revision: 2, approvedHash: digest(content) });
  const record = s.apply(ticket);
  assert.equal(record.rule, 'decision.stale');
  assert.deepEqual(record.mismatchFields, ['approvedHash', 'body', 'revision']);
  assert.deepEqual(record.before, record.after);
});

test('document match never bypasses permission or availability revalidation', () => {
  for (const change of [s => s.setRoles('alice', []), s => s.setAvailable(false)]) {
    const s = setup(), ticket = s.evaluate(intent()); change(s);
    const record = s.apply(ticket);
    assert.equal(record.revalidationOutcome, 'SNAPSHOT_MATCH');
    assert.equal(record.enforcement, 'BLOCKED');
  }
});

test('blocked operation remains final after permissions change; new id can publish', () => {
  const s = setup(), request = intent(); s.setRoles('alice', []);
  const first = s.apply(s.evaluate(request));
  s.setRoles('alice', ['publisher']);
  assert.deepEqual(s.apply(s.evaluate(request)), first);
  assert.equal(s.apply(s.evaluate(intent())).decision, 'ALLOW');
  assert.equal(s.records().length, 2);
});

test('operation collision has a typed error and code', () => {
  const s = setup(), request = intent(); s.apply(s.evaluate(request));
  assert.throws(() => s.apply(s.evaluate({ ...request, documentId: 'other' })),
    error => error instanceof OperationConflictError && error.code === 'OPERATION_CONFLICT');
});

test('foreign and copied tickets cannot publish or alter the journal', () => {
  const a = setup(), b = setup(), ticket = a.evaluate(intent());
  for (const forged of [ticket, { ...ticket }, null]) {
    assert.throws(() => b.apply(forged), error => error instanceof ForeignDecisionError && error.code === 'FOREIGN_DECISION');
  }
  assert.throws(() => a.apply({ ...ticket }), ForeignDecisionError);
  assert.equal(b.document('doc-1').state, 'approved');
  assert.deepEqual(b.records(), []);
});

test('stencil change gets a distinct rule and keeps original version provenance', () => {
  const s = setup(), ticket = s.evaluate(intent());
  const changed = { ...stencil, version: '2.0.0' }; s.setStencil(changed);
  const record = s.apply(ticket);
  assert.equal(record.rule, 'stencil.changed');
  assert.equal(record.decision, 'DENY');
  assert.equal(record.revalidationOutcome, 'SNAPSHOT_MATCH');
  assert.equal(record.stencilVersion, stencil.version);
  assert.equal(record.stencilHash, digest(stencil));
  assert.equal(record.appliedStencilHash, digest(changed));
  assert.deepEqual(record.before, record.after);
});

test('document presence changes use the sentinel in either direction', () => {
  for (const present of [true, false]) {
    const s = setup(); if (!present) s.seed('doc-1', null);
    const ticket = s.evaluate(intent());
    s.seed('doc-1', present ? null : approvedDocument());
    const record = s.apply(ticket);
    assert.equal(record.revalidationOutcome, 'SNAPSHOT_MISMATCH');
    assert.deepEqual(record.mismatchFields, ['$document']);
    assert.equal(record.enforcement, 'BLOCKED');
    assert.deepEqual(record.before, record.after);
  }
});

test('request identity ignores field order and defaults omitted action to publish', () => {
  const s = setup(), request = intent(), first = s.apply(s.evaluate(request));
  const reordered = { actorId: request.actorId, documentId: request.documentId, operationId: request.operationId };
  assert.deepEqual(s.apply(s.evaluate(reordered)), first);
  assert.equal(first.action, 'publish');
  assert.throws(() => s.apply(s.evaluate({ ...request, action: 'delete' })), OperationConflictError);
});

test('unsupported actions cannot publish and publishing preserves revision', () => {
  const s = setup();
  const blocked = s.apply(s.evaluate({ ...intent(), action: 'delete' }));
  assert.equal(blocked.rule, 'action.allowed');
  assert.deepEqual(blocked.before, blocked.after);
  const published = s.apply(s.evaluate(intent()));
  assert.equal(published.after.state, 'published');
  assert.equal(published.after.revision, published.before.revision);
});

test('serialized or structured-cloned decisions lose private provenance', () => {
  const s = setup(), ticket = s.evaluate(intent());
  for (const clone of [structuredClone(ticket), JSON.parse(JSON.stringify(ticket))]) {
    assert.throws(() => s.apply(clone), ForeignDecisionError);
  }
  assert.equal(s.document('doc-1').state, 'approved');
  assert.deepEqual(s.records(), []);
});

test('extra request fields are ignored without granting authority or changing replay', () => {
  const s = setup(), request = intent(), first = s.apply(s.evaluate(request));
  const extra = { actorId: request.actorId, action: 'publish', documentId: request.documentId,
    operationId: request.operationId, decision: 'ALLOW', roles: ['admin'], arbitrary: 'ignored' };
  assert.deepEqual(s.apply(s.evaluate(extra)), first);
  s.setRoles('alice', []);
  const blocked = s.apply(s.evaluate({ ...intent(), roles: ['publisher'], decision: 'ALLOW' }));
  assert.equal(blocked.decision, 'DENY');
  assert.equal(blocked.rule, 'actor.publisher');
  assert.equal(s.records().length, 2);
});

test('every emitted rule is declared in the stencil catalog', () => {
  const scenarios = [
    [() => {}, () => {}],
    [s => s.setAvailable(false), () => {}],
    [s => s.setRoles('alice', []), () => {}],
    [s => s.seed('doc-1', null), () => {}],
    [s => s.seed('doc-1', { ...approvedDocument(), title: '' }), () => {}],
    [s => s.seed('doc-1', { ...approvedDocument(), revision: '1' }), () => {}],
    [s => s.seed('doc-1', { ...approvedDocument(), state: 'draft' }), () => {}],
    [s => s.seed('doc-1', { ...approvedDocument(), body: 'Changed' }), () => {}],
    [() => {}, s => s.seed('doc-1', { ...approvedDocument(), revision: 2 })],
    [() => {}, s => s.setStencil({ ...stencil, version: 'next' })],
  ];
  const seen = new Set();
  for (const [prepare, between] of scenarios) {
    const s = setup(); prepare(s); const ticket = s.evaluate(intent()); between(s);
    const r = s.apply(ticket); seen.add(r.rule); seen.add(r.evaluationRule);
  }
  const s = setup(); seen.add(s.apply(s.evaluate({ ...intent(), action: 'delete' })).rule);
  assert.deepEqual([...seen].sort(), Object.keys(stencil.rules).sort());
  for (const rule of seen) assert.equal(typeof stencil.rules[rule], 'string');
});

test('structured output: invalid fields, missing fields and extras are blocked', () => {
  const missing = approvedDocument(); delete missing.revision;
  for (const document of [missing, { ...approvedDocument(), revision: '1' },
    { ...approvedDocument(), revision: 0 }, { ...approvedDocument(), revision: 1.5 },
    { ...approvedDocument(), unexpected: true }]) {
    const s = setup(); s.seed('doc-1', document);
    const record = s.apply(s.evaluate(intent()));
    assert.equal(record.decision, 'DENY');
    assert.equal(record.rule, 'output.schema');
    assert.deepEqual(record.before, record.after);
    assert.deepEqual(s.document('doc-1'), document);
  }
});

test('structured output is checked again when the candidate changes before apply', () => {
  const s = setup(), ticket = s.evaluate(intent());
  s.seed('doc-1', { ...approvedDocument(), revision: '2' });
  const record = s.apply(ticket);
  assert.equal(record.evaluationDecision, 'ALLOW');
  assert.equal(record.rule, 'output.schema');
  assert.equal(record.enforcement, 'BLOCKED');
  assert.deepEqual(record.before, record.after);
});

test('missing or unsupported output schemas fail closed', () => {
  for (const schema of [undefined, { ...stencil.output_contract.schema, pattern: 'ignored?' },
    { ...stencil.output_contract.schema, properties: { revision: { type: 'boolean' } } }]) {
    const s = setup(); s.setStencil({ ...stencil, output_contract: { schema } });
    assert.equal(s.apply(s.evaluate(intent())).rule, 'output.schema');
  }
});

test('number schema accepts finite decimals and rejects NaN, infinity and coercion', () => {
  const schema = { type: 'object', required: ['score'], additionalProperties: false,
    properties: { score: { type: 'number', minimum: 0.25 } } };
  for (const score of [0.25, 0.8, 1]) assert.equal(matchesOutputSchema({ score }, schema), true);
  for (const score of [0.24, NaN, Infinity, -Infinity, '0.8', null])
    assert.equal(matchesOutputSchema({ score }, schema), false);
  assert.equal(matchesOutputSchema({ score: 1 }, { ...schema,
    properties: { score: { type: 'number', minimum: NaN } } }), false);
});
