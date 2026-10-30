/**
 * Wave I.4 (2026-05-23) — Marcações por Propriedade · tabs compactas.
 *
 * Operador #8: "as tabs, os textos estão tão grandes que quebram linha
 * e fiquei extretamente pessimo de ler". Solução:
 *   • Labels curtos (Marcação · Tipo · Operação)
 *   • Tooltip nativo (title="") + aria-label preservam descritivo
 *   • Badge count por eixo
 *   • whitespace-nowrap + truncate + max-width forçam linha única
 *   • Tablist com overflow-x-auto em viewports estreitas
 *   • Componente TabsCompact reusável
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// LOTE1 ELO PAGES (#7): a page virou redirect; o workspace "Por propriedade" foi
// extraído para este componente reusável, embutido na aba "Marcações" de /dados.
import { MarcacoesPropriedadeWorkspace as Page } from '@/components/markings/marcacoes-propriedade-workspace';
import { TabsCompact } from '@/components/ui/tabs-compact';
import { Shield, Boxes, FolderTree } from 'lucide-react';

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
    exportCsvUrl: jest.fn(() => '/api/ontology/property-markings/export.csv'),
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
  PropertyMarkings: { listForNode: jest.Mock };
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
    id: 'mark-x',
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
  { id: 'n-1', name: 'Alvo Aurora', node_type: 'pessoa', description: null, property_keys: ['cpf'] },
  { id: 'n-2', name: 'Veículo A', node_type: 'veiculo', description: null, property_keys: ['placa'] },
];
const projects = [
  {
    id: 'p-1',
    tenant_id: 't',
    slug: 'aurora-2',
    display_name: 'Aurora-2',
    description: null,
    active: true,
    created_at: '',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.Markings.list.mockResolvedValue(markings);
  api.OntologyNodes.search.mockResolvedValue(nodes);
  api.Projects.list.mockResolvedValue(projects);
  api.PropertyMarkings.listForNode.mockResolvedValue({});
  api.Lineage.listEvents.mockResolvedValue([]);
});

describe('Wave I.4 · Marcações por Propriedade · TabsCompact', () => {
  it('1. As 3 tabs (Marcação · Tipo · Operação) renderizam com icon + label curto', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Markings.list).toHaveBeenCalled());
    const marking = await screen.findByTestId('mp-tab-marking');
    const kind = screen.getByTestId('mp-tab-kind');
    const op = screen.getByTestId('mp-tab-operation');
    // Label curto na superfície (não "Por Tipo de Operação Ontológica…").
    expect(marking).toHaveTextContent(/Marcação/);
    expect(kind).toHaveTextContent(/Tipo/);
    expect(op).toHaveTextContent(/Operação/);
    // Cada tab tem um ícone lucide.
    expect(marking.querySelector('svg')).not.toBeNull();
    expect(kind.querySelector('svg')).not.toBeNull();
    expect(op.querySelector('svg')).not.toBeNull();
  });

  it('2. Cada tab tem aria-label + tooltip nativo com fullLabel descritivo', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Markings.list).toHaveBeenCalled());
    const marking = await screen.findByTestId('mp-tab-marking');
    expect(marking).toHaveAttribute('aria-label', 'Por Marcação');
    expect(marking).toHaveAttribute('title', 'Por Marcação');
    expect(screen.getByTestId('mp-tab-kind')).toHaveAttribute('title', 'Por Tipo de Objeto');
    expect(screen.getByTestId('mp-tab-operation')).toHaveAttribute('title', 'Por Operação');
  });

  it('3. Labels visíveis NUNCA quebram linha — whitespace-nowrap garantido', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Markings.list).toHaveBeenCalled());
    const list = await screen.findByRole('tablist');
    // O container tablist tem whitespace-nowrap + overflow-x-auto.
    expect(list.className).toMatch(/whitespace-nowrap/);
    expect(list.className).toMatch(/overflow-x-auto/);
  });

  it('4. Cada tab usa label.truncate em <span> interno para forçar uma linha', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Markings.list).toHaveBeenCalled());
    const marking = await screen.findByTestId('mp-tab-marking');
    // O <span> com o label tem .truncate.
    const spans = marking.querySelectorAll('span');
    const hasTruncate = Array.from(spans).some((s) =>
      s.className.includes('truncate'),
    );
    expect(hasTruncate).toBe(true);
  });

  it('5. Cada tab tem max-width inline (style) p/ truncate previsível', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Markings.list).toHaveBeenCalled());
    const marking = await screen.findByTestId('mp-tab-marking');
    // maxTabWidth=140 default da página → style.maxWidth = '140px'.
    expect(marking.style.maxWidth).toMatch(/px/);
  });

  it('6. Badge count renderiza ao lado do label (Marcação = 2, Operação = 1)', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Markings.list).toHaveBeenCalled());
    const marking = await screen.findByTestId('mp-tab-marking');
    // contagem aparece como subnode com aria-label "N itens".
    const badge = marking.querySelector('[aria-label="2 itens"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('2');
  });

  it('7. role="tablist" + role="tab" + aria-selected estão corretos', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Markings.list).toHaveBeenCalled());
    const list = await screen.findByRole('tablist');
    expect(list).toBeInTheDocument();
    const tabs = list.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
    // O primeiro (marking) é o ativo default.
    const marking = screen.getByTestId('mp-tab-marking');
    expect(marking).toHaveAttribute('aria-selected', 'true');
    const kind = screen.getByTestId('mp-tab-kind');
    expect(kind).toHaveAttribute('aria-selected', 'false');
  });

  it('8. Click em outra tab muda aria-selected (interação preservada)', async () => {
    render(<Page />);
    await waitFor(() => expect(api.Markings.list).toHaveBeenCalled());
    const kind = await screen.findByTestId('mp-tab-kind');
    fireEvent.click(kind);
    await waitFor(() => {
      expect(screen.getByTestId('mp-tab-kind')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('mp-tab-marking')).toHaveAttribute('aria-selected', 'false');
    });
  });

  it('9. TabsCompact standalone — labels longos truncam, scroll horizontal funciona em viewport estreita', () => {
    const onChange = jest.fn();
    render(
      <div style={{ width: '200px', overflow: 'hidden' }}>
        <TabsCompact
          value="a"
          onChange={onChange}
          ariaLabel="Eixos"
          maxTabWidth={80}
          items={[
            { value: 'a', label: 'AAAAA', fullLabel: 'Aaaa muito longo aaa', icon: Shield, testId: 'tc-a' },
            { value: 'b', label: 'BBBBB', fullLabel: 'Bbbb muito longo bbb', icon: Boxes, testId: 'tc-b' },
            { value: 'c', label: 'CCCCC', fullLabel: 'Cccc muito longo ccc', icon: FolderTree, testId: 'tc-c' },
          ]}
        />
      </div>,
    );
    const list = screen.getByRole('tablist');
    expect(list.className).toMatch(/overflow-x-auto/);
    // Cada tab tem shrink-0 → não comprime, scroll horizontal aplica.
    const a = screen.getByTestId('tc-a');
    expect(a.className).toMatch(/shrink-0/);
    expect(a.style.maxWidth).toBe('80px');
  });

  it('10. TabsCompact dispara onChange ao clicar, sem swallowing', () => {
    const onChange = jest.fn();
    render(
      <TabsCompact
        value="a"
        onChange={onChange}
        items={[
          { value: 'a', label: 'A', icon: Shield, testId: 'tcv-a' },
          { value: 'b', label: 'B', icon: Boxes, testId: 'tcv-b' },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId('tcv-b'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
