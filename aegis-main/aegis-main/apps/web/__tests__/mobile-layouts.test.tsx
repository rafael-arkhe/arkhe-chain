/**
 * Sprint L15.A — Mobile layouts (viewport < 640px).
 *
 * Verifica que /painel-de-controle/{acoes,solutions,pilots} reagem ao
 * `useIsMobile()` mudando a estrutura:
 *  - acoes: linhas viram cards verticais com accordion de ações.
 *  - solutions: 2-col vira flex-col single-stack.
 *  - pilots: builder/history empilham (flex-col em vez de grid 2-col).
 *
 * O hook usa window.innerWidth + ResizeObserver style; em jsdom basta
 * mutar `window.innerWidth` + disparar `resize`.
 */
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

import AcoesPage from '@/app/painel-de-controle/acoes/page';
// W8 (2026-06-28): /solutions virou redirect; o corpo é SolutionsApp (app_route).
import { SolutionsApp as SolutionsPage } from '@/components/solution-designer/SolutionsApp';
import PilotsPage from '@/app/painel-de-controle/pilots/page';

jest.mock('@/lib/api', () => ({
  ActionTypes: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn(),
    executions: jest.fn(),
    plan: jest.fn(),
  },
  Projects: {
    list: jest.fn().mockResolvedValue([]),
  },
  // W8 — SolutionsApp resolve a Page (status/perm/params) via Pages.get; o
  // fallback local (seed) cobre quando resolve undefined (offline/sem registro).
  Pages: { get: jest.fn().mockResolvedValue(undefined) },
  // #1 — ConnectDataSection (nós de Coleta) lista fontes/conectores/datasets.
  Sources: { list: jest.fn().mockResolvedValue([]) },
  Connectors: { list: jest.fn().mockResolvedValue([]) },
  Datasets: { list: jest.fn().mockResolvedValue([]) },
  Ingest: { event: jest.fn() },
  Solutions: {
    design: jest.fn(),
    materialize: jest.fn(),
    listPatterns: jest.fn().mockResolvedValue([]),
    listDiagrams: jest.fn().mockResolvedValue([]),
    designGraph: jest.fn(),
    createDiagram: jest.fn(),
    saveDiagram: jest.fn(),
    implementations: jest.fn(),
    expandNode: jest.fn(),
    ontologyModel: jest.fn(),
    buildWalkthrough: jest.fn(),
  },
  Pilots: {
    start: jest.fn(),
    get: jest.fn(),
    listMine: jest.fn().mockResolvedValue([]),
    resume: jest.fn(),
    templates: jest.fn().mockResolvedValue([]),
  },
  ControlPanel: {
    approvals: {
      list: jest.fn().mockResolvedValue([]),
    },
  },
  // Acoes/page.tsx consome Ontology.listNodeTypes + OntologyNodes.search
  // (desde a Onda 9) — sem estes mocks o render quebra com "undefined".
  Ontology: {
    listNodeTypes: jest.fn().mockResolvedValue([]),
  },
  OntologyNodes: {
    search: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
jest.mock('@/lib/iam/api', () => ({
  usersApi: { list: jest.fn().mockResolvedValue([]) },
}));
jest.mock('reactflow', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: (props: any) =>
      React.createElement('div', { 'data-testid': 'rf-mock' }, props.children),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
  };
});
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: { username: 'admin', roles: ['admin'] },
    loading: false,
  }),
  useCan: () => true,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

const { ActionTypes } = jest.requireMock('@/lib/api') as {
  ActionTypes: Record<string, jest.Mock>;
};

function setViewport(width: number, height = 800) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

const fakeAction = {
  id: 'a-1',
  tenant_id: 'tenant-1',
  name: 'rede.fechar_caso',
  description: 'Fecha um caso e arquiva nós relacionados.',
  input_schema: { type: 'object' },
  output_schema: {},
  code_ref: 'app.actions.fechar_caso',
  requires_markings: [],
  requires_clearances: [],
  timeout_seconds: 60,
  auto_approvable: true,
  version: 1,
  created_at: '2026-05-23T10:00:00Z',
};

describe('Mobile layouts — Sprint L15.A', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ActionTypes.list.mockResolvedValue([fakeAction]);
    ActionTypes.executions.mockResolvedValue([]);
  });

  describe('Acoes', () => {
    it('renders desktop layout at 1280px (data-mobile=false)', async () => {
      setViewport(1280);
      render(<AcoesPage />);
      await waitFor(() =>
        expect(screen.getByTestId('acoes-list')).toHaveAttribute(
          'data-mobile',
          'false',
        ),
      );
      // Desktop: ações ficam sempre visíveis (sem toggle).
      expect(
        screen.queryByTestId(`acoes-toggle-actions-${fakeAction.id}`),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId(`acoes-actions-${fakeAction.id}`),
      ).toBeInTheDocument();
    });

    it('switches to mobile layout at 375px (data-mobile=true)', async () => {
      setViewport(375);
      render(<AcoesPage />);
      await waitFor(() =>
        expect(screen.getByTestId('acoes-list')).toHaveAttribute(
          'data-mobile',
          'true',
        ),
      );
      // Mobile: ações ficam colapsadas atrás de um toggle button.
      expect(
        screen.getByTestId(`acoes-toggle-actions-${fakeAction.id}`),
      ).toBeInTheDocument();
      // Actions sub-bloco está inicialmente oculto (NÃO renderizado).
      expect(
        screen.queryByTestId(`acoes-actions-${fakeAction.id}`),
      ).not.toBeInTheDocument();
    });

    it('expands actions when toggle is clicked on mobile', async () => {
      setViewport(375);
      render(<AcoesPage />);
      await waitFor(() =>
        expect(screen.getByTestId(`acoes-toggle-actions-${fakeAction.id}`)).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId(`acoes-toggle-actions-${fakeAction.id}`));
      expect(
        screen.getByTestId(`acoes-actions-${fakeAction.id}`),
      ).toBeInTheDocument();
    });
  });

  describe('Solutions (Desenho da Operação canvas)', () => {
    // M4 #9: the checklist was replaced by a full-height 3-pane diagram
    // canvas (Node Toolbar · canvas · inspector). It is a diagram editor,
    // not a stacked form — the shell renders consistently across viewports.
    it('renders the 3-pane diagram shell at 375px', () => {
      setViewport(375);
      render(<SolutionsPage />);
      expect(screen.getByTestId('solutions-3pane')).toBeInTheDocument();
      // #4 (feedback do operador) — a paleta nasce ESCONDIDA; o botão da
      // toolbar mostra/esconde (mesmo comportamento em qualquer viewport).
      expect(screen.queryByTestId('solutions-left-pane')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('solutions-toggle-left'));
      expect(screen.getByTestId('solutions-left-pane')).toBeInTheDocument();
    });

    it('renders the 3-pane diagram shell at 1280px', () => {
      setViewport(1280);
      render(<SolutionsPage />);
      expect(screen.getByTestId('solutions-3pane')).toBeInTheDocument();
      // A coluna central (paleta · CANVAS · [inspetor]) está sempre presente.
      // O inspetor (solutions-inspector) é gated por seleção de nó — fechado por
      // padrão (solutions/page.tsx: `{selectedNode && <NodeInspector/>}`), padrão
      // Palantir 3-pane; sem diagrama carregado não há nó p/ selecionar, então
      // verificamos o shell pela coluna central, não pelo inspetor condicional.
      expect(screen.getByTestId('solutions-center')).toBeInTheDocument();
    });
  });

  describe('Pilots', () => {
    it('stacks the Plano composer + history at 375px (default view)', () => {
      setViewport(375);
      render(<PilotsPage />);
      // Roteiros abre na visão padrão Plano (linha do tempo visual).
      const grid = screen.getByTestId('pilots-plan-grid');
      expect(grid).toHaveAttribute('data-mobile', 'true');
      expect(grid.className).toMatch(/flex-col/);
    });

    it('uses a 2-col Plano grid at 1280px (default view)', () => {
      setViewport(1280);
      render(<PilotsPage />);
      const grid = screen.getByTestId('pilots-plan-grid');
      expect(grid).toHaveAttribute('data-mobile', 'false');
      expect(grid.className).toMatch(/grid-cols-\[minmax/);
    });

    it('stacks the Avançado builder + history at 375px', () => {
      setViewport(375);
      render(<PilotsPage />);
      fireEvent.click(screen.getByTestId('pilots-mode-advanced'));
      const grid = screen.getByTestId('pilots-grid');
      expect(grid).toHaveAttribute('data-mobile', 'true');
      expect(grid.className).toMatch(/flex-col/);
    });

    it('uses a 2-col Avançado grid at 1280px', () => {
      setViewport(1280);
      render(<PilotsPage />);
      fireEvent.click(screen.getByTestId('pilots-mode-advanced'));
      const grid = screen.getByTestId('pilots-grid');
      expect(grid).toHaveAttribute('data-mobile', 'false');
      expect(grid.className).toMatch(/grid-cols-\[minmax/);
    });
  });
});
