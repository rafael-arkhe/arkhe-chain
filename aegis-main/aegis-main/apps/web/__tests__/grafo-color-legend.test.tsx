/**
 * M5-10 — <ColorLegend> progressivo (General/Permissions/Usage).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorLegend } from '@/components/grafo/color-legend';

describe('ColorLegend — M5-10', () => {
  it('renders the four color groups as selectable tabs (incl. Organization)', () => {
    render(<ColorLegend axis="general" onAxisChange={jest.fn()} />);
    expect(screen.getByTestId('grafo-legend-axis-general')).toBeInTheDocument();
    expect(screen.getByTestId('grafo-legend-axis-permissions')).toBeInTheDocument();
    expect(screen.getByTestId('grafo-legend-axis-usage')).toBeInTheDocument();
    // M5-polish — quarto grupo do Workflow Lineage do Foundry.
    expect(screen.getByTestId('grafo-legend-axis-organization')).toBeInTheDocument();
  });

  it('shows the Organization swatch list (color by Operação/Espaço)', () => {
    render(<ColorLegend axis="organization" onAxisChange={jest.fn()} />);
    expect(screen.getByTestId('grafo-legend-list-organization')).toBeInTheDocument();
  });

  it('selects the Organization axis on click', () => {
    const onAxisChange = jest.fn();
    render(<ColorLegend axis="general" onAxisChange={onAxisChange} />);
    fireEvent.click(screen.getByTestId('grafo-legend-axis-organization'));
    expect(onAxisChange).toHaveBeenCalledWith('organization');
  });

  it('marks the active axis with aria-selected', () => {
    render(<ColorLegend axis="permissions" onAxisChange={jest.fn()} />);
    expect(screen.getByTestId('grafo-legend-axis-permissions')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('grafo-legend-axis-general')).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('shows the swatch list for the active axis', () => {
    render(<ColorLegend axis="usage" onAxisChange={jest.fn()} />);
    expect(screen.getByTestId('grafo-legend-list-usage')).toBeInTheDocument();
  });

  it('calls onAxisChange when a different group is clicked', () => {
    const onAxisChange = jest.fn();
    render(<ColorLegend axis="general" onAxisChange={onAxisChange} />);
    fireEvent.click(screen.getByTestId('grafo-legend-axis-usage'));
    expect(onAxisChange).toHaveBeenCalledWith('usage');
  });

  /* ── #11 — clareza/a11y: tabpanel + descrição do sinal + title nos swatches ── */

  it('exposes the swatch list as a tabpanel labelled by the active tab', () => {
    render(<ColorLegend axis="permissions" onAxisChange={jest.fn()} />);
    const panel = screen.getByTestId('grafo-legend-list-permissions');
    expect(panel).toHaveAttribute('role', 'tabpanel');
    // aria-labelledby aponta para a ABA ATIVA (id determinístico).
    expect(panel).toHaveAttribute('aria-labelledby', 'grafo-legend-tab-permissions');
    // a aba ativa controla o painel.
    expect(screen.getByTestId('grafo-legend-axis-permissions')).toHaveAttribute(
      'aria-controls',
      'grafo-legend-panel',
    );
    expect(panel).toHaveAttribute('id', 'grafo-legend-panel');
  });

  it('describes the decision signal of each tab (title + aria-describedby)', () => {
    render(<ColorLegend axis="general" onAxisChange={jest.fn()} />);
    const tab = screen.getByTestId('grafo-legend-axis-usage');
    expect(tab).toHaveAttribute('aria-describedby', 'grafo-legend-desc-usage');
    expect(tab).toHaveAttribute('title');
    expect(tab.getAttribute('title')).toMatch(/frescor/i);
    // a descrição referenciada existe no DOM.
    expect(document.getElementById('grafo-legend-desc-usage')).toBeInTheDocument();
  });

  it('gives every swatch a short title explaining the signal', () => {
    render(<ColorLegend axis="permissions" onAxisChange={jest.fn()} />);
    const items = screen
      .getByTestId('grafo-legend-list-permissions')
      .querySelectorAll('li');
    expect(items.length).toBeGreaterThan(0);
    items.forEach((li) => {
      expect(li).toHaveAttribute('title');
      expect((li.getAttribute('title') ?? '').length).toBeGreaterThan(0);
    });
    // o "porquê" do restrito está no title (não só a cor).
    const marked = Array.from(items).find((li) =>
      /restrito/i.test(li.getAttribute('title') ?? ''),
    );
    expect(marked).toBeTruthy();
  });
});
