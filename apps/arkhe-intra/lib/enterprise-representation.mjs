import { randomUUID, createHash, createPublicKey } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { root } from './paths.mjs';
import { db, transaction, appendEvent } from './store.mjs';
import { demand, Fault } from './documents.mjs';
import { verifySignature } from './crypto.mjs';

export const representationPolicy = () => ({ phase: process.env.ARKHE_ENTERPRISE_PHASE === 'internal' ? 'internal' : 'external', selfDeclaredSectors: ['generic'], implemented: ['SelfDeclared'], pending: ['PowerOfAttorney', 'ECnpj', 'Qsa'], powersVerified: false });
const executable = () => process.env.ARKHE_REPRESENTATION_ANCHOR_EXECUTABLE || resolve(root, `target/debug/arkhe-representation-anchor${process.platform === 'win32' ? '.exe' : ''}`);
const sha = value => createHash('sha256').update(value).digest('hex');
function tables() {
  db().exec(`CREATE TABLE IF NOT EXISTS enterprise_representation_challenges(user_id TEXT PRIMARY KEY, id TEXT NOT NULL, statement TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS enterprise_representations(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, preview_hash TEXT NOT NULL, value TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS no_representation_update BEFORE UPDATE ON enterprise_representations BEGIN SELECT RAISE(ABORT,'immutable representation evidence'); END;
    CREATE TRIGGER IF NOT EXISTS no_representation_delete BEFORE DELETE ON enterprise_representations BEGIN SELECT RAISE(ABORT,'immutable representation evidence'); END;`);
}
function preview(user, previewHash) {
  demand(user?.role === 'owner', 403, 'A declaração exige governança.');
  const row = db().prepare('SELECT * FROM enterprise_previews WHERE user_id=?').get(user.id);
  demand(row && row.hash === previewHash && row.expires > Date.now(), 409, 'Gere um preview válido antes de declarar a representação.');
  return row;
}
export function representationChallenge(user, input) {
  tables(); const row = preview(user, input.previewHash), configuration = JSON.parse(row.value);
  const policy = representationPolicy();
  demand(policy.phase === 'internal' && policy.selfDeclaredSectors.includes(configuration.sectorId), 403, 'Autodeclaração habilitada somente para perfil genérico em piloto interno. Procuração e e-CNPJ ainda exigem integração verificadora.');
  demand(['administrator', 'director', 'attorney'].includes(input.capacity), 400, 'Selecione sua condição de representação.');
  demand(Array.isArray(input.documents) && input.documents.length >= 2 && input.documents.length <= 4, 400, 'Anexe a base documental da declaração.');
  const documents = input.documents.map(item => {
    demand(item && ['constitution', 'identity', 'election', 'power-of-attorney'].includes(item.kind) && typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256), 400, 'Hash documental inválido.');
    return { kind: item.kind, sha256: item.sha256 };
  }).sort((a, b) => a.kind.localeCompare(b.kind));
  demand(new Set(documents.map(item => item.kind)).size === documents.length && new Set(documents.map(item => item.sha256)).size === documents.length, 400, 'Use documentos distintos para cada requisito.');
  const required = ['constitution', 'identity', ...(input.capacity === 'director' ? ['election'] : input.capacity === 'attorney' ? ['power-of-attorney'] : [])];
  demand(required.every(kind => documents.some(item => item.kind === kind)), 400, 'Contrato/estatuto e identidade são obrigatórios; diretor exige ata e procurador exige procuração.');
  const id = randomUUID(), expires = Math.min(row.expires, Date.now() + 600000);
  const statement = JSON.stringify({ domain: 'arkhe-enterprise/representation-declaration/v1', id, actorId: user.id, cnpj: configuration.cnpj, previewHash: row.hash, capacity: input.capacity, documents, issuedAt: new Date().toISOString(), expiresAt: expires, assertion: 'Declaro representar esta empresa na condição indicada, conforme os documentos cujos hashes estão listados. Esta autodeclaração não comprova poderes legais.' });
  db().prepare('INSERT INTO enterprise_representation_challenges VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,statement=excluded.statement,expires=excluded.expires').run(user.id, id, statement, expires);
  return { id, statement, expiresAt: expires };
}
async function anchor(statement, signature, publicKey) {
  demand(existsSync(executable()), 503, 'Motor local WormGraph de representação não instalado.');
  const key = createPublicKey(publicKey).export({ format: 'jwk' });
  demand(key.crv === 'Ed25519' && key.x, 422, 'Chave Ed25519 inválida.');
  const input = JSON.stringify({ statement, public_key_hex: Buffer.from(key.x, 'base64url').toString('hex'), signature_hex: Buffer.from(signature, 'base64').toString('hex') });
  return new Promise((resolveResult, reject) => {
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'SystemDrive', 'TEMP', 'TMP'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
    const child = spawn(executable(), [], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks = []; let size = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Fault(503, 'Motor WormGraph excedeu o prazo.')); }, 10000);
    child.on('error', () => { clearTimeout(timer); reject(new Fault(503, 'Motor WormGraph indisponível.')); });
    child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 65536) { child.kill(); reject(new Fault(503, 'Resposta WormGraph excedeu o limite.')); } else chunks.push(chunk); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Fault(422, 'Declaração recusada pelo motor WormGraph.'));
      try {
        const receipt = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        demand(receipt.format === 'arkhe-enterprise/local-wormgraph-representation/v1' && /^[a-f0-9]{64}$/.test(receipt.root) && receipt.leafCount >= 3 && Array.isArray(receipt.envelopes), 503, 'Recibo WormGraph inválido.');
        resolveResult(receipt);
      } catch { reject(new Fault(503, 'Recibo WormGraph inválido.')); }
    });
    child.stdin.end(input);
  });
}
export async function recordRepresentation(user, input) {
  tables(); demand(user?.role === 'owner', 403, 'A declaração exige governança.');
  const challenge = db().prepare('SELECT * FROM enterprise_representation_challenges WHERE user_id=?').get(user.id);
  demand(challenge && challenge.id === input.challengeId && challenge.expires > Date.now(), 409, 'Desafio de representação ausente ou expirado.');
  const statement = JSON.parse(challenge.statement); preview(user, statement.previewHash);
  demand(verifySignature(challenge.statement, input.signature, user.publicKey), 422, 'Assinatura da declaração inválida.');
  const receipt = await anchor(challenge.statement, input.signature, user.publicKey);
  return transaction(() => {
    const current = db().prepare('SELECT * FROM enterprise_representation_challenges WHERE user_id=?').get(user.id);
    demand(current?.id === challenge.id && current.expires > Date.now(), 409, 'O desafio mudou durante a ancoragem.');
    preview(user, statement.previewHash);
    demand(!db().prepare('SELECT 1 FROM enterprise_profile WHERE id=1').get(), 409, 'A organização já possui perfil.');
    const value = { kind: 'SelfDeclared', capacity: statement.capacity, documents_anchored: statement.documents, statement: challenge.statement, signature: input.signature, publicKey: user.publicKey, statementHash: sha(challenge.statement), anchor: receipt, assurance: 'self-declared-local-wormgraph', powers_verified: false, external_timestamp: false };
    db().prepare('INSERT INTO enterprise_representations VALUES(?,?,?,?)').run(challenge.id, user.id, statement.previewHash, JSON.stringify(value));
    db().prepare('DELETE FROM enterprise_representation_challenges WHERE user_id=?').run(user.id);
    appendEvent(user.id, 'enterprise-representation-declared', null, { statementHash: value.statementHash, previewHash: statement.previewHash, root: receipt.root, assurance: value.assurance, powersVerified: false });
    return { id: challenge.id, basis: value };
  });
}
export function requireRepresentation(user, configuration, id, previewHash) {
  tables();
  const policy = representationPolicy();
  const regulated = ['finance', 'health', 'government'].includes(configuration.sectorId);
  demand(!regulated, 403, 'Setor regulado exige procuração com escopo verificado ou e-CNPJ com cadeia e poderes verificados. Integrações ainda indisponíveis.');
  demand(policy.phase === 'internal' && configuration.sectorId === 'generic', 403, 'Piloto externo exige representação verificada. Autodeclaração disponível somente para generic em piloto interno.');
  const row = typeof id === 'string' && db().prepare('SELECT value FROM enterprise_representations WHERE id=? AND user_id=? AND preview_hash=?').get(id, user.id, previewHash);
  demand(row, 422, 'Registre a declaração assinada e os documentos no WormGraph antes de confirmar.');
  const basis = JSON.parse(row.value), statement = JSON.parse(basis.statement);
  demand(statement.expiresAt > Date.now() && statement.cnpj === configuration.cnpj && statement.actorId === user.id && verifySignature(basis.statement, basis.signature, user.publicKey), 422, 'Declaração expirada ou incompatível com a conta e o CNPJ.');
  return basis;
}
