/**
 * Wiring da página /painel-de-controle/alertas: gate de perm
 * alerts.routes.view via RequirePerm + workspace dentro do gate.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ perm, children }: any) => (
    <div data-testid="gate" data-perm={perm}>{children}</div>
  ),
}));
jest.mock('@/components/control-panel/alert-routes-workspace', () => ({
  AlertRoutesWorkspace: () => <div data-testid="workspace" />,
}));

// Backlog #6b: a page migrou para o route group do hub "Comunicação
// operacional" (parênteses ignorados na URL — rota /alertas preservada).
import Page from '@/app/painel-de-controle/(comunicacao-operacional)/alertas/page';

test('página gateia em alerts.routes.view e renderiza o workspace', () => {
  render(<Page />);
  expect(screen.getByTestId('gate').getAttribute('data-perm')).toBe(
    'alerts.routes.view',
  );
  expect(screen.getByTestId('workspace')).toBeInTheDocument();
});
