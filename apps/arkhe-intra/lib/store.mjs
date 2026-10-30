import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { local } from './paths.mjs';
import { digest } from './crypto.mjs';
let instance;
export function db() {
  if (instance) return instance;
  mkdirSync(local, { recursive: true });
  instance = new DatabaseSync(join(local, 'intra.sqlite'));
  try {
    const check = instance.prepare('PRAGMA integrity_check').all();
    if (check.length !== 1 || check[0].integrity_check !== 'ok') throw new Error('integrity');
  } catch { instance.close(); instance = undefined; throw new Error('SQLite integrity check failed; restore from a verified backup.'); }
  instance.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL, previous TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS no_event_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'append only'); END;
    CREATE TRIGGER IF NOT EXISTS no_event_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'append only'); END;
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
    CREATE TABLE IF NOT EXISTS login_attempts(subject TEXT PRIMARY KEY, count INTEGER NOT NULL, until_ms INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS login_attempts_expiry ON login_attempts(until_ms);
    CREATE TABLE IF NOT EXISTS credential_invitations(
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('author','reviewer')), challenge TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at TEXT);
    CREATE TABLE IF NOT EXISTS credential_requests(
      id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL UNIQUE REFERENCES credential_invitations(id),
      email TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('author','reviewer')),
      public_key TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL,
      possession_statement TEXT NOT NULL, possession_signature TEXT NOT NULL,
      created_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
      reviewed_by TEXT, reviewed_at TEXT, approval_statement TEXT, approval_signature TEXT);
    CREATE INDEX IF NOT EXISTS credential_requests_created ON credential_requests(created_at DESC);
    CREATE INDEX IF NOT EXISTS credential_requests_pending_email ON credential_requests(email) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS credential_requests_pending_key ON credential_requests(public_key) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS credential_invitations_created ON credential_invitations(created_at DESC);
    CREATE TABLE IF NOT EXISTS enrolled_accounts(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL UNIQUE, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS account_actions(id TEXT PRIMARY KEY, target_id TEXT NOT NULL, revision INTEGER NOT NULL, action TEXT NOT NULL, statement TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS account_lifecycle(seq INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, statement TEXT NOT NULL, signature TEXT NOT NULL, UNIQUE(account_id,revision));
    CREATE TRIGGER IF NOT EXISTS no_lifecycle_update BEFORE UPDATE ON account_lifecycle BEGIN SELECT RAISE(ABORT,'append only'); END;
    CREATE TRIGGER IF NOT EXISTS no_lifecycle_delete BEFORE DELETE ON account_lifecycle BEGIN SELECT RAISE(ABORT,'append only'); END;
    CREATE TABLE IF NOT EXISTS account_recovery_grants(id TEXT PRIMARY KEY, target_id TEXT NOT NULL, revision INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, challenge TEXT NOT NULL, expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS account_recovery_requests(id TEXT PRIMARY KEY, grant_id TEXT NOT NULL UNIQUE, target_id TEXT NOT NULL, revision INTEGER NOT NULL, public_key TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, proof TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');`);
  return instance;
}
const sleeper = new Int32Array(new SharedArrayBuffer(4));
export const sqliteBusy = error => error?.errcode === 5 || (error?.errcode & 255) === 5 || error?.code === 'SQLITE_BUSY';
// Retry only lock acquisition: never replay a callback with application side effects.
export function transaction(fn) {
  const connection = db();
  for (let attempt = 0;; attempt++) {
    try { connection.exec('BEGIN IMMEDIATE'); break; }
    catch (error) {
      if (!sqliteBusy(error) || attempt >= 2) throw error;
      Atomics.wait(sleeper, 0, 0, 20 * 2 ** attempt + Math.floor(Math.random() * 20));
    }
  }
  try { const result = fn(); if (result?.then) throw new TypeError('SQLite transaction callback must be synchronous'); connection.exec('COMMIT'); return result; }
  catch (error) { if (connection.isTransaction) connection.exec('ROLLBACK'); throw error; }
}
export function readiness() {
  const connection = db();
  return connection.prepare('SELECT 1 AS ok').get().ok === 1 && connection.prepare('PRAGMA foreign_keys').get().foreign_keys === 1;
}
export function getDocument(id) { const row = db().prepare('SELECT value FROM documents WHERE id=?').get(id); return row ? JSON.parse(row.value) : null; }
export function documents() { return db().prepare('SELECT value FROM documents ORDER BY rowid DESC').all().map(row => JSON.parse(row.value)); }
export function saveDocument(value) { db().prepare('INSERT INTO documents(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(value.id, JSON.stringify(value)); }
export function appendEvent(actor, action, documentId, details = {}) {
  const previous = db().prepare('SELECT hash FROM events ORDER BY seq DESC LIMIT 1').get()?.hash || '0'.repeat(64);
  const value = JSON.stringify({ at: new Date().toISOString(), actor, action, documentId, details });
  const hash = digest(previous + '\n' + value);
  db().prepare('INSERT INTO events(value,previous,hash) VALUES(?,?,?)').run(value, previous, hash);
}
export function events() { return db().prepare('SELECT * FROM events ORDER BY seq').all().map(row => ({ ...row, event: JSON.parse(row.value) })); }
export function auditIntegrity() {
  let previous = '0'.repeat(64);
  for (const row of events()) { if (row.previous !== previous || digest(previous + '\n' + row.value) !== row.hash) return false; previous = row.hash; }
  return true;
}
