/**
 * Cliente do HISTÓRICO de buscas RICO do /buscar (BACKLOG #7b).
 *
 * Backend: ontology-module `app/routers/search_history.py`, montado em
 * `/search/history`. Substitui o `history: string[]` em localStorage do store
 * do front (`lib/buscar/store.ts`) — que violava no-localStorage-for-persistence.
 *
 * Persiste o CONTEXTO completo de UMA busca: a query digitada + as fontes
 * selecionadas (as keys do multiselect) + os campos da Busca avançada
 * (`fields`/`purpose`/`caseId`). Tudo é DO PRÓPRIO USUÁRIO (cerca ABAC por
 * tenant + user no backend) — um operador nunca vê o histórico de outro.
 *
 * `result_summary` é OPCIONAL e enxuto (contagens por fonte) — NUNCA os
 * resultados inteiros (isto é busca, não dossiê).
 *
 * O shape de `advanced` espelha 1:1 o `advanced` do store (camelCase `caseId`),
 * então uma entrada do histórico re-roda a busca sem nenhuma tradução de chave.
 */
import { apiFetch } from './client';

/** Campos da Busca avançada — idêntico ao `advanced` do store do /buscar. */
export interface SearchHistoryAdvanced {
  fields: Record<string, string>;
  purpose: string;
  caseId: string;
}

/** Uma entrada do histórico (contexto completo p/ re-rodar a busca). */
export interface SearchHistoryEntry {
  id: string;
  query: string;
  /** Keys das fontes selecionadas (ex.: "camara_deputados@v1"). */
  sources: string[];
  advanced: SearchHistoryAdvanced;
  /** Contagens por fonte (opcional) — nunca os resultados inteiros. */
  result_summary: Record<string, number> | null;
  created_at: string | null;
}

/** Corpo do POST — grava uma entrada no submit da busca. */
export interface SearchHistorySaveBody {
  query: string;
  sources?: string[];
  advanced?: Partial<SearchHistoryAdvanced>;
  result_summary?: Record<string, number> | null;
}

export const SearchHistory = {
  /** Lista o histórico do usuário, recentes primeiro (default 50, máx 500). */
  list: (limit = 50) =>
    apiFetch<SearchHistoryEntry[]>(`/search/history?limit=${encodeURIComponent(String(limit))}`),

  /** Grava UMA entrada (chamada no submit). Devolve a entrada criada. */
  save: (body: SearchHistorySaveBody) =>
    apiFetch<SearchHistoryEntry>('/search/history', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Entrada completa por id (contexto p/ re-rodar). 404 se não for do usuário. */
  get: (id: string) =>
    apiFetch<SearchHistoryEntry>(`/search/history/${encodeURIComponent(id)}`),

  /** Remove UMA entrada do próprio usuário. */
  remove: (id: string) =>
    apiFetch<{ status: string; id: string }>(`/search/history/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  /** Limpa TODO o histórico do próprio usuário. Devolve quantas saíram. */
  clear: () =>
    apiFetch<{ status: string; deleted: number }>('/search/history', { method: 'DELETE' }),
};
