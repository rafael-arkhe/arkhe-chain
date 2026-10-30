/**
 * /GEO real — helpers puros (components/geo/geo-utils.ts).
 *
 * pointInPolygon ESPELHA o ray-casting do backend (geofence_eval.py) com o
 * mesmo contrato de anel [[lon, lat], ...] — a contagem da UI dentro do
 * polígono usa a MESMA matemática que dispara alertas de cerca.
 */
import {
  colorForNodeType,
  countNodesInPolygon,
  fenceBodyCoordinates,
  fenceGeometryValid,
  geofenceCenter,
  humanizeNodeType,
  humanizePinLabel,
  isTechnicalLabel,
  pointInPolygon,
  type LngLat,
} from '@/components/geo/geo-utils';
import type { GeoNode } from '@/lib/api/geo';

const ring: LngLat[] = [
  [-46.7, -23.5],
  [-46.5, -23.5],
  [-46.5, -23.7],
  [-46.7, -23.7],
];

function node(id: string, nodeType: string, lng: number, lat: number): GeoNode {
  return { id, node_type: nodeType, name: id, lat, lng, detected_at: null, properties_resumo: {} };
}

describe('pointInPolygon — espelho do backend', () => {
  it('ponto dentro do anel → true', () => {
    expect(pointInPolygon(-46.6, -23.6, ring)).toBe(true);
  });
  it('ponto fora do anel → false', () => {
    expect(pointInPolygon(-46.9, -23.6, ring)).toBe(false);
    expect(pointInPolygon(-46.6, -23.4, ring)).toBe(false);
  });
  it('anel degenerado (<3 vértices) → false', () => {
    expect(pointInPolygon(-46.6, -23.6, ring.slice(0, 2))).toBe(false);
  });
});

describe('countNodesInPolygon — contagem REAL por camada visível', () => {
  it('conta só os nós carregados dentro do anel, por tipo', () => {
    const result = countNodesInPolygon(
      {
        vehicle_track: [
          node('v1', 'vehicle_track', -46.6, -23.6),
          node('v2', 'vehicle_track', -46.65, -23.55),
          node('v3', 'vehicle_track', -40.0, -10.0), // fora
        ],
        cctv_detection: [node('d1', 'cctv_detection', -46.55, -23.65)],
      },
      ring,
    );
    expect(result.total).toBe(3);
    expect(result.byType).toEqual({ vehicle_track: 2, cctv_detection: 1 });
  });
  it('sem nós dentro → total 0', () => {
    const result = countNodesInPolygon(
      { x: [node('x1', 'x', 0, 0)] },
      ring,
    );
    expect(result.total).toBe(0);
    expect(result.byType).toEqual({});
  });
});

describe('colorForNodeType — cor estável por tipo (zero hardcode de domínio)', () => {
  it('mesma entrada → mesma cor; entradas diferentes podem divergir', () => {
    const a1 = colorForNodeType('vehicle_track');
    const a2 = colorForNodeType('vehicle_track');
    expect(a1).toBe(a2);
    expect(a1).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('humanizeNodeType — label humano no display layer', () => {
  it('snake_case → Title Case', () => {
    expect(humanizeNodeType('vehicle_track')).toBe('Vehicle Track');
  });
  it('camelCase e kebab-case', () => {
    expect(humanizeNodeType('cctvDetection')).toBe('Cctv Detection');
    expect(humanizeNodeType('face-match')).toBe('Face Match');
  });
  it('vazio → vazio', () => {
    expect(humanizeNodeType('')).toBe('');
  });
});

// B2 (MAPA /geo): rótulo de pin NUNCA renderiza UUID/slug técnico. Espelho de
// defesa-em-profundidade do backend (_is_technical_label/_humanize_label do
// geo.py) — mesmo que o backend falhe, o pin nunca mostra um UUID cru.
const UUID = '1d9447c7-76af-3646-9a03-02d66bd03d4e';
const SLUG = `obs:hotspot:${UUID}`;
const NID = '93fbd2d4-be9c-39db-86df-af59fb089a7c';

describe('isTechnicalLabel — detector de rótulo de máquina', () => {
  it('UUID nu, slug com UUID embutido e hex longo → técnico', () => {
    expect(isTechnicalLabel(UUID)).toBe(true);
    expect(isTechnicalLabel(SLUG)).toBe(true);
    expect(isTechnicalLabel('a1b2c3d4e5f60718')).toBe(true);
  });
  it('vazio/espaço → técnico', () => {
    expect(isTechnicalLabel('')).toBe(true);
    expect(isTechnicalLabel('   ')).toBe(true);
  });
  it('nomes humanos → não técnico', () => {
    expect(isTechnicalLabel('Câmera Central')).toBe(false);
    expect(isTechnicalLabel('Antena Norte 12')).toBe(false);
    expect(isTechnicalLabel('ABC1D23')).toBe(false);
  });
});

describe('humanizePinLabel — nunca UUID no label do pin', () => {
  it('slug obs:hotspot:<uuid> → "<Tipo> · <id curto>"', () => {
    const out = humanizePinLabel(SLUG, 'Observation', NID);
    expect(out).toBe('Observation · 93fbd2d4');
    expect(out).not.toContain(UUID);
    expect(out).not.toContain('obs:hotspot');
  });
  it('UUID nu no name → "<Tipo> · <id curto>"', () => {
    expect(humanizePinLabel(UUID, 'Camera', NID)).toBe('Camera · 93fbd2d4');
  });
  it('nome humano → intocado', () => {
    expect(humanizePinLabel('Câmera Central', 'Camera', NID)).toBe('Câmera Central');
  });
  it('name vazio → "<Tipo> · <id curto>"', () => {
    expect(humanizePinLabel('', 'Event', 'abc12345-0000-0000-0000-000000000000')).toBe(
      'Event · abc12345',
    );
  });
});

describe('geofenceCenter — centroide pra flyTo', () => {
  it('polygon → média dos vértices', () => {
    const c = geofenceCenter({
      id: 'g', name: 'g', shape: 'polygon', active: true, severity: 'high',
      coordinates: [[-46.7, -23.5], [-46.5, -23.5], [-46.5, -23.7], [-46.7, -23.7]],
    });
    expect(c).not.toBeNull();
    expect(c!.lng).toBeCloseTo(-46.6);
    expect(c!.lat).toBeCloseTo(-23.6);
  });
  it('circle → center', () => {
    const c = geofenceCenter({
      id: 'g', name: 'g', shape: 'circle', active: true, severity: 'low',
      coordinates: { center: [-46.6, -23.6], radius_meters: 500 },
    });
    expect(c).toEqual({ lng: -46.6, lat: -23.6 });
  });
  it('coordenadas podres → null (nunca explode)', () => {
    expect(
      geofenceCenter({
        id: 'g', name: 'g', shape: 'polygon', active: true, severity: 'high',
        coordinates: null,
      }),
    ).toBeNull();
  });
});

describe('fenceBodyCoordinates — body por shape (paridade com o backend)', () => {
  it('polygon → anel cru [[lon,lat],...]', () => {
    const ringIn: LngLat[] = [[-46.7, -23.5], [-46.5, -23.5], [-46.5, -23.7]];
    expect(fenceBodyCoordinates({ shape: 'polygon', ring: ringIn })).toEqual(ringIn);
  });
  it('circle → {center, radius_meters}', () => {
    expect(
      fenceBodyCoordinates({ shape: 'circle', center: [-46.6, -23.6], radiusMeters: 500 }),
    ).toEqual({ center: [-46.6, -23.6], radius_meters: 500 });
  });
  it('route → {waypoints, width_meters}', () => {
    const wps: LngLat[] = [[-46.64, -23.52], [-46.64, -23.50]];
    expect(
      fenceBodyCoordinates({ shape: 'route', waypoints: wps, widthMeters: 80 }),
    ).toEqual({ waypoints: wps, width_meters: 80 });
  });
});

describe('fenceGeometryValid — geometria que o avaliador consegue acender', () => {
  it('polígono precisa de ≥3 vértices', () => {
    expect(fenceGeometryValid({ shape: 'polygon', ring: [[0, 0], [1, 1]] })).toBe(false);
    expect(
      fenceGeometryValid({ shape: 'polygon', ring: [[0, 0], [1, 1], [2, 0]] }),
    ).toBe(true);
  });
  it('círculo precisa de raio > 0', () => {
    expect(fenceGeometryValid({ shape: 'circle', center: [0, 0], radiusMeters: 0 })).toBe(false);
    expect(fenceGeometryValid({ shape: 'circle', center: [0, 0], radiusMeters: 10 })).toBe(true);
  });
  it('rota precisa de ≥2 pontos e largura > 0', () => {
    expect(
      fenceGeometryValid({ shape: 'route', waypoints: [[0, 0]], widthMeters: 50 }),
    ).toBe(false);
    expect(
      fenceGeometryValid({ shape: 'route', waypoints: [[0, 0], [1, 1]], widthMeters: 0 }),
    ).toBe(false);
    expect(
      fenceGeometryValid({ shape: 'route', waypoints: [[0, 0], [1, 1]], widthMeters: 50 }),
    ).toBe(true);
  });
});
