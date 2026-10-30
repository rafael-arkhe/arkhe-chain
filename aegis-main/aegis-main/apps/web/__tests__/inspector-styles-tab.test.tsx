/**
 * Wave G.2 — InspectorStylesTab (Estilos override real).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import {
  InspectorStylesTab,
  overridesToClassName,
  type StyleOverrides,
} from '@/components/workshop/inspector-styles-tab';
import type { LayoutNode } from '@/lib/workshop/types';

function baseNode(props: Record<string, unknown> = {}): LayoutNode {
  return {
    id: 'n1',
    widget: { type: 'counter', props },
  };
}

describe('overridesToClassName — Wave G.2', () => {
  it('retorna string vazia quando overrides undefined', () => {
    expect(overridesToClassName(undefined)).toBe('');
  });

  it('mapeia textStyle pra text-<token>', () => {
    expect(overridesToClassName({ textStyle: 'h2' })).toContain('text-h2');
  });

  it('mapeia spacing pra p-2/3/4', () => {
    expect(overridesToClassName({ spacing: 'sm' })).toContain('p-2');
    expect(overridesToClassName({ spacing: 'md' })).toContain('p-3');
    expect(overridesToClassName({ spacing: 'lg' })).toContain('p-4');
  });

  it('mapeia background semântico', () => {
    expect(overridesToClassName({ background: 'panel' })).toContain('bg-panel-light');
  });

  it('combina múltiplos overrides', () => {
    const cls = overridesToClassName({
      textStyle: 'h1',
      spacing: 'md',
      background: 'canvas',
      border: 'strong',
      padding: 'gap-3',
    } as StyleOverrides);
    expect(cls).toContain('text-h1');
    expect(cls).toContain('p-3');
    expect(cls).toContain('bg-canvas-light');
    expect(cls).toContain('border-primary');
    expect(cls).toContain('gap-3');
  });
});

describe('<InspectorStylesTab /> — Wave G.2', () => {
  it('renderiza o painel + 5 selects de overrides', () => {
    render(<InspectorStylesTab node={baseNode()} onChange={() => {}} />);
    expect(screen.getByTestId('inspector-styles-panel')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-styles-text-style')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-styles-spacing')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-styles-background')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-styles-border')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-styles-padding')).toBeInTheDocument();
  });

  it('aplica override e dispara onChange com props.style_overrides', () => {
    const onChange = jest.fn();
    render(<InspectorStylesTab node={baseNode()} onChange={onChange} />);
    const select = screen.getByTestId('inspector-styles-text-style');
    fireEvent.change(select, { target: { value: 'h2' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as LayoutNode;
    const props = next.widget.props as Record<string, unknown>;
    expect(props.style_overrides).toEqual({ textStyle: 'h2' });
  });

  it('preview reflete classes Tailwind aplicadas (live)', () => {
    render(
      <InspectorStylesTab
        node={baseNode({ style_overrides: { textStyle: 'h1', background: 'panel' } })}
        onChange={() => {}}
      />,
    );
    const preview = screen.getByTestId('inspector-styles-preview-classes');
    expect(preview.textContent).toContain('text-h1');
    expect(preview.textContent).toContain('bg-panel-light');
  });

  it('botão "Restaurar padrão" fica disabled quando não há overrides', () => {
    render(<InspectorStylesTab node={baseNode()} onChange={() => {}} />);
    expect(screen.getByTestId('inspector-styles-reset')).toBeDisabled();
  });

  it('botão "Restaurar padrão" limpa todos os overrides', () => {
    const onChange = jest.fn();
    render(
      <InspectorStylesTab
        node={baseNode({ style_overrides: { textStyle: 'h1', spacing: 'lg' } })}
        onChange={onChange}
      />,
    );
    const btn = screen.getByTestId('inspector-styles-reset');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    const next = onChange.mock.calls[0][0] as LayoutNode;
    const props = next.widget.props as Record<string, unknown>;
    expect(props).not.toHaveProperty('style_overrides');
  });

  it('manter overrides existentes ao patch parcial', () => {
    const onChange = jest.fn();
    render(
      <InspectorStylesTab
        node={baseNode({ style_overrides: { textStyle: 'h2' } })}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('inspector-styles-spacing'), {
      target: { value: 'lg' },
    });
    const next = onChange.mock.calls[0][0] as LayoutNode;
    const so = (next.widget.props as Record<string, unknown>)
      .style_overrides as Record<string, unknown>;
    expect(so.textStyle).toBe('h2');
    expect(so.spacing).toBe('lg');
  });

  it('escolher valor vazio remove só aquela chave', () => {
    const onChange = jest.fn();
    render(
      <InspectorStylesTab
        node={baseNode({ style_overrides: { textStyle: 'h2', spacing: 'md' } })}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('inspector-styles-text-style'), {
      target: { value: '' },
    });
    const next = onChange.mock.calls[0][0] as LayoutNode;
    const so = (next.widget.props as Record<string, unknown>)
      .style_overrides as Record<string, unknown>;
    expect(so).not.toHaveProperty('textStyle');
    expect(so.spacing).toBe('md');
  });
});
