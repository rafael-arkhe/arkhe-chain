/**
 * B4 (MAPA /geo) — sistema de marcadores "moldura mil-spec" (design aprovado):
 *   - a FORMA da moldura codifica a CATEGORIA (◇ evento/detecção · □ ativo/infra
 *     · ○ sensor/observação);
 *   - a cor de ESTADO é a única saturada; a borda é aço #2D77BE (estrutural);
 *   - cantos retos, SEM glow (nunca feGaussianBlur/halo).
 * B5.1 — carregamento por viewport: rectangleToBbox converte o retângulo da
 *   câmera Cesium (radianos) em "min_lon,min_lat,max_lon,max_lat" (graus).
 *
 * Helpers PUROS (sem Cesium, sem I/O) — o generator devolve SVG/data-URI.
 */
import { categoryForNodeType, rectangleToBbox } from '@/components/geo/geo-utils';
import {
  markerSvg,
  markerImage,
  clusterSvg,
  clusterImage,
  type MarkerCategory,
} from '@/components/geo/geo-markers';

const STEEL = '#2D77BE';

describe('categoryForNodeType — forma da moldura por papel genérico (sem hardcode de domínio)', () => {
  it('observação/sensor/câmera → sensor (○)', () => {
    expect(categoryForNodeType('Observation')).toBe('sensor');
    expect(categoryForNodeType('cctv_camera')).toBe('sensor');
    expect(categoryForNodeType('weather_station')).toBe('sensor');
  });
  it('evento/detecção/alerta/foco → event (◇)', () => {
    expect(categoryForNodeType('Event')).toBe('event');
    expect(categoryForNodeType('face_detection')).toBe('event');
    expect(categoryForNodeType('hotspot')).toBe('event');
  });
  it('o resto → asset (□)', () => {
    expect(categoryForNodeType('Vehicle')).toBe('asset');
    expect(categoryForNodeType('building')).toBe('asset');
  });
});

describe('rectangleToBbox — retângulo da câmera (rad) → bbox (graus) p/ carregamento por viewport', () => {
  const d2r = (d: number) => (d * Math.PI) / 180;
  it('retângulo pequeno → bbox em graus min<max', () => {
    // ~SP: lon [-47,-46], lat [-24,-23]
    const bbox = rectangleToBbox(d2r(-47), d2r(-24), d2r(-46), d2r(-23));
    expect(bbox).not.toBeNull();
    const [minLon, minLat, maxLon, maxLat] = bbox!.split(',').map(Number);
    expect(minLon).toBeCloseTo(-47, 3);
    expect(minLat).toBeCloseTo(-24, 3);
    expect(maxLon).toBeCloseTo(-46, 3);
    expect(maxLat).toBeCloseTo(-23, 3);
  });
  it('globo inteiro (zoom out) → null (carrega sem bbox, evita recorte inútil)', () => {
    expect(rectangleToBbox(d2r(-179), d2r(-85), d2r(179), d2r(85))).toBeNull();
  });
  it('retângulo inválido/ausente → null', () => {
    expect(rectangleToBbox(NaN, 0, 1, 1)).toBeNull();
    expect(rectangleToBbox(d2r(10), d2r(10), d2r(10), d2r(10))).toBeNull(); // degenerado
  });
});

describe('markerSvg — moldura por categoria, borda aço, estado saturado, SEM glow', () => {
  const cats: [MarkerCategory, RegExp][] = [
    ['event', /<polygon/],   // losango
    ['asset', /<rect/],      // quadrado
    ['sensor', /<circle/],   // círculo
  ];
  it.each(cats)('categoria %s usa a forma certa', (category, shapeRe) => {
    const svg = markerSvg({ category, color: '#3D9F58' });
    expect(svg).toMatch(shapeRe);
  });
  it('borda aço #2D77BE estrutural sempre presente', () => {
    for (const category of ['event', 'asset', 'sensor'] as MarkerCategory[]) {
      expect(markerSvg({ category, color: '#3D9F58' })).toContain(STEEL);
    }
  });
  it('NUNCA glow: sem feGaussianBlur / blur / halo', () => {
    const svg = markerSvg({ category: 'event', color: '#C8341F', severity: 'critical', selected: true });
    expect(svg).not.toMatch(/feGaussianBlur/i);
    expect(svg).not.toMatch(/blur/i);
  });
  it('a cor de estado (severidade) entra como a saturada', () => {
    const svg = markerSvg({ category: 'sensor', color: '#8A93A0', severity: 'critical' });
    expect(svg).toContain('#C8341F'); // SEVERITY_COLOR.critical
  });
  it('selecionado difere do normal (anel de seleção)', () => {
    const base = markerSvg({ category: 'asset', color: '#2D77BE' });
    const sel = markerSvg({ category: 'asset', color: '#2D77BE', selected: true });
    expect(sel).not.toEqual(base);
  });
  it('glifo monolinha do TIPO dentro da moldura (não é só a forma)', () => {
    // evento = reticula (<path>); ativo = bloco (2º <rect>); sensor = anel (2º <circle>)
    expect(markerSvg({ category: 'event', color: '#3D9F58' })).toMatch(/<path/);
    expect((markerSvg({ category: 'asset', color: '#3D9F58' }).match(/<rect/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((markerSvg({ category: 'sensor', color: '#3D9F58' }).match(/<circle/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it('glifo tem contraste: fio claro (INK) sobre preenchimento claro', () => {
    // amber claro (#E8B33B) → glifo INK #0a0e14 (não branco invisível)
    expect(markerSvg({ category: 'asset', color: '#E8B33B' })).toContain('#0a0e14');
  });
});

describe('markerImage / clusterImage — data-URI SVG p/ billboard do Cesium', () => {
  it('markerImage é data:image/svg+xml', () => {
    expect(markerImage({ category: 'event', color: '#E97D2A' })).toMatch(/^data:image\/svg\+xml/);
  });
  it('clusterSvg mostra a contagem + borda aço; clusterImage é data-URI', () => {
    const svg = clusterSvg(42);
    expect(svg).toContain('42');
    expect(svg).toContain(STEEL);
    expect(svg).not.toMatch(/feGaussianBlur/i);
    expect(clusterImage(42)).toMatch(/^data:image\/svg\+xml/);
  });
});
