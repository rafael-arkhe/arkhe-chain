import type { WorkshopApp } from '@/lib/workshop/types';
import { HOME_SEED_APP } from './home';
import { FICHA_SEEDS } from './ficha';
import { SEARCH_RESULT_SEEDS } from './search-result';
import { EVENTS_DEMO_SEED } from './events-demo';
import { ALERTAS_FALLBACK_SEED } from './alertas';

/**
 * Registry global de seeds locais. Quando o `id` começa com `seed.*`,
 * o renderer/editor consulta aqui primeiro em vez de chamar
 * `Workshop.get()` (que exige bearer token IAM).
 *
 * Quando F4.5 entrar, essas seeds são POSTadas no backend e o lookup
 * automaticamente passa a achar a versão remota (com edição
 * persistente). Por agora é tudo local.
 */
export const SEED_REGISTRY: Record<string, WorkshopApp> = {
  [HOME_SEED_APP.id]: HOME_SEED_APP,
  [FICHA_SEEDS.person.id]: FICHA_SEEDS.person,
  [FICHA_SEEDS.lpr_plate.id]: FICHA_SEEDS.lpr_plate,
  [FICHA_SEEDS.cctv_stream.id]: FICHA_SEEDS.cctv_stream,
  [FICHA_SEEDS.parlamentar.id]: FICHA_SEEDS.parlamentar,
  [FICHA_SEEDS.default.id]: FICHA_SEEDS.default,
  [SEARCH_RESULT_SEEDS.default.id]: SEARCH_RESULT_SEEDS.default,
  [EVENTS_DEMO_SEED.id]: EVENTS_DEMO_SEED,
  [ALERTAS_FALLBACK_SEED.id]: ALERTAS_FALLBACK_SEED,
};

export function getSeed(id: string): WorkshopApp | null {
  return SEED_REGISTRY[id] ?? null;
}

export {
  HOME_SEED_APP,
  FICHA_SEEDS,
  SEARCH_RESULT_SEEDS,
  EVENTS_DEMO_SEED,
  ALERTAS_FALLBACK_SEED,
};
export { pickFichaSeed } from './ficha';
export { pickSearchResultSeed } from './search-result';
