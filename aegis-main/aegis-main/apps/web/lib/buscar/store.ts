'use client';

/**
 * Store global da página `/buscar`.
 *
 * Por que existe: a fila de buscas pode levar minutos (Sherlock leva
 * ~2min, Maigret idem). Se o state vive só no React da página, navegar
 * fora desmonta o componente e a fila perde contexto. Movendo pra
 * zustand global, o worker continua rodando em background e o operador
 * volta no `/buscar` e encontra a fila intacta + resultados prontos.
 *
 * FASE 2 do fan-out ESCALÁVEL (2026-06-26) — o caminho FELIZ deixa de ser a
 * fila SERIAL do cliente (1 fonte por vez somava ~2-3min: TikTok ~33s, YouTube
 * ~42s, Holehe ~41s). Agora `enqueue` cria TODOS os FilaItem já em `running` e
 * abre UM stream SSE (`streamBatch`) que o backend usa pra rodar TODAS as fontes
 * CONCORRENTES; cada `event: source` chega na ORDEM DE TÉRMINO e atualiza AO VIVO
 * o item certo. As fontes builtin sem `mcpTool` (entities/cameras) não vão pro
 * stream — rodam pelo `runWorker` local em PARALELO, como antes.
 *
 * O `drain()` serial + `runWorker` NÃO somem: viram o FALLBACK. Se o EventSource
 * cai (proxy/ambiente sem stream), os itens `running` daquele lote voltam a
 * `queued` e o `drain()` antigo os processa — UMA vez por lote (flag), sem loop.
 * Reanima ao hidratar caso restem queued/running de sessão anterior.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { runWorker, FonteRequerUrlError, FonteNaoAceitaError, FonteTimeoutError } from './workers';
import { normalizeResult } from './normalize';
import {
  type FilaItem,
  type NormalizedResult,
  type SourceDef,
} from './types';
import { humaniseSearchError } from './humanise';
import { Mcp, type McpAdapter } from '@/lib/api/mcp';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Um erro é um PULO LEGÍTIMO (status `skipped` neutro) quando é uma das classes
 * de skip dos workers (exige URL / não aceita o tipo / timeout). NULL-SAFE: usa
 * o `name` do erro como fallback se a classe não estiver disponível (ex.: módulo
 * mockado em teste) — `e instanceof undefined` lançaria TypeError no catch e
 * engoliria a classificação. Tudo o mais é erro vermelho (humanizado).
 */
function isSkipError(e: unknown): boolean {
  if (
    (typeof FonteRequerUrlError === 'function' && e instanceof FonteRequerUrlError) ||
    (typeof FonteNaoAceitaError === 'function' && e instanceof FonteNaoAceitaError) ||
    (typeof FonteTimeoutError === 'function' && e instanceof FonteTimeoutError)
  ) {
    return true;
  }
  const name = e instanceof Error ? e.name : '';
  return name === 'FonteRequerUrlError' || name === 'FonteNaoAceitaError' || name === 'FonteTimeoutError';
}

type Selecionado = {
  result: NormalizedResult;
  source: SourceDef;
  query: string;
};

type BuscarState = {
  // Form
  query: string;
  selectedClass: string[];
  selectedSourceKeys: string[]; // serializado como array
  // Campos de desambiguação (pessoa) — fluem como `properties` no dossiê e viram
  // FILTRO PRECISO nas fontes (BNMP usa nome da mãe/nascimento; OAB usa UF).
  advanced: { fields: Record<string, string>; purpose: string; caseId: string };

  // Pipeline
  fila: FilaItem[];
  selecionado: Selecionado | null;

  // Bootstrap (não persistido)
  adapters: McpAdapter[];
  adaptersLoading: boolean;
  /** Erro de carregamento da lista de conectores (≠ erro de submit). */
  adaptersError: string | null;
  error: string | null;
};

type BuscarActions = {
  setQuery: (v: string) => void;
  toggleClass: (c: string) => void;
  toggleSource: (key: string) => void;
  /** Substitui A LISTA INTEIRA de fontes selecionadas (usado no Re-rodar do
   *  histórico — restaura a seleção exata da busca anterior de uma vez). */
  setSelectedSourceKeys: (keys: string[]) => void;
  setAdvanced: (patch: Partial<{ fields: Record<string, string>; purpose: string; caseId: string }>) => void;

  setAdapters: (a: McpAdapter[]) => void;
  setAdaptersLoading: (b: boolean) => void;
  setAdaptersError: (e: string | null) => void;
  setError: (e: string | null) => void;

  setSelecionado: (s: Selecionado | null) => void;

  enqueue: (q: string, sources: SourceDef[]) => void;
  cancelAll: () => void;
  clearFila: () => void;
  clearAll: () => void;
};

export const useBuscarStore = create<BuscarState & BuscarActions>()(
  persist(
    (set, get) => ({
      // ─── state ─────────────────────────────────────────
      query: '',
      selectedClass: [],
      selectedSourceKeys: ['camara_deputados@v1', 'senado_senadores@v1'],
      advanced: { fields: {}, purpose: '', caseId: '' },

      fila: [],
      selecionado: null,

      adapters: [],
      adaptersLoading: true,
      adaptersError: null,
      error: null,

      // ─── form actions ──────────────────────────────────
      setQuery: (v) => set({ query: v }),
      toggleClass: (c) =>
        set((s) =>
          s.selectedClass.includes(c)
            ? { selectedClass: s.selectedClass.filter((x) => x !== c) }
            : { selectedClass: [...s.selectedClass, c] },
        ),
      toggleSource: (key) =>
        set((s) =>
          s.selectedSourceKeys.includes(key)
            ? { selectedSourceKeys: s.selectedSourceKeys.filter((k) => k !== key) }
            : { selectedSourceKeys: [...s.selectedSourceKeys, key] },
        ),
      setSelectedSourceKeys: (keys) =>
        // dedup defensivo — mantém a ordem da entrada do histórico.
        set({ selectedSourceKeys: Array.from(new Set(keys)) }),
      setAdvanced: (patch) => set((s) => ({ advanced: { ...s.advanced, ...patch } })),

      setAdapters: (a) => set({ adapters: a }),
      setAdaptersLoading: (b) => set({ adaptersLoading: b }),
      setAdaptersError: (e) => set({ adaptersError: e }),
      setError: (e) => set({ error: e }),

      setSelecionado: (s) => set({ selecionado: s }),

      // ─── pipeline ──────────────────────────────────────
      enqueue: (q, sources) => {
        if (!q.trim() || sources.length === 0) return;
        const now = Date.now();
        // FASE 2: TODAS as fontes começam `running` JUNTAS (não 1 por vez). O
        // backend roda concorrente e o stream atualiza cada item na ordem de
        // término. `startedAt` já fica setado — a Fila mostra o spinner ao vivo.
        const novos: FilaItem[] = sources.map((s) => ({
          id: newId(),
          query: q,
          source: s,
          status: 'running',
          results: [],
          queuedAt: now,
          startedAt: now,
        }));
        set((s) => ({ fila: [...s.fila, ...novos] }));

        // Fontes MCP (têm `mcpTool`) → UM stream SSE concorrente no servidor.
        const mcpItems = novos.filter((it) => !!it.source.mcpTool);
        if (mcpItems.length) {
          streamBatch(q, mcpItems);
        }
        // Fontes builtin (entities/cameras) NÃO têm adapter no backend — rodam
        // pelo runWorker local, EM PARALELO ao stream (cada uma na sua Promise),
        // exatamente como antes (só que sem head-of-line da fila serial).
        for (const it of novos.filter((x) => !x.source.mcpTool)) {
          void runBuiltinItem(it.id);
        }
      },

      cancelAll: () => {
        // Fecha os streams SSE ativos ANTES de marcar cancelado — senão um
        // `event: source` em voo reativaria itens já cancelados.
        closeAllStreams();
        set((s) => ({
          fila: s.fila.map((it) =>
            it.status === 'queued' || it.status === 'running'
              ? { ...it, status: 'cancelled', finishedAt: Date.now() }
              : it,
          ),
        }));
      },

      clearFila: () => {
        closeAllStreams();
        set((s) => ({
          fila: s.fila.filter(
            (it) => it.status === 'queued' || it.status === 'running',
          ),
        }));
      },

      clearAll: () =>
        set({
          fila: [],
          selecionado: null,
          error: null,
        }),
    }),
    {
      name: 'aegis-buscar-store-v1',
      // O shape de `advanced` mudou: v1 tinha selectedTypes/periodo/modo/nomeMae/...;
      // v2 = {fields,purpose,caseId}. Sem isto, um localStorage antigo hidrata `advanced`
      // SEM `fields` → Object.values(undefined) quebra a página. Coage o estado antigo.
      //
      // v3 (BACKLOG #7b ELO 2): o histórico DEIXA de viver no localStorage — agora é
      // server-side (SearchHistory SDK → `/search/history`), cerca por tenant+user. O
      // migrate APAGA qualquer `history` que tenha sobrado de uma sessão v2, pra o
      // localStorage nunca mais ser a fonte da verdade do histórico.
      version: 3,
      migrate: (persisted: unknown) => {
        const p = persisted as { advanced?: Record<string, unknown>; history?: unknown } | null;
        if (p && typeof p === 'object') {
          const a = p.advanced;
          const fieldsOk = a && typeof a === 'object' && a.fields != null && typeof a.fields === 'object';
          if (!fieldsOk) {
            p.advanced = {
              fields: {},
              purpose: a && typeof a.purpose === 'string' ? a.purpose : '',
              caseId: a && typeof a.caseId === 'string' ? a.caseId : '',
            };
          }
          // Remove o histórico legado do localStorage (migrou pro backend).
          if ('history' in p) delete p.history;
        }
        return p as never;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        query: s.query,
        selectedClass: s.selectedClass,
        selectedSourceKeys: s.selectedSourceKeys,
        advanced: s.advanced,
        fila: s.fila,
        selecionado: s.selecionado,
      }),
      onRehydrateStorage: () => (state) => {
        // Items que ficaram em "running" na sessão anterior perderam o contexto
        // da execução (o EventSource morreu com a aba). Reseta pra "queued"; o
        // `drain()` serial (fallback) os reprocessa pelo runWorker — caminho
        // robusto que não depende de re-agrupar o lote do stream perdido.
        if (state?.fila?.length) {
          state.fila = state.fila.map((it) =>
            it.status === 'running' ? { ...it, status: 'queued' as const } : it,
          );
        }
        // Dispara drain após rehydrate (caso reste algo queued).
        setTimeout(() => void drain(), 50);
      },
    },
  ),
);

/* -------------------------------------------------------------------------- */
/* FASE 2 — stream SSE concorrente (caminho feliz)                             */
/* -------------------------------------------------------------------------- */

/** Base do tool sem o sufixo de versão (`camara_deputados@v1` → `camara_deputados`). */
export function toolBase(tool: string): string {
  return (tool || '').split('@')[0];
}

/** Casa o nome de tool do evento `source` contra o `mcpTool` do FilaItem,
 *  COM e SEM `@vN` — o backend pode emitir `camara_deputados@v1` enquanto o
 *  catálogo local tem `camara_deputados@v1` (igual), mas toleramos divergência
 *  de versão comparando também a base. */
export function toolMatches(itemTool: string | null | undefined, eventTool: string): boolean {
  if (!itemTool) return false;
  if (itemTool === eventTool) return true;
  return toolBase(itemTool) === toolBase(eventTool);
}

/** Payload do `event: source` (um por fonte, na ordem de término). */
export interface SourceEvent {
  tool: string;
  version?: string;
  status: 'done' | 'skipped' | 'error';
  /** Envelope CRU do adapter (ex.: `{status:200, data:{...}}`) — só em `done`. */
  result?: unknown;
  reason?: string;
  error?: string;
}

/**
 * Aplica UM `event: source` ao primeiro FilaItem RUNNING do lote cujo
 * `source.mcpTool` casa com `event.tool` (com/sem @vN). PURA + exportada pro
 * teste: recebe a fila e devolve a fila nova (não mexe no zustand direto).
 *
 *   - done    → normalizeResult(tool, result, query) (mesmos extractors do worker)
 *   - skipped → skipReason = reason
 *   - error   → error = humaniseSearchError(error)
 *
 * Restringe ao conjunto `batchIds` pra NÃO atualizar um item homônimo de outro
 * lote (duas buscas do mesmo tool em paralelo). Se nenhum item casa, retorna a
 * fila intacta (frame de fonte que já saiu da fila — ex.: cancelada).
 */
export function applySourceEvent(
  fila: FilaItem[],
  ev: SourceEvent,
  batchIds: Set<string>,
  now: number = Date.now(),
): FilaItem[] {
  const targetIdx = fila.findIndex(
    (it) =>
      batchIds.has(it.id) &&
      it.status === 'running' &&
      toolMatches(it.source.mcpTool, ev.tool),
  );
  if (targetIdx === -1) return fila;

  const item = fila[targetIdx];
  const durationMs = item.startedAt ? now - item.startedAt : undefined;

  let patch: Partial<FilaItem>;
  if (ev.status === 'done') {
    patch = {
      status: 'done',
      results: normalizeResult(ev.tool, ev.result, item.query),
      finishedAt: now,
      durationMs,
    };
  } else if (ev.status === 'skipped') {
    // `reason` já é uma frase pt-BR amigável (o backend usa as mesmas razões
    // dos workers); fallback p/ a razão genérica de "não aceita".
    patch = {
      status: 'skipped',
      skipReason: ev.reason || new FonteNaoAceitaError().message,
      finishedAt: now,
      durationMs,
    };
  } else {
    // humaniseSearchError reclassifica a string crua do backend (circuit-open,
    // upstream-error…) numa mensagem amigável — nunca vaza corpo técnico.
    patch = {
      status: 'error',
      error: humaniseSearchError(ev.error ?? ''),
      finishedAt: now,
      durationMs,
    };
  }

  const next = fila.slice();
  next[targetIdx] = { ...item, ...patch };
  return next;
}

/** EventSources ativos — permite fechar todos em cancelAll/clearFila. */
const activeStreams = new Set<EventSource>();

/** Fecha e descarta todos os streams SSE em voo. */
function closeAllStreams(): void {
  for (const es of activeStreams) {
    try {
      es.close();
    } catch {
      /* já fechado */
    }
  }
  activeStreams.clear();
}

/**
 * Abre UM stream SSE para um LOTE de FilaItem MCP — o backend roda as fontes
 * CONCORRENTES e emite `event: source` por fonte na ORDEM DE TÉRMINO.
 *
 * Resiliência: se o EventSource cai (proxy/ambiente sem stream) ANTES de fechar
 * limpo, os itens ainda `running` deste lote voltam a `queued` e o `drain()`
 * serial (fallback com runWorker) os reprocessa — UMA vez por lote (flag
 * `fellBack`), pra não loopar.
 */
function streamBatch(query: string, items: FilaItem[]): void {
  // SSR/jsdom/ambiente sem EventSource → cai direto no fallback serial.
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    fallbackToSerial(new Set(items.map((it) => it.id)));
    return;
  }

  const batchIds = new Set(items.map((it) => it.id));
  const tools = items.map((it) => it.source.mcpTool!).filter(Boolean);
  const fields = useBuscarStore.getState().advanced?.fields ?? {};

  let es: EventSource;
  try {
    es = new EventSource(Mcp.fanoutStreamUrl(query, tools, fields), { withCredentials: true });
  } catch {
    fallbackToSerial(batchIds);
    return;
  }
  activeStreams.add(es);

  let fellBack = false;
  let doneSeen = false;

  const cleanup = () => {
    activeStreams.delete(es);
    try {
      es.close();
    } catch {
      /* noop */
    }
  };

  es.addEventListener('source', (e: MessageEvent) => {
    let ev: SourceEvent;
    try {
      ev = JSON.parse(e.data) as SourceEvent;
    } catch {
      return; // frame malformado — ignora, mantém estado anterior
    }
    useBuscarStore.setState((s) => ({ fila: applySourceEvent(s.fila, ev, batchIds) }));
  });

  es.addEventListener('done', () => {
    doneSeen = true;
    cleanup();
  });

  es.onerror = () => {
    // EventSource tenta reconectar sozinho; mas se nunca veio `done` e ainda há
    // itens `running` deste lote, NÃO podemos confiar no stream — fallback serial.
    if (fellBack || doneSeen) return;
    const st = useBuscarStore.getState();
    const stillRunning = st.fila.some((it) => batchIds.has(it.id) && it.status === 'running');
    if (!stillRunning) {
      cleanup();
      return;
    }
    fellBack = true;
    cleanup();
    fallbackToSerial(batchIds);
  };
}

/** Marca os itens `running` do lote de volta a `queued` e chama o drain serial. */
function fallbackToSerial(batchIds: Set<string>): void {
  useBuscarStore.setState((s) => ({
    fila: s.fila.map((it) =>
      batchIds.has(it.id) && it.status === 'running'
        ? { ...it, status: 'queued' as const, startedAt: undefined }
        : it,
    ),
  }));
  void drain();
}

/**
 * Roda UMA fonte builtin (entities/cameras — sem adapter no backend) pelo
 * runWorker local, em paralelo ao stream. Mesmo desfecho que o drain serial
 * classifica (done/skipped/error), mas sem ocupar a fila serial.
 */
async function runBuiltinItem(id: string): Promise<void> {
  const start = Date.now();
  const st0 = useBuscarStore.getState();
  const item = st0.fila.find((it) => it.id === id);
  if (!item || item.status !== 'running') return;
  const advFields = st0.advanced?.fields ?? {};
  try {
    const results = await runWorker(item.source, item.query, advFields, []);
    const finish = Date.now();
    useBuscarStore.setState((s) => ({
      fila: s.fila.map((it) =>
        it.id === id
          ? { ...it, status: 'done' as const, results, finishedAt: finish, durationMs: finish - start }
          : it,
      ),
    }));
  } catch (e) {
    const finish = Date.now();
    const isSkip = isSkipError(e);
    useBuscarStore.setState((s) => ({
      fila: s.fila.map((it) =>
        it.id === id
          ? {
              ...it,
              ...(isSkip
                ? { status: 'skipped' as const, skipReason: (e as Error).message }
                : { status: 'error' as const, error: humaniseSearchError(e) }),
              finishedAt: finish,
              durationMs: finish - start,
            }
          : it,
      ),
    }));
  }
}

/* -------------------------------------------------------------------------- */
/* Worker global — singleton (FALLBACK serial)                                */
/* -------------------------------------------------------------------------- */
let draining = false;

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const st = useBuscarStore.getState();
      const next = st.fila.find((i) => i.status === 'queued');
      if (!next) break;

      const start = Date.now();
      useBuscarStore.setState((s) => ({
        fila: s.fila.map((it) =>
          it.id === next.id ? { ...it, status: 'running' as const, startedAt: start } : it,
        ),
      }));

      try {
        // Busca avançada: os campos preenchidos (CNPJ, CPF, UF, nome da mãe…) vão pro
        // worker e filtram a fonte. `accepts` (contrato da fonte, do backend) permite o
        // worker PULAR fontes cujo input específico não está disponível (gate por accepts).
        const st = useBuscarStore.getState();
        const advFields = st.advanced?.fields ?? {};
        const acc =
          (st.adapters ?? []).find((a) => a.tool === next.source.mcpTool)?.accepts ?? [];
        // Timeout por fonte: a fila é sequencial; uma fonte TRAVADA não pode segurar as
        // demais (head-of-line). 120s é generoso (ex.: Holehe leva ~40s legítimo) — pega
        // só travas reais. No estouro a fonte vira `skipped` neutro e a fila CONTINUA.
        const SOURCE_TIMEOUT_MS = 120_000;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const results = await Promise.race([
          runWorker(next.source, next.query, advFields, acc),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new FonteTimeoutError()), SOURCE_TIMEOUT_MS);
          }),
        ]).finally(() => {
          if (timer) clearTimeout(timer);
        });
        const finish = Date.now();
        useBuscarStore.setState((s) => ({
          fila: s.fila.map((it) =>
            it.id === next.id
              ? {
                  ...it,
                  status: 'done' as const,
                  results,
                  finishedAt: finish,
                  durationMs: finish - start,
                }
              : it,
          ),
        }));
      } catch (e) {
        const finish = Date.now();
        // Pulo legítimo (fonte exige URL ou input específico ausente) → `skipped`
        // neutro, não erro vermelho. NULL-SAFE (ver isSkipError).
        const isSkip = isSkipError(e);
        useBuscarStore.setState((s) => ({
          fila: s.fila.map((it) =>
            it.id === next.id
              ? {
                  ...it,
                  ...(isSkip
                    ? { status: 'skipped' as const, skipReason: (e as Error).message }
                    : { status: 'error' as const, error: humaniseSearchError(e) }),
                  finishedAt: finish,
                  durationMs: finish - start,
                }
              : it,
          ),
        }));
      }
    }
  } finally {
    draining = false;
  }
}
