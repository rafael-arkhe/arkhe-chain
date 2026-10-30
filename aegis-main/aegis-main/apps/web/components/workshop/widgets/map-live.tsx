'use client';

/**
 * Map (tempo real) — widget de Workshop geoespacial · MapboxGL (2026-05-25).
 *
 * Espelha o widget Map do Foundry (`workshop/widgets-visualization/map.md`):
 * categoria Core display / viz, **ligado a um object set** (input variable),
 * renderizado com MapboxGL. ADD alongside do `geo_map` (SVG leve) — não
 * deprecia (regra "ADD alongside or DELETE — never deprecate").
 *
 * 100% genérico/multi-domínio: plota QUALQUER objeto com lat/lng como ponto
 * (visitante, viatura, britador, ambulância, satélite, sensor). Rota e cerca
 * são camadas opcionais vindas de outras variables. Nenhuma palavra de domínio.
 *
 * Contrato: `{config, variables}` (igual `geo_map`); lê `variables[source]`.
 * MapboxMap entra via `next/dynamic` (ssr:false) — não carrega mapbox-gl no
 * SSR nem no jest, igual `mapa.tsx` faz com o Cesium.
 */
import * as React from 'react';
import dynamic from 'next/dynamic';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import type { MapMarker, MapRoute, MapZone } from '@/components/geo/mapbox-map';
import { Geo, type GeoEdge } from '@/lib/api/geo';
import { useT } from '@/lib/i18n/provider';

const MapboxMap = dynamic(
  () => import('@/components/geo/mapbox-map').then((m) => m.MapboxMap),
  { ssr: false },
);

type Cfg = {
  source?: string;
  title?: string;
  view?: 'streets' | 'satellite' | 'dark';
  height?: number;
  zoom?: number;
  routeSource?: string;
  zoneSource?: string;
  followObjectSet?: boolean;
  /** F3: agregação (clustering) — recomendado p/ muitos pontos. */
  cluster?: boolean;
  /** Densidade: camada heatmap (blur de concentração) sobre os mesmos pontos. */
  heatmap?: boolean;
  /** Ícone maki (do sprite do estilo) nos pontos/clusters — identifica o que são. */
  marker_icon?: string;
  /** CRITÉRIO do heatmap: property categórica (ex.: categoria) cujo valor mapeia p/ um
   *  PESO no calor. O que não é crítico entra fraco. Vazio = todos pesam 1. */
  heat_weight_field?: string;
  heat_weight_map?: Record<string, number>;
  heat_weight_default?: number;
  /** Popup CURADO: campos (em ordem) mostrados ao clicar num marcador. Vazio = genérico. */
  popup_fields?: { field: string; label?: string }[];
  /** Property que carrega a URL da fonte (ex.: doc_url → SISCAM) — vira link no popup. */
  popup_link_field?: string;
  popup_link_label?: string;
  /** Base prefixada quando popup_link_field é um caminho RELATIVO (ex.: /Documentos/… →
   *  https://cidade.siscam.com.br/Documentos/…). Vazio = usa a URL como veio. */
  popup_link_base?: string;
  /** Relações§: desenha as arestas da ontologia ENTRE as instâncias do set
   *  (1 chamada batched ao GET /geo/edges). Default false (retrocompat). */
  show_relations?: boolean;
  /** Relações§: CSV opcional de relation_type pra filtrar as linhas. */
  relation_types?: string;
  /** Cor-por-propriedade§: propriedade ESCALAR do set que define a cor dos
   *  pontos (escala sóbria + legenda discreta). Vazio = cores originais. */
  color_by?: string;
  /** Centro EXPLÍCITO do mapa ([lat,lng] ou {lat,lng}). Quando setado, vence a
   *  média dos markers — usado p/ enquadrar o escopo do token do visitante
   *  (cerca/destino) em vez de derivar dos pontos vivos. */
  center?: [number, number] | { lat: number; lng: number };
};

const BR_CENTER = { lat: -15.78, lng: -47.93 }; // fallback neutro (Brasília)

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Aceita `[lat,lng]` OU `{lat|latitude, lng|lon|longitude}`. */
function asLatLng(raw: unknown): [number, number] | null {
  if (Array.isArray(raw) && raw.length >= 2) {
    const a = num(raw[0]); const b = num(raw[1]);
    return a != null && b != null ? [a, b] : null;
  }
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    const lat = num(r.lat ?? r.latitude);
    const lng = num(r.lng ?? r.lon ?? r.longitude);
    if (lat != null && lng != null) return [lat, lng];
    // V1 visão§: instância CANÔNICA da ontologia (linha do object set =
    // {id,name,node_type,properties,...}) carrega o geopoint DENTRO de
    // `properties` ({'lat','lng'} — shape do _coerce_geopoint). Varre as
    // properties pela primeira com cara de geopoint — genérico, sem nome
    // de campo hardcoded (multi-domínio: localizacao/posicao/site/etc.).
    const props = r.properties;
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      for (const v of Object.values(props as Record<string, unknown>)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const g = v as Record<string, unknown>;
          const glat = num(g.lat ?? g.latitude);
          const glng = num(g.lng ?? g.lon ?? g.longitude);
          if (glat != null && glng != null) return [glat, glng];
        }
      }
    }
    return null;
  }
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** Object set → array bruto, tolerante a `{rows:[...]}`. */
export function readArray(variables: Record<string, unknown>, key?: string): unknown[] {
  if (!key) return [];
  const raw = variables[key];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)) {
    return (raw as { rows: unknown[] }).rows;
  }
  return [];
}

/** Popup RICO. Quando o widget declara `popup_fields`, monta um popup CURADO e
 *  ordenado (rótulo:valor) + link de fonte opcional (ex.: doc_url→SISCAM). Sem
 *  config, cai no genérico (rótulo + até 4 properties escalares). Nomes = DADO. */
export function richPopupHtml(r: Record<string, unknown>, cfg?: Cfg): string | undefined {
  const label = typeof r.label === 'string' ? r.label : typeof r.name === 'string' ? r.name : undefined;
  const props = (r.properties && typeof r.properties === 'object' && !Array.isArray(r.properties)
    ? r.properties : {}) as Record<string, unknown>;

  const fmt = (v: unknown): string | null => {
    if (v == null || v === '') return null;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const g = v as Record<string, unknown>;
      if (typeof g.lat === 'number' && typeof g.lng === 'number') return `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`;
      return null;
    }
    if (Array.isArray(v)) return null;
    return String(v);
  };

  // CURADO
  const curated = cfg?.popup_fields;
  if (curated && curated.length) {
    const lines: string[] = [];
    for (const f of curated) {
      const raw = f.field === 'name' ? r.name : props[f.field];
      const val = fmt(raw);
      if (val == null) continue;
      const lbl = f.label ? `<span style="opacity:.6">${escapeHtml(f.label)}:</span> ` : '';
      lines.push(`${lbl}${escapeHtml(val).slice(0, 160)}`);
    }
    let link = '';
    const lf = cfg?.popup_link_field;
    if (lf) {
      const raw = props[lf];
      // `let u: string` (e não reatribuir o `unknown` da property): reatribuir
      // a variável larga apagaria o estreitamento e o valor voltaria a unknown.
      if (typeof raw === 'string' && raw) {
        let u: string = raw;
        // Caminho relativo (ex.: /Documentos/…) → prefixa a base configurada (SISCAM).
        if (u.startsWith('/') && cfg?.popup_link_base) u = cfg.popup_link_base.replace(/\/+$/, '') + u;
        if (/^https?:\/\//.test(u)) {
          link = `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" style="color:#2D77BE;text-decoration:underline">${escapeHtml(cfg?.popup_link_label || 'Abrir fonte')}</a>`;
        }
      }
    }
    if (!label && !lines.length && !link) return undefined;
    return [label ? `<b>${escapeHtml(label)}</b>` : '', ...lines, link].filter(Boolean).join('<br/>');
  }

  // GENÉRICO (fallback)
  const lines: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    if (lines.length >= 4) break;
    const val = fmt(v);
    if (val == null) continue;
    lines.push(`<span style="opacity:.7">${escapeHtml(k)}:</span> ${escapeHtml(val).slice(0, 60)}`);
  }
  if (!label && !lines.length) return undefined;
  return [label ? `<b>${escapeHtml(label)}</b>` : '', ...lines].filter(Boolean).join('<br/>');
}

export function toMarkers(variables: Record<string, unknown>, cfg: Cfg): MapMarker[] {
  const wf = cfg.heat_weight_field;
  const wmap = cfg.heat_weight_map;
  const wdef = cfg.heat_weight_default ?? 1;
  return readArray(variables, cfg.source).flatMap((raw, i) => {
    const p = asLatLng(raw);
    if (!p) return [];
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    // CRITÉRIO do heatmap: peso pelo valor categórico (ex.: categoria) via mapa; o que
    // não está no mapa usa o default. Sem heat_weight_field, todos pesam 1.
    let weight = 1;
    if (wf) {
      const props = (r.properties && typeof r.properties === 'object' && !Array.isArray(r.properties)
        ? r.properties : {}) as Record<string, unknown>;
      const key = wf === 'name' ? r.name : props[wf];
      const mapped = wmap ? wmap[String(key)] : undefined;
      weight = typeof mapped === 'number' ? mapped : wdef;
    }
    const marker: MapMarker = {
      id: String(r.id ?? i),
      lat: p[0],
      lng: p[1],
      color: typeof r.color === 'string' ? r.color : undefined,
      pulse: r.pulse === true || r.live === true,
      popupHtml: richPopupHtml(r, cfg),
      weight,
    };
    return [marker];
  });
}

/** Linhas originais indexadas pelo MESMO id do marcador — p/ o click devolver
 *  a instância inteira (selected) ao grafo de variáveis. */
export function rowsById(variables: Record<string, unknown>, cfg: Cfg): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  readArray(variables, cfg.source).forEach((raw, i) => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    out[String(r.id ?? i)] = raw;
  });
  return out;
}

/** V3 (B4) — polígonos POR INSTÂNCIA: varre as properties por um geoshape
 *  canônico ({type:'Polygon', coordinates:[[[lng,lat],...]]} — shape do
 *  _coerce_geoshape) e vira MapZone selecionável. Genérico: lote/talhão/
 *  setor/perímetro são DADO; nenhum nome de campo hardcoded. */
export function instanceZones(variables: Record<string, unknown>, cfg: Cfg): MapZone[] {
  return readArray(variables, cfg.source).flatMap((raw, i) => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const props = (r.properties && typeof r.properties === 'object' && !Array.isArray(r.properties)
      ? r.properties : {}) as Record<string, unknown>;
    for (const v of Object.values(props)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const g = v as { type?: unknown; coordinates?: unknown };
      if (g.type !== 'Polygon' || !Array.isArray(g.coordinates)) continue;
      const outer = g.coordinates[0];
      if (!Array.isArray(outer) || outer.length < 3) continue;
      // GeoJSON é [lng,lat]; MapZone.ring é [lat,lng] (convenção AEGIS).
      const ring = outer
        .map((c) => (Array.isArray(c) ? [Number(c[1]), Number(c[0])] as [number, number] : null))
        .filter((p): p is [number, number] => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (ring.length >= 3) return [{ id: String(r.id ?? i), ring }];
    }
    return [];
  });
}

/** Sequência de pontos (rota ou anel de polígono). */
export function toPairs(variables: Record<string, unknown>, key?: string): [number, number][] {
  return readArray(variables, key).flatMap((raw) => {
    const p = asLatLng(raw);
    return p ? [p] : [];
  });
}

export function deriveCenter(markers: MapMarker[]): { lat: number; lng: number } {
  if (!markers.length) return BR_CENTER;
  const lat = markers.reduce((s, m) => s + m.lat, 0) / markers.length;
  const lng = markers.reduce((s, m) => s + m.lng, 0) / markers.length;
  return { lat, lng };
}

function centerToLatLng(
  c: [number, number] | { lat: number; lng: number } | undefined,
): { lat: number; lng: number } | null {
  if (!c) return null;
  if (Array.isArray(c)) {
    return Number.isFinite(c[0]) && Number.isFinite(c[1]) ? { lat: c[0], lng: c[1] } : null;
  }
  return Number.isFinite(c.lat) && Number.isFinite(c.lng) ? { lat: c.lat, lng: c.lng } : null;
}

/** Centro do mapa: `cfg.center` explícito > média dos markers > média de TODA a
 *  geometria (zonas/rotas) > fallback neutro. Assim uma CERCA/ROTA sem markers
 *  (ex.: token de visitante só com `geo.fence`/`geo.route`) enquadra a própria
 *  geometria em vez de cair em Brasília (o motivo de a cerca "sumir"). */
export function resolveCenter(
  explicit: [number, number] | { lat: number; lng: number } | undefined,
  markers: MapMarker[],
  zones: MapZone[],
  routes: MapRoute[],
): { lat: number; lng: number } {
  const c = centerToLatLng(explicit);
  if (c) return c;
  if (markers.length) return deriveCenter(markers);
  const pts: [number, number][] = [
    ...zones.flatMap((z) => z.ring),
    ...routes.flatMap((r) => r.path),
  ];
  if (pts.length) {
    const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return { lat, lng };
  }
  return BR_CENTER;
}

// ── Relações§ — arestas da ontologia entre as instâncias do set ─────────────

/** Shape do GET /geo/edges (re-export pros consumidores/testes). */
export type RelationEdge = GeoEdge;

/** Cor NEUTRA das polylines de relação — discreta, nunca compete com os
 *  pontos (cinza-ardósia; o acento azul-aço fica pros dados). */
export const RELATION_COLOR = '#6B7280';

/**
 * Arestas batched → polylines entre os pontos JÁ plotados. Aresta com ponta
 * fora do set (marker ausente) é ignorada; `relationTypesCsv` re-filtra no
 * cliente (defesa em profundidade — o servidor já filtrou). O label viaja na
 * rota e vira popup de hover no MapboxMap.
 */
export function relationRoutes(
  edges: RelationEdge[],
  markers: MapMarker[],
  relationTypesCsv?: string,
): MapRoute[] {
  const pos = new Map(markers.map((m) => [m.id, [m.lat, m.lng] as [number, number]]));
  const allowed = new Set(
    (relationTypesCsv ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  );
  return edges.flatMap((e) => {
    if (allowed.size && !allowed.has(e.relation_type)) return [];
    const a = pos.get(e.source_node_id);
    const b = pos.get(e.target_node_id);
    if (!a || !b) return [];
    return [{
      id: `rel-${e.id}`,
      path: [a, b],
      color: RELATION_COLOR,
      width: 2,
      label: e.relation_type,
    }];
  });
}

// ── Cor-por-propriedade§ — escala sóbria + legenda discreta ─────────────────

/** Rampa sequencial sóbria (claro → azul-aço) pra valores NUMÉRICOS. */
const SEQ_RAMP = ['#CBD9E9', '#93B5D6', '#5B91C2', '#2D77BE'];
/** Paleta categórica sóbria (azul-aço 1º; tons dessaturados depois). */
const CAT_PALETTE = [
  '#2D77BE', '#64748B', '#0F766E', '#8A5A14',
  '#5B5BA6', '#9D3548', '#3D7A3D', '#7A4E7A',
];
const CAT_MAX = 8;

function scalarOf(row: unknown, key: string): string | number | boolean | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const r = row as Record<string, unknown>;
  const direct = r[key];
  if (['string', 'number', 'boolean'].includes(typeof direct)) {
    return direct as string | number | boolean;
  }
  const props = r.properties;
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    const v = (props as Record<string, unknown>)[key];
    if (['string', 'number', 'boolean'].includes(typeof v)) {
      return v as string | number | boolean;
    }
  }
  return undefined;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Aplica a cor-por-propriedade nos markers (escala sóbria) e devolve a
 * legenda. Genérico: o NOME da propriedade é dado (dropdown do inspetor).
 *  - todos os valores numéricos → rampa sequencial em até 4 faixas;
 *  - senão → categórica (1 cor estável por valor, ordem alfabética, cap 8 —
 *    excedente vira a entrada neutra "+N").
 * Sem `colorBy` (retrocompat): devolve os MESMOS markers e legenda vazia.
 * Valor ausente/não-escalar: o marker mantém a cor original.
 */
export function colorizeMarkers(
  markers: MapMarker[],
  rows: Record<string, unknown>,
  colorBy?: string,
): { markers: MapMarker[]; legend: { label: string; color: string }[] } {
  if (!colorBy || !colorBy.trim()) return { markers, legend: [] };
  const key = colorBy.trim();
  const values = new Map<string, string | number | boolean>();
  for (const m of markers) {
    const v = scalarOf(rows[m.id], key);
    if (v !== undefined) values.set(m.id, v);
  }
  if (!values.size) return { markers, legend: [] };

  const all = [...values.values()];
  const numeric = all.every((v) => typeof v === 'number');

  let colorOf: (v: string | number | boolean) => string;
  let legend: { label: string; color: string }[];
  if (numeric) {
    const nums = all as number[];
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = max - min;
    const bins = span > 0 ? SEQ_RAMP.length : 1;
    const binOf = (v: number) =>
      span > 0 ? Math.min(bins - 1, Math.floor(((v - min) / span) * bins)) : 0;
    colorOf = (v) => SEQ_RAMP[binOf(v as number)];
    legend = Array.from({ length: bins }, (_, i) => {
      const lo = min + (span * i) / bins;
      const hi = min + (span * (i + 1)) / bins;
      return {
        label: bins === 1 ? fmtNum(min) : `${fmtNum(lo)}–${fmtNum(hi)}`,
        color: SEQ_RAMP[i],
      };
    });
  } else {
    const cats = [...new Set(all.map((v) => String(v)))].sort();
    const colorByCat = new Map(
      cats.slice(0, CAT_MAX).map((c, i) => [c, CAT_PALETTE[i % CAT_PALETTE.length]]),
    );
    colorOf = (v) => colorByCat.get(String(v)) ?? '#9CA3AF';
    legend = cats.slice(0, CAT_MAX).map((c) => ({
      label: c,
      color: colorByCat.get(c) as string,
    }));
    if (cats.length > CAT_MAX) {
      legend.push({ label: `+${cats.length - CAT_MAX}`, color: '#9CA3AF' });
    }
  }
  return {
    markers: markers.map((m) => {
      const v = values.get(m.id);
      return v === undefined ? m : { ...m, color: colorOf(v) };
    }),
    legend,
  };
}

/**
 * Relações§ — hook COMPARTILHADO (map_live + globe_live): com `show` ligado,
 * resolve as arestas ENTRE as instâncias plotadas em UMA chamada batched
 * (GET /geo/edges). Falha/ausência → lista vazia (nunca derruba o mapa);
 * `show` desligado (retrocompat) → NENHUM fetch.
 */
export function useRelationEdges(
  show: boolean | undefined,
  relationTypes: string | undefined,
  markers: MapMarker[],
): RelationEdge[] {
  const [edges, setEdges] = React.useState<RelationEdge[]>([]);
  const idsKey = React.useMemo(() => markers.map((m) => m.id).join(','), [markers]);
  React.useEffect(() => {
    if (!show) {
      setEdges([]);
      return;
    }
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length < 2) {
      setEdges([]);
      return;
    }
    let cancelled = false;
    Geo.edgesBetween(ids, relationTypes)
      .then((out) => {
        if (!cancelled) setEdges(out.edges);
      })
      .catch(() => {
        if (!cancelled) setEdges([]);
      });
    return () => {
      cancelled = true;
    };
  }, [show, relationTypes, idsKey]);
  return edges;
}

/** Legenda discreta da cor-por-propriedade (compartilhada map/globo). */
export function ColorLegend({ name, legend, testId }: {
  name: string;
  legend: { label: string; color: string }[];
  testId: string;
}) {
  if (!legend.length) return null;
  return (
    <div data-testid={testId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[9px] uppercase tracking-wider text-muted-on-light font-semibold">
        {name}
      </span>
      {legend.map((l) => (
        <span
          key={l.label}
          className="flex items-center gap-1 text-[10px] font-mono text-muted-on-light"
        >
          <span
            className="w-2 h-2 inline-block border border-border-light"
            style={{ background: l.color }}
          />
          {l.label}
        </span>
      ))}
    </div>
  );
}

function MapLive({ config, variables, emit }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as Cfg;
  // V2 visão§ — espelha o contrato da object-table: click no pino emite
  // select_change {selected, selected_id}; o app decide o que abre (overlay
  // de edição/remoção via events declarativos). Sem events = no-op (M2).
  const rows = rowsById(variables, cfg);
  // Cor-por-propriedade§: escala sóbria sobre os markers + legenda.
  const baseMarkers = toMarkers(variables, cfg);
  const { markers, legend } = colorizeMarkers(baseMarkers, rows, cfg.color_by);
  // Relações§: arestas batched entre as instâncias plotadas → polylines.
  const relEdges = useRelationEdges(cfg.show_relations, cfg.relation_types, baseMarkers);
  const routePts = toPairs(variables, cfg.routeSource);
  const zonePts = toPairs(variables, cfg.zoneSource);
  const routes: MapRoute[] = [
    ...(routePts.length > 1
      ? [{ id: 'route', path: routePts, color: '#2563eb', width: 5 }]
      : []),
    ...relationRoutes(relEdges, baseMarkers, cfg.relation_types),
  ];
  // V3 (B4): zona agregada (cfg.zoneSource — comportamento M2 intacto) +
  // N polígonos POR INSTÂNCIA do object set (geoshape em properties).
  const zones: MapZone[] = [
    ...(zonePts.length > 2 ? [{ id: 'zone', ring: zonePts, color: '#2563eb' }] : []),
    ...instanceZones(variables, cfg),
  ];
  const center = resolveCenter(cfg.center, markers, zones, routes);
  const height = cfg.height ?? 320;
  const onMarkerClick = React.useCallback(
    (id: string) => emit?.('select_change', { selected: rows[id], selected_id: id }),
    [emit, rows],
  );
  // V3 (B4): click no POLÍGONO seleciona a instância dona — mesmo contrato.
  const onZoneClick = React.useCallback(
    (id: string) => { if (rows[id]) emit?.('select_change', { selected: rows[id], selected_id: id }); },
    [emit, rows],
  );

  return (
    <div className="bg-white border border-border-light p-3 flex flex-col gap-2" data-testid="map-live-widget">
      {cfg.title && (
        <p className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">{cfg.title}</p>
      )}
      <div
        data-testid="map-live-canvas"
        className="relative border border-border-light overflow-hidden"
        style={{ height }}
      >
        <MapboxMap
          /* F3: o setup do cluster (source/layers) só acontece no init do mapa;
             remontar ao trocar `cluster` aplica a mudança limpa (sem ref congelado). */
          key={`map-${cfg.cluster ? 'cluster' : 'plain'}-${cfg.heatmap ? 'heat' : 'flat'}-${cfg.marker_icon || 'noicon'}-${cfg.view ?? 'streets'}`}
          className="absolute inset-0"
          center={center}
          zoom={cfg.zoom ?? 14}
          view={cfg.view ?? 'streets'}
          markers={markers}
          routes={routes}
          zones={zones}
          cluster={cfg.cluster ?? false}
          heatmap={cfg.heatmap ?? false}
          icon={cfg.marker_icon ?? ''}
          onMarkerClick={emit ? onMarkerClick : undefined}
          onZoneClick={emit ? onZoneClick : undefined}
        />
      </div>
      {cfg.color_by && (
        <ColorLegend name={cfg.color_by} legend={legend} testId="map-live-legend" />
      )}
      <p data-testid="map-live-count" className="text-[10px] font-mono text-muted-on-light">
        {t(markers.length === 1 ? 'map.countOne' : 'map.countMany').replace('{n}', String(markers.length))}
      </p>
    </div>
  );
}

registerWidget('map_live', MapLive, {
  group: 'viz',
  label: 'Mapa (tempo real)',
  description: 'Mapa MapboxGL ligado a um object set — plota objetos com lat/lng como pontos, com rota e cerca opcionais.',
  icon: 'map-pin',
  defaultColSpan: 12,
  mockConfig: {
    source: 'pontos', routeSource: 'rota', zoneSource: 'area',
    title: 'Ativos em campo', view: 'streets', height: 320, zoom: 13, followObjectSet: true,
    show_relations: true, color_by: 'status',
  },
  // Relações§: 2 instâncias CANÔNICAS relacionáveis (id + name + properties
  // escalares) — o shape real do object set; as linhas aparecem quando o set
  // tem arestas na ontologia (ids mock não têm — estado honesto da paleta).
  mockVariables: {
    pontos: [
      { id: 'a', name: 'Ativo 01', lat: -23.561, lng: -46.656, pulse: true,
        properties: { status: 'ativo', setor: 'Norte' } },
      { id: 'b', name: 'Ativo 02', lat: -23.557, lng: -46.659,
        properties: { status: 'manutencao', setor: 'Sul' } },
    ],
    rota: [[-23.561, -46.656], [-23.559, -46.657], [-23.557, -46.659]],
    area: [[-23.555, -46.662], [-23.555, -46.652], [-23.564, -46.652], [-23.564, -46.662]],
  },
  config_schema: [
    { name: 'source', label: 'Pontos (object set)', description: 'Variable com objetos contendo lat/lng (+label, color, pulse).', field: 'variable-ref' },
    { name: 'title', label: 'Título', field: 'string', placeholder: 'ex.: Ativos em campo' },
    { name: 'view', label: 'Base', field: 'select', default: 'streets',
      options: [{ value: 'streets', label: 'Ruas' }, { value: 'satellite', label: 'Satélite' }, { value: 'dark', label: 'Escuro' }] },
    { name: 'routeSource', label: 'Rota (opcional)', description: 'Variable com a sequência de pontos da rota.', field: 'variable-ref' },
    { name: 'zoneSource', label: 'Área/cerca (opcional)', description: 'Variable com o anel do polígono.', field: 'variable-ref' },
    { name: 'height', label: 'Altura', field: 'number', min: 160, max: 800, step: 20, default: 320, unit: 'px' },
    { name: 'zoom', label: 'Zoom', field: 'number', min: 1, max: 20, step: 1, default: 14 },
    { name: 'followObjectSet', label: 'Seguir os objetos', description: 'Centraliza no conjunto automaticamente.', field: 'boolean', default: true },
    { name: 'cluster', label: 'Agrupar pontos (clusters)', description: 'Agrega pontos próximos em bolhas com contagem que expandem ao clicar. Recomendado p/ muitos pontos.', field: 'boolean', default: false },
    { name: 'heatmap', label: 'Mapa de calor (densidade)', description: 'Blur de concentração sobre os pontos — mostra ONDE a demanda se concentra. Combina com clusters.', field: 'boolean', default: false },
    { name: 'marker_icon', label: 'Ícone dos pontos', description: 'Nome de ícone maki do estilo (ex.: town-hall, marker, circle) plotado nos pontos e clusters p/ identificar o que são. Vazio = só o círculo.', field: 'string', placeholder: 'ex.: town-hall' },
    { name: 'show_relations', label: 'Mostrar relações entre os objetos',
      description: 'Desenha linhas discretas entre as instâncias do conjunto que têm relação na ontologia (label da relação no hover).',
      field: 'boolean', default: false },
    { name: 'relation_types', label: 'Tipos de relação (opcional)',
      description: 'Lista separada por vírgula — vazio mostra todas as relações.',
      field: 'string', placeholder: 'ex.: pertence_a,ligado_a' },
    { name: 'color_by', label: 'Colorir por propriedade',
      description: 'Propriedade escalar do conjunto que define a cor dos pontos (escala sóbria + legenda).',
      field: 'property', typeFrom: 'source' },
  ],
});

export { MapLive };
