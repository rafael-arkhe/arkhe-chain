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
  instance.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL, previous TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS no_event_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'append only'); END;
    CREATE TRIGGER IF NOT EXISTS no_event_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'append only'); END;
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts(subject TEXT PRIMARY KEY, count INTEGER NOT NULL, until_ms INTEGER NOT NULL);
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
    CREATE TABLE IF NOT EXISTS enrolled_accounts(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL UNIQUE, value TEXT NOT NULL);`);
  return instance;
}
export function transaction(fn) {
  db().exec('BEGIN IMMEDIATE');
  try { const result = fn(); db().exec('COMMIT'); return result; }
  catch (error) { db().exec('ROLLBACK'); throw error; }
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
