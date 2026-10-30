/**
 * #6 — Nível de DETALHE das seções de um Document (apresentação /briefings).
 *
 * Os modos "Resumo / Operacional / Completo" são DEGRAUS de detalhe (progressive
 * disclosure): cada modo mostra as seções do seu nível para BAIXO. Antes o filtro
 * olhava só `kind` narrative/markdown — com seções de WIDGET (T3-E) escondia tudo
 * ("Sem seções neste modo"). Agora classifica TODA seção (incl. widget) por nível:
 *   1 Resumo      — narrativas + indicadores-chave (callout, KPI, status, citação)
 *   2 Operacional — + texto, tabelas, listas, checklist, timeline (para trabalhar)
 *   3 Completo    — + gráficos, mapas, rede, figuras, heatmap (tudo)
 */
import type { NotepadSection } from '@/lib/api';

export type BriefingMode = 'resumo' | 'operacional' | 'analitico';
export const BRIEFING_MODES: BriefingMode[] = ['resumo', 'operacional', 'analitico'];

export type DetailLevel = 1 | 2 | 3;

// Widgets de ALTO NÍVEL (degrau 1): indicador/destaque que cabe num resumo.
const RESUMO_WIDGETS = new Set([
  'callout',
  'quote',
  'metric_card',
  'counter',
  'status_pill',
  'divider',
  'heading',
  'security.kpi_card',
  'security.home.kpi_card',
]);

// Widgets de TRABALHO (degrau 2): texto, tabela, lista — detalhe operacional.
const OPERACIONAL_WIDGETS = new Set([
  'markdown',
  'markdown_v2',
  'code_block',
  'checklist',
  'timeline',
  'object_table',
  'object_table_v2',
  'pivot_table',
  'property_list',
  'object_list',
  'object_view',
  'object_card',
  'relation_list',
]);

/** Nível de detalhe de uma seção (1 resumo · 2 operacional · 3 completo). */
export function sectionLevel(s: NotepadSection): DetailLevel {
  const kind = String(s.kind || 'markdown');
  if (kind === 'narrative') return 1;
  if (kind === 'markdown') return 2;
  if (kind === 'widget') {
    const w = String(s.widget || '');
    if (RESUMO_WIDGETS.has(w)) return 1;
    if (OPERACIONAL_WIDGETS.has(w)) return 2;
    return 3; // gráficos/mapas/rede/figura/heatmap… = só no Completo
  }
  // embed / object_set / aggregation (kinds legados) = detalhe operacional
  return 2;
}

export const MODE_MAX_LEVEL: Record<BriefingMode, DetailLevel> = {
  resumo: 1,
  operacional: 2,
  analitico: 3,
};

/** Seções visíveis num modo: as do seu nível PARA BAIXO (cumulativo). */
export function visibleSections(sections: NotepadSection[], modo: BriefingMode): NotepadSection[] {
  const max = MODE_MAX_LEVEL[modo];
  return sections.filter((s) => sectionLevel(s) <= max);
}

/** Quantas seções cada modo revela (para o seletor mostrar o efeito do degrau). */
export function modeCounts(sections: NotepadSection[]): Record<BriefingMode, number> {
  return {
    resumo: visibleSections(sections, 'resumo').length,
    operacional: visibleSections(sections, 'operacional').length,
    analitico: visibleSections(sections, 'analitico').length,
  };
}
