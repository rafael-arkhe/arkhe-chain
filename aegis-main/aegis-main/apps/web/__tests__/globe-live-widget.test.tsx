/**
 * Widget globe_live (V2) — par 3D do map_live, MESMO contrato.
 *
 * Cesium é client-only/WebGL (não roda em jsdom) → testamos a derivação PURA
 * (toGlobePoints reusa toMarkers: lê geopoint de properties, multidomínio) +
 * registro/meta. O picking→select_change e o render Cesium são certificados
 * ao vivo no browser.
 */
jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

import { getWidgetMeta } from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets/globe-live';
import { toGlobePoints } from '@/components/workshop/widgets/globe-live';

describe('globe_live (V2) — derivação genérica', () => {
  it('toGlobePoints lê lat/lng top-level E geopoint dentro de properties', () => {
    const vars = {
      pts: [
        { id: 'n1', name: 'estrutura 1', properties: { localizacao: { lat: -23.55, lng: -46.63 } } },
        { id: 'n2', lat: -10, lng: -50, label: 'Ativo' },
        { id: 'n3', name: 'sem-geo', properties: { cor: 'x' } }, // ignorado
      ],
    };
    const pts = toGlobePoints(vars, { source: 'pts' });
    expect(pts).toHaveLength(2);
    expect(pts[0]).toMatchObject({ id: 'n1', lat: -23.55, lng: -46.63 });
    expect(pts[1]).toMatchObject({ id: 'n2', lat: -10, lng: -50 });
  });

  it('label do ponto é texto limpo (sem HTML do popup rico)', () => {
    const pts = toGlobePoints(
      { pts: [{ id: 'n1', name: 'casa', properties: { localizacao: { lat: 1, lng: 2 }, obs: 'x' } }] },
      { source: 'pts' },
    );
    expect(pts[0].label).not.toContain('<');
    expect(pts[0].label).toContain('casa');
  });

  it('é proposable e declara mockConfig/mockVariables (regra da paleta)', () => {
    const meta = getWidgetMeta('globe_live')!;
    expect(meta.mockConfig).toBeTruthy();
    expect(meta.mockVariables).toBeTruthy();
    expect(meta.label).toBe('Globo (3D)');
  });
});
