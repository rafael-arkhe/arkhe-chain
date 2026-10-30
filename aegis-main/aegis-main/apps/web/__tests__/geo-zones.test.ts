/**
 * B5.2 (MAPA /geo) — zonas KMZ/GeoJSON (helpers puros).
 *
 * zoneStyle: paleta DS-contida por categoria (nunca arco-íris do web-app).
 * geojsonToZoneFeatures: normaliza uma FeatureCollection (GeoJSON, ou saída do
 * KmlDataSource do Cesium convertida em GeoJSON) em features de zona
 * {name, geometry:[[lon,lat],...], zone_type} — o que o backend importa.
 */
import {
  zoneStyle,
  geojsonToZoneFeatures,
  ZONE_TYPES,
  type ZoneFeature,
} from '@/components/geo/geo-zones';

describe('zoneStyle — paleta DS contida (sem glow)', () => {
  it('categorias canônicas têm cor estável', () => {
    expect(zoneStyle('exclusion').fill).toBe('#C8341F');
    expect(zoneStyle('engagement').fill).toBe('#E97D2A');
    expect(zoneStyle('observation').fill).toBe('#2D77BE');
    expect(zoneStyle('safe').fill).toBe('#3D9F58');
  });
  it('categoria desconhecida → aço default', () => {
    expect(zoneStyle('qualquer').fill).toBe('#2D77BE');
  });
  it('ZONE_TYPES lista as 4 canônicas', () => {
    expect(ZONE_TYPES).toEqual(['exclusion', 'engagement', 'observation', 'safe']);
  });
});

const RING = [
  [-46.66, -23.56], [-46.65, -23.56], [-46.65, -23.55], [-46.66, -23.55],
];

describe('geojsonToZoneFeatures — normaliza FeatureCollection em zonas', () => {
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'Perímetro', tipo: 'exclusion' }, geometry: { type: 'Polygon', coordinates: [RING] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-46.6, -23.5] } }, // não-polígono → pula
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] } }, // <3 pts → pula
    ],
  };

  it('extrai só polígonos válidos, com nome/geometria/zone_type', () => {
    const zones = geojsonToZoneFeatures(fc, { categoryProp: 'tipo', defaultZoneType: 'observation' });
    expect(zones).toHaveLength(1);
    const z: ZoneFeature = zones[0];
    expect(z.name).toBe('Perímetro');
    expect(z.geometry).toEqual(RING);
    expect(z.zone_type).toBe('exclusion');
  });

  it('sem categoryProp na feature → aplica defaultZoneType', () => {
    const fc2 = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { Name: 'Setor A' }, geometry: { type: 'Polygon', coordinates: [RING] } },
    ] };
    const zones = geojsonToZoneFeatures(fc2, { defaultZoneType: 'safe' });
    expect(zones[0].name).toBe('Setor A'); // aceita Name maiúsculo
    expect(zones[0].zone_type).toBe('safe');
  });

  it('MultiPolygon vira uma zona por polígono', () => {
    const fc3 = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: 'Multi' }, geometry: { type: 'MultiPolygon', coordinates: [[RING], [RING]] } },
    ] };
    const zones = geojsonToZoneFeatures(fc3, {});
    expect(zones).toHaveLength(2);
    expect(zones[0].geometry).toEqual(RING);
  });

  it('nome ausente → "Zona N"', () => {
    const fc4 = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [RING] } },
    ] };
    expect(geojsonToZoneFeatures(fc4, {})[0].name).toBe('Zona 1');
  });
});
