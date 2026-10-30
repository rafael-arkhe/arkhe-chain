/**
 * Sprint 5 (Estação WhatsApp) — botão "Parear" no card do conector.
 *
 * Prova: "Parear" (e o painel de últimas mensagens) só aparecem quando a skill
 * do binding declara capability 'pairing' E o operador tem gestão (canManage).
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';

import { ConnectorCard } from '@/components/dados/connector-card';

jest.mock('@/lib/i18n/provider', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'pt-BR' }),
  useT: () => (k: string) => k,
}));
jest.mock('@/lib/i18n/skill-labels', () => ({ skillLabel: (_t: unknown, k: string) => k }));
jest.mock('@/lib/api', () => ({
  Connectors: { datasets: jest.fn(), pairingStart: jest.fn(), pairingPoll: jest.fn() },
  Ontology: { listNodes: jest.fn() },
}));

const AGENT = {
  id: 'ag1', slug: 'estacao-x', display_name: 'Estação X', status: 'active',
  kind: 'worker', skill_keys: ['connector.whatsapp'], config: {}, created_at: '',
} as never;

function renderCard(over: {
  canManage?: boolean;
  capabilitiesBySkill?: Record<string, string[]>;
}) {
  return render(
    <ConnectorCard
      agent={AGENT} result={undefined} runs={null} openRuns={false} busy={null}
      canManage={over.canManage ?? true}
      catalogLabelBySkill={{}}
      capabilitiesBySkill={over.capabilitiesBySkill}
      onToggleRuns={() => {}} onTest={() => {}} onRun={() => {}}
      onToggleStatus={() => {}} onConfigure={() => {}} onRetry={() => {}}
    />,
  );
}

it('mostra Parear + Últimas mensagens com capability pairing e canManage', () => {
  renderCard({ canManage: true, capabilitiesBySkill: { 'connector.whatsapp': ['pairing'] } });
  expect(screen.getByTestId('conector-pair-estacao-x')).toBeInTheDocument();
  expect(screen.getByTestId('conector-messages-estacao-x')).toBeInTheDocument();
});

it('esconde Parear sem canManage (mesmo com capability)', () => {
  renderCard({ canManage: false, capabilitiesBySkill: { 'connector.whatsapp': ['pairing'] } });
  expect(screen.queryByTestId('conector-pair-estacao-x')).toBeNull();
  expect(screen.queryByTestId('conector-messages-estacao-x')).toBeNull();
});

it('esconde Parear quando a skill não declara pairing', () => {
  renderCard({ canManage: true, capabilitiesBySkill: { 'connector.whatsapp': [] } });
  expect(screen.queryByTestId('conector-pair-estacao-x')).toBeNull();
});

it('esconde Parear quando não há mapa de capabilities', () => {
  renderCard({ canManage: true, capabilitiesBySkill: undefined });
  expect(screen.queryByTestId('conector-pair-estacao-x')).toBeNull();
});
