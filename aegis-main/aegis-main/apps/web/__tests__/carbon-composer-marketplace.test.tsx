/**
 * Wave D.2 (2026-05-23) — Carbon composer: tab "Loja" (marketplace).
 *
 * Cobre:
 *  - Tab Loja renderiza ao clicar.
 *  - Lista exibe produtos vindos de Marketplace.list().
 *  - Botão "Instalar" chama Marketplace.install e adiciona o produto
 *    aos discoverableModules.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarbonComposerPage from '@/app/painel-de-controle/carbon-composer/[workspace_id]/page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ workspace_id: 'ws-1' }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
  Workspaces: { get: jest.fn(), publishCarbon: jest.fn() },
  Carbon: { validate: jest.fn() },
  Iam: { roles: { list: jest.fn() } },
  Marketplace: { list: jest.fn(), install: jest.fn() },
}));

jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));
jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));

const { Workspaces, Carbon, Iam, Marketplace } = jest.requireMock('@/lib/api') as {
  Workspaces: { get: jest.Mock; publishCarbon: jest.Mock };
  Carbon: { validate: jest.Mock };
  Iam: { roles: { list: jest.Mock } };
  Marketplace: { list: jest.Mock; install: jest.Mock };
};

const baseWs = {
  id: 'ws-1',
  tenant_id: 't-1',
  slug: 'aurora',
  display_name: 'Sala Aurora',
  description: 'Operações',
  project_id: null,
  config: {
    carbon: {
      displayMetadata: { name: 'Sala Aurora' },
      discoverableModules: [],
      homePage: { columns: [2, 1], sections: [] },
      menuBar: { visible: true, items: [] },
      accessRules: [],
      theme: 'light',
    },
  },
  active: true,
  created_at: '2026-05-23T00:00:00Z',
  signed_hash: 'h1',
  version: 1,
};

const products = [
  {
    id: 'p-1',
    slug: 'cctv-pro',
    display_name: 'CCTV Pro',
    category: null,
    description: 'Detecção de objetos',
    version: '1.0.0',
    manifest: {},
    published: true,
    markings: [],
    created_at: '2026-05-23',
  },
];

describe('CarbonComposer · Wave D.2 · Marketplace tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Workspaces.get.mockResolvedValue(baseWs);
    Workspaces.publishCarbon.mockResolvedValue(baseWs);
    Carbon.validate.mockResolvedValue({ ok: true, errors: [], preview: null });
    Iam.roles.list.mockResolvedValue([]);
    Marketplace.list.mockResolvedValue(products);
    Marketplace.install.mockResolvedValue({
      id: 'i-1',
      product_id: 'p-1',
      installed_version: '1.0.0',
      status: 'installed',
      notes: null,
      installed_at: '2026-05-23',
    });
  });

  it('shows the marketplace tab and switches to it', async () => {
    render(<CarbonComposerPage />);
    const tab = await screen.findByTestId('composer-tab-marketplace');
    fireEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByTestId('composer-marketplace-panel')).toBeInTheDocument();
    });
  });

  it('lists products returned by Marketplace.list', async () => {
    render(<CarbonComposerPage />);
    fireEvent.click(await screen.findByTestId('composer-tab-marketplace'));
    await waitFor(() => {
      expect(screen.getByTestId('composer-marketplace-card-p-1')).toBeInTheDocument();
    });
  });

  it('installs a product and disables the button after', async () => {
    render(<CarbonComposerPage />);
    fireEvent.click(await screen.findByTestId('composer-tab-marketplace'));
    const installBtn = await screen.findByTestId('composer-marketplace-install-p-1');
    fireEvent.click(installBtn);
    await waitFor(() => {
      expect(Marketplace.install).toHaveBeenCalledWith('p-1', expect.any(String));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('composer-marketplace-install-p-1'),
      ).toHaveTextContent(/Instalado/i);
    });
  });
});
