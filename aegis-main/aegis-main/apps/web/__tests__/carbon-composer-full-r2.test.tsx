/**
 * Wave F.1 (2026-05-23) — /painel-de-controle/carbon-composer/[id]
 * full R2 schema test suite.
 *
 * Cobre os campos novos do schema YAML R2:
 *   - welcomeText / shouldHideSearchBar / defaultObjectTypesFilter
 *   - theme as object (mode + density + accent_color) + back-compat string
 *   - defaultLocation
 *   - Templates picker (lista + apply)
 *   - YAML import endpoint
 *   - YAML export (Download)
 *
 * Suite paralela ao baseline L16 (`carbon-composer-page.test.tsx`) —
 * memória `feedback_no_deprecation_of_existing_code` aplica: tests novos
 * em arquivo separado, baseline preservado.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarbonComposerPage from '@/app/painel-de-controle/carbon-composer/[workspace_id]/page';

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
    importYaml: jest.fn(),
    templates: jest.fn(),
    applyTemplate: jest.fn(),
  },
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
  Carbon: {
    validate: jest.Mock;
    importYaml: jest.Mock;
    templates: jest.Mock;
    applyTemplate: jest.Mock;
  };
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
      defaultLocation: '/sala/aurora',
      homePage: {
        welcomeText: 'Bem-vindo, operador.',
        shouldHideSearchBar: false,
        columns: [2, 1],
        sections: [],
      },
      theme: { mode: 'dark', density: 'compact' },
    },
  },
  active: true,
  created_at: '2026-05-23T00:00:00Z',
  signed_hash: 'h1',
  version: 1,
};

describe('CarbonComposerPage · Wave F.1 (full R2 schema)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Workspaces.get.mockResolvedValue(baseWs);
    Workspaces.publishCarbon.mockResolvedValue({ ...baseWs, version: 2 });
    Carbon.validate.mockResolvedValue({ ok: true, errors: [], preview: null });
    Carbon.importYaml.mockResolvedValue({
      ok: true,
      errors: [],
      preview: null,
    });
    Carbon.templates.mockResolvedValue([
      {
        slug: 'operacional',
        display_name: 'Sala Operacional',
        description: 'Painel para operadores de campo.',
        config: {
          displayMetadata: { name: 'Sala Operacional', description: '' },
          discoverableModules: [],
          homePage: { columns: [2, 1], sections: [] },
        },
      },
      {
        slug: 'inteligencia',
        display_name: 'Sala de Inteligência',
        description: 'Análise OSINT.',
        config: {
          displayMetadata: { name: 'Sala de Inteligência', description: '' },
          discoverableModules: [],
          homePage: { columns: [1, 2], sections: [] },
        },
      },
      {
        slug: 'comando',
        display_name: 'Sala de Comando',
        description: 'Cockpit executivo.',
        config: {
          displayMetadata: { name: 'Sala de Comando', description: '' },
          discoverableModules: [],
          homePage: { columns: [1, 1, 1], sections: [] },
        },
      },
    ]);
    Carbon.applyTemplate.mockResolvedValue({
      ok: true,
      workspace_id: 'ws-1',
      template_slug: 'operacional',
      config: {
        displayMetadata: { name: 'Sala Operacional', description: '' },
        discoverableModules: [],
        homePage: { columns: [2, 1], sections: [] },
      },
    });
  });

  it('loads workspace with R2 fields (welcomeText, defaultLocation, theme.mode=dark)', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() =>
      expect(screen.getByTestId('composer-canvas')).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId('composer-homepage-welcome'),
    ).toHaveValue('Bem-vindo, operador.');
    expect(
      screen.getByTestId('composer-default-location'),
    ).toHaveValue('/sala/aurora');
    // Theme block — Dark deve estar ativo.
    expect(screen.getByTestId('composer-theme-dark')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('edits welcomeText and saves', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-homepage-welcome'));
    fireEvent.change(screen.getByTestId('composer-homepage-welcome'), {
      target: { value: 'Briefing diário pronto.' },
    });
    fireEvent.click(screen.getByTestId('composer-save'));
    await waitFor(() => expect(Workspaces.publishCarbon).toHaveBeenCalled());
    const payload = Workspaces.publishCarbon.mock.calls[0][1].config;
    expect(payload.homePage.welcomeText).toBe('Briefing diário pronto.');
  });

  it('toggles shouldHideSearchBar', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-homepage-hide-search'));
    fireEvent.click(screen.getByTestId('composer-homepage-hide-search'));
    fireEvent.click(screen.getByTestId('composer-save'));
    await waitFor(() => expect(Workspaces.publishCarbon).toHaveBeenCalled());
    expect(
      Workspaces.publishCarbon.mock.calls[0][1].config.homePage
        .shouldHideSearchBar,
    ).toBe(true);
  });

  it('sets defaultObjectTypesFilter from csv input', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-homepage-filter'));
    fireEvent.change(screen.getByTestId('composer-homepage-filter'), {
      target: { value: 'Person, Event' },
    });
    fireEvent.click(screen.getByTestId('composer-save'));
    await waitFor(() => expect(Workspaces.publishCarbon).toHaveBeenCalled());
    const f =
      Workspaces.publishCarbon.mock.calls[0][1].config.homePage
        .defaultObjectTypesFilter;
    expect(f.type).toBe('specific');
    expect(f.selectedObjectTypes).toEqual(['Person', 'Event']);
  });

  it('changes theme to light and persists object shape', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-theme-light'));
    fireEvent.click(screen.getByTestId('composer-theme-light'));
    fireEvent.click(screen.getByTestId('composer-save'));
    await waitFor(() => expect(Workspaces.publishCarbon).toHaveBeenCalled());
    const t = Workspaces.publishCarbon.mock.calls[0][1].config.theme;
    expect(typeof t).toBe('object');
    expect(t.mode).toBe('light');
  });

  it('changes theme density to comfortable (dirty)', async () => {
    // baseWs.config.carbon.theme.density === 'compact' — toggling pra
    // 'comfortable' garante dirty=true antes do save.
    render(<CarbonComposerPage />);
    await waitFor(() =>
      screen.getByTestId('composer-theme-density-comfortable'),
    );
    fireEvent.click(screen.getByTestId('composer-theme-density-comfortable'));
    fireEvent.click(screen.getByTestId('composer-save'));
    await waitFor(() => expect(Workspaces.publishCarbon).toHaveBeenCalled());
    expect(
      Workspaces.publishCarbon.mock.calls[0][1].config.theme.density,
    ).toBe('comfortable');
  });

  it('sets theme accent color', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-theme-accent'));
    fireEvent.change(screen.getByTestId('composer-theme-accent'), {
      target: { value: '#2965CC' },
    });
    fireEvent.click(screen.getByTestId('composer-save'));
    await waitFor(() => expect(Workspaces.publishCarbon).toHaveBeenCalled());
    expect(
      Workspaces.publishCarbon.mock.calls[0][1].config.theme.accent_color,
    ).toBe('#2965CC');
  });

  it('edits defaultLocation', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-default-location'));
    fireEvent.change(screen.getByTestId('composer-default-location'), {
      target: { value: '/sala/cockpit' },
    });
    fireEvent.click(screen.getByTestId('composer-save'));
    await waitFor(() => expect(Workspaces.publishCarbon).toHaveBeenCalled());
    expect(
      Workspaces.publishCarbon.mock.calls[0][1].config.defaultLocation,
    ).toBe('/sala/cockpit');
  });

  it('opens templates dialog and lists 3 templates', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-templates-open'));
    fireEvent.click(screen.getByTestId('composer-templates-open'));
    await waitFor(() =>
      expect(screen.getByTestId('composer-templates-dialog')).toBeInTheDocument(),
    );
    expect(Carbon.templates).toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.getByTestId('composer-template-operacional'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('composer-template-inteligencia'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('composer-template-comando'),
      ).toBeInTheDocument();
    });
  });

  it('applies a template via dialog', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-templates-open'));
    fireEvent.click(screen.getByTestId('composer-templates-open'));
    await waitFor(() =>
      expect(
        screen.getByTestId('composer-template-operacional-apply'),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('composer-template-operacional-apply'));
    await waitFor(() =>
      // Wave G.1 — applyTemplate agora aceita opts. auto_publish default false.
      expect(Carbon.applyTemplate).toHaveBeenCalledWith(
        'operacional',
        'ws-1',
        expect.objectContaining({ auto_publish: false }),
      ),
    );
  });

  /* ── Wave G.1 (2026-05-23) — auto-publish checkbox ─────────────────── */

  it('exibe checkbox auto-publish no dialog Templates', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-templates-open'));
    fireEvent.click(screen.getByTestId('composer-templates-open'));
    await waitFor(() =>
      expect(
        screen.getByTestId('composer-templates-auto-publish'),
      ).toBeInTheDocument(),
    );
    const cb = screen.getByTestId(
      'composer-templates-auto-publish',
    ) as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it('quando auto-publish está ligado, applyTemplate envia auto_publish=true', async () => {
    // Reset mocks so a previous test does not pollute call args.
    Carbon.applyTemplate.mockClear();
    Workspaces.get.mockClear();
    Carbon.applyTemplate.mockResolvedValue({
      ok: true,
      workspace_id: 'ws-1',
      template_slug: 'operacional',
      config: {
        displayMetadata: { name: 'Sala Operacional', description: '' },
        discoverableModules: [],
        homePage: { columns: [2, 1], sections: [] },
      },
      published_version: 5,
    });
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-templates-open'));
    fireEvent.click(screen.getByTestId('composer-templates-open'));
    await waitFor(() =>
      screen.getByTestId('composer-templates-auto-publish'),
    );
    fireEvent.click(screen.getByTestId('composer-templates-auto-publish'));
    await waitFor(() =>
      screen.getByTestId('composer-template-operacional-apply'),
    );
    fireEvent.click(screen.getByTestId('composer-template-operacional-apply'));
    await waitFor(() =>
      expect(Carbon.applyTemplate).toHaveBeenCalledWith(
        'operacional',
        'ws-1',
        expect.objectContaining({ auto_publish: true }),
      ),
    );
  });

  it('YAML mode validate button calls importYaml', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-mode-yaml'));
    fireEvent.click(screen.getByTestId('composer-mode-yaml'));
    const validateBtn = await screen.findByTestId('composer-yaml-validate');
    fireEvent.click(validateBtn);
    await waitFor(() => expect(Carbon.importYaml).toHaveBeenCalled());
  });

  it('YAML mode renders side-by-side original vs current', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-mode-yaml'));
    fireEvent.click(screen.getByTestId('composer-mode-yaml'));
    expect(await screen.findByTestId('composer-yaml-text')).toBeInTheDocument();
    expect(screen.getByTestId('composer-yaml-original')).toBeInTheDocument();
  });

  it('export YAML button is present in header', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() =>
      expect(screen.getByTestId('composer-export-yaml')).toBeInTheDocument(),
    );
  });

  it('back-compat: workspace with theme as string still renders', async () => {
    Workspaces.get.mockResolvedValue({
      ...baseWs,
      config: {
        carbon: {
          displayMetadata: { name: 'X' },
          discoverableModules: [],
          theme: 'dark', // legacy string (D.2)
        },
      },
    });
    render(<CarbonComposerPage />);
    await waitFor(() =>
      expect(screen.getByTestId('composer-theme-dark')).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
  });
});
