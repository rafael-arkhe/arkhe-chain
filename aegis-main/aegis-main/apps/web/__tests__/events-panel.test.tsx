/**
 * F2 (2026-06-06) — EventsPanel EXECUTÁVEL.
 *
 * O painel agora opera sobre `node.events` (o único modelo que o renderer
 * executa), oferece SÓ os triggers que o widget realmente emite, e usa
 * seletores populados (variáveis/janelas/páginas) — zero digitação de id.
 * Estes testes travam exatamente o que estava quebrado antes:
 *   - triggers reais por widget (não o catálogo abstrato);
 *   - gravação em node.events (NUNCA em widget.props.on_events);
 *   - seletor de alvo populado com as variáveis do app.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';

import { EventsPanel } from '@/components/workshop/events-panel';
import type { LayoutNode, WidgetEvent, WorkshopVariable } from '@/lib/workshop/types';

const VARS = [
  { id: 'v1', external_id: 'selecionado', label: 'Item selecionado' },
  { id: 'v2', external_id: 'contador', label: 'Contador' },
] as unknown as WorkshopVariable[];

function node(type: string, events?: WidgetEvent[]): LayoutNode {
  return { id: 'n1', widget: { type, props: {} }, ...(events ? { events } : {}) };
}

function renderPanel(n: LayoutNode | null, onChange = jest.fn()) {
  render(
    <EventsPanel
      selectedNode={n}
      onChangeNode={onChange}
      variables={VARS}
      overlays={[]}
      pages={[]}
    />,
  );
  return onChange;
}

describe('EventsPanel — F2 executável', () => {
  it('mostra SÓ os triggers reais do widget (object_table: select_change+value_change+on_load, sem click)', () => {
    renderPanel(node('object_table'));
    expect(screen.getByTestId('events-trigger-select_change')).toBeInTheDocument();
    expect(screen.getByTestId('events-trigger-value_change')).toBeInTheDocument();
    expect(screen.getByTestId('events-trigger-on_load')).toBeInTheDocument();
    // object_table NÃO emite click → não pode aparecer (era o bug: trigger fantasma)
    expect(screen.queryByTestId('events-trigger-click')).not.toBeInTheDocument();
  });

  it('button_group oferece click (+ on_load) e adiciona reação em node.events — NUNCA on_events', () => {
    const onChange = renderPanel(node('button_group'));
    fireEvent.click(screen.getByTestId('events-add-click'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0][0] as WidgetEvent[];
    // recebe o array node.events (WidgetEvent[]), não um LayoutNode com on_events
    expect(Array.isArray(arg)).toBe(true);
    expect(arg[0]).toMatchObject({ trigger: 'click', action: 'set_variable' });
    expect(JSON.stringify(arg)).not.toContain('on_events');
    expect(JSON.stringify(arg)).not.toContain('event_key');
  });

  it('widget sem emits específicos (metric_card) só oferece on_load', () => {
    renderPanel(node('metric_card'));
    expect(screen.getByTestId('events-trigger-on_load')).toBeInTheDocument();
    expect(screen.queryByTestId('events-trigger-click')).not.toBeInTheDocument();
    expect(screen.queryByTestId('events-trigger-select_change')).not.toBeInTheDocument();
  });

  it('editor de ação usa seletor de variável POPULADO (sem digitar id)', () => {
    const ev: WidgetEvent[] = [{ trigger: 'click', action: 'set_variable', params: {} }];
    renderPanel(node('button_group', ev));
    fireEvent.click(screen.getByTestId('events-reaction-0-pick'));
    expect(screen.getByTestId('events-do-form')).toBeInTheDocument();
    const target = screen.getByTestId('events-param-target') as HTMLSelectElement;
    // as opções são as variáveis do app, não um input livre
    const opts = within(target).getAllByRole('option').map((o) => o.textContent);
    expect(opts).toContain('Item selecionado');
    expect(opts).toContain('Contador');
  });

  it('troca a ação persiste em node.events', () => {
    const ev: WidgetEvent[] = [{ trigger: 'click', action: 'set_variable', params: {} }];
    const onChange = renderPanel(node('button_group', ev));
    fireEvent.click(screen.getByTestId('events-reaction-0-pick'));
    fireEvent.change(screen.getByTestId('events-do-action'), {
      target: { value: 'refresh_all' },
    });
    const arg = onChange.mock.calls.at(-1)?.[0] as WidgetEvent[];
    expect(arg[0].action).toBe('refresh_all');
  });

  it('remove uma reação', () => {
    const ev: WidgetEvent[] = [{ trigger: 'click', action: 'refresh_all', params: {} }];
    const onChange = renderPanel(node('button_group', ev));
    fireEvent.click(screen.getByTestId('events-reaction-0-remove'));
    const arg = onChange.mock.calls.at(-1)?.[0] as WidgetEvent[];
    expect(arg).toEqual([]);
  });

  it('sem widget selecionado mostra placeholder', () => {
    renderPanel(null);
    expect(screen.getByTestId('events-no-widget')).toBeInTheDocument();
  });
});

/* ── drift-guard: o registry emits[] casa com os emit() reais dos widgets ── */
import { WIDGET_EMITS } from '@/lib/workshop/widget-emits';

describe('WIDGET_EMITS drift-guard', () => {
  it('declara os triggers de ciclo de vida conhecidos', () => {
    expect(WIDGET_EMITS.object_action_button).toEqual([
      'action.execute.success',
      'action.execute.pending',
      'action.execute.error',
    ]);
    expect(WIDGET_EMITS.object_table).toEqual(['select_change', 'value_change']);
    expect(WIDGET_EMITS.form_builder).toContain('form.submit.success');
    // metric_card não tem emits específicos
    expect(WIDGET_EMITS.metric_card).toBeUndefined();
  });

  it('cobre os widgets de entrada que emitem (regressão do review: gaps reintroduziriam evento que nunca dispara)', () => {
    expect(WIDGET_EMITS.media_uploader).toEqual(['value_change']);
    expect(WIDGET_EMITS.instance_editor).toEqual(['value_change']);
    expect(WIDGET_EMITS.search_input).toEqual(['search.changed']);
  });
});
