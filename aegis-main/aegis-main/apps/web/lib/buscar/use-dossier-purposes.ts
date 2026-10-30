'use client';

/**
 * useDossierPurposes — resolve as finalidades de acesso (LGPD) do gesto "Montar dossiê".
 *
 * Fonte CONFIGURÁVEL (multi-domínio): a WorkshopVariable static `dossier_purposes` de um
 * WorkshopApp com external_id `security.buscar-config`, resolvido server > local > fallback
 * via useResolvedApp. O admin cria esse app + a variável no editor visual de variáveis
 * (VariablesPanel) para customizar a lista por domínio/tenant — sem tocar código.
 *
 * Sem config → cai no default NEUTRO (bases legais da LGPD, ACCESS_PURPOSE_DEFS), com
 * rótulos via i18n. NUNCA strings de vertical no core.
 */
import * as React from 'react';

import { useResolvedApp } from '@/lib/workshop/runtime';
import type { WorkshopApp } from '@/lib/workshop/types';
import { useT } from '@/lib/i18n/provider';
import {
  ACCESS_PURPOSE_DEFS,
  BUSCAR_CONFIG_SLUG,
  DOSSIER_PURPOSES_VAR,
  coercePurposes,
  type AccessPurpose,
} from './access-purposes';

const FALLBACK_APP: WorkshopApp = {
  id: 'seed.security.buscar-config',
  external_id: BUSCAR_CONFIG_SLUG,
  display: 'Configuração da Busca',
  description: 'Finalidades de acesso (LGPD) configuráveis do /buscar — multi-domínio.',
  schema_version: 2,
  variables: [
    {
      id: 'var.dossier_purposes',
      external_id: DOSSIER_PURPOSES_VAR,
      type: 'Json',
      kind: 'static',
      recompute_mode: 'event_only',
      default: [], // vazio → o hook usa o default NEUTRO (bases LGPD) traduzido
    },
  ],
  layout: { columns: 20, root: [] },
};

export function useDossierPurposes(): AccessPurpose[] {
  const t = useT();
  const { app } = useResolvedApp(FALLBACK_APP);
  return React.useMemo(() => {
    const v = app.variables?.find((x) => x.external_id === DOSSIER_PURPOSES_VAR);
    const specValue = (v?.spec as { value?: unknown } | undefined)?.value;
    const configured = coercePurposes(v?.default ?? specValue);
    if (configured.length) return configured;
    // default NEUTRO (bases LGPD), rótulos localizados
    return ACCESS_PURPOSE_DEFS.map((d) => ({ value: d.value, label: t(d.labelKey) }));
  }, [app, t]);
}
