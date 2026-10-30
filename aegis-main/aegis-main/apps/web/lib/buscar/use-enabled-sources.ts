'use client';

/**
 * useEnabledSources — resolve QUAIS fontes o /buscar oferece neste tenant.
 *
 * Espelha useDossierPurposes: fonte CONFIGURÁVEL (multi-domínio) na MESMA
 * WorkshopVariable static `source_overrides` do WorkshopApp `security.buscar-config`,
 * resolvida server > local > fallback via useResolvedApp (que honra o ORG ATIVO —
 * escopo por tenant vem de graça). O admin/vendor edita essa variável no editor
 * visual de variáveis (VariablesPanel) para esconder/fixar fontes por tenant —
 * sem tocar código.
 *
 * Sem config → default NEUTRO: TODAS as fontes do SOURCE_CATALOG (multidomínio,
 * sem viés de vertical). NUNCA hardcode de quais fontes "pertencem" a um caso de uso.
 */
import * as React from 'react';

import { useResolvedApp } from '@/lib/workshop/runtime';
import type { WorkshopApp } from '@/lib/workshop/types';
import { SOURCE_CATALOG, type SourceDef } from './types';
import { BUSCAR_CONFIG_SLUG } from './access-purposes';
import {
  SOURCE_OVERRIDES_VAR,
  applySourceOverrides,
  coerceSourceOverrides,
  type SourceOverrides,
} from './source-overrides';

const FALLBACK_APP: WorkshopApp = {
  id: 'seed.security.buscar-config',
  external_id: BUSCAR_CONFIG_SLUG,
  display: 'Configuração da Busca',
  description: 'Fontes oferecidas no /buscar — configuráveis por tenant (multi-domínio).',
  schema_version: 2,
  variables: [
    {
      id: 'var.source_overrides',
      external_id: SOURCE_OVERRIDES_VAR,
      type: 'Json',
      kind: 'static',
      recompute_mode: 'event_only',
      label: 'Fontes do /buscar',
      description:
        'Esconde/fixa fontes por tenant. Formato: { "hidden": [chave], "pinned": [chave] }. ' +
        'As chaves são o identificador da fonte (entities, cameras, maigret_username@v1, …). ' +
        'Vazio = todas as fontes.',
      default: {}, // vazio → o hook usa o default NEUTRO (todas as fontes)
    },
  ],
  layout: { columns: 20, root: [] },
};

export interface EnabledSources {
  /** Overrides resolvidos (hidden/pinned/enabled) — já normalizados. */
  overrides: SourceOverrides;
  /** Catálogo OFERECIDO: SOURCE_CATALOG sem as escondidas, com fixadas no topo. */
  catalog: SourceDef[];
}

/**
 * @param baseCatalog catálogo de partida (default SOURCE_CATALOG). Injetável p/ teste.
 */
export function useEnabledSources(
  baseCatalog: SourceDef[] = SOURCE_CATALOG,
): EnabledSources {
  const { app } = useResolvedApp(FALLBACK_APP);
  return React.useMemo(() => {
    const v = app.variables?.find((x) => x.external_id === SOURCE_OVERRIDES_VAR);
    const specValue = (v?.spec as { value?: unknown } | undefined)?.value;
    const overrides = coerceSourceOverrides(v?.default ?? specValue);
    return { overrides, catalog: applySourceOverrides(baseCatalog, overrides) };
  }, [app, baseCatalog]);
}
