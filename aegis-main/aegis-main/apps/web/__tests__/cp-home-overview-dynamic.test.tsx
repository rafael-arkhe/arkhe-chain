/**
 * #1 (2026-05-24) — "Visão geral" do Painel de Controle · Início é DINÂMICA.
 *
 * Antes, "Detalhes da unidade" / "Organizações" mostravam valores estáticos
 * cravados no backend (`enrollment={name:"AEGIS",host:"aegis.local"}`,
 * `organizations=[{name:"Polícia Civil"}]`). Agora compõem dados REAIS dos
 * endpoints existentes:
 *   - GET /me/context        → unidade/Organização ativa (display_name)
 *   - GET /me/organizations  → Organizações do operador (slug + papel)
 *
 * Estas asserções travam o comportamento dinâmico e a ausência dos antigos
 * valores hardcoded.
 */
import { render, screen, waitFor, within } from '@testing-library/react';

// CpPageHeader é puramente apresentacional; isola o shell pesado (que puxa
// next/navigation, next/image etc.) do teste da home.
jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ title }: { title: React.ReactNode }) => (
    <div data-testid="cp-page-header">{title}</div>
  ),
}));

jest.mock('@/lib/api', () => ({
  ControlPanel: { home: jest.fn() },
  MeContextApi: { get: jest.fn(), listOrganizations: jest.fn() },
  Spaces: { list: jest.fn() },
  Projects: { list: jest.fn() },
}));

import PainelHomePage from '@/app/painel-de-controle/page';
import { ControlPanel, MeContextApi, Projects, Spaces } from '@/lib/api';

const homeMock = ControlPanel.home as jest.Mock;
const contextMock = MeContextApi.get as jest.Mock;
const listOrgsMock = MeContextApi.listOrganizations as jest.Mock;
const spacesMock = Spaces.list as jest.Mock;
const projectsMock = Projects.list as jest.Mock;

const HOME = {
  enrollment: { id: 'x', name: 'IGNORED', host: 'ignored.local' },
  organizations: [{ id: 'x', name: 'IGNORED ORG' }],
  starred_settings: [],
  sections: [
    { title: 'Configurar a unidade', cards: [] },
    { title: 'Configurar uma organização', cards: [] },
    { title: 'Gerenciando o AEGIS pelo Painel', cards: [] },
  ],
};

const CONTEXT = {
  organization_id: 'org-ssp',
  organization_name: 'Secretaria de Segurança Pública (demo)',
  space_id: null,
  space_name: null,
  project_id: null,
  project_name: null,
};

const ORGS = [
  { id: 'org-ssp', slug: 'ssp-xx', display_name: 'Secretaria de Segurança Pública (demo)', role: 'owner', active: true },
  { id: 'org-aegis', slug: 'aegis', display_name: 'AEGIS', role: 'admin', active: true },
  { id: 'org-retail', slug: 'retail-corp', display_name: 'Retail Corp (demo)', role: 'admin', active: true },
];

// #3 — "Seu escopo" conta apenas Espaços/Operações ATIVOS. Estes fixtures
// trazem itens inativos de propósito (devem ser ignorados na contagem).
const SPACES = [
  { id: 's1', slug: 'op-norte', display_name: 'Operação Norte', active: true },
  { id: 's2', slug: 'op-sul', display_name: 'Operação Sul', active: true },
  { id: 's3', slug: 'arquivado', display_name: 'Arquivado', active: false },
];
const PROJECTS = [
  { id: 'p1', slug: 'caso-001', display_name: 'Caso 001', active: true },
  { id: 'p2', slug: 'caso-002', display_name: 'Caso 002', active: false },
];

beforeEach(() => {
  homeMock.mockReset().mockResolvedValue(HOME);
  contextMock.mockReset().mockResolvedValue(CONTEXT);
  listOrgsMock.mockReset().mockResolvedValue(ORGS);
  spacesMock.mockReset().mockResolvedValue(SPACES);
  projectsMock.mockReset().mockResolvedValue(PROJECTS);
});

describe('#1 · "Visão geral" dinâmica (tenant + Organizações reais)', () => {
  it('reusa os endpoints de contexto existentes (sem API nova)', async () => {
    render(<PainelHomePage />);
    await waitFor(() => expect(screen.getByTestId('cp-overview')).toBeInTheDocument());
    expect(contextMock).toHaveBeenCalledTimes(1);
    expect(listOrgsMock).toHaveBeenCalledTimes(1);
  });

  it('"Detalhes da unidade" mostra a Organização ATIVA + slug real', async () => {
    render(<PainelHomePage />);
    const unit = await screen.findByTestId('cp-overview-unit');
    expect(within(unit).getByText('Secretaria de Segurança Pública (demo)')).toBeInTheDocument();
    expect(within(unit).getByText('ssp-xx')).toBeInTheDocument();
  });

  it('"Organizações" lista as Organizações reais com contagem quando >1', async () => {
    render(<PainelHomePage />);
    const orgs = await screen.findByTestId('cp-overview-orgs');
    expect(within(orgs).getByText('Secretaria de Segurança Pública (demo)')).toBeInTheDocument();
    expect(within(orgs).getByText('AEGIS')).toBeInTheDocument();
    expect(within(orgs).getByText('Retail Corp (demo)')).toBeInTheDocument();
    // contagem (3) aparece quando há mais de uma Organização
    expect(screen.getByTestId('cp-overview-orgs-count')).toHaveTextContent('3');
  });

  it('NÃO renderiza os antigos valores estáticos (aegis.local / Polícia Civil)', async () => {
    render(<PainelHomePage />);
    await screen.findByTestId('cp-overview');
    expect(screen.queryByText('aegis.local')).not.toBeInTheDocument();
    expect(screen.queryByText('Polícia Civil')).not.toBeInTheDocument();
    // o `enrollment`/`organizations` do home() não são mais consumidos
    expect(screen.queryByText('IGNORED ORG')).not.toBeInTheDocument();
    expect(screen.queryByText('ignored.local')).not.toBeInTheDocument();
  });

  it('estado vazio: sem Organizações mostra placeholder, sem contagem', async () => {
    listOrgsMock.mockResolvedValue([]);
    contextMock.mockResolvedValue(CONTEXT);
    render(<PainelHomePage />);
    await screen.findByTestId('cp-overview');
    await waitFor(() =>
      expect(screen.getByText('Nenhuma Organização vinculada.')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('cp-overview-orgs-count')).not.toBeInTheDocument();
  });

  it('contexto único (1 Organização) não exibe badge de contagem', async () => {
    listOrgsMock.mockResolvedValue([ORGS[0]]);
    render(<PainelHomePage />);
    await screen.findByTestId('cp-overview-orgs');
    expect(screen.queryByTestId('cp-overview-orgs-count')).not.toBeInTheDocument();
  });
});

describe('#3 · "Seu escopo" (Espaços + Operações ativos)', () => {
  it('reusa /spaces e /projects existentes (sem API nova)', async () => {
    render(<PainelHomePage />);
    await screen.findByTestId('cp-overview-scope');
    expect(spacesMock).toHaveBeenCalledTimes(1);
    expect(projectsMock).toHaveBeenCalledTimes(1);
  });

  it('conta APENAS Espaços/Operações ativos (ignora inativos)', async () => {
    render(<PainelHomePage />);
    const spaces = await screen.findByTestId('cp-overview-scope-spaces');
    const projects = await screen.findByTestId('cp-overview-scope-projects');
    // SPACES: 2 ativos de 3 · PROJECTS: 1 ativo de 2
    expect(within(spaces).getByText('2')).toBeInTheDocument();
    expect(within(spaces).getByText('Espaços')).toBeInTheDocument();
    expect(within(projects).getByText('1')).toBeInTheDocument();
    expect(within(projects).getByText('Operações')).toBeInTheDocument();
  });

  it('escopo vazio: mostra zero (não some, não vira lista)', async () => {
    spacesMock.mockResolvedValue([]);
    projectsMock.mockResolvedValue([]);
    render(<PainelHomePage />);
    const spaces = await screen.findByTestId('cp-overview-scope-spaces');
    const projects = await screen.findByTestId('cp-overview-scope-projects');
    expect(within(spaces).getByText('0')).toBeInTheDocument();
    expect(within(projects).getByText('0')).toBeInTheDocument();
  });

  it('falha de rede degrada para zero, sem quebrar o painel', async () => {
    spacesMock.mockRejectedValue(new Error('boom'));
    projectsMock.mockRejectedValue(new Error('boom'));
    render(<PainelHomePage />);
    // O painel inteiro continua de pé.
    await screen.findByTestId('cp-overview');
    const spaces = await screen.findByTestId('cp-overview-scope-spaces');
    expect(within(spaces).getByText('0')).toBeInTheDocument();
  });
});
