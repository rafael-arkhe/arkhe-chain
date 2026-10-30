/**
 * Workshop v2 client-side runtime — espelho do
 * web-app/lib/workshop/runtime.ts adaptado pro client `Workshop` local
 * (que aponta pros mesmos endpoints REST do ontology-module).
 *
 * - useEvaluatedApp(appId, overrides) — variáveis resolvidas
 * - useObjectSet(appId, query)        — rows + total da query
 *
 * Sem cache SWR ainda (próxima fase). useEffect bruto é suficiente
 * pra MVP — widgets que compartilham inputs ainda re-fetcham, mas a
 * carga é baixa porque há poucos widgets por página.
 */
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Workshop } from './client';
import type {
  FilterPredicate,
  ObjectSetRow,
  OrderBy,
  ResolvedVariableMap,
  WorkshopApp,
} from './types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface EvaluatedAppState {
  status: Status;
  variables: ResolvedVariableMap;
  error?: string;
}

export function useEvaluatedApp(
  appId: string | null,
  overrides: Record<string, unknown> = {},
  /** Extra dep para forçar recomputo (ex.: `refresh_all` bump). Não vai pro payload. */
  refreshKey?: string,
  /**
   * Provedor de avaliação injetável. Default = `Workshop.evaluate` (endpoint
   * AUTENTICADO). A superfície pública `/m/{token}` injeta um provedor
   * token-scoped que bate no `/public/v1/guest/{token}/pages/{slug}/evaluate`
   * (sem cookie de operador). MESMO renderer, mesma engine de widgets — só muda
   * QUEM resolve os dados (superfície + escopo do token, nunca o widget).
   */
  evaluator?: (
    appId: string,
    opts: { overrides: Record<string, unknown> },
  ) => Promise<{ variables: ResolvedVariableMap }>,
): EvaluatedAppState {
  const [state, setState] = useState<EvaluatedAppState>({
    status: 'idle',
    variables: {},
  });
  const overridesKey = JSON.stringify(overrides);

  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));
    const resolve = evaluator ?? Workshop.evaluate;
    resolve(appId, { overrides })
      .then((res) => {
        if (cancelled) return;
        setState({ status: 'ready', variables: res.variables });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: 'error',
          variables: {},
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, overridesKey, refreshKey]);

  return state;
}

export interface ObjectSetState {
  status: Status;
  rows: ObjectSetRow[];
  total: number;
  error?: string;
}

export interface ObjectSetQuery {
  variable: string;
  overrides?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

/**
 * Provedor de query de object-set injetável (par do `evaluator` do
 * useEvaluatedApp). Default = `Workshop.queryObjectSet` (endpoint do app
 * Workshop). Superfícies SEM app persistido (ex.: seção de WIDGET de um
 * documento /relatorios) injetam um runner que bate em
 * `/notepad/{id}/object-sets/query` — MESMO widget (object_table_v2), só muda
 * QUEM resolve as rows. Sem provider → comportamento atual (retrocompatível).
 */
export type ObjectSetRunner = (
  appId: string,
  query: ObjectSetQuery,
) => Promise<{ rows: ObjectSetRow[]; total: number }>;

export const ObjectSetRunnerContext = createContext<ObjectSetRunner | null>(null);

export function useObjectSet(
  appId: string | null,
  query: ObjectSetQuery | null,
): ObjectSetState {
  const override = useContext(ObjectSetRunnerContext);
  const [state, setState] = useState<ObjectSetState>({
    status: 'idle',
    rows: [],
    total: 0,
  });
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    if (!appId || !query) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));
    const run = override ?? Workshop.queryObjectSet;
    run(appId, query)
      .then((res) => {
        if (cancelled) return;
        setState({ status: 'ready', rows: res.rows, total: res.total });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: 'error',
          rows: [],
          total: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, queryKey]);

  return state;
}

// Helpers usados pelos widgets ao montar query a partir de variables ----

export interface InlineSpec {
  object_type: string;
  filter?: FilterPredicate | null;
  order_by?: OrderBy[];
  limit?: number;
}

// ── Resolve do WorkshopApp pra renderização nas páginas ─────────────
//
// Cada página "renderizada via Workshop" (Home, Ficha, etc.) chama
// `useResolvedApp(fallback)` em vez de hardcodar o seed. A resolução é:
//
//   1. Backend — Workshop.list() filtrado pelo slug == fallback.external_id
//      (slug é o nosso identificador estável; o id UUID muda). Se houver
//      match, usa a versão publicada no servidor.
//   2. localStorage — `workshop.app.<external_id>`. Útil pra modo offline
//      e pra rascunhos não publicados.
//   3. Fallback — o objeto seed compilado no bundle.
//
// `key` força refresh quando a página entra em foco (ex.: vinda do
// editor após Salvar).
export type ResolvedAppSource = 'server' | 'local' | 'fallback';

export interface ResolvedAppState {
  app: WorkshopApp;
  source: ResolvedAppSource;
  loading: boolean;
}

function readLocalApp(slug: string): WorkshopApp | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`workshop.app.${slug}`);
    if (!raw) return null;
    return JSON.parse(raw) as WorkshopApp;
  } catch {
    return null;
  }
}

export function useResolvedApp(fallback: WorkshopApp): ResolvedAppState {
  const slug = fallback.external_id || fallback.id;
  const [state, setState] = useState<ResolvedAppState>({
    app: fallback,
    source: 'fallback',
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await Workshop.list();
        if (cancelled) return;
        const match = list.find((a) => a.external_id === slug);
        if (match) {
          setState({ app: match, source: 'server', loading: false });
          return;
        }
      } catch {
        // backend indisponível ou sem perm — cai pro próximo
      }
      const cached = readLocalApp(slug);
      if (cancelled) return;
      if (cached) {
        setState({ app: cached, source: 'local', loading: false });
        return;
      }
      setState({ app: fallback, source: 'fallback', loading: false });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return state;
}
