/**
 * Gap "precisa configurar" — filter_pills/exploration_filter_pills CONFIGURADO mas
 * sem valores (o gerador fia target+distinct, mas o tipo ainda não tem instâncias →
 * distinct volta vazio) NÃO pode mostrar a instrução de dev "Configure ... no Inspetor"
 * pro operador. Deve mostrar um estado NEUTRO ("— sem valores para filtrar —").
 * Só o widget genuinamente NÃO-configurado (sem target/fonte) mantém o hint de editor.
 */
import type * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string, d?: string) => d ?? k }));
// distinct SEMPRE vazio → simula tipo gerado ainda sem instâncias.
jest.mock('@/lib/workshop/client', () => ({
  Workshop: { distinctObjectSet: jest.fn(() => Promise.resolve({ values: [] })) },
}));

import '@/components/workshop/widgets';
import { getWidgetComponent } from '@/components/workshop/WorkshopV2Renderer';

function props(config: Record<string, unknown>): Record<string, unknown> {
  return {
    appId: 'app1', config, variables: {}, bindings: {},
    setBinding: () => {}, emit: () => {},
  };
}

// config REAL que o gerador produz (target + field + distinct_variable), 0 pills.
const WIRED = { title: 'Severidade', target: 'filtro_sev', multi: true,
  field: 'properties.severidade', distinct_variable: 'objs_event' };

describe.each(['filter_pills', 'exploration_filter_pills'])('%s — configurado sem dado', (type) => {
  it('NÃO mostra "Configure ... no Inspetor" quando fiado mas sem valores', async () => {
    const Comp = getWidgetComponent(type)! as unknown as React.ComponentType<Record<string, unknown>>;
    render(<Comp {...props(WIRED)} />);
    // espera o fetch (vazio) resolver
    await waitFor(() => {
      expect(screen.getByText(/sem valores para filtrar/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/no Inspetor/i)).not.toBeInTheDocument();
  });

  it('MANTÉM o hint de editor quando genuinamente sem target/fonte', () => {
    const Comp = getWidgetComponent(type)! as unknown as React.ComponentType<Record<string, unknown>>;
    render(<Comp {...props({ title: 'X' })} />); // sem target, sem field/distinct, sem pills
    expect(screen.getByText(/no Inspetor/i)).toBeInTheDocument();
  });
});
