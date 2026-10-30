/**
 * Wave D.2 (2026-05-23) — Carbon composer: bloco "Barra de menu".
 *
 * Cobre:
 *  - Toggle visible escreve em layout.menuBar.visible.
 *  - Add cria um item default {label, href: '/', position: 'left'}.
 *  - Reorder (botões up/down) realmente troca a ordem dos items.
 *  - Remove tira o item da lista.
 *
 * Foco isolado nesse bloco — os mocks são os mesmos do
 * `carbon-composer-page.test.tsx` baseline (Sprint L16).
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

describe('CarbonComposer · Wave D.2 · Barra de menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Workspaces.get.mockResolvedValue(baseWs);
    Workspaces.publishCarbon.mockResolvedValue(baseWs);
    Carbon.validate.mockResolvedValue({ ok: true, errors: [], preview: null });
    Iam.roles.list.mockResolvedValue([]);
    Marketplace.list.mockResolvedValue([]);
  });

  it('toggles `visible` on/off', async () => {
    render(<CarbonComposerPage />);
    const toggle = (await screen.findByTestId('composer-menubar-visible')) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
  });

  it('adds a new item via "Adicionar item"', async () => {
    render(<CarbonComposerPage />);
    const addBtn = await screen.findByTestId('composer-menubar-add');
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(screen.getByTestId('composer-menubar-item-0')).toBeInTheDocument();
      expect(screen.getByTestId('composer-menubar-item-1')).toBeInTheDocument();
    });
  });

  it('reorders items via up/down buttons', async () => {
    render(<CarbonComposerPage />);
    const addBtn = await screen.findByTestId('composer-menubar-add');
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    await waitFor(() => screen.getByTestId('composer-menubar-item-1'));

    const labelA = (await screen.findByTestId('composer-menubar-item-0-label')) as HTMLInputElement;
    const labelB = (await screen.findByTestId('composer-menubar-item-1-label')) as HTMLInputElement;
    fireEvent.change(labelA, { target: { value: 'Primeiro' } });
    fireEvent.change(labelB, { target: { value: 'Segundo' } });

    expect(
      (screen.getByTestId('composer-menubar-item-0-label') as HTMLInputElement).value,
    ).toBe('Primeiro');

    // Move item 0 down → swap.
    fireEvent.click(screen.getByTestId('composer-menubar-item-0-down'));
    await waitFor(() => {
      expect(
        (screen.getByTestId('composer-menubar-item-0-label') as HTMLInputElement).value,
      ).toBe('Segundo');
      expect(
        (screen.getByTestId('composer-menubar-item-1-label') as HTMLInputElement).value,
      ).toBe('Primeiro');
    });
  });

  it('removes an item with X', async () => {
    render(<CarbonComposerPage />);
    fireEvent.click(await screen.findByTestId('composer-menubar-add'));
    await waitFor(() => screen.getByTestId('composer-menubar-item-0'));
    fireEvent.click(screen.getByTestId('composer-menubar-item-0-remove'));
    await waitFor(() => {
      expect(screen.queryByTestId('composer-menubar-item-0')).not.toBeInTheDocument();
    });
  });
});
