/**
 * B5.3 (MAPA /geo) — animações REAIS, real-driven, borda SEM glow.
 *
 * Curvas puras (testáveis sem Cesium): a "sonar ring" que marca a CHEGADA de
 * uma detecção nova é um anel que expande (scale) e some (alpha) — só BORDA,
 * nunca halo/glow. prefersReducedMotion desliga tudo (a11y).
 */
import {
  easeOutCubic,
  pulseRing,
  prefersReducedMotion,
} from '@/components/geo/geo-animations';

describe('easeOutCubic — desaceleração exponencial (sem bounce)', () => {
  it('0→0, 1→1, monotônica e já adiantada no meio', () => {
    expect(easeOutCubic(0)).toBeCloseTo(0);
    expect(easeOutCubic(1)).toBeCloseTo(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875); // 1-(0.5)^3
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // ease-OUT: adianta
  });
  it('clampa fora de [0,1]', () => {
    expect(easeOutCubic(-1)).toBeCloseTo(0);
    expect(easeOutCubic(2)).toBeCloseTo(1);
  });
});

describe('pulseRing — anel de chegada (expande + some, só borda)', () => {
  it('início: pequeno e visível', () => {
    const r = pulseRing(0, 1000);
    expect(r.scale).toBeCloseTo(0.3);
    expect(r.alpha).toBeCloseTo(0.85);
  });
  it('fim: expandido e invisível (pronto pra remover)', () => {
    const r = pulseRing(1000, 1000);
    expect(r.scale).toBeCloseTo(1.8);
    expect(r.alpha).toBeCloseTo(0);
  });
  it('passado o fim: continua invisível (clampa)', () => {
    expect(pulseRing(3000, 1000).alpha).toBeCloseTo(0);
  });
  it('meio: alpha decai linear, scale já adiantado (ease-out)', () => {
    const r = pulseRing(500, 1000);
    expect(r.alpha).toBeCloseTo(0.425); // 0.85 * (1-0.5)
    expect(r.scale).toBeGreaterThan(1.0); // ease-out adianta o crescimento
  });
});

describe('prefersReducedMotion — a11y (nunca explode)', () => {
  it('retorna boolean sem crashar em jsdom', () => {
    expect(typeof prefersReducedMotion()).toBe('boolean');
  });
});
