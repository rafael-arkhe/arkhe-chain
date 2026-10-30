'use client';

/**
 * Globo (3D) — V2 visão→georref→mapa. Widget IRMÃO do map_live: MESMO contrato
 * (object set via variável → 1 ponto por instância; geopoint lido de
 * `properties`), MESMO evento (`select_change` → o app abre o overlay de
 * edição). Renderer alternativo Cesium — alternar Mapbox↔Cesium é trocar o
 * widget no Workshop, não os dados. Genérico desde a 1ª linha (multidomínio).
 */
import * as React from 'react';
import dynamic from 'next/dynamic';

import { registerWidget, type WidgetRenderProps } from '@/components/workshop/WorkshopV2Renderer';
import type { GlobeLine, GlobePoint } from '@/components/geo/cesium-points';
import {
  ColorLegend,
  colorizeMarkers,
  deriveCenter,
  readArray,
  relationRoutes,
  rowsById,
  toMarkers,
  useRelationEdges,
} from './map-live';
import { useT } from '@/lib/i18n/provider';

function GlobeLoading() {
  const t = useT();
  return (
    <div data-testid="globe-loading" className="absolute inset-0 flex items-center justify-center bg-[#0a0e14] text-[11px] text-muted-on-light">
      {t('globe.loading')}
    </div>
  );
}

type Cfg = {
  source?: string;
  title?: string;
  height?: number;
  followObjectSet?: boolean;
  /** F3: agregação (clustering) no globo. */
  cluster?: boolean;
  /** Relações§ (MESMO contrato do map_live): arestas batched entre as
   *  instâncias do set → linhas discretas. Default false (retrocompat). */
  show_relations?: boolean;
  /** Relações§: CSV opcional de relation_type pra filtrar. */
  relation_types?: string;
  /** Cor-por-propriedade§: propriedade escalar do set → cor dos pontos. */
  color_by?: string;
};

// Cesium é client-only e pesado → dynamic import (mesma estratégia do mini-map).
const CesiumPoints = dynamic(
  () => import('@/components/geo/cesium-points').then((m) => m.CesiumPoints),
  { ssr: false, loading: () => <GlobeLoading /> },
);

/** Label curto e limpo a partir do popup rico do marker (sem HTML). */
function labelFromPopup(popupHtml?: string): string | undefined {
  return typeof popupHtml === 'string'
    ? popupHtml.replace(/<[^>]+>/g, ' ').trim().split('\n')[0].slice(0, 40) || undefined
    : undefined;
}

/** Pontos do globo a partir do object set — reusa toMarkers (mesma derivação
 *  do map_live, incl. geopoint dentro de properties). */
export function toGlobePoints(variables: Record<string, unknown>, cfg: Cfg): GlobePoint[] {
  return toMarkers(variables, { source: cfg.source }).map((m) => ({
    id: m.id, lat: m.lat, lng: m.lng, color: m.color,
    label: labelFromPopup(m.popupHtml),
  }));
}

function GlobeLive({ config, variables, emit }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as Cfg;
  const rows = rowsById(variables, { source: cfg.source });
  // MESMOS helpers do map_live: markers base → cor-por-propriedade → pontos.
  const baseMarkers = toMarkers(variables, { source: cfg.source });
  const { markers, legend } = colorizeMarkers(baseMarkers, rows, cfg.color_by);
  const points: GlobePoint[] = markers.map((m) => ({
    id: m.id, lat: m.lat, lng: m.lng, color: m.color,
    label: labelFromPopup(m.popupHtml),
  }));
  // Relações§: arestas batched → linhas discretas (par 3D do map_live).
  const relEdges = useRelationEdges(cfg.show_relations, cfg.relation_types, baseMarkers);
  const lines: GlobeLine[] = relationRoutes(relEdges, baseMarkers, cfg.relation_types).map(
    (r) => ({ id: r.id, path: r.path, color: r.color, label: r.label }),
  );
  const height = cfg.height ?? 460;
  const onPointClick = React.useCallback(
    // guarda: linhas de relação também são "pickáveis" no Cesium — só
    // instância real (presente em rows) emite seleção.
    (id: string) => { if (rows[id]) emit?.('select_change', { selected: rows[id], selected_id: id }); },
    [emit, rows],
  );
  // mantém deriveCenter no caminho (paridade de helpers com map_live + evita
  // import órfão); o enquadramento real é do followPoints no componente.
  void deriveCenter; void readArray;

  return (
    <div className="bg-white border border-border-light p-3 flex flex-col gap-2" data-testid="globe-live-widget">
      {cfg.title && (
        <p className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">{cfg.title}</p>
      )}
      <div className="relative border border-border-light overflow-hidden" style={{ height }} data-testid="globe-live-canvas">
        <CesiumPoints
          /* F3: remonta ao trocar cluster (setup do clustering é no init). */
          key={`globe-${cfg.cluster ? 'cluster' : 'plain'}`}
          className="absolute inset-0"
          points={points}
          lines={lines}
          cluster={cfg.cluster ?? false}
          followPoints={cfg.followObjectSet !== false}
          onPointClick={emit ? onPointClick : undefined}
        />
      </div>
      {cfg.color_by && (
        <ColorLegend name={cfg.color_by} legend={legend} testId="globe-live-legend" />
      )}
      <p data-testid="globe-live-count" className="text-[10px] font-mono text-muted-on-light">
        {t(points.length === 1 ? 'globe.countOne' : 'globe.countMany').replace('{n}', String(points.length))}
      </p>
    </div>
  );
}

registerWidget('globe_live', GlobeLive, {
  group: 'viz',
  label: 'Globo (3D)',
  description: 'Globo Cesium ligado a um object set — 1 ponto por instância (lat/lng), clicável. Par 3D do Mapa (tempo real).',
  icon: 'globe',
  defaultColSpan: 12,
  previewHeight: 360,
  mockConfig: {
    source: 'pontos', title: 'Ativos no globo', height: 360, followObjectSet: true,
    show_relations: true, color_by: 'status',
  },
  // Relações§: 2 instâncias canônicas relacionáveis (mesmo shape do map_live).
  mockVariables: {
    pontos: [
      { id: 'a', name: 'Ativo 01', lat: -23.561, lng: -46.656,
        properties: { status: 'ativo', setor: 'Norte' } },
      { id: 'b', name: 'Ativo 02', lat: -23.557, lng: -46.659,
        properties: { status: 'manutencao', setor: 'Sul' } },
    ],
  },
  config_schema: [
    { name: 'source', label: 'Pontos (object set)', description: 'Variable com objetos contendo lat/lng (ou geopoint em properties).', field: 'variable-ref' },
    { name: 'title', label: 'Título', field: 'string', placeholder: 'ex.: Ativos no globo' },
    { name: 'height', label: 'Altura', field: 'number', min: 200, max: 800, step: 20, default: 460, unit: 'px' },
    { name: 'followObjectSet', label: 'Enquadrar os objetos', description: 'Centraliza no conjunto automaticamente.', field: 'boolean', default: true },
    { name: 'cluster', label: 'Agrupar pontos (clusters)', description: 'Agrega pontos próximos em bolhas com contagem que se separam ao aproximar. Recomendado p/ muitos pontos.', field: 'boolean', default: false },
    { name: 'show_relations', label: 'Mostrar relações entre os objetos',
      description: 'Desenha linhas discretas entre as instâncias do conjunto que têm relação na ontologia.',
      field: 'boolean', default: false },
    { name: 'relation_types', label: 'Tipos de relação (opcional)',
      description: 'Lista separada por vírgula — vazio mostra todas as relações.',
      field: 'string', placeholder: 'ex.: pertence_a,ligado_a' },
    { name: 'color_by', label: 'Colorir por propriedade',
      description: 'Propriedade escalar do conjunto que define a cor dos pontos (escala sóbria + legenda).',
      field: 'property', typeFrom: 'source' },
  ],
});

export { GlobeLive };
