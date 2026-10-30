'use client';

/**
 * useAppShell() — hook que carrega a config de "Layout do App" e devolve
 * a config efetiva (merge feito pelo backend) ao shell renderer.
 *
 * Wave E.1 (2026-05-23).
 *
 * Funcionamento:
 *   - Mount: GET /platform/v23/app-shell/me. Cache 60s in-module
 *     (não localStorage — `feedback_no_localstorage_for_persistence`).
 *   - Falha silenciosa: se backend offline, devolve DEFAULT_APP_SHELL
 *     com source="default" — shell renderiza fallback hardcoded.
 *   - Setter ``save({config, scope})``:
 *       * scope="me"     → PUT /me
 *       * scope="tenant" → PUT /tenant
 *     Invalida cache e re-emite a config nova pra todos os consumidores.
 *
 * Quando o componente shell precisa override (preview no composer),
 * usa o `<PreviewAppShellProvider>` que substitui o valor via Context.
 */
import * as React from 'react';
import { AppShell, type AppShellConfig, type AppShellEnvelope } from '@/lib/api';
import { DEFAULT_APP_SHELL } from './defaults';
import { migrateSidenavLegacy } from './migrate-sidenav';

/**
 * Onda I.2 (Feedback #2) — migração silenciosa sidenav legacy → groups.
 * Roda sobre todo envelope vindo do backend: converte `sections`/`tree`
 * legados em `groups` e zera `sections`. A UI então só vê `groups`. Quando
 * o operador salvar, a config migrada (groups-only) persiste no backend.
 */
function _migrateEnvelope(envelope: AppShellEnvelope): AppShellEnvelope {
  return { ...envelope, config: migrateSidenavLegacy(envelope.config) };
}

interface UseAppShellState {
  /** Config efetiva — backend merge ou fallback default. */
  config: AppShellConfig;
  /** Origem: user|tenant|default — UI mostra label "Sobrescrito" quando "user". */
  source: 'user' | 'tenant' | 'default';
  loading: boolean;
  error: string | null;
  /** Versão monotônica — incrementa em cada refetch/save. */
  version: number;
}

interface AppShellApi extends UseAppShellState {
  refresh: () => Promise<void>;
  save: (
    config: AppShellConfig,
    opts?: { scope?: 'me' | 'tenant' },
  ) => Promise<AppShellEnvelope>;
}

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  envelope: AppShellEnvelope;
  fetchedAt: number;
}

let _cache: CacheEntry | null = null;
const _listeners = new Set<() => void>();
// Wave G.1 — listeners "soft" que recebem o envelope direto sem disparar
// novo fetch nem flip de loading. Usados pelo mutateAppShellCache para
// propagar uma config nova sem flash de skeleton no composer pai.
const _softListeners = new Set<(envelope: AppShellEnvelope) => void>();

function _emitChange() {
  for (const fn of _listeners) {
    fn();
  }
}

function _emitSoft(envelope: AppShellEnvelope) {
  for (const fn of _softListeners) {
    fn(envelope);
  }
}

function _invalidate() {
  _cache = null;
  _emitChange();
}

async function _fetchEnvelope(force = false): Promise<AppShellEnvelope> {
  const now = Date.now();
  if (
    !force &&
    _cache &&
    now - _cache.fetchedAt < CACHE_TTL_MS
  ) {
    return _cache.envelope;
  }
  const envelope = _migrateEnvelope(await AppShell.getMe());
  _cache = { envelope, fetchedAt: now };
  _emitChange();
  return envelope;
}

export function useAppShell(): AppShellApi {
  const [state, setState] = React.useState<UseAppShellState>(() => ({
    config: DEFAULT_APP_SHELL,
    source: 'default',
    loading: true,
    error: null,
    version: 0,
  }));

  const sync = React.useCallback(async (force: boolean) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const envelope = await _fetchEnvelope(force);
      setState((s) => ({
        config: envelope.config,
        source: envelope.source,
        loading: false,
        error: null,
        version: s.version + 1,
      }));
    } catch (e) {
      setState((s) => ({
        config: DEFAULT_APP_SHELL,
        source: 'default',
        loading: false,
        error: e instanceof Error ? e.message : 'falha ao carregar',
        version: s.version + 1,
      }));
    }
  }, []);

  React.useEffect(() => {
    void sync(false);
    const listener = () => {
      void sync(false);
    };
    _listeners.add(listener);
    // Wave G.1 — listener soft. Substitui state direto sem flip de
    // loading nem chamada de getMe. Garantido mesmo envelope no
    // _cache, então skip de fetch.
    const softListener = (envelope: AppShellEnvelope) => {
      setState((s) => ({
        config: envelope.config,
        source: envelope.source,
        loading: false,
        error: null,
        version: s.version + 1,
      }));
    };
    _softListeners.add(softListener);
    return () => {
      _listeners.delete(listener);
      _softListeners.delete(softListener);
    };
  }, [sync]);

  const refresh = React.useCallback(() => sync(true), [sync]);

  const save = React.useCallback(
    async (
      config: AppShellConfig,
      opts: { scope?: 'me' | 'tenant' } = {},
    ): Promise<AppShellEnvelope> => {
      const scope = opts.scope ?? 'me';
      const envelope = _migrateEnvelope(
        scope === 'tenant'
          ? await AppShell.putTenant(config)
          : await AppShell.putMe(config),
      );
      // Atualiza o cache e re-emite pra todos os consumidores.
      _cache = { envelope, fetchedAt: Date.now() };
      _emitChange();
      return envelope;
    },
    [],
  );

  return {
    ...state,
    refresh,
    save,
  };
}

/** Helper somente p/ tests — limpa cache e listeners entre cenários. */
export function _resetAppShellCacheForTests() {
  _cache = null;
  _listeners.clear();
  _softListeners.clear();
}

/**
 * Wave G.1 (2026-05-23) — refetch suave + propagação aos consumidores.
 *
 * Diferente de ``refresh()`` (que toggla ``loading=true`` no estado dos
 * consumidores e faz a page exibir skeleton), esta função:
 *   1) Invalida o cache.
 *   2) Chama ``AppShell.getMe`` em background.
 *   3) Propaga o envelope aos listeners "soft" — cada hook atualiza
 *      estado SEM flipar loading. Sidenav + outros consumidores
 *      recebem a config nova sem flash.
 *
 * Usado pelo MarketplaceInspector após install: o operador instala um
 * app e a sidenav atualiza sem reload e sem unmount do composer pai.
 */
export async function mutateAppShellCache(): Promise<void> {
  _cache = null;
  try {
    const envelope = _migrateEnvelope(await AppShell.getMe());
    _cache = { envelope, fetchedAt: Date.now() };
    _emitSoft(envelope);
  } catch {
    // best-effort — emite change "hard" como fallback (próxima leitura
    // refaz fetch normalmente).
    _emitChange();
  }
}
