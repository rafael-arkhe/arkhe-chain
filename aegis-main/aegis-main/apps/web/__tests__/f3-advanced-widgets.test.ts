/**
 * F3 — widgets avançados (lógica pura, sem render pesado).
 *  - buildSpecFromPreset: o construtor de gráfico gera o Vega-Lite certo por
 *    tipo (pizza/rosca/heatmap/dispersão/barra) — o operador NUNCA escreve JSON.
 *  - resolveImages: resolve URL direta / propriedade do objeto / galeria.
 *  - WIDGET_EMITS: network_graph emite select_change (sem gap no editor).
 */
import { buildSpecFromPreset } from '@/components/workshop/widgets/vega-chart';
import { resolveImages } from '@/components/workshop/widgets/image';
import { WIDGET_EMITS } from '@/lib/workshop/widget-emits';

describe('vega chart builder (buildSpecFromPreset)', () => {
  it('pizza → arc + theta(medida) + color(categoria)', () => {
    const s = buildSpecFromPreset({ preset: 'pie', x_field: 'tipo', y_field: 'total' })!;
    expect((s.mark as { type?: string }).type).toBe('arc');
    expect(s.encoding?.color?.field).toBe('tipo');
  });

  it('rosca → arc com innerRadius', () => {
    const s = buildSpecFromPreset({ preset: 'donut', x_field: 'tipo' })!;
    expect((s.mark as { innerRadius?: number }).innerRadius).toBeGreaterThan(0);
  });

  it('heatmap → rect com x, y e cor agregada', () => {
    const s = buildSpecFromPreset({ preset: 'heatmap', x_field: 'bairro', color_field: 'tipo' })!;
    expect(s.mark).toBe('rect');
    expect(s.encoding?.x?.field).toBe('bairro');
    expect(s.encoding?.y?.field).toBe('tipo');
  });

  it('dispersão → point com x/y quantitativos', () => {
    const s = buildSpecFromPreset({ preset: 'scatter', x_field: 'a', y_field: 'b' })!;
    expect(s.mark).toBe('point');
    expect(s.encoding?.x?.type).toBe('quantitative');
  });

  it('barra sem y → contagem (aggregate count)', () => {
    const s = buildSpecFromPreset({ preset: 'bar', x_field: 'uf' })!;
    expect(s.mark).toBe('bar');
    expect((s.encoding?.y as { aggregate?: string }).aggregate).toBe('count');
  });

  it('advanced/sem campos → null (cai no spec cru / estado vazio)', () => {
    expect(buildSpecFromPreset({ preset: 'advanced' })).toBeNull();
    expect(buildSpecFromPreset({ preset: 'bar' })).toBeNull(); // sem x_field
  });
});

describe('image resolveImages', () => {
  it('URL direta tem prioridade', () => {
    expect(resolveImages({ url: 'https://x/y.jpg' }, {})).toEqual([{ url: 'https://x/y.jpg' }]);
  });
  it('lista → galeria (image_url por padrão)', () => {
    const imgs = resolveImages(
      { source: 'fotos' },
      { fotos: [{ image_url: 'https://a/1.jpg' }, { image_url: 'https://a/2.jpg' }] },
    );
    expect(imgs).toHaveLength(2);
  });
  it('objeto único via source_field', () => {
    const imgs = resolveImages(
      { source: 'obj', source_field: 'foto' },
      { obj: { properties: { foto: 'https://a/p.png' } } },
    );
    expect(imgs).toEqual([{ url: 'https://a/p.png' }]);
  });
  it('sem fonte → vazio', () => {
    expect(resolveImages({}, {})).toEqual([]);
  });
});

describe('network_graph emite select_change', () => {
  it('está no WIDGET_EMITS', () => {
    expect(WIDGET_EMITS.network_graph).toEqual(['select_change']);
  });
});
