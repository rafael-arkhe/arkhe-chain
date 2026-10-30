'use client';

/**
 * createPollingStore() — store de módulo COMPARTILHADO p/ dedupar o fetch
 * de uma rota entre N consumidores da UI (#12, 2026-06-28).
 *
 * É a generalização do PADRÃO já provado em `lib/app-shell/use-app-shell.ts`
 * (cache de módulo com TTL + Set de listeners + 1 fetcher), SEM dependência
 * externa (nada de SWR/React-Query). O problema que resolve: cada widget/
 * provider da Home fazia seu próprio `fetch` + `setInterval`, então montar a
 * Home disparava ~7 GETs de `/cctv/count`, ~6 de `/me/home`, ~5 de
 * `/me/context` — multiplicado por 2 no StrictMode do dev.
 *
 * Garantias:
 *   - DEDUP: montar K consumidores ao mesmo tempo dispara 1 fetch (in-flight
 *     promise compartilhada + 1º assinante puxa, demais leem o snapshot).
 *   - TTL: um (re)assinante dentro de `ttlMs` reusa o cache, sem refetch.
 *   - 1 POLLER GLOBAL: o `setInterval` é por STORE (não por consumidor) e só
 *     existe enquanto há ≥1 assinante; ref-counted.
 *   - PAUSA EM ABA OCULTA: `document.hidden` para o poller; ao voltar, refetch
 *     imediato + retoma. (Só p/ stores com `pollMs`.)
 *   - LIMPA AO OCIOSO: quando o último assinante sai, o cache zera e o poller
 *     para — o próximo consumidor refaz um fetch fresco. Isso preserva o
 *     comportamento "1 GET por montagem" de que os testes existentes dependem.
 *
 * Não persiste em localStorage (regra `feedback_no_localstorage_for_persistence`).
 */
import * as React from 'react';

export interface PollingStoreOptions<T> {
  /** O único fetcher da rota — TODOS os consumidores o compartilham. */
  fetcher: () => Promise<T>;
  /**
   * Cadência do poller (ms) enquanto há assinante E a aba está visível.
   * `0`/ausente = SEM poller (modo sob-demanda; refetch só por (re)assinatura
   * quando o cache está velho).
   */
  pollMs?: number;
  /**
   * Frescor do cache (ms): uma (re)assinatura dentro desta janela reusa o
   * cache sem refazer fetch.
   */
  ttlMs: number;
}

export interface StoreSnapshot<T> {
  /** Último valor (cache) ou null se ainda não houve fetch bem-sucedido. */
  data: T | null;
  /** true após o 1º fetch ASSENTAR (sucesso OU falha) desde a última ociosidade. */
  ready: boolean;
  /** Força refetch imediato (ignora TTL). */
  refresh: () => Promise<void>;
}

export interface PollingStore<T> {
  /** Hook React: assina, devolve snapshot reativo + ready + refresh manual. */
  useStore: () => StoreSnapshot<T>;
  /** Leitura imperativa (cache ou null) — p/ não-React e testes. */
  getSnapshot: () => T | null;
  /** Houve ≥1 fetch assentado desde a última ociosidade/reset. */
  isReady: () => boolean;
  /** Assina um listener; devolve o unsubscribe. Dispara 1º fetch + poller. */
  subscribe: (listener: () => void) => () => void;
  /** Refresh condicional (force=true ignora o TTL). */
  refresh: (force?: boolean) => Promise<T | null>;
  /** Nº atual de assinantes — diagnóstico/teste. */
  listenerCount: () => number;
  /** Helper SÓ p/ testes — zera cache, listeners, poller e bump de geração. */
  _resetForTests: () => void;
}

export function createPollingStore<T>(opts: PollingStoreOptions<T>): PollingStore<T> {
  const { fetcher, pollMs = 0, ttlMs } = opts;

  let cache: { data: T; at: number } | null = null;
  let inflight: Promise<T | null> | null = null;
  let attempted = false;
  // Geração: ao limpar/resetar incrementamos; resoluções de fetches "velhos"
  // (geração diferente) são descartadas sem mexer no cache novo.
  let generation = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let visibilityBound = false;
  const listeners = new Set<() => void>();

  function emit() {
    // Cópia defensiva: um listener pode (des)assinar durante a iteração.
    for (const l of Array.from(listeners)) l();
  }

  function isFresh(): boolean {
    return cache !== null && Date.now() - cache.at < ttlMs;
  }

  function hidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  function doFetch(): Promise<T | null> {
    if (inflight) return inflight;
    const gen = generation;
    // Por geração só existe 1 fetch em voo de cada vez (este guard + o
    // `inflight=null` do finally), então limpar o inflight no finally da
    // geração corrente é seguro; resoluções de geração velha não tocam nele.
    inflight = (async () => {
      try {
        const data = await fetcher();
        if (gen !== generation) return null; // geração velha → descarta
        cache = { data, at: Date.now() };
        return data;
      } catch {
        if (gen !== generation) return null;
        // Poller falhou → mantém o último valor bom ("mantém último").
        return cache ? cache.data : null;
      } finally {
        if (gen === generation) {
          attempted = true;
          inflight = null;
          emit();
        }
      }
    })();
    return inflight;
  }

  async function refresh(force = false): Promise<T | null> {
    if (!force && isFresh()) return cache!.data;
    return doFetch();
  }

  function startPoller() {
    if (!pollMs || intervalId !== null || hidden()) return;
    intervalId = setInterval(() => {
      void refresh(true);
    }, pollMs);
  }

  function stopPoller() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function onVisibility() {
    if (hidden()) {
      stopPoller();
    } else if (pollMs && listeners.size > 0) {
      void refresh(true); // recupera o atraso imediatamente ao voltar
      startPoller();
    }
  }

  function bindVisibility() {
    if (visibilityBound || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', onVisibility);
    visibilityBound = true;
  }

  function unbindVisibility() {
    if (!visibilityBound || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', onVisibility);
    visibilityBound = false;
  }

  function goIdle() {
    generation += 1;
    stopPoller();
    unbindVisibility();
    cache = null;
    inflight = null;
    attempted = false;
  }

  function subscribe(listener: () => void): () => void {
    const first = listeners.size === 0;
    listeners.add(listener);
    if (first) {
      if (pollMs) bindVisibility();
      if (!isFresh()) void refresh(false);
      startPoller();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) goIdle();
    };
  }

  function getSnapshot(): T | null {
    return cache ? cache.data : null;
  }

  function isReady(): boolean {
    return attempted;
  }

  function useStore(): StoreSnapshot<T> {
    const [snap, setSnap] = React.useState<{ data: T | null; ready: boolean }>(
      () => ({ data: getSnapshot(), ready: isReady() }),
    );
    React.useEffect(() => {
      const update = () => setSnap({ data: getSnapshot(), ready: isReady() });
      const unsub = subscribe(update);
      // Sincroniza o cache que possa ter chegado entre o render e o effect.
      update();
      return unsub;
    }, []);
    const doRefresh = React.useCallback(async () => {
      await refresh(true);
    }, []);
    return { data: snap.data, ready: snap.ready, refresh: doRefresh };
  }

  function _resetForTests() {
    goIdle();
    listeners.clear();
  }

  return {
    useStore,
    getSnapshot,
    isReady,
    subscribe,
    refresh,
    listenerCount: () => listeners.size,
    _resetForTests,
  };
}
