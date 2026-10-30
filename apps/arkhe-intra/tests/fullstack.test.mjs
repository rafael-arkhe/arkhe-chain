import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sign, generateKeyPairSync, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
process.env.ARKHE_INTRA_DATA_DIR = mkdtempSync(join(tmpdir(), 'arkhe-intra-test-'));
delete process.env.ARKHE_REKOR_URL;
delete process.env.ARKHE_REKOR_PUBLIC_KEY_FILE;
execFileSync(process.execPath, ['scripts/setup.mjs'], { cwd, env: process.env, stdio: 'pipe' });
const credentials = JSON.parse(readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR, 'credentials.json')));
const trust = JSON.parse(readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR, 'trust.json')));
const { handle } = await import('../lib/http.mjs');
const { db, auditIntegrity } = await import('../lib/store.mjs');
const { digest } = await import('../lib/crypto.mjs');
const { verifyBundle } = await import('../public/offline/verify.mjs');
const { canonical, checkReceipt, hashedRekord, inclusion } = await import('../lib/rekor.mjs');
const origin = 'http://127.0.0.1:3003';
const cookies = {};
async function request(path, { method = 'GET', data, user, source = origin, raw } = {}) {
  const req = new Request(origin + '/api/' + path, { method, headers: { 'Content-Type': 'application/json', Origin: source, ...(user ? { Cookie: cookies[user] } : {}) }, ...(method === 'GET' ? {} : { body: raw ?? JSON.stringify(data ?? {}) }) });
  const response = await handle(req, path.split('/'));
  return { response, data: await response.json(), status: response.status };
}
async function login(role) {
  const credential = credentials.find(row => row.email.startsWith(role + '@'));
  const result = await request('login', { method: 'POST', data: credential });
  assert.equal(result.status, 200);
  cookies[role] = result.response.headers.get('set-cookie').split(';')[0];
  assert.match(result.response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal('passwordHash' in result.data, false);
  return result.data;
}
async function signedTransition(id, role, action) {
  const challenge = await request(`documents/${id}/challenge`, { method: 'POST', user: role, data: { action } });
  assert.equal(challenge.status, 200);
  const key = readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR, `${role}.private.pem`));
  const signature = sign(null, Buffer.from(challenge.data.statement), key).toString('base64');
  return request(`documents/${id}/transition`, { method: 'POST', user: role, data: { action, signature, revision: challenge.data.revision, digest: challenge.data.digest } });
}
function receiptFor(signature, keyPair) {
  const hash = value => createHash('sha256').update(value).digest('hex');
  const body = Buffer.from(canonical(hashedRekord(signature))).toString('base64');
  const payload = { body, integratedTime: 1770000000, logID: hash(keyPair.publicKey.export({ type: 'spki', format: 'der' })), logIndex: 0 };
  const rootHash = hash(Buffer.concat([Buffer.from([0]), Buffer.from(body, 'base64')]));
  return { ['a'.repeat(64)]: { ...payload, verification: { signedEntryTimestamp: sign('sha256', Buffer.from(canonical(payload)), keyPair.privateKey).toString('base64'), inclusionProof: { treeSize: 1, logIndex: 0, hashes: [], rootHash } } } };
}

test('fullstack: authenticated three-party workflow, cryptography, evidence and Rekor reconciliation', async t => {
  const author = await login('author'); await login('reviewer'); await login('owner');
  let id, approved;
  await t.test('session enforcement, CSRF, strict request limits and wrong credentials', async () => {
    assert.equal((await request('dashboard')).status, 401);
    assert.equal((await request('documents', { method: 'POST', user: 'author', source: 'https://attacker.invalid' })).status, 403);
    assert.equal((await request('documents', { method: 'POST', user: 'author', raw: '{' })).status, 400);
    assert.equal((await request('documents', { method: 'POST', user: 'author', raw: ' '.repeat(262145) })).status, 413);
    assert.equal((await request('login', { method: 'POST', data: { email: 'owner@arkhe.local', password: 'invalid' } })).status, 401);
    const res = await request('me', { user: 'author' }); assert.equal(res.data.id, author.id);
    assert.equal((await request('login/extra', { method: 'POST' })).status, 401);
  });
  await t.test('role separation, version conflicts, invalid signatures and immutable signed versions', async () => {
    const input = { title: 'Política de IA', department: 'Jurídico & Compliance', body: 'Uma minuta sintética para validar o fluxo, sem efeitos externos.' };
    assert.equal((await request('documents', { method: 'POST', user: 'owner', data: input })).status, 403);
    const created = await request('documents', { method: 'POST', user: 'author', data: input });
    assert.equal(created.status, 201); id = created.data.id;
    assert.equal((await request(`documents/${id}`, { method: 'PUT', user: 'author', data: { ...input, revision: 0 } })).status, 409);
    const edited = await request(`documents/${id}`, { method: 'PUT', user: 'author', data: { ...input, revision: 1, body: input.body + '\nNova revisão.' } });
    assert.equal(edited.status, 200); assert.equal(edited.data.revision, 2);
    const invalid = await request(`documents/${id}/transition`, { method: 'POST', user: 'author', data: { action: 'submit', revision: 2, digest: edited.data.digest, signature: Buffer.alloc(64).toString('base64') } });
    assert.equal(invalid.status, 422);
    assert.equal((await signedTransition(id, 'author', 'submit')).data.state, 'review');
    assert.equal((await request(`documents/${id}`, { method: 'PUT', user: 'author', data: { ...input, revision: 2 } })).status, 403);
    assert.equal((await request(`documents/${id}/challenge`, { method: 'POST', user: 'author', data: { action: 'review' } })).status, 403);
    assert.equal((await signedTransition(id, 'reviewer', 'review')).data.state, 'reviewed');
    const result = await signedTransition(id, 'owner', 'approve'); assert.equal(result.data.state, 'approved'); approved = result.data;
    assert.equal((await request(`documents/${id}/challenge`, { method: 'POST', user: 'owner', data: { action: 'approve' } })).status, 403);
  });
  await t.test('export and real browser WASM: tampering, missing trust and incorrect role bindings', async () => {
    const bundle = (await request(`documents/${id}/export`, { user: 'owner' })).data;
    const wasm = { blake3_hex: digest };
    const valid = await verifyBundle(bundle, trust, wasm);
    assert.equal(valid.integrity, 'PASS'); assert.equal(valid.signatures, 'PASS'); assert.equal(valid.anchor, 'INCONCLUSIVE'); assert.equal(valid.verdict, 'INCONCLUSIVE');
    assert.equal((await verifyBundle(bundle, null, wasm)).signatures, 'INCONCLUSIVE');
    const altered = structuredClone(bundle); altered.document.body += 'tampered'; assert.equal((await verifyBundle(altered, trust, wasm)).verdict, 'FAIL');
    const badStatement = structuredClone(bundle); badStatement.document.signatures[0].statement += ' '; assert.equal((await verifyBundle(badStatement, trust, wasm)).signatures, 'FAIL');
    const wrongTrust = structuredClone(trust); wrongTrust.accounts[0].role = 'owner'; assert.equal((await verifyBundle(bundle, wrongTrust, wasm)).signatures, 'INCONCLUSIVE');
    const missingSig = structuredClone(bundle); missingSig.document.signatures.pop(); assert.equal((await verifyBundle(missingSig, trust, wasm)).state, 'FAIL');
    const web = await import('../public/verifier/arkhe_verify_wasm.js');
    await web.default({ module_or_path: readFileSync(resolve(cwd, 'public/verifier/arkhe_verify_wasm_bg.wasm')) });
    assert.equal((await verifyBundle(bundle, trust, web)).signatures, 'PASS');
    assert.equal(web.blake3_hex(new Uint8Array()), 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262');
  });
  await t.test('missing Rekor config blocks publication and preserves approved state', async () => {
    assert.equal((await request(`documents/${id}/publish`, { method: 'POST', user: 'owner' })).status, 503);
    assert.equal((await request(`documents/${id}`, { user: 'owner' })).data.state, 'approved');
  });
  await t.test('Rekor SET/key/body/inclusion validation; ambiguous write is never retried', async () => {
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
    const path = join(process.env.ARKHE_INTRA_DATA_DIR, 'rekor.pub.pem'); writeFileSync(path, publicKey);
    process.env.ARKHE_REKOR_URL = 'https://rekor.test.invalid'; process.env.ARKHE_REKOR_PUBLIC_KEY_FILE = path;
    const signature = approved.signatures.at(-1), receipt = receiptFor(signature, keys);
    assert.equal(checkReceipt(receipt, signature, publicKey), true);
    const corrupted = structuredClone(receipt); corrupted['a'.repeat(64)].integratedTime += 1;
    assert.equal(checkReceipt(corrupted, signature, publicKey), false);
    const wrongBody = structuredClone(signature); wrongBody.statement += 'tampered'; assert.equal(checkReceipt(receipt, wrongBody, publicKey), false);
    const badPath = structuredClone(receipt); badPath['a'.repeat(64)].verification.inclusionProof.rootHash = '0'.repeat(64); assert.equal(checkReceipt(badPath, signature, publicKey), false);
    assert.equal(checkReceipt(receipt, signature, generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'pem' })), false);
    let calls = 0; const fetch = globalThis.fetch;
    globalThis.fetch = async () => { calls++; throw new Error('simulated ambiguous network error'); };
    try {
      assert.equal((await request(`documents/${id}/publish`, { method: 'POST', user: 'owner' })).status, 503);
      assert.equal((await request(`documents/${id}`, { user: 'owner' })).data.state, 'anchoring');
      assert.equal((await request(`documents/${id}/publish`, { method: 'POST', user: 'owner' })).status, 409); assert.equal(calls, 1);
    } finally { globalThis.fetch = fetch; }
    assert.equal((await request(`documents/${id}/reconcile`, { method: 'POST', user: 'owner', data: corrupted })).status, 422);
    assert.equal((await request(`documents/${id}/reconcile`, { method: 'POST', user: 'owner', data: receipt })).data.state, 'published');
    const report = await request(`documents/${id}/verify`, { user: 'owner' }); assert.equal(report.data.anchor, 'PASS'); assert.equal(report.data.verdict, 'PASS');
    assert.equal((await request(`documents/${id}/reconcile`, { method: 'POST', user: 'owner', data: receipt })).status, 409);
  });
  await t.test('append-only audit and durable documents survive a new process; logout revokes session', async () => {
    assert.equal(auditIntegrity(), true);
    assert.throws(() => db().exec('DELETE FROM events'), /append only/);
    assert.throws(() => db().exec("UPDATE events SET hash='bad'"), /append only/);
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', "import { getDocument } from './lib/store.mjs'; console.log(getDocument(process.argv[1]).state)", id], { cwd, env: process.env, encoding: 'utf8' });
    assert.match(output, /published/);
    assert.equal((await request('logout', { method: 'POST', user: 'author' })).status, 200);
    assert.equal((await request('me', { user: 'author' })).status, 401);
  });
});

test('RFC6962 uneven trees validate every leaf and reject surplus or swapped proofs', () => {
  const sha = bytes => createHash('sha256').update(bytes).digest();
  const leaves = ['a', 'b', 'c'].map(value => Buffer.from(value));
  const hashes = leaves.map(leaf => sha(Buffer.concat([Buffer.from([0]), leaf])));
  const left = sha(Buffer.concat([Buffer.from([1]), hashes[0], hashes[1]]));
  const root = sha(Buffer.concat([Buffer.from([1]), left, hashes[2]])).toString('hex');
  for (const [index, path] of [[0, [hashes[1], hashes[2]]], [1, [hashes[0], hashes[2]]], [2, [left]]]) {
    const proof = { treeSize: 3, logIndex: index, hashes: path.map(hash => hash.toString('hex')), rootHash: root };
    assert.equal(inclusion(leaves[index].toString('base64'), index, proof), true);
    proof.hashes.push('0'.repeat(64)); assert.equal(inclusion(leaves[index].toString('base64'), index, proof), false);
  }
});
