/**
 * Onda 11 (UI) — painel de Histórico temporal no inspetor de /ontologia/instancias.
 * Lista as versões (snapshots) do objeto selecionado e, ao clicar numa versão,
 * mostra o estado as-of reconstruído (do snapshot, via Ontology.nodeAsOf).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InstanciasPage from '@/app/ontologia/instancias/page';

const NODE = {
  id: 'n-1', name: 'Morador 1', node_type: 'Morador',
  schema_definition: { canonical: 'c1', properties: { nome: 'Ana' } },
  description: '', version: 3, created_by: 'op', signed_hash: 'abc',
  created_at: '2026-05-30T10:00:00Z', updated_at: null,
};

jest.mock('@/lib/api', () => ({
  Ontology: {
    listNodeTypes: jest.fn().mockResolvedValue([{ name: 'Morador', label: 'Morador', count: 1 }]),
    graph: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
    listNodes: jest.fn().mockResolvedValue([NODE]),
    nodeHistory: jest.fn(),
    nodeAsOf: jest.fn(),
  },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'op', roles: ['admin'] }, loading: false }),
  useCan: () => true,
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('tipo=Morador'),
  usePathname: () => '/ontologia/instancias',
}));

const { Ontology } = jest.requireMock('@/lib/api') as { Ontology: Record<string, jest.Mock> };

describe('Histórico temporal — /ontologia/instancias (Onda 11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ontology.listNodeTypes.mockResolvedValue([{ name: 'Morador', label: 'Morador', count: 1 }]);
    Ontology.graph.mockResolvedValue({ nodes: [], edges: [] });
    Ontology.listNodes.mockResolvedValue([NODE]);
    Ontology.nodeHistory.mockResolvedValue([
      { version: 3, content_hash: 'h3', lineage_event_id: null, markings: [], author: 'op', created_at: '2026-05-30T10:00:00Z' },
      { version: 1, content_hash: 'h1', lineage_event_id: null, markings: [], author: 'op', created_at: '2026-05-29T09:00:00Z' },
    ]);
    Ontology.nodeAsOf.mockResolvedValue({
      node_id: 'n-1', name: 'Morador 1', node_type: 'Morador',
      properties: { nome: 'Ana (v1)' }, schema_definition: {}, canonical: 'c1',
      markings: [], version: 1, content_hash: 'h1', captured_at: '2026-05-29T09:00:00Z',
    });
  });

  async function selectNode() {
    render(<InstanciasPage />);
    const row = await screen.findByTestId('ontologia-instancia-n-1');
    fireEvent.click(row);
    return screen.findByTestId('ontologia-instancia-inspector');
  }

  it('lista as versões do objeto no painel de Histórico', async () => {
    await selectNode();
    await waitFor(() => expect(Ontology.nodeHistory).toHaveBeenCalledWith('n-1'));
    expect(await screen.findByTestId('ontologia-instancia-historico')).toBeInTheDocument();
    expect(screen.getByTestId('ontologia-versao-3')).toBeInTheDocument();
    expect(screen.getByTestId('ontologia-versao-1')).toBeInTheDocument();
  });

  it('clicar numa versão reconstrói o estado as-of (do snapshot)', async () => {
    await selectNode();
    const v1 = await screen.findByTestId('ontologia-versao-1');
    fireEvent.click(v1);
    await waitFor(() => expect(Ontology.nodeAsOf).toHaveBeenCalledWith('n-1', '1'));
    const asof = await screen.findByTestId('ontologia-asof-1');
    expect(asof).toHaveTextContent(/Ana \(v1\)/);
  });

  // Tarefa D — a instância inspecionada abre a ficha canônica de 1ª classe.
  it('inspector tem "Abrir ficha" apontando pra /ficha/<node_id>', async () => {
    await selectNode();
    const abrir = await screen.findByTestId('abrir-ficha-instancia');
    expect(abrir).toHaveAttribute('href', '/ficha/n-1');
    // i18n pt-BR default (useT fallback fora do provider).
    expect(abrir).toHaveTextContent('Abrir ficha');
  });
});
