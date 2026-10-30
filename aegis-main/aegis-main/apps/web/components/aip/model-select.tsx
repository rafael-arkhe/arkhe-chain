'use client';

/**
 * ModelSelect — seletor de modelo DETALHADO para escolher sem sair da tela:
 *   linha 1: NOME — codinome AIP para TODO modelo (abertos E proprietários
 *            ocidentais), nunca o nome de vendor cru nem o slug
 *   linha 2: tipo de nuvem (AIP Cloud / Nuvem externa) + capacidades em pt-BR
 *   à direita: contexto + preço em R$
 *   agrupado por tier (Rápido / Equilibrado / Avançado)
 * Sem markup. Reusado pelos cards de modelo padrão por finalidade.
 *
 * GAP H — este é um seletor OPERADOR. Todo modelo é exibido por codinome AIP
 * (igual aos soberanos); a marca real só aparece no CATÁLOGO ADMIN
 * (components/dados/modelos-workspace). aipModelLabel cobre desconhecidos via
 * FALLBACK_CODENAMES, então o vendor cru nunca chega à tela do operador.
 */
import * as React from 'react';

import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import { useT } from '@/lib/i18n/provider';
import { aipModelLabel, isAipCloudModel } from '@/lib/aip/modelLabels';
import { formatContextWindow } from '@/lib/aip/modelMeta';
import type { AipCatalogModel } from '@/lib/api';

const CAP_KEYS: Record<string, string> = {
  reasoning: 'aip.cap.reasoning',
  vision: 'aip.cap.vision',
  structured_outputs: 'aip.cap.structured_outputs',
  tool_use: 'aip.cap.tool_use',
  audio: 'aip.cap.audio',
  long_context: 'aip.cap.long_context',
};

const brl = (n: number): string =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

// Nome exibido (seletor OPERADOR): SEMPRE o codinome AIP — abertos e
// proprietários ocidentais. Nunca o nome de vendor (display_name) nem o slug.
// aipModelLabel só retorna vazio p/ serviço interno → fallback p/ label/id.
function modelTitle(m: AipCatalogModel): string {
  return aipModelLabel(m.id) || m.label || m.id;
}

export function ModelSelect({
  models,
  value,
  onPick,
  currentSlug,
  testId,
  disabled,
  purpose,
}: {
  models: AipCatalogModel[];
  /** Catalog id selecionado (m.id). */
  value: string;
  onPick: (m: AipCatalogModel) => void;
  /** Slug do default atual (p/ exibir o nome quando não está no value). */
  currentSlug?: string | null;
  testId?: string;
  disabled?: boolean;
  /** Finalidade — "embedding" mostra SÓ modelos de embedding; o resto, só LLMs. */
  purpose?: string;
}) {
  const t = useT();
  // Embeddings ≠ LLM de chat: nunca misturar (LLM como embedding quebra a busca).
  // Soberanos (AIP Cloud) primeiro nas opções; externos depois.
  const filtered = React.useMemo(() => {
    const isEmb = (m: AipCatalogModel) => m.capabilities.includes('embedding');
    const base = purpose === 'embedding' ? models.filter(isEmb) : models.filter((m) => !isEmb(m));
    return [...base].sort(
      (a, b) =>
        (isAipCloudModel(a.id, a.source) ? 0 : 1) - (isAipCloudModel(b.id, b.source) ? 0 : 1),
    );
  }, [models, purpose]);
  const options: SelectOption[] = React.useMemo(
    () =>
      filtered.map((m) => {
        const aipCloud = isAipCloudModel(m.id, m.source);
        const ctx = formatContextWindow(m.context_window);
        const price = m.pricing ? brl(m.pricing.input_brl_mtok) : null;
        const hint = [ctx ? `${ctx} mil` : null, price ? `${price}/Mtok` : null]
          .filter(Boolean)
          .join(' · ');
        // 2ª linha = capacidades reais do modelo (particular de cada um), não um
        // rótulo genérico repetido. Agrupado por NUVEM (AIP Cloud / externa).
        const caps = m.capabilities
          .map((c) => (CAP_KEYS[c] ? t(CAP_KEYS[c] as Parameters<typeof t>[0]) : null))
          .filter(Boolean)
          .join(', ');
        return {
          value: m.id,
          label: modelTitle(m),
          group: aipCloud ? t('cloud.aip') : t('cloud.external'),
          sublabel: caps || undefined,
          hint: hint || undefined,
        };
      }),
    [filtered, t],
  );

  // Nome do default atual (codinome AIP ou nome original) p/ o placeholder.
  const currentModel = currentSlug
    ? filtered.find((m) => (m.model_slug || m.id) === currentSlug)
    : null;
  const placeholder = currentModel
    ? modelTitle(currentModel)
    : currentSlug
      ? aipModelLabel(currentSlug) || t('modelDefaults.choose')
      : t('modelDefaults.choose');

  return (
    <SearchableSelect
      value={value}
      onChange={(v) => {
        const m = filtered.find((x) => x.id === v);
        if (m) onPick(m);
      }}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={t('modelDefaults.search')}
      disabled={disabled}
      data-testid={testId}
    />
  );
}
