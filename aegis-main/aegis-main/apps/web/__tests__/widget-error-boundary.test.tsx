/**
 * WidgetErrorBoundary — a rede de segurança do Workshop.
 *
 * Prova que um widget que LANÇA no render é CONTIDO num card (o painel segue de
 * pé), em vez de propagar e dar tela branca no app do cliente. É a defesa em
 * profundidade por trás da robustez per-widget do all-widgets-robustness.
 */
import type * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { WidgetErrorBoundary } from '@/components/workshop/WidgetErrorBoundary';

function Bomb(): React.ReactElement {
  throw new Error('boom-no-render');
}

describe('WidgetErrorBoundary', () => {
  it('contém o crash num card e NÃO propaga (sem tela branca)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <WidgetErrorBoundary widgetType="bomb_widget" nodeId="n1">
          <Bomb />
        </WidgetErrorBoundary>,
      ),
    ).not.toThrow();
    expect(
      screen.getByTestId('workshop-widget-error-bomb_widget'),
    ).toBeInTheDocument();
    expect(screen.getByText(/não pôde ser exibido/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renderiza o filho normalmente quando não há erro', () => {
    render(
      <WidgetErrorBoundary widgetType="ok_widget">
        <div data-testid="ok">conteúdo</div>
      </WidgetErrorBoundary>,
    );
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });

  it('expõe "Tentar novamente" e re-tentar não derruba o app', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <WidgetErrorBoundary widgetType="bomb2_widget">
          <Bomb />
        </WidgetErrorBoundary>,
      ),
    ).not.toThrow();
    const btn = screen.getByRole('button', { name: /tentar novamente/i });
    // Re-tenta: o Bomb lança de novo, mas o boundary re-contém — o app NUNCA cai.
    expect(() => fireEvent.click(btn)).not.toThrow();
    expect(
      screen.getByTestId('workshop-widget-error-bomb2_widget'),
    ).toBeInTheDocument();
    spy.mockRestore();
  });
});
