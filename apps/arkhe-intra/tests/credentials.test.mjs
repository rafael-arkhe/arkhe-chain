import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, sign } from 'node:crypto';

const cwd = fileURLToPath(new URL('..', import.meta.url));
process.env.ARKHE_INTRA_DATA_DIR = mkdtempSync(join(tmpdir(), 'arkhe-registration-test-'));
execFileSync(process.execPath, ['scripts/setup.mjs'], { cwd, env: process.env, stdio: 'pipe' });
const { handle } = await import('../lib/http.mjs');
const { db, auditIntegrity } = await import('../lib/store.mjs');
const { accounts } = await import('../lib/auth.mjs');
const { possessionStatement } = await import('../lib/credentials.mjs');
const credentials = JSON.parse(readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR, 'credentials.json')));
const origin = 'http://127.0.0.1:3003', cookies = {};
const password = 'Synthetic registration test password 2026!';
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
async function request(path, { method = 'GET', data, user, source = origin } = {}) {
  const response = await handle(new Request(origin + '/api/' + path, { method,
    headers: { Origin: source, 'Content-Type': 'application/json', ...(user ? { Cookie: cookies[user] } : {}) },
    ...(method !== 'GET' ? { body: JSON.stringify(data ?? {}) } : {}),
  }), path.split('/'));
  return { response, status: response.status, data: await response.json() };
}
async function login(role) {
  const result = await request('login', { method: 'POST', data: credentials.find(row => row.email.startsWith(role + '@')) });
  assert.equal(result.status, 200); cookies[role] = result.response.headers.get('set-cookie').split(';')[0];
}
async function invite(email, role = 'author') {
  const result = await request('credentials/invitations', { method: 'POST', user: 'owner', data: { email, role } });
  assert.equal(result.status, 201); return result.data;
}
async function submission(invitation, pair = keys, name = 'Pessoa de Teste') {
  const result = await request('registration/invitation', { method: 'POST', data: { token: invitation.token } });
  assert.equal(result.status, 200);
  const pem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  return { token: invitation.token, name, password, publicKey: pem, signature: sign(null, Buffer.from(possessionStatement(result.data, name, pem)), pair.privateKey).toString('base64') };
}
test('credential registration: invitation, proof of possession and signed activation', async t => {
  await login('owner'); await login('author'); await login('reviewer');
  let invitation, payload, requestId;
  await t.test('authentication, roles, CSRF and privileged role rejection', async () => {
    assert.equal((await request('credentials')).status, 401);
    assert.equal((await request('credentials', { user: 'author' })).status, 403);
    assert.equal((await request('credentials/invitations', { method: 'POST', user: 'author', data: { email: 'new@example.test', role: 'author' } })).status, 403);
    assert.equal((await request('credentials/invitations', { method: 'POST', user: 'owner', source: 'http://other.invalid', data: {} })).status, 403);
    assert.equal((await request('credentials/invitations', { method: 'POST', user: 'owner', data: { email: 'new@example.test', role: 'owner' } })).status, 400);
    assert.equal((await request('credentials/invitations', { method: 'POST', user: 'owner', data: { email: 'author@arkhe.local', role: 'author' } })).status, 409);
    invitation = await invite(' New.Person@Example.test ');
    assert.equal(invitation.email, 'new.person@example.test');
    assert.equal(JSON.stringify(db().prepare('SELECT * FROM credential_invitations').all()).includes(invitation.token), false);
    payload = await submission(invitation);
  });
  await t.test('wrong key, weak password and role/email injection cannot enroll', async () => {
    const other = generateKeyPairSync('ed25519');
    assert.equal((await request('registration', { method: 'POST', data: { ...payload, signature: sign(null, Buffer.from('wrong statement'), other.privateKey).toString('base64') } })).status, 422);
    assert.equal((await request('registration', { method: 'POST', data: { ...payload, password: 'short' } })).status, 400);
    assert.equal((await request('registration', { method: 'POST', data: { ...payload, role: 'owner' } })).status, 400);
    assert.equal((await request('registration', { method: 'POST', data: { ...payload, email: 'attacker@example.test' } })).status, 400);
    assert.equal((await request('registration', { method: 'POST', source: 'http://other.invalid', data: payload })).status, 403);
    assert.equal(db().prepare('SELECT count(*) AS n FROM credential_requests').get().n, 0);
  });
  await t.test('request stays pending; one-use token and hashed password; no session or trusted key', async () => {
    const result = await request('registration', { method: 'POST', data: payload });
    assert.equal(result.status, 202); assert.equal(result.data.status, 'pending'); requestId = result.data.id;
    assert.equal(result.response.headers.get('set-cookie'), null);
    assert.equal((await request('login', { method: 'POST', data: { email: invitation.email, password } })).status, 401);
    assert.equal((await request('registration', { method: 'POST', data: payload })).status, 400);
    const row = db().prepare('SELECT * FROM credential_requests WHERE id=?').get(requestId);
    assert.match(row.password_hash, /^[0-9a-f]{128}$/); assert.notEqual(row.password_hash, password);
    assert.equal(accounts().length, 3);
    const queue = await request('credentials', { user: 'owner' });
    assert.equal(JSON.stringify(queue.data).includes(row.password_hash), false);
    assert.equal(JSON.stringify(queue.data).includes(row.salt), false);
    assert.equal((await request('credentials/trust', { user: 'owner' })).data.accounts.some(row => row.publicKey === publicKey), false);
  });
  await t.test('activation requires owner signature bound to exact identity, role and key', async () => {
    assert.equal((await request(`credentials/requests/${requestId}/challenge`, { user: 'reviewer' })).status, 403);
    const challenge = await request(`credentials/requests/${requestId}/challenge`, { user: 'owner' });
    assert.equal(challenge.status, 200);
    const statement = JSON.parse(challenge.data.statement);
    assert.equal(statement.email, invitation.email); assert.equal(statement.role, 'author'); assert.equal(statement.publicKey, publicKey);
    assert.equal((await request(`credentials/requests/${requestId}/approve`, { method: 'POST', user: 'owner', data: { signature: sign(null, Buffer.from(challenge.data.statement), keys.privateKey).toString('base64') } })).status, 422);
    db().prepare('UPDATE credential_requests SET name=? WHERE id=?').run('Altered identity', requestId);
    assert.equal((await request(`credentials/requests/${requestId}/challenge`, { user: 'owner' })).status, 422);
    db().prepare('UPDATE credential_requests SET name=? WHERE id=?').run(payload.name, requestId);
    const signature = sign(null, Buffer.from(challenge.data.statement), readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR, 'owner.private.pem'))).toString('base64');
    assert.equal((await request(`credentials/requests/${requestId}/approve`, { method: 'POST', user: 'owner', data: { signature } })).status, 200);
    assert.equal((await request(`credentials/requests/${requestId}/approve`, { method: 'POST', user: 'owner', data: { signature } })).status, 409);
    assert.equal(db().prepare('SELECT password_hash FROM credential_requests WHERE id=?').get(requestId).password_hash, '');
    const result = await request('login', { method: 'POST', data: { email: invitation.email.toUpperCase(), password } });
    assert.equal(result.status, 200); assert.equal(result.data.role, 'author'); cookies.new = result.response.headers.get('set-cookie').split(';')[0];
    const trust = await request('credentials/trust', { user: 'owner' });
    assert.equal(trust.data.accounts.find(row => row.id === requestId).publicKey, publicKey);
    assert.equal((await request('credentials/trust', { user: 'author' })).status, 403);
    const duplicateKeyInvite = await invite('another-identity@example.test');
    assert.equal((await request('registration', { method: 'POST', data: await submission(duplicateKeyInvite) })).status, 409);
    const reloaded = execFileSync(process.execPath, ['--input-type=module', '-e', "import {login} from './lib/auth.mjs'; const result=login(process.env.ARKHE_TEST_EMAIL,process.env.ARKHE_TEST_PASSWORD); if(result.user.role!=='author') process.exit(2); console.log('PASS persisted signed credential');"], {
      cwd, env: { ...process.env, ARKHE_TEST_EMAIL: invitation.email, ARKHE_TEST_PASSWORD: password }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(reloaded, /PASS persisted signed credential/);
  });
  await t.test('approved identity signs a real document; tampered authority is rejected', async () => {
    const created = await request('documents', { method: 'POST', user: 'new', data: { title: 'New identity document', department: 'Governança', body: 'Synthetic signed document from an approved identity.' } });
    assert.equal(created.status, 201);
    const challenge = await request(`documents/${created.data.id}/challenge`, { method: 'POST', user: 'new', data: { action: 'submit' } });
    const signature = sign(null, Buffer.from(challenge.data.statement), keys.privateKey).toString('base64');
    assert.equal((await request(`documents/${created.data.id}/transition`, { method: 'POST', user: 'new', data: { ...challenge.data, action: 'submit', signature } })).status, 200);
    const stored = db().prepare('SELECT value FROM enrolled_accounts WHERE id=?').get(requestId).value;
    const tampered = { ...JSON.parse(stored), role: 'owner' };
    db().prepare('UPDATE enrolled_accounts SET value=? WHERE id=?').run(JSON.stringify(tampered), requestId);
    assert.equal((await request('me', { user: 'new' })).status, 503);
    db().prepare('UPDATE enrolled_accounts SET value=? WHERE id=?').run(stored, requestId);
    assert.equal((await request('me', { user: 'new' })).status, 200);
    assert.equal(auditIntegrity(), true);
  });
  await t.test('expired/replaced invitations and rejected requests never grant access', async () => {
    const expired = await invite('expired@example.test');
    db().prepare('UPDATE credential_invitations SET expires_at=0 WHERE id=?').run(expired.id);
    assert.equal((await request('registration/invitation', { method: 'POST', data: { token: expired.token } })).status, 410);
    const replaced = await invite('replaced@example.test'); await invite('replaced@example.test');
    assert.equal((await request('registration/invitation', { method: 'POST', data: { token: replaced.token } })).status, 410);
    const rejected = await invite('rejected@example.test', 'reviewer'), pair = generateKeyPairSync('ed25519');
    const result = await request('registration', { method: 'POST', data: await submission(rejected, pair, 'Rejected Person') });
    assert.equal(result.status, 202);
    assert.equal((await request(`credentials/requests/${result.data.id}/reject`, { method: 'POST', user: 'owner', data: {} })).status, 200);
    assert.equal((await request('login', { method: 'POST', data: { email: rejected.email, password } })).status, 401);
    assert.equal((await request(`credentials/requests/${result.data.id}/challenge`, { user: 'owner' })).status, 409);
    assert.equal(auditIntegrity(), true);
    assert.equal(readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR, 'accounts.json'), 'utf8').includes(invitation.email), false);
  });
  await t.test('public invitation lookup is rate limited', async () => {
    let limited = false;
    for (let index = 0; index < 65; index++) {
      const result = await request('registration/invitation', { method: 'POST', data: { token: 'invalid' } });
      if (result.status === 429) { limited = true; break; }
    }
    assert.equal(limited, true);
  });
});
