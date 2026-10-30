/**
 * Relatórios (Notepad governado) — P5 Onda 4.
 *
 * Cobre: lista→abre→edita→salva com NÍVEL CBAC + MARCAÇÕES enviados; banner de
 * classificação no topo (PageShell → store useClassification); preview com faixa
 * de classificação + markdown; "compilar a partir de um nó" (embute widget
 * genérico via Notepad.embed + diretiva) e preview renderizando o embed por
 * node_id (reflexo da ontologia).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RelatoriosPage from '@/app/relatorios/page';
import { useClassification } from '@/lib/store';
import { CLASSIFICATION_LABEL } from '@/lib/classification';

/** Classificação agora é um SelectField (combobox): abre + escolhe a opção. */
async function pickLevel(level: string) {
  fireEvent.click(await screen.findByTestId('rel-level'));
  fireEvent.click(await screen.findByTestId(`rel-level-opt-${level}`));
}
/** Marcações agora é um combobox de busca: abre o popover + alterna a opção. */
async function toggleMarking(slug: string) {
  fireEvent.click(await screen.findByTestId('rel-markings'));
  fireEvent.click(await screen.findByTestId(`rel-markings-opt-${slug}`));
}

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(() => Promise.resolve(true)),
  promptModal: jest.fn(() => Promise.resolve('Relatório novo')),
}));

jest.mock('@/lib/api', () => ({
  Notepad: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    embed: jest.fn(),
    generate: jest.fn(),
    sign: jest.fn(),
    transmit: jest.fn(),
  },
  Markings: { list: jest.fn() },
  Ontology: {
    listNodes: jest.fn(),
    getNode: jest.fn(),
    neighbors: jest.fn(),
    nodeHistory: jest.fn(),
  },
}));

const { Notepad, Markings, Ontology } = jest.requireMock('@/lib/api') as {
  Notepad: Record<string, jest.Mock>;
  Markings: Record<string, jest.Mock>;
  Ontology: Record<string, jest.Mock>;
};
const { promptModal } = jest.requireMock('@/components/dialog/confirm-dialog') as {
  promptModal: jest.Mock;
};

const DOC = {
  id: 'd1',
  slug: 'rel-mensal',
  title: 'Relatório mensal',
  body_md: '# Resumo\n- ponto **um**',
  markings: [],
  classification_level: 'confidencial',
  version: 2,
  pinned: false,
  project_id: null,
  created_at: null,
  updated_at: null,
};
const DOC_EMBED = {
  ...DOC,
  id: 'd2',
  slug: 'rel-embed',
  title: 'Compilado de nó',
  body_md: ':::embed node=n1 widget=object_table',
  classification_level: 'restrito',
};

const MARKINGS = [
  { id: 'm1', tenant_id: 't', slug: 'PII', display_name: 'PII', description: null, category_id: null, active: true, created_at: '' },
  { id: 'm2', tenant_id: 't', slug: 'LGPD', display_name: 'LGPD', description: null, category_id: null, active: true, created_at: '' },
];

describe('Relatórios / Notepad governado (P5 Onda 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useClassification.getState().setContext('publico', '');
    Notepad.list.mockResolvedValue([DOC, DOC_EMBED]);
    Notepad.update.mockImplementation((_id: string, b: Record<string, unknown>) =>
      Promise.resolve({ ...DOC, ...b, version: DOC.version + 1 }),
    );
    Notepad.create.mockResolvedValue({ ...DOC, id: 'dN', slug: 'rel-novo', title: 'Relatório novo', body_md: '', classification_level: 'restrito', markings: [] });
    Notepad.embed.mockResolvedValue({ node_id: 'n1', node_type: 'pessoa', name: 'Node 1', widget: 'correlacao', markings: [], lineage_event_id: 'le1' });
    Markings.list.mockResolvedValue(MARKINGS);
    Ontology.listNodes.mockResolvedValue([
      { id: 'n1', name: 'Node 1', node_type: 'pessoa', properties: {}, schema_definition: {}, description: '', version: 1, created_by: '', signed_hash: null, created_at: '', updated_at: null },
    ]);
    Ontology.getNode.mockResolvedValue({
      id: 'n1', name: 'Node 1', node_type: 'veiculo',
      properties: { placa: 'ABC1234', cor: 'preto' },
      schema_definition: {}, description: '', version: 1, created_by: '', signed_hash: null, created_at: '', updated_at: null,
    });
  });

  it('abre um doc: editor mostra nível CBAC + marcações de catálogo', async () => {
    render(<RelatoriosPage />);
    fireEvent.click(await screen.findByTestId('rel-item-d1'));
    expect(await screen.findByTestId('rel-editor')).toBeInTheDocument();
    expect(screen.getByTestId('rel-title')).toHaveValue('Relatório mensal');
    // nível inicial = o do doc (confidencial) — agora combobox, mostra o RÓTULO
    expect(screen.getByTestId('rel-level')).toHaveTextContent(CLASSIFICATION_LABEL.confidencial);
    // catálogo de marcações (combobox de busca, nunca texto livre) — abre e lista
    fireEvent.click(screen.getByTestId('rel-markings'));
    expect(await screen.findByTestId('rel-markings-opt-PII')).toBeInTheDocument();
    expect(screen.getByTestId('rel-markings-opt-LGPD')).toBeInTheDocument();
  });

  it('editar uma seção markdown + Salvar ENVIA sections + nível + marcações (versão bumpa)', async () => {
    render(<RelatoriosPage />);
    fireEvent.click(await screen.findByTestId('rel-item-d1'));
    // o body_md legado virou a seção markdown 0 — edita o corpo dela
    fireEvent.change(await screen.findByTestId('rel-section-body-0'), { target: { value: '# Novo corpo' } });
    await pickLevel('sigiloso');
    await toggleMarking('PII');
    fireEvent.click(screen.getByTestId('rel-save'));
    await waitFor(() =>
      expect(Notepad.update).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ classification_level: 'sigiloso', markings: ['PII'] }),
      ),
    );
    const call = Notepad.update.mock.calls.find((c: unknown[]) => c[0] === 'd1');
    const secs = ((call?.[1] as { sections?: Array<{ body?: string }> })?.sections) || [];
    expect(secs.some((s) => s.body === '# Novo corpo')).toBe(true);
    await waitFor(() => expect(screen.getByTestId('rel-msg')).toHaveTextContent('v3'));
  });

  it('banner reflete a classificação do doc (PageShell → store)', async () => {
    render(<RelatoriosPage />);
    fireEvent.click(await screen.findByTestId('rel-item-d1'));
    await waitFor(() => expect(useClassification.getState().level).toBe('confidencial'));
    await pickLevel('sigiloso');
    await waitFor(() => expect(useClassification.getState().level).toBe('sigiloso'));
  });

  it('criar ENVIA classification_level default + markings vazias', async () => {
    render(<RelatoriosPage />);
    await screen.findByTestId('rel-list');
    fireEvent.click(screen.getByTestId('rel-new'));
    await waitFor(() => expect(promptModal).toHaveBeenCalled());
    await waitFor(() =>
      expect(Notepad.create).toHaveBeenCalledWith(
        expect.objectContaining({ classification_level: 'restrito', markings: [] }),
      ),
    );
  });

  it('preview: faixa de classificação + markdown (heading/bold/lista)', async () => {
    render(<RelatoriosPage />);
    fireEvent.click(await screen.findByTestId('rel-item-d1'));
    fireEvent.click(await screen.findByTestId('rel-preview-toggle'));
    const prev = await screen.findByTestId('rel-preview');
    expect(screen.getByTestId('rel-preview-cls')).toHaveTextContent('CONFIDENCIAL');
    expect(prev.querySelector('h2')).toHaveTextContent('Resumo');
    expect(prev.querySelector('li')).toHaveTextContent('ponto um');
    expect(prev.querySelector('strong')).toHaveTextContent('um');
  });

  it('seção de widget: palette PLENA do catálogo + escolhe um widget e renderiza ao vivo', async () => {
    render(<RelatoriosPage />);
    fireEvent.click(await screen.findByTestId('rel-item-d1'));
    // adiciona uma seção de WIDGET (a 0 é a markdown migrada do body_md)
    fireEvent.click(await screen.findByTestId('rel-add-widget'));
    // a palette PLENA do catálogo aparece (não as 3 caixinhas rasas)
    await screen.findByTestId('widget-palette');
    expect(screen.getByTestId('widget-palette-callout')).toBeInTheDocument();
    expect(screen.getByTestId('widget-palette-object_table_v2')).toBeInTheDocument();
    // escolhe um bloco-base presentational (callout) → renderiza ao vivo
    fireEvent.click(screen.getByTestId('widget-palette-callout'));
    expect(await screen.findByTestId('callout-widget')).toBeInTheDocument();
  });

  it('seção narrativa: "Gerar com IA" chama Notepad.generate e mostra o corpo gerado', async () => {
    Notepad.generate.mockImplementation((id: string, b: { only_section_ids: string[] }) => {
      const sid = b.only_section_ids[0];
      return Promise.resolve({
        ...DOC,
        id,
        version: 3,
        sections: [
          {
            id: sid,
            kind: 'narrative',
            heading: 'Resumo',
            prompt: 'Resuma',
            generated: {
              body: 'Trecho redigido com auxílio de IA — revise. Resumo gerado pela IA.',
              citations: ['PES-1'],
              inference_log_id: 'log-1',
            },
          },
        ],
      });
    });
    render(<RelatoriosPage />);
    fireEvent.click(await screen.findByTestId('rel-item-d1'));
    fireEvent.click(await screen.findByTestId('rel-add-narrative'));
    // a narrativa é a seção 1 (0 = markdown migrada do body_md)
    fireEvent.change(await screen.findByTestId('rel-section-prompt-1'), { target: { value: 'Resuma' } });
    fireEvent.click(screen.getByTestId('rel-section-generate-1'));
    await waitFor(() =>
      expect(Notepad.generate).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ only_section_ids: expect.any(Array) }),
      ),
    );
    expect(await screen.findByText(/Resumo gerado pela IA/)).toBeInTheDocument();
  });

  it('preview renderiza o widget embutido por node_id (reflexo da ontologia)', async () => {
    render(<RelatoriosPage />);
    fireEvent.click(await screen.findByTestId('rel-item-d2'));
    fireEvent.click(await screen.findByTestId('rel-preview-toggle'));
    // o embed busca o nó canônico ao vivo e mostra as propriedades
    expect(await screen.findByTestId('node-embed')).toHaveAttribute('data-widget', 'object_table');
    await waitFor(() => expect(Ontology.getNode).toHaveBeenCalledWith('n1'));
    expect(await screen.findByTestId('node-embed-body')).toHaveTextContent('ABC1234');
  });
});
