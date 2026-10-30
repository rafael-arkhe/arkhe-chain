import { randomUUID } from 'node:crypto';
import { requireBillingAccess } from './billing.mjs';
import { documents, getDocument, saveDocument, transaction, appendEvent, events, auditIntegrity } from './store.mjs';
import { digest, contentBytes, statement, verifySignature } from './crypto.mjs';
import { anchor, checkReceipt, rekorConfig } from './rekor.mjs';
import { trustAccounts } from './account-state.mjs';
import { accounts } from './auth.mjs';
import { verifyBundle } from '../public/offline/verify.mjs';
export class Fault extends Error { constructor(status, message) { super(message); this.status = status; } }
export function demand(condition, status, message) { if (!condition) throw new Fault(status, message); }
export function requireDocument(id) { const doc = getDocument(id); demand(doc, 404, 'Documento não encontrado.'); return doc; }
// Single organization per installation. Drafts are private to their author and governance.
export function canReadDocument(user, doc) {
  return Boolean(user && doc && (user.role === 'owner' || doc.authorId === user.id ||
    (user.role === 'reviewer' && doc.state !== 'draft')));
}
export function readDocument(user, id) {
  const doc = getDocument(id);
  demand(canReadDocument(user, doc), 404, 'Documento não encontrado.');
  return doc;
}
export function readAudit(user) {
  demand(user?.role === 'owner', 403, 'Auditoria global exige governança.');
  return events();
}
function fields(input) {
  demand(input && typeof input === 'object', 400, 'Documento inválido.');
  for (const [key, max] of [['title', 180], ['department', 80], ['body', 50000]]) demand(typeof input[key] === 'string' && input[key].trim().length > 0 && input[key].length <= max, 400, `Campo ${key} ausente ou excede o limite.`);
  return { title: input.title.trim(), department: input.department.trim(), body: input.body.trim() };
}
export function createDocument(user, input) {
  demand(user.role === 'author', 403, 'A criação exige o papel de autoria.');
  const doc = { id: randomUUID(), revision: 1, ...fields(input), authorId: user.id, state: 'draft', createdAt: new Date().toISOString(), signatures: [], receipt: null };
  doc.digest = digest(contentBytes(doc));
  return transaction(() => { saveDocument(doc); appendEvent(user.id, 'created', doc.id, { digest: doc.digest }); return doc; });
}
export function updateDocument(user, id, input) {
  return transaction(() => {
    const doc = requireDocument(id);
    demand(doc.authorId === user.id && doc.state === 'draft', 403, 'Somente o autor pode editar um rascunho.');
    demand(input.revision === doc.revision, 409, 'O documento mudou. Atualize a página.');
    Object.assign(doc, fields(input), { revision: doc.revision + 1 });
    doc.digest = digest(contentBytes(doc));
    saveDocument(doc); appendEvent(user.id, 'edited', id, { digest: doc.digest }); return doc;
  });
}
export function allowed(user, doc, action) {
  if (action === 'submit') return doc.state === 'draft' && doc.authorId === user.id && user.role === 'author';
  if (action === 'review') return doc.state === 'review' && user.role === 'reviewer' && doc.authorId !== user.id;
  if (action === 'approve') return doc.state === 'reviewed' && user.role === 'owner' && !doc.signatures.some(sig => sig.actorId === user.id);
  return false;
}
export function challenge(user, id, action) {
  const doc = requireDocument(id);
  demand(allowed(user, doc, action), 403, 'Papel ou estado não permite esta transição.');
  return { statement: statement(doc, action, user.id), digest: doc.digest, revision: doc.revision };
}
export function transition(user, id, input) {
  return transaction(() => {
    const doc = requireDocument(id);
    demand(allowed(user, doc, input.action), 403, 'Papel ou estado não permite esta transição.');
    demand(doc.revision === input.revision && doc.digest === input.digest, 409, 'Versão divergente. Reabra o documento antes de assinar.');
    const payload = statement(doc, input.action, user.id);
    demand(verifySignature(payload, input.signature, user.publicKey), 422, 'Assinatura Ed25519 inválida para a chave cadastrada.');
    doc.signatures.push({ actorId: user.id, action: input.action, statement: payload, signature: input.signature, publicKey: user.publicKey, at: new Date().toISOString() });
    doc.state = { submit: 'review', review: 'reviewed', approve: 'approved' }[input.action];
    saveDocument(doc); appendEvent(user.id, input.action, id, { digest: doc.digest }); return doc;
  });
}
export async function publish(user, id) {
  demand(user.role === 'owner', 403, 'Publicação exige o responsável pela governança.');
  requireBillingAccess();
  const config = rekorConfig();
  demand(config, 503, 'Rekor não configurado. Informe URL HTTPS e chave pública confiável no servidor.');
  const doc = transaction(() => {
    requireBillingAccess();
    const value = requireDocument(id);
    demand(value.state === 'approved', 409, 'Exige aprovação assinada. Tentativas pendentes precisam de reconciliação.');
    value.state = 'anchoring'; saveDocument(value); appendEvent(user.id, 'anchor-intent', id); return value;
  });
  // No retries: an ambiguous remote outcome stays anchoring until an explicit receipt import.
  const receipt = await anchor(doc.signatures.at(-1), config);
  return reconcile(user, id, receipt);
}
export function reconcile(user, id, receipt) {
  demand(user.role === 'owner', 403, 'Reconciliação exige governança.');
  const config = rekorConfig(); demand(config, 503, 'Chave Rekor confiável ausente.');
  return transaction(() => {
    const doc = requireDocument(id);
    demand(doc.state === 'anchoring', 409, 'Não há ancoragem pendente.');
    demand(checkReceipt(receipt, doc.signatures.at(-1), config.key), 422, 'Recibo não corresponde à aprovação ou à chave Rekor confiável.');
    doc.receipt = receipt; doc.state = 'published'; doc.publishedAt = new Date().toISOString();
    saveDocument(doc); appendEvent(user.id, 'published', id, { digest: doc.digest }); return doc;
  });
}
export function exportDocument(id) {
  const doc = requireDocument(id);
  return { format: 'arkhe-intra/evidence/v1', exportedAt: new Date().toISOString(), document: doc, audit: events().filter(row => row.event.documentId === id), scope: 'Application evidence; not a WormGraph admission receipt or witnessed Rekor checkpoint.' };
}
export function summary(user) {
  const docs = documents().filter(doc => canReadDocument(user, doc));
  const tasks = docs.filter(doc => ['submit', 'review', 'approve'].some(action => allowed(user, doc, action)) || user.role === 'owner' && ['approved', 'anchoring'].includes(doc.state));
  return { documents: docs, tasks, counts: { documents: docs.length, published: docs.filter(doc => doc.state === 'published').length, pending: tasks.length, events: user.role === 'owner' ? events().length : null }, auditIntegrity: auditIntegrity(), rekorConfigured: Boolean(rekorConfig()) };
}
export async function verifyDocument(id) {
  const bundle = exportDocument(id);
  const result = await verifyBundle(bundle, { accounts: trustAccounts(accounts()) }, { blake3_hex: digest });
  const config = rekorConfig();
  if (bundle.document.receipt && config) result.anchor = checkReceipt(bundle.document.receipt, bundle.document.signatures.at(-1), config.key) ? 'PASS' : 'FAIL';
  result.verdict = [result.integrity, result.state, result.signatures, result.anchor].includes('FAIL') ? 'FAIL' : [result.integrity, result.state, result.signatures, result.anchor].every(value => value === 'PASS') ? 'PASS' : 'INCONCLUSIVE';
  result.scope = 'Conferência local de conteúdo, sequência de transições e assinaturas contra as chaves cadastradas. Rekor exige chave fixada, SET válido e inclusão estrutural. Não verifica checkpoint testemunhado, quorum, atestação de tenant ou admissão WormGraph.';
  return result;
}
