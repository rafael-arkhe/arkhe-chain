'use client';

/**
 * useCameraMosaics() — §C C1: lista de MOSAICOS NOMEADOS do operador, por
 * usuário, persistida no BACKEND (nunca localStorage — regra
 * feedback_no_localstorage_for_persistence).
 *
 * Espelha EXATAMENTE o padrão dos demais campos de /me/context
 * (lib/assistant/assistant-pref-provider · lib/i18n/provider):
 *   - lê o store COMPARTILHADO `useMeContext()` (1 GET dedupado; TTL 60s);
 *   - semeia `camera_mosaics` UMA vez (guarda `seeded`), e `touched` impede que
 *     um GET que resolva DEPOIS de uma edição otimista sobrescreva a escolha;
 *   - `upsert`/`remove` aplicam otimista NA HORA + PUT /api/me/context
 *     { camera_mosaics: [...] } (o backend valida fail-closed e mescla só este
 *     campo — concorrência segura por campo).
 *
 * O tipo `Mosaic` e a resolução vivem em `lib/cameras/mosaic.ts` (fonte única).
 */
import * as React from 'react';
import { useMeContext } from '@/lib/data/me-context-store';
import type { Mosaic } from '@/lib/cameras/mosaic';

export interface CameraMosaicsHook {
  mosaics: Mosaic[];
  /** true após a primeira sincronização com o server (evita flash/empty). */
  ready: boolean;
  /** Cria ou atualiza por id (otimista + persiste). */
  upsert: (m: Mosaic) => void;
  /** Remove por id (otimista + persiste). */
  remove: (id: string) => void;
}

export function useCameraMosaics(): CameraMosaicsHook {
  const { data: ctx, ready } = useMeContext();
  const [mosaics, setMosaics] = React.useState<Mosaic[]>([]);
  // Espelho em ref para upsert/remove computarem sobre o estado ATUAL sem
  // fechar sobre um valor obsoleto (o PUT debounced/otimista lê daqui).
  const latest = React.useRef<Mosaic[]>([]);
  const seeded = React.useRef(false);
  const touched = React.useRef(false);

  React.useEffect(() => {
    if (seeded.current || touched.current || !ctx) return;
    if (Array.isArray(ctx.camera_mosaics)) {
      setMosaics(ctx.camera_mosaics);
      latest.current = ctx.camera_mosaics;
    }
    seeded.current = true;
  }, [ctx]);

  const persist = React.useCallback((next: Mosaic[]) => {
    touched.current = true;
    latest.current = next;
    setMosaics(next);
    try {
      void fetch('/api/me/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera_mosaics: next }),
      }).catch(() => {
        /* falha de rede: estado local permanece; a próxima edição re-tenta */
      });
    } catch {
      /* fetch indisponível (testes isolados) — estado local segue */
    }
  }, []);

  const upsert = React.useCallback(
    (m: Mosaic) => {
      const cur = latest.current;
      const next = cur.some((x) => x.id === m.id)
        ? cur.map((x) => (x.id === m.id ? m : x))
        : [...cur, m];
      persist(next);
    },
    [persist],
  );

  const remove = React.useCallback(
    (id: string) => {
      persist(latest.current.filter((x) => x.id !== id));
    },
    [persist],
  );

  return { mosaics, ready, upsert, remove };
}
