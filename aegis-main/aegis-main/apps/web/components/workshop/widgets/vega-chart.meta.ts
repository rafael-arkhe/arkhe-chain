/**
 * Meta ESTÁTICA do widget `vega_chart` — extraída de `vega-chart.tsx`.
 *
 * PERF #5 (2026-06-28): o barrel `widgets/index.ts` registra o widget pela
 * via LAZY (`vega-chart.lazy.tsx`) sem importar o componente estaticamente.
 * Esta meta é LEVE (apenas dados: label/icon/config_schema/mockConfig) e NÃO
 * puxa o componente nem o bundle pesado do Vega (`vega-embed` → `vega-canvas`)
 * pro grafo eager da Home. Assim a paleta lista o widget normalmente, mas o
 * código do Vega só baixa/compila quando um `vega_chart` de fato renderiza.
 */
import type { WidgetMeta } from '../WorkshopV2Renderer';

/** Spec de exemplo pra paleta — objeto JSON puro, NÃO referencia o vega. */
const MOCK_SPEC = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'Vendas por categoria',
  mark: 'bar',
  encoding: {
    x: { field: 'categoria', type: 'nominal' },
    y: { field: 'valor', type: 'quantitative' },
  },
  data: {
    values: [
      { categoria: 'A', valor: 28 },
      { categoria: 'B', valor: 55 },
      { categoria: 'C', valor: 43 },
      { categoria: 'D', valor: 91 },
      { categoria: 'E', valor: 81 },
    ],
  },
};

export const VEGA_META: Partial<WidgetMeta> = {
  group: 'data',
  label: 'Gráfico Vega',
  description:
    'Renderiza um gráfico declarativo a partir de uma especificação Vega-Lite. Aceita dados embutidos ou vindos de variável.',
  icon: 'bar-chart-3',
  defaultColSpan: 8,
  mockConfig: {
    title: 'Vendas por categoria',
    spec: MOCK_SPEC,
    height: 220,
  },
  mockVariables: {},
  previewWidth: 460,
  previewHeight: 280,
  config_schema: [
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho acima do gráfico.',
      field: 'string',
      placeholder: 'ex.: Vendas por categoria',
    },
    {
      name: 'preset',
      label: 'Tipo de gráfico',
      description: 'Escolha o tipo; o gráfico é montado a partir dos campos abaixo (sem escrever JSON).',
      field: 'select',
      default: 'bar',
      options: [
        { value: 'bar', label: 'Barras' },
        { value: 'line', label: 'Linha' },
        { value: 'area', label: 'Área' },
        { value: 'scatter', label: 'Dispersão (correlação)' },
        { value: 'pie', label: 'Pizza' },
        { value: 'donut', label: 'Rosca' },
        { value: 'heatmap', label: 'Mapa de calor (2 dimensões)' },
        { value: 'advanced', label: 'Avançado (Vega-Lite manual)' },
      ],
    },
    {
      name: 'source',
      label: 'Lista de dados',
      description: 'external_id de uma variável array (linhas de dados do gráfico).',
      field: 'variable-ref',
    },
    {
      name: 'x_field',
      label: 'Campo do eixo X / categoria',
      description: 'Coluna dos dados pro eixo X (ou a categoria da pizza/heatmap).',
      field: 'string',
      placeholder: 'ex.: bairro',
    },
    {
      name: 'y_field',
      label: 'Campo da medida (Y)',
      description: 'Coluna numérica. Vazio = contagem de linhas.',
      field: 'string',
      placeholder: 'ex.: valor',
    },
    {
      name: 'color_field',
      label: 'Campo de cor / 2ª dimensão',
      description: 'Série por cor; no heatmap é a 2ª dimensão (eixo Y da matriz).',
      field: 'string',
      placeholder: 'ex.: tipo',
    },
    {
      name: 'aggregate',
      label: 'Agregação da medida',
      field: 'select',
      default: 'none',
      options: [
        { value: 'none', label: 'Nenhuma (valor bruto)' },
        { value: 'count', label: 'Contagem' },
        { value: 'sum', label: 'Soma' },
        { value: 'mean', label: 'Média' },
      ],
    },
    {
      name: 'spec',
      label: 'Vega-Lite (JSON) — só no modo Avançado',
      description:
        'Usado apenas quando o tipo é "Avançado". Objeto Vega-Lite com mark/encoding.',
      field: 'string',
      placeholder: '{"mark":"arc","encoding":{...}}',
    },
    {
      name: 'height',
      label: 'Altura (px)',
      field: 'number',
      min: 80,
      max: 1200,
      step: 20,
      default: 240,
      unit: 'px',
    },
  ],
};
