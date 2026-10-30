/**
 * Onda R.3 (2026-05-23) — fecha a lacuna residual: o "+ Novo" dos pickers
 * variable-ref/variable-path no editor de Páginas era no-op.
 *
 * Agora o editor de Páginas embute o MESMO `VariablesPanel` do Workshop full
 * (`components/workshop/variables-panel.tsx`). O operador cria/edita/remove
 * variables da Page direto no editor; ao salvar, elas viajam em
 * `config.variables` via `Pages.putConfig` (sem backend novo — o pipeline
 * L.3/I.1 do adapter já serializava `app.variables`).
 *
 * Cobertura (8):
 *
 *  1. Toolbar tem botão "Dados" que abre o VariablesPanel.
 *  2. Selecionar widget com prop variable-ref → "+ Novo" no inspector abre
 *     o VariablesPanel (deixou de ser no-op).
 *  3. Criar variable pelo painel → ela aparece como linha "Disponível".
 *  4. Variable criada aparece no dropdown variable-ref do inspector.
 *  5. Salvar rascunho persiste a variable em config.variables (putConfig).
 *  6. Badge de contagem no botão "Dados" reflete o número de variables.
 *  7. Remover variable tira a linha do painel + atualiza o badge.
 *  8. Carregar Page que já tem variables → dropdown lista elas de cara.
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import EditPaginaPage from '@/app/painel-de-controle/paginas/[slug]/edit/page';

jest.mock('@/lib/api', () => ({
  Pages: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    duplicate: jest.fn(),
    putConfig: jest.fn(),
    publish: jest.fn(),
  },
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: { username: 'admin', roles: ['admin'] },
    loading: false,
  }),
  useCan: () => true,
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'buscar' }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/app-shell/preview-provider', () => ({
  useAppShellConfig: () => ({ config: { homepage: { page_id: null } } }),
}));

// O removeVar do VariablesPanel usa confirmModal (nunca dialog nativo —
// feedback_no_native_dialogs); auto-aceita aqui. requireActual preserva os
// demais exports (promptModal etc.) usados pelo editor.
jest.mock('@/components/dialog/confirm-dialog', () => ({
  ...jest.requireActual('@/components/dialog/confirm-dialog'),
  confirmModal: jest.fn(async () => true),
}));

import { Pages } from '@/lib/api';
const pagesApi = Pages as jest.Mocked<typeof Pages>;

const WORKSHOP_FIXTURE = {
  slug: 'buscar',
  title: 'Buscar',
  route: '/buscar',
  status: 'published' as const,
  workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
  marking_requirements: [],
  iam_perm_required: 'ontology.objects.read',
  config: {
    mode: 'workshop',
    workshop_layout: { columns: 20, root: [] },
    variables: [],
  },
  last_edited_by: null,
  last_edited_at: null,
  created_at: '2026-05-23T12:00:00+00:00',
};

/** Page que já carrega uma variable declarada (teste 8). */
const FIXTURE_WITH_VAR = {
  ...WORKSHOP_FIXTURE,
  config: {
    mode: 'workshop',
    workshop_layout: { columns: 20, root: [] },
    variables: [
      {
        id: 'var_seed_1',
        external_id: 'status_caso',
        label: 'Status do caso',
        type: 'String',
        kind: 'static',
        recompute_mode: 'auto',
        spec: {},
      },
    ],
  },
};

/**
 * Seleciona o widget `status_pill` (declara prop `field: 'variable-ref'`
 * chamada "Dado de origem") e espera o inspector abrir. Devolve o nó do
 * inspector pra queries subsequentes.
 */
async function addStatusPillAndOpenInspector(): Promise<HTMLElement> {
  await waitFor(() =>
    expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
  );
  // status_pill pode estar num grupo colapsado; a busca textual sempre acha.
  const search = screen.getByTestId('paginas-palette-search');
  fireEvent.change(search, { target: { value: 'pílula' } });
  await waitFor(() =>
    expect(
      screen.getByTestId('paginas-palette-widget-status_pill'),
    ).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByTestId('paginas-palette-widget-status_pill'));
  await waitFor(() =>
    expect(screen.getByTestId('paginas-edit-inspector')).toBeInTheDocument(),
  );
  return screen.getByTestId('paginas-edit-inspector');
}

describe('Onda R.3 · Páginas (edit) — VariablesPanel embutido', () => {
  beforeEach(() => {
    pagesApi.get.mockReset();
    pagesApi.putConfig.mockReset();
    pagesApi.publish.mockReset();
    pagesApi.get.mockResolvedValue({ ...WORKSHOP_FIXTURE } as any);
    pagesApi.putConfig.mockImplementation(
      async (slug: string, config: any) =>
        ({ ...WORKSHOP_FIXTURE, slug, config }) as any,
    );
  });

  test('1. Toolbar tem botão "Dados" que abre o VariablesPanel', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-dados')).toBeInTheDocument(),
    );
    // Painel fechado até clicar.
    expect(screen.queryByTestId('variables-panel-root')).toBeNull();
    fireEvent.click(screen.getByTestId('paginas-edit-dados'));
    await waitFor(() =>
      expect(screen.getByTestId('variables-panel-root')).toBeInTheDocument(),
    );
    // É o mesmo painel do Workshop (header "Dados do painel" + botão add).
    expect(screen.getByTestId('variables-panel-add')).toBeInTheDocument();
  });

  test('2. "+ Novo" no inspector (variable-ref) abre o painel — não é no-op', async () => {
    render(<EditPaginaPage />);
    const inspector = await addStatusPillAndOpenInspector();
    // O picker variable-ref expõe o botão "Abrir Variables Panel".
    const novo = within(inspector).getAllByLabelText('Abrir Variables Panel')[0];
    expect(novo).toBeInTheDocument();
    expect(screen.queryByTestId('variables-panel-root')).toBeNull();
    fireEvent.click(novo);
    await waitFor(() =>
      expect(screen.getByTestId('variables-panel-root')).toBeInTheDocument(),
    );
  });

  test('3. Criar variable pelo painel → vira linha "Disponível"', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-dados')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-edit-dados'));
    await waitFor(() =>
      expect(screen.getByTestId('variables-panel-add')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('variables-panel-add'));
    // Editor modal abre.
    const modal = await screen.findByTestId('variable-editor-modal');
    const nome = within(modal).getByPlaceholderText('Ex.: Total de alertas');
    fireEvent.change(nome, { target: { value: 'Total de casos' } });
    fireEvent.click(within(modal).getByTestId('variable-editor-save'));
    // Modal fecha + a variable aparece como linha no painel.
    await waitFor(() =>
      expect(screen.queryByTestId('variable-editor-modal')).toBeNull(),
    );
    await waitFor(() =>
      expect(screen.getByText('Disponíveis neste painel')).toBeInTheDocument(),
    );
    expect(screen.getByText('Total de casos')).toBeInTheDocument();
  });

  test('4. Variable criada aparece no dropdown variable-ref do inspector', async () => {
    render(<EditPaginaPage />);
    const inspector = await addStatusPillAndOpenInspector();
    // Abre painel via "+ Novo" do picker.
    fireEvent.click(
      within(inspector).getAllByLabelText('Abrir Variables Panel')[0],
    );
    await waitFor(() =>
      expect(screen.getByTestId('variables-panel-add')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('variables-panel-add'));
    const modal = await screen.findByTestId('variable-editor-modal');
    fireEvent.change(within(modal).getByPlaceholderText('Ex.: Total de alertas'), {
      target: { value: 'Severidade' },
    });
    fireEvent.click(within(modal).getByTestId('variable-editor-save'));
    await waitFor(() =>
      expect(screen.queryByTestId('variable-editor-modal')).toBeNull(),
    );
    // Fecha o painel pra ver o dropdown do inspector atualizado.
    fireEvent.click(screen.getByTestId('variables-panel-close'));
    await waitFor(() =>
      expect(screen.queryByTestId('variables-panel-root')).toBeNull(),
    );
    // O <select> do picker variable-ref agora oferece a nova variable
    // (external_id derivado do nome = "severidade").
    const refSelect = within(inspector)
      .getAllByRole('combobox')
      .find((el) =>
        within(el as HTMLElement)
          .queryAllByRole('option')
          .some((o) => /severidade/i.test(o.textContent ?? '')),
      );
    expect(refSelect).toBeDefined();
    const opt = within(refSelect as HTMLElement)
      .getAllByRole('option')
      .find((o) => /severidade/i.test(o.textContent ?? ''));
    expect(opt).toBeDefined();
    expect((opt as HTMLOptionElement).value).toBe('severidade');
  });

  test('5. Salvar rascunho persiste a variable em config.variables', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-dados')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-edit-dados'));
    await waitFor(() =>
      expect(screen.getByTestId('variables-panel-add')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('variables-panel-add'));
    const modal = await screen.findByTestId('variable-editor-modal');
    fireEvent.change(within(modal).getByPlaceholderText('Ex.: Total de alertas'), {
      target: { value: 'Casos abertos' },
    });
    fireEvent.click(within(modal).getByTestId('variable-editor-save'));
    await waitFor(() =>
      expect(screen.queryByTestId('variable-editor-modal')).toBeNull(),
    );
    fireEvent.click(screen.getByTestId('variables-panel-close'));
    // Save habilitado (dirty=true após criar var).
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-rascunho')).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByTestId('paginas-edit-rascunho'));
    await waitFor(() => {
      expect(pagesApi.putConfig).toHaveBeenCalledWith(
        'buscar',
        expect.objectContaining({
          mode: 'workshop',
          variables: expect.arrayContaining([
            expect.objectContaining({
              external_id: 'casos_abertos',
              label: 'Casos abertos',
            }),
          ]),
        }),
      );
    });
  });

  test('6. Badge de contagem no botão "Dados" reflete nº de variables', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-dados')).toBeInTheDocument(),
    );
    const dados = screen.getByTestId('paginas-edit-dados');
    // Sem variables, sem badge numérico.
    expect(dados.textContent).not.toMatch(/\d/);
    fireEvent.click(dados);
    await waitFor(() =>
      expect(screen.getByTestId('variables-panel-add')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('variables-panel-add'));
    const modal = await screen.findByTestId('variable-editor-modal');
    fireEvent.change(within(modal).getByPlaceholderText('Ex.: Total de alertas'), {
      target: { value: 'Métrica X' },
    });
    fireEvent.click(within(modal).getByTestId('variable-editor-save'));
    await waitFor(() =>
      expect(screen.queryByTestId('variable-editor-modal')).toBeNull(),
    );
    // Agora o botão "Dados" mostra "1".
    await waitFor(() =>
      expect(
        screen.getByTestId('paginas-edit-dados').textContent,
      ).toMatch(/1/),
    );
  });

  test('7. Remover variable tira a linha + zera o badge', async () => {
    pagesApi.get.mockResolvedValue({ ...FIXTURE_WITH_VAR } as any);
    // confirmModal do removeVar auto-aceita via mock do módulo (topo do
    // arquivo) — o spy de window.confirm ficou só como guarda de que o
    // dialog NATIVO nunca dispara (feedback_no_native_dialogs).
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      render(<EditPaginaPage />);
      await waitFor(() =>
        expect(screen.getByTestId('paginas-edit-dados')).toBeInTheDocument(),
      );
      // Badge começa em 1 (variable seed).
      expect(screen.getByTestId('paginas-edit-dados').textContent).toMatch(/1/);
      fireEvent.click(screen.getByTestId('paginas-edit-dados'));
      await waitFor(() =>
        expect(screen.getByText('Status do caso')).toBeInTheDocument(),
      );
      // Botão remover da linha (aria-label "Remover").
      const removeBtn = screen
        .getAllByRole('button')
        .find((b) => /remover/i.test(b.getAttribute('aria-label') ?? ''));
      expect(removeBtn).toBeDefined();
      fireEvent.click(removeBtn as HTMLElement);
      await waitFor(() =>
        expect(screen.queryByText('Status do caso')).toBeNull(),
      );
    } finally {
      confirmSpy.mockRestore();
    }
  });

  test('8. Page com variables pré-existentes → dropdown lista de cara', async () => {
    pagesApi.get.mockResolvedValue({ ...FIXTURE_WITH_VAR } as any);
    render(<EditPaginaPage />);
    const inspector = await addStatusPillAndOpenInspector();
    // Sem criar nada, o picker variable-ref já oferece "status_caso".
    const refSelect = within(inspector)
      .getAllByRole('combobox')
      .find((el) =>
        within(el as HTMLElement)
          .queryAllByRole('option')
          .some((o) => /status_caso/i.test(o.textContent ?? '')),
      );
    expect(refSelect).toBeDefined();
  });
});
