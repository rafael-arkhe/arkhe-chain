/**
 * FE-B — feedback de DESEMPENHO (decorrido + ETA + cobertura).
 *
 * Prova as funções puras:
 *   - formatElapsed (m:ss);
 *   - estimateEtaSeconds (ondas de paralelismo × timeout, HONESTA);
 *   - coverageFromItem + msToSeconds (lê found_count/checked/duration_ms do
 *     envelope cru, em raw / raw.data).
 */
import {
  formatElapsed,
  estimateEtaSeconds,
  coverageFromItem,
  msToSeconds,
  FANOUT_HTTP_CONCURRENCY,
  DEFAULT_SITE_TIMEOUT_S,
} from '@/lib/buscar/perf';
import type { FilaItem, SourceDef } from '@/lib/buscar/types';

function src(tool: string): SourceDef {
  return { key: tool, label: tool, category: 'username', mcpTool: tool };
}
function doneItem(raw: unknown, durationMs?: number): FilaItem {
  return {
    id: 'x',
    query: 'alvo',
    source: src('maigret_username@v1'),
    status: 'done',
    results: [{ externalId: 'r', name: 'r', kind: 'k', raw }],
    queuedAt: 0,
    startedAt: 0,
    finishedAt: durationMs ?? 1000,
    durationMs,
  };
}

describe('formatElapsed — m:ss', () => {
  it('0:08, 1:35, 2:00', () => {
    expect(formatElapsed(8_000)).toBe('0:08');
    expect(formatElapsed(95_000)).toBe('1:35');
    expect(formatElapsed(120_000)).toBe('2:00');
  });
  it('arredonda pra baixo e nunca negativo', () => {
    expect(formatElapsed(8_999)).toBe('0:08');
    expect(formatElapsed(-50)).toBe('0:00');
  });
});

describe('estimateEtaSeconds — estimativa honesta (ondas × timeout)', () => {
  it('poucos sites (≤ paralelismo) = 1 onda = 1 timeout', () => {
    expect(estimateEtaSeconds({ siteCount: 10, timeoutPerSiteS: 20 })).toBe(20);
    expect(
      estimateEtaSeconds({ siteCount: FANOUT_HTTP_CONCURRENCY, timeoutPerSiteS: 30 }),
    ).toBe(30);
  });
  it('muitos sites = várias ondas (ceil)', () => {
    // 3129 sites / 64 = 49 ondas × 20s
    expect(
      estimateEtaSeconds({ siteCount: 3129, timeoutPerSiteS: 20, concurrency: 64 }),
    ).toBe(49 * 20);
  });
  it('sem timeout usa o default; sem #sites estima 1 timeout', () => {
    expect(estimateEtaSeconds({ siteCount: 100 })).toBe(
      Math.ceil(100 / FANOUT_HTTP_CONCURRENCY) * DEFAULT_SITE_TIMEOUT_S,
    );
    expect(estimateEtaSeconds({ siteCount: 0, timeoutPerSiteS: 15 })).toBe(15);
  });
});

describe('coverageFromItem — lê o envelope cru (found_count/checked/duration_ms)', () => {
  it('wmn: checked + found_count + duration_ms em raw.data', () => {
    const cov = coverageFromItem(
      doneItem({ status: 200, data: { checked: 680, found_count: 12, duration_ms: 8400 } }),
    );
    expect(cov.checked).toBe(680);
    expect(cov.foundCount).toBe(12);
    expect(cov.durationMs).toBe(8400);
  });
  it('maigret: só found_count (sem checked); duração cai no FilaItem.durationMs', () => {
    const cov = coverageFromItem(doneItem({ data: { found_count: 4 } }, 5200));
    expect(cov.checked).toBeUndefined();
    expect(cov.foundCount).toBe(4);
    expect(cov.durationMs).toBe(5200);
  });
  it('found como string numérica também conta', () => {
    const cov = coverageFromItem(doneItem({ found_count: '7' }));
    expect(cov.foundCount).toBe(7);
  });
  it('envelope sem campos de cobertura → vazio (UI cai no padrão)', () => {
    const cov = coverageFromItem(doneItem({ data: { dados: [] } }));
    expect(cov.checked).toBeUndefined();
    expect(cov.foundCount).toBeUndefined();
  });
});

describe('msToSeconds', () => {
  it('≥10s arredonda inteiro; <10s 1 casa', () => {
    expect(msToSeconds(8400)).toBe('8.4');
    expect(msToSeconds(12300)).toBe('12');
  });
  it('undefined → null', () => {
    expect(msToSeconds(undefined)).toBeNull();
  });
});
