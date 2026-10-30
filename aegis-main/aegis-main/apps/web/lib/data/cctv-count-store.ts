'use client';

/**
 * Store compartilhado de `GET /cctv/count` (#12). Antes, cada KPI/subtitle da
 * Home tinha seu próprio poller de 5s → ~7 GETs simultâneos. Agora há 1 poller
 * global (15s), pausado quando a aba está oculta, com 1 fetch por montagem.
 */
import { Cctv } from '@/lib/api/cctv';
import { createPollingStore } from './polling-store';

export interface CctvCount {
  streams_total: number;
  streams_online: number;
  detections_total: number;
}

const store = createPollingStore<CctvCount>({
  fetcher: () => Cctv.count(),
  pollMs: 15_000,
  ttlMs: 15_000,
});

/** Assina o poll compartilhado de contagem CCTV. `data` = null até o 1º fetch. */
export function useCctvCount() {
  return store.useStore();
}

/** Acesso ao store p/ reset em teste. */
export const _cctvCountStore = store;
