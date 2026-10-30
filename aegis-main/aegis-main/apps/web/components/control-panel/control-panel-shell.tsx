'use client';

/**
 * ControlPanelShell — casca interna do Painel de Controle.
 *
 * Sprint H1 (2026-05-22). Espelha o layout do Control Panel da Foundry
 * documentado em `docs/workshop/44-painel-de-controle-research.md`:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ [logo] Painel de Controle  · enrollment ▼ · org ▼  · ⚙  │  ← header
 *   ├──────────┬──────────────────────────────────────────────┤
 *   │ Início   │                                              │
 *   │ Aprov.   │             { children }                     │
 *   │ Comunic. │                                              │
 *   │ Ativid.  │                                              │
 *   │ ...      │                                              │
 *   │ FAVORITAS│                                              │
 *   │ ...      │                                              │
 *   └──────────┴──────────────────────────────────────────────┘
 *
 * O shell GLOBAL da app (PageShell) renderiza o sidenav AEGIS por fora;
 * este shell é apenas o "Foundry-style" interno DO Painel de Controle.
 */
import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { DATA_NAV_ANYPERM, principalCanSeeNav } from './nav-visibility';
import {
  Activity,
  Clock,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  Box,
  Boxes,
  Brain,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  FileStack,
  FolderSearch,
  GitBranch,
  GitFork,
  GitMerge,
  Images,
  Globe,
  HelpCircle,
  Home,
  KeyRound,
  Layers,
  Layout,
  LayoutDashboard,
  LibraryBig,
  Mail,
  Megaphone,
  Mic,
  Network,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Radar,
  Route,
  Scroll,
  Search,
  Share2,
  SlidersHorizontal,
  SquareFunction,
  Tag,
  Terminal,
  User,
  UserCog,
  UserPlus,
  Users,
  UsersRound,
  Workflow,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth/useAuth';
import { useCpSidenav } from '@/lib/store';
import { useT } from '@/lib/i18n/provider';
import { useBrand } from '@/components/shell/brand-context';
import { CpCommandPalette } from './cp-command-palette';
import { CpContextSwitcher } from './cp-context-switcher';

/**
 * ICON_MAP — Onda M1.c (2026-05-23): 1 ícone único por item (#12 reorg).
 * Removidas as repetições (`workflow` em 4 itens, `circuit-board` em 2) e,
 * no M1.c-fix, as 2 colisões cross-seção remanescentes: `users` (Grupos vs
 * Equipe) → Grupos usa `users-round`. Cada entrada é usada por exatamente um
 * NavItem.
 *
 * Onda I.1 (2026-05-24) — ícones mais fiéis a features sérias de infra
 * crítica (sem conotação SaaS/consumer/infantil):
 *   - Cenários (`git-fork`, ramificações what-if) — era `lightbulb`;
 *   - Soluções (`share-2`, diagrama/arquitetura) — era `shield-check`,
 *     distinto de `square-function` do Editor IA;
 *   - Papéis (`badge-check`, credencial) — era `shield`;
 *   - Loja (`library-big`, catálogo/registro) — era `shopping-bag`;
 *   - Editor IA (`square-function`, autoria de lógica) — era `workflow`;
 *   - Autopilot (`radar`, operação autônoma) — era `circuit-board`;
 *   - Conversas (`audio-lines`, ícone canônico do AIP) — era `message-square`.
 */
const ICON_MAP = {
  home: Home,
  'check-circle': CheckCircle2,
  mail: Mail,
  'bar-chart-3': BarChart3,
  box: Box,
  radar: Radar, // autopilot (operação autônoma) (único)
  boxes: Boxes,
  'database-zap': Database,
  'square-function': SquareFunction, // logic-editor (autoria de lógica) (único)
  users: Users,
  'badge-check': BadgeCheck, // papéis (credencial) (único)
  'key-round': KeyRound,
  activity: Activity,
  clock: Clock,
  globe: Globe,
  bell: Bell,
  user: User,
  'building-2': Building2,
  layers: Layers,
  'user-plus': UserPlus,
  tag: Tag,
  'folder-search': FolderSearch,
  'layout-dashboard': LayoutDashboard,
  layout: Layout,
  'book-open': BookOpen,
  zap: Zap,
  'git-fork': GitFork, // cenários (ramificações what-if) (único)
  'git-branch': GitBranch, // lineage (grafo) (único)
  'git-merge': GitMerge, // datasets e branches (versionamento) (único)
  images: Images, // media sets (arquivos não-estruturados) (único)
  mic: Mic,
  'audio-lines': AudioLines, // conversas (ícone canônico do AIP) (único)
  brain: Brain,
  pin: Pin,
  palette: Palette,
  'library-big': LibraryBig, // loja (catálogo/registro) (único)
  megaphone: Megaphone,
  // Onda M1.c: ícones únicos novos para desambiguar itens antes repetidos.
  route: Route, // pilots
  scroll: Scroll, // lineage (log)
  network: Network, // grafo da ontologia
  cpu: Cpu, // agentes (ícone técnico sério — substitui o antigo `bot`)
  'file-stack': FileStack, // páginas
  'sliders-horizontal': SlidersHorizontal, // marcações por propriedade
  'users-round': UsersRound, // grupos (Acesso) — distinto de `users` (Equipe)
  'share-2': Share2, // soluções (diagrama/arquitetura) (único)
  terminal: Terminal, // M3 — Plataforma (Safe Core), só com dev-mode ativo
  'user-cog': UserCog, // conta (rodapé Sistema) — identidade da sessão
  workflow: Workflow, // pipelines (DAG de transformação → ontologia) (único)
} as const;

type IconKey = keyof typeof ICON_MAP;

/**
 * Onda M1.c (2026-05-23) — #12 reorg do sidenav (aprovado pelo operador).
 *
 * O modelo antigo (1 seção "UNIDADE" com 4 subgrupos + 1 "ORGANIZAÇÃO"
 * flat, ~30 itens densos) foi reorganizado em ~9 seções claras, labels
 * curtos, e 1 ícone único por item. AEGIS serve defesa/energia/saúde/
 * inteligência/enterprise — a IA prioriza clareza/simplicidade.
 *
 *   (top)               Início · Aprovações · Buscar
 *   Acesso              Organizações · Espaços · Identidade
 *   Operacional         Operações · Salas · Tours · Cenários · Alertas
 *   IA & Autom.         Ações · Soluções · Editor IA · Pilots · Autopilot · Áudio
 *   Catálogo            Apps · Agentes · Conversas · Modelos · Memória ·
 *                       Tipos de objeto · Instâncias · Grafo da ontologia
 *   Dados               Lineage (grafo) · Lineage (log) · Marcações (abas)
 *   Sistema             Aparência · Layout do App · Páginas · Loja ·
 *                       Atividade · Browser · Notificações · Comunicações · Conta
 *
 * LOTE1 ELO NAV&HUBS (2026-06-28): (#3) "Comunicação operacional" → "Alertas"
 * (só o label do item; id/href/tabs preservados). (#4) hub "Identidade" →
 * "Acesso e Identidade" + Grupos e Acessos públicos viraram abas do hub IAM
 * (saíram de Acesso). (#5) "Atividade" usa ícone `activity` (era bar-chart-3).
 * (#7) seção "Marcações" dissolvida — Vocabulário/Por propriedade serão abas
 * dentro do hub "Dados" (elo Pages); rotas /marcacoes* preservadas.
 *
 * FIX ELO IAM (#2, 2026-06-28): a seção própria "Acesso e Identidade" (que tinha
 * SÓ o item IAM e duplicava o rótulo) foi REMOVIDA — o item IAM voltou para a
 * seção "Acesso" com o label conciso "Identidade" (lê-se "Acesso › Identidade").
 * O hub interno (CpHubSubnav) usa o group conciso "Identidade". Rotas/abas iguais.
 *
 * UX-fix (#11, 2026-05-24): a antiga seção "Comunicação" foi dissolvida —
 * "Comunicados" (broadcasts operacionais) entrou em Operacional e
 * "Comunicações" (e-mail/SMTP) entrou em Sistema. Sem seção órfã.
 */
type NavSection =
  | 'top'
  | 'acesso'
  | 'operacional'
  | 'ia'
  | 'catalogo'
  | 'dados'
  | 'sistema';

export interface NavItem {
  id: string;
  /** Fallback literal (pt-BR) — `t('nav.<id>')` é a fonte real. */
  label: string;
  href: string;
  icon: IconKey;
  section: NavSection;
  /**
   * Permissão necessária para ver o item. Itens SEM perm são sempre
   * visíveis (#12 perm filter). Espelha o `canSee` do sidenav global.
   */
  perm?: string;
  /**
   * QUALQUER uma destas perms basta (hub multi-recurso, ex.: "Dados"). Onda 0:
   * substitui o over-gate de perm ÚNICA que escondia o hub de quem só tinha a
   * perm de UMA aba. Avaliada em `principalCanSeeNav`.
   */
  anyPerm?: string[];
  /**
   * M3 — domínio (vertical) ao qual o item pertence. COSMÉTICO: quando o
   * tenant tem `allowed_domains` configurado e o domínio do item não está
   * na lista, o item some do menu. Itens SEM `domain` são sempre visíveis.
   * A barreira real é server-side (`require_domain` nos routers sensíveis).
   */
  domain?: string;
  /**
   * M3 — quando true, o item só aparece com dev-mode (vendor) ativo
   * (`principal.dev_mode?.enabled`). Usado pelo item "Dev".
   */
  devOnly?: boolean;
}

/**
 * Seções colapsáveis (todas exceto `top`, que não tem header). A ordem
 * deste array é a ordem de render no sidenav.
 */
export const CP_NAV_SECTIONS: { key: Exclude<NavSection, 'top'>; label: string }[] = [
  { key: 'acesso', label: 'Acesso' },
  { key: 'operacional', label: 'Operacional' },
  { key: 'ia', label: 'IA & Automação' },
  { key: 'catalogo', label: 'Catálogo' },
  { key: 'dados', label: 'Dados' },
  { key: 'sistema', label: 'Sistema' },
];

// Exportado para a página /painel-de-controle/dev (customização de
// visibilidade dos itens pelo vendor). Os literais são fallback; `t('nav.<id>')`
// é a fonte real do label.
export const CP_NAV_ITEMS: NavItem[] = [
  // ─── (top) — Início · Aprovações · (Buscar é o CpTopSearch ⌘J) ─────────
  { id: 'home', label: 'Início', href: '/painel-de-controle', icon: 'home', section: 'top' },
  { id: 'aprovacoes', label: 'Aprovações', href: '/painel-de-controle/aprovacoes', icon: 'check-circle', section: 'top' },

  // ─── Acesso ────────────────────────────────────────────────────────────
  // Fase 4 IA: "Convidados" virou aba (CpHubSubnav) do hub "Organizações"
  // [Organizações | Convidados]. Rota /convidados preservada.
  // LOTE1 ELO NAV&HUBS (#4): "Grupos" e "Acessos públicos" SAÍRAM de Acesso —
  // viraram abas do hub "Acesso e Identidade" (IDENTIDADE_TABS, app/iam/layout).
  // Rotas /grupos e /acessos-publicos preservadas; abas espelham as perms.
  { id: 'organizacoes', label: 'Organizações', href: '/painel-de-controle/organizacoes', icon: 'building-2', section: 'acesso' },
  { id: 'espacos', label: 'Espaços', href: '/painel-de-controle/espacos', icon: 'layers', section: 'acesso' },
  // FIX ELO IAM (#2, 2026-06-28): o hub IAM (Equipe/Grupos/Papéis/Permissões/
  // Acessos públicos/Auditoria) VOLTA para a seção "Acesso" (não há mais uma
  // seção própria "Identidade"/"Acesso e Identidade" — ela ficava sozinha e
  // duplicava o rótulo). Label do item conciso = "Identidade" (lido como
  // "Acesso › Identidade"). href = /iam/equipe (1ª aba do hub); rota + abas
  // (IDENTIDADE_TABS, app/iam/layout) preservadas; active-state via NAV_CLUSTERS.
  { id: 'identidade', label: 'Identidade', href: '/iam/equipe', icon: 'users', section: 'acesso' },

  // ─── Operacional ─────────────────────────────────────────────────────────
  // Fase 4 IA: "Tours" virou aba (CpHubSubnav) de Salas [Salas | Tours]; e
  // "Cenários de App" virou aba de Cenários [Ontologia | Apps] — backends
  // diferentes, só a navegação unifica. Rotas /tours e /cenarios-app preservadas.
  { id: 'operacoes', label: 'Operações', href: '/painel-de-controle/operacoes', icon: 'folder-search', section: 'operacional' },
  { id: 'salas', label: 'Salas', href: '/painel-de-controle/salas', icon: 'layout-dashboard', section: 'operacional' },
  { id: 'scenarios', label: 'Cenários', href: '/painel-de-controle/scenarios', icon: 'git-fork', section: 'operacional', perm: 'ontology.objects.write' },
  // Backlog #6b: hub "Comunicação operacional" — Comunicados (broadcasts
  // operacionais, app_shell.manage) + Rotas de alerta (roteamento de
  // notificações, alerts.routes.view) eram dois itens-irmãos soltos; viram abas
  // (CpHubSubnav, route group) de UM item. href = /comunicados (1ª aba, landing
  // default); perm = app_shell.manage (perm da landing). Rotas /comunicados e
  // /alertas preservadas; cada aba respeita sua perm na barra.
  // LOTE1 ELO NAV&HUBS (#3): label do item renomeado para "Alertas" (id/href/
  // tabs preservados — href segue /comunicados, 1ª aba do hub). A barra do hub
  // (route group) mantém o group "Comunicação operacional" internamente.
  { id: 'comunicacao-operacional', label: 'Alertas', href: '/painel-de-controle/comunicados', icon: 'megaphone', section: 'operacional', perm: 'app_shell.manage' },

  // LOTE1 ELO NAV&HUBS (#7): a seção "Marcações" foi dissolvida — Vocabulário e
  // Por propriedade serão abas dentro do hub "Dados" (tratado no elo Pages).
  // Rotas /marcacoes e /marcacoes-propriedade preservadas (deep-link).

  // ─── IA & Automação ──────────────────────────────────────────────────────
  // Fase 4 IA: o editor de Funções (logic-editor, ex-"Análises") virou aba
  // (CpHubSubnav) do hub "Análise" [Explorar | Funções av.] — resolve o clash
  // "Análise" × "Análises". Rota /logic-editor preservada (deep-link).
  { id: 'acoes', label: 'Ações', href: '/painel-de-controle/acoes', icon: 'zap', section: 'ia', perm: 'ontology.actions.read' },
  // W8 (2026-06-28): "Soluções" (Desenho da Operação / AIP Arquiteto) SAIU do
  // shell do Painel de Controle — virou Página modular app_route servida no
  // shell do OPERADOR (/paginas/solutions/view), na seção dinâmica "Aplicações"
  // do sidenav. Removida daqui pra não duplicar a entrada.
  { id: 'analise', label: 'Análise', href: '/painel-de-controle/analise', icon: 'bar-chart-3', section: 'ia', perm: 'ontology.objects.read' },
  // Fase 4 IA: Roteiros (pilots) + Rotinas (autopilot) viraram abas (CpHubSubnav)
  // do hub "Automação" [Roteiros | Rotinas]. Rotas /pilots e /autopilot vivas.
  { id: 'automacao', label: 'Automação', href: '/painel-de-controle/pilots', icon: 'route', section: 'ia', perm: 'ontology.actions.execute' },

  // ─── Catálogo (Apps = catálogo; entry point do editor 3-pane /workshop/edit) ──
  // Fase 4 IA: Modelos · Memória · Conversas (AIP) viraram abas (CpHubSubnav) do
  // hub "Agentes" [Agentes | Modelos | Memória | Conversas]. Rotas /aip-* vivas.
  { id: 'apps', label: 'Apps', href: '/workshop', icon: 'box', section: 'catalogo' },
  // FIX #3 (2026-06-28): "Páginas" (registry de rotas operacionais do tenant) era
  // só uma aba do hub "Personalização" (Sistema) — virou item de 1ª classe no
  // Catálogo, entre Apps e Ontologia (lê-se "Catálogo › Apps › Páginas →
  // Ontologia": superfícies montáveis perto do modelo de dados). A página
  // /painel-de-controle/paginas vira destino próprio (saiu o CpHubSubnav);
  // acende por prefixo via isActive. Perm = workspace.publish (espelha o
  // RequirePerm da page). Ícone `file-stack` (já registrado, antes ocioso).
  { id: 'paginas', label: 'Páginas', href: '/painel-de-controle/paginas', icon: 'file-stack', section: 'catalogo', perm: 'workspace.publish' },
  // W8 (2026-06-28): o hub "Agentes" (Conversas/Agentes/Memória) SAIU do shell
  // do Painel de Controle. "Conversas" (aip-threads) e "Agentes" (frota 24/7)
  // viraram Páginas modulares app_route servidas no shell do OPERADOR
  // (/paginas/aip-threads/view e /paginas/agentes/view), na seção dinâmica
  // "Aplicações" do sidenav. Removido daqui pra não duplicar a entrada.
  // Ontologia — explorador único (Fase 3 IA): Tipos · Instâncias · Grafo ·
  // Vizinhança + Editar (Avançado) viram abas (OntologiaTabs). Rotas antigas
  // seguem vivas p/ deep-link, fora do nav.
  { id: 'ontologia', label: 'Ontologia', href: '/ontologia/tipos', icon: 'boxes', section: 'catalogo', perm: 'security.ontologia.view' },

  // ─── Dados — Mapa do Workflow unificado (abas Mapa + Eventos) ─────────────
  { id: 'dados', label: 'Dados', href: '/painel-de-controle/dados', icon: 'database-zap', section: 'dados', anyPerm: DATA_NAV_ANYPERM },
  { id: 'linhagem', label: 'Linhagem', href: '/painel-de-controle/grafo', icon: 'git-branch', section: 'dados', perm: 'data.lineage.read' },

  // ─── Sistema ──────────────────────────────────────────────────────────────
  // Fase 4 IA: dois hubs por intenção (CpHubSubnav). "Personalização" reúne
  // Aparência + Layout do App + Páginas (todas workspace.publish); "Comunicação"
  // reúne Comunicações + Notificações (stub). Atividade · Browser · Plataforma ·
  // Loja · Conta seguem itens próprios (intenções/gating divergentes — não
  // forçamos o 3º hub do spec). Rotas /app-shell, /paginas, /notificacoes vivas.
  { id: 'personalizacao', label: 'Personalização', href: '/painel-de-controle/styles-configurator', icon: 'palette', section: 'sistema', perm: 'workspace.publish' },
  { id: 'comunicacao', label: 'Comunicação', href: '/painel-de-controle/comunicacoes', icon: 'mail', section: 'sistema' },
  { id: 'loja', label: 'Loja', href: '/painel-de-controle/loja', icon: 'library-big', section: 'sistema', perm: 'workspace.publish' },
  // LOTE1 ELO NAV&HUBS (#5): ícone `activity` (sério/operacional) — antes
  // `bar-chart-3`, que colidia com "Análise" (analise mantém bar-chart-3).
  { id: 'atividade', label: 'Atividade', href: '/painel-de-controle/atividade', icon: 'activity', section: 'sistema' },
  { id: 'browser', label: 'Browser', href: '/painel-de-controle/browser', icon: 'globe', section: 'sistema' },
  // M3 — Plataforma (Safe Core). Só aparece com dev-mode (vendor) ativo. Gate
  // real é server-side (require_vendor_dev_mode); aqui é higiene de UI. O label
  // "Plataforma" (era "Dev") evita o jargão e casa com a Conta; quando ativo
  // ganha um ponto verde de status (#5-sidenav), espelho do dot do rodapé.
  { id: 'dev', label: 'Plataforma', href: '/painel-de-controle/dev', icon: 'terminal', section: 'sistema', perm: 'vendor.dev_mode', devOnly: true },
  // #19 (2026-05-24): "Conta" — a página /painel-de-controle/conta existia sem
  // entrada no menu (operador não chegava nela p/ ativar dev-mode). Fica ao pé
  // de Sistema. Perm espelha o RequirePerm da página (security.configuracoes.view).
  { id: 'conta', label: 'Conta', href: '/painel-de-controle/conta', icon: 'user-cog', section: 'sistema', perm: 'security.configuracoes.view' },
];

export function ControlPanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // #8b — o active-state precisa da querystring atual: itens que compartilham
  // o mesmo pathname mas divergem por `?aba=` (Mapa do Workflow vs Eventos de
  // lineage) só podem acender o item realmente vigente. `useSearchParams()`
  // pode ser null (SSR / mocks), por isso o `?? ''`.
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const t = useT();
  const { principal } = useAuth();

  // #12 perm filter — espelha o `canSee` do sidenav global. Itens SEM
  // `perm` são sempre visíveis; itens COM `perm` exigem que o principal
  // tenha a permissão (admin short-circuita). Itens filtrados somem.
  //
  // M3 adiciona dois eixos cosméticos: `devOnly` (só com dev-mode ativo) e
  // `domain` (some quando o tenant tem allowed_domains e o domínio não está
  // liberado). Ambos são higiene de UI — a barreira real é server-side.
  const allowedDomains = principal?.tenant?.allowed_domains ?? [];
  const navHidden = principal?.tenant?.cp_nav_hidden ?? [];
  const devModeOn = !!principal?.dev_mode?.enabled;
  const canSee = React.useCallback(
    (item: Pick<NavItem, 'id' | 'perm' | 'anyPerm' | 'domain' | 'devOnly'>) => {
      if (!principal) return false;
      // dev-only: exige sessão dev-mode ativa (vendor).
      if (item.devOnly && !devModeOn) return false;
      // override do vendor: item escondido para o tenant (cosmético).
      // O próprio item "dev" nunca é escondido por aqui (evita auto-lockout).
      if (item.id !== 'dev' && navHidden.includes(item.id)) return false;
      // filtro de domínio (cosmético): lista não-vazia e domínio fora dela.
      if (
        item.domain &&
        allowedDomains.length > 0 &&
        !allowedDomains.includes(item.domain)
      ) {
        return false;
      }
      // Perm: ÚNICA ou QUALQUER-DE (anyPerm); admin short-circuita. Onda 0: o item
      // "Dados" usa anyPerm p/ aparecer a quem tem QUALQUER perm de dados (não só
      // data.datasets.read), espelhando o gating por-aba da página.
      return principalCanSeeNav(item, principal);
    },
    [principal, allowedDomains, navHidden, devModeOn],
  );

  // Seções começam abertas. Estado por chave de seção (colapsável).
  const [open, setOpen] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(CP_NAV_SECTIONS.map((s) => [s.key, true])),
  );

  // #8 (2026-05-24): colapso icons-only do sidenav interno, espelhando o
  // `useSidenav` da casca global (mesmo store/persist, chave própria). Default
  // `collapsed=false` → expandido em w-[220px] (preserva os testes de layout).
  const collapsed = useCpSidenav((s) => s.collapsed);

  const topItems = CP_NAV_ITEMS.filter((i) => i.section === 'top' && canSee(i));

  return (
    // Sprint H1.5: text-text-on-light explícito — body default é
    // text-text-on-dark (globals.css). Sem isso, textos das páginas
    // filhas herdam branco e somem em bg-canvas-light.
    <div className="h-full flex bg-canvas-light text-text-on-light overflow-hidden">
      <aside
        data-testid="cp-sidebar"
        data-collapsed={collapsed ? 'true' : 'false'}
        // Onda M1.c: 260 → 220px (#12 — labels curtos cabem em menos largura).
        // #8: anima UMA propriedade (width, 300ms ease-in-out) igual ao Sidenav
        // global; colapsado vira w-14 (icons-only).
        className={cn(
          'shrink-0 bg-white border-r border-border-light flex flex-col overflow-hidden',
          'transition-[width] duration-300 ease-in-out',
          collapsed ? 'w-14' : 'w-[220px]',
        )}
      >
        <CpSidebarHeader collapsed={collapsed} />
        <div className="flex-1 overflow-y-auto scrollbar-hide py-1">
          {topItems.map((it) => (
            <CpNavLink
              key={it.id}
              item={it}
              active={isActive(pathname, search, it.href)}
              collapsed={collapsed}
            />
          ))}
          {/* Buscar é um button-styled NavItem no top zone: Início /
              Aprovações / Buscar ⌘J. Dispara ⌘J. */}
          <CpTopSearch collapsed={collapsed} />
          {CP_NAV_SECTIONS.map((section) => {
            // #12 perm filter: itens da seção visíveis ao principal.
            const items = CP_NAV_ITEMS.filter(
              (it) => it.section === section.key && canSee(it),
            );
            // Seção inteira filtrada (sem itens visíveis) → não renderiza
            // o header (evita cabeçalho órfão).
            if (items.length === 0) return null;
            const isOpen = open[section.key] ?? true;
            return (
              <React.Fragment key={section.key}>
                {/* #8: colapsado esconde os headers de seção (igual ao Sidenav
                    global) e mostra todos os itens flush em coluna de ícones. */}
                {!collapsed && (
                  <CpSectionHeader
                    sectionKey={section.key}
                    label={translateNav(t, `nav.section.cp-${section.key}`, section.label)}
                    open={isOpen}
                    onToggle={() =>
                      setOpen((o) => ({ ...o, [section.key]: !(o[section.key] ?? true) }))
                    }
                  />
                )}
                {(collapsed || isOpen) &&
                  items.map((it) => (
                    <CpNavLink
                      key={it.id}
                      item={it}
                      active={isActive(pathname, search, it.href)}
                      indent
                      collapsed={collapsed}
                      // #5-sidenav: o item "Plataforma" (dev) ganha o ponto
                      // verde de status quando o dev-mode (vendor) está ativo.
                      statusOn={it.id === 'dev' && devModeOn}
                    />
                  ))}
              </React.Fragment>
            );
          })}
        </div>
        <CpSidebarFooter collapsed={collapsed} />
      </aside>
      <main className="flex-1 overflow-y-auto" data-testid="cp-content">
        {children}
      </main>
      <CpCommandPalette />
    </div>
  );
}

/**
 * Conjunto de chaves de query que DESAMBIGUAM itens de nav que dividem o
 * mesmo pathname. Hoje só `/painel-de-controle/grafo` tem dois itens
 * (Mapa do Workflow sem query · Eventos de lineage com `?aba=eventos`),
 * então a única chave relevante é `aba`. Derivado de CP_NAV_ITEMS para
 * permanecer correto se outro par href compartilhar pathname no futuro.
 */
function disambiguatingQueryKeys(path: string): string[] {
  const keys = new Set<string>();
  for (const it of CP_NAV_ITEMS) {
    const [p, q] = it.href.split('?');
    if (p === path && q) {
      for (const k of new URLSearchParams(q).keys()) keys.add(k);
    }
  }
  return [...keys];
}

/**
 * #8b — active-state ciente da querystring.
 *
 * O pathname sozinho não distingue itens como "Mapa do Workflow"
 * (`/painel-de-controle/grafo`) e "Eventos de lineage"
 * (`/painel-de-controle/grafo?aba=eventos`) — ambos compartilham o mesmo
 * path, então marcar por prefixo de pathname acendia OS DOIS. Aqui:
 *
 *   1. gate de pathname (Início é match exato; demais aceitam aninhamento);
 *   2. gate de query: para cada chave que desambigua itens nesse pathname
 *      (ex.: `aba`), o valor declarado pelo href (ou ausência) precisa bater
 *      com a URL atual. Assim só o item vigente acende.
 *
 * O `?cp=1` que `CpNavLink` anexa a hrefs externos é ignorado: ele nunca é
 * uma chave desambiguadora (itens externos não compartilham pathname com um
 * sibling de query distinta), então não entra no gate.
 */
// Hubs da Fase 3/4 da consolidação de IA: UM item de sidenav cobre várias
// rotas-irmãs (que viram abas via OntologiaTabs/CpHubSubnav). O item acende em
// qualquer rota do seu cluster. `href` é o destino do item; `routes` são os
// prefixos que o mantêm ativo (match exato-ou-mais-profundo). Adicionar um hub
// novo = uma entrada aqui + remover os itens-irmãos de CP_NAV_ITEMS.
const NAV_CLUSTERS: { href: string; routes: string[] }[] = [
  // Ontologia (Fase 3): Tipos/Instâncias/Grafo/Vizinhança + Editar (Avançado).
  { href: '/ontologia/tipos', routes: ['/ontologia', '/painel-de-controle/tipos-editor'] },
  // LOTE1 ELO NAV&HUBS (#7): o cluster "Marcações" foi removido (a seção saiu
  // da sidenav). Vocabulário/Por propriedade viram abas do hub "Dados" no elo
  // Pages; o active-state migra junto. Rotas /marcacoes* seguem vivas.
  // Organizações (Fase 4): Organizações + Convidados.
  { href: '/painel-de-controle/organizacoes', routes: ['/painel-de-controle/organizacoes', '/painel-de-controle/convidados'] },
  // Acesso e Identidade (Fase 4 + LOTE1 #4): Equipe + Papéis + Permissões +
  // Auditoria (/iam/*) + Grupos + Acessos públicos (rotas do painel que viraram
  // abas do hub). O item único acende em todas essas rotas.
  { href: '/iam/equipe', routes: ['/iam', '/painel-de-controle/grupos', '/painel-de-controle/acessos-publicos'] },
  // Salas (Fase 4): Salas + Tours.
  { href: '/painel-de-controle/salas', routes: ['/painel-de-controle/salas', '/painel-de-controle/tours'] },
  // Comunicação operacional (Backlog #6b): Comunicados + Rotas de alerta.
  { href: '/painel-de-controle/comunicados', routes: ['/painel-de-controle/comunicados', '/painel-de-controle/alertas'] },
  // Cenários (Fase 4): Ontologia (scenarios) + Apps (cenarios-app).
  { href: '/painel-de-controle/scenarios', routes: ['/painel-de-controle/scenarios', '/painel-de-controle/cenarios-app'] },
  // Personalização (Fase 4): Aparência + Layout do App. FIX #3 (2026-06-28):
  // /painel-de-controle/paginas saiu deste cluster — "Páginas" virou item de 1ª
  // classe no Catálogo (CP_NAV_ITEMS, id 'paginas'), que acende por prefixo. Sem
  // isso, Personalização e Páginas acenderiam juntas em /paginas.
  { href: '/painel-de-controle/styles-configurator', routes: ['/painel-de-controle/styles-configurator', '/painel-de-controle/app-shell'] },
  // Comunicação (Fase 4): Comunicações + Notificações.
  { href: '/painel-de-controle/comunicacoes', routes: ['/painel-de-controle/comunicacoes', '/painel-de-controle/notificacoes'] },
  // Automação (Fase 4): Roteiros (pilots) + Rotinas (autopilot).
  { href: '/painel-de-controle/pilots', routes: ['/painel-de-controle/pilots', '/painel-de-controle/autopilot'] },
  // Análise (Fase 4): Explorar (analise) + Funções (logic-editor).
  { href: '/painel-de-controle/analise', routes: ['/painel-de-controle/analise', '/painel-de-controle/logic-editor'] },
  // Dados (Onda 2 · Tela de Dados 3-pane): o item "Dados" acende no hub /dados E
  // nas rotas-irmãs da camada de dados (deep-links/redirects). O cluster torna o
  // active-state baseado em ROTA — o deep-link ?board=&node=&ds=&aba= não interfere.
  { href: '/painel-de-controle/dados', routes: ['/painel-de-controle/dados', '/painel-de-controle/conectores', '/painel-de-controle/datasets', '/painel-de-controle/media', '/painel-de-controle/marcacoes', '/painel-de-controle/marcacoes-propriedade'] },
];

function isActive(pathname: string, search: string, href: string) {
  if (!href) return false;
  const [path, hrefQuery = ''] = href.split('?');
  const cluster = NAV_CLUSTERS.find((c) => c.href === path);
  if (cluster) {
    return cluster.routes.some((r) => pathname === r || pathname.startsWith(r + '/'));
  }
  // Gate de pathname.
  if (path === '/painel-de-controle') {
    if (pathname !== path) return false;
  } else if (!(pathname === path || pathname.startsWith(path + '/'))) {
    return false;
  }
  // Gate de query: só as chaves que de fato desambiguam itens nesse pathname.
  const keys = disambiguatingQueryKeys(path);
  if (keys.length === 0) return true;
  const hrefParams = new URLSearchParams(hrefQuery);
  const curParams = new URLSearchParams(search);
  for (const k of keys) {
    // Ausência e string vazia são equivalentes (aba=mapa é o default sem query).
    if ((hrefParams.get(k) ?? '') !== (curParams.get(k) ?? '')) return false;
  }
  return true;
}

/**
 * Sprint H1.4 (2026-05-22): anexa ?cp=1 a hrefs que escapam do escopo
 * /painel-de-controle/*. AuthShell detecta esse marker e envelopa a
 * destino no ControlPanelShell (sidebar persiste). Hrefs internos do
 * painel já são gerenciados pelo layout do painel — não precisam do
 * marker.
 */
function decorateHref(href: string): string {
  if (!href) return href;
  if (href.startsWith('/painel-de-controle')) return href;
  return href.includes('?') ? `${href}&cp=1` : `${href}?cp=1`;
}

function CpSidebarHeader({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  const brand = useBrand();
  // Missão brand (2026-07-09) — nome/logo do tenant em vez do literal
  // "AEGIS"/"/logo-white.svg" hardcoded; este é o sidenav que o operador vê
  // o tempo todo dentro do Painel de Controle.
  const wordmark = brand.company_name || brand.pwa_short_name || 'AEGIS';
  const logoSrc = brand.logo_url || '/logo-white.svg';
  const toggleCollapsed = useCpSidenav((s) => s.toggle);
  const [showSwitcher, setShowSwitcher] = React.useState(false);
  const [ctx, setCtx] = React.useState<{
    organization_name: string;
    space_name: string | null;
    project_name: string | null;
  } | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    import('@/lib/api').then(({ MeContextApi }) =>
      MeContextApi.get()
        .then((c) => {
          if (cancelled) return;
          setCtx({
            organization_name: c.organization_name,
            space_name: c.space_name,
            project_name: c.project_name,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setCtx({ organization_name: 'AEGIS', space_name: null, project_name: null });
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return (
    <div className="border-b border-border-light">
      <div
        className={cn(
          'h-12 flex items-center gap-2 border-b border-border-light',
          // #8: colapsado centraliza o logo + o botão na coluna estreita.
          collapsed ? 'px-2 justify-center' : 'px-3',
        )}
        data-testid="cp-sidebar-header"
      >
        {/* logo-white.svg é desenhado com fills branco/preto; invertido
            o branco vira preto e aparece no bg claro do painel. Um logo
            customizado do tenant (brand.logo_url) NÃO leva o filtro —
            inverter cores arbitrárias do upload do operador ficaria errado.
            #1 (2026-05-24): no modo colapsado o LOGO também some — a coluna
            estreita fica essencialmente só com o toggle de expandir (sem logo,
            sem wordmark), espelhando o brand-zone enxuto da casca colapsada. */}
        {!collapsed && (
          <Image
            src={logoSrc}
            alt=""
            width={18}
            height={18}
            className={cn('shrink-0', !brand.logo_url && 'invert')}
            unoptimized={!!brand.logo_url}
            priority
          />
        )}
        {/* #8: o wordmark + subtítulo é renderizado condicionalmente
            (igual ao BrandLink da casca global) — some no modo colapsado. */}
        {!collapsed && (
          <span className="flex flex-col leading-none gap-0.5 min-w-0 flex-1">
            <span
              data-testid="cp-sidebar-brand-name"
              className="text-[13px] font-semibold tracking-[0.18em] text-text-on-light truncate"
            >
              {wordmark}
            </span>
            <span className="text-[10px] text-muted-on-light truncate">
              {t('cp.backToPanel')}
            </span>
          </span>
        )}
        {/* #8: toggle de colapso, espelho do `sidenav-toggle` da casca global
            (PanelLeftClose/Open + aria-label/title traduzidos + aria-expanded).
            Quando expandido fica no canto direito da linha do logo. */}
        <button
          type="button"
          data-testid="cp-sidebar-collapse"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t('cp.expand') : t('cp.collapse')}
          aria-expanded={!collapsed}
          title={collapsed ? t('cp.expand') : t('cp.collapse')}
          className={cn(
            'w-6 h-6 flex items-center justify-center text-muted-on-light hover:text-text-on-light transition-colors shrink-0',
            !collapsed && 'ml-auto',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <PanelLeftClose className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setShowSwitcher(true)}
        className={cn(
          'w-full py-2 flex items-center gap-2 text-[12px] hover:bg-canvas-light transition-colors text-left',
          // #8: colapsado mostra só o ícone do contexto, centralizado.
          collapsed ? 'px-2 justify-center' : 'px-3',
        )}
        data-testid="cp-org-switcher"
        aria-label="Trocar contexto (Organização · Espaço · Operação)"
        title={collapsed ? (ctx?.organization_name ?? 'AEGIS') : undefined}
      >
        <span className="inline-flex w-5 h-5 items-center justify-center bg-canvas-light border border-border-light shrink-0">
          <Workflow className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-text-on-light truncate">
                {ctx?.organization_name ?? 'AEGIS'}
              </span>
              {(ctx?.space_name || ctx?.project_name) && (
                <span className="block text-[10px] text-muted-on-light font-mono truncate">
                  {[ctx?.space_name, ctx?.project_name].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-on-light shrink-0">
              Trocar
            </span>
          </>
        )}
      </button>
      {showSwitcher && (
        <CpContextSwitcher
          onClose={() => setShowSwitcher(false)}
          onSwitched={() => setTick((t) => t + 1)}
        />
      )}
    </div>
  );
}

/**
 * "Buscar" como item do top zone (espelho exato da Foundry: terceiro
 * item depois de Home/Approvals, com ⌘J no canto direito). Dispara o
 * mesmo evento de teclado que abre o CpCommandPalette.
 */
function CpTopSearch({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  const label = translateNav(t, 'nav.search', 'Buscar');
  return (
    <button
      type="button"
      data-testid="cp-nav-search"
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'group w-full h-8 flex items-center gap-2 text-[12px] text-text-on-light hover:bg-canvas-light transition-colors',
        collapsed ? 'px-0 justify-center' : 'px-3',
      )}
      onClick={() => {
        const ev = new KeyboardEvent('keydown', { key: 'j', metaKey: true, bubbles: true });
        window.dispatchEvent(ev);
      }}
    >
      <Search className="w-4 h-4 shrink-0" strokeWidth={1.5} />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{label}</span>
          <kbd className="text-[10px] font-mono text-muted-on-light/70">⌘J</kbd>
        </>
      )}
    </button>
  );
}

function CpSectionHeader({
  sectionKey,
  label,
  open,
  onToggle,
}: {
  sectionKey: string;
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  if (!label) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={`cp-section-${sectionKey}`}
      aria-expanded={open}
      className="w-full h-7 px-3 mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold hover:text-text-on-light transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {open ? (
        <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
      ) : (
        <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
      )}
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

function CpNavLink({
  item,
  active,
  indent = false,
  collapsed = false,
  statusOn = false,
}: {
  item: NavItem;
  active: boolean;
  indent?: boolean;
  collapsed?: boolean;
  /**
   * #5-sidenav — quando true, anexa um ponto verde de status (espelho do dot
   * "conectado" do rodapé) sinalizando que se trata de um modo privilegiado
   * ATIVO (não um botão qualquer). Hoje só o item "Plataforma" (dev-mode) usa.
   */
  statusOn?: boolean;
}) {
  const t = useT();
  const Icon = ICON_MAP[item.icon];
  // Label traduzido por id estável (`nav.<id>`). O literal de `item.label`
  // é o fallback gracioso — `t()` devolve a key se faltar tradução.
  const label = translateNav(t, `nav.${item.id}`, item.label);
  const statusLabel = t('cp.devActive');
  return (
    <Link
      href={decorateHref(item.href)}
      data-testid={`cp-nav-${item.id}`}
      aria-current={active ? 'page' : undefined}
      // #8: colapsado expõe o label via title/aria-label (hover) já que o
      // texto some — igual ao Sidenav global. Com status ativo, anexa o estado
      // ao label acessível (ex.: "Plataforma · Ativo").
      title={collapsed ? (statusOn ? `${label} · ${statusLabel}` : label) : undefined}
      aria-label={collapsed ? (statusOn ? `${label} · ${statusLabel}` : label) : undefined}
      className={cn(
        'group w-full h-8 flex items-center gap-2 text-[12px] transition-colors relative',
        // #8: colapsado ignora a indentação e centraliza o ícone.
        collapsed ? 'justify-center px-0' : indent ? 'pl-7 pr-3' : 'px-3',
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-text-on-light hover:bg-canvas-light',
      )}
    >
      {active && <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />}
      <span className="relative shrink-0 inline-flex">
        <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
        {/* Colapsado: o label some, então o ponto vira um badge sobre o ícone
            (canto superior direito) — o sinal de "privilégio ativo" sobrevive. */}
        {statusOn && collapsed && (
          <span
            data-testid={`cp-nav-${item.id}-status`}
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-success ring-1 ring-white"
          />
        )}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
      {/* Expandido: ponto verde à direita do label (espelho exato do dot
          "conectado" do rodapé — w-1.5 h-1.5 bg-success). */}
      {statusOn && !collapsed && (
        <span
          data-testid={`cp-nav-${item.id}-status`}
          title={statusLabel}
          aria-label={statusLabel}
          className="ml-auto w-1.5 h-1.5 bg-success shrink-0"
        />
      )}
    </Link>
  );
}

/**
 * Resolve uma chave de navegação com fallback literal: `t()` devolve a
 * própria key quando a tradução falta, então caímos no literal histórico
 * pra nunca exibir "nav.foo" cru ao operador.
 */
function translateNav(
  t: (key: string) => string,
  key: string,
  fallback: string,
): string {
  const out = t(key);
  return out === key ? fallback : out;
}

function CpSidebarFooter({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const t = useT();
  const isExternalCpMode = !pathname.startsWith('/painel-de-controle');

  // Sprint H1.7: clear explícito do cookie aegis_cp ao sair do painel
  // pra /. O AuthShell já limpa via useEffect quando renderiza rota
  // não-painel/não-cp-linked, mas explícito no click evita race com
  // o roteamento (a chamada de write ocorre antes da navegação).
  const handleVoltarAegis = () => {
    if (typeof document !== 'undefined') {
      document.cookie = 'aegis_cp=; path=/; max-age=0; samesite=lax';
    }
  };

  // Onda M1.c: o seletor de idioma (LocalePicker) migrou pra
  // /painel-de-controle/conta. O rodapé fica só com Ajuda + Voltar.
  // #8: colapsado vira coluna de ícones; o label vai pra title (hover).
  const rowClass = cn(
    'w-full h-8 flex items-center gap-2 text-[12px] text-text-on-light hover:bg-canvas-light',
    collapsed ? 'px-0 justify-center' : 'px-3',
  );
  const helpLabel = t('cp.help');
  const backLabel = isExternalCpMode ? t('cp.backToPanel') : t('cp.backToAegis');

  return (
    <div className="border-t border-border-light py-1">
      <Link
        href="/docs?section=painel-de-controle"
        className={rowClass}
        data-testid="cp-footer-help"
        title={collapsed ? helpLabel : undefined}
        aria-label={collapsed ? helpLabel : undefined}
      >
        <HelpCircle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
        {!collapsed && <span className="flex-1 text-left">{helpLabel}</span>}
      </Link>
      {/* Sprint H1.4: em rota externa (?cp=1) o back volta pra Home do
          painel; dentro do painel volta pra raiz do AEGIS. */}
      {isExternalCpMode ? (
        <Link
          href="/painel-de-controle"
          className={rowClass}
          data-testid="cp-footer-back"
          title={collapsed ? backLabel : undefined}
          aria-label={collapsed ? backLabel : undefined}
        >
          <ChevronLeft className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          {!collapsed && <span className="flex-1 text-left">{backLabel}</span>}
        </Link>
      ) : (
        <Link
          href="/"
          onClick={handleVoltarAegis}
          className={rowClass}
          data-testid="cp-footer-back"
          title={collapsed ? backLabel : undefined}
          aria-label={collapsed ? backLabel : undefined}
        >
          <ArrowUpRight className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          {!collapsed && <span className="flex-1 text-left">{backLabel}</span>}
        </Link>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Header utility: title + subtitle (+ optional actions slot)                  */
/* Sprint H1.5 (2026-05-22): settingKey + Star favorite removidos com o       */
/* delete da feature FAVORITAS.                                                */
/* -------------------------------------------------------------------------- */
export function CpPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-5 border-b border-border-light bg-white flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <h1 className="text-[18px] font-semibold text-text-on-light truncate">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-muted-on-light">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
