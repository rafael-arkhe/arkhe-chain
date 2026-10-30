/**
 * Camadas de referência do /geo — data-flow do GeoContext.toggleReferenceLayer.
 * Verifica: catálogo carrega; ligar → busca o GeoJSON + fica ativa; desligar →
 * remove do estado. O render no Cesium é WebGL (não testável em jsdom); aqui
 * provamos o fluxo de dados que o alimenta.
 */
import * as React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';

jest.mock('@/lib/api/geo', () => ({
  Geo: {
    nodeTypes: jest.fn().mockResolvedValue({ node_types: [] }),
    nodes: jest.fn().mockResolvedValue({ nodes: [], truncated: false }),
    referenceLayers: jest.fn().mockResolvedValue({
      layers: [
        { id: 'ibge_uf_malha', label: 'Limites estaduais (IBGE)', geom: 'polygon', params: [], source: 'IBGE' },
        { id: 'cnes_saude', label: 'Estabelecimentos de saúde (CNES)', geom: 'point', params: ['uf'], source: 'DEMAS' },
      ],
    }),
    referenceLayer: jest.fn().mockResolvedValue({
      layer: 'ibge_uf_malha',
      geojson: { type: 'FeatureCollection', features: [{}, {}, {}] },
      feature_count: 3,
    }),
  },
}));

jest.mock('@/lib/api', () => ({
  Alerts: {
    geofences: {
      list: jest.fn().mockResolvedValue([]),
      alerts: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { GeoProvider, useGeo } from '@/components/geo/geo-context';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <GeoProvider>{children}</GeoProvider>
);

describe('GeoContext — camadas de referência', () => {
  it('carrega o catálogo de camadas de referência', async () => {
    const { result } = renderHook(() => useGeo(), { wrapper });
    await waitFor(() => expect(result.current.referenceLayers.length).toBe(2));
    expect(result.current.referenceLayers.map((l) => l.id)).toContain('cnes_saude');
  });

  it('ligar → busca GeoJSON + fica ativa; desligar → remove do estado', async () => {
    const { result } = renderHook(() => useGeo(), { wrapper });
    await waitFor(() => expect(result.current.referenceLayers.length).toBe(2));

    act(() => result.current.toggleReferenceLayer('ibge_uf_malha'));
    await waitFor(() =>
      expect(result.current.activeReferenceLayers).toContain('ibge_uf_malha'),
    );
    await waitFor(() =>
      expect(result.current.referenceGeoJSON['ibge_uf_malha']?.features.length).toBe(3),
    );

    act(() => result.current.toggleReferenceLayer('ibge_uf_malha'));
    expect(result.current.activeReferenceLayers).not.toContain('ibge_uf_malha');
    expect(result.current.referenceGeoJSON['ibge_uf_malha']).toBeUndefined();
  });
});
