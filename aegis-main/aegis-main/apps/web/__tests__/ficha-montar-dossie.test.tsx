/**
 * P5 Onda 2 — botão "Montar dossiê do objeto" na toolbar da /ficha (multidomínio).
 *
 * Cobertura:
 *  1. Gate de UI: nó não-canônico OU sem perm correlation.run → não renderiza.
 *  2. Canônico + perm → menu com dossiê do objeto + composto.
 *  3. Genérico: coleta finalidade (promptModal, NUNCA nativo) → runGeneric →
 *     modal com seções; objeto SEM PII mostra o aviso honesto.
 *  4. Composto: runComposite com anchor → modal com roster.
 */
import * as React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/i18n/kind-labels', () => ({ objectKindLabel: (_t: unknown, k: string) => k }));
jest.mock('@/lib/buscar/humanise', () => ({ humaniseSearchError: (e: unknown) => String(e) }));
jest.mock('@/lib/ficha/type-actions', () => ({ gotoFichaTab: jest.fn() }));

const mockUseCan = jest.fn();
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => mockUseCan() }));

const mockPromptModal = jest.fn();
jest.mock('@/components/dialog/confirm-dialog', () => ({ promptModal: () => mockPromptModal() }));

const mockRunGeneric = jest.fn();
const mockRunComposite = jest.fn();
jest.mock('@/lib/api/ontology-dossier', () => ({
  OntologyDossier: {
    runGenericToCompletion: (...a: unknown[]) => mockRunGeneric(...a),
    runCompositeToCompletion: (...a: unknown[]) => mockRunComposite(...a),
  },
}));

import { MontarDossieButton } from '@/components/ficha/montar-dossie-button';

beforeEach(() => {
  mockUseCan.mockReset().mockReturnValue(true);
  mockPromptModal.mockReset().mockResolvedValue('apuração');
  mockRunGeneric.mockReset();
  mockRunComposite.mockReset();
});

describe('MontarDossieButton — dossiê multidomínio na /ficha', () => {
  it('não renderiza para nó NÃO-canônico (Entity usa o dossiê OSINT-BR)', () => {
    const { container } = render(
      <MontarDossieButton nodeId="n1" nodeName="Caminhonete" canonical={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('não renderiza sem a perm correlation.run', () => {
    mockUseCan.mockReturnValue(false);
    const { container } = render(
      <MontarDossieButton nodeId="n1" nodeName="Caminhonete" canonical />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('canônico + perm → menu com dossiê do objeto e composto', () => {
    render(<MontarDossieButton nodeId="n1" nodeName="ACME" canonical />);
    fireEvent.click(screen.getByTestId('ficha-dossie-trigger'));
    expect(screen.getByTestId('ficha-dossie-generico')).toBeInTheDocument();
    expect(screen.getByTestId('ficha-dossie-composto')).toBeInTheDocument();
  });

  it('genérico SEM PII → coleta finalidade, roda e mostra aviso honesto', async () => {
    mockRunGeneric.mockResolvedValue({
      task_id: 't1',
      origin: 'generic_dossier',
      status: 'done',
      progress_steps: [],
      result: {
        node: {},
        identificadores: [],
        sub_dossiers: [],
        graph: { nodes: [{ id: 'n1' }], edges: [] },
        sections: {
          identificacao: { node_type: 'Veiculo', name: 'Van', properties: { placa: 'ABC1234' }, identificadores: [] },
          vinculos: { vizinhos: [] },
          midia: [],
        },
        pii_touched: false,
        sources_used: [],
        sources_failed: [],
      },
    });
    render(<MontarDossieButton nodeId="n1" nodeName="Van" canonical />);
    fireEvent.click(screen.getByTestId('ficha-dossie-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('ficha-dossie-generico'));
    });
    expect(mockPromptModal).toHaveBeenCalled();
    await waitFor(() =>
      expect(mockRunGeneric).toHaveBeenCalledWith(
        'n1',
        { purpose: 'apuração' },
        expect.anything(),
      ),
    );
    expect(await screen.findByTestId('ficha-dossie-modal')).toBeInTheDocument();
    expect(screen.getByText('ficha.dossie.semPii')).toBeInTheDocument();
  });

  it('composto → roda runComposite com anchor e lista o roster', async () => {
    mockRunComposite.mockResolvedValue({
      task_id: 't2',
      origin: 'composite_dossier',
      status: 'done',
      progress_steps: [],
      result: {
        anchor: { node_id: 'op1', node_type: 'Operacao', name: 'Aurora' },
        roster: [{ node_id: 'm1', node_type: 'Empresa', name: 'ACME', relation: 'ENVOLVE' }],
        roster_count: 1,
        members: [],
        correlation: null,
        scene: [],
        timeline: [],
        pii_touched: true,
      },
    });
    render(<MontarDossieButton nodeId="op1" nodeName="Aurora" canonical />);
    fireEvent.click(screen.getByTestId('ficha-dossie-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('ficha-dossie-composto'));
    });
    await waitFor(() =>
      expect(mockRunComposite).toHaveBeenCalledWith(
        { anchor_node_id: 'op1', purpose: 'apuração' },
        expect.anything(),
      ),
    );
    expect(await screen.findByTestId('ficha-dossie-roster-item')).toHaveTextContent('ACME');
  });
});
