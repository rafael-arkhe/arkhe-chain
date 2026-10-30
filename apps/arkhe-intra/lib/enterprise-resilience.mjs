import { setTimeout as sleep } from 'node:timers/promises';
export class RegistryUnavailable extends Error {}
export function createRegistryResilience({ now = Date.now, threshold = 3, cooldown = 30000, maxConcurrent = 2 } = {}) {
  let failures = 0, openUntil = 0, active = 0;
  return async function run(operation) {
    if (active >= maxConcurrent || now() < openUntil) throw new RegistryUnavailable('Consulta cadastral ocupada ou temporariamente suspensa. Tente novamente mais tarde.');
    active++;
    try { const result = await operation(); failures = 0; openUntil = 0; return result; }
    catch (error) { if (error instanceof RegistryUnavailable && ++failures >= threshold) openUntil = now() + cooldown; throw error; }
    finally { active--; }
  };
}
export async function registryGet(url, options, { request = fetch, wait = sleep, random = Math.random } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try { response = await request(url, options); }
    catch { throw new RegistryUnavailable('Falha de transporte cadastral.'); }
    if (![429, 502, 503, 504].includes(response.status)) return response;
    const retryAfter = response.headers.get('retry-after');
    await response.body?.cancel();
    if (attempt === 2) throw new RegistryUnavailable('Consulta cadastral indisponível após tentativas limitadas.');
    const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : retryAfter ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 0;
    // Do not retry earlier than a long provider delay; return control to the user.
    if (seconds > 2000) throw new RegistryUnavailable('Consulta cadastral limitada pelo provedor. Tente mais tarde.');
    const delay = Math.max(Number.isFinite(seconds) ? seconds : 0, 200 * 2 ** attempt + Math.floor(random() * 100));
    await wait(delay, undefined, { signal: options.signal });
  }
}
let currentCredential, execute = createRegistryResilience();
export function runRegistry(operation, credentialFingerprint) {
  if (currentCredential !== credentialFingerprint) { currentCredential = credentialFingerprint; execute = createRegistryResilience(); }
  return execute(operation);
}
