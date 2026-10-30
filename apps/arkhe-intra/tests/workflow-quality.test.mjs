// Product acceptance: state-machine permissions (Jira-style) and event funnels (Mixpanel-style).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
process.env.ARKHE_INTRA_DATA_DIR = mkdtempSync(join(tmpdir(), 'arkhe-workflow-quality-'));
const { allowed, createDocument, updateDocument, challenge, transition, summary } = await import('../lib/documents.mjs');
const { events, auditIntegrity } = await import('../lib/store.mjs');
function user(id, role) {
  const key = generateKeyPairSync('ed25519');
  return { id, role, publicKey: key.publicKey.export({ type: 'spki', format: 'pem' }), privateKey: key.privateKey };
}
const author = user('qa-author', 'author'), reviewer = user('qa-reviewer', 'reviewer'), owner = user('qa-owner', 'owner');
const stranger = user('qa-other-author', 'author');
function signed(user, doc, action) {
  const value = challenge(user, doc.id, action);
  return { action, revision: value.revision, digest: value.digest, signature: sign(null, Buffer.from(value.statement), user.privateKey).toString('base64') };
}
test('workflow permission matrix: all six states, four identities and four actions (96 cases)', () => {
  let count = 0;
  for (const state of ['draft', 'review', 'reviewed', 'approved', 'anchoring', 'published']) {
    for (const who of [author, reviewer, owner, stranger]) {
      for (const action of ['submit', 'review', 'approve', 'unknown']) {
        const expected = state === 'draft' && who === author && action === 'submit' ||
          state === 'review' && who === reviewer && action === 'review' ||
          state === 'reviewed' && who === owner && action === 'approve';
        assert.equal(allowed(who, { state, authorId: author.id, signatures: [] }, action), expected, `${state}/${who.role}/${who.id}/${action}`);
        count++;
      }
    }
  }
  assert.equal(count, 96);
  assert.equal(allowed({ ...reviewer, id: author.id }, { state: 'review', authorId: author.id }, 'review'), false);
  assert.equal(allowed(owner, { state: 'reviewed', authorId: author.id, signatures: [{ actorId: owner.id }] }, 'approve'), false);
});
test('event funnel: stale version, forged signature, duplicate click and replay produce no extra business events', async () => {
  const fields = { title: 'QA funnel', department: 'Jurídico', body: 'SYNTHETIC-PRIVATE-BODY' };
  let doc = createDocument(author, fields);
  const stale = signed(author, doc, 'submit');
  doc = updateDocument(author, doc.id, { ...fields, revision: 1, body: fields.body + ' v2' });
  const before = events().length;
  assert.throws(() => transition(author, doc.id, stale), { status: 409 });
  assert.throws(() => transition(author, doc.id, { ...signed(author, doc, 'submit'), signature: 'invalid' }), { status: 422 });
  assert.equal(events().length, before);
  const input = signed(author, doc, 'submit');
  const attempts = await Promise.allSettled([0, 1, 2].map(() => Promise.resolve().then(() => transition(author, doc.id, input))));
  assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(value => value.status === 'rejected').length, 2);
  doc = attempts.find(value => value.status === 'fulfilled').value;
  doc = transition(reviewer, doc.id, signed(reviewer, doc, 'review'));
  const approval = signed(owner, doc, 'approve');
  doc = transition(owner, doc.id, approval);
  assert.throws(() => transition(owner, doc.id, approval), { status: 403 });
  const funnel = events().filter(row => row.event.documentId === doc.id).map(row => row.event);
  assert.deepEqual(funnel.map(event => event.action), ['created', 'edited', 'submit', 'review', 'approve']);
  for (const event of funnel) {
    assert.equal(Number.isNaN(Date.parse(event.at)), false);
    assert.equal(event.documentId, doc.id);
    assert.equal(typeof event.actor, 'string');
    assert.doesNotMatch(JSON.stringify(event), /SYNTHETIC-PRIVATE-BODY|PRIVATE KEY|password|signature/i);
  }
  const dashboard = summary(owner);
  assert.equal(dashboard.counts.documents, dashboard.documents.length);
  assert.equal(dashboard.counts.pending, dashboard.tasks.length);
  assert.equal(dashboard.documents.find(value => value.id === doc.id).state, 'approved');
  assert.equal(auditIntegrity(), true);
});
