/**
 * KML/KMZ → FeatureCollection. EXTRAÍDO do `importar-zona-modal` (que só sabia
 * polígono) e ampliado para LINHA e PONTO — o export do Google My Maps traz os
 * três, e o Construtor de Camadas desenha os três.
 *
 * O parse usa o `KmlDataSource` do Cesium, que já é dependência do app. O
 * import é DINÂMICO: a lib é pesada (MBs) e só entra em cena quando o operador
 * escolhe um arquivo .kml/.kmz.
 */

/** Extrai o anel/linha em [lng,lat] de posições Cartesian3 do Cesium. */
function toDegrees(
  Cesium: typeof import('cesium'),
  positions: import('cesium').Cartesian3[],
): [number, number][] {
  return positions.map((p) => {
    const carto = Cesium.Cartographic.fromCartesian(p);
    return [
      Cesium.Math.toDegrees(carto.longitude),
      Cesium.Math.toDegrees(carto.latitude),
    ] as [number, number];
  });
}

/**
 * Lê um File .kml/.kmz e devolve FeatureCollection GeoJSON ([lng,lat]).
 * Entidades sem geometria utilizável são ignoradas (não viram feição vazia).
 */
export async function parseKmlToFeatureCollection(
  file: File,
): Promise<GeoJSON.FeatureCollection> {
  const Cesium = await import('cesium');
  const url = URL.createObjectURL(file);
  try {
    const ds = await Cesium.KmlDataSource.load(url, { clampToGround: true });
    const now = Cesium.JulianDate.now();
    const features: GeoJSON.Feature[] = [];

    for (const entity of ds.entities.values) {
      const properties: Record<string, unknown> = {};
      if (entity.name) properties.nome = entity.name;
      // A "camada" do My Maps vira a PASTA do KML → é a categoria natural.
      const parentName = entity.parent?.name;
      if (parentName) properties.categoria = parentName;
      const description = entity.description?.getValue(now);
      if (typeof description === 'string' && description.trim()) {
        // o My Maps embute HTML na descrição; guardamos o texto limpo
        properties.descricao = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      let geometry: GeoJSON.Geometry | null = null;

      const poly = entity.polygon;
      if (poly?.hierarchy) {
        const hierarchy = poly.hierarchy.getValue(now) as
          | { positions?: import('cesium').Cartesian3[] }
          | undefined;
        const positions = hierarchy?.positions;
        if (positions && positions.length >= 3) {
          const ring = toDegrees(Cesium, positions);
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
          geometry = { type: 'Polygon', coordinates: [ring] };
        }
      }

      if (!geometry && entity.polyline?.positions) {
        const positions = entity.polyline.positions.getValue(now) as
          | import('cesium').Cartesian3[]
          | undefined;
        if (positions && positions.length >= 2) {
          geometry = { type: 'LineString', coordinates: toDegrees(Cesium, positions) };
        }
      }

      if (!geometry && entity.position) {
        const pos = entity.position.getValue(now);
        if (pos) {
          const [lng, lat] = toDegrees(Cesium, [pos])[0];
          geometry = { type: 'Point', coordinates: [lng, lat] };
        }
      }

      if (geometry) features.push({ type: 'Feature', properties, geometry });
    }
    return { type: 'FeatureCollection', features };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Extensões que o import aceita (input file + validação). */
export const IMPORT_ACCEPT = '.geojson,.json,.kml,.kmz';

export function isKmlFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.kml') || lower.endsWith('.kmz');
}

export function isGeoJsonFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.geojson') || lower.endsWith('.json');
}
