/** inc4 — clamp das larguras dos painéis do NDV (resizer 3-pane). */
import { clampPaneWidth, NDV_PANE_MIN, NDV_PANE_MAX } from '@/lib/pipeline/ndv-layout';

describe('clampPaneWidth', () => {
  it('trava no mínimo e no máximo', () => {
    expect(clampPaneWidth(50)).toBe(NDV_PANE_MIN);
    expect(clampPaneWidth(9999)).toBe(NDV_PANE_MAX);
  });
  it('preserva um valor dentro da faixa (arredondado)', () => {
    expect(clampPaneWidth(400.6)).toBe(401);
  });
  it('NaN cai no mínimo (defensivo)', () => {
    expect(clampPaneWidth(Number.NaN)).toBe(NDV_PANE_MIN);
  });
  it('respeita limites customizados', () => {
    expect(clampPaneWidth(100, 120, 500)).toBe(120);
    expect(clampPaneWidth(600, 120, 500)).toBe(500);
  });
});
