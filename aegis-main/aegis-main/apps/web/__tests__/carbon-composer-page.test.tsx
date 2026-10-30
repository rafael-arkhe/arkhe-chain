/**
 * Sprint L16 — /painel-de-controle/carbon-composer/[workspace_id] page.
 * UI string visible = "Layout da Sala". Path technical = /carbon-composer.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarbonComposerPage from '@/app/painel-de-controle/carbon-composer/[workspace_id]/page';

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ workspace_id: 'ws-1' }),
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

jest.mock('@/lib/api', () => ({
  Workspaces: {
    get: jest.fn(),
    publishCarbon: jest.fn(),
  },
  Carbon: {
    validate: jest.fn(),
  },
  // Wave D.2 — composer agora consome Iam.roles + Marketplace.
  Iam: {
    roles: { list: jest.fn().mockResolvedValue([]) },
  },
  Marketplace: {
    list: jest.fn().mockResolvedValue([]),
    install: jest.fn(),
  },
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

const { Workspaces, Carbon } = jest.requireMock('@/lib/api') as {
  Workspaces: { get: jest.Mock; publishCarbon: jest.Mock };
  Carbon: { validate: jest.Mock };
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
      displayMetadata: { name: 'Sala Aurora', description: 'Operações' },
      discoverableModules: [{ module_id: 'briefing', label: 'Briefing' }],
      homePage: {
        columns: [2, 1],
        sections: [
          {
            title: 'Alertas',
            displayAs: 'CARD',
            items: [{ kind: 'module', ref: 'briefing', label: 'Briefing' }],
          },
        ],
      },
    },
  },
  active: true,
  created_at: '2026-05-23T00:00:00Z',
  signed_hash: 'h1',
  version: 4,
};

describe('CarbonComposerPage — Sprint L16 (Layout da Sala)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Workspaces.get.mockResolvedValue(baseWs);
    Workspaces.publishCarbon.mockResolvedValue({ ...baseWs, version: 5 });
    Carbon.validate.mockResolvedValue({
      ok: true,
      errors: [],
      preview: {
        name: 'Sala Aurora',
        description: 'Operações',
        n_discoverable_modules: 1,
        n_sections: 1,
        sections: [{ title: 'Alertas', displayAs: 'CARD', n_items: 1 }],
        columns_total: 3,
      },
    });
  });

  it('uses string visible "Layout da Sala" in header (no "Carbon" leak)', async () => {
    const { container } = render(<CarbonComposerPage />);
    await waitFor(() => expect(Workspaces.get).toHaveBeenCalledWith('ws-1'));
    // Save button must say "Salvar Layout da Sala"
    await waitFor(() =>
      expect(screen.getByTestId('composer-save')).toHaveTextContent(
        /Salvar Layout da Sala/i,
      ),
    );
    // Title region should contain "Layout da Sala" (visible text aggregation)
    expect(container.textContent ?? '').toMatch(/Layout da Sala/i);
    // No leaking "Carbon" word as standalone visible text
    expect(container.textContent ?? '').not.toMatch(/\bCarbon\b/);
  });

  it('renders the 3-pane shell (palette, canvas, inspector)', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => expect(Workspaces.get).toHaveBeenCalled());
    expect(await screen.findByTestId('composer-palette')).toBeInTheDocument();
    expect(screen.getByTestId('composer-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('composer-inspector')).toBeInTheDocument();
  });

  it('hydrates existing carbon config into the canvas', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => expect(Workspaces.get).toHaveBeenCalled());
    const section0 = await screen.findByTestId('composer-section-0');
    expect(section0).toHaveTextContent('Alertas');
    expect(screen.getByTestId('composer-section-0-count')).toHaveTextContent(
      '1 item',
    );
  });

  it('adds a palette item to the first section on click', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => expect(Workspaces.get).toHaveBeenCalled());
    await screen.findByTestId('composer-palette');
    // Section starts with 1 item
    fireEvent.click(screen.getByTestId('composer-palette-item-0'));
    await waitFor(() =>
      expect(screen.getByTestId('composer-section-0-count')).toHaveTextContent(
        '2 itens',
      ),
    );
  });

  it('inspector lets operator edit section title', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => expect(Workspaces.get).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('composer-section-0'));
    const titleInput = screen.getByTestId('composer-inspector-title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Alertas Críticos' } });
    expect(titleInput.value).toBe('Alertas Críticos');
  });

  it('toggles GUI ↔ YAML mode', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => expect(Workspaces.get).toHaveBeenCalled());
    expect(await screen.findByTestId('composer-canvas')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('composer-mode-yaml'));
    await waitFor(() =>
      expect(screen.getByTestId('composer-yaml-editor')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('composer-yaml-text')).toBeInTheDocument();
    // back to GUI
    fireEvent.click(screen.getByTestId('composer-mode-gui'));
    await waitFor(() => expect(screen.getByTestId('composer-canvas')).toBeInTheDocument());
  });

  it('Save calls validate + publishCarbon, posts to /workspaces/{id}/config-yaml', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => expect(Workspaces.get).toHaveBeenCalled());
    await screen.findByTestId('composer-palette');
    // Dirty the form to enable save
    fireEvent.click(screen.getByTestId('composer-palette-item-0'));
    fireEvent.click(screen.getByTestId('composer-save'));
    await waitFor(() => expect(Carbon.validate).toHaveBeenCalled());
    await waitFor(() => expect(Workspaces.publishCarbon).toHaveBeenCalled());
    const [id, body] = Workspaces.publishCarbon.mock.calls[0];
    expect(id).toBe('ws-1');
    expect(body.config).toBeDefined();
    expect((body.config as { displayMetadata?: { name?: string } }).displayMetadata?.name).toBe(
      'Sala Aurora',
    );
  });
});
