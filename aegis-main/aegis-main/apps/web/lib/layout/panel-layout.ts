'use client';

/**
 * usePanelLayout(page, defaults) — layout de painéis POR PÁGINA, por usuário
 * (2026-06-04, feedback do operador: painéis modulares com memorização).
 *
 * Persistência SEMPRE no backend (regra: nunca localStorage) em
 * ``User.metadata_.context.panel_layouts[page]`` via GET/PUT /api/me/context —
 * o MESMO canon do locale (lib/i18n/provider) e do FAB do assistente
 * (lib/assistant/assistant-pref-provider):
 *   - ao montar, GET /api/me/context e mescla ``panel_layouts[page]`` sobre os
 *     defaults (chaves desconhecidas do server não derrubam o layout);
 *   - ``setLayout(patch)`` aplica otimista NA HORA e agenda UM PUT debounced
 *     (600 ms) — o arrasto de resize dispara dezenas de patches e vira uma
 *     única escrita;
 *   - desmontar com escrita pendente faz o flush imediato (não perde o último
 *     ajuste ao navegar).
 *
 * GENÉRICO e multidomínio: o hook não conhece nenhuma página — o chamador dá o
 * slug (ex.: 'solutions') e o shape dos defaults. Valores são escalares curtos
 * (o backend valida fail-closed).
 */
import * as React from 'react';
import { useMeContext } from '@/lib/data/me-context-store';

export type PanelLayout = Record<string, string | number | boolean>;

const DEBOUNCE_MS = 600;

export function usePanelLayout<T extends PanelLayout>(
  page: string,
  defaults: T,
): {
  layout: T;
  setLayout: (patch: Partial<T>) => void;
  /** true após a primeira sincronização com o server (evita flash). */
  ready: boolean;
} {
  const [layout, setLayoutState] = React.useState<T>(defaults);
  // Última versão pro PUT debounced + flush no unmount.
  const latest = React.useRef<T>(defaults);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = React.useRef(false);
  // `touched` (≠ dirty, que zera a cada PUT) marca que o operador já ajustou o
  // layout — o GET (que pode resolver DEPOIS) não deve sobrescrever o ajuste.
  const touched = React.useRef(false);

  // Layout salvo vem do store COMPARTILHADO de /me/context (#12) — dedupado com
  // i18n/assistente/AIP. `ready` = o GET assentou (mesma semântica do antigo
  // `.finally`). Mescla `panel_layouts[page]` sobre os defaults UMA vez por
  // `page`; o setLayout local (otimista + PUT debounced) prevalece depois.
  const { data: ctx, ready } = useMeContext();
  const seededPage = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!ctx || touched.current || seededPage.current === page) return;
    const saved = ctx.panel_layouts?.[page];
    if (saved && typeof saved === 'object') {
      setLayoutState((prev) => {
        const merged = { ...prev, ...saved } as T;
        latest.current = merged;
        return merged;
      });
    }
    seededPage.current = page;
  }, [ctx, page]);

  const persist = React.useCallback(() => {
    dirty.current = false;
    try {
      void fetch('/api/me/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panel_layouts: { [page]: latest.current } }),
      }).catch(() => {
        /* falha de rede: estado local permanece; o próximo ajuste re-tenta */
      });
    } catch {
      /* fetch indisponível (testes isolados) — estado local segue */
    }
  }, [page]);

  const setLayout = React.useCallback(
    (patch: Partial<T>) => {
      touched.current = true;
      setLayoutState((prev) => {
        const next = { ...prev, ...patch } as T;
        latest.current = next;
        return next;
      });
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(persist, DEBOUNCE_MS);
    },
    [persist],
  );

  // Flush no unmount: navegar no meio do debounce não perde o último ajuste.
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) persist();
    },
    [persist],
  );

  return { layout, setLayout, ready };
}
