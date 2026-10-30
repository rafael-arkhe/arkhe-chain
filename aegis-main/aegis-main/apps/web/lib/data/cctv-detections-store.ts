'use client';

/**
 * Store compartilhado das últimas detecções CCTV (`GET /cctv/detections?limit=10`),
 * usado pela linha do tempo da Home (#12). Antes a timeline puxava detecções +
 * contagem juntas a cada 5s; agora detecções têm 1 poller global (15s) pausado
 * em aba oculta, e a contagem vem do `cctv-count-store`.
 */
import { Cctv, type CCTVDetection } from '@/lib/api/cctv';
import { createPollingStore } from './polling-store';

const store = createPollingStore<CCTVDetection[]>({
  fetcher: () => Cctv.detections({ limit: 10 }),
  pollMs: 15_000,
  ttlMs: 15_000,
});

export function useCctvDetections(): {
  detections: CCTVDetection[];
  refresh: () => Promise<void>;
} {
  const { data, refresh } = store.useStore();
  return { detections: data ?? [], refresh };
}

/** Acesso ao store p/ reset em teste. */
export const _cctvDetectionsStore = store;
