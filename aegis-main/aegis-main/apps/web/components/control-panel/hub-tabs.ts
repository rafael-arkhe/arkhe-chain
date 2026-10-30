/**
 * hub-tabs — topologia das abas dos hubs do Painel de Controle (Fase 4 da
 * consolidação de IA). Fonte única consumida pelas páginas (via <CpHubSubnav/>)
 * e pelos testes. Labels em pt-BR por intenção (mesmo padrão hardcoded do
 * OntologiaTabs); as rotas + perms espelham CP_NAV_ITEMS e são preservadas.
 */
import type { CpHubTab } from './cp-hub-subnav';

const P = (slug: string) => `/painel-de-controle/${slug}`;

// ─── IA · Análise (Explorar | Funções av.) ──────────────────────────────────
// "Explorar" = análise de leitura (Panorama/Distribuições/Séries); "Funções" =
// logic-editor (autoria de lógica computada, frase montável). Resolve o clash
// histórico "Análise" (analise) × "Análises" (logic-editor).
export const ANALISE_TABS: CpHubTab[] = [
  { label: 'Explorar', href: P('analise'), match: P('analise'), perm: 'ontology.objects.read' },
  { label: 'Funções', href: P('logic-editor'), match: P('logic-editor'), perm: 'ontology.actions.write', adv: true },
  // F7.3 — o tab "IDE" saiu daqui: o IDE foi unificado no hub Dados
  // (/painel-de-controle/dados?aba=ide); a rota /ide virou redirect.
];

// ─── Catálogo · Agentes (Conversas | Agentes | Memória) ──────────────────────
// O hub de IA do operador: o catálogo de Agentes + as superfícies do AIP
// (memória, conversas). UI mostra "AIP", nunca OpenClaw/ClawHub.
// "Modelos" (catálogo + preço + padrão por finalidade + orçamento) MUDOU para o
// hub Dados (`/painel-de-controle/dados?aba=modelos`) — configuração de modelo é
// centralizada lá, junto de Provedores de computação.
export const AGENTES_TABS: CpHubTab[] = [
  // Conversas (chat AIP) é o uso diário → 1ª aba e destino do item de sidenav.
  // Agentes (catálogo de ingestão 24/7) é configuração, vem depois.
  { label: 'Conversas', href: P('aip-threads'), match: P('aip-threads'), perm: 'aip.threads.read' },
  { label: 'Agentes', href: '/agentes?cp=1', match: '/agentes', perm: 'security.agentes.view' },
  { label: 'Saúde das fontes', href: '/conectores?cp=1', match: '/conectores', perm: 'security.buscar.view' },
  { label: 'Memória', href: P('aip-memory'), match: P('aip-memory'), perm: 'aip.memory.read' },
];

// ─── IA & Automação · Automação (Roteiros | Rotinas) ─────────────────────────
// Roteiros (pilots) + Rotinas (autopilot) — orquestração de ações; mesma perm.
export const AUTOMACAO_TABS: CpHubTab[] = [
  { label: 'Roteiros', href: P('pilots'), match: P('pilots'), perm: 'ontology.actions.execute' },
  { label: 'Rotinas', href: P('autopilot'), match: P('autopilot'), perm: 'ontology.actions.execute' },
];

// ─── Acesso · Organizações (+ Convidados) ────────────────────────────────────
export const ACESSO_ORG_TABS: CpHubTab[] = [
  { label: 'Organizações', href: P('organizacoes'), match: P('organizacoes'), perm: 'organization.read' },
  { label: 'Convidados', href: P('convidados'), match: P('convidados'), perm: 'organization.read' },
];

// ─── Marcações (Vocabulário | Por propriedade) ───────────────────────────────
export const MARCACOES_TABS: CpHubTab[] = [
  { label: 'Vocabulário', href: P('marcacoes'), match: P('marcacoes'), perm: 'markings.read' },
  { label: 'Por propriedade', href: P('marcacoes-propriedade'), match: P('marcacoes-propriedade'), perm: 'markings.read' },
];

// ─── Operacional · Salas (+ Tours) ───────────────────────────────────────────
// Tours são WorkspaceUpdate de uma Sala — não existem sem Sala. Viram aba.
export const OPERACIONAL_SALAS_TABS: CpHubTab[] = [
  { label: 'Salas', href: P('salas'), match: P('salas'), perm: 'workspace.read' },
  { label: 'Tours', href: P('tours'), match: P('tours'), perm: 'workspace.update.read' },
];

// ─── Operacional · Cenários (Ontologia | Apps) ───────────────────────────────
// Backends DIFERENTES (what-if sobre OntologyNode vs sobre ações de App); só a
// navegação unifica. O rótulo do hub ("Cenários") desambigua a aba "Ontologia".
export const OPERACIONAL_CENARIOS_TABS: CpHubTab[] = [
  { label: 'Ontologia', href: P('scenarios'), match: P('scenarios'), perm: 'ontology.objects.write' },
  { label: 'Apps', href: P('cenarios-app'), match: P('cenarios-app'), perm: 'ontology.objects.write' },
];

// ─── Sistema · Personalização (Aparência | Layout do App) ────────────────────
// Os 2 editores de aparência do produto (tenant-wide), ambos workspace.publish.
// FIX #3 (2026-06-28): "Páginas" SAIU deste hub — virou item de 1ª classe na
// seção "Catálogo" do nav do Painel (control-panel-shell CP_NAV_ITEMS, id
// 'paginas'). A rota /painel-de-controle/paginas é destino próprio (sem subnav).
export const PERSONALIZACAO_TABS: CpHubTab[] = [
  { label: 'Aparência', href: P('styles-configurator'), match: P('styles-configurator'), perm: 'workspace.publish' },
  { label: 'Layout do App', href: P('app-shell'), match: P('app-shell'), perm: 'workspace.publish' },
];

// ─── Sistema · Comunicação (Comunicações | Notificações) ─────────────────────
// Notificações é stub (feeds de alerta ainda não ligados); vira aba sem dó.
export const COMUNICACAO_TABS: CpHubTab[] = [
  { label: 'Comunicações', href: P('comunicacoes'), match: P('comunicacoes') },
  { label: 'Notificações', href: P('notificacoes'), match: P('notificacoes') },
];

// ─── Operacional · Comunicação operacional (Comunicados | Rotas de alerta) ────
// Backlog #6b: os dois canais de comunicação OPERACIONAL — Comunicados (banners
// globais agendados por audiência) + Rotas de alerta (roteamento de notificações
// na ontologia) — eram itens-irmãos soltos no cluster Operacional; viram abas de
// UM hub. Perms DIVERGENTES por aba (cada uma some sem sua perm via CpHubSubnav);
// a barreira real continua no RequirePerm de cada page-alvo.
export const COMUNICACAO_OPERACIONAL_TABS: CpHubTab[] = [
  { label: 'Comunicados', href: P('comunicados'), match: P('comunicados'), perm: 'app_shell.manage' },
  { label: 'Rotas de alerta', href: P('alertas'), match: P('alertas'), perm: 'alerts.routes.view' },
];

// ─── Acesso e Identidade ─────────────────────────────────────────────────────
// (Equipe | Grupos | Papéis | Permissões av. | Acessos públicos | Auditoria av.)
// As telas IAM vivem em /iam/* (não /painel-de-controle); /iam redireciona p/
// /iam/equipe. LOTE1 ELO NAV&HUBS (#4): o hub absorveu "Grupos"
// (/painel-de-controle/grupos, iam.groups.read) e "Acessos públicos"
// (/painel-de-controle/acessos-publicos, public.token.read), antes itens-irmãos
// soltos na seção "Acesso". Cada aba respeita sua perm (CpHubSubnav filtra);
// rotas preservadas. Abas /iam/* e do painel coexistem na mesma barra (a
// montagem da barra nas pages /grupos e /acessos-publicos fica no elo Pages).
export const IDENTIDADE_TABS: CpHubTab[] = [
  { label: 'Equipe', href: '/iam/equipe?cp=1', match: '/iam/equipe' },
  { label: 'Grupos', href: P('grupos') + '?cp=1', match: P('grupos'), perm: 'iam.groups.read' },
  { label: 'Papéis', href: '/iam/papeis?cp=1', match: '/iam/papeis' },
  { label: 'Permissões', href: '/iam/permissoes?cp=1', match: '/iam/permissoes', adv: true },
  { label: 'Acessos públicos', href: P('acessos-publicos') + '?cp=1', match: P('acessos-publicos'), perm: 'public.token.read' },
  { label: 'Auditoria', href: '/iam/auditoria?cp=1', match: '/iam/auditoria', adv: true },
];
