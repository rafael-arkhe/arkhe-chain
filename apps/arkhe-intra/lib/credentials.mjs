import { randomBytes, randomUUID, createHash, createPublicKey, scryptSync } from 'node:crypto';
import { trustAccounts } from './account-state.mjs';
import { accounts, publicUser } from './auth.mjs';
import { db, transaction, appendEvent } from './store.mjs';
import { digest, verifySignature } from './crypto.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const check = (condition, status, message) => { if (!condition) throw Object.assign(new Error(message), { status }); };
const owner = user => check(user?.role === 'owner', 403, 'Esta ação exige o papel de governança.');
const emailOf = value => {
  check(typeof value === 'string' && value.length <= 254, 400, 'Informe um e-mail válido.');
  const email = value.trim().toLowerCase();
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'Informe um e-mail válido.');
  return email;
};
function normalizedKey(value) {
  check(typeof value === 'string' && value.length <= 512, 400, 'Informe uma chave pública Ed25519 SPKI PEM.');
  let key;
  try { key = createPublicKey(value); } catch { check(false, 400, 'Chave pública inválida. Use Ed25519 em formato SPKI PEM.'); }
  check(key.asymmetricKeyType === 'ed25519', 400, 'A credencial exige uma chave Ed25519.');
  return key.export({ type: 'spki', format: 'pem' }).toString();
}
export function keyFingerprint(publicKey) { return digest(createPublicKey(publicKey).export({ type: 'spki', format: 'der' })); }
const resource = id => 'credential:' + id;
function rateLimit() {
  const row = db().prepare('SELECT * FROM login_attempts WHERE subject=?').get('registration');
  check(!(row && row.until_ms > Date.now() && row.count >= 60), 429, 'Muitas tentativas de registro. Aguarde 15 minutos.');
  const count = row && row.until_ms > Date.now() ? row.count + 1 : 1;
  db().prepare('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)').run('registration', count, Date.now() + 900000);
}
function invitation(token) {
  check(typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token), 400, 'Convite inválido ou indisponível.');
  const row = db().prepare('SELECT * FROM credential_invitations WHERE token_hash=?').get(sha256(token));
  check(row && !row.consumed_at, 400, 'Convite inválido ou indisponível.');
  check(row.expires_at > Date.now(), 410, 'Este convite expirou. Solicite outro à governança.');
  return row;
}
function available(email, publicKey) {
  const existing = accounts();
  check(!existing.some(account => account.email.toLowerCase() === email), 409, 'Já existe uma credencial para este e-mail.');
  if (publicKey) check(!existing.some(account => normalizedKey(account.publicKey) === publicKey), 409, 'Esta chave já está vinculada a outra identidade.');
  check(!db().prepare("SELECT id FROM credential_requests WHERE status='pending' AND (email=? OR public_key=?)").get(email, publicKey || ''), 409, 'Já existe uma solicitação pendente para este e-mail ou chave.');
}
export function createInvitation(user, input) {
  owner(user);
  const email = emailOf(input.email);
  check(['author', 'reviewer'].includes(input.role), 400, 'Convites podem conceder somente autoria ou revisão.');
  return transaction(() => {
    available(email);
    const token = randomBytes(32).toString('base64url'), id = randomUUID(), createdAt = new Date().toISOString();
    const expiresAt = Date.now() + 48 * 3600000;
    // Replace older unused invitations for this identity; raw tokens are never persisted.
    db().prepare('UPDATE credential_invitations SET expires_at=0 WHERE email=? AND consumed_at IS NULL').run(email);
    db().prepare('INSERT INTO credential_invitations(id,token_hash,email,role,challenge,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, sha256(token), email, input.role, randomBytes(32).toString('base64url'), user.id, createdAt, expiresAt);
    appendEvent(user.id, 'credential-invited', resource(id), { email, role: input.role, expiresAt });
    return { id, token, email, role: input.role, expiresAt: new Date(expiresAt).toISOString() };
  });
}
export function inspectInvitation(input) {
  rateLimit(); const row = invitation(input.token);
  return { id: row.id, email: row.email, role: row.role, challenge: row.challenge, expiresAt: new Date(row.expires_at).toISOString() };
}
export function possessionStatement(invite, name, publicKey) {
  return JSON.stringify({ domain: 'arkhe-intra/credential-possession/v1', invitationId: invite.id, challenge: invite.challenge, email: invite.email, role: invite.role, name, publicKey });
}
export function requestCredential(input) {
  rateLimit();
  check(Object.keys(input).every(key => ['token', 'name', 'password', 'publicKey', 'signature'].includes(key)), 400, 'O papel e o e-mail são definidos pelo convite.');
  check(typeof input.name === 'string' && input.name.trim().length >= 2 && input.name.trim().length <= 120, 400, 'Informe seu nome completo (2 a 120 caracteres).');
  check(typeof input.password === 'string' && input.password.length >= 12 && input.password.length <= 128 && Buffer.byteLength(input.password) <= 512, 400, 'Use uma senha de 12 a 128 caracteres.');
  const row = invitation(input.token), name = input.name.trim(), publicKey = normalizedKey(input.publicKey);
  check(verifySignature(possessionStatement(row, name, publicKey), input.signature, publicKey), 422, 'Não foi possível comprovar a posse desta chave Ed25519.');
  const salt = randomBytes(16).toString('hex'), passwordHash = scryptSync(input.password, salt, 64).toString('hex');
  return transaction(() => {
    invitation(input.token); available(row.email, publicKey);
    const id = randomUUID(), createdAt = new Date().toISOString();
    const statement = possessionStatement(row, name, publicKey);
    db().prepare("INSERT INTO credential_requests(id,invitation_id,email,name,role,public_key,salt,password_hash,possession_statement,possession_signature,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending')")
      .run(id, row.id, row.email, name, row.role, publicKey, salt, passwordHash, statement, input.signature, createdAt);
    db().prepare('UPDATE credential_invitations SET consumed_at=? WHERE id=?').run(createdAt, row.id);
    appendEvent(id, 'credential-requested', resource(id), { email: row.email, role: row.role, fingerprint: keyFingerprint(publicKey), statement, signature: input.signature });
    return { id, status: 'pending', email: row.email, role: row.role, fingerprint: keyFingerprint(publicKey) };
  });
}
function publicRequest(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role, publicKey: row.public_key, fingerprint: keyFingerprint(row.public_key), createdAt: row.created_at, status: row.status, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at };
}
export function credentialOverview(user) {
  owner(user);
  return {
    requests: db().prepare('SELECT * FROM credential_requests ORDER BY created_at DESC LIMIT 200').all().map(publicRequest),
    invitations: db().prepare('SELECT id,email,role,created_at AS createdAt,expires_at AS expiresAt,consumed_at AS consumedAt FROM credential_invitations ORDER BY created_at DESC LIMIT 100').all(),
  };
}
function pending(id, verifyPossession = true) {
  const row = db().prepare('SELECT * FROM credential_requests WHERE id=?').get(id);
  check(row, 404, 'Solicitação não encontrada.'); check(row.status === 'pending', 409, 'Esta solicitação já foi analisada.');
  if (verifyPossession) {
    const invite = db().prepare('SELECT * FROM credential_invitations WHERE id=?').get(row.invitation_id);
    check(invite && invite.email === row.email && invite.role === row.role && row.possession_statement === possessionStatement(invite, row.name, row.public_key)
      && verifySignature(row.possession_statement, row.possession_signature, row.public_key), 422, 'A prova de posse não corresponde à identidade solicitada.');
  }
  return row;
}
function approvalStatement(row, actorId) {
  return JSON.stringify({ domain: 'arkhe-intra/credential-approval/v1', requestId: row.id, name: row.name, email: row.email, role: row.role, publicKey: row.public_key, accessCommitment: sha256(row.salt + ':' + row.password_hash), requestedAt: row.created_at, actorId });
}
export function approvalChallenge(user, id) {
  owner(user); const row = pending(id);
  return { statement: approvalStatement(row, user.id), fingerprint: keyFingerprint(row.public_key) };
}
export function approveCredential(user, id, input) {
  owner(user);
  return transaction(() => {
    const row = pending(id), statement = approvalStatement(row, user.id);
    check(verifySignature(statement, input.signature, user.publicKey), 422, 'A ativação exige a assinatura Ed25519 da governança autenticada.');
    check(!accounts().some(account => account.email.toLowerCase() === row.email || normalizedKey(account.publicKey) === row.public_key), 409, 'O e-mail ou a chave já está vinculado a outra conta.');
    const account = { id: row.id, name: row.name, email: row.email, role: row.role, publicKey: row.public_key, salt: row.salt, passwordHash: row.password_hash };
    db().prepare('INSERT INTO enrolled_accounts VALUES(?,?,?,?)').run(account.id, account.email, account.publicKey, JSON.stringify(account));
    db().prepare("UPDATE credential_requests SET status='approved',reviewed_by=?,reviewed_at=?,approval_statement=?,approval_signature=?,salt='',password_hash='' WHERE id=?")
      .run(user.id, new Date().toISOString(), statement, input.signature, id);
    appendEvent(user.id, 'credential-approved', resource(id), { email: row.email, role: row.role, fingerprint: keyFingerprint(row.public_key), statement, signature: input.signature });
    return { status: 'approved', user: publicUser(account) };
  });
}
export function rejectCredential(user, id) {
  owner(user);
  return transaction(() => {
    const row = pending(id, false);
    db().prepare("UPDATE credential_requests SET status='rejected',reviewed_by=?,reviewed_at=?,salt='',password_hash='' WHERE id=?").run(user.id, new Date().toISOString(), id);
    appendEvent(user.id, 'credential-rejected', resource(id), { email: row.email, role: row.role });
    return { status: 'rejected' };
  });
}
export function exportTrust(user) {
  owner(user);
  return { format: 'arkhe-intra/trust/v1', accounts: trustAccounts(accounts()) };
}
