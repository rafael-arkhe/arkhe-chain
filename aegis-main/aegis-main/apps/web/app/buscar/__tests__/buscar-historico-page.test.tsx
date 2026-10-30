/**
 * buscar-historico-page.test.tsx — /buscar × histórico RICO (BACKLOG #7b ELO 2).
 *
 * Prova os DOIS gestos que vivem na página (jsdom), com o STORE REAL e o
 * SearchHistory SDK mockado:
 *   1. SUBMIT grava no BACKEND · submeter a busca chama SearchHistory.save com a
 *      consulta + as fontes SELECIONADAS + a Busca avançada (nunca localStorage).
 *   2. RE-RODAR restaura + executa · o callback do Histórico restaura consulta +
 *      fontes + avançado NO STORE e DISPARA a busca (a fila cresce) — não é só
 *      setQuery; e re-rodar também grava (é um submit).
 *
 * Os componentes apresentacionais do /buscar são stubados (o foco é a lógica da
 * página); os workers são mockados pra a fila não tocar a rede.
 */
import * as React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import type { SearchHistoryEntry } from '@/lib/api/search-history';

// ── Roteamento ────────────────────────────────────────────────────────────────
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/buscar',
  useSearchParams: () => new URLSearchParams(),
}));

// ── Chrome / auth (passthrough) ────────────────────────────────────────────────
jest.mock('@/components/shell/page-shell', () => ({
  PageShell: ({ toolbar, children }: { toolbar?: React.ReactNode; children?: React.ReactNode }) => (
    <div>
      <div data-testid="toolbar">{toolbar}</div>
      {children}
    </div>
  ),
}));
jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: () => true,
  useAuth: () => ({ principal: { roles: ['admin'], permissions: [] }, loading: false }),
}));

// ── Apresentacionais stubados ──────────────────────────────────────────────────
// BuscarInput → botão que dispara onSubmit (= o gesto "buscar").
jest.mock('@/components/buscar/buscar-input', () => ({
  BuscarInput: ({ onSubmit }: { onSubmit: () => void }) => (
    <button type="button" data-testid="stub-submit" onClick={onSubmit}>
      submit
    </button>
  ),
}));
// Historico → botão que dispara onRerun com a entrada fixa (= o gesto "re-rodar").
jest.mock('@/components/buscar/historico', () => ({
  Historico: ({ onRerun }: { onRerun: (e: SearchHistoryEntry) => void }) => (
    <button type="button" data-testid="stub-rerun" onClick={() => onRerun(RERUN_ENTRY)}>
      rerun
    </button>
  ),
}));
jest.mock('@/components/buscar/painel-filtros', () => ({ PainelFiltros: () => null }));
jest.mock('@/components/buscar/detalhe-resolver', () => ({ DetalheResolver: () => null }));
jest.mock('@/components/buscar/fila', () => ({ Fila: () => null }));
jest.mock('@/components/buscar/resultados', () => ({ Resultados: () => null }));
jest.mock('@/components/buscar/dossie-preflight-modal', () => ({ DossiePreflightModal: () => null }));

// ── Hooks de configuração (catálogo de fontes / finalidades) ────────────────────
const TEST_CATALOG = [
  { key: 'entities', label: 'Entidades locais', category: 'local', alwaysOn: true, mcpTool: null },
  { key: 'maigret_username@v1', label: 'Maigret', category: 'username', mcpTool: 'maigret_username@v1' },
];
jest.mock('@/lib/buscar/use-enabled-sources', () => ({
  useEnabledSources: () => ({
    overrides: { hidden: [], pinned: [], enabled: null },
    catalog: TEST_CATALOG,
  }),
}));
jest.mock('@/lib/buscar/use-dossier-purposes', () => ({ useDossierPurposes: () => [] }));

// ── Mcp (lista de conectores) — store + página importam de '@/lib/api/mcp'. ─────
const mockMcpList = jest.fn();
jest.mock('@/lib/api/mcp', () => ({
  Mcp: {
    list: (...a: unknown[]) => mockMcpList(...a),
    fanoutStreamUrl: () => '/api/search/fanout/stream',
  },
}));

// ── Histórico (backend) — o alvo da prova. ──────────────────────────────────────
const mockSave = jest.fn();
jest.mock('@/lib/api/search-history', () => ({
  SearchHistory: { save: (...a: unknown[]) => mockSave(...a) },
}));

// ── Workers — a fila NÃO toca a rede. ───────────────────────────────────────────
jest.mock('@/lib/buscar/workers', () => ({
  runWorker: jest.fn(() => Promise.resolve([])),
  FonteRequerUrlError: class FonteRequerUrlError extends Error {},
  FonteNaoAceitaError: class FonteNaoAceitaError extends Error {},
  FonteTimeoutError: class FonteTimeoutError extends Error {},
}));

import BuscarPage from '@/app/buscar/page';
import { useBuscarStore } from '@/lib/buscar/store';

const RERUN_ENTRY: SearchHistoryEntry = {
  id: 'h1',
  query: 'beltrano restaurado',
  sources: ['maigret_username@v1'],
  advanced: { fields: { cpf: '12345678909' }, purpose: 'monitoramento', caseId: 'C-9' },
  result_summary: null,
  created_at: '2026-06-20T10:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMcpList.mockResolvedValue([{ tool: 'maigret_username@v1', accepts: ['username'] }]);
  mockSave.mockResolvedValue({ ...RERUN_ENTRY, id: 'saved' });
  try {
    localStorage.clear();
  } catch {
    /* noop */
  }
  // Estado-base limpo do store (sem fila, conectores ainda carregando).
  useBuscarStore.setState({
    query: '',
    selectedSourceKeys: ['camara_deputados@v1', 'senado_senadores@v1'],
    advanced: { fields: {}, purpose: '', caseId: '' },
    fila: [],
    selecionado: null,
    adapters: [],
    adaptersLoading: true,
    adaptersError: null,
    error: null,
  });
});

async function renderReady() {
  render(<BuscarPage />);
  // espera o bootstrap de conectores concluir (senão o submit é bloqueado).
  await waitFor(() => expect(useBuscarStore.getState().adaptersLoading).toBe(false));
}

describe('SUBMIT — grava a entrada no backend (nunca localStorage)', () => {
  it('chama SearchHistory.save com consulta + fontes selecionadas + avançado', async () => {
    useBuscarStore.setState({
      query: 'fulano de tal',
      selectedSourceKeys: ['maigret_username@v1'],
      advanced: { fields: { uf: 'SP' }, purpose: 'investigacao', caseId: 'C-1' },
    });
    await renderReady();

    fireEvent.click(document.querySelector('[data-testid="stub-submit"]')!);

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      query: 'fulano de tal',
      sources: ['maigret_username@v1'],
      advanced: { fields: { uf: 'SP' }, purpose: 'investigacao', caseId: 'C-1' },
    });
    // a busca também roda (fila cresce com entities[alwaysOn] + maigret).
    expect(useBuscarStore.getState().fila.length).toBeGreaterThan(0);
  });
});

describe('RE-RODAR — restaura o contexto E executa', () => {
  it('restaura consulta + fontes + avançado no store e dispara a busca', async () => {
    useBuscarStore.setState({
      query: 'algo diferente',
      selectedSourceKeys: ['entities'],
      advanced: { fields: {}, purpose: '', caseId: '' },
    });
    await renderReady();

    fireEvent.click(document.querySelector('[data-testid="stub-rerun"]')!);

    const st = useBuscarStore.getState();
    // contexto COMPLETO restaurado (não só a query).
    expect(st.query).toBe('beltrano restaurado');
    expect(st.selectedSourceKeys).toEqual(['maigret_username@v1']);
    expect(st.advanced).toEqual({
      fields: { cpf: '12345678909' },
      purpose: 'monitoramento',
      caseId: 'C-9',
    });
    // a busca foi DISPARADA (fila cresceu).
    expect(st.fila.length).toBeGreaterThan(0);
    // re-rodar é um submit → grava no histórico com a seleção restaurada.
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[mockSave.mock.calls.length - 1][0]).toMatchObject({
      query: 'beltrano restaurado',
      sources: ['maigret_username@v1'],
    });
  });
});
