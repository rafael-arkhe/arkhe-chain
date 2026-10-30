import { registryGet, runRegistry, RegistryUnavailable } from './enterprise-resilience.mjs';
import { createHash } from 'node:crypto';
import { demand, Fault } from './documents.mjs';

const gateway = 'https://gateway.apiserpro.serpro.gov.br';
export function cnpjRegistryConfigured() {
  return Boolean(process.env.ARKHE_SERPRO_CONSUMER_KEY && process.env.ARKHE_SERPRO_CONSUMER_SECRET);
}
const normalizeName = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function readJson(response) {
  demand(response.headers.get('content-type')?.includes('application/json'), 502, 'Resposta cadastral inválida.');
  const reader = response.body?.getReader(); demand(reader, 502, 'Resposta cadastral vazia.');
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 131072) { await reader.cancel(); throw new Fault(502, 'Resposta cadastral excede o limite.'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Fault(502, 'Resposta cadastral inválida.'); }
}
export async function verifyCnpjRegistry(configuration, previewHash) {
  demand(cnpjRegistryConfigured(), 503, 'Confirmação bloqueada: configure a consulta cadastral Serpro no servidor.');
  return runRegistry(async () => {
  const signal = AbortSignal.timeout(10000);
  try {
    const authorization = Buffer.from(`${process.env.ARKHE_SERPRO_CONSUMER_KEY}:${process.env.ARKHE_SERPRO_CONSUMER_SECRET}`).toString('base64');
    const authResponse = await fetch(`${gateway}/token`, { method: 'POST', redirect: 'error', signal, cache: 'no-store', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: 'grant_type=client_credentials' });
    if ([429, 502, 503, 504].includes(authResponse.status)) { await authResponse.body?.cancel(); throw new RegistryUnavailable('Autenticação cadastral temporariamente indisponível.'); }
    demand(authResponse.ok, 503, 'Não foi possível autenticar a consulta cadastral.');
    const auth = await readJson(authResponse);
    demand(typeof auth.access_token === 'string' && /^[A-Za-z0-9._~+\/-]{1,8192}={0,2}$/.test(auth.access_token), 502, 'Token cadastral inválido.');
    // Production only. Trial endpoints deliberately cannot satisfy this gate.
    const response = await registryGet(`${gateway}/consulta-cnpj-df/v2/basica/${configuration.cnpj}`, { redirect: 'error', signal, cache: 'no-store', headers: { Authorization: `Bearer ${auth.access_token}`, Accept: 'application/json' } });
    demand(response.status !== 404 && response.status !== 204, 422, 'CNPJ não encontrado na consulta cadastral.');
    demand(response.ok, 503, 'Consulta cadastral indisponível. Nenhum perfil foi confirmado.');
    const value = await readJson(response);
    demand(value.ni === configuration.cnpj, 422, 'A consulta retornou outro CNPJ.');
    demand(['2', '02', 2].includes(value.situacaoCadastral?.codigo), 422, 'O CNPJ não está com situação cadastral ativa.');
    demand(typeof value.nomeEmpresarial === 'string' && value.nomeEmpresarial.length > 1 && value.nomeEmpresarial.length <= 250, 502, 'Razão social ausente na consulta.');
    demand(normalizeName(value.nomeEmpresarial) === normalizeName(configuration.company), 422, 'A razão social diverge do cadastro. Corrija os dados e gere outro preview.');
    demand(value.cnaePrincipal?.codigo === configuration.cnae, 422, 'O CNAE principal diverge do cadastro. Corrija os dados e gere outro preview.');
    return { source: 'serpro-consulta-cnpj-production-v2', cnpj: value.ni, officialName: value.nomeEmpresarial, cnae: value.cnaePrincipal.codigo, status: 'active', checkedAt: new Date().toISOString(), previewHash, responseHash: createHash('sha256').update(JSON.stringify(value)).digest('hex'), representation: 'not-verified' };
  } catch (error) {
    if (error instanceof RegistryUnavailable) throw error;
    if (error instanceof Fault) throw error;
    throw new RegistryUnavailable('Consulta cadastral indisponível ou expirada. Nenhum perfil foi confirmado.');
  }
  }, createHash('sha256').update(`${process.env.ARKHE_SERPRO_CONSUMER_KEY}:${process.env.ARKHE_SERPRO_CONSUMER_SECRET}`).digest('hex')).catch(error => {
    if (error instanceof RegistryUnavailable) throw new Fault(503, error.message);
    throw error;
  });
}
