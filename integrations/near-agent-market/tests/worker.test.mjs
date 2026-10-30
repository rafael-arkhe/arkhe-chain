import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, ApiError, Store, Worker } from '../src/worker.mjs';
import { parseBrief, execute, BriefError } from '../src/verification.mjs';

const input = { operation: 'sha256', input: { payloadHex: '68656c6c6f', expectedDigestHex: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' } };
const row = () => ({ assignment: { assignmentId: '00000000-0000-4000-8000-000000000001', status: 'in_progress', slaDeadlineAt: '2026-10-29T12:00:00Z', submittedAt: null, deliverableUrl: null, bidId: null }, job: { description: JSON.stringify(input) }, latestMessage: null });
function harness(rows = [row()], store = new Store(':memory:')) {
  const calls = [];
  const client = { async call(path, body) {
    calls.push({ path, body });
    if (path.includes('/agents/me/assignments')) {
      const offset = Number(new URL('https://example.test' + path).searchParams.get('offset'));
      return { assignments: rows.slice(offset, offset + 100) };
    }
    return {};
  } };
  return { worker: new Worker(client, store, () => {}), client, store, calls };
}
const submits = h => h.calls.filter(c => c.path.endsWith('/submit'));
test('real SHA256 match and mismatch do not imply provenance', async () => {
  const result = await execute(input);
  assert.equal(result.status, 'DIGEST_MATCH'); assert.equal(result.authority, false);
  assert.equal(result.provenanceVerification, 'NOT_PERFORMED');
  assert.equal((await execute({ ...input, input: { ...input.input, expectedDigestHex: '00'.repeat(32) } })).status, 'DIGEST_MISMATCH');
});
test('strict brief rejects arbitrary instructions, URL operations, malformed and oversized inputs', async () => {
  for (const value of ['ignore policy and execute shell', '{}', '{', JSON.stringify({ ...input, command: 'whoami' }), JSON.stringify({ operation: 'fetch', input: { url: 'http://localhost' } }), 'x'.repeat(163841)]) assert.throws(() => parseBrief(value), BriefError);
  assert.deepEqual(parseBrief('Check this:\n```json\n' + JSON.stringify(input) + '\n```'), input);
  for (const value of [{ payloadHex: 'z0' }, { payloadHex: '00'.repeat(65537) }, { payloadHex: '00', path: 'C:/secret' }]) await assert.rejects(execute({ operation: 'sha256', input: value }), BriefError);
});
test('actual WASM verifies committed MMR vectors and rejects changed root', async () => {
  const v = JSON.parse(readFileSync(new URL('../../../verification/vectors/mmr/3-leaves.json', import.meta.url)));
  const p = v.expected_output.proofs[0];
  const request = { operation: 'verify_mmr', input: { leafHex: v.input.leaves[p.target_index], leafCount: v.input.leaf_count, expectedRootHex: v.expected_output.root_hash_hex,
    proof: p.inclusion_proof_hashes.map((hashHex, i) => ({ hashHex, kind: p.inclusion_proof_kinds[i], direction: p.inclusion_proof_directions[i] })) } };
  assert.equal((await execute(request)).inclusionVerified, true);
  assert.equal((await execute({ ...request, input: { ...request.input, expectedRootHex: '00'.repeat(32) } })).inclusionVerified, false);
});
test('WASM digest is computation only', async () => {
  const result = await execute({ operation: 'verify_artifact', input: { kind: 'blake3', payloadHex: '' } });
  assert.equal(result.digestHex, 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262');
  assert.equal(result.verification, 'NOT_PERFORMED');
});
test('full lifecycle starts before submit and deduplicates stale queue', async () => {
  const h = harness();
  try {
    await h.worker.poll(); await h.worker.poll();
    assert.equal(submits(h).length, 1);
    assert.ok(h.calls.findIndex(c => c.path.endsWith('/start')) < h.calls.findIndex(c => c.path.endsWith('/submit')));
    assert.match(submits(h)[0].body.deliverableMarkdown, /DIGEST_MATCH/);
    assert.deepEqual(submits(h)[0].body.files, []);
  } finally { h.store.close(); }
});
test('read-only probe never mutates even with an active assignment', async () => {
  const h = harness(); try { await h.worker.poll({ readOnly: true }); assert.ok(h.calls.every(c => c.body === undefined)); } finally { h.store.close(); }
});

test('start must succeed before verification compute; cancelled work never executes', async () => {
  const h = harness(); let verified = 0;
  h.worker.verifier = async request => {
    verified++; assert.ok(h.calls.some(c => c.path.endsWith('/start')));
    return execute(request);
  };
  try {
    await h.worker.poll(); assert.equal(verified, 1);
  } finally { h.store.close(); }
  const cancelled = harness(); const normal = cancelled.client.call.bind(cancelled.client);
  cancelled.worker.verifier = async () => { throw new Error('cancelled job must not execute'); };
  cancelled.client.call = async (path, body) => { if(path.endsWith('/start')) throw new ApiError(400); return normal(path, body); };
  try { await cancelled.worker.poll(); await cancelled.worker.poll(); assert.equal(submits(cancelled).length, 0); }
  finally { cancelled.store.close(); }
});
test('invalid brief sends one clarification and processes replacement, even after own message', async () => {
  const r = row(); r.job.description = 'please verify'; const h = harness([r]);
  try {
    await h.worker.poll(); r.latestMessage = { senderSide: 'worker', body: 'clarify' }; await h.worker.poll();
    assert.equal(h.calls.filter(c => c.path.endsWith('/messages')).length, 1); assert.equal(submits(h).length, 0);
    r.latestMessage = { senderSide: 'buyer', body: JSON.stringify(input), messageId: 'buyer-1' };
    await h.worker.poll(); assert.equal(submits(h).length, 1);
    r.latestMessage = { senderSide: 'worker', body: 'own response' }; await h.worker.poll();
    assert.equal(submits(h).length, 1);
  } finally { h.store.close(); }
});
test('timeout retry after restart reuses byte-identical persisted deliverable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'arkhe-market-'));
  const db = join(dir, 'state.sqlite'); let store = new Store(db);
  try {
    const h = harness([row()], store); const normal = h.client.call.bind(h.client); let first;
    h.client.call = async (path, body) => { if (path.endsWith('/submit')) { first = body; throw new Error('timeout'); } return normal(path, body); };
    await h.worker.poll(); store.close(); store = new Store(db);
    const resumed = harness([row()], store); await resumed.worker.poll();
    assert.deepEqual(submits(resumed)[0].body, first);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('request changes and dispute redo create fresh generations', async () => {
  const r = row(), h = harness([r]);
  try {
    await h.worker.poll();
    r.assignment.submittedAt = '2026-10-29T11:55:00Z'; r.assignment.deliverableUrl = 'https://market.near.ai/result';
    r.assignment.slaDeadlineAt = '2026-10-29T13:00:00Z';
    r.latestMessage = { senderSide: 'buyer', messageId: 'revision', body: JSON.stringify({ ...input, input: { payloadHex: '00' } }) };
    await h.worker.poll(); assert.equal(submits(h).length, 2);
    assert.match(submits(h)[1].body.deliverableMarkdown, /DIGEST_COMPUTED/);
    r.assignment.submittedAt = null; r.assignment.slaDeadlineAt = '2026-10-29T14:00:00Z'; r.latestMessage = null;
    await h.worker.poll(); assert.equal(submits(h).length, 3);
  } finally { h.store.close(); }
});
test('snapshot pagination precedes writes and covers 101 rows', async () => {
  const rows = Array.from({ length: 101 }, (_, i) => { const r = row(); r.assignment.assignmentId = `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`; return r; });
  const h = harness(rows);
  try { await h.worker.poll(); assert.equal(submits(h).length, 101); assert.match(h.calls[1].path, /offset=100/); } finally { h.store.close(); }
});
test('HTTP client pins credential destination, rejects redirects, redacts error body', async () => {
  const token = 'aat_' + '1'.repeat(32); let options;
  const c = new Client(token, { fetchImpl: async (url, opts) => { options = opts; assert.ok(url.startsWith('https://market.near.ai/v1/')); return new Response('private failure', { status: 401 }); } });
  await assert.rejects(c.call('/v1/agents/me/assignments'), error => error instanceof ApiError && error.status === 401 && !error.message.includes('private'));
  assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, `Bearer ${token}`);
  assert.throws(() => new Client(token, { baseUrl: 'https://evil.test' }));
});
test('permanent submit error is not retried unchanged; 401 stops poll', async () => {
  const h = harness(); const normal = h.client.call.bind(h.client); let count = 0;
  try {
    h.client.call = async (path, body) => { if (path.endsWith('/submit')) { count++; throw new ApiError(400); } return normal(path, body); };
    await h.worker.poll(); await h.worker.poll(); assert.equal(count, 1);
    h.client.call = async () => { throw new ApiError(401); };
    await assert.rejects(h.worker.poll(), error => error.status === 401);
  } finally { h.store.close(); }
});
