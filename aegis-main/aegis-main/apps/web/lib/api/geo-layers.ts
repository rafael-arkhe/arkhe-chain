/**
 * Cliente do Construtor de Camadas de Referência (ontology-module
 * `app/routers/geo_layers.py`, montado em /api/v1/geo/layers).
 *
 * Uma camada = 1 dataset editável + 1 board do DAG + 1 node_type dedicado.
 * Publicar roda o board: os nós materializados aparecem sozinhos na aba
 * "Camadas de referência" do /geo (styled auto-ativa).
 *
 * Perms: leitura `security.geo.view`; escrita `security.geo.camada.manage`.
 */
import type { FeatureRow } from '@/lib/geo/geojson-io';

import { aegis } from './sdk';

const BASE = '/api/v1/geo/layers';

export interface LayerMapa {
  slug: string;
  label: string;
}

export interface Layer {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  node_type: string;
  dataset: string;
  mapa: LayerMapa | null;
  /** Feições desenhadas (salvas no dataset). */
  feature_count: number;
  /** Feições já materializadas no /geo (só muda ao publicar). */
  materialized_count: number;
  dataset_version: number;
  last_run_status: string | null;
  last_run_at: string | null;
}

export interface LayerGroup {
  slug: string;
  label: string;
  layers: Layer[];
}

export interface LayersOut {
  maps: LayerGroup[];
  /** Camadas sem "mapa" (fora de qualquer grupo). */
  avulsas: Layer[];
}

export interface LayerFeaturesOut {
  rows: FeatureRow[];
  version: number;
  node_type: string;
}

export interface LayerPublishOut {
  status: string;
  run_id: string | null;
  error: string | null;
  rows: number;
  materialized: number;
  removed: number;
  duration_ms: number;
  node_type: string | null;
}

export interface LayerDeleteOut {
  status: string;
  nodes_removed: number;
  dataset_versions_removed: number;
}

export const GeoLayers = {
  /** Camadas do tenant, agrupadas por "mapa" (o projeto do My Maps). */
  list: () => aegis.request<LayersOut>('GET', BASE),

  create: (body: { nome: string; mapa?: string | null; descricao?: string | null }) =>
    aegis.request<Layer>('POST', BASE, { json: body }),

  features: (boardId: string) =>
    aegis.request<LayerFeaturesOut>('GET', `${BASE}/${boardId}/features`),

  /** Grava o desenho (SNAPSHOT versionado — o dataset É o rascunho durável). */
  saveFeatures: (boardId: string, rows: FeatureRow[]) =>
    aegis.request<LayerFeaturesOut>('PUT', `${BASE}/${boardId}/features`, {
      json: { rows },
    }),

  /** Publica: roda o board e reconcilia o que saiu do desenho. */
  publish: (boardId: string) =>
    aegis.request<LayerPublishOut>('POST', `${BASE}/${boardId}/publish`),

  /** Renomeia/reagrupa. `mapa: ''` tira a camada do grupo. */
  patch: (
    boardId: string,
    changes: { nome?: string; mapa?: string; descricao?: string },
  ) => aegis.request<Layer>('PATCH', `${BASE}/${boardId}`, { json: changes }),

  remove: (boardId: string) =>
    aegis.request<LayerDeleteOut>('DELETE', `${BASE}/${boardId}`),
};
