/**
 * #5 — HistoryPanel: read-only audit of AIP Architect activity in /solutions.
 *
 * Cobre:
 *   - fetch dos dois event types (solution.design + solution.materialize) via
 *     o client Lineage.listEvents existente;
 *   - render do que foi gerado: quando, quem (actor), briefing, modelo (codinome
 *     AIP — nunca o id cru) e contagens;
 *   - empty-state e botão fechar.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import { HistoryPanel } from '@/components/solution-designer/HistoryPanel';

jest.mock('@/lib/api', () => ({
  Lineage: { listEvents: jest.fn() },
}));

const { Lineage } = jest.requireMock('@/lib/api') as {
  Lineage: Record<string, jest.Mock>;
};

const designEvent = {
  id: 'ev-design-1',
  event_type: 'solution.design',
  actor: 'admin',
  status: 'committed',
  timestamp: '2026-05-24T12:00:00Z',
  tenant_id: 't1',
  metadata_: {
    blueprint_id: 'bp-1',
    domain: 'security',
    backend: 'llm',
    model: 'mistralai/mixtral-8x22b-instruct',
    node_count: 4,
    edge_count: 3,
    counts: { ontology_types: 2, logic_functions: 1, action_types: 0, widgets: 3 },
    wizard: { requirements: 'triagem por severidade e sala de situação' },
  },
};

const materializeEvent = {
  id: 'ev-mat-1',
  event_type: 'solution.materialize',
  actor: 'analista',
  status: 'committed',
  timestamp: '2026-05-24T13:30:00Z',
  tenant_id: 't1',
  metadata_: {
    blueprint_id: 'bp-1',
    domain: 'security',
    backend: 'llm',
    counts: { ontology_types: 2, logic_functions: 1, projects: 1, agents: 2 },
    project_id: 'proj-1',
  },
};

describe('HistoryPanel — AIP Architect audit (#5)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches both solution.design and solution.materialize events', async () => {
    Lineage.listEvents.mockResolvedValue([]);
    render(<HistoryPanel onClose={jest.fn()} />);
    await waitFor(() => expect(Lineage.listEvents).toHaveBeenCalledTimes(2));
    const types = Lineage.listEvents.mock.calls.map((c) => c[0].event_type).sort();
    expect(types).toEqual(['solution.design', 'solution.materialize']);
  });

  it('renders generated events: actor, brief, model codename, counts', async () => {
    Lineage.listEvents
      .mockResolvedValueOnce([designEvent])
      .mockResolvedValueOnce([materializeEvent]);
    render(<HistoryPanel onClose={jest.fn()} />);

    // design event row
    const designRow = await screen.findByTestId('history-event-ev-design-1');
    expect(designRow).toHaveAttribute('data-event-type', 'solution.design');
    expect(designRow).toHaveTextContent('admin');
    expect(designRow).toHaveTextContent('triagem por severidade');
    // model shown as AIP codename, never the raw provider/model id
    expect(designRow).toHaveTextContent('AIP-Ipiranga-22B');
    expect(designRow).not.toHaveTextContent(/mixtral/i);
    expect(designRow).not.toHaveTextContent(/openrouter/i);
    // counts of what was generated
    expect(designRow).toHaveTextContent('4'); // node_count
    expect(designRow).toHaveTextContent('2'); // ontology_types

    // materialize event row present too
    const matRow = screen.getByTestId('history-event-ev-mat-1');
    expect(matRow).toHaveAttribute('data-event-type', 'solution.materialize');
    expect(matRow).toHaveTextContent('analista');
  });

  it('sorts newest-first (materialize 13:30 above design 12:00)', async () => {
    Lineage.listEvents
      .mockResolvedValueOnce([designEvent])
      .mockResolvedValueOnce([materializeEvent]);
    render(<HistoryPanel onClose={jest.fn()} />);
    await screen.findByTestId('history-event-ev-design-1');
    const rows = screen.getAllByTestId(/^history-event-/);
    expect(rows[0]).toHaveAttribute('data-event-type', 'solution.materialize');
    expect(rows[1]).toHaveAttribute('data-event-type', 'solution.design');
  });

  it('renders defensively when an event has null/missing metadata (no crash)', async () => {
    const bareEvent = {
      id: 'ev-bare-1',
      event_type: 'solution.design',
      actor: null,
      status: 'committed',
      timestamp: '2026-05-24T10:00:00Z',
      tenant_id: 't1',
      // metadata_ intentionally null — real rows may carry no metadata.
      metadata_: null,
    };
    Lineage.listEvents
      .mockResolvedValueOnce([bareEvent as never])
      .mockResolvedValueOnce([]);
    render(<HistoryPanel onClose={jest.fn()} />);
    // row renders without throwing; no model/brief/counts shown
    const row = await screen.findByTestId('history-event-ev-bare-1');
    expect(row).toBeInTheDocument();
    expect(screen.queryByTestId('history-error')).not.toBeInTheDocument();
    expect(row).not.toHaveTextContent(/AIP-/);
  });

  it('shows an empty state when there is no history', async () => {
    Lineage.listEvents.mockResolvedValue([]);
    render(<HistoryPanel onClose={jest.fn()} />);
    expect(await screen.findByTestId('history-empty')).toBeInTheDocument();
  });

  // #6 (feedback do operador) — a lista é CAPADA: 15 por vez + "Mostrar mais",
  // nunca os ~100 cards de uma vez estourando o design da página.
  it('caps the list at 15 items and reveals more on demand', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `ev-cap-${i}`,
      event_type: 'solution.design',
      actor: 'op',
      status: 'committed',
      timestamp: `2026-06-0${(i % 9) + 1}T0${i % 10}:00:00Z`,
      tenant_id: 't1',
      metadata_: { domain: `dominio-${i}` },
    }));
    Lineage.listEvents
      .mockResolvedValueOnce(many as never)
      .mockResolvedValueOnce([]);
    render(<HistoryPanel onClose={jest.fn()} />);
    await screen.findByTestId('history-show-more');
    expect(document.querySelectorAll('[data-testid^="history-event-"]').length).toBe(15);
    fireEvent.click(screen.getByTestId('history-show-more'));
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid^="history-event-"]').length).toBe(30),
    );
    // contador do restante no botão
    expect(screen.getByTestId('history-show-more')).toHaveTextContent('10');
  });

  it('closes via the header button', async () => {
    Lineage.listEvents.mockResolvedValue([]);
    const onClose = jest.fn();
    render(<HistoryPanel onClose={onClose} />);
    await waitFor(() => expect(Lineage.listEvents).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('history-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // #12 — rastreabilidade: cada entrada mostra o RESULTADO (o que a geração fez)
  // e um botão "Reabrir no Arquiteto" (semeia o chat com o briefing).
  it('shows a labeled "Resultado" section with what the generation produced (#12)', async () => {
    Lineage.listEvents
      .mockResolvedValueOnce([designEvent])
      .mockResolvedValueOnce([]);
    render(<HistoryPanel onClose={jest.fn()} />);
    const results = await screen.findByTestId('history-results-ev-design-1');
    // rotulado como Resultado + contagens do que foi gerado
    expect(results).toHaveTextContent('Resultado');
    expect(results).toHaveTextContent('2'); // ontology_types
    expect(results).toHaveTextContent('3'); // widgets
  });

  it('reopens a design generation by seeding the brief into the chat (#12)', async () => {
    Lineage.listEvents
      .mockResolvedValueOnce([designEvent])
      .mockResolvedValueOnce([materializeEvent]);
    const onReopen = jest.fn();
    render(<HistoryPanel onClose={jest.fn()} onReopen={onReopen} />);
    const btn = await screen.findByTestId('history-reopen-ev-design-1');
    fireEvent.click(btn);
    expect(onReopen).toHaveBeenCalledWith('triagem por severidade e sala de situação');
    // materialize event (sem briefing de design) NÃO oferece reabrir
    expect(screen.queryByTestId('history-reopen-ev-mat-1')).not.toBeInTheDocument();
  });

  it('uses humanized domain as intent when requirements is a stringified JSON plan (#12, gesto real)', async () => {
    // Eventos REAIS gravam wizard.requirements como JSON estruturado stringificado
    // (plano decomposto), não um briefing humano. O card NÃO pode dumpar o blob;
    // deve mostrar o domínio humanizado + ofertar reabrir.
    const realEvent = {
      id: 'ev-real-1',
      event_type: 'solution.design',
      actor: 'admin',
      status: 'committed',
      timestamp: '2026-06-09T11:58:00Z',
      tenant_id: 't1',
      metadata_: {
        domain: 'gestao-de-denuncias',
        node_count: 4,
        counts: { ontology_types: 5, action_types: 21, agents: 3, widgets: 1 },
        wizard: {
          domain: 'gestao-de-denuncias',
          end_product: 'painel',
          requirements: '{"coleta":["Conectores para ingestão"],"processamento":["Pipeline de NLP"]}',
        },
      },
    };
    const onReopen = jest.fn();
    Lineage.listEvents.mockResolvedValueOnce([realEvent as never]).mockResolvedValueOnce([]);
    render(<HistoryPanel onClose={jest.fn()} onReopen={onReopen} />);
    const row = await screen.findByTestId('history-event-ev-real-1');
    // não dumpa o JSON cru
    expect(row).not.toHaveTextContent('"coleta"');
    expect(row).not.toHaveTextContent('Pipeline de NLP');
    // intenção legível (domínio humanizado + produto)
    expect(row).toHaveTextContent('gestao de denuncias (painel)');
    // Resultado com a contagem de agentes (mudança de backend)
    const results = screen.getByTestId('history-results-ev-real-1');
    expect(results).toHaveTextContent('3'); // agents
    // reabrir semeia a intenção humanizada, não o blob
    fireEvent.click(screen.getByTestId('history-reopen-ev-real-1'));
    expect(onReopen).toHaveBeenCalledWith('gestao de denuncias (painel)');
  });

  it('does not render reopen when onReopen is not provided (#12)', async () => {
    Lineage.listEvents
      .mockResolvedValueOnce([designEvent])
      .mockResolvedValueOnce([]);
    render(<HistoryPanel onClose={jest.fn()} />);
    await screen.findByTestId('history-event-ev-design-1');
    expect(screen.queryByTestId('history-reopen-ev-design-1')).not.toBeInTheDocument();
  });
});
