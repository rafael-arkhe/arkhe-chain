'use client';

/**
 * Ações do TIPO da ficha (P5 — multidomínio).
 *
 * Fonte única das ações exibidas/executáveis na /ficha: o contrato do Object
 * Type (`objectTypeSchema.actions`). Genérico — vale pra QUALQUER tipo (carro,
 * país, empresa, evento, operação, conector...). Zero hardcode por vertical.
 *
 * Resolução da lista (sem novo endpoint):
 *   1. `type_def` já injetado pelo shell (objeto canônico) → usa direto.
 *   2. senão, busca `Ontology.objectTypeSchema(entityType)` (caminho Entity).
 * Os dois compartilham o MESMO contrato — a ficha de pessoa (Entity) e a ficha
 * de objeto canônico (OntologyNode) surfaceiam ações pelo mesmo trilho.
 */
import * as React from 'react';
import { Ontology, type ObjectTypeSchema, type ObjectTypeAction } from '@/lib/api';

export function useTypeActions(
  typeDef: ObjectTypeSchema | null | undefined,
  entityType: string | null | undefined,
): { actions: ObjectTypeAction[]; loading: boolean; error: string | null } {
  // Contrato já injetado (canônico) → usa direto, sem fetch (ref estável).
  const inline = Array.isArray(typeDef?.actions) ? typeDef!.actions : null;

  const [fetched, setFetched] = React.useState<ObjectTypeAction[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (inline) {
      setFetched(null);
      return;
    }
    if (!entityType) {
      setFetched([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const schema = await Ontology.objectTypeSchema(entityType);
        if (!cancelled) {
          setFetched(Array.isArray(schema?.actions) ? schema.actions : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setFetched([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inline, entityType]);

  return { actions: inline ?? fetched ?? [], loading, error };
}

/** Converte o valor cru do input pro tipo declarado do parâmetro da ação. */
export function coerceActionParam(type: string, raw: string): unknown {
  if (raw === '') return undefined;
  const t = (type || '').toLowerCase();
  if (t === 'number' || t === 'integer' || t === 'int' || t === 'float' || t === 'double') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (t === 'boolean' || t === 'bool') return raw === 'true';
  return raw;
}

/** Evento decoupled toolbar→shell: troca a aba ativa da ficha. */
export const FICHA_GOTO_TAB_EVENT = 'ficha:goto-tab';

export function gotoFichaTab(tab: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FICHA_GOTO_TAB_EVENT, { detail: { tab } }));
}

/** Ação operável guarda apenas o NOME no contrato; o execute precisa do id da
 *  ActionType. Resolve via catálogo (ActionTypes.list) — sem novo endpoint. */
export type ActionCatalog = Record<string, string>;
