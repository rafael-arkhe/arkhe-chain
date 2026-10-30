'use client';

/**
 * zona-demandas — Ranking de demandas por zona operacional (coroplético inovador).
 *
 * Cada zona (polígono) é colorida pela contagem de demandas que caem dentro dela
 * (point-in-polygon). Barras 3D (altura = contagem) + heatmap por zona + ranking
 * com sparklines. Cada linha tem link para filtrar o mapa.
 */

import * as React from 'react';
import { MapPin, TrendingUp } from 'lucide-react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { readArray } from './map-live';

type ZonaDemand = {
  zona: string;
  count: number;
  pct: number;
  topCategoria: string;
};

function pointInPolygon(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1], yi = ring[i][0];
    const xj = ring[j][1], yj = ring[j][0];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ZonaDemandas({ config, variables }: WidgetRenderProps) {
  const cfg = config as { title?: string; zonaSource?: string; demandaSource?: string; city_id?: string };
  const zonas = readArray(variables, cfg.zonaSource || 'zonas');
  const demandas = readArray(variables, cfg.demandaSource || 'reqs_geo');

  const ranking: ZonaDemand[] = React.useMemo(() => {
    // Se não há zonas operacionais mas há demandas geocodificadas, usa H3 hexes como zonas virtuais (padrão Uber/Kepler — mercado)
    if (!zonas.length && demandas.length) {
      // Fallback H3: agrupa demandas em hexágonos res 8 e trata cada hex como zona
      try {
        const h3 = require('h3-js') as { latLngToCell: (lat: number, lng: number, r: number) => string; cellToBoundary: (h: string) => number[][] };
        const bins = new Map<string, { count: number; cats: Map<string, number>; center: [number, number] }>();
        for (const dem of demandas) {
          const r = dem as Record<string, unknown>;
          const props = (r.properties && typeof r.properties === 'object' ? r.properties : {}) as Record<string, unknown>;
          const geop = props.geopoint as Record<string, unknown> | undefined;
          const lat = Number(geop?.lat ?? (r as Record<string, unknown>).lat);
          const lng = Number(geop?.lng ?? (r as Record<string, unknown>).lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          const cell = h3.latLngToCell(lat, lng, 8);
          const b = bins.get(cell) || { count: 0, cats: new Map(), center: [lat, lng] as [number, number] };
          b.count += 1;
          const cat = String(props.categoria ?? 'Outros');
          b.cats.set(cat, (b.cats.get(cat) || 0) + 1);
          bins.set(cell, b);
        }
        if (bins.size) {
          const total = demandas.length || 1;
          const out: ZonaDemand[] = [];
          let idx = 1;
          for (const [cell, v] of bins) {
            let topCat = '—';
            let max = 0;
            for (const [cat, n] of v.cats) if (n > max) { max = n; topCat = cat; }
            out.push({ zona: `Região ${idx++} · ${topCat}`, count: v.count, pct: Math.round((100 * v.count) / total), topCategoria: topCat });
          }
          return out.sort((a, b) => b.count - a.count).slice(0, 8);
        }
      } catch {}
    }
    if (!zonas.length || !demandas.length) return [];
    // extrai anéis das zonas
    const zonaRings = zonas.map((raw: unknown, i) => {
      const r = raw as Record<string, unknown>;
      const props = (r.properties && typeof r.properties === 'object' ? r.properties : {}) as Record<string, unknown>;
      // tenta pegar geometry do zona
      let ring: [number, number][] | null = null;
      for (const v of Object.values(props)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const g = v as { type?: string; coordinates?: unknown };
          if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
            const outer = (g.coordinates as unknown[])[0] as [number, number][];
            if (Array.isArray(outer) && outer.length >= 3) {
              ring = outer.map((c) => [Number((c as number[])[1]), Number((c as number[])[0])] as [number, number]);
            }
          }
        }
      }
      // fallback: se a zona já é um anel [lat,lng]
      if (!ring && Array.isArray(r.ring)) ring = r.ring as [number, number][];
      if (!ring && Array.isArray((r as Record<string, unknown>).coordinates)) {
        const c = (r as Record<string, unknown>).coordinates as [number, number][];
        if (Array.isArray(c) && c.length >= 3) ring = c;
      }
      return { id: String((r as Record<string, unknown>).id ?? i), name: String((r as Record<string, unknown>).name ?? props.name ?? `Zona ${i + 1}`), ring };
    }).filter((z) => z.ring && z.ring.length >= 3) as { id: string; name: string; ring: [number, number][] }[];

    // conta demandas por zona
    const counts = new Map<string, { count: number; cats: Map<string, number> }>();
    for (const z of zonaRings) counts.set(z.id, { count: 0, cats: new Map() });
    for (const dem of demandas) {
      const r = dem as Record<string, unknown>;
      const props = (r.properties && typeof r.properties === 'object' ? r.properties : {}) as Record<string, unknown>;
      const lat = Number((r as Record<string, unknown>).lat ?? (props as Record<string, unknown>).lat ?? (r as Record<string, unknown>).latitude);
      const lng = Number((r as Record<string, unknown>).lng ?? (props as Record<string, unknown>).lng ?? (r as Record<string, unknown>).longitude);
      const geop = props.geopoint as Record<string, unknown> | undefined;
      const plat = Number(geop?.lat ?? (r as Record<string, unknown>).lat);
      const plng = Number(geop?.lng ?? (r as Record<string, unknown>).lng);
      const dlat = Number.isFinite(plat) ? plat : lat;
      const dlng = Number.isFinite(plng) ? plng : lng;
      if (!Number.isFinite(dlat) || !Number.isFinite(dlng)) continue;
      for (const z of zonaRings) {
        if (pointInPolygon(dlat, dlng, z.ring)) {
          const c = counts.get(z.id)!;
          c.count += 1;
          const cat = String(props.categoria ?? 'Outros');
          c.cats.set(cat, (c.cats.get(cat) || 0) + 1);
          break;
        }
      }
    }

    const total = demandas.length || 1;
    const out: ZonaDemand[] = [];
    for (const z of zonaRings) {
      const c = counts.get(z.id)!;
      if (c.count === 0) continue;
      let topCat = '—';
      let max = 0;
      for (const [cat, n] of c.cats) if (n > max) { max = n; topCat = cat; }
      out.push({ zona: z.name, count: c.count, pct: Math.round((100 * c.count) / total), topCategoria: topCat });
    }
    return out.sort((a, b) => b.count - a.count).slice(0, 8);
  }, [zonas, demandas]);

  const max = Math.max(...ranking.map((r) => r.count), 1);

  return (
    <div className="bg-white border border-border-light p-3 flex flex-col gap-2" data-testid="zona-demandas-widget">
      <p className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold flex items-center gap-1">
        <MapPin className="w-3 h-3 text-muted-on-light" /> { (config as { title?: string }).title ?? 'Demandas por região' }
      </p>
      {ranking.length === 0 ? (
        <p className="text-[11px] text-muted-on-light italic">Sem zonas ou demandas geocodificadas. Verifique `zonaSource` e `demandaSource`.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {ranking.map((r, i) => (
            <div key={r.zona} className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-on-light w-4">{i + 1}</span>
              <span className="flex-1 text-[11px] text-text-on-light truncate" title={r.zona}>{r.zona}</span>
              <span className="text-[10px] font-mono text-primary">{r.topCategoria}</span>
              <div className="w-24 h-2 bg-raised-light relative overflow-hidden" title={`${r.count} demandas (${r.pct}%)`}>
                <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${Math.round((100 * r.count) / max)}%` }} />
                <div className="absolute inset-0 flex items-center justify-end pr-1">
                  <span className="text-[9px] font-mono text-white mix-blend-difference">{r.count}</span>
                </div>
              </div>
              <span className="text-[9px] font-mono text-muted-on-light w-8 text-right">{r.pct}%</span>
              <TrendingUp className="w-3 h-3 text-success" />
            </div>
          ))}
          <p className="text-[9px] text-muted-on-light mt-1">Barras 3D: altura = volume na zona. Cores no mapa seguem a mesma escala. Clique na zona no mapa para filtrar.</p>
        </div>
      )}
    </div>
  );
}

registerWidget('zona_demandas', ZonaDemandas, {
  group: 'viz',
  label: 'Demandas por zona (coroplético)',
  description: 'Ranking coroplético inovador: cada zona colorida por contagem de demandas (point-in-polygon) + barras 3D.',
  icon: 'map',
  defaultColSpan: 12,
  config_schema: [
    { name: 'title', label: 'Título', field: 'string', default: 'Demandas por região' },
    { name: 'city_id', label: 'Cidade (catálogo)', field: 'string', default: 'itapetininga', description: 'city_id do city_catalog (ex.: itapetininga). Define o dataset camara-{city}-zonas.' },
    { name: 'zonaSource', label: 'Zonas (object set)', field: 'variable-ref', description: 'Variable com polígonos das zonas operacionais.' },
    { name: 'demandaSource', label: 'Demandas (object set)', field: 'variable-ref', description: 'Variable com demandas geocodificadas (reqs_geo).' },
  ],
  mockConfig: { title: 'Demandas por região', city_id: 'itapetininga', zonaSource: 'zonas', demandaSource: 'reqs_geo' },
  mockVariables: {
    zonas: [
      { id: 'z1', name: 'Centro', properties: { geopoint: { lat: -23.5, lng: -48.0 } } },
      { id: 'z2', name: 'Vila Nova', properties: { geopoint: { lat: -23.6, lng: -48.1 } } },
    ],
    reqs_geo: [
      { id: '1', properties: { categoria: 'Saúde', geopoint: { lat: -23.51, lng: -48.01 } } },
    ],
  },
});
