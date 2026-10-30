/**
 * map_live/globe_live — RELAÇÕES no mapa + cor-por-propriedade (2026-06-12).
 *
 * Composabilidade: os widgets de mapa ganham config ADITIVA:
 *  - `show_relations` (bool, default false) — resolve as arestas ENTRE as
 *    instâncias do object set carregado (1 chamada batched ao
 *    GET /api/v1/geo/edges) e desenha polylines discretas (cor neutra,
 *    label da relação no hover/popup);
 *  - `relation_types` (CSV opcional) — filtra as relações;
 *  - `color_by` (propriedade escalar, dropdown via field 'property') —
 *    escala sóbria + legenda discreta.
 *
 * Retrocompat: sem as configs novas, NADA muda (sem fetch, cores intactas).
 * O render MapboxGL/Cesium real é certificado no browser; aqui cobrimos a
 * derivação pura + o wiring (render com stubs, mesmo padrão do
 * register-camera-modal.test.tsx).
 */
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api/geo', () => ({
  Geo: { edgesBetween: jest.fn() },
}));
// MapboxMap entra via next/dynamic(ssr:false) — no jest vira stub que grava
// as props (routes/markers) no DOM. Loader inspecionado por toString().
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: unknown) => {
    const React = require('react');
    const isCesium = String(loader).includes('cesium-points');
    if (isCesium) {
      return function MockCesiumPoints(props: {
        points?: unknown[];
        lines?: unknown[];
      }) {
        return React.createElement('div', {
          'data-testid': 'cesium-points',
          'data-points': JSON.stringify(props.points ?? []),
          'data-lines': JSON.stringify(props.lines ?? []),
        });
      };
    }
    return function MockMapboxMap(props: {
      markers?: unknown[];
      routes?: unknown[];
    }) {
      return React.createElement('div', {
        'data-testid': 'mapbox-map',
        'data-markers': JSON.stringify(props.markers ?? []),
        'data-routes': JSON.stringify(props.routes ?? []),
      });
    };
  },
}));

import { Geo } from '@/lib/api/geo';
import { getWidgetMeta } from '@/components/workshop/WorkshopV2Renderer';
import {
  MapLive,
  RELATION_COLOR,
  colorizeMarkers,
  relationRoutes,
  toMarkers,
  type RelationEdge,
} from '@/components/workshop/widgets/map-live';
import { GlobeLive } from '@/components/workshop/widgets/globe-live';

const mockEdges = (Geo as unknown as { edgesBetween: jest.Mock }).edgesBetween;

const widgetProps = {
  appId: 'app-1',
  bindings: {},
  setBinding: () => undefined,
};

/** 4 instâncias em CADEIA (a→b→c→d): set relacionado canônico dos testes. */
const CHAIN_VARS = {
  pontos: [
    { id: 'a', lat: -23.561, lng: -46.656, properties: { status: 'ativo' } },
    { id: 'b', lat: -23.557, lng: -46.659, properties: { status: 'parado' } },
    { id: 'c', lat: -23.553, lng: -46.652, properties: { status: 'ativo' } },
    { id: 'd', lat: -23.549, lng: -46.648, properties: { status: 'parado' } },
  ],
};
const CHAIN_EDGES: RelationEdge[] = [
  { id: 'e1', source_node_id: 'a', target_node_id: 'b', relation_type: 'ligado_a' },
  { id: 'e2', source_node_id: 'b', target_node_id: 'c', relation_type: 'ligado_a' },
  { id: 'e3', source_node_id: 'c', target_node_id: 'd', relation_type: 'pertence_a' },
];

beforeEach(() => {
  mockEdges.mockReset();
  mockEdges.mockResolvedValue({ edges: [] });
});

// ── relationRoutes (derivação pura) ─────────────────────────────────────────

describe('relationRoutes — arestas → polylines', () => {
  const markers = toMarkers(CHAIN_VARS, { source: 'pontos' });

  it('cadeia de N instâncias relacionadas → N-1 linhas com label e cor neutra', () => {
    const routes = relationRoutes(CHAIN_EDGES, markers);
    expect(routes).toHaveLength(3); // N-1 (N=4)
    expect(routes[0]).toMatchObject({
      id: 'rel-e1',
      path: [[-23.561, -46.656], [-23.557, -46.659]],
      color: RELATION_COLOR,
      label: 'ligado_a',
    });
  });

  it('aresta com ponta FORA do set carregado é ignorada', () => {
    const edges: RelationEdge[] = [
      { id: 'e9', source_node_id: 'a', target_node_id: 'zz', relation_type: 'x' },
      ...CHAIN_EDGES,
    ];
    expect(relationRoutes(edges, markers)).toHaveLength(3);
  });

  it('relation_types (CSV) filtra também no cliente', () => {
    const routes = relationRoutes(CHAIN_EDGES, markers, ' pertence_a ');
    expect(routes).toHaveLength(1);
    expect(routes[0].label).toBe('pertence_a');
  });
});

// ── colorizeMarkers (escala sóbria + legenda) ────────────────────────────────

describe('colorizeMarkers — cor-por-propriedade', () => {
  it('categórica: 1 cor estável por valor + legenda', () => {
    const markers = toMarkers(CHAIN_VARS, { source: 'pontos' });
    const rows = Object.fromEntries(CHAIN_VARS.pontos.map((r) => [r.id, r]));
    const { markers: out, legend } = colorizeMarkers(markers, rows, 'status');
    expect(legend.map((l) => l.label).sort()).toEqual(['ativo', 'parado']);
    const byId = Object.fromEntries(out.map((m) => [m.id, m.color]));
    expect(byId.a).toBe(byId.c); // mesmo valor → mesma cor
    expect(byId.a).not.toBe(byId.b); // valores diferentes → cores diferentes
    const legendColors = Object.fromEntries(legend.map((l) => [l.label, l.color]));
    expect(byId.a).toBe(legendColors.ativo);
  });

  it('numérica: escala sequencial (min mais claro, max mais escuro) + legenda de faixas', () => {
    const vars = {
      pts: [
        { id: 'lo', lat: 0, lng: 0, properties: { nivel: 1 } },
        { id: 'mid', lat: 1, lng: 1, properties: { nivel: 5 } },
        { id: 'hi', lat: 2, lng: 2, properties: { nivel: 10 } },
      ],
    };
    const markers = toMarkers(vars, { source: 'pts' });
    const rows = Object.fromEntries(vars.pts.map((r) => [r.id, r]));
    const { markers: out, legend } = colorizeMarkers(markers, rows, 'nivel');
    const byId = Object.fromEntries(out.map((m) => [m.id, m.color]));
    expect(byId.lo).not.toBe(byId.hi);
    expect(legend.length).toBeGreaterThanOrEqual(2);
    // a 1ª faixa da legenda carrega a cor do mínimo; a última a do máximo
    expect(legend[0].color).toBe(byId.lo);
    expect(legend[legend.length - 1].color).toBe(byId.hi);
  });

  it('retrocompat: sem color_by, markers intactos e legenda vazia', () => {
    const markers = toMarkers(CHAIN_VARS, { source: 'pontos' });
    const { markers: out, legend } = colorizeMarkers(
      markers,
      Object.fromEntries(CHAIN_VARS.pontos.map((r) => [r.id, r])),
      undefined,
    );
    expect(out).toBe(markers);
    expect(legend).toEqual([]);
  });

  it('valor ausente/não-escalar não derruba: marker mantém a cor original', () => {
    const vars = {
      pts: [
        { id: 'a', lat: 0, lng: 0, color: '#111111', properties: {} },
        { id: 'b', lat: 1, lng: 1, properties: { status: 'ok' } },
      ],
    };
    const markers = toMarkers(vars, { source: 'pts' });
    const rows = Object.fromEntries(vars.pts.map((r) => [r.id, r]));
    const { markers: out } = colorizeMarkers(markers, rows, 'status');
    expect(out.find((m) => m.id === 'a')?.color).toBe('#111111');
    expect(out.find((m) => m.id === 'b')?.color).toBeTruthy();
  });
});

// ── wiring do MapLive (render com stubs) ─────────────────────────────────────

describe('MapLive — show_relations + color_by no render', () => {
  it('show_relations: 1 chamada batched e N-1 polylines no MapboxMap', async () => {
    mockEdges.mockResolvedValue({ edges: CHAIN_EDGES });
    render(
      <MapLive
        {...widgetProps}
        config={{ source: 'pontos', show_relations: true, relation_types: 'ligado_a,pertence_a' }}
        variables={CHAIN_VARS}
      />,
    );
    await waitFor(() => {
      const routes = JSON.parse(
        screen.getByTestId('mapbox-map').getAttribute('data-routes') || '[]',
      );
      expect(routes).toHaveLength(3);
    });
    expect(mockEdges).toHaveBeenCalledTimes(1);
    expect(mockEdges).toHaveBeenCalledWith(
      ['a', 'b', 'c', 'd'],
      'ligado_a,pertence_a',
    );
  });

  it('retrocompat: sem as configs novas, NENHUM fetch e zero rotas extras', async () => {
    render(
      <MapLive {...widgetProps} config={{ source: 'pontos' }} variables={CHAIN_VARS} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-map')).toBeTruthy();
    });
    expect(mockEdges).not.toHaveBeenCalled();
    const routes = JSON.parse(
      screen.getByTestId('mapbox-map').getAttribute('data-routes') || '[]',
    );
    expect(routes).toHaveLength(0);
    expect(screen.queryByTestId('map-live-legend')).toBeNull();
  });

  it('color_by aplica a escala nos markers e mostra a legenda discreta', async () => {
    render(
      <MapLive
        {...widgetProps}
        config={{ source: 'pontos', color_by: 'status' }}
        variables={CHAIN_VARS}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('map-live-legend')).toBeTruthy();
    });
    const markers = JSON.parse(
      screen.getByTestId('mapbox-map').getAttribute('data-markers') || '[]',
    ) as { id: string; color?: string }[];
    const byId = Object.fromEntries(markers.map((m) => [m.id, m.color]));
    expect(byId.a).toBe(byId.c);
    expect(byId.a).not.toBe(byId.b);
  });
});

// ── wiring do GlobeLive (par 3D, MESMO contrato) ─────────────────────────────

describe('GlobeLive — show_relations + color_by no render', () => {
  it('show_relations desenha N-1 linhas no CesiumPoints', async () => {
    mockEdges.mockResolvedValue({ edges: CHAIN_EDGES });
    render(
      <GlobeLive
        {...widgetProps}
        config={{ source: 'pontos', show_relations: true }}
        variables={CHAIN_VARS}
      />,
    );
    await waitFor(() => {
      const lines = JSON.parse(
        screen.getByTestId('cesium-points').getAttribute('data-lines') || '[]',
      );
      expect(lines).toHaveLength(3);
    });
    expect(mockEdges).toHaveBeenCalledTimes(1);
  });

  it('retrocompat: sem configs novas, sem fetch e sem linhas', async () => {
    render(
      <GlobeLive {...widgetProps} config={{ source: 'pontos' }} variables={CHAIN_VARS} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('cesium-points')).toBeTruthy();
    });
    expect(mockEdges).not.toHaveBeenCalled();
    const lines = JSON.parse(
      screen.getByTestId('cesium-points').getAttribute('data-lines') || '[]',
    );
    expect(lines).toHaveLength(0);
  });
});

// ── metadados da paleta (config_schema + mocks declarados) ───────────────────

describe('metadados — config aditiva declarada nos dois widgets', () => {
  for (const type of ['map_live', 'globe_live'] as const) {
    it(`${type}: config_schema tem show_relations/relation_types/color_by (dropdown de propriedade)`, () => {
      const meta = getWidgetMeta(type)!;
      const byName = Object.fromEntries(
        (meta.config_schema ?? []).map((f) => [f.name, f]),
      );
      expect(byName.show_relations).toMatchObject({ field: 'boolean', default: false });
      expect(byName.relation_types).toMatchObject({ field: 'string' });
      // nunca texto livre: dropdown populado pelas propriedades do set
      expect(byName.color_by).toMatchObject({ field: 'property', typeFrom: 'source' });
    });

    it(`${type}: mockVariables traz instâncias canônicas com properties (2+ relacionáveis)`, () => {
      const meta = getWidgetMeta(type)!;
      const pontos = (meta.mockVariables as { pontos: unknown[] }).pontos;
      expect(pontos.length).toBeGreaterThanOrEqual(2);
      for (const p of pontos.slice(0, 2)) {
        expect((p as { properties?: object }).properties).toBeTruthy();
      }
    });
  }
});
