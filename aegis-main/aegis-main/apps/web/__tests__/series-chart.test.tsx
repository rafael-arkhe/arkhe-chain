/**
 * SeriesChart (componente de gráfico compartilhado Quiver + Time Series).
 * Refinamentos: ticks inteiros (sem duplicatas "2,2"), maxY=0 sem 5 zeros,
 * linha n=1 sem polilinha degenerada (só o ponto), acessibilidade (role/aria).
 */
import { render } from '@testing-library/react';
import { SeriesChart, MultiSeriesChart } from '@/components/charts/series-chart';

describe('SeriesChart — refinamentos', () => {
  it('barras: eixo Y usa passos inteiros (0..maxY) sem rótulos duplicados', () => {
    const { container } = render(<SeriesChart type="bar" series={[{ label: 'a', value: 3 }, { label: 'b', value: 2 }]} />);
    const svg = container.querySelector('[data-testid="chart-svg"]')!;
    // labels do eixo Y = textos numéricos à esquerda; com maxY=3 → 0,1,2,3 distintos
    const yLabels = Array.from(svg.querySelectorAll('text'))
      .map((t) => t.textContent || '')
      .filter((t) => /^\d+$/.test(t));
    expect(yLabels).toEqual(['0', '1', '2', '3']);
    expect(new Set(yLabels).size).toBe(yLabels.length); // sem duplicatas
  });

  it('linha com 1 ponto: renderiza o círculo, NÃO uma polilinha degenerada', () => {
    const { container } = render(<SeriesChart type="line" series={[{ label: 'único', value: 5 }]} />);
    expect(container.querySelectorAll('[data-testid="chart-point"]')).toHaveLength(1);
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('linha com ≥2 pontos: desenha a polilinha + os pontos', () => {
    const { container } = render(<SeriesChart type="line" series={[{ label: 'a', value: 1 }, { label: 'b', value: 4 }]} />);
    expect(container.querySelector('polyline')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="chart-point"]')).toHaveLength(2);
  });

  it('maxY=0 (tudo zero): eixo mostra 0 e 1, não cinco zeros', () => {
    const { container } = render(<SeriesChart type="bar" series={[{ label: 'a', value: 0 }, { label: 'b', value: 0 }]} />);
    const svg = container.querySelector('[data-testid="chart-svg"]')!;
    const yLabels = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent || '').filter((t) => /^\d+$/.test(t));
    expect(yLabels).toEqual(['0', '1']);
  });

  it('MultiSeriesChart: sobrepõe N séries (legenda + pontos por série) — eixo X unificado', () => {
    const { container } = render(
      <MultiSeriesChart type="line" series={[
        { name: 'temperatura', points: [{ label: '2026-05-01', value: 20 }, { label: '2026-05-02', value: 22 }] },
        { name: 'pressão', points: [{ label: '2026-05-01', value: 5 }, { label: '2026-05-02', value: 6 }] },
      ]} />,
    );
    // 2 entradas de legenda
    expect(container.querySelectorAll('[data-testid="ms-legend"] li')).toHaveLength(2);
    // 4 pontos (2 por série)
    expect(container.querySelectorAll('[data-testid="ms-point"]')).toHaveLength(4);
    expect(container.querySelector('[data-testid="chart-svg"]')?.getAttribute('aria-label')).toContain('temperatura');
  });

  it('acessibilidade: SVG tem role=img + aria-label resumindo a série', () => {
    const { container } = render(<SeriesChart type="pie" series={[{ label: 'aberta', value: 3 }, { label: 'resolvida', value: 2 }]} />);
    const svg = container.querySelector('[data-testid="chart-svg"]')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('aberta: 3');
    expect(svg.getAttribute('aria-label')).toContain('resolvida: 2');
    expect(container.querySelectorAll('[data-testid="chart-slice"]')).toHaveLength(2);
  });
});
