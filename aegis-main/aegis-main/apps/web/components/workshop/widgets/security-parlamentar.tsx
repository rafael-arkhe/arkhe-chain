'use client';

/**
 * Registro Workshop dos widgets de PARLAMENTAR — wrappers que leem
 * `variables.properties` (injetada pelo `/ficha/{id}` no contexto) e
 * passam pro componente da pasta `components/ficha/widgets-parlamentar`.
 *
 * Cada widget declara `fichaTab="parlamentar"` pra agrupar todos numa
 * nova aba dedicada quando renderizado pelo FichaWorkshopShell.
 */
import { registerWidget } from '@/components/workshop/WorkshopV2Renderer';
import {
  WidgetMandato,
  WidgetResumo360,
  WidgetMidia,
  WidgetDocumentosCEAP,
  WidgetCitacoes,
  WidgetCorrelacoes,
  WidgetHistoricoLegislativo,
  WidgetRedesSociais,
  WidgetIntegridade,
  WidgetCronologiaIntegrada,
  WidgetTopFornecedores,
  WidgetVideosYoutube,
} from '@/components/ficha/widgets-parlamentar';

import * as React from 'react';

// ── Mock fixtures (preview no editor / paleta) ────────────────────────
const MOCK_PARLAMENTAR_PROPS: Record<string, unknown> = {
  text:
    'Deputado eleito em 2022 pela Bahia (PT), atua na CCJ e na Comissão de Direitos Humanos. ' +
    'Em 2025 protocolou 18 PLs sobre segurança pública e mineração. ' +
    'Voto alinhado em 87% com a liderança do partido.',
  tokens_input: '1240',
  tokens_output: '320',
  inference_log_id: 'inf_mock_91',
  correlations: {
    lookup_camara: {
      hits: 1,
      head: {
        nome: 'Ana Carolina Mendes',
        partido: 'PT',
        uf: 'BA',
        email: 'ana.mendes@camara.leg.br',
        foto: 'https://www.camara.leg.br/internet/deputado/bandep/sem-foto.png',
        gabinete: 'Anexo IV · sala 408',
      },
    },
    gdelt_doc_search: { hits: 24 },
    tavily_news: { hits: 11 },
    bluesky_actor_profile: { hits: 1 },
    reddit_search: { hits: 6, error: null },
  },
  media: [
    { kind: 'youtube', title: 'Pronunciamento CCJ · 14/03', thumb: '', url: '#' },
    { kind: 'noticia', title: 'Folha · Mendes critica corte de verba', thumb: '', url: '#' },
    { kind: 'noticia', title: 'G1 · Comissão aprova relatório', thumb: '', url: '#' },
  ],
  documents: [
    { data: '2026-04-12', fornecedor: 'TAM Linhas Aéreas', valor: 4820.5, categoria: 'Passagens aéreas', url: '#' },
    { data: '2026-04-03', fornecedor: 'Posto Shell Brasília', valor: 312.0, categoria: 'Combustível', url: '#' },
    { data: '2026-03-28', fornecedor: 'Hotel Nacional Inn', valor: 1280.0, categoria: 'Hospedagem', url: '#' },
  ],
  citations: [
    { source: 'GDELT', title: 'Mendes defende reforma tributária', url: '#', date: '2026-05-10' },
    { source: 'Bluesky', title: '@anamendesbr · 1.2k seguidores', url: '#', date: '2026-05-19' },
  ],
};

type RendererProps = { variables?: Record<string, unknown> };
type WidgetWithProps = (props: { properties?: Record<string, unknown> }) => React.ReactElement;

function readProperties(variables: Record<string, unknown> | undefined) {
  const p = variables?.properties;
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : undefined;
}

function makeWrapper(Component: WidgetWithProps) {
  return function Wrapper({ variables }: RendererProps) {
    return <Component properties={readProperties(variables)} />;
  };
}

registerWidget('security.ficha.mandato', makeWrapper(WidgetMandato), {
  group: 'parlamentar',
  label: 'Parlamentar · mandato',
  description: 'Cabeçalho do parlamentar: foto, partido, UF, e-mail e gabinete (fonte: Câmara dos Deputados).',
  icon: 'user',
  defaultColSpan: 20,
  fichaTab: 'parlamentar',
  mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
});

registerWidget('security.ficha.resumo360', makeWrapper(WidgetResumo360), {
  group: 'parlamentar',
  label: 'Parlamentar · resumo 360°',
  description: 'Resumo executivo de 360° gerado por LLM, com link pro inference log auditável.',
  icon: 'scroll',
  defaultColSpan: 20,
  fichaTab: 'parlamentar',
  mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
});

registerWidget('security.ficha.midia', makeWrapper(WidgetMidia), {
  group: 'parlamentar',
  label: 'Parlamentar · grid de mídia',
  description: 'Grid de thumbnails mesclando vídeos do YouTube, manchetes e imagens.',
  icon: 'image',
  defaultColSpan: 20,
  fichaTab: 'parlamentar',
  mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
});

registerWidget('security.ficha.documentos_ceap', makeWrapper(WidgetDocumentosCEAP), {
  group: 'parlamentar',
  label: 'Parlamentar · cota CEAP',
  description: 'Despesas da cota parlamentar com fornecedor, categoria, valor e link pros PDFs originais.',
  icon: 'file-text',
  defaultColSpan: 20,
  fichaTab: 'parlamentar',
  mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
});

registerWidget('security.ficha.citacoes', makeWrapper(WidgetCitacoes), {
  group: 'parlamentar',
  label: 'Parlamentar · citações externas',
  description: 'Links pra menções em notícias e redes (GDELT, Tavily, Bluesky, Reddit).',
  icon: 'link',
  defaultColSpan: 10,
  fichaTab: 'parlamentar',
  mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
});

registerWidget('security.ficha.correlacoes', makeWrapper(WidgetCorrelacoes), {
  group: 'parlamentar',
  label: 'Parlamentar · correlações de adapters',
  description: 'Status de cada coletor MCP utilizado, com contagem de hits e erros — útil pra diagnóstico.',
  icon: 'table',
  defaultColSpan: 10,
  fichaTab: 'parlamentar',
  mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
});

registerWidget(
  'security.ficha.historico_legislativo',
  makeWrapper(WidgetHistoricoLegislativo),
  {
    group: 'parlamentar',
    label: 'Parlamentar · atividade na Câmara',
    description: 'Counters de proposições, votações, eventos de agenda e despesas mensais.',
    icon: 'gavel',
    defaultColSpan: 10,
    fichaTab: 'parlamentar',
    mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
  },
);

registerWidget('security.ficha.redes_sociais', makeWrapper(WidgetRedesSociais), {
  group: 'parlamentar',
  label: 'Parlamentar · redes sociais',
  description: 'Contagens de YouTube, Bluesky e Reddit com link pro perfil oficial em cada rede.',
  icon: 'link',
  defaultColSpan: 10,
  fichaTab: 'parlamentar',
  mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
});

registerWidget('security.ficha.integridade', makeWrapper(WidgetIntegridade), {
  group: 'parlamentar',
  label: 'Parlamentar · integridade',
  description: 'Resultados de OpenSanctions, ICIJ Leaks e fact-check pra avaliação de risco reputacional.',
  icon: 'shield',
  defaultColSpan: 10,
  fichaTab: 'parlamentar',
  mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
});

registerWidget(
  'security.ficha.cronologia_integrada',
  makeWrapper(WidgetCronologiaIntegrada),
  {
    group: 'parlamentar',
    label: 'Parlamentar · cronologia integrada',
    description: 'Linha do tempo unificada: eventos legislativos, despesas CEAP e posts em redes mesclados por data.',
    icon: 'scroll',
    defaultColSpan: 20,
    fichaTab: 'parlamentar',
    mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
  },
);

registerWidget(
  'security.ficha.top_fornecedores',
  makeWrapper(WidgetTopFornecedores),
  {
    group: 'parlamentar',
    label: 'Parlamentar · top fornecedores CEAP',
    description: 'Ranking dos maiores fornecedores em valor da cota parlamentar, com barra proporcional.',
    icon: 'chart-bar',
    defaultColSpan: 10,
    fichaTab: 'parlamentar',
    mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
  },
);

registerWidget(
  'security.ficha.videos_youtube',
  makeWrapper(WidgetVideosYoutube),
  {
    group: 'parlamentar',
    label: 'Parlamentar · vídeos YouTube',
    description: 'Grid de thumbnails de vídeos do parlamentar com player embedado em modal ao clicar.',
    icon: 'image',
    defaultColSpan: 20,
    fichaTab: 'parlamentar',
    mockVariables: { properties: MOCK_PARLAMENTAR_PROPS },
  },
);
