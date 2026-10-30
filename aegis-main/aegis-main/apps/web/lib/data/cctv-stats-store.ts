'use client';

/**
 * Store compartilhado de `GET /cctv/stats/by_class` (#12) — alimenta o widget
 * "Contagem por classe" do Painel. Antes era um poller de 10s embutido no
 * componente; agora é 1 poller global (30s), pausado em aba oculta. A janela é
 * fixa em 24h (1440 min) — a MESMA do widget (vide contagem-classe.tsx).
 */
import { Cctv } from '@/lib/api/cctv';
import { createPollingStore } from './polling-store';

export interface CctvStats {
  since_minutes: number;
  total: number;
  by_kind: Record<string, number>;
  by_class: Record<string, Record<string, number>>;
}

/** Janela do widget — 24h (mesma constante de components/painel/contagem-classe). */
export const STATS_WINDOW_MINUTES = 1440;

const store = createPollingStore<CctvStats>({
  fetcher: () => Cctv.statsByClass(STATS_WINDOW_MINUTES),
  pollMs: 30_000,
  ttlMs: 30_000,
});

export function useCctvStats(): {
  stats: CctvStats | null;
  live: boolean;
  refresh: () => Promise<void>;
} {
  const { data, refresh } = store.useStore();
  return { stats: data, live: data !== null, refresh };
}

/** Acesso ao store p/ reset em teste. */
export const _cctvStatsStore = store;
