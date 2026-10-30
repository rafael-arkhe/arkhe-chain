import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
process.env.ARKHE_INTRA_DATA_DIR = mkdtempSync(join(tmpdir(), 'arkhe-native-drafts-'));
const { createDocument, updateDocument, exportDocument } = await import('../lib/documents.mjs');
const { db, auditIntegrity } = await import('../lib/store.mjs');
const { createNativeDraftBridge, nativeDraftRecords } = await import('../lib/native-drafts.mjs');
const { contentBytes } = await import('../lib/crypto.mjs');
const { root } = await import('../lib/paths.mjs');
const binary = resolve(root, 'target/debug/examples/intra_draft' + (process.platform === 'win32' ? '.exe' : ''));
execFileSync('cargo', ['build', '--locked', '-p', 'arkhe-core', '--example', 'intra_draft'], { cwd: root, windowsHide: true, stdio: 'pipe' });
const author = { id: 'native-author', role: 'author' };
const config = { binary, endpoint: 'http://127.0.0.1:8788', actor: 'local-operator', token: 'x'.repeat(32) };
const build = async (path, value) => JSON.parse(execFileSync(path, [], { input: JSON.stringify(value), windowsHide: true }));

test('native draft: real Rust identities, persisted retry, canonical readback and version isolation', async () => {
  const doc = createDocument(author, { title: 'Minuta', department: 'Jurídico', body: 'Texto reservado.' });
  const posts = []; let lost = true, corrupt = false;
  let expected;
  const bridge = createNativeDraftBridge({ config: () => config, build,
    send: async (_cfg, path, payload) => {
      expected = JSON.parse(db().prepare('SELECT prepared FROM native_document_drafts WHERE document_id=? ORDER BY revision DESC').get(doc.id).prepared);
      if (path === '/work') {
        posts.push(JSON.stringify(payload));
        if (lost) { lost = false; throw new Error('response lost after remote commit'); }
        return Buffer.from(JSON.stringify({ record_hash: 'a'.repeat(64), intent_digest: expected.intent_digest, worker_digest: expected.worker_digest }));
      }
      if (path.startsWith('/objects/WorkIntent/')) return Buffer.from(corrupt ? '00' : expected.intent_cbor, 'hex');
      if (path.startsWith('/objects/WorkerExecutionRecord/')) return Buffer.from(expected.worker_cbor, 'hex');
      return Buffer.from(JSON.stringify({ record_hash: Array(32).fill(170), subject: Array.from(Buffer.from(expected.intent_digest, 'hex')), payload_digest: Array.from(Buffer.from(expected.worker_digest, 'hex')) }));
    }
  });
  await assert.rejects(bridge.register({ id: 'intruder', role: 'author' }, doc.id), { status: 404 });
  await assert.rejects(bridge.register(author, doc.id), /response lost/);
  assert.equal(nativeDraftRecords(doc.id)[0].receipt, null);
  assert.equal(expected.proposal.intent.intent_type, 'DraftDocument');
  assert.equal(Buffer.from(expected.proposal.intent.target).toString('hex'), doc.digest);
  assert.deepEqual(expected.proposal.worker_record.input_digest, Array.from(Buffer.from(expected.intent_digest, 'hex')));
  corrupt = true;
  await assert.rejects(bridge.register(author, doc.id), { status: 503 });
  assert.equal(nativeDraftRecords(doc.id)[0].receipt, null);
  corrupt = false;
  const receipt = await bridge.register(author, doc.id);
  assert.equal(receipt.record_hash, 'a'.repeat(64));
  assert.equal(new Set(posts).size, 1, 'ambiguous delivery must reuse exact persisted bytes');
  await bridge.register(author, doc.id);
  assert.equal(posts.length, 3, 'confirmed request must not be posted again');
  const revised = updateDocument(author, doc.id, { ...doc, body: 'Nova versão.' });
  assert.equal(bridge.status(author, doc.id).revision, 2);
  assert.equal(bridge.status(author, doc.id).records[0].revision, 1);
  await bridge.register(author, doc.id);
  assert.equal(nativeDraftRecords(doc.id).length, 2);
  assert.notEqual(nativeDraftRecords(doc.id)[0].intent_digest, nativeDraftRecords(doc.id)[1].intent_digest);
  assert.equal(exportDocument(doc.id).document.digest, revised.digest);
  assert.equal(auditIntegrity(), true);
});

test('Rust adapter rejects malformed content and binds actor and exact content', async () => {
  const content = contentBytes({ id: 'document', revision: 1, title: 'T', department: 'D', body: 'B', authorId: author.id });
  const a = await build(binary, { actor: 'actor-a', content, created_at: 1 });
  const b = await build(binary, { actor: 'actor-b', content, created_at: 1 });
  assert.notDeepEqual(a.proposal.intent.request_identity, b.proposal.intent.request_identity);
  assert.throws(() => execFileSync(binary, [], { input: JSON.stringify({ actor: 'a', content: '{}', created_at: 1 }), stdio: ['pipe', 'pipe', 'pipe'] }));
});

test('default bridge uses authenticated loopback HTTP and excludes operator credentials from export', async () => {
  const doc = createDocument(author, { title: 'HTTP', department: 'Teste', body: 'Documento.' });
  let requests = 0;
  const server = createServer(async (req, res) => {
    requests++;
    assert.equal(req.headers.authorization, 'Bearer ' + config.token);
    const prepared = JSON.parse(db().prepare('SELECT prepared FROM native_document_drafts WHERE document_id=?').get(doc.id).prepared);
    if (req.url === '/work') {
      const chunks = []; for await (const part of req) chunks.push(part);
      assert.deepEqual(JSON.parse(Buffer.concat(chunks)), prepared.proposal);
      res.end(JSON.stringify({ record_hash: 'b'.repeat(64), intent_digest: prepared.intent_digest, worker_digest: prepared.worker_digest }));
    } else if (req.url.startsWith('/objects/')) {
      res.end(Buffer.from(req.url.includes('/WorkIntent/') ? prepared.intent_cbor : prepared.worker_cbor, 'hex'));
    } else {
      res.end(JSON.stringify({ record_hash: Array(32).fill(187), subject: Array.from(Buffer.from(prepared.intent_digest, 'hex')), payload_digest: Array.from(Buffer.from(prepared.worker_digest, 'hex')) }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const path = join(process.env.ARKHE_INTRA_DATA_DIR, 'native-drafts.json');
  try {
    writeFileSync(path, JSON.stringify({ ...config, endpoint: `http://127.0.0.1:${server.address().port}/` }));
    const bridge = createNativeDraftBridge();
    const receipt = await bridge.register(author, doc.id);
    assert.equal(receipt.record_hash, 'b'.repeat(64));
    assert.equal(requests, 4);
    const exported = JSON.stringify(nativeDraftRecords(doc.id));
    assert.equal(exported.includes(config.token), false);
    assert.equal(exported.includes(config.endpoint), false);
    writeFileSync(path, JSON.stringify({ ...config, endpoint: 'http://example.com/' }));
    assert.throws(() => bridge.status(author, doc.id), { status: 503 });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
