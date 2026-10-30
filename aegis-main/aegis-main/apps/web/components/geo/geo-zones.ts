/**
 * B5.2 (MAPA /geo) — zonas KMZ/GeoJSON (helpers puros, sem side-effect).
 *
 * `zoneStyle` — paleta DS-contida por categoria (nunca o arco-íris do
 * web-app). Preenchimento e contorno usam o MESMO hex; o render Cesium é
 * quem aplica o alpha. SEM glow em lugar nenhum deste módulo.
 *
 * `geojsonToZoneFeatures` — normaliza uma FeatureCollection (GeoJSON, ou a
 * saída do KmlDataSource do Cesium convertida em GeoJSON) em features de
 * zona {name, geometry:[[lon,lat],...], zone_type} — exatamente o corpo que
 * o backend importa em POST /api/v1/geo/zones/import.
 */

/** Categorias canônicas de zona (ordem estável para a UI e o backend). */
export const ZONE_TYPES = [
  'exclusion',
  'engagement',
  'observation',
  'safe',
] as const;

/** Feature de zona normalizada — o que o backend importa. */
export interface ZoneFeature {
  name: string;
  /** Anel externo: pares [lon, lat] preservados como estão. */
  geometry: number[][];
  zone_type?: string;
}

/** Zona persistida (GET /api/v1/geo/zones), já em camelCase na UI. */
export interface GeoZone {
  id: string;
  name: string;
  zone_type: string;
  geometry: number[][];
  extruded_height: number;
  source: string | null;
}

/**
 * Cor DS-contida por categoria. `fill` e `outline` são o MESMO hex — o
 * alpha fica a cargo do render Cesium. Categoria desconhecida cai no aço
 * default (#2D77BE), o único acento da plataforma.
 */
export function zoneStyle(zoneType: string): { fill: string; outline: string } {
  const hex =
    zoneType === 'exclusion'
      ? '#C8341F'
      : zoneType === 'engagement'
        ? '#E97D2A'
        : zoneType === 'observation'
          ? '#2D77BE'
          : zoneType === 'safe'
            ? '#3D9F58'
            : '#2D77BE';
  return { fill: hex, outline: hex };
}

/**
 * Normaliza uma FeatureCollection em features de zona.
 *
 * - `Polygon` → uma feature, com o anel EXTERNO (`coordinates[0]`).
 * - `MultiPolygon` → uma feature por polígono (anel externo `coordinates[k][0]`).
 * - Geometrias não-poligonais e anéis com <3 pontos são descartados.
 *
 * `name` = properties.name ?? Name ?? title ?? NOME ?? `Zona N` (N = índice
 * 1-based sobre as zonas EMITIDAS). `zone_type` = properties[categoryProp]
 * (quando informado) ?? defaultZoneType. Pares [lon, lat] preservados.
 */
export function geojsonToZoneFeatures(
  geojson: any,
  opts: { categoryProp?: string; defaultZoneType?: string },
): ZoneFeature[] {
  const out: ZoneFeature[] = [];
  const features: any[] = Array.isArray(geojson?.features) ? geojson.features : [];

  const emit = (ring: any, props: Record<string, any>) => {
    if (!Array.isArray(ring) || ring.length < 3) return;
    const idx = out.length + 1;
    const name =
      props?.name ??
      props?.Name ??
      props?.title ??
      props?.NOME ??
      `Zona ${idx}`;
    const zone_type =
      (opts.categoryProp ? props?.[opts.categoryProp] : undefined) ??
      opts.defaultZoneType;
    out.push({ name, geometry: ring as number[][], zone_type });
  };

  for (const feature of features) {
    const geometry = feature?.geometry;
    const props = (feature?.properties ?? {}) as Record<string, any>;
    if (!geometry) continue;
    if (geometry.type === 'Polygon') {
      emit(geometry.coordinates?.[0], props);
    } else if (geometry.type === 'MultiPolygon') {
      const polys: any[] = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
      for (const poly of polys) {
        emit(poly?.[0], props);
      }
    }
    // demais tipos: descartados
  }

  return out;
}
