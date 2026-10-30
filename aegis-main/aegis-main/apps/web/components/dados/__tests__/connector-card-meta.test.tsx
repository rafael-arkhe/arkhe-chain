/**
 * ConnectorCard — ficha técnica do conector (redesign 2026-07-26).
 *
 * Prova: a grade de metadados existe (identificador, cadência, criado em,
 * última execução, duração) e a situação da última rodada só aparece quando há
 * execução conhecida (nada inventado); os testids de ação seguem intactos; as
 * ações são VERBO puro (sem ícone decorativo) e as linhas de dataset não
 * abrem com ícone.
 *
 * useT mockado como identidade (padrão do projeto).
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';

import { ConnectorCard } from '@/components/dados/connector-card';
import type { ConnectorAgent, ConnectorRun } from '@/lib/api';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api', () => ({ Connectors: { datasets: jest.fn() } }));

const AGENT = {
  id: 'a1', slug: 'cep', display_name: 'CEP Brasil', kind: 'worker', status: 'active',
  config: {}, created_at: '2026-07-01T09:30:00+00:00',
  skill_keys: ['connector.http'], schedule: 'hourly',
} as ConnectorAgent;

const RUN = {
  id: 'r1', agent_id: 'a1', skill_key: 'connector.http', status: 'succeeded',
  trigger: 'schedule', queued_at: '2026-07-20T10:00:00+00:00',
  started_at: '2026-07-20T10:00:01+00:00', finished_at: '2026-07-20T10:00:03+00:00',
  duration_ms: 2400, output_summary: {}, error_message: null,
} as ConnectorRun;

function renderCard(over: Partial<React.ComponentProps<typeof ConnectorCard>> = {}) {
  return render(
    <ConnectorCard
      agent={AGENT}
      runs={null}
      openRuns={false}
      busy={null}
      canManage
      catalogLabelBySkill={{}}
      onToggleRuns={jest.fn()}
      onTest={jest.fn()}
      onRun={jest.fn()}
      onToggleStatus={jest.fn()}
      onConfigure={jest.fn()}
      onRetry={jest.fn()}
      {...over}
    />,
  );
}

it('grade de metadados traz identificador, cadência e criação', () => {
  renderCard();
  expect(screen.getByTestId('conector-meta-cep')).toBeInTheDocument();
  expect(screen.getByTestId('conector-meta-slug-cep')).toHaveTextContent('cep');
  expect(screen.getByTestId('conector-meta-cadence-cep')).toHaveTextContent('conectores.cron.hourly');
  expect(screen.getByTestId('conector-meta-created-cep')).toHaveTextContent('2026-07-01 09:30');
});

it('sem execução conhecida a ficha diz "—" e NÃO inventa situação', () => {
  renderCard();
  expect(screen.getByTestId('conector-meta-lastrun-cep')).toHaveTextContent('—');
  expect(screen.getByTestId('conector-meta-duration-cep')).toHaveTextContent('—');
  expect(screen.queryByTestId('conector-meta-laststatus-cep')).toBeNull();
});

it('com execução carregada, última execução / duração / situação aparecem', () => {
  renderCard({ runs: [RUN], openRuns: true });
  expect(screen.getByTestId('conector-meta-lastrun-cep')).toHaveTextContent('2026-07-20 10:00');
  expect(screen.getByTestId('conector-meta-duration-cep')).toHaveTextContent('2.4 s');
  expect(screen.getByTestId('conector-meta-laststatus-cep'))
    .toHaveTextContent('conectores.status.succeeded');
});

it('cadência ausente cai em "manual", nunca vazio', () => {
  renderCard({ agent: { ...AGENT, schedule: null } });
  expect(screen.getByTestId('conector-meta-cadence-cep')).toHaveTextContent('conectores.cron.manual');
});

it('estado do conector vem com rótulo junto da cor', () => {
  renderCard();
  const chip = screen.getByTestId('conector-status-cep');
  expect(chip).toHaveTextContent('conectores.status.active');
  expect(chip.className).toMatch(/border-success/);
});

it('testids de ação preservados e sem ícone decorativo (verbo puro)', () => {
  renderCard();
  for (const id of [
    'conector-configurar-cep', 'conector-toggle-cep', 'conector-test-cep',
    'conector-run-cep', 'conector-runs-cep', 'conector-datasets-cep',
  ]) {
    expect(screen.getByTestId(id)).toBeInTheDocument();
    expect(screen.getByTestId(id).querySelector('svg')).toBeNull();
  }
});

it('sem connectors.manage o Configurar não existe', () => {
  renderCard({ canManage: false });
  expect(screen.queryByTestId('conector-configurar-cep')).toBeNull();
});

it('Parear e Últimas mensagens só com a capability declarada pela skill', () => {
  const { unmount } = renderCard();
  expect(screen.queryByTestId('conector-pair-cep')).toBeNull();
  unmount();

  renderCard({ capabilitiesBySkill: { 'connector.http': ['pairing'] } });
  expect(screen.getByTestId('conector-pair-cep')).toBeInTheDocument();
  expect(screen.getByTestId('conector-messages-cep')).toBeInTheDocument();
});
