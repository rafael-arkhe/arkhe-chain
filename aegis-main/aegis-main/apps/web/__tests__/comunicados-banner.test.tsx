/**
 * Wave H.4.B (2026-05-23) — ComunicadosBanner tests.
 *
 * Cobertura (>= 10):
 *  1. Renderiza nada quando lista vem vazia.
 *  2. Renderiza banner único com title + body + ícone.
 *  3. Aplica classes semânticas por kind (info/warning/danger/success).
 *  4. Suporta múltiplos banners empilhados.
 *  5. Trunca em MAX_VISIBLE e mostra contador "+N".
 *  6. Dismiss button some o banner + chama Comunicados.dismissMe.
 *  7. closable=false esconde o botão de fechar.
 *  8. CTA link aparece quando cta_label + cta_href setados.
 *  9. Auto-dismiss timer (duration_s>0) chama dismissMe sozinho.
 * 10. Markdown safe-subset (bold/italic/link) renderiza tags certas.
 * 11. DS audit: zero rounded-* não-none, zero Sparkles icon.
 */
import {
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import { ComunicadosBanner } from '@/components/shell/comunicados-banner';

jest.mock('@/lib/api', () => ({
  Comunicados: {
    active: jest.fn(),
    dismissMe: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (key: string) => {
    const dict: Record<string, string> = {
      'comunicados.dismiss': 'Fechar comunicado',
      'comunicados.moreCount': '+{n} comunicado(s) adicional(is)',
      'comunicados.openCta': 'Abrir',
    };
    return dict[key] ?? key;
  },
}));

import { Comunicados } from '@/lib/api';
const mockActive = Comunicados.active as jest.MockedFunction<typeof Comunicados.active>;
const mockDismiss = Comunicados.dismissMe as jest.MockedFunction<typeof Comunicados.dismissMe>;


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


beforeEach(() => {
  jest.useFakeTimers();
  mockActive.mockReset();
  mockDismiss.mockReset();
  mockDismiss.mockResolvedValue(undefined as never);
});

afterEach(() => {
  jest.useRealTimers();
});


async function flushActive(items: any[]) {
  mockActive.mockResolvedValue(items as never);
  render(<ComunicadosBanner />);
  await act(async () => {
    await Promise.resolve();
  });
}


// 1.
test('não renderiza wrapper quando lista vem vazia', async () => {
  await flushActive([]);
  expect(screen.queryByTestId('comunicados-banner-stack')).not.toBeInTheDocument();
});

// 2.
test('renderiza banner único com title e ícone padrão', async () => {
  await flushActive([
    makeComunicado({ id: 'b1', kind: 'info', title: 'Hello', body: 'Mundo' }),
  ]);
  const banner = await screen.findByTestId('comunicado-banner');
  expect(banner).toHaveTextContent('Hello');
  expect(banner).toHaveTextContent('Mundo');
  expect(banner).toHaveAttribute('data-kind', 'info');
});

// 3.
test('aplica classes semânticas por kind', async () => {
  await flushActive([
    makeComunicado({ id: 'a', kind: 'info', title: 'Info' }),
    makeComunicado({ id: 'b', kind: 'warning', title: 'Warn' }),
    makeComunicado({ id: 'c', kind: 'danger', title: 'Dang' }),
  ]);
  const banners = await screen.findAllByTestId('comunicado-banner');
  expect(banners[0].className).toContain('bg-info/10');
  expect(banners[0].className).toContain('border-info');
  expect(banners[1].className).toContain('bg-warning/10');
  expect(banners[2].className).toContain('bg-danger/10');
});

// 4.
test('renderiza múltiplos banners empilhados', async () => {
  await flushActive([
    makeComunicado({ id: 'a', title: 'A' }),
    makeComunicado({ id: 'b', title: 'B' }),
  ]);
  const banners = await screen.findAllByTestId('comunicado-banner');
  expect(banners).toHaveLength(2);
});

// 5.
test('trunca em MAX_VISIBLE=3 e mostra contador extra', async () => {
  await flushActive([
    makeComunicado({ id: 'a', title: '1' }),
    makeComunicado({ id: 'b', title: '2' }),
    makeComunicado({ id: 'c', title: '3' }),
    makeComunicado({ id: 'd', title: '4' }),
    makeComunicado({ id: 'e', title: '5' }),
  ]);
  const banners = await screen.findAllByTestId('comunicado-banner');
  expect(banners).toHaveLength(3);
  const extra = screen.getByTestId('comunicado-extra-count');
  expect(extra).toHaveTextContent('+2');
});

// 6.
test('clicar X some o banner + chama Comunicados.dismissMe', async () => {
  await flushActive([
    makeComunicado({ id: 'xyz', title: 'Bye', closable: true }),
  ]);
  const btn = await screen.findByTestId('comunicado-dismiss');
  await act(async () => {
    fireEvent.click(btn);
    // 150ms fade-out → finalize
    jest.advanceTimersByTime(200);
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(mockDismiss).toHaveBeenCalledWith('xyz');
  });
  expect(screen.queryByTestId('comunicado-banner')).not.toBeInTheDocument();
});

// 7.
test('closable=false esconde botão de fechar', async () => {
  await flushActive([
    makeComunicado({ id: 'a', closable: false }),
  ]);
  await screen.findByTestId('comunicado-banner');
  expect(screen.queryByTestId('comunicado-dismiss')).not.toBeInTheDocument();
});

// 8.
test('CTA aparece quando label+href setados', async () => {
  await flushActive([
    makeComunicado({
      id: 'a',
      cta_label: 'Saiba mais',
      cta_href: '/docs/manutencao',
    }),
  ]);
  const cta = await screen.findByTestId('comunicado-cta');
  expect(cta).toHaveAttribute('href', '/docs/manutencao');
  expect(cta).toHaveTextContent('Saiba mais');
});

// 9.
test('auto-dismiss timer dispara dismissMe após duration_s', async () => {
  await flushActive([
    makeComunicado({ id: 'auto', duration_s: 5, closable: true }),
  ]);
  await screen.findByTestId('comunicado-banner');
  await act(async () => {
    jest.advanceTimersByTime(5_000);
    // Mais 200ms pra finalize timer.
    jest.advanceTimersByTime(300);
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(mockDismiss).toHaveBeenCalledWith('auto');
  });
});

// 10.
test('markdown safe-subset renderiza tags corretas', async () => {
  await flushActive([
    makeComunicado({
      id: 'md',
      body: 'olá **mundo** com [link](/docs) e *itálico*',
    }),
  ]);
  const banner = await screen.findByTestId('comunicado-banner');
  // <strong> for **mundo**
  expect(banner.querySelector('strong')).toHaveTextContent('mundo');
  // <em> for *itálico*
  expect(banner.querySelector('em')).toHaveTextContent('itálico');
  // <a href="/docs">link</a>
  const anchor = banner.querySelector('a[href="/docs"]');
  expect(anchor).not.toBeNull();
  expect(anchor).toHaveTextContent('link');
});

// 11. DS audit.
test('DS audit: zero rounded-* não-none, zero Sparkles icon', async () => {
  await flushActive([
    makeComunicado({ id: 'a', kind: 'warning', title: 'X', cta_label: 'go', cta_href: '/x' }),
  ]);
  await screen.findByTestId('comunicado-banner');
  const html = document.body.innerHTML;
  expect(html).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/);
  expect(html).not.toMatch(/lucide-sparkles/i);
});
