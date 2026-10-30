/**
 * /alertas parametrizável (2026-06-12) — a rota RESOLVE a página
 * registrada `alertas` (mesmo trilho de /paginas/[slug]/view) em vez do
 * JSX fixo antigo (que morreu — ADD-ou-DELETE).
 *
 * Cobertura:
 *  1. Pages.get('alertas', {enforce:true}) ok → renderer recebe o app
 *     virtual `page::alertas` com o layout da página registrada.
 *  2. Botão "Personalizar" → /painel-de-controle/paginas/alertas/edit,
 *     APENAS pra quem tem workspace.publish.
 *  3. Página registrada sumiu (404/erro) → fallback honesto: seed local
 *     (alert_list real) + aviso — nunca dado fake.
 *  4. 403 do backend → estado de acesso negado.
 *  5. Higiene: o JSX antigo (CANAIS fixos / FALLBACK fake) morreu.
 */
import fs from 'fs';
import path from 'path';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: jest.fn(() => true) }));
jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/components/shell/page-shell', () => ({
  PageShell: ({
    toolbar,
    children,
  }: {
    toolbar?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-shell">
      <div data-testid="shell-toolbar">{toolbar}</div>
      {children}
    </div>
  ),
}));
jest.mock('@/components/workshop/WorkshopV2Renderer', () => ({
  WorkshopV2Renderer: ({
    app,
  }: {
    app: { id: string; layout: { root: { widget: { type: string } }[] } };
  }) => (
    <div
      data-testid="workshop-renderer"
      data-app-id={app.id}
      data-widget-types={app.layout.root.map((n) => n.widget.type).join(',')}
    />
  ),
}));
jest.mock('@/components/workshop/widgets', () => ({}));
jest.mock('@/lib/api', () => ({
  Pages: { get: jest.fn(), list: jest.fn() },
}));

import AlertasPage from '@/app/alertas/page';
import { useCan } from '@/lib/auth/useAuth';
import { ApiError } from '@/lib/api/client';

const { Pages } = jest.requireMock('@/lib/api') as {
  Pages: { get: jest.Mock; list: jest.Mock };
};
const mockCan = useCan as jest.Mock;

const REGISTERED_PAGE = {
  slug: 'alertas',
  title: 'Alertas',
  route: '/alertas',
  status: 'published',
  workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
  marking_requirements: [],
  iam_perm_required: 'alerts.read',
  config: {
    mode: 'workshop',
    workshop_layout: {
      columns: 20,
      root: [
        {
          id: 'alertas_lista',
          widget: { type: 'alert_list', props: { limit: 50 } },
          layout: { col_span: 20 },
        },
      ],
    },
    variables: [],
    surface: 'standalone',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCan.mockReturnValue(true);
  Pages.get.mockResolvedValue(REGISTERED_PAGE);
  Pages.list.mockResolvedValue([REGISTERED_PAGE]);
});

describe('/alertas resolve a página registrada', () => {
  it('1. renderiza o app virtual page::alertas com o layout registrado', async () => {
    render(<AlertasPage />);
    const r = await screen.findByTestId('workshop-renderer');
    expect(Pages.get).toHaveBeenCalledWith('alertas', { enforce: true });
    expect(r).toHaveAttribute('data-app-id', 'page::alertas');
    expect(r.getAttribute('data-widget-types')).toContain('alert_list');
  });

  it('2. Personalizar gated por workspace.publish', async () => {
    render(<AlertasPage />);
    const btn = await screen.findByTestId('alertas-personalizar');
    expect(btn).toHaveAttribute(
      'href',
      '/painel-de-controle/paginas/alertas/edit',
    );
  });

  it('2b. sem workspace.publish não há Personalizar', async () => {
    mockCan.mockImplementation((perm: string) => perm !== 'workspace.publish');
    render(<AlertasPage />);
    await screen.findByTestId('workshop-renderer');
    expect(screen.queryByTestId('alertas-personalizar')).not.toBeInTheDocument();
  });

  it('3. página sumiu → fallback honesto do seed local (alert_list) + aviso', async () => {
    Pages.get.mockRejectedValue(new ApiError(404, 'page not found'));
    render(<AlertasPage />);
    const r = await screen.findByTestId('workshop-renderer');
    expect(r.getAttribute('data-app-id')).toBe('seed.security.alertas');
    expect(r.getAttribute('data-widget-types')).toContain('alert_list');
    expect(screen.getByTestId('alertas-fallback-aviso')).toBeInTheDocument();
  });

  it('4. 403 → acesso negado explícito', async () => {
    Pages.get.mockRejectedValue(new ApiError(403, 'forbidden'));
    render(<AlertasPage />);
    await screen.findByTestId('alertas-denied');
    expect(screen.queryByTestId('workshop-renderer')).not.toBeInTheDocument();
  });

  it('5. higiene: JSX fixo antigo morreu (CANAIS hardcoded fora do arquivo)', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app', 'alertas', 'page.tsx'),
      'utf-8',
    );
    expect(src).not.toContain('CANAIS');
    expect(src).not.toContain('alertas-canais');
    expect(src).toContain("Pages.get('alertas'");
  });
});
