/**
 * Wave H.2 — /painel-de-controle/marcacoes-propriedade workspace (3-pane).
 *
 * Cobre: tabs left pane, bulk select, bulk apply/remove, export CSV, right
 * pane detail/history, missing-mode filter, kind filter, property_key filter.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
// LOTE1 ELO PAGES (#7): a page virou redirect; o workspace "Por propriedade" foi
// extraído para este componente reusável, embutido na aba "Marcações" de /dados.
import { MarcacoesPropriedadeWorkspace as Page } from '@/components/markings/marcacoes-propriedade-workspace';

jest.mock('@/lib/api', () => ({
  Markings: { list: jest.fn() },
  OntologyNodes: { search: jest.fn() },
  PropertyMarkings: {
    listForNode: jest.fn(),
    listOne: jest.fn(),
    apply: jest.fn(),
    remove: jest.fn(),
    bulkApply: jest.fn(),
    bulkRemove: jest.fn(),
    coverage: jest.fn(),
    exportCsvUrl: jest.fn(
      (p) => `/api/ontology/property-markings/export.csv${p?.node_type ? `?node_type=${p.node_type}` : ''}`,
    ),
  },
  Projects: { list: jest.fn() },
  Lineage: { listEvents: jest.fn() },
}));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin', roles: ['admin'] }, loading: false }),
  useCan: () => true,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

const api = jest.requireMock('@/lib/api') as {
  Markings: { list: jest.Mock };
  OntologyNodes: { search: jest.Mock };
  PropertyMarkings: {
    listForNode: jest.Mock;
    bulkApply: jest.Mock;
    bulkRemove: jest.Mock;
    remove: jest.Mock;
    exportCsvUrl: jest.Mock;
  };
  Projects: { list: jest.Mock };
  Lineage: { listEvents: jest.Mock };
};

const markings = [
  {
    id: 'mark-sigiloso',
    tenant_id: 't',
    slug: 'sigiloso',
    display_name: 'SIGILOSO',
    description: null,
    category_id: null,
    active: true,
    created_at: '',
  },
  {
    id: 'mark-operacao-x',
    tenant_id: 't',
    slug: 'operacao-x',
    display_name: 'OPERACAO-X',
    description: null,
    category_id: null,
    active: true,
    created_at: '',
  },
];
const nodes = [
  {
    id: 'node-1',
    name: 'Alvo Aurora',
    node_type: 'pessoa',
    description: null,
    property_keys: ['cpf', 'nome'],
  },
  {
    id: 'node-2',
    name: 'Veículo ABC-1234',
    node_type: 'veiculo',
    description: null,
    property_keys: ['placa'],
  },
  {
    id: 'node-3',
    name: 'Endereço Bauru',
    node_type: 'lugar',
    description: null,
    property_keys: ['cep'],
  },
];
const projects = [
  {
    id: 'proj-1',
    tenant_id: 't',
    slug: 'aurora-2',
    display_name: 'Aurora-2',
    description: null,
    active: true,
    created_at: '',
  },
];

function defaultMocks() {
  api.Markings.list.mockResolvedValue(markings);
  api.OntologyNodes.search.mockResolvedValue(nodes);
  api.Projects.list.mockResolvedValue(projects);
  api.PropertyMarkings.listForNode.mockResolvedValue({});
  api.PropertyMarkings.bulkApply.mockResolvedValue({ applied: 0, skipped: 0, failed: [] });
  api.PropertyMarkings.bulkRemove.mockResolvedValue({ applied: 0, skipped: 0, failed: [] });
  api.Lineage.listEvents.mockResolvedValue([]);
}

describe('MarcacoesPropriedadePage — Wave H.2 workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defaultMocks();
  });

  it('renderiza o workspace 3-pane com 3 tabs à esquerda', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Markings.list).toHaveBeenCalled());
    expect(await screen.findByTestId('marcacoes-propriedade-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('mp-left-pane')).toBeInTheDocument();
    expect(screen.getByTestId('mp-tab-marking')).toBeInTheDocument();
    expect(screen.getByTestId('mp-tab-kind')).toBeInTheDocument();
    expect(screen.getByTestId('mp-tab-operation')).toBeInTheDocument();
  });

  it('mostra a lista de marcações na aba Por Marcação', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Markings.list).toHaveBeenCalled());
    expect(await screen.findByTestId('mp-marking-sigiloso')).toBeInTheDocument();
    expect(screen.getByTestId('mp-marking-operacao-x')).toBeInTheDocument();
  });

  it('troca para a aba Por Tipo e mostra kinds derivados', async () => {
    render(<Page />);
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('mp-tab-kind'));
    expect(await screen.findByTestId('mp-kind-pessoa')).toBeInTheDocument();
    expect(screen.getByTestId('mp-kind-veiculo')).toBeInTheDocument();
  });

  it('troca para a aba Por Operação e mostra projects', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Projects.list).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('mp-tab-operation'));
    expect(await screen.findByTestId('mp-op-aurora-2')).toBeInTheDocument();
  });

  it('lista os Objetos do centro com marcações inline e checkbox por linha', async () => {
    render(<Page />);
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
    expect(await screen.findByTestId('mp-node-row-node-1')).toBeInTheDocument();
    expect(screen.getByTestId('mp-check-node-1')).toBeInTheDocument();
    expect(screen.getByTestId('mp-node-row-node-2')).toBeInTheDocument();
  });

  it('filtra centro por kind selecionado na esquerda', async () => {
    render(<Page />);
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('mp-tab-kind'));
    fireEvent.click(await screen.findByTestId('mp-kind-pessoa'));
    await waitFor(() => {
      expect(screen.getByTestId('mp-node-row-node-1')).toBeInTheDocument();
      expect(screen.queryByTestId('mp-node-row-node-2')).not.toBeInTheDocument();
    });
  });

  it('filtra centro por property_key', async () => {
    render(<Page />);
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId('mp-prop-filter'), { target: { value: 'placa' } });
    await waitFor(() => {
      expect(screen.getByTestId('mp-node-row-node-2')).toBeInTheDocument();
      expect(screen.queryByTestId('mp-node-row-node-1')).not.toBeInTheDocument();
    });
  });

  it('habilita bulk bar ao selecionar nós', async () => {
    render(<Page />);
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('mp-check-node-1'));
    fireEvent.click(screen.getByTestId('mp-check-node-2'));
    expect(await screen.findByTestId('mp-bulk-bar')).toHaveTextContent(/2 selecionados/);
  });

  it('chama bulkApply com node_ids selecionados e marking_id escolhido', async () => {
    api.PropertyMarkings.bulkApply.mockResolvedValueOnce({ applied: 2, skipped: 0, failed: [] });
    render(<Page />);
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('mp-check-node-1'));
    fireEvent.click(screen.getByTestId('mp-check-node-2'));
    fireEvent.click(screen.getByTestId('mp-bulk-apply'));
    const dialog = await screen.findByTestId('mp-picker-dialog');
    fireEvent.change(within(dialog).getByTestId('mp-picker-marking'), {
      target: { value: 'mark-sigiloso' },
    });
    fireEvent.click(within(dialog).getByTestId('mp-picker-confirm'));
    await waitFor(() =>
      expect(api.PropertyMarkings.bulkApply).toHaveBeenCalledWith({
        node_ids: ['node-1', 'node-2'],
        marking_id: 'mark-sigiloso',
        property_key: null,
      }),
    );
    expect(await screen.findByTestId('mp-action-msg')).toHaveTextContent(/Aplicadas: 2/);
  });

  it('chama bulkRemove com payload correto', async () => {
    api.PropertyMarkings.bulkRemove.mockResolvedValueOnce({ applied: 1, skipped: 1, failed: [] });
    render(<Page />);
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('mp-check-node-1'));
    fireEvent.click(screen.getByTestId('mp-bulk-remove'));
    const dialog = await screen.findByTestId('mp-picker-dialog');
    fireEvent.change(within(dialog).getByTestId('mp-picker-marking'), {
      target: { value: 'mark-sigiloso' },
    });
    fireEvent.click(within(dialog).getByTestId('mp-picker-confirm'));
    await waitFor(() =>
      expect(api.PropertyMarkings.bulkRemove).toHaveBeenCalledWith({
        node_ids: ['node-1'],
        marking_id: 'mark-sigiloso',
        property_key: null,
      }),
    );
  });

  it('botão "Exportar CSV" gera URL com filtros aplicados', async () => {
    const opened: string[] = [];
    const originalOpen = window.open;
    window.open = jest.fn((url) => {
      opened.push(String(url));
      return null;
    }) as unknown as typeof window.open;
    try {
      render(<Page />);
      await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
      fireEvent.click(screen.getByTestId('mp-tab-kind'));
      fireEvent.click(await screen.findByTestId('mp-kind-pessoa'));
      fireEvent.click(screen.getByTestId('mp-export'));
      await waitFor(() => expect(opened.length).toBe(1));
      expect(opened[0]).toContain('export.csv');
      expect(opened[0]).toContain('node_type=pessoa');
    } finally {
      window.open = originalOpen;
    }
  });

  it('abre right pane ao clicar em um nó e mostra detail empty quando sem marcações', async () => {
    render(<Page />);
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('mp-node-row-node-1'));
    expect(await screen.findByTestId('mp-right-pane')).toBeInTheDocument();
    expect(screen.getByTestId('mp-right-prop')).toHaveTextContent(/Nenhuma marcação aplicada/);
  });

  it('mostra histórico de auditoria no right pane quando há LineageEvent do nó', async () => {
    api.PropertyMarkings.listForNode.mockResolvedValue({
      cpf: [
        {
          marking_id: 'mark-sigiloso',
          marking_slug: 'sigiloso',
          marking_display_name: 'SIGILOSO',
          applied_at: '2026-05-23T10:00:00Z',
        },
      ],
    });
    api.Lineage.listEvents.mockResolvedValue([
      {
        id: 'evt-1',
        event_type: 'markings.apply.property',
        actor: 'admin',
        status: 'committed',
        metadata_: { node_id: 'node-1', marking_id: 'mark-sigiloso', property_key: 'cpf' },
        timestamp: '2026-05-23T10:00:00Z',
        tenant_id: 't',
      },
    ]);
    render(<Page />);
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('mp-node-row-node-1'));
    expect(await screen.findByTestId('mp-right-hist-evt-1')).toBeInTheDocument();
    expect(screen.getByTestId('mp-right-prop-cpf')).toBeInTheDocument();
  });

  it('mode "mostrar SEM marcação" inverte filtro de marking', async () => {
    api.PropertyMarkings.listForNode.mockImplementation(async (id: string) => {
      if (id === 'node-1') {
        return {
          cpf: [
            {
              marking_id: 'mark-sigiloso',
              marking_slug: 'sigiloso',
              marking_display_name: 'SIGILOSO',
              applied_at: '2026-05-23T10:00:00Z',
            },
          ],
        };
      }
      return {};
    });
    render(<Page />);
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
    // Wait for node-1 to have markings loaded.
    await waitFor(() =>
      expect(api.PropertyMarkings.listForNode).toHaveBeenCalledWith('node-1'),
    );
    fireEvent.click(screen.getByTestId('mp-tab-marking'));
    fireEvent.click(await screen.findByTestId('mp-marking-sigiloso'));
    // With marking active and missing-mode OFF → only node-1 visible
    await waitFor(() => {
      expect(screen.getByTestId('mp-node-row-node-1')).toBeInTheDocument();
      expect(screen.queryByTestId('mp-node-row-node-2')).not.toBeInTheDocument();
    });
    // Toggle missing-mode → only nodes WITHOUT the marking visible
    fireEvent.click(screen.getByTestId('mp-missing-mode'));
    await waitFor(() => {
      expect(screen.queryByTestId('mp-node-row-node-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('mp-node-row-node-2')).toBeInTheDocument();
    });
  });
});
