'use client';

/**
 * Store compartilhado de `GET /api/me/context` (#12).
 *
 * Vários providers/hooks liam o MESMO contexto do operador, cada um com seu
 * próprio fetch na montagem: i18n (locale), assistente (FAB), AIP chat
 * (metaMode/tone), layout de painéis (panel_layouts) e a classificação do
 * banner (project/organization). Eram ~5 GETs idênticos de `/me/context`.
 *
 * Aqui é 1 fetch compartilhado, SOB DEMANDA (sem poller; TTL 60s). Como os
 * providers ficam montados na raiz a sessão inteira, na prática isso é 1 GET
 * por sessão — exatamente o que cada provider fazia, mas uma vez só.
 *
 * Fetch RAW (`fetch('/api/me/context')`, sem init) — a MESMA chamada que os
 * providers já faziam; o proxy /api injeta o Bearer do cookie httpOnly. Os
 * WRITES (PUT) continuam em cada provider (update otimista + persistência).
 */
import type { MeContext } from '@/lib/api';
import type { Mosaic } from '@/lib/cameras/mosaic';
import { createPollingStore } from './polling-store';

/**
 * Superset tipado do payload de `/me/context`: além do `MeContext`
 * (organização/espaço/operação), traz os campos de preferência do operador que
 * os providers consomem. Todos OPCIONAIS — um `MeContext` puro é atribuível.
 */
export interface MeContextFull extends MeContext {
  locale?: string;
  show_assistant_fab?: boolean;
  aip_chat_meta_mode?: string;
  aip_chat_tone?: string;
  panel_layouts?: Record<string, Record<string, string | number | boolean>>;
  /** §C C1 — mosaicos NOMEADOS de câmeras (recortes salvos por operador). */
  camera_mosaics?: Mosaic[];
}

async function fetchMeContext(): Promise<MeContextFull> {
  const r = await fetch('/api/me/context');
  if (!r.ok) throw new Error(`me/context ${r.status}`);
  return (await r.json()) as MeContextFull;
}

const store = createPollingStore<MeContextFull>({
  fetcher: fetchMeContext,
  pollMs: 0, // sob demanda — sem poller
  ttlMs: 60_000,
});

export function useMeContext() {
  return store.useStore();
}

/** Acesso ao store p/ reset em teste. */
export const _meContextStore = store;
