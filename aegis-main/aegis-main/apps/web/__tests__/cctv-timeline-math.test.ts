/**
 * Timeline temporal de /cameras — matemática PURA (lib/cctv-timeline.ts).
 *
 * Invariantes:
 *  - posPct: posição = TEMPO (escala linear da janela), nunca índice;
 *  - mediaToAbsMs / absToMediaS: a playlist VOD comprime os buracos entre
 *    janelas de coverage (EXT-X-DISCONTINUITY não soma tempo) — o mapeamento
 *    anda janela a janela;
 *  - isoToMs: detected_at sem sufixo de TZ é UTC (mesma regra do
 *    lib/datetime.ts).
 */
import {
  absToMediaS,
  isInCoverage,
  isoToMs,
  mediaToAbsMs,
  mergeCoverage,
  posPct,
  type CoverageWindow,
} from '@/lib/cctv-timeline';

describe('posPct — posição linear por tempo', () => {
  test('meio da janela = 50%', () => {
    expect(posPct(1_500_000, 1_000_000, 2_000_000)).toBe(50);
  });
  test('quarto da janela = 25%', () => {
    expect(posPct(1_250_000, 1_000_000, 2_000_000)).toBe(25);
  });
  test('clampa fora da janela em 0..100', () => {
    expect(posPct(900_000, 1_000_000, 2_000_000)).toBe(0);
    expect(posPct(3_000_000, 1_000_000, 2_000_000)).toBe(100);
  });
  test('janela degenerada não divide por zero', () => {
    expect(posPct(1_000_000, 1_000_000, 1_000_000)).toBe(0);
  });
});

const COVERAGE: CoverageWindow[] = [
  { t_start_ms: 100_000, t_end_ms: 160_000 }, // 60s
  { t_start_ms: 200_000, t_end_ms: 230_000 }, // buraco de 40s comprimido; +30s
];

describe('mediaToAbsMs — tempo de mídia VOD → wall-clock', () => {
  test('dentro da 1ª janela', () => {
    expect(mediaToAbsMs(COVERAGE, 10)).toBe(110_000);
  });
  test('o buraco é comprimido: 70s de mídia = 10s na 2ª janela', () => {
    expect(mediaToAbsMs(COVERAGE, 70)).toBe(210_000);
  });
  test('além do fim clampa no fim da última janela', () => {
    expect(mediaToAbsMs(COVERAGE, 9_999)).toBe(230_000);
  });
  test('sem coverage → null', () => {
    expect(mediaToAbsMs([], 10)).toBeNull();
  });
});

describe('absToMediaS — wall-clock → tempo de mídia VOD', () => {
  test('dentro da 1ª janela', () => {
    expect(absToMediaS(COVERAGE, 110_000)).toBe(10);
  });
  test('dentro da 2ª janela (buraco comprimido)', () => {
    expect(absToMediaS(COVERAGE, 210_000)).toBe(70);
  });
  test('instante num buraco cai no início da próxima janela', () => {
    expect(absToMediaS(COVERAGE, 180_000)).toBe(60);
  });
  test('antes da 1ª janela → 0; depois da última → duração total', () => {
    expect(absToMediaS(COVERAGE, 50_000)).toBe(0);
    expect(absToMediaS(COVERAGE, 500_000)).toBe(90);
  });
  test('sem coverage → null', () => {
    expect(absToMediaS([], 110_000)).toBeNull();
  });
  test('ida e volta é consistente', () => {
    const abs = mediaToAbsMs(COVERAGE, 75)!;
    expect(absToMediaS(COVERAGE, abs)).toBe(75);
  });
});

describe('isInCoverage — instante coberto vs buraco (mosaico sync)', () => {
  test('dentro de uma janela → true (bordas inclusas)', () => {
    expect(isInCoverage(COVERAGE, 110_000)).toBe(true);
    expect(isInCoverage(COVERAGE, 100_000)).toBe(true);
    expect(isInCoverage(COVERAGE, 160_000)).toBe(true);
  });
  test('num buraco entre janelas → false (célula pausa e espera)', () => {
    expect(isInCoverage(COVERAGE, 180_000)).toBe(false);
  });
  test('antes da 1ª / depois da última → false', () => {
    expect(isInCoverage(COVERAGE, 50_000)).toBe(false);
    expect(isInCoverage(COVERAGE, 500_000)).toBe(false);
  });
  test('sem coverage → false', () => {
    expect(isInCoverage([], 110_000)).toBe(false);
  });
});

describe('mergeCoverage — fusão das janelas de N câmeras (timeline compartilhada)', () => {
  test('janelas sobrepostas fundem numa só', () => {
    expect(
      mergeCoverage([
        [{ t_start_ms: 100, t_end_ms: 200 }],
        [{ t_start_ms: 150, t_end_ms: 300 }],
      ]),
    ).toEqual([{ t_start_ms: 100, t_end_ms: 300 }]);
  });
  test('janelas adjacentes (encostadas) fundem', () => {
    expect(
      mergeCoverage([
        [{ t_start_ms: 100, t_end_ms: 200 }],
        [{ t_start_ms: 200, t_end_ms: 250 }],
      ]),
    ).toEqual([{ t_start_ms: 100, t_end_ms: 250 }]);
  });
  test('janelas disjuntas ficam separadas e ordenadas', () => {
    expect(
      mergeCoverage([
        [{ t_start_ms: 400, t_end_ms: 500 }],
        [{ t_start_ms: 100, t_end_ms: 200 }],
      ]),
    ).toEqual([
      { t_start_ms: 100, t_end_ms: 200 },
      { t_start_ms: 400, t_end_ms: 500 },
    ]);
  });
  test('listas vazias → []', () => {
    expect(mergeCoverage([])).toEqual([]);
    expect(mergeCoverage([[], []])).toEqual([]);
  });
});

describe('isoToMs — detected_at do backend', () => {
  test('ISO com Z parseia direto', () => {
    expect(isoToMs('2026-06-12T12:00:00Z')).toBe(Date.parse('2026-06-12T12:00:00Z'));
  });
  test('ISO sem TZ é tratado como UTC (regra do lib/datetime)', () => {
    expect(isoToMs('2026-06-12T12:00:00')).toBe(Date.parse('2026-06-12T12:00:00Z'));
  });
});
