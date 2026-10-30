/**
 * Onda 17 UI — Quiver (análise interativa / free-form analysis). Lista análises →
 * abre → escolhe Object Set → adiciona card de métrica que RODA ao vivo no motor
 * de agregação da Onda 14 → Salvar persiste os cells.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuiverPage from '@/app/painel-de-controle/quiver/page';

jest.mock('@/components/auth/require-perm', () => ({ RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/lib/api', () => ({
  Quiver: { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
  Ontology: { listNodeTypes: jest.fn(), objectTypeSchema: jest.fn(), aggregateObjectSet: jest.fn() },
}));
const { Quiver, Ontology } = jest.requireMock('@/lib/api') as { Quiver: Record<string, jest.Mock>; Ontology: Record<string, jest.Mock> };

const NB = { id: 'n1', slug: 'risco', display_name: 'Risco por subestação', cells: [], created_at: null, updated_at: null };

describe('Quiver — análise interativa (Onda 17)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Quiver.list.mockResolvedValue([NB]);
    Ontology.listNodeTypes.mockResolvedValue([{ name: 'subestacao', label: 'Subestacao', count: 12 }]);
    Ontology.objectTypeSchema.mockResolvedValue({ properties: [{ key: 'tensao', type: 'number', label: 'Tensão' }, { key: 'status', type: 'text', label: 'Status' }] });
    Ontology.aggregateObjectSet.mockResolvedValue({ result: 12 });
    Quiver.update.mockImplementation((_id: string, b: { cells: unknown }) => Promise.resolve({ ...NB, ...b }));
  });

  it('lista análises e abre uma (mostra fonte + paleta de cards)', async () => {
    render(<QuiverPage />);
    fireEvent.click(await screen.findByTestId('qv-nb-n1'));
    expect(await screen.findByTestId('qv-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('qv-source')).toBeInTheDocument();
    expect(screen.getByTestId('qv-add-metric')).toBeInTheDocument();
  });

  it('card de métrica RODA ao vivo no motor de agregação (count sobre o Object Set)', async () => {
    render(<QuiverPage />);
    fireEvent.click(await screen.findByTestId('qv-nb-n1'));
    fireEvent.change(await screen.findByTestId('qv-source'), { target: { value: 'subestacao' } });
    fireEvent.click(screen.getByTestId('qv-add-metric'));
    // op=count (default) não precisa de field → agrega imediatamente
    await waitFor(() => expect(Ontology.aggregateObjectSet).toHaveBeenCalledWith('subestacao', expect.objectContaining({ op: 'count' }), null));
    expect(await screen.findByTestId('qv-card-result')).toHaveTextContent('12');
  });

  it('Salvar persiste o Object Set + cards como cells', async () => {
    render(<QuiverPage />);
    fireEvent.click(await screen.findByTestId('qv-nb-n1'));
    fireEvent.change(await screen.findByTestId('qv-source'), { target: { value: 'subestacao' } });
    fireEvent.click(screen.getByTestId('qv-add-metric'));
    fireEvent.click(await screen.findByTestId('qv-save'));
    await waitFor(() => expect(Quiver.update).toHaveBeenCalled());
    const cells = Quiver.update.mock.calls[0][1].cells;
    expect(cells[0]).toMatchObject({ kind: 'source', object_type: 'subestacao' });
    expect(cells.some((c: { kind: string }) => c.kind === 'metric')).toBe(true);
  });

  // ── Onda 18 — Contour: filtro AND/OR escopa o Object Set fonte ──────────
  it('Contour: adicionar regra + configurar → agregação roda com o filtro canônico', async () => {
    render(<QuiverPage />);
    fireEvent.click(await screen.findByTestId('qv-nb-n1'));
    fireEvent.change(await screen.findByTestId('qv-source'), { target: { value: 'subestacao' } });
    // adiciona um card de métrica (count) e uma regra de filtro
    fireEvent.click(screen.getByTestId('qv-add-metric'));
    fireEvent.click(await screen.findByTestId('ctr-add'));
    fireEvent.change(await screen.findByTestId('ctr-field-0'), { target: { value: 'status' } });
    fireEvent.change(screen.getByTestId('ctr-op-0'), { target: { value: 'eq' } });
    fireEvent.change(screen.getByTestId('ctr-value-0'), { target: { value: 'ativa' } });
    // o card reroda a agregação com o filtro canônico — campo traduzido p/ o
    // path físico do JSONB (`properties.status`) na fronteira da API.
    await waitFor(() =>
      expect(Ontology.aggregateObjectSet).toHaveBeenCalledWith(
        'subestacao',
        expect.objectContaining({ op: 'count' }),
        { op: 'and', operands: [{ op: 'eq', field: 'properties.status', value: 'ativa' }] },
      ),
    );
  });

  it('Contour: o filtro é persistido na source cell ao Salvar', async () => {
    render(<QuiverPage />);
    fireEvent.click(await screen.findByTestId('qv-nb-n1'));
    fireEvent.change(await screen.findByTestId('qv-source'), { target: { value: 'subestacao' } });
    fireEvent.click(await screen.findByTestId('ctr-add'));
    fireEvent.change(await screen.findByTestId('ctr-field-0'), { target: { value: 'status' } });
    fireEvent.change(screen.getByTestId('ctr-value-0'), { target: { value: 'ativa' } });
    fireEvent.click(await screen.findByTestId('qv-save'));
    await waitFor(() => expect(Quiver.update).toHaveBeenCalled());
    const cells = Quiver.update.mock.calls[0][1].cells;
    expect(cells[0]).toMatchObject({
      kind: 'source', object_type: 'subestacao',
      filter: { op: 'and', operands: [{ op: 'eq', field: 'status', value: 'ativa' }] },
    });
  });

  it('Contour: regra numérica coage o valor (number) conforme o tipo do contrato', async () => {
    render(<QuiverPage />);
    fireEvent.click(await screen.findByTestId('qv-nb-n1'));
    fireEvent.change(await screen.findByTestId('qv-source'), { target: { value: 'subestacao' } });
    fireEvent.click(screen.getByTestId('qv-add-metric'));
    fireEvent.click(await screen.findByTestId('ctr-add'));
    fireEvent.change(await screen.findByTestId('ctr-field-0'), { target: { value: 'tensao' } });
    fireEvent.change(screen.getByTestId('ctr-value-0'), { target: { value: '138' } });
    await waitFor(() =>
      expect(Ontology.aggregateObjectSet).toHaveBeenCalledWith(
        'subestacao', expect.anything(),
        { op: 'and', operands: [{ op: 'eq', field: 'properties.tensao', value: 138 }] },
      ),
    );
  });

  // ── Onda 19 — card de Gráfico (bar/line/pie) sobre o group-by ───────────
  const BUCKETS = [
    { key: { status: 'aberta' }, count: 3 },
    { key: { status: 'resolvida' }, count: 2 },
  ];

  it('Gráfico: card adicionado mostra toggle barras/linha/pizza + agrupar-por', async () => {
    render(<QuiverPage />);
    fireEvent.click(await screen.findByTestId('qv-nb-n1'));
    fireEvent.change(await screen.findByTestId('qv-source'), { target: { value: 'subestacao' } });
    fireEvent.click(screen.getByTestId('qv-add-chart'));
    expect(await screen.findByTestId('qv-chart-type-bar')).toBeInTheDocument();
    expect(screen.getByTestId('qv-chart-type-line')).toBeInTheDocument();
    expect(screen.getByTestId('qv-chart-type-pie')).toBeInTheDocument();
    expect(screen.getByTestId('qv-card-groupby')).toBeInTheDocument();
  });

  it('Gráfico: agrupar-por roda agregação group-by e renderiza uma barra por bucket', async () => {
    Ontology.aggregateObjectSet.mockResolvedValue({ result: BUCKETS });
    render(<QuiverPage />);
    fireEvent.click(await screen.findByTestId('qv-nb-n1'));
    fireEvent.change(await screen.findByTestId('qv-source'), { target: { value: 'subestacao' } });
    fireEvent.click(screen.getByTestId('qv-add-chart'));
    fireEvent.change(await screen.findByTestId('qv-card-groupby'), { target: { value: 'status' } });
    // group_by traduzido p/ o path físico do JSONB na fronteira da API
    await waitFor(() =>
      expect(Ontology.aggregateObjectSet).toHaveBeenCalledWith(
        'subestacao', expect.objectContaining({ op: 'count', group_by: ['properties.status'] }), null,
      ),
    );
    await waitFor(() => expect(screen.getAllByTestId('chart-bar')).toHaveLength(2));
  });

  it('Gráfico: alternar p/ pizza renderiza uma fatia por bucket', async () => {
    Ontology.aggregateObjectSet.mockResolvedValue({ result: BUCKETS });
    render(<QuiverPage />);
    fireEvent.click(await screen.findByTestId('qv-nb-n1'));
    fireEvent.change(await screen.findByTestId('qv-source'), { target: { value: 'subestacao' } });
    fireEvent.click(screen.getByTestId('qv-add-chart'));
    fireEvent.change(await screen.findByTestId('qv-card-groupby'), { target: { value: 'status' } });
    await waitFor(() => expect(screen.getAllByTestId('chart-bar')).toHaveLength(2));
    fireEvent.click(screen.getByTestId('qv-chart-type-pie'));
    await waitFor(() => expect(screen.getAllByTestId('chart-slice')).toHaveLength(2));
  });

  it('Gráfico: Salvar persiste o card com chart_type + group_by (lógico)', async () => {
    Ontology.aggregateObjectSet.mockResolvedValue({ result: BUCKETS });
    render(<QuiverPage />);
    fireEvent.click(await screen.findByTestId('qv-nb-n1'));
    fireEvent.change(await screen.findByTestId('qv-source'), { target: { value: 'subestacao' } });
    fireEvent.click(screen.getByTestId('qv-add-chart'));
    fireEvent.change(await screen.findByTestId('qv-card-groupby'), { target: { value: 'status' } });
    fireEvent.click(screen.getByTestId('qv-chart-type-line'));
    fireEvent.click(await screen.findByTestId('qv-save'));
    await waitFor(() => expect(Quiver.update).toHaveBeenCalled());
    const cells = Quiver.update.mock.calls[0][1].cells;
    const chart = cells.find((c: { kind: string }) => c.kind === 'chart');
    expect(chart).toMatchObject({ kind: 'chart', chart_type: 'line', group_by: ['status'] });
  });
});
