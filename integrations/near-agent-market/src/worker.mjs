import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { BriefError, parseBrief, execute, report, help } from './verification.mjs';

export class ApiError extends Error {
  constructor(status) { super(`Marketplace HTTP ${status}`); this.status = status; }
}
export class Client {
  constructor(token, { baseUrl = 'https://market.near.ai', fetchImpl = fetch } = {}) {
    if (!/^aat_[a-f\d]{32}$/.test(token)) throw new Error('Missing or invalid agent token');
    if (baseUrl !== 'https://market.near.ai') throw new Error('Credential destination must be https://market.near.ai');
    this.token = token; this.baseUrl = baseUrl; this.fetchImpl = fetchImpl;
  }
  async call(path, body) {
    if (!path.startsWith('/v1/')) throw new Error('Invalid API path');
    const response = await this.fetchImpl(this.baseUrl + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }
}
export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS work (key TEXT PRIMARY KEY, phase TEXT NOT NULL, markdown TEXT);');
  }
  get(key) { return this.db.prepare('SELECT phase, markdown FROM work WHERE key=?').get(key); }
  set(key, phase, markdown = null) { this.db.prepare('INSERT OR REPLACE INTO work VALUES (?,?,?)').run(key, phase, markdown); }
  close() { this.db.close(); }
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class Worker {
  constructor(client, store, log = console.log, verifier = execute) { this.client = client; this.store = store; this.log = log; this.verifier = verifier; }
  async poll({ readOnly = false } = {}) {
    // Snapshot the entire queue before mutations, otherwise offset pagination skips work.
    const rows = [];
    for (let offset = 0; ; offset += 100) {
      const page = await this.client.call(`/v1/agents/me/assignments?limit=100&offset=${offset}`);
      if (!Array.isArray(page.assignments)) throw new Error('Invalid assignment envelope');
      rows.push(...page.assignments);
      if (page.assignments.length < 100) break;
      if (offset >= 9900) throw new Error('Queue exceeds supported bound');
    }
    this.log(JSON.stringify({ event: 'poll', assignments: rows.length, readOnly }));
    if (readOnly) return rows.length;
    for (const row of rows) {
      try { await this.process(row); }
      catch (error) {
        this.log(JSON.stringify({ event: 'assignment_error', status: error.status ?? null }));
        if ([401, 403, 429].includes(error.status)) throw error;
      }
    }
    return rows.length;
  }
  async process(row) {
    const a = row.assignment;
    if (a.status !== 'in_progress') return;
    const id = a.assignmentId;
    if (!/^[a-f\d-]{36}$/i.test(id)) throw new Error('Invalid assignment id');
    const path = `/v1/assignments/${id}`;
    // Fetch full latest buyer input if it was truncated in the queue. Older worker
    // messages must never become executable requests.
    let buyer = row.latestMessage?.senderSide === 'buyer' ? row.latestMessage : null;
    if (buyer?.truncated) {
      const thread = await this.client.call(`${path}/messages?limit=20`);
      const full = thread.messages.find(m => m.messageId === buyer.messageId);
      if (!full) throw new Error('Cannot recover full buyer message');
      buyer = { ...buyer, ...full, truncated: false };
    }
    // Retain the last buyer request when our own clarification becomes latest.
    const generation = hash([id, a.slaDeadlineAt, a.submittedAt, a.deliverableUrl, row.job.description]);
    const contextKey = `context:${generation}`;
    if (buyer) this.store.set(contextKey, 'buyer', JSON.stringify(buyer));
    else {
      const context = this.store.get(contextKey);
      if (context?.markdown) buyer = JSON.parse(context.markdown);
    }
    const key = hash([generation, buyer]);
    let saved = this.store.get(key);
    if (saved && ['submitted', 'waiting', 'blocked'].includes(saved.phase)) return;
    // Claim the assignment before spending verification compute. A failed or
    // cancelled start must prevent both computation and delivery.
    try { await this.client.call(`${path}/start`, {}); }
    catch (error) {
      if (error.status >= 400 && error.status < 500 && ![401,403,429].includes(error.status)) this.store.set(key, 'blocked');
      throw error;
    }
    let request, markdown = saved?.markdown;
    try {
      if (!markdown) {
        // Read any pre-award agreement. Structured requests in the bid thread
        // need an explicit replacement brief, rather than guessing precedence.
        if (a.bidId && !buyer) throw new BriefError('For a bid-based hire, send the complete agreed JSON request in this assignment thread.');
        request = parseBrief(buyer ? buyer.body : row.job.description);
        markdown = report(request, await this.verifier(request));
        if (Buffer.byteLength(markdown) > 262144) throw new BriefError('Result exceeds delivery limit.');
        this.store.set(key, 'ready', markdown);
      }
    } catch (error) {
      if (!(error instanceof BriefError)) throw error;
      await this.client.call(`${path}/messages`, {
        body: `${error.message}\n\n${help}`, clientRequestId: `arkhe-${key}`
      });
      this.store.set(key, 'waiting');
      this.log(JSON.stringify({ event: 'clarification', assignmentId: id }));
      return;
    }
    try {
      // Persisted Markdown is reused byte-for-byte after a timeout; the API
      // treats identical Markdown + file set as an idempotent submission.
      await this.client.call(`${path}/submit`, { deliverableMarkdown: markdown, files: [] });
      this.store.set(key, 'submitted', markdown);
      this.log(JSON.stringify({ event: 'submitted', assignmentId: id }));
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && ![401,403,429].includes(error.status)) this.store.set(key, 'blocked', markdown);
      throw error;
    }
  }
}
