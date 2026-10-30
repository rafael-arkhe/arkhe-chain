/**
 * Wave D.4 — Sankey Flow widget tests (2026-05-23).
 */
import { render, screen } from '@testing-library/react';

import { SankeyFlow } from '@/components/workshop/widgets/sankey-flow';

type RP = Parameters<typeof SankeyFlow>[0];

function renderSK(
  config: Record<string, unknown>,
  variables: Record<string, unknown> = {},
) {
  const props = {
    config,
    variables,
    bindings: {},
    appId: 'test-app',
    setBinding: jest.fn(),
    emit: jest.fn(),
  } as unknown as RP;
  return render(<SankeyFlow {...props} />);
}

describe('sankey_flow widget — Wave D.4', () => {
  it('mostra estado vazio sem fluxos', () => {
    renderSK({});
    expect(screen.getByTestId('sankey-flow-widget')).toBeInTheDocument();
    expect(screen.getByTestId('sankey-flow-empty')).toBeInTheDocument();
  });

  it('renderiza SVG com nodes e edges quando fluxos existem', () => {
    renderSK(
      { source: 'f', title: 'Fluxo' },
      {
        f: [
          { from: 'A', to: 'B', value: 5 },
          { from: 'B', to: 'C', value: 5 },
        ],
      },
    );
    expect(screen.getByTestId('sankey-flow-svg')).toBeInTheDocument();
    expect(screen.getByTestId('sankey-flow-nodes')).toBeInTheDocument();
    expect(screen.getByTestId('sankey-flow-edges')).toBeInTheDocument();
    // 3 nós (A,B,C) + 2 edges
    expect(screen.getByTestId('sankey-flow-node-A')).toBeInTheDocument();
    expect(screen.getByTestId('sankey-flow-node-B')).toBeInTheDocument();
    expect(screen.getByTestId('sankey-flow-node-C')).toBeInTheDocument();
  });

  it('ignora fluxos com value inválido', () => {
    renderSK(
      { source: 'f' },
      {
        f: [
          { from: 'X', to: 'Y', value: 10 },
          { from: 'X', to: 'Z', value: 0 }, // inválido
          { from: 'X', to: 'W', value: 'foo' }, // inválido
        ],
      },
    );
    expect(screen.getByTestId('sankey-flow-node-X')).toBeInTheDocument();
    expect(screen.getByTestId('sankey-flow-node-Y')).toBeInTheDocument();
    expect(screen.queryByTestId('sankey-flow-node-Z')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sankey-flow-node-W')).not.toBeInTheDocument();
  });

  it('exibe contagem de nodes e edges no header', () => {
    renderSK(
      { source: 'f', title: 'X' },
      {
        f: [
          { from: 'A', to: 'B', value: 3 },
          { from: 'A', to: 'C', value: 4 },
        ],
      },
    );
    const meta = screen.getByTestId('sankey-flow-meta');
    expect(meta.textContent).toContain('3 nós');
    expect(meta.textContent).toContain('2 fluxos');
  });

  it('renderiza paths SVG por fluxo', () => {
    renderSK(
      { source: 'f' },
      {
        f: [
          { from: 'A', to: 'B', value: 1 },
          { from: 'B', to: 'C', value: 1 },
        ],
      },
    );
    expect(screen.getByTestId('sankey-flow-edge-0')).toBeInTheDocument();
    expect(screen.getByTestId('sankey-flow-edge-1')).toBeInTheDocument();
  });

  it('mostra título quando configurado', () => {
    renderSK(
      { source: 'f', title: 'Casos por bairro' },
      { f: [{ from: 'A', to: 'B', value: 1 }] },
    );
    expect(screen.getByText('Casos por bairro')).toBeInTheDocument();
  });
});
