'use client';

import React from 'react';

/**
 * Rede de segurança de render por widget do Workshop.
 *
 * MOTIVO (crítico p/ venda): sem isto, uma exceção no render de UM widget
 * derruba o APP INTEIRO (tela branca) na mão do cliente — o que arruína a
 * confiança no Workshop. Com o boundary, a falha é CONTIDA num card
 * design-compliant (cantos retos, sem emoji, token de aviso), o resto do
 * painel segue funcionando, e o operador pode re-tentar aquele widget.
 *
 * Error boundaries PRECISAM ser class components (getDerivedStateFromError /
 * componentDidCatch) — não há hook equivalente. Strings pt-BR (default do
 * produto), espelhando o resto do renderer (que já hardcoda pt-BR).
 */
interface Props {
  /** Tipo do widget (ex.: 'object_table_v2') — mostrado no card e no log. */
  widgetType: string;
  /** Id do nó (telemetria/diagnóstico). */
  nodeId?: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  /** Bump p/ remontar o filho ao "Tentar novamente". */
  resetKey: number;
}

export class WidgetErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Observabilidade: nunca engole em silêncio. Fica no console do operador
    // e pode ser plugado num coletor depois (sem PII no payload).
    // eslint-disable-next-line no-console
    console.error(
      `[workshop] widget '${this.props.widgetType}' falhou no render`,
      { nodeId: this.props.nodeId, error, componentStack: info?.componentStack },
    );
  }

  private handleRetry = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render() {
    if (this.state.error) {
      const isDev = process.env.NODE_ENV !== 'production';
      return (
        <div
          role="alert"
          data-testid={`workshop-widget-error-${this.props.widgetType}`}
          className="p-3 border border-warning bg-warning/5 text-warning"
        >
          <p className="text-[12px] font-medium">
            Este widget não pôde ser exibido.
          </p>
          <p className="mt-1 text-[11px] font-mono text-muted-on-light break-words">
            {this.props.widgetType}
            {isDev && this.state.error?.message ? ` — ${this.state.error.message}` : ''}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-2 px-2 py-1 border border-warning text-[11px] text-warning hover:bg-warning/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-warning"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    // A key força remontar o filho após "Tentar novamente".
    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
