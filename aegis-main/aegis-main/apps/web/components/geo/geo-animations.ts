/**
 * B5.3 (MAPA /geo) — curvas de animação PURAS (sem Cesium, sem I/O).
 *
 * Regra DS travada: motion REAL-DRIVEN (chegada de dado real → pulso), nível
 * Palantir, **SÓ BORDA, SEM GLOW** (nunca halo/feGaussianBlur), e sempre
 * respeitando prefers-reduced-motion. A "sonar ring" da chegada é um anel que
 * expande e some — a borda comunica, não o brilho.
 */

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Ease-out cúbico (desaceleração exponencial, sem bounce). t∈[0,1]. */
export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

/**
 * Anel de CHEGADA (marca uma detecção/objeto novo): expande de 0.3→1.8 (raio
 * relativo, ease-out) e some de 0.85→0 (alpha, linear). Depois do fim fica
 * invisível (o chamador remove a entidade). Só BORDA — sem preenchimento/halo.
 */
export function pulseRing(
  elapsedMs: number,
  durationMs: number,
): { scale: number; alpha: number } {
  const t = clamp01(durationMs > 0 ? elapsedMs / durationMs : 1);
  return {
    scale: 0.3 + 1.5 * easeOutCubic(t),
    alpha: 0.85 * (1 - t),
  };
}

/** Duração padrão do anel de chegada (ms). */
export const PULSE_DURATION_MS = 1400;

/** a11y: o operador pediu redução de movimento? (nunca explode fora do browser) */
export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}
