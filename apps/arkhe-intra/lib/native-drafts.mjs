import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { local } from './paths.mjs';
import { contentBytes } from './crypto.mjs';
import { demand, readDocument } from './documents.mjs';
import { db, transaction, appendEvent } from './store.mjs';

function table() {
  db().exec(`CREATE TABLE IF NOT EXISTS native_document_drafts(
    document_id TEXT NOT NULL, revision INTEGER NOT NULL, digest TEXT NOT NULL,
    endpoint TEXT NOT NULL, actor TEXT NOT NULL, prepared TEXT NOT NULL,
    receipt TEXT, PRIMARY KEY(document_id,revision));`);
}
function row(id, revision) {
  table();
  return db().prepare('SELECT * FROM native_document_drafts WHERE document_id=? AND revision=?').get(id, revision);
}
export function nativeDraftRecords(id) {
  table();
  return db().prepare('SELECT revision,digest,prepared,receipt FROM native_document_drafts WHERE document_id=? ORDER BY revision').all(id)
    .map(value => ({ revision: value.revision, digest: value.digest,
      ...JSON.parse(value.prepared), receipt: value.receipt ? JSON.parse(value.receipt) : null,
      scope: 'DraftDocument snapshot only; not approval or publication authority.' }));
}
function configuration() {
  const path = join(local, 'native-drafts.json');
  if (!existsSync(path)) return null;
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const url = new URL(config.endpoint);
  demand(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname) &&
    !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 503,
  'O registro nativo exige endpoint HTTP de loopback sem caminho.');
  demand(isAbsolute(config.binary) && typeof config.actor === 'string' && config.actor.trim() &&
    typeof config.token === 'string' && config.token.length >= 32, 503, 'Configuração nativa incompleta.');
  return { ...config, endpoint: url.origin };
}
function prepare(binary, input) {
  return new Promise((resolve, reject) => {
    const env = {};
    for (const key of ['PATH', 'SYSTEMROOT', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
    const child = execFile(binary, [], { windowsHide: true, timeout: 10000, maxBuffer: 524288, env }, (error, stdout) => {
      if (error) return reject(error);
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
    child.stdin.on('error', reject);
    child.stdin.end(JSON.stringify(input));
  });
}
async function request(config, path, payload) {
  const response = await fetch(config.endpoint + path, {
    method: payload ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${config.token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });
  demand(response.ok, 503, 'Runtime nativo recusou o registro ou está indisponível. O pedido foi preservado.');
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    demand(length <= 524288, 503, 'Resposta nativa excede o limite.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
// Production always uses the operator's local config. Injection is limited to unit/integration tests.
export function createNativeDraftBridge({ config = configuration, build = prepare, send = request } = {}) {
  return {
    status(user, id) {
      const doc = readDocument(user, id);
      const records = nativeDraftRecords(id);
      return { configured: Boolean(config()), revision: doc.revision, records };
    },
    async register(user, id) {
      const doc = readDocument(user, id);
      demand(user.role === 'owner' || user.id === doc.authorId && user.role === 'author', 403, 'Registro nativo exige autoria ou governança.');
      const cfg = config(); demand(cfg, 503, 'Registro nativo não configurado.');
      let saved = row(id, doc.revision);
      if (!saved) {
        demand(doc.state === 'draft', 409, 'O primeiro registro nativo exige um rascunho.');
        const prepared = await build(cfg.binary, { actor: cfg.actor, content: contentBytes(doc), created_at: Math.floor(Date.now() / 1000) });
        demand(prepared.proposal?.intent?.intent_type === 'DraftDocument' &&
          prepared.proposal.intent.requested_by === cfg.actor &&
          Buffer.from(prepared.proposal.intent.target).toString('hex') === doc.digest &&
          /^[a-f0-9]{64}$/.test(prepared.intent_digest) && /^[a-f0-9]{64}$/.test(prepared.worker_digest) &&
          /^[a-f0-9]+$/.test(prepared.intent_cbor) && /^[a-f0-9]+$/.test(prepared.worker_cbor), 503, 'Adaptador retornou um vínculo inválido.');
        transaction(() => {
          const current = readDocument(user, id);
          demand(current.state === 'draft' && current.revision === doc.revision && current.digest === doc.digest, 409, 'Documento alterado durante a preparação.');
          if (!row(id, doc.revision)) {
            db().prepare('INSERT INTO native_document_drafts(document_id,revision,digest,endpoint,actor,prepared) VALUES(?,?,?,?,?,?)')
              .run(id, doc.revision, doc.digest, cfg.endpoint, cfg.actor, JSON.stringify(prepared));
            appendEvent(user.id, 'native-draft-pending', id, { revision: doc.revision, digest: doc.digest });
          }
        });
        saved = row(id, doc.revision);
      }
      demand(saved.endpoint === cfg.endpoint && saved.actor === cfg.actor && saved.digest === doc.digest, 409,
        'O perfil nativo mudou. Restaure o perfil original para reconciliar este pedido.');
      if (saved.receipt) return JSON.parse(saved.receipt);
      const prepared = JSON.parse(saved.prepared);
      // The exact persisted request is reused after an ambiguous response; no new nonce or timestamp.
      const receipt = JSON.parse(await send(cfg, '/work', prepared.proposal));
      demand(receipt.intent_digest === prepared.intent_digest && receipt.worker_digest === prepared.worker_digest &&
        /^[a-f0-9]{64}$/.test(receipt.record_hash), 503, 'Recibo nativo não corresponde ao pedido.');
      for (const [kind, hash, bytes] of [
        ['WorkIntent', prepared.intent_digest, prepared.intent_cbor],
        ['WorkerExecutionRecord', prepared.worker_digest, prepared.worker_cbor]
      ]) {
        const stored = await send(cfg, `/objects/${kind}/${hash}`);
        demand(stored.toString('hex') === bytes, 503, 'Bytes canônicos persistidos divergem do pedido.');
      }
      const envelope = JSON.parse(await send(cfg, `/evidence/${receipt.record_hash}`));
      demand(Buffer.from(envelope.record_hash || []).toString('hex') === receipt.record_hash &&
        Buffer.from(envelope.subject || []).toString('hex') === prepared.intent_digest &&
        Buffer.from(envelope.payload_digest || []).toString('hex') === prepared.worker_digest, 503, 'Envelope nativo divergente.');
      transaction(() => {
        if (row(id, doc.revision).receipt) return;
        db().prepare('UPDATE native_document_drafts SET receipt=? WHERE document_id=? AND revision=?')
          .run(JSON.stringify(receipt), id, doc.revision);
        appendEvent(user.id, 'native-draft-recorded', id, { revision: doc.revision, ...receipt });
      });
      return receipt;
    }
  };
}
const bridge = createNativeDraftBridge();
export const nativeDraftStatus = (user, id) => bridge.status(user, id);
export const registerNativeDraft = (user, id) => bridge.register(user, id);
