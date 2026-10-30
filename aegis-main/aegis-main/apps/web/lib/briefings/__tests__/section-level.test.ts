/**
 * #6 — degrau de detalhe das seções (Resumo/Operacional/Completo). O BUG: o
 * filtro antigo (kind narrative/markdown) escondia as seções de WIDGET; agora
 * cada modo é cumulativo por nível e as seções de widget aparecem no degrau certo.
 */
import {
  sectionLevel,
  visibleSections,
  modeCounts,
} from '@/lib/briefings/section-level';
import type { NotepadSection } from '@/lib/api';

const narr: NotepadSection = { id: 'n', kind: 'narrative', generated: { body: 'x' } };
const md: NotepadSection = { id: 'm', kind: 'markdown', body: 't' };
const kpi: NotepadSection = { id: 'k', kind: 'widget', widget: 'metric_card' };
const table: NotepadSection = { id: 't', kind: 'widget', widget: 'object_table_v2' };
const chart: NotepadSection = { id: 'c', kind: 'widget', widget: 'chart_xy' };
const map: NotepadSection = { id: 'p', kind: 'widget', widget: 'map_live' };

describe('sectionLevel', () => {
  it('narrativa = 1 (resumo); markdown = 2 (operacional)', () => {
    expect(sectionLevel(narr)).toBe(1);
    expect(sectionLevel(md)).toBe(2);
  });
  it('widget de indicador (callout/KPI/status) = 1', () => {
    expect(sectionLevel(kpi)).toBe(1);
    expect(sectionLevel({ id: 'a', kind: 'widget', widget: 'callout' })).toBe(1);
    expect(sectionLevel({ id: 's', kind: 'widget', widget: 'status_pill' })).toBe(1);
  });
  it('widget de trabalho (tabela/lista/checklist/timeline) = 2', () => {
    expect(sectionLevel(table)).toBe(2);
    expect(sectionLevel({ id: 'l', kind: 'widget', widget: 'property_list' })).toBe(2);
    expect(sectionLevel({ id: 'cl', kind: 'widget', widget: 'checklist' })).toBe(2);
  });
  it('widget de viz (gráfico/mapa/rede/figura) = 3 (só no Completo)', () => {
    expect(sectionLevel(chart)).toBe(3);
    expect(sectionLevel(map)).toBe(3);
    expect(sectionLevel({ id: 'f', kind: 'widget', widget: 'figure' })).toBe(3);
    expect(sectionLevel({ id: 'h', kind: 'widget', widget: 'network_graph' })).toBe(3);
  });
  it('kinds legados (embed/object_set) = 2', () => {
    expect(sectionLevel({ id: 'e', kind: 'embed', node_id: 'x' })).toBe(2);
    expect(sectionLevel({ id: 'o', kind: 'object_set' })).toBe(2);
  });
});

describe('visibleSections — cumulativo por degrau (corrige o bug do widget escondido)', () => {
  const all = [narr, md, kpi, table, chart, map];

  it('resumo = só nível 1 (narrativa + KPI)', () => {
    expect(visibleSections(all, 'resumo').map((s) => s.id)).toEqual(['n', 'k']);
  });
  it('operacional = nível 1+2 (+ markdown + tabela)', () => {
    expect(visibleSections(all, 'operacional').map((s) => s.id)).toEqual(['n', 'm', 'k', 't']);
  });
  it('completo = tudo (incl. gráfico + mapa)', () => {
    expect(visibleSections(all, 'analitico').map((s) => s.id)).toEqual([
      'n', 'm', 'k', 't', 'c', 'p',
    ]);
  });
  it('um doc SÓ de widgets de viz NÃO some no Resumo: Completo mostra, Resumo vazio (com saída)', () => {
    const vizOnly = [chart, map];
    expect(visibleSections(vizOnly, 'resumo')).toHaveLength(0);
    expect(visibleSections(vizOnly, 'analitico')).toHaveLength(2);
  });
});

describe('modeCounts', () => {
  it('conta por degrau (cumulativo)', () => {
    expect(modeCounts([narr, md, kpi, table, chart, map])).toEqual({
      resumo: 2,
      operacional: 4,
      analitico: 6,
    });
  });
});
