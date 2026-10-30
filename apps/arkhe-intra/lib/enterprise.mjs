import { createHash } from 'node:crypto';
import { db, transaction, appendEvent } from './store.mjs';
import { demand } from './documents.mjs';
import { sectors, personas, integrations, suggestSector } from './enterprise-catalog.mjs';
import { verifyCnpjRegistry, cnpjRegistryConfigured } from './enterprise-cnpj.mjs';
import { normalizeCnpj, validCnpj } from './cnpj.mjs';
export { validCnpj } from './cnpj.mjs';
import { requireRepresentation, representationPolicy } from './enterprise-representation.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function tables() {
  db().exec(`CREATE TABLE IF NOT EXISTS enterprise_profile(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS enterprise_profile_immutable_update BEFORE UPDATE ON enterprise_profile BEGIN SELECT RAISE(ABORT,'immutable enterprise profile'); END;
    CREATE TRIGGER IF NOT EXISTS enterprise_profile_immutable_delete BEFORE DELETE ON enterprise_profile BEGIN SELECT RAISE(ABORT,'immutable enterprise profile'); END;
    CREATE TABLE IF NOT EXISTS enterprise_preview_requests(user_id TEXT NOT NULL, request_key TEXT NOT NULL, input_hash TEXT NOT NULL, response TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(user_id,request_key));
    CREATE INDEX IF NOT EXISTS enterprise_preview_requests_expiry ON enterprise_preview_requests(expires);
    CREATE TABLE IF NOT EXISTS enterprise_personas(user_id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS enterprise_previews(user_id TEXT PRIMARY KEY, hash TEXT NOT NULL, value TEXT NOT NULL, expires INTEGER NOT NULL);`);
}
function authenticated(user) { demand(user?.id, 401, 'Entre com sua conta para continuar.'); }
function owner(user) { authenticated(user); demand(user.role === 'owner', 403, 'A configuração da organização exige governança.'); }
function profile() { const row = db().prepare('SELECT value FROM enterprise_profile WHERE id=1').get(); return row ? JSON.parse(row.value) : null; }
function selection(value, catalog, label) {
  demand(Array.isArray(value) && value.length > 0 && value.length <= catalog.length && value.every(id => typeof id === 'string' && catalog.some(item => item.id === id)), 400, `${label} inválidos.`);
  return [...new Set(value)].sort();
}
export function enterpriseState(user) {
  authenticated(user); tables();
  const row = db().prepare('SELECT value FROM enterprise_personas WHERE user_id=?').get(user.id);
  return { sectors, personas, integrations, profile: profile(), preferences: row ? JSON.parse(row.value) : { available: ['legal'], active: 'legal' }, canConfigure: user.role === 'owner', catalogStatus: 'unsigned-proposal', registryConfigured: cnpjRegistryConfigured(), representationPolicy: representationPolicy() };
}
export function savePersonas(user, input) {
  authenticated(user); tables();
  const available = selection(input.available, personas, 'Departamentos');
  demand(available.includes(input.active), 400, 'A persona ativa deve estar entre seus departamentos.');
  const value = { available, active: input.active };
  db().prepare('INSERT INTO enterprise_personas VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value').run(user.id, JSON.stringify(value));
  return value;
}
export function previewEnterprise(user, input, requestKey) {
  owner(user); tables(); demand(!profile(), 409, 'A organização já possui um perfil imutável.');
  demand(typeof input.company === 'string' && input.company.trim().length >= 2 && input.company.length <= 180, 400, 'Informe a razão social (2 a 180 caracteres).');
  const cnpj = normalizeCnpj(input.cnpj);
  demand(cnpj && validCnpj(cnpj), 400, 'CNPJ inválido. Informe 12 posições alfanuméricas e dois dígitos verificadores válidos.');
  demand(typeof input.cnae === 'string' && /^(?:\d{7}|\d{4}-\d\/\d{2})$/.test(input.cnae), 400, 'Informe o CNAE com 7 dígitos.');
  const sector = sectors.find(value => value.id === input.sectorId); demand(sector, 400, 'Setor inválido.');
  const departments = selection(input.departments, personas, 'Departamentos');
  demand(Array.isArray(input.integrations) && input.integrations.length <= integrations.length && input.integrations.every(id => integrations.some(item => item.id === id)), 400, 'Integrações inválidas.');
  const configuration = { company: input.company.trim(), cnpj, cnae: input.cnae.replace(/\D/g, ''), sectorId: sector.id, sectorVersion: sector.version, sectorHash: hash(sector), sectorSnapshot: sector, departments, integrations: [...new Set(input.integrations)].sort(), policyStatus: 'proposed-not-enforced' };
  demand(requestKey === undefined || typeof requestKey === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(requestKey), 400, 'Idempotency-Key inválida.');
  return transaction(() => {
  demand(!profile(), 409, 'A organização já possui um perfil imutável.');
  const now = Date.now();
  db().prepare('DELETE FROM enterprise_preview_requests WHERE expires<=?').run(now);
  const prior = requestKey && db().prepare('SELECT * FROM enterprise_preview_requests WHERE user_id=? AND request_key=?').get(user.id, requestKey);
  if (prior) {
    demand(prior.input_hash === hash(configuration), 409, 'Idempotency-Key já utilizada com outros dados.');
    const current = db().prepare('SELECT hash,expires FROM enterprise_previews WHERE user_id=?').get(user.id);
    const response = JSON.parse(prior.response);
    demand(current?.hash === response.previewHash && current?.expires === response.expiresAt, 409, 'Preview substituído. Gere uma nova chave.');
    return response;
  }
  const previewHash = hash(configuration), expiresAt = Date.now() + 15 * 60 * 1000;
  db().prepare('INSERT INTO enterprise_previews VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash,value=excluded.value,expires=excluded.expires').run(user.id, previewHash, JSON.stringify(configuration), expiresAt);
  const response = { configuration, previewHash, expiresAt, suggestedSector: suggestSector(input.cnae) };
  if (requestKey) db().prepare('INSERT INTO enterprise_preview_requests VALUES(?,?,?,?,?)').run(user.id,requestKey,hash(configuration),JSON.stringify(response),expiresAt);
  return response;
  });
}
export async function commitEnterprise(user, input) {
  owner(user); tables(); demand(input.confirm === true, 400, 'Confirme explicitamente o preview.');
  demand(!profile(), 409, 'A organização já possui um perfil imutável.');
  const initial = db().prepare('SELECT * FROM enterprise_previews WHERE user_id=?').get(user.id);
  demand(initial && initial.expires > Date.now() && initial.hash === input.previewHash, 409, 'Preview ausente, divergente ou expirado. Revise novamente.');
  const initialConfiguration = JSON.parse(initial.value);
  requireRepresentation(user, initialConfiguration, input.representationId, initial.hash);
  const identityEvidence = await verifyCnpjRegistry(initialConfiguration, initial.hash);
  return transaction(() => {
    demand(!profile(), 409, 'A organização já possui um perfil imutável.');
    const row = db().prepare('SELECT * FROM enterprise_previews WHERE user_id=?').get(user.id);
    demand(row && row.expires > Date.now() && row.hash === input.previewHash && row.value === initial.value && row.expires === initial.expires, 409, 'Preview ausente, divergente ou expirado. Revise novamente.');
    const configuration = JSON.parse(row.value);
    const representation_basis = requireRepresentation(user, configuration, input.representationId, row.hash);
    const sector = sectors.find(value => value.id === configuration.sectorId);
    demand(sector && hash(sector) === configuration.sectorHash, 409, 'O catálogo mudou. Gere um novo preview.');
    const value = { ...configuration, identityEvidence, representation_basis, confirmedBy: user.id, confirmedAt: new Date().toISOString(), previewHash: row.hash };
    db().prepare('INSERT INTO enterprise_profile VALUES(1,?)').run(JSON.stringify(value));
    db().prepare('DELETE FROM enterprise_previews').run();
    appendEvent(user.id, 'enterprise-profile-confirmed', null, { sectorId: value.sectorId, version: value.sectorVersion, previewHash: row.hash, policyStatus: value.policyStatus, registrySource: identityEvidence.source, registryResponseHash: identityEvidence.responseHash, representation: representation_basis.assurance, powersVerified: false });
    return value;
  });
}
