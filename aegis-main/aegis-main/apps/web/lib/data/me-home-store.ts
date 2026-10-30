'use client';

/**
 * Store compartilhado de `GET /me/home` (#12) — KPIs do operador + timeline
 * baseline. Antes, cada um dos ~6 widgets de KPI/timeline fazia seu próprio
 * `Me.home()` na montagem. Agora há 1 fetch compartilhado + poll leve (30s).
 *
 * `live` = o GET teve sucesso ao menos uma vez (mesma semântica do antigo flag
 * por-widget): enquanto null, os KpiCards mostram "—"/indisponível via FALLBACK.
 */
import { Me } from '@/lib/api';
import type { MeHome } from '@/lib/api/types';
import { FALLBACK_ME_HOME } from '@/lib/api/fallback';
import { createPollingStore } from './polling-store';

const store = createPollingStore<MeHome>({
  fetcher: () => Me.home(),
  pollMs: 30_000,
  ttlMs: 30_000,
});

export function useMeHome(): {
  home: MeHome;
  live: boolean;
  refresh: () => Promise<void>;
} {
  const { data, refresh } = store.useStore();
  return { home: data ?? FALLBACK_ME_HOME, live: data !== null, refresh };
}

/** Acesso ao store p/ reset em teste. */
export const _meHomeStore = store;
