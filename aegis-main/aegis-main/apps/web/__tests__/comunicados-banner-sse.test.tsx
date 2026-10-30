/**
 * Wave L.8 (2026-05-23) — ComunicadosBanner SSE push + fallback.
 *
 * Cobre o novo transporte real-time do banner:
 *  1. SSE entrega ``event: comunicados`` → banner renderiza sem polling.
 *  2. Novo frame SSE atualiza a lista in-place (push, sem reload).
 *  3. SSE indisponível (sem EventSource) → cai pro polling de fallback.
 *  4. SSE erra antes de entregar dados (2x) → fallback assume polling.
 *  5. EventSource é fechado no unmount (sem leak).
 *
 * Usa um fake EventSource controlável (jsdom não tem a API).
 */
import { render, screen, act, waitFor } from '@testing-library/react';
import { ComunicadosBanner } from '@/components/shell/comunicados-banner';

jest.mock('@/lib/api', () => ({
  Comunicados: {
    active: jest.fn(),
    dismissMe: jest.fn().mockResolvedValue(undefined),
    streamUrl: '/api/platform/v23/comunicados/stream',
  },
}));

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (key: string) => {
    const dict: Record<string, string> = {
      'comunicados.dismiss': 'Fechar comunicado',
      'comunicados.moreCount': '+{n} comunicado(s) adicional(is)',
    };
    return dict[key] ?? key;
  },
}));

import { Comunicados } from '@/lib/api';
const mockActive = Comunicados.active as jest.MockedFunction<
  typeof Comunicados.active
>;

function makeComunicado(over: Partial<any> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    tenant_id: '22222222-2222-2222-2222-222222222222',
    kind: 'info',
    title: 'Comunicado padrão',
    body: '',
    icon: null,
    closable: true,
    duration_s: 0,
    audience_roles: null,
    audience_iam_perms: null,
    schedule_start: null,
    schedule_end: null,
    schedule_days_of_week: null,
    cta_label: null,
    cta_href: null,
    created_at: '2026-05-23T12:00:00Z',
    created_by_user_id: null,
    deleted_at: null,
    ...over,
  };
}

// ── Fake EventSource controlável ───────────────────────────────────────────

type Listener = (ev: MessageEvent) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials: boolean;
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  private listeners: Record<string, Listener[]> = {};
  closed = false;

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = !!init?.withCredentials;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: Listener) {
    (this.listeners[type] ??= []).push(cb);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  // Helpers de teste.
  emit(type: string, data: string) {
    const ev = { data } as MessageEvent;
    (this.listeners[type] ?? []).forEach((cb) => cb(ev));
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  error() {
    this.onerror?.(new Event('error'));
  }
}

const realEventSource = (globalThis as any).EventSource;

beforeEach(() => {
  jest.useFakeTimers();
  mockActive.mockReset();
  mockActive.mockResolvedValue([] as never);
  FakeEventSource.instances = [];
  (globalThis as any).EventSource = FakeEventSource;
});

afterEach(() => {
  jest.useRealTimers();
  (globalThis as any).EventSource = realEventSource;
});

function lastES(): FakeEventSource {
  const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
  if (!es) throw new Error('nenhum EventSource criado');
  return es;
}

// 1.
test('SSE entrega comunicados → banner renderiza sem usar polling', async () => {
  render(<ComunicadosBanner />);
  await act(async () => {
    await Promise.resolve();
  });
  const es = lastES();
  expect(es.url).toBe('/api/platform/v23/comunicados/stream');
  expect(es.withCredentials).toBe(true);

  await act(async () => {
    es.open();
    es.emit(
      'comunicados',
      JSON.stringify([makeComunicado({ id: 'p1', title: 'Via push' })]),
    );
    await Promise.resolve();
  });

  const banner = await screen.findByTestId('comunicado-banner');
  expect(banner).toHaveTextContent('Via push');
  // Caminho feliz: polling NUNCA foi chamado.
  expect(mockActive).not.toHaveBeenCalled();
});

// 2.
test('frame SSE subsequente atualiza a lista in-place (push)', async () => {
  render(<ComunicadosBanner />);
  await act(async () => {
    await Promise.resolve();
  });
  const es = lastES();

  await act(async () => {
    es.emit(
      'comunicados',
      JSON.stringify([makeComunicado({ id: 'a', title: 'Primeiro' })]),
    );
    await Promise.resolve();
  });
  expect(await screen.findByTestId('comunicado-banner')).toHaveTextContent(
    'Primeiro',
  );

  // Servidor empurra novo estado (comunicado urgente chega).
  await act(async () => {
    es.emit(
      'comunicados',
      JSON.stringify([
        makeComunicado({ id: 'a', title: 'Primeiro' }),
        makeComunicado({ id: 'b', kind: 'danger', title: 'URGENTE' }),
      ]),
    );
    await Promise.resolve();
  });
  const banners = await screen.findAllByTestId('comunicado-banner');
  expect(banners).toHaveLength(2);
  expect(banners[1]).toHaveTextContent('URGENTE');
  expect(mockActive).not.toHaveBeenCalled();
});

// 3.
test('sem EventSource no ambiente → cai pro polling de fallback', async () => {
  (globalThis as any).EventSource = undefined;
  mockActive.mockResolvedValue([
    makeComunicado({ id: 'poll', title: 'Via polling' }),
  ] as never);

  render(<ComunicadosBanner />);
  await act(async () => {
    await Promise.resolve();
  });

  const banner = await screen.findByTestId('comunicado-banner');
  expect(banner).toHaveTextContent('Via polling');
  expect(mockActive).toHaveBeenCalled();
  // Nenhum EventSource foi criado.
  expect(FakeEventSource.instances).toHaveLength(0);
});

// 4.
test('SSE que erra antes de entregar dados (2x) → fallback polling assume', async () => {
  mockActive.mockResolvedValue([
    makeComunicado({ id: 'fb', title: 'Fallback ok' }),
  ] as never);

  render(<ComunicadosBanner />);
  await act(async () => {
    await Promise.resolve();
  });
  const es = lastES();

  // 1ª falha — EventSource ainda tentaria reconectar sozinho.
  await act(async () => {
    es.error();
    await Promise.resolve();
  });
  expect(mockActive).not.toHaveBeenCalled();

  // 2ª falha → desiste do SSE, fecha e assume polling.
  await act(async () => {
    es.error();
    await Promise.resolve();
  });

  await waitFor(() => expect(mockActive).toHaveBeenCalled());
  expect(es.closed).toBe(true);
  const banner = await screen.findByTestId('comunicado-banner');
  expect(banner).toHaveTextContent('Fallback ok');
});

// 5.
test('EventSource é fechado no unmount (sem leak)', async () => {
  const { unmount } = render(<ComunicadosBanner />);
  await act(async () => {
    await Promise.resolve();
  });
  const es = lastES();
  expect(es.closed).toBe(false);
  act(() => {
    unmount();
  });
  expect(es.closed).toBe(true);
});
