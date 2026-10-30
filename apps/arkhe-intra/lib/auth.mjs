import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { local } from './paths.mjs';
import { applyAccountState } from './account-state.mjs';
import { db } from './store.mjs';
import { verifySignature } from './crypto.mjs';
export function accounts() {
  const bootstrap = JSON.parse(readFileSync(join(local, 'accounts.json'), 'utf8'));
  const enrolled = db().prepare("SELECT a.value,r.approval_statement,r.approval_signature FROM enrolled_accounts a JOIN credential_requests r ON r.id=a.id WHERE r.status='approved'").all().map(row => {
    const account = JSON.parse(row.value), statement = JSON.parse(row.approval_statement);
    const authority = bootstrap.find(user => user.id === statement.actorId && user.role === 'owner');
    const valid = authority && statement.domain === 'arkhe-intra/credential-approval/v1' && ['author', 'reviewer'].includes(account.role)
      && statement.requestId === account.id && ['name', 'email', 'role', 'publicKey'].every(key => statement[key] === account[key])
      && statement.accessCommitment === hash(account.salt + ':' + account.passwordHash)
      && verifySignature(row.approval_statement, row.approval_signature, authority.publicKey);
    if (!valid) throw new Error('Invalid credential approval evidence.');
    return account;
  });
  return applyAccountState([...bootstrap, ...enrolled]);
}
const hash = value => createHash('sha256').update(value).digest('hex');
export function login(email, password) {
  const subject = hash('login:' + (typeof email === 'string' ? email.trim().toLowerCase() : ''));
  db().prepare('DELETE FROM login_attempts WHERE until_ms <= ?').run(Date.now());
  const attempts = db().prepare('SELECT * FROM login_attempts WHERE subject=?').get(subject);
  if (attempts && attempts.until_ms > Date.now() && attempts.count >= 10) throw Object.assign(new Error('Muitas tentativas. Aguarde 15 minutos.'), { status: 429 });
  const user = accounts().find(user => user.email.toLowerCase() === (typeof email === 'string' ? email.trim().toLowerCase() : ''));
  const actual = scryptSync(typeof password === 'string' ? password : '', user?.salt || 'invalid-account', 64);
  const expected = user ? Buffer.from(user.passwordHash, 'hex') : Buffer.alloc(64);
  if (!user || user.revoked || !timingSafeEqual(actual, expected)) {
    const count = attempts && attempts.until_ms > Date.now() ? attempts.count + 1 : 1;
    db().prepare('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)').run(subject, count, Date.now() + 900000);
    throw Object.assign(new Error('E-mail ou senha inválidos.'), { status: 401 });
  }
  db().prepare('DELETE FROM login_attempts WHERE subject=?').run(subject);
  db().prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
  const token = randomBytes(32).toString('hex');
  db().prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), user.id, Date.now() + 28800000);
  return { token, user: publicUser(user) };
}
export function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role, publicKey: user.publicKey }; }
export function session(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db().prepare('SELECT user_id FROM sessions WHERE hash=? AND expires>?').get(hash(token), Date.now());
  const user = row && accounts().find(user => user.id === row.user_id);
  return user && !user.revoked ? publicUser(user) : null;
}
export function logout(token) { if (token) db().prepare('DELETE FROM sessions WHERE hash=?').run(hash(token)); }
