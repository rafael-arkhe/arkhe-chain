/**
 * M5-10 — /painel-de-controle/grafo unificado (Mapa + Eventos).
 *
 * Cobre a orquestração da página: abas Mapa/Eventos, refresh ao trocar
 * filtro (fix do bug de refresh), selection details, lista textual e o
 * log de eventos na aba Eventos. O `<LineageFlowCanvas>` (reactflow +
 * dagre) é mockado aqui — sua renderização é testada em
 * `grafo-flow-canvas.test.tsx` com reactflow mockado.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GrafoPage from '@/app/painel-de-controle/grafo/page';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  usePathname: () => '/painel-de-controle/grafo',
  useSearchParams: () => mockSearchParams,
}));

// O canvas reactflow+dagre é mockado: expõe os nós como botões clicáveis
// e o color-axis ativo, sem depender de ResizeObserver/jsdom. O
// `splitConnectivity` (puro) é reimplementado aqui — a página o usa p/
// decidir o que entra no canvas (conexos) vs. a lista de soltos.
jest.mock('@/components/grafo/lineage-flow-canvas', () => ({
  __esModule: true,
  splitConnectivity: (
    nodes: { id: string }[],
    edges: { from_id: string; to_id: string }[],
  ) => {
    const ids = new Set(nodes.map((n) => n.id));
    const deg = new Map<string, number>();
    for (const n of nodes) deg.set(n.id, 0);
    for (const e of edges) {
      if (!ids.has(e.from_id) || !ids.has(e.to_id)) continue;
      deg.set(e.from_id, (deg.get(e.from_id) ?? 0) + 1);
      deg.set(e.to_id, (deg.get(e.to_id) ?? 0) + 1);
    }
    const connectedIds = new Set<string>();
    const disconnectedIds = new Set<string>();
    for (const n of nodes) {
      if ((deg.get(n.id) ?? 0) > 0) connectedIds.add(n.id);
      else disconnectedIds.add(n.id);
    }
    return { connectedIds, disconnectedIds };
  },
  LineageFlowCanvas: (props: {
    nodes: { id: string; label: string }[];
    colorAxis: string;
    onSelect?: (n: unknown) => void;
  }) => (
    <div data-testid="lineage-flow-canvas" data-color-axis={props.colorAxis}>
      {props.nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          data-testid={`flow-node-${n.id}`}
          onClick={() => props.onSelect?.(n)}
        >
          {n.label}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('@/lib/api', () => ({
  LineageGraph: { get: jest.fn() },
  Lineage: { listEvents: jest.fn(), assets: jest.fn(), columnTrace: jest.fn() },
}));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));

const { LineageGraph, Lineage } = jest.requireMock('@/lib/api') as {
  LineageGraph: { get: jest.Mock };
  Lineage: { listEvents: jest.Mock; assets: jest.Mock; columnTrace: jest.Mock };
};

const fakeGraph = {
  nodes: [
    {
      id: 'asset:1',
      kind: 'DataAsset',
      label: 'logs.bo',
      markings: [],
      extra: {},
      org: { project_id: 'p-1', project_label: 'Operação Norte', space_label: 'Espaço Alfa' },
    },
    {
      id: 'action:abc',
      kind: 'ActionType',
      label: 'security.criar_caso',
      markings: ['SIGILOSO'],
      extra: { code_ref: 'app.actions.security.criar_caso' },
    },
    // M5-polish — Language model node.
    {
      id: 'model:groq/llama-4-scout',
      kind: 'LanguageModel',
      label: 'llama-4-scout',
      markings: [],
      extra: { provider: 'groq', calls: 3 },
    },
  ],
  edges: [
    {
      id: 'ev-1',
      from_id: 'asset:1',
      to_id: 'action:abc',
      kind: 'action.execute.success',
      event_id: 'ev-1',
      actor: 'alice',
      created_at: '2026-05-23T10:00:00Z',
    },
  ],
  total_nodes: 3,
  total_edges: 1,
  truncated: false,
};

const fakeEvents = [
  {
    id: 'le-1',
    event_type: 'markings.apply',
    actor: 'bob',
    status: 'committed',
    metadata_: { marking: 'SIGILOSO' },
    timestamp: '2026-05-23T10:00:00Z',
    tenant_id: 't1',
  },
];

describe('GrafoPage — M5-10 unificado', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    LineageGraph.get.mockResolvedValue(fakeGraph);
    Lineage.listEvents.mockResolvedValue(fakeEvents);
  });

  it('renders the Mapa tab by default and fetches the graph', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    const list = await screen.findByTestId('grafo-nodes');
    expect(within(list).getByText('logs.bo')).toBeInTheDocument();
    expect(screen.getByTestId('grafo-tab-mapa')).toHaveAttribute('aria-selected', 'true');
    // Diagrama (não teia) renderizado.
    expect(screen.getByTestId('lineage-flow-canvas')).toBeInTheDocument();
  });

  it('filters nodes by label using the search input (textual list)', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    const list = await screen.findByTestId('grafo-nodes');
    expect(within(list).getByText('logs.bo')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('grafo-filter'), {
      target: { value: 'security' },
    });
    expect(within(list).getByText('security.criar_caso')).toBeInTheDocument();
    expect(within(list).queryByText('logs.bo')).not.toBeInTheDocument();
  });

  it('shows selection details with neighbors on node click', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    const btn = await screen.findByTestId('grafo-node-asset:1');
    fireEvent.click(btn);
    const detail = screen.getByTestId('grafo-detail');
    expect(detail).toHaveTextContent('logs.bo');
    // #11 — a relação da aresta aparece HUMANIZADA (labelLineageKind), não
    // mais o event_type cru 'action.execute.success'.
    expect(detail).toHaveTextContent('Ação');
    expect(detail).toHaveTextContent('alice');
  });

  it('shows the Operação/Espaço (Organization) of a selected node', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('grafo-node-asset:1'));
    const org = screen.getByTestId('grafo-detail-org');
    expect(org).toHaveTextContent('Operação Norte');
    expect(org).toHaveTextContent('Espaço Alfa');
  });

  it('offers a Language model node-type filter option', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    const select = screen.getByTestId('grafo-kind') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain('LanguageModel');
    expect(values).toContain('Workspace');
  });

  it('lists the Language model node in the textual node list', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    const list = await screen.findByTestId('grafo-nodes');
    expect(within(list).getByText('llama-4-scout')).toBeInTheDocument();
  });

  it('re-fetches when the kind filter changes (refresh fix)', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('grafo-kind'), {
      target: { value: 'ActionType' },
    });
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalledTimes(2));
    expect(LineageGraph.get).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'ActionType' }),
      expect.anything(), // AbortSignal encadeado
    );
  });

  it('re-fetches when the marking filter changes (refresh fix)', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('grafo-marking'), {
      target: { value: 'SIGILOSO' },
    });
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalledTimes(2));
    expect(LineageGraph.get).toHaveBeenLastCalledWith(
      expect.objectContaining({ marking: 'SIGILOSO' }),
      expect.anything(),
    );
  });

  it('passes an AbortSignal so stale requests are cancelled', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    const secondArg = LineageGraph.get.mock.calls[0][1];
    expect(secondArg).toBeInstanceOf(AbortSignal);
  });

  it('remounts the canvas with a key derived from the filters', async () => {
    const { container } = render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    await screen.findByTestId('lineage-flow-canvas');
    // muda o eixo de cor → propaga ao canvas (data-color-axis). Parte de
    // 'permissions' (default da direção B) e troca p/ 'usage' p/ ver a mudança.
    fireEvent.click(screen.getByTestId('grafo-legend-axis-usage'));
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="lineage-flow-canvas"]'),
      ).toHaveAttribute('data-color-axis', 'usage'),
    );
  });

  /* ── Direção B — apoio à decisão (2026-06-28) ───────────────────────── */

  it('cor padrão = restrição (permissions), não general', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    expect(await screen.findByTestId('lineage-flow-canvas')).toHaveAttribute(
      'data-color-axis',
      'permissions',
    );
  });

  it('por padrão o canvas mostra só os conectados; soltos ficam numa lista colapsada', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    await screen.findByTestId('lineage-flow-canvas');
    // asset:1 e action:abc são conectados (há aresta) → entram no canvas.
    expect(screen.getByTestId('flow-node-asset:1')).toBeInTheDocument();
    expect(screen.getByTestId('flow-node-action:abc')).toBeInTheDocument();
    // o modelo (degree-0) NÃO entra no canvas por padrão (ruído removido).
    expect(
      screen.queryByTestId('flow-node-model:groq/llama-4-scout'),
    ).not.toBeInTheDocument();
    // mas aparece na lista colapsada de "sem conexão" (1 recurso).
    const disc = screen.getByTestId('grafo-disconnected');
    expect(disc).toHaveTextContent('1');
    expect(screen.queryByTestId('grafo-disconnected-body')).not.toBeInTheDocument();
    // expandir revela o recurso solto, clicável p/ detalhar.
    fireEvent.click(screen.getByTestId('grafo-disconnected-toggle'));
    expect(
      screen.getByTestId('grafo-disc-node-model:groq/llama-4-scout'),
    ).toBeInTheDocument();
  });

  it('o toggle "Mostrar no diagrama" reinclui os soltos no canvas (sem perda)', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    await screen.findByTestId('lineage-flow-canvas');
    expect(
      screen.queryByTestId('flow-node-model:groq/llama-4-scout'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('grafo-disconnected-show'));
    await waitFor(() =>
      expect(
        screen.getByTestId('flow-node-model:groq/llama-4-scout'),
      ).toBeInTheDocument(),
    );
  });

  it('detalhe humano: nome, restrição, alimentado-por/afeta; id/JSON sob "detalhes técnicos"', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('grafo-node-asset:1'));
    const detail = screen.getByTestId('grafo-detail');
    // linguagem de operação.
    expect(detail).toHaveTextContent('logs.bo'); // nome (meta.label)
    expect(within(detail).getByTestId('grafo-detail-restriction')).toHaveTextContent(
      'Sem restrição',
    );
    expect(detail).toHaveTextContent('Alimentado por');
    expect(detail).toHaveTextContent('Afeta');
    expect(within(detail).getByTestId('grafo-detail-freshness')).toBeInTheDocument();
    // o id cru e o JSON ficam escondidos até abrir "Detalhes técnicos".
    expect(within(detail).queryByText('asset:1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('grafo-detail-technical')).not.toBeInTheDocument();
    fireEvent.click(within(detail).getByTestId('grafo-detail-tech-toggle'));
    const tech = screen.getByTestId('grafo-detail-technical');
    expect(tech).toHaveTextContent('asset:1'); // id cru revelado
    expect(tech).toHaveTextContent('DataAsset'); // tipo técnico revelado
  });

  // FIX #11 (badges grafo) — marcação NUNCA quebra o layout: o badge de
  // restrição cabe em max-width e o texto trunca (com title p/ o valor cheio).
  it('o badge de restrição trunca marcações longas (max-width + truncate)', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('grafo-node-action:abc'));
    const restriction = screen.getByTestId('grafo-detail-restriction');
    const label = within(restriction).getByText('SIGILOSO');
    expect(label.className).toContain('truncate');
    const badge = label.parentElement as HTMLElement;
    expect(badge.className).toContain('max-w-[140px]');
    // #11 — o title agora é HUMANO (valor + explicação), não só o valor cru.
    expect(badge.getAttribute('title')).toContain('SIGILOSO');
    expect(badge.getAttribute('title')).toMatch(/marca/i);
  });

  /* ── #11 — clareza/a11y do Mapa (caption, fold, frescor) ─────────────── */

  it('#11 — caption liga a legenda ao canvas (Cor = eixo ativo)', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    const caption = await screen.findByTestId('grafo-color-caption');
    expect(caption).toHaveTextContent('Cor =');
    expect(caption).toHaveTextContent('Restrição'); // eixo padrão (permissions)
    // o container do canvas referencia o caption p/ leitores de tela.
    expect(
      document.querySelector('[aria-describedby="grafo-color-caption"]'),
    ).toBeInTheDocument();
  });

  it('#11 — toggle de fold tem aria-label (ocultar/mostrar tipo)', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    const fold = await screen.findByTestId('grafo-fold-DataAsset');
    // tipo visível → a ação é "Ocultar tipo Dados".
    expect(fold.getAttribute('aria-label')).toMatch(/ocultar/i);
    expect(fold.getAttribute('aria-label')).toMatch(/dados/i);
  });

  it('#11 — selo de frescor tem tooltip explicando que mede revisões', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('grafo-node-asset:1'));
    const freshness = screen.getByTestId('grafo-detail-freshness');
    expect(freshness.getAttribute('title')).toMatch(/revis/i);
  });

  it('#2 — não há aba "Coluna" separada; as abas são Mapa | Eventos', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    expect(screen.getByTestId('grafo-tab-mapa')).toBeInTheDocument();
    expect(screen.getByTestId('grafo-tab-eventos')).toBeInTheDocument();
    expect(screen.queryByTestId('grafo-tab-coluna')).not.toBeInTheDocument();
  });

  it('O3b — deep-link ?asset foca o grafo (LineageGraph.get recebe asset_id) e seleciona o nó', async () => {
    mockSearchParams = new URLSearchParams('asset=1');
    render(<GrafoPage />);
    await waitFor(() =>
      expect(LineageGraph.get).toHaveBeenCalledWith(
        expect.objectContaining({ asset_id: '1' }),
        expect.anything(),
      ),
    );
    // foco → o nó asset:1 (logs.bo) vira o selecionado (detalhe abre sem clique).
    expect(await screen.findByTestId('grafo-detail')).toHaveTextContent('logs.bo');
  });

  it('O3b — botão "ver linhagem" no detalhe foca o asset selecionado (?asset)', async () => {
    render(<GrafoPage />);
    await waitFor(() => expect(LineageGraph.get).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('grafo-node-asset:1'));
    fireEvent.click(screen.getByTestId('grafo-focus-lineage'));
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('asset=1'));
  });

  it('switches to the Eventos tab and loads the lineage log', async () => {
    render(<GrafoPage />);
    fireEvent.click(screen.getByTestId('grafo-tab-eventos'));
    await waitFor(() => expect(Lineage.listEvents).toHaveBeenCalled());
    expect(await screen.findByTestId('lineage-list')).toBeInTheDocument();
    expect(screen.getByText('markings.apply')).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('aba=eventos'),
    );
  });

  it('opens directly on the Eventos tab via ?aba=eventos deep-link', async () => {
    mockSearchParams = new URLSearchParams('aba=eventos');
    render(<GrafoPage />);
    await waitFor(() => expect(Lineage.listEvents).toHaveBeenCalled());
    expect(screen.getByTestId('grafo-tab-eventos')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('?aba=coluna abre Eventos com a proveniência de coluna e traça até a origem', async () => {
    mockSearchParams = new URLSearchParams('aba=coluna');
    Lineage.assets.mockResolvedValue([
      { id: 'a-out', name: 'moradores.norm.derived', asset_type: 'derived', version: 2, schema_snapshot: { columns: ['nome', 'cpf'] } },
    ]);
    Lineage.columnTrace.mockResolvedValue({
      asset_id: 'a-out', asset_name: 'moradores.norm.derived', column: 'nome',
      produced_by_pipeline: 'p1', source: false,
      upstream: [
        { asset_id: 'a-src', asset_name: 'moradores_raw', column: 'nome_completo', produced_by_pipeline: null, source: true, upstream: [] },
      ],
    });
    render(<GrafoPage />);
    // #2 — o deep-link legado da aba "Coluna" agora abre a aba Eventos.
    expect(screen.getByTestId('grafo-tab-eventos')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('grafo-tab-coluna')).not.toBeInTheDocument();
    // a seção de proveniência de coluna abre expandida (só os derivados são oferecidos).
    await waitFor(() => expect(Lineage.assets).toHaveBeenCalledWith('derived'));
    const assetSel = await screen.findByTestId('grafo-coluna-asset');
    fireEvent.change(assetSel, { target: { value: 'a-out' } });
    // coluna vem do schema_snapshot.columns do asset (dropdown, não texto livre)
    fireEvent.change(screen.getByTestId('grafo-coluna-column'), { target: { value: 'nome' } });
    fireEvent.click(screen.getByTestId('grafo-coluna-trace'));
    await waitFor(() => expect(Lineage.columnTrace).toHaveBeenCalledWith('a-out', 'nome'));
    const result = await screen.findByTestId('grafo-coluna-result');
    expect(result).toHaveTextContent(/moradores\.norm\.derived/);
    expect(result).toHaveTextContent(/nome_completo/);   // coluna de origem
    expect(result).toHaveTextContent(/moradores_raw/);   // dataset de origem
  });
});
