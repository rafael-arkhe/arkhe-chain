// Experimental adapter persistence, not the production WormGraph service.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hash, buildProof } from './proof.mjs';
export function canonicalBytes(value) {
  function ordered(v, depth = 0) {
    if (depth > 16) throw Error('payload too deep');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string' && v.length <= 8192) return v;
    if (typeof v === 'number' && Number.isSafeInteger(v)) return v;
    if (Array.isArray(v) && v.length <= 1024) return v.map(x => ordered(x, depth + 1));
    if (v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length <= 64) {
      return Object.fromEntries(Object.keys(v).sort().map(k => [k, ordered(v[k], depth + 1)]));
    }
    throw Error('unsupported payload');
  }
  const bytes = Buffer.from(JSON.stringify(ordered(value)));
  if (bytes.length > 65536) throw Error('payload exceeds 64 KiB');
  return bytes;
}
export class AuditJournal {
  constructor(file, scope) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, leaf BLOB NOT NULL, digest TEXT NOT NULL, slot INTEGER NOT NULL);');
    const expected = canonicalBytes(scope).toString();
    const found = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('scope');
    if (found && found.value !== expected) { this.db.close(); throw Error('journal scope mismatch'); }
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('scope', expected);
    this.scope = JSON.parse(expected);
    this.read(); // Detect accidental corruption before admitting more records.
  }
  read() {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY seq').all();
    for (let i = 0; i < rows.length; i++) if (rows[i].seq !== i || rows[i].digest !== hash(rows[i].leaf)) throw Error('journal integrity failure');
    return rows;
  }
  get cursor() { return Number(this.db.prepare('SELECT value FROM metadata WHERE key=?').get('cursor')?.value ?? -1); }
  appendBatch(events, cursor) {
    if (!Number.isSafeInteger(cursor) || cursor < this.cursor || !Array.isArray(events) || events.length > 10000) throw Error('invalid cursor/batch');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (cursor < this.cursor) throw Error('cursor changed during concurrent ingestion');
      let sequence = this.db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
      let lastSlot = this.db.prepare('SELECT slot FROM events ORDER BY seq DESC LIMIT 1').get()?.slot ?? -1;
      for (const event of events) {
        if (typeof event.id !== 'string' || !event.id.length || event.id.length > 1024 || !Number.isSafeInteger(event.slot) || event.slot < 0 || event.slot > cursor) throw Error('invalid event identity/slot');
        const leaf = canonicalBytes(event.payload), digest = hash(leaf);
        const existing = this.db.prepare('SELECT digest FROM events WHERE id=?').get(event.id);
        if (existing) { if (existing.digest !== digest) throw Error('conflicting event replay'); continue; }
        if (sequence >= 10000 || event.slot < lastSlot) throw Error('out-of-order event or journal capacity exceeded');
        this.db.prepare('INSERT INTO events VALUES (?,?,?,?,?)').run(sequence++, event.id, leaf, digest, event.slot);
        lastSlot = event.slot;
      }
      this.db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)').run('cursor', String(cursor));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  checkpoint() {
    const rows = this.read();
    if (!rows.length) throw Error('empty journal');
    return { ...buildProof(rows.map(row => row.leaf), 0), cursor: this.cursor };
  }
  export() { return { scope: this.scope, cursor: this.cursor, events: this.read().map(r => ({ id: r.id, slot: r.slot, payload: JSON.parse(Buffer.from(r.leaf).toString()) })) }; }
  close() { this.db.close(); }
}
// Full-prefix replay check; this is not a succinct MMR consistency proof.
export function verifyJournalExtension(previous, next) {
  try {
    if (!canonicalBytes(previous.scope).equals(canonicalBytes(next.scope)) || next.cursor < previous.cursor || previous.events.length > next.events.length) return false;
    return previous.events.every((event, index) => canonicalBytes(event).equals(canonicalBytes(next.events[index])));
  } catch { return false; }
}
