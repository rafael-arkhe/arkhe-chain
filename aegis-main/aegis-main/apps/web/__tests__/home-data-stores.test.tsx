/**
 * #12 — dedup do flood de requests da Home via stores COMPARTILHADOS.
 *
 * Cobre:
 *   A) createPollingStore (a primitiva): dedup de assinantes simultâneos +
 *      in-flight, TTL (refresh dentro da janela não refaz), 1 poller global,
 *      PAUSA em document.hidden + retoma ao voltar, e limpeza ao ficar ocioso
 *      (último unsubscribe zera cache/ready e para o poller).
 *   B) Hooks de rota (useCctvCount/useMeHome/useCctvDetections): montar
 *      MÚLTIPLOS consumidores (5 "KPI" + 1 "timeline") dispara 1 fetch por
 *      rota — não N — e os componentes continuam renderizando o número.
 *   C) me/context (useMeContext + providers reais I18n/Assistant): N
 *      consumidores → 1 GET /me/context; os providers ENTREGAM o valor.
 */
import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { createPollingStore } from '@/lib/data/polling-store';

// ── Mocks dos clients (só as rotas que os stores tocam) ──────────────────────
jest.mock('@/lib/api/cctv', () => ({
  Cctv: { count: jest.fn(), detections: jest.fn() },
}));
jest.mock('@/lib/api', () => ({
  Me: { home: jest.fn() },
}));

import { useCctvCount, _cctvCountStore } from '@/lib/data/cctv-count-store';
import { useMeHome, _meHomeStore } from '@/lib/data/me-home-store';
import {
  useCctvDetections,
  _cctvDetectionsStore,
} from '@/lib/data/cctv-detections-store';
import { useMeContext, _meContextStore } from '@/lib/data/me-context-store';
import { I18nProvider } from '@/lib/i18n/provider';
import {
  AssistantPrefProvider,
  useAssistantPref,
} from '@/lib/assistant/assistant-pref-provider';

const { Cctv } = jest.requireMock('@/lib/api/cctv') as {
  Cctv: { count: jest.Mock; detections: jest.Mock };
};
const { Me } = jest.requireMock('@/lib/api') as { Me: { home: jest.Mock } };

const flushMicro = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A) createPollingStore — a primitiva
// ─────────────────────────────────────────────────────────────────────────────
describe('A) createPollingStore', () => {
  afterEach(() => {
    jest.useRealTimers();
    setVisibility('visible');
  });

  it('dedup: K assinantes simultâneos disparam 1 fetch', async () => {
    const fetcher = jest.fn().mockResolvedValue({ n: 1 });
    const s = createPollingStore<{ n: number }>({ fetcher, ttlMs: 1000 });
    const unsubs = Array.from({ length: 5 }, () => s.subscribe(() => {}));
    await flushMicro();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot()).toEqual({ n: 1 });
    unsubs.forEach((u) => u());
  });

  it('in-flight: assinar enquanto o fetch está pendente não refaz', async () => {
    let resolve!: (v: { n: number }) => void;
    const fetcher = jest.fn(
      () => new Promise<{ n: number }>((r) => (resolve = r)),
    );
    const s = createPollingStore<{ n: number }>({ fetcher, ttlMs: 1000 });
    const u1 = s.subscribe(() => {}); // dispara o fetch (pendente)
    const u2 = s.subscribe(() => {}); // entra no meio do voo
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve({ n: 7 });
    await flushMicro();
    expect(s.getSnapshot()).toEqual({ n: 7 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    u1();
    u2();
  });

  it('TTL: refresh(false) reusa cache fresco; force=true refaz', async () => {
    const fetcher = jest.fn().mockResolvedValue({ n: 1 });
    const s = createPollingStore<{ n: number }>({ fetcher, ttlMs: 10_000 });
    const u = s.subscribe(() => {});
    await flushMicro();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await s.refresh(false); // dentro do TTL → não refaz
    expect(fetcher).toHaveBeenCalledTimes(1);
    await s.refresh(true); // força → refaz
    expect(fetcher).toHaveBeenCalledTimes(2);
    u();
  });

  it('poller: 1 tick por intervalo; PAUSA em document.hidden; retoma ao voltar', async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn().mockResolvedValue({ n: 1 });
    const s = createPollingStore<{ n: number }>({
      fetcher,
      pollMs: 1000,
      ttlMs: 1000,
    });
    const u = s.subscribe(() => {});
    expect(fetcher).toHaveBeenCalledTimes(1); // fetch inicial
    await jest.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2); // 1 tick

    // aba oculta → poller pausa
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await jest.advanceTimersByTimeAsync(3000);
    expect(fetcher).toHaveBeenCalledTimes(2); // nenhum tick enquanto oculta

    // volta → refetch imediato + retoma o poller
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicro();
    expect(fetcher).toHaveBeenCalledTimes(3); // recupera o atraso
    await jest.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(4);
    u();
  });

  it('ocioso: último unsubscribe para o poller, zera cache e ready', async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn().mockResolvedValue({ n: 1 });
    const s = createPollingStore<{ n: number }>({
      fetcher,
      pollMs: 1000,
      ttlMs: 1000,
    });
    const u1 = s.subscribe(() => {});
    const u2 = s.subscribe(() => {});
    await flushMicro();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(s.isReady()).toBe(true);

    u1(); // ainda há u2 → poller segue
    await jest.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    u2(); // último sai → ocioso
    expect(s.listenerCount()).toBe(0);
    expect(s.getSnapshot()).toBeNull();
    expect(s.isReady()).toBe(false);

    await jest.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(2); // poller parado
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) Hooks de rota — dedup com React real (5 KPI + 1 timeline) + regressão
// ─────────────────────────────────────────────────────────────────────────────
function KpiLike() {
  const { data: count } = useCctvCount();
  const { home, live } = useMeHome();
  return (
    <div data-testid="kpi">
      {live ? String(home.kpis.bos_24h.value) : '—'}|{count?.streams_online ?? '?'}
    </div>
  );
}
function TimelineLike() {
  const { data: count } = useCctvCount();
  const { home } = useMeHome();
  const { detections } = useCctvDetections();
  return (
    <div data-testid="timeline">
      {detections.length}ev·{home.timeline.length}base·{count?.streams_total ?? '?'}
    </div>
  );
}

describe('B) hooks de rota — 1 fetch por rota com múltiplos consumidores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _cctvCountStore._resetForTests();
    _meHomeStore._resetForTests();
    _cctvDetectionsStore._resetForTests();
    Cctv.count.mockResolvedValue({
      streams_total: 9,
      streams_online: 4,
      detections_total: 7,
    });
    Cctv.detections.mockResolvedValue([{ id: 'd1' }]);
    Me.home.mockResolvedValue({
      kpis: {
        bos_24h: { value: 42, delta_pct: null },
        mandados_abertos: { value: null, delta_pct: null },
        viaturas_ativas: { value: null, delta_pct: null },
        alertas_criticos: { value: null, delta_pct: null },
        operadores_online: { value: null, delta_pct: null },
      },
      timeline: [],
    });
  });

  it('5 KPI + 1 timeline → cctv.count 1×, me/home 1×, detections 1×', async () => {
    render(
      <>
        <KpiLike />
        <KpiLike />
        <KpiLike />
        <KpiLike />
        <KpiLike />
        <TimelineLike />
      </>,
    );
    await screen.findByTestId('timeline');

    // regressão: o número continua aparecendo (KPI = valor + streams online).
    await waitFor(() =>
      expect(screen.getAllByTestId('kpi')[0].textContent).toBe('42|4'),
    );
    expect(screen.getByTestId('timeline').textContent).toBe('1ev·0base·9');

    // dedup: 1 fetch por rota apesar de 6 consumidores.
    expect(Cctv.count).toHaveBeenCalledTimes(1);
    expect(Me.home).toHaveBeenCalledTimes(1);
    expect(Cctv.detections).toHaveBeenCalledTimes(1);
  });

  it('desmontar todos zera o store (próxima montagem refaz o fetch)', async () => {
    const { unmount } = render(<KpiLike />);
    await waitFor(() => expect(Cctv.count).toHaveBeenCalledTimes(1));
    unmount();
    expect(_cctvCountStore.getSnapshot()).toBeNull();
    expect(_cctvCountStore.listenerCount()).toBe(0);
    render(<KpiLike />);
    await waitFor(() => expect(Cctv.count).toHaveBeenCalledTimes(2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C) me/context — N consumidores → 1 GET; providers entregam o valor
// ─────────────────────────────────────────────────────────────────────────────
function CtxConsumer() {
  const { data } = useMeContext();
  const { showFab, ready } = useAssistantPref();
  return (
    <div data-testid="ctx">
      {data?.project_name ?? '—'}|fab={String(showFab)}|ready={String(ready)}
    </div>
  );
}

describe('C) me/context — dedup + providers entregam o valor', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    _meContextStore._resetForTests();
    fetchMock = jest.fn((url: string) => {
      if (String(url).includes('/api/me/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              organization_id: 'o',
              organization_name: 'SSP',
              space_id: null,
              space_name: null,
              project_id: 'p',
              project_name: 'Operação Hidra',
              locale: 'pt-BR',
              show_assistant_fab: true,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('I18n + Assistant + 2 consumidores → 1 GET /me/context', async () => {
    render(
      <I18nProvider>
        <AssistantPrefProvider>
          <CtxConsumer />
          <CtxConsumer />
        </AssistantPrefProvider>
      </I18nProvider>,
    );

    // providers/consumidores entregam o valor do contexto
    await waitFor(() =>
      expect(screen.getAllByTestId('ctx')[0].textContent).toContain(
        'Operação Hidra',
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('ctx')[0].textContent).toContain('fab=true'),
    );

    // dedup: 1 único GET apesar de 4 assinantes do store
    const getCalls = fetchMock.mock.calls.filter(
      ([u, init]) =>
        String(u).includes('/api/me/context') &&
        (!init || (init as RequestInit).method === undefined),
    );
    expect(getCalls).toHaveLength(1);
  });
});
