/**
 * Matemática PURA da timeline temporal de /cameras.
 *
 * A playlist VOD da gravação (GET /streams/{id}/recordings/playlist.m3u8)
 * concatena os segmentos .ts em ordem e COMPRIME os buracos entre janelas
 * de coverage (EXT-X-DISCONTINUITY não soma tempo de mídia). Estas funções
 * fazem o vai-e-vem entre:
 *
 *   - tempo de MÍDIA (segundos no <video> tocando a VOD), e
 *   - wall-clock (epoch ms — o eixo da timeline, dos detected_at e dos
 *     bookmarks t_ms).
 *
 * Mantidas puras (sem React/DOM) pra teste unitário direto —
 * __tests__/cctv-timeline-math.test.ts.
 */

export interface CoverageWindow {
  t_start_ms: number;
  t_end_ms: number;
}

/** Posição % (0..100) de um instante na janela [fromMs, toMs] — escala
 *  LINEAR de tempo, clampada. Janela degenerada → 0. */
export function posPct(atMs: number, fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  const pct = ((atMs - fromMs) / (toMs - fromMs)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** Tempo de mídia (s) da playlist VOD → wall-clock (ms). Anda janela a
 *  janela; além do fim clampa no fim da última janela. null sem coverage. */
export function mediaToAbsMs(
  coverage: CoverageWindow[],
  mediaS: number,
): number | null {
  if (!coverage.length || mediaS < 0) return null;
  let remainingMs = mediaS * 1000;
  for (const w of coverage) {
    const durMs = w.t_end_ms - w.t_start_ms;
    if (remainingMs <= durMs) return w.t_start_ms + remainingMs;
    remainingMs -= durMs;
  }
  return coverage[coverage.length - 1].t_end_ms;
}

/** Wall-clock (ms) → tempo de mídia (s) na playlist VOD. Instante num
 *  buraco cai no INÍCIO da próxima janela; antes da 1ª → 0; depois da
 *  última → duração total. null sem coverage. */
export function absToMediaS(
  coverage: CoverageWindow[],
  absMs: number,
): number | null {
  if (!coverage.length) return null;
  let accMs = 0;
  for (const w of coverage) {
    if (absMs < w.t_start_ms) return accMs / 1000;
    if (absMs <= w.t_end_ms) return (accMs + (absMs - w.t_start_ms)) / 1000;
    accMs += w.t_end_ms - w.t_start_ms;
  }
  return accMs / 1000;
}

/** O instante wall-clock está DENTRO de alguma janela de coverage?
 *  Bordas inclusas. Usado pelo mosaico sincronizado: célula cujo relógio
 *  mestre cai num buraco DA SUA gravação pausa (overlay honesto) e
 *  re-entra quando o relógio alcança a próxima janela. */
export function isInCoverage(coverage: CoverageWindow[], absMs: number): boolean {
  return coverage.some((w) => absMs >= w.t_start_ms && absMs <= w.t_end_ms);
}

/** Funde as coverages de N câmeras numa lista ordenada de janelas sem
 *  sobreposição (janelas encostadas também fundem) — alimenta o sombreado
 *  da timeline COMPARTILHADA do mosaico. */
export function mergeCoverage(coverages: CoverageWindow[][]): CoverageWindow[] {
  const all = coverages
    .flat()
    .filter((w) => w.t_end_ms > w.t_start_ms)
    .sort((x, y) => x.t_start_ms - y.t_start_ms);
  const merged: CoverageWindow[] = [];
  for (const w of all) {
    const last = merged[merged.length - 1];
    if (last && w.t_start_ms <= last.t_end_ms) {
      last.t_end_ms = Math.max(last.t_end_ms, w.t_end_ms);
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

/** ISO do backend → epoch ms. String sem sufixo de TZ é UTC (mesma regra
 *  do parse de lib/datetime.ts — Postgres TIMESTAMP sem TZ é UTC). */
export function isoToMs(iso: string): number {
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) return Date.parse(iso + 'Z');
  return Date.parse(iso);
}
