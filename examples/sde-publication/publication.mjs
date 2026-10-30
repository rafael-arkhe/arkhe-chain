import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { matchesOutputSchema } from './output-schema.mjs';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = value => structuredClone(value);

export class OperationConflictError extends Error {
  constructor() {
    super('OperationId collision');
    this.name = 'OperationConflictError';
    this.code = 'OPERATION_CONFLICT';
  }
}

export class ForeignDecisionError extends Error {
  constructor() {
    super('Unknown decision: not issued by this instance');
    this.name = 'ForeignDecisionError';
    this.code = 'FOREIGN_DECISION';
  }
}

function mismatchFields(evaluated, current) {
  if (isDeepStrictEqual(evaluated, current)) return [];
  if (evaluated === null || current === null) return ['$document'];
  return [...new Set([...Object.keys(evaluated), ...Object.keys(current)])]
    .sort().filter(key => !isDeepStrictEqual(evaluated[key], current[key]));
}

// A single synchronous authority owns state, application and evidence. No await
// may be inserted between revalidation and mutation without adding concurrency control.
export class Publication {
  #stencil; #documents = new Map(); #roles = new Map();
  #tickets = new WeakMap(); #operations = new Map(); #records = []; #available = true;

  constructor(stencil) { this.#stencil = copy(stencil); }
  setAvailable(value) { this.#available = value; }
  setRoles(actor, roles) { this.#roles.set(actor, [...roles]); }
  setStencil(stencil) { this.#stencil = copy(stencil); }
  seed(id, document) { this.#documents.set(id, copy(document)); }
  document(id) { return copy(this.#documents.get(id) ?? null); }
  records() { return copy(this.#records); }
  #state(request) {
    return { document: this.document(request.documentId), roles: this.#roles.get(request.actorId) ?? [], stencil: this.#stencil };
  }
  #rule(request) {
    if (!this.#available) return ['INDETERMINATE', 'evaluator.available'];
    if (request.action !== 'publish') return ['DENY', 'action.allowed'];
    const { document, roles, stencil } = this.#state(request);
    if (!document) return ['DENY', 'document.exists'];
    if (!roles.includes(stencil.publisherRole)) return ['DENY', 'actor.publisher'];
    if (!stencil.requiredFields.every(field => typeof document[field] === 'string' && document[field].trim())) return ['DENY', 'document.requiredFields'];
    // Here the candidate document is validated, not a distinct LLM response.
    if (!matchesOutputSchema(document, stencil.output_contract?.schema)) return ['DENY', 'output.schema'];
    if (document.state !== stencil.sourceState) return ['DENY', 'document.sourceState'];
    if (document.approvedHash !== digest({ title: document.title, body: document.body })) return ['DENY', 'document.approvedContent'];
    return ['ALLOW', 'publication.admissible'];
  }
  evaluate(request) {
    const { operationId, documentId, actorId, action = 'publish' } = copy(request);
    const intent = { operationId, documentId, actorId, action };
    if (![operationId, documentId, actorId, action].every(x => typeof x === 'string' && x.trim())) throw new Error('Invalid intent');
    const [decision, rule] = this.#rule(intent);
    const ticket = Object.freeze({ decision, rule });
    const evaluatedState = copy(this.#state(intent));
    this.#tickets.set(ticket, {
      intent, snapshot: digest(evaluatedState), stencil: evaluatedState.stencil,
      evaluatedSnapshot: evaluatedState.document, evaluatedAt: new Date().toISOString(),
    });
    return ticket;
  }
  apply(ticket) {
    const binding = this.#tickets.get(ticket);
    if (!binding) throw new ForeignDecisionError();
    const { intent, snapshot, stencil, evaluatedSnapshot, evaluatedAt } = binding;
    const prior = this.#operations.get(intent.operationId);
    if (prior) {
      if (prior.intentHash !== digest(intent)) throw new OperationConflictError();
      return copy(prior.record);
    }
    const appliedAt = new Date().toISOString();
    const before = this.document(intent.documentId);
    const mismatched = mismatchFields(evaluatedSnapshot, before);
    let { decision, rule } = ticket;
    if (decision === 'ALLOW') {
      [decision, rule] = this.#rule(intent);
      if (decision === 'ALLOW' && digest(stencil) !== digest(this.#stencil)) {
        decision = 'DENY'; rule = 'stencil.changed';
      } else if (decision === 'ALLOW' && snapshot !== digest(this.#state(intent))) {
        decision = 'DENY'; rule = 'decision.stale';
      }
    }
    const after = decision === 'ALLOW' ? { ...before, state: stencil.targetState } : before;
    const record = {
      operationId: intent.operationId, documentId: intent.documentId, actorId: intent.actorId,
      action: intent.action,
      stencilId: stencil.id, stencilVersion: stencil.version, stencilHash: digest(stencil),
      rule, decision, enforcement: decision === 'ALLOW' ? 'EXECUTED' : 'BLOCKED',
      observedEffect: decision === 'ALLOW' ? 'DOCUMENT_PUBLISHED' : 'DOCUMENT_UNCHANGED',
      before, after, evaluationDecision: ticket.decision, evaluationRule: ticket.rule,
      evaluatedSnapshot: copy(evaluatedSnapshot), evaluatedAt, appliedAt,
      revalidationOutcome: mismatched.length ? 'SNAPSHOT_MISMATCH' : 'SNAPSHOT_MATCH',
      mismatchFields: mismatched,
      appliedStencilHash: digest(this.#stencil), recordedAt: new Date().toISOString(),
    };
    if (!stencil.evidenceFields.every(field => Object.hasOwn(record, field))) throw new Error('Evidence contract violated');
    if (decision === 'ALLOW') this.#documents.set(intent.documentId, after);
    this.#records.push(copy(record));
    this.#operations.set(intent.operationId, { intentHash: digest(intent), record: copy(record) });
    return copy(record);
  }
}

export function approvedDocument() {
  const content = { title: 'Documento de demonstração', body: 'Conteúdo aprovado.' };
  return { ...content, state: 'approved', revision: 1, approvedHash: digest(content) };
}
export function intent(documentId = 'doc-1', actorId = 'alice') {
  return { operationId: randomUUID(), documentId, actorId, action: 'publish' };
}
