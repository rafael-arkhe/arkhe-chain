'use client';

/**
 * /painel-de-controle/app-shell — Wave E.1 (2026-05-23).
 *
 * Composer 3-pane do "Layout do App". Espelha o slot que o Foundry chama
 * de "App Shell Configurator" (interno; nunca aparece na UI por
 * `feedback_no_palantir_product_names`).
 *
 * Layout (Palantir sharp):
 *   ┌────────┬────────────────────────────────┬───────────────┐
 *   │ 7 tabs │   Preview (live)               │  Inspector    │
 *   │ 260px  │   PreviewAppShellProvider      │  340px        │
 *   │        │   wraps a rota dummy: Home     │  formulário   │
 *   │        │   real é re-mount per change.  │  por tab      │
 *   └────────┴────────────────────────────────┴───────────────┘
 *
 * Persistência: PUT /platform/v23/app-shell/me (scope=me) ou
 * PUT /platform/v23/app-shell/tenant (scope=tenant — workspace.publish).
 *
 * Perm: workspace.publish (a página inteira). Operador sem perm
 * ainda assim pode usar a UI mas qualquer save bate 403.
 *
 * Memórias honradas:
 *   - feedback_no_localstorage_for_persistence · backend é único storage.
 *   - feedback_no_rounded_no_sparkles · zero rounded-*, zero Sparkles.
 *   - feedback_no_emojis_in_ui · zero emoji.
 *   - feedback_no_palantir_product_names · "Layout do App" em todos os labels.
 *   - feedback_workshop_edit_palantir_quality · 3-pane com paleta + canvas + inspector.
 */
import * as React from 'react';
import {
  Layout,
  Save,
  Shield,
  PanelTop,
  PanelLeft,
  Home,
  PanelBottom,
  ArrowRightLeft,
  Palette as PaletteIcon,
  Trash2,
  Plus,
  AlertCircle,
  Store,
  KeyRound,
  Clock,
  Minus,
  Users,
  ExternalLink,
  GripVertical,
  RotateCcw,
  ArrowLeftRight,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/provider';
import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { PERSONALIZACAO_TABS } from '@/components/control-panel/hub-tabs';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { Header } from '@/components/shell/header';
import { Footer } from '@/components/shell/footer';
import { Sidenav } from '@/components/shell/sidenav';
import { ClassificationBanner } from '@/components/shell/classification-banner';
import { Button } from '@/components/ui/button';
import { ConfirmProvider, useConfirm } from '@/components/dialog/confirm-dialog';
import { cn } from '@/lib/cn';
import {
  AppShell as AppShellApi,
  Marketplace,
  Workspaces,
  Iam,
  Pages,
  Styles,
  type RegisteredPage,
  type AppShellConfig,
  type AppShellBannerConfig,
  type AppShellFooterConfig,
  type AppShellUserMenuConfig,
  type AppShellSidenavConfig,
  type AppShellLoginConfig,
  type AppShellFooterStatusItem,
  type AppShellUserMenuItem,
  type AppShellSidenavGroup,
  type AppShellAppsMenuConfig,
  type AppShellAppMenuPosition,
  type MarketplaceProductRich,
  type MarketplaceInstall,
  type Workspace,
  type IamRole,
} from '@/lib/api';
import { useAppShell } from '@/lib/app-shell/use-app-shell';
import {
  DEFAULT_APP_SHELL,
  DEFAULT_SIDENAV_GROUPS,
  DEFAULT_USER_MENU_ITEMS,
} from '@/lib/app-shell/defaults';
import { PreviewAppShellProvider } from '@/lib/app-shell/preview-provider';
import { useNavTree } from '@/lib/use-nav-tree';
import { useAuth } from '@/lib/auth/useAuth';
import { useBrand } from '@/components/shell/brand-context';
// Onda I.2 (2026-05-23) — subcomponentes de refinement.
// Onda K.4 (2026-05-23) — RouteSelect/PermSelect (dropdowns que substituem
// inputs de texto livre de href/perm-key — Feedback #4 + #10).
import {
  UserMenuPreview,
  FullscreenToggle,
  SortableList,
  SortableRow,
  RouteSelect,
  PermSelect,
} from '@/components/app-shell-editor';

type TabKey =
  | 'banner'
  | 'navbar'
  | 'sidenav'
  | 'homepage'
  | 'footer'
  | 'user-menu'
  | 'context'
  | 'theme'
  | 'login'
  | 'marketplace'
  | 'permissions';

interface Tab {
  key: TabKey;
  /** i18n key resolved via useT() at render (feedback_ui_english_only). */
  labelKey: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const TABS: Tab[] = [
  // Wave H.4.Y — Banner extendido
  { key: 'banner', labelKey: 'appshell.tabBanner', icon: Shield },
  { key: 'navbar', labelKey: 'appshell.tabNavbar', icon: PanelTop },
  // Wave H.4.Y — Sidenav editor com groups
  { key: 'sidenav', labelKey: 'appshell.tabSidenav', icon: PanelLeft },
  // Wave H.4.Y — Página inicial = atalho para editor de Pages
  { key: 'homepage', labelKey: 'appshell.tabHomepage', icon: Home },
  // Wave H.4.Y — Rodapé editor com status bar dinâmica
  { key: 'footer', labelKey: 'appshell.tabFooter', icon: PanelBottom },
  // Wave H.4.Y — Menu do usuário editor
  { key: 'user-menu', labelKey: 'appshell.tabUserMenu', icon: Users },
  { key: 'context', labelKey: 'appshell.tabContext', icon: ArrowRightLeft },
  { key: 'theme', labelKey: 'appshell.tabTheme', icon: PaletteIcon },
  // M2 (2026-05-24) — personalização da tela de login (marca do tenant).
  { key: 'login', labelKey: 'appshell.tabLogin', icon: LogIn },
  // Wave F.1 — R2 extras/marketplace.md
  { key: 'marketplace', labelKey: 'appshell.tabMarketplace', icon: Store },
  // Wave F.1 — R2 permissions/{default-workspace,landing-page}.md
  { key: 'permissions', labelKey: 'appshell.tabPermissions', icon: KeyRound },
];

/**
 * Onda K.4 (Feedback #2) — semeia os defaults canônicos no EDITOR quando o
 * backend devolve seções vazias. NÃO muta a entrada.
 *
 *   - sidenav.groups vazio (e sem sections legacy) → grupos default
 *     (Operação · Análise · Conteúdo, derivados do FALLBACK_NAV).
 *   - user_menu.items vazio → itens default (Configurações · Auditoria · Sair).
 *
 * O shell RENDERIZADO já cai no mesmo fallback (tree / UserMenuFallback);
 * isto garante que o EDITOR mostre os itens como antes, prontos pra editar
 * ou restaurar.
 */
function withEditorDefaults(
  config: AppShellConfig,
  /**
   * Grupos VIVOS do nav deste tenant (useNavTree): FALLBACK_NAV + as Páginas
   * registradas com `experience_kind` (Conversas, Agentes, Soluções,
   * Construtor de Camadas…) + "Meus Apps". Sem isto o editor semeava uma
   * lista HARDCODED que não conhecia as páginas do tenant — o operador abria
   * o app-shell, salvava, e os itens dinâmicos sumiam do menu porque
   * `sidenav.groups` SUBSTITUI a árvore. Ausente = cai na constante.
   */
  gruposVivos?: AppShellSidenavGroup[],
  /**
   * `cp_nav_hidden` do tenant (override do vendor — MESMA fonte que o shell
   * renderizado filtra). O editor precisa enxergar o menu EFETIVO: sem este
   * filtro, um save semeava os itens escondidos (Buscar/Mapa/Conversas…) nos
   * `sidenav.groups`, e o shell — que usa groups NO LUGAR da árvore filtrada —
   * reabilitava tudo. Era o "salvo e a sidenav volta cheia" do vertical.
   */
  navHidden: string[] = [],
): AppShellConfig {
  const visivel = (key: string) => !navHidden.includes(key);
  const sidenav = config.sidenav ?? DEFAULT_APP_SHELL.sidenav;
  // Grupos JÁ salvos: filtra os itens que o vendor escondeu (o que sobra é o
  // menu efetivo; o draft passa a refletir o que o shell desenha).
  const gruposSalvos = (sidenav.groups ?? []).map((g) => ({
    ...g,
    items: g.items.filter((it) => visivel(it.key)),
  }));
  const hasGroups = (sidenav.groups ?? []).length > 0;
  const hasSections = (sidenav.sections ?? []).length > 0;
  const userMenuItems = config.user_menu?.items ?? [];
  const base = (gruposVivos && gruposVivos.length > 0
    ? gruposVivos
    : DEFAULT_SIDENAV_GROUPS
  )
    .map((g) => ({ ...g, items: g.items.filter((it) => visivel(it.key)) }))
    // Grupo que ficou sem itens visíveis some (mesma regra do useNavTree) —
    // assim o editor mostra o menu efetivo em qualquer ordem de hidratação.
    .filter((g) => g.items.length > 0);
  // Config JÁ salva pelo operador: preserva a organização dele, mas ANEXA os
  // itens que existem no menu vivo e ainda não estão em grupo nenhum (uma
  // Página nova instalada pela Loja, por exemplo). Sem isto o editor mostrava
  // um menu defasado — e salvar apagava do sidenav o item recém-instalado,
  // porque `sidenav.groups` SUBSTITUI a árvore.
  const mesclado = (salvos: AppShellSidenavGroup[]): AppShellSidenavGroup[] => {
    const conhecidos = new Set(salvos.flatMap((g) => g.items.map((i) => i.key)));
    const faltantes = base.flatMap((g) =>
      g.items.filter((i) => !conhecidos.has(i.key)).map((i) => ({ grupo: g.key, item: i })),
    );
    if (faltantes.length === 0) return salvos;
    const out = salvos.map((g) => ({ ...g, items: [...g.items] }));
    for (const { grupo, item } of faltantes) {
      const alvo = out.find((g) => g.key === grupo) ?? out[0];
      if (alvo) alvo.items.push({ ...item });
    }
    return out;
  };
  return {
    ...config,
    sidenav: {
      ...sidenav,
      groups:
        hasGroups || hasSections
          ? mesclado(gruposSalvos)
          : base.map((g) => ({
              ...g,
              items: g.items.map((it) => ({ ...it })),
            })),
    },
    user_menu: {
      items:
        userMenuItems.length > 0
          ? userMenuItems
          : DEFAULT_USER_MENU_ITEMS.map((it) => ({ ...it })),
    },
  };
}

export default function AppShellComposerPage() {
  return (
    <RequirePerm perm="workspace.publish">
      <ConfirmProvider>
        <ComposerInner />
      </ConfirmProvider>
    </RequirePerm>
  );
}

function ComposerInner() {
  const t = useT();
  const { config: loaded, source, loading, error } = useAppShell();
  // Vendor (Onda 0 Safe Tag): o editor também enxerga o menu EFETIVO — o
  // mesmo `cp_nav_hidden` que o shell usa para filtrar. Sem isto o draft era
  // semeado com os itens escondidos e o save os persistia em
  // `sidenav.groups`, reabilitando-os (groups SUBSTITUEM a árvore).
  const { principal } = useAuth();
  const navHidden = React.useMemo(
    () => principal?.tenant?.cp_nav_hidden ?? [],
    [principal],
  );
  // Onda K.4 (Feedback #2) — draft inicial já semeado com os defaults do
  // editor (grupos + menu) para casar com `seeded` desde o 1º render e
  // não disparar `dirty` antes da hidratação.
  const [draft, setDraft] = React.useState<AppShellConfig>(() =>
    withEditorDefaults(DEFAULT_APP_SHELL, undefined, navHidden),
  );
  const [tab, setTab] = React.useState<TabKey>('banner');
  const [scope, setScope] = React.useState<'me' | 'tenant'>('me');
  const [saveErr, setSaveErr] = React.useState<string | null>(null);
  const [saveOk, setSaveOk] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // Onda I.2 (Feedback #5) — modo tela cheia: oculta sidenav do Painel
  // de Controle (CSS via data-attr no body) e dá ao composer 100vw/100vh.
  // Onda M1.a (#5) — default = tela cheia ao abrir o Layout do App. É
  // estado de view (não persiste, sem localStorage); operador sai pelo
  // próprio toggle "Voltar ao Painel".
  const [fullscreen, setFullscreen] = React.useState(true);
  React.useEffect(() => {
    // Aplica/remove data-attr no <body> — `globals.css` esconde
    // `[data-testid="cp-sidebar"]` quando o atributo é true.
    if (typeof document === 'undefined') return;
    if (fullscreen) {
      document.body.setAttribute('data-app-shell-fullscreen', 'true');
    } else {
      document.body.removeAttribute('data-app-shell-fullscreen');
    }
    return () => {
      if (typeof document === 'undefined') return;
      document.body.removeAttribute('data-app-shell-fullscreen');
    };
  }, [fullscreen]);
  const confirm = useConfirm();

  // Hidrata o draft assim que a config é carregada — só na primeira vez.
  // Wave G.1: refetches "soft" (mutateAppShellCache disparado por
  // MarketplaceInspector.install) atualizam `loaded` mas NÃO devem
  // pisar no draft do operador. Operador clica Reset pra re-hidratar.
  //
  // Onda K.4 (Feedback #2) — o EDITOR semeia os defaults canônicos quando o
  // backend devolve seções vazias: sidenav.groups vazio → grupos default
  // (Operação · Análise · Conteúdo); user_menu.items vazio → itens default.
  // Assim o operador "vê os itens como antes" no editor (o shell renderizado
  // já usa o fallback do FALLBACK_NAV / UserMenuFallback). A versão semeada
  // vira a baseline do `dirty`, então não fica "sujo" ao abrir.
  // Grupos do nav REAL deste tenant (mesma fonte que o sidenav renderiza) —
  // é o que torna o seed do editor dinâmico em vez de uma lista de fábrica.
  const navVivo = useNavTree(navHidden);
  const gruposVivos = React.useMemo<AppShellSidenavGroup[]>(() => {
    const grupos: AppShellSidenavGroup[] = (navVivo.tree?.sections ?? []).map((sec) => ({
      key: sec.id,
      label: sec.label,
      collapsed_by_default: !sec.default_open,
      items: (sec.items ?? []).map((it) => ({
        key: it.id,
        label: it.label,
        icon: it.icon ?? null,
        href: it.href,
        perm_required: it.perm_key ?? null,
        badge: it.badge ?? null,
      })),
    }));
    // Itens modulares (Páginas com experience_kind: Conversas, Agentes,
    // Soluções, Construtor de Camadas…) entram no MESMO grupo em que o
    // sidenav os desenha. Sem isto o editor mostraria um menu diferente do
    // que o operador vê — e salvar apagaria esses itens.
    for (const item of navVivo.appItems ?? []) {
      const alvo =
        grupos.find((g) => g.key === item.targetGroup) ??
        grupos.find((g) => g.key === 'aplicacoes');
      const entrada = {
        key: item.id,
        label: item.label,
        icon: item.icon ?? null,
        href: item.href,
        perm_required: item.perm_key ?? null,
        badge: item.badge ?? null,
      };
      if (alvo) {
        if (!alvo.items.some((i) => i.key === entrada.key)) alvo.items.push(entrada);
      } else {
        grupos.push({
          key: 'aplicacoes',
          label: 'Aplicações',
          collapsed_by_default: false,
          items: [entrada],
        });
      }
    }
    return grupos;
  }, [navVivo]);
  const seeded = React.useMemo(
    () => withEditorDefaults(loaded, gruposVivos, navHidden),
    [loaded, gruposVivos, navHidden],
  );
  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (!loading && !hydratedRef.current) {
      setDraft(seeded);
      hydratedRef.current = true;
    }
  }, [loading, seeded]);

  // O menu vivo (Páginas registradas) chega DEPOIS da config — a hidratação
  // acima roda uma vez só, então uma Página instalada pela Loja aparecia no
  // sidenav mas NÃO no editor: o merge tinha rodado com a lista ainda vazia.
  // Aqui, sempre que itens novos chegam, eles são ANEXADOS ao rascunho.
  // Estritamente aditivo: nunca remove nem reordena o que o operador mexeu.
  React.useEffect(() => {
    if (!hydratedRef.current || gruposVivos.length === 0) return;
    setDraft((atual) => {
      const grupos = atual.sidenav?.groups ?? [];
      if (grupos.length === 0) return atual;   // ainda no default: o seed cobre
      const conhecidos = new Set(grupos.flatMap((g) => g.items.map((i) => i.key)));
      const faltantes = gruposVivos.flatMap((g) =>
        g.items
          .filter((i) => !conhecidos.has(i.key))
          .map((i) => ({ grupo: g.key, item: i })),
      );
      if (faltantes.length === 0) return atual;
      const novos = grupos.map((g) => ({ ...g, items: [...g.items] }));
      for (const { grupo, item } of faltantes) {
        const destino = novos.find((g) => g.key === grupo) ?? novos[0];
        if (destino) destino.items.push({ ...item });
      }
      return { ...atual, sidenav: { ...atual.sidenav, groups: novos } };
    });
  }, [gruposVivos]);

  const dirty = React.useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(seeded),
    [draft, seeded],
  );

  async function handleSave() {
    setSaveErr(null);
    setSaveOk(null);
    if (scope === 'tenant') {
      const ok = await confirm({
        title: t('appshell.confirmTenantTitle'),
        description: t('appshell.confirmTenantDesc'),
        dependencies: [
          t('appshell.confirmTenantDep1'),
          t('appshell.confirmTenantDep2'),
        ],
        requireConfirmText: 'TENANT',
        confirmLabel: t('appshell.applyAll'),
        tone: 'warning',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const envelope =
        scope === 'tenant'
          ? await AppShellApi.putTenant(draft)
          : await AppShellApi.putMe(draft);
      // Atualiza o draft e o "loaded" hidratado.
      setDraft(envelope.config);
      setSaveOk(
        scope === 'tenant'
          ? t('appshell.savedTenant')
          : t('appshell.savedMe'),
      );
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : t('appshell.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    setDraft(seeded);
    setSaveErr(null);
    setSaveOk(null);
  }

  if (loading) {
    return <CpSkeleton rows={4} />;
  }

  if (error) {
    return (
      <CpErrorState
        title={t('appshell.loadErrorTitle')}
        description={error}
        retry={() => window.location.reload()}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full',
        fullscreen && 'fixed inset-0 z-50 bg-canvas-light',
      )}
      data-testid="app-shell-root"
      data-fullscreen={fullscreen ? 'true' : 'false'}
    >
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            <Layout className="w-5 h-5 text-text-on-light" strokeWidth={1.5} />
            {t('appshell.title')}
          </span>
        }
        subtitle={`${t('appshell.originPrefix')}${
          source === 'user'
            ? t('appshell.originUser')
            : source === 'tenant'
            ? t('appshell.originTenant')
            : t('appshell.originDefault')
        }`}
        actions={
          <>
            <FullscreenToggle
              active={fullscreen}
              onChange={setFullscreen}
            />
            <ScopeSwitcher
              scope={scope}
              onChange={setScope}
              disabled={busy}
            />
            {dirty && (
              <Button
                variant="outline"
                size="xs"
                onClick={handleReset}
                data-testid="app-shell-reset"
                disabled={busy}
              >
                {t('appshell.discard')}
              </Button>
            )}
            <Button
              variant="success"
              size="xs"
              onClick={() => void handleSave()}
              data-testid="app-shell-save"
              disabled={busy || !dirty}
            >
              <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
              {scope === 'tenant' ? t('appshell.applyAll') : t('appshell.save')}
            </Button>
          </>
        }
      />
      <CpHubSubnav group="Personalização" tabs={PERSONALIZACAO_TABS} />
      {(saveErr || saveOk) && (
        <div
          data-testid="app-shell-banner"
          className={cn(
            'px-6 py-2 border-b border-border-light text-[12px] flex items-center gap-2',
            saveErr
              ? 'bg-danger/10 text-danger'
              : 'bg-success/10 text-success',
          )}
        >
          <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span data-testid={saveErr ? 'app-shell-error' : 'app-shell-success'}>
            {saveErr ?? saveOk}
          </span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <TabPalette current={tab} onChange={setTab} />
        <Canvas draft={draft} tab={tab} />
        <Inspector
          tab={tab}
          draft={draft}
          onChange={setDraft}
        />
      </div>
    </div>
  );
}

function ScopeSwitcher({
  scope,
  onChange,
  disabled,
}: {
  scope: 'me' | 'tenant';
  onChange: (s: 'me' | 'tenant') => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div
      data-testid="app-shell-scope"
      className="flex border border-border-light"
    >
      <button
        type="button"
        data-testid="app-shell-scope-me"
        onClick={() => onChange('me')}
        disabled={disabled}
        className={cn(
          'h-8 px-3 text-[12px] border-r border-border-light',
          scope === 'me'
            ? 'bg-primary text-white'
            : 'bg-canvas-light hover:border-primary',
        )}
      >
        {t('appshell.scopeMe')}
      </button>
      <button
        type="button"
        data-testid="app-shell-scope-tenant"
        onClick={() => onChange('tenant')}
        disabled={disabled}
        className={cn(
          'h-8 px-3 text-[12px]',
          scope === 'tenant'
            ? 'bg-primary text-white'
            : 'bg-canvas-light hover:border-primary',
        )}
      >
        {t('appshell.scopeTenant')}
      </button>
    </div>
  );
}

function TabPalette({
  current,
  onChange,
}: {
  current: TabKey;
  onChange: (k: TabKey) => void;
}) {
  const t = useT();
  return (
    <aside
      data-testid="app-shell-palette"
      className="w-[260px] shrink-0 bg-white border-r border-border-light overflow-y-auto"
    >
      <header className="px-3 py-2 border-b border-border-light">
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light">
          {t('appshell.paletteHeader')}
        </p>
      </header>
      <ul>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = current === tab.key;
          return (
            <li key={tab.key}>
              <button
                type="button"
                onClick={() => onChange(tab.key)}
                data-testid={`app-shell-tab-${tab.key}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'w-full flex items-center gap-2 px-3 h-9 text-[12px] border-b border-border-light text-left',
                  active
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-text-on-light hover:bg-canvas-light',
                )}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="flex-1 truncate">{t(tab.labelKey)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Canvas({ draft, tab }: { draft: AppShellConfig; tab: TabKey }) {
  const t = useT();
  // M2 (2026-05-24) — a tab "Login" mostra a prévia ao vivo da tela de
  // login com a marca aplicada (ou a marca AEGIS neutra quando o toggle
  // "usar marca padrão AEGIS" está ligado).
  if (tab === 'login') {
    return (
      <main
        data-testid="app-shell-canvas"
        data-tab="login"
        className="flex-1 overflow-y-auto bg-canvas-light p-6 flex flex-col items-center"
      >
        <div className="space-y-3 w-full max-w-[460px]">
          <header>
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-on-light">
              {t('appshell.previewLiveLabel')}
            </p>
            <p className="text-[11.5px] text-muted-on-light italic">
              {t('appshell.previewLoginDesc')}
            </p>
          </header>
          <LoginPreview login={draft.login} />
        </div>
      </main>
    );
  }

  // Onda I.2 (Feedback #3) — quando a tab "Menu do usuário" está ativa,
  // o canvas vira dropdown ao vivo. Quando outras tabs, mantém o shell
  // preview clássico (Header/Sidenav/Footer).
  if (tab === 'user-menu') {
    return (
      <main
        data-testid="app-shell-canvas"
        data-tab="user-menu"
        className="flex-1 overflow-y-auto bg-canvas-light p-6 flex items-start justify-center"
      >
        <div className="space-y-3 max-w-[320px]">
          <header>
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-on-light">
              {t('appshell.previewLiveLabel')}
            </p>
            <p className="text-[11.5px] text-muted-on-light italic">
              {t('appshell.previewUserMenuDesc')}
            </p>
          </header>
          <UserMenuPreview
            items={draft.user_menu?.items ?? []}
            testId="app-shell-canvas-user-menu-preview"
          />
        </div>
      </main>
    );
  }

  // Onda I.5 (Feedback #4) — preview do menu Apps no cabeçalho.
  if (tab === 'marketplace') {
    return (
      <main
        data-testid="app-shell-canvas"
        data-tab="marketplace"
        className="flex-1 overflow-y-auto bg-canvas-light p-6 flex flex-col items-center"
      >
        <div className="space-y-3 w-full max-w-[520px]">
          <header>
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-on-light">
              {t('appshell.previewLiveLabel')}
            </p>
            <p className="text-[11.5px] text-muted-on-light italic">
              {t('appshell.previewMarketplaceDesc')}
            </p>
          </header>
          <AppsMenuHeaderPreview
            appsMenu={draft.marketplace?.apps_menu ?? { enabled: false, items: [] }}
          />
        </div>
      </main>
    );
  }

  return (
    <main
      data-testid="app-shell-canvas"
      className="flex-1 overflow-hidden bg-canvas-light"
    >
      <div className="h-full flex flex-col">
        <PreviewAppShellProvider value={draft}>
          {/* Re-render a Header, Sidenav, Footer dentro do preview com a
              config draft — não precisamos de iframe. */}
          <div
            data-testid="app-shell-preview"
            className={cn(
              'flex flex-col h-full border border-border-light m-3 bg-white overflow-hidden',
              draft.theme === 'dark' && 'dark',
            )}
          >
            <Header />
            <div className="flex-1 flex overflow-hidden">
              <Sidenav />
              <div
                className="flex-1 overflow-y-auto px-6 py-6 bg-canvas-light text-text-on-light"
                data-testid="app-shell-homepage-preview"
              >
                <p className="text-h1 font-semibold mb-2">
                  {t('appshell.previewHomeTitle')}
                </p>
                <p className="text-small text-muted-on-light mb-4">
                  {t('appshell.previewHomeRouteRendersPre')}
                  <code>/</code>
                  {t('appshell.previewHomeRouteRendersPost')}
                </p>
                <div className="bg-white border border-border-light px-4 py-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1">
                    {t('appshell.previewHomeCurrent')}
                  </p>
                  <p className="text-body font-semibold text-text-on-light">
                    {draft.homepage?.page_id
                      ? `/${draft.homepage.page_id}`
                      : t('appshell.previewHomeSeedDefault')}
                  </p>
                  <p className="text-small text-muted-on-light mt-2">
                    {draft.homepage?.page_id
                      ? t('appshell.previewHomeFromPage')
                      : t('appshell.previewHomeMosaic')}
                  </p>
                </div>
              </div>
            </div>
            <Footer />
          </div>
        </PreviewAppShellProvider>
      </div>
    </main>
  );
}

function Inspector({
  tab,
  draft,
  onChange,
}: {
  tab: TabKey;
  draft: AppShellConfig;
  onChange: (next: AppShellConfig) => void;
}) {
  const t = useT();
  return (
    <aside
      data-testid="app-shell-inspector"
      className="w-[340px] shrink-0 bg-white border-l border-border-light overflow-y-auto"
    >
      <header className="px-3 py-2 border-b border-border-light">
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light">
          {t('appshell.inspectorHeader')}
        </p>
      </header>
      <div className="p-3 space-y-3">
        {tab === 'banner' && (
          <BannerInspector draft={draft} onChange={onChange} />
        )}
        {tab === 'navbar' && (
          <NavbarInspector draft={draft} onChange={onChange} />
        )}
        {tab === 'sidenav' && (
          <SidenavInspector draft={draft} onChange={onChange} />
        )}
        {tab === 'homepage' && (
          <HomepageTabInspector draft={draft} onChange={onChange} />
        )}
        {tab === 'footer' && (
          <FooterInspector draft={draft} onChange={onChange} />
        )}
        {tab === 'user-menu' && (
          <UserMenuInspector draft={draft} onChange={onChange} />
        )}
        {tab === 'context' && (
          <ContextInspector draft={draft} onChange={onChange} />
        )}
        {tab === 'theme' && (
          <ThemeInspector draft={draft} onChange={onChange} />
        )}
        {tab === 'login' && (
          <LoginInspector draft={draft} onChange={onChange} />
        )}
        {tab === 'marketplace' && (
          <MarketplaceInspector draft={draft} onChange={onChange} />
        )}
        {tab === 'permissions' && (
          <PermissionsInspector draft={draft} onChange={onChange} />
        )}
      </div>
    </aside>
  );
}

// ── Inspectors ─────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10.5px] uppercase tracking-[0.14em] text-muted-on-light font-semibold block mb-1">
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
        className="w-4 h-4"
      />
      <span>{label}</span>
    </label>
  );
}

// Os rótulos de classificação (PÚBLICO/RESTRITO/…) são valores de domínio
// (Decreto/LAI) e NÃO são traduzíveis. Apenas a opção "Auto" é UI — traduzida
// no ponto de render via labelKey.
const CLASSIFICATION_OPTIONS: Array<{
  value: string;
  label?: string;
  labelKey?: string;
}> = [
  { value: '', labelKey: 'appshell.bannerClassAuto' },
  { value: 'publico', label: 'PÚBLICO' },
  { value: 'restrito', label: 'RESTRITO' },
  { value: 'confidencial', label: 'CONFIDENCIAL' },
  { value: 'sigiloso', label: 'SIGILOSO' },
];

/**
 * Onda K.4 (Feedback #2) — botão "Restaurar padrão" reutilizável.
 *
 * Operador FURIOSO pediu poder "voltar para o modo default!". Cada editor
 * (Sidenav + Menu do usuário) ganha este botão: abre um ConfirmDialog e,
 * ao confirmar, repõe APENAS aquela seção do draft ao default canônico
 * (DEFAULT_APP_SHELL.<section>). A gravação efetiva continua no Salvar —
 * mas o operador também pode resetar no backend (não só no draft) via o
 * fluxo de Salvar subsequente. Sem localStorage.
 */
function RestoreDefaultButton({
  sectionLabel,
  onRestore,
  testId,
}: {
  sectionLabel: string;
  onRestore: () => void;
  testId: string;
}) {
  const t = useT();
  const confirm = useConfirm();
  return (
    <Button
      variant="outline"
      size="sm"
      data-testid={testId}
      onClick={async () => {
        const ok = await confirm({
          title: t('appshell.restoreTitle').replace('{section}', sectionLabel),
          description: t('appshell.restoreDesc').replace(
            /\{section\}/g,
            sectionLabel,
          ),
          dependencies: [
            t('appshell.restoreDep1'),
            t('appshell.restoreDep2'),
          ],
          confirmLabel: t('appshell.restoreDefault'),
          tone: 'warning',
        });
        if (ok) onRestore();
      }}
    >
      <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
      {t('appshell.restoreDefault')}
    </Button>
  );
}

function BannerInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  const t = useT();
  const banner = draft.banner;
  const setBanner = (patch: Partial<AppShellBannerConfig>) =>
    onChange({ ...draft, banner: { ...banner, ...patch } });
  // Onda K.4 (Feedback #3) — slots de contexto com defaults seguros.
  const contextSlots = banner.context_slots ?? {
    organization: true,
    space: false,
    project: false,
    classification: true,
  };
  const setSlots = (patch: Partial<typeof contextSlots>) =>
    setBanner({ context_slots: { ...contextSlots, ...patch } });
  // Onda M1.a (#11) — política de truncamento dos slots com defaults seguros.
  const truncate = banner.truncate ?? {
    enabled: true,
    max_chars_per_slot: 24,
    responsive: true,
  };
  const setTruncate = (patch: Partial<typeof truncate>) =>
    setBanner({ truncate: { ...truncate, ...patch } });
  return (
    <div className="space-y-3" data-testid="inspector-banner">
      <Toggle
        checked={banner.visible && banner.enabled}
        onChange={(v) => setBanner({ visible: v, enabled: v })}
        label={t('appshell.bannerActive')}
        testId="banner-visible-toggle"
      />

      <div>
        <FieldLabel>{t('appshell.bannerClassificationDefault')}</FieldLabel>
        <select
          data-testid="banner-classification-select"
          value={banner.classification_default ?? ''}
          onChange={(e) =>
            setBanner({
              classification_default: e.target.value === '' ? null : e.target.value,
            })
          }
          className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
        >
          {CLASSIFICATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.labelKey ? t(opt.labelKey) : opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Onda K.4 (Feedback #3) — contexto dinâmico vivo. O banner deixa de
          ser texto estático e passa a mostrar Org/Espaço/Operação ATUAIS
          (de /me/context) + botão "Trocar". Os toggles decidem quais slots
          aparecem. */}
      <div className="border border-border-light p-2.5 bg-canvas-light space-y-2">
        <p className="text-[11px] font-semibold text-text-on-light flex items-center gap-1.5">
          <ArrowLeftRight className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
          {t('appshell.bannerContextDynamic')}
        </p>
        <p className="text-[10.5px] text-muted-on-light leading-snug">
          {t('appshell.bannerContextHelp')}
        </p>
        <Toggle
          checked={contextSlots.organization}
          onChange={(v) => setSlots({ organization: v })}
          label={t('appshell.bannerSlotOrg')}
          testId="banner-slot-organization"
        />
        <Toggle
          checked={contextSlots.space}
          onChange={(v) => setSlots({ space: v })}
          label={t('appshell.bannerSlotSpace')}
          testId="banner-slot-space"
        />
        <Toggle
          checked={contextSlots.project}
          onChange={(v) => setSlots({ project: v })}
          label={t('appshell.bannerSlotProject')}
          testId="banner-slot-project"
        />
        <Toggle
          checked={contextSlots.classification}
          onChange={(v) => setSlots({ classification: v })}
          label={t('appshell.bannerSlotClassification')}
          testId="banner-slot-classification"
        />
        <Toggle
          checked={banner.show_context_switcher !== false}
          onChange={(v) => setBanner({ show_context_switcher: v })}
          label={t('appshell.bannerSwitcherToggle')}
          testId="banner-show-switcher-toggle"
        />
      </div>

      <div>
        <FieldLabel>{t('appshell.bannerCustomText')}</FieldLabel>
        <TextInput
          value={banner.custom_text ?? ''}
          onChange={(v) =>
            setBanner({ custom_text: v.trim() === '' ? null : v })
          }
          placeholder={t('appshell.bannerCustomTextPlaceholder')}
          testId="banner-custom-text-input"
        />
        <p className="text-[10px] text-muted-on-light italic mt-1">
          {t('appshell.bannerCustomTextHelp')}
        </p>
      </div>

      <div>
        <FieldLabel>{t('appshell.bannerPosition')}</FieldLabel>
        <div className="flex gap-1.5">
          {(['top', 'bottom'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setBanner({ position: p })}
              data-testid={`banner-position-${p}`}
              className={cn(
                'h-7 px-2 text-[11px] border border-border-light',
                banner.position === p
                  ? 'bg-primary text-white border-primary'
                  : 'hover:border-primary',
              )}
            >
              {p === 'top' ? t('appshell.bannerPosTop') : t('appshell.bannerPosBottom')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>{t('appshell.bannerBg')}</FieldLabel>
          <TextInput
            value={banner.bg ?? ''}
            onChange={(v) =>
              setBanner({ bg: v.trim() === '' ? null : v })
            }
            placeholder="#0d2c4d"
            testId="banner-bg-input"
          />
        </div>
        <div>
          <FieldLabel>{t('appshell.bannerTextColor')}</FieldLabel>
          <TextInput
            value={banner.text ?? ''}
            onChange={(v) =>
              setBanner({ text: v.trim() === '' ? null : v })
            }
            placeholder="#ffffff"
            testId="banner-text-color-input"
          />
        </div>
      </div>

      <Toggle
        checked={banner.show_clock}
        onChange={(v) => setBanner({ show_clock: v })}
        label={t('appshell.bannerShowClock')}
        testId="banner-show-clock-toggle"
      />
      <Toggle
        checked={banner.show_timezone}
        onChange={(v) => setBanner({ show_timezone: v })}
        label={t('appshell.bannerShowTimezone')}
        testId="banner-show-timezone-toggle"
      />
      <Toggle
        checked={banner.dismissible}
        onChange={(v) => setBanner({ dismissible: v })}
        label={t('appshell.bannerDismissible')}
        testId="banner-dismissible-toggle"
      />

      {/* Onda M1.a (#11) — política de truncamento dos slots. Mantém o
          banner em uma linha mesmo com contexto longo. A renderização
          efetiva fica no banner de classificação. */}
      <div className="border border-border-light p-2.5 bg-canvas-light space-y-2">
        <p className="text-[11px] font-semibold text-text-on-light">
          {t('appshell.bannerTruncTitle')}
        </p>
        <p className="text-[10.5px] text-muted-on-light leading-snug">
          {t('appshell.bannerTruncHelp')}
        </p>
        <Toggle
          checked={truncate.enabled}
          onChange={(v) => setTruncate({ enabled: v })}
          label={t('appshell.bannerTruncEnabled')}
          testId="banner-truncate-enabled-toggle"
        />
        <div>
          <FieldLabel>{t('appshell.bannerTruncMax')}</FieldLabel>
          <input
            type="number"
            min={4}
            max={80}
            step={1}
            value={truncate.max_chars_per_slot}
            onChange={(e) => {
              const n = Number(e.target.value);
              setTruncate({
                max_chars_per_slot: Number.isFinite(n)
                  ? Math.min(80, Math.max(4, Math.trunc(n)))
                  : truncate.max_chars_per_slot,
              });
            }}
            disabled={!truncate.enabled}
            data-testid="banner-truncate-max-chars-input"
            aria-label={t('appshell.bannerTruncMaxAria')}
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary disabled:opacity-50"
          />
        </div>
        <Toggle
          checked={truncate.responsive}
          onChange={(v) => setTruncate({ responsive: v })}
          label={t('appshell.bannerTruncResponsive')}
          testId="banner-truncate-responsive-toggle"
        />
      </div>

      {/* Preview compacto */}
      <div className="border border-border-light p-2 bg-canvas-light">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1">
          {t('appshell.previewLabel')}
        </p>
        <div
          data-testid="banner-preview"
          className="h-6 px-2 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.18em] uppercase select-none whitespace-nowrap bg-primary text-white"
          style={
            banner.bg || banner.text
              ? {
                  backgroundColor: banner.bg ?? undefined,
                  color: banner.text ?? undefined,
                }
              : undefined
          }
        >
          {contextSlots.classification && (
            <>
              <span aria-hidden className="w-2 h-2 bg-current opacity-90" />
              <span>
                {(banner.classification_default ?? 'auto').toUpperCase()}
              </span>
            </>
          )}
          {contextSlots.organization && (
            <>
              <span aria-hidden className="opacity-50">·</span>
              <span data-testid="banner-preview-org">{t('appshell.bannerPreviewOrg')}</span>
            </>
          )}
          {contextSlots.space && (
            <>
              <span aria-hidden className="opacity-50">·</span>
              <span data-testid="banner-preview-space">{t('appshell.bannerPreviewSpace')}</span>
            </>
          )}
          {contextSlots.project && (
            <>
              <span aria-hidden className="opacity-50">·</span>
              <span data-testid="banner-preview-project">{t('appshell.bannerPreviewProject')}</span>
            </>
          )}
          {banner.custom_text && (
            <>
              <span aria-hidden className="opacity-50">·</span>
              <span>{banner.custom_text}</span>
            </>
          )}
          {banner.show_context_switcher !== false && (
            <span
              data-testid="banner-preview-switcher"
              className="inline-flex items-center gap-1 border border-current px-1 opacity-90"
            >
              <ArrowLeftRight className="w-2.5 h-2.5" strokeWidth={1.5} aria-hidden />
              {t('appshell.bannerPreviewSwitch')}
            </span>
          )}
          {banner.show_clock && (
            <span
              data-testid="banner-preview-clock"
              className="ml-auto inline-flex items-center gap-1 opacity-90"
            >
              <Clock className="w-3 h-3" strokeWidth={1.5} aria-hidden />
              00:00
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function NavbarInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  const t = useT();
  const items = draft.navbar.items;
  const update = (next: AppShellConfig['navbar']['items']) =>
    onChange({ ...draft, navbar: { ...draft.navbar, items: next } });
  // Onda M1.a (#4) — config do campo de busca com defaults seguros.
  const search = draft.navbar.search ?? {
    placeholder: 'Buscar pessoa, veículo, BO, mandado, endereço…',
    compact: false,
  };
  const setSearch = (patch: Partial<typeof search>) =>
    onChange({
      ...draft,
      navbar: { ...draft.navbar, search: { ...search, ...patch } },
    });
  return (
    <div className="space-y-3" data-testid="inspector-navbar">
      {/* Onda M1.a (#4) — config do campo de busca global do cabeçalho.
          A renderização efetiva do input fica no header (outro agente). */}
      <div className="border border-border-light p-2.5 bg-canvas-light space-y-2">
        <p className="text-[11px] font-semibold text-text-on-light">
          {t('appshell.navbarSearchTitle')}
        </p>
        <p className="text-[10.5px] text-muted-on-light leading-snug">
          {t('appshell.navbarSearchHelp')}
        </p>
        <div>
          <FieldLabel>{t('appshell.navbarSearchPlaceholderLabel')}</FieldLabel>
          <TextInput
            value={search.placeholder}
            onChange={(v) => setSearch({ placeholder: v })}
            placeholder={t('appshell.navbarSearchPlaceholderHint')}
            testId="navbar-search-placeholder-input"
          />
        </div>
        <Toggle
          checked={search.compact}
          onChange={(v) => setSearch({ compact: v })}
          label={t('appshell.navbarSearchCompact')}
          testId="navbar-search-compact-toggle"
        />
      </div>

      <p className="text-[11px] text-muted-on-light">
        {t('appshell.navbarItemsHelp')}
      </p>
      {items.length === 0 && (
        <p
          data-testid="navbar-empty"
          className="text-small text-muted-on-light"
        >
          {t('appshell.navbarEmpty')}
        </p>
      )}
      {items.map((it, idx) => (
        <div
          key={`navbar-item-${idx}`}
          data-testid={`navbar-item-${idx}`}
          className="border border-border-light p-2 space-y-1.5"
        >
          <TextInput
            value={it.label}
            onChange={(v) => {
              const copy = [...items];
              copy[idx] = { ...copy[idx], label: v };
              update(copy);
            }}
            placeholder={t('appshell.navbarItemLabelPlaceholder')}
            testId={`navbar-item-label-${idx}`}
          />
          <RouteSelect
            value={it.href}
            onChange={(v) => {
              const copy = [...items];
              copy[idx] = { ...copy[idx], href: v };
              update(copy);
            }}
            data-testid={`navbar-item-href-${idx}`}
          />
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-on-light">{t('appshell.posPrefix')}</span>
            <button
              type="button"
              onClick={() => {
                const copy = [...items];
                copy[idx] = { ...copy[idx], position: 'left' };
                update(copy);
              }}
              data-testid={`navbar-item-pos-left-${idx}`}
              className={cn(
                'h-6 px-2 border border-border-light',
                it.position === 'left'
                  ? 'bg-primary text-white border-primary'
                  : 'hover:border-primary',
              )}
            >
              {t('appshell.posLeft')}
            </button>
            <button
              type="button"
              onClick={() => {
                const copy = [...items];
                copy[idx] = { ...copy[idx], position: 'right' };
                update(copy);
              }}
              data-testid={`navbar-item-pos-right-${idx}`}
              className={cn(
                'h-6 px-2 border border-border-light',
                (it.position ?? 'right') === 'right'
                  ? 'bg-primary text-white border-primary'
                  : 'hover:border-primary',
              )}
            >
              {t('appshell.posRight')}
            </button>
            <button
              type="button"
              onClick={() => {
                const copy = [...items];
                copy.splice(idx, 1);
                update(copy);
              }}
              data-testid={`navbar-item-remove-${idx}`}
              className="ml-auto h-6 px-2 border border-border-light hover:border-danger hover:text-danger"
              aria-label={t('appshell.removeAria')}
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          update([
            ...items,
            { label: t('appshell.navbarNewItem'), href: '/', position: 'right' },
          ])
        }
        data-testid="navbar-add"
      >
        <Plus className="w-3 h-3" strokeWidth={1.5} />
        {t('appshell.navbarAddItem')}
      </Button>
    </div>
  );
}

// ── Wave H.4.Y — Sidenav groups editor ─────────────────────────────────────

const SIDENAV_ICONS = [
  'circle',
  'map',
  'shield',
  'eye',
  'user',
  'users',
  'list',
  'flag',
  'cctv',
];

function SidenavGroupsEditor({
  groups,
  onChange,
}: {
  groups: AppShellSidenavGroup[];
  onChange: (g: AppShellSidenavGroup[]) => void;
}) {
  const t = useT();
  const moveGroup = (from: number, to: number) => {
    if (from === to || to < 0 || to >= groups.length) return;
    const copy = [...groups];
    const [it] = copy.splice(from, 1);
    copy.splice(to, 0, it);
    onChange(copy);
  };
  const patchGroup = (idx: number, p: Partial<AppShellSidenavGroup>) => {
    const copy = [...groups];
    copy[idx] = { ...copy[idx], ...p };
    onChange(copy);
  };
  const removeGroup = (idx: number) => {
    const copy = [...groups];
    copy.splice(idx, 1);
    onChange(copy);
  };

  const moveItem = (gIdx: number, from: number, to: number) => {
    const g = groups[gIdx];
    if (!g || to < 0 || to >= g.items.length || from === to) return;
    const items = [...g.items];
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
    patchGroup(gIdx, { items });
  };

  const groupIds = groups.map((g, gIdx) => `${g.key}::${gIdx}`);

  return (
    <div className="space-y-2" data-testid="sidenav-groups-editor">
      {groups.length === 0 && (
        <p
          data-testid="sidenav-groups-empty"
          className="text-small text-muted-on-light italic"
        >
          {t('appshell.sidenavGroupsEmpty')}
        </p>
      )}
      <SortableList
        ids={groupIds}
        onReorder={moveGroup}
        className="space-y-2"
        testId="sidenav-groups-sortable"
      >
      {groups.map((g, gIdx) => (
        <SortableRow key={groupIds[gIdx]} id={groupIds[gIdx]}>
          {({ handleProps, isDragging }) => (
        <div
          data-testid={`sidenav-group-${gIdx}`}
          className={cn(
            'border border-border-light p-2 space-y-1.5 bg-white',
            isDragging && 'border-primary',
          )}
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              {...handleProps}
              data-testid={`sidenav-group-${gIdx}-drag`}
              aria-label={t('appshell.reorderGroupAria').replace(
                '{name}',
                g.label || g.key,
              )}
              className="w-4 h-4 flex items-center justify-center text-muted-on-light cursor-grab hover:text-primary touch-none focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <GripVertical className="w-3 h-3" aria-hidden strokeWidth={1.5} />
            </button>
            <span className="text-[11px] font-mono text-muted-on-light truncate flex-1">
              {g.key}
            </span>
            <button
              type="button"
              onClick={() => moveGroup(gIdx, gIdx - 1)}
              data-testid={`sidenav-group-${gIdx}-up`}
              aria-label={t('appshell.moveGroupUpAria')}
              disabled={gIdx === 0}
              className="h-5 w-5 border border-border-light hover:border-primary disabled:opacity-40 text-[10px]"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveGroup(gIdx, gIdx + 1)}
              data-testid={`sidenav-group-${gIdx}-down`}
              aria-label={t('appshell.moveGroupDownAria')}
              disabled={gIdx === groups.length - 1}
              className="h-5 w-5 border border-border-light hover:border-primary disabled:opacity-40 text-[10px]"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => removeGroup(gIdx)}
              data-testid={`sidenav-group-${gIdx}-remove`}
              aria-label={t('appshell.removeGroupAria')}
              className="h-5 w-5 border border-border-light hover:border-danger hover:text-danger flex items-center justify-center"
            >
              <Trash2 className="w-2.5 h-2.5" strokeWidth={1.5} />
            </button>
          </div>
          <TextInput
            value={g.label}
            onChange={(v) => patchGroup(gIdx, { label: v })}
            placeholder={t('appshell.sidenavGroupLabelPlaceholder')}
            testId={`sidenav-group-${gIdx}-label`}
          />
          <Toggle
            checked={!!g.collapsed_by_default}
            onChange={(v) => patchGroup(gIdx, { collapsed_by_default: v })}
            label={t('appshell.sidenavGroupCollapsed')}
            testId={`sidenav-group-${gIdx}-collapsed-toggle`}
          />

          <div className="pl-2 border-l border-border-light space-y-1.5">
            {g.items.length === 0 && (
              <p
                data-testid={`sidenav-group-${gIdx}-items-empty`}
                className="text-[10.5px] text-muted-on-light italic"
              >
                {t('appshell.sidenavGroupNoItems')}
              </p>
            )}
            <SortableList
              ids={g.items.map((it, iIdx) => `${gIdx}:${it.key}:${iIdx}`)}
              onReorder={(from, to) => moveItem(gIdx, from, to)}
              className="space-y-1.5"
              testId={`sidenav-group-${gIdx}-items-sortable`}
            >
            {g.items.map((it, iIdx) => (
              <SortableRow
                key={`sni-${it.key}-${iIdx}`}
                id={`${gIdx}:${it.key}:${iIdx}`}
              >
                {({ handleProps, isDragging }) => (
              <div
                data-testid={`sidenav-group-${gIdx}-item-${iIdx}`}
                className={cn(
                  'bg-canvas-light border border-border-light p-1.5 space-y-1',
                  isDragging && 'border-primary',
                )}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    {...handleProps}
                    data-testid={`sidenav-group-${gIdx}-item-${iIdx}-drag`}
                    aria-label={t('appshell.reorderItemAria').replace(
                      '{name}',
                      it.label || it.key,
                    )}
                    className="h-4 w-4 flex items-center justify-center text-muted-on-light cursor-grab hover:text-primary touch-none focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <GripVertical className="w-2.5 h-2.5" aria-hidden strokeWidth={1.5} />
                  </button>
                  <span className="text-[10px] font-mono text-muted-on-light flex-1 truncate">
                    {it.key}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveItem(gIdx, iIdx, iIdx - 1)}
                    data-testid={`sidenav-group-${gIdx}-item-${iIdx}-up`}
                    disabled={iIdx === 0}
                    aria-label={t('appshell.moveItemUpAria')}
                    className="h-4 w-4 border border-border-light hover:border-primary disabled:opacity-40 text-[10px]"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(gIdx, iIdx, iIdx + 1)}
                    data-testid={`sidenav-group-${gIdx}-item-${iIdx}-down`}
                    disabled={iIdx === g.items.length - 1}
                    aria-label={t('appshell.moveItemDownAria')}
                    className="h-4 w-4 border border-border-light hover:border-primary disabled:opacity-40 text-[10px]"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const items = [...g.items];
                      items.splice(iIdx, 1);
                      patchGroup(gIdx, { items });
                    }}
                    data-testid={`sidenav-group-${gIdx}-item-${iIdx}-remove`}
                    aria-label={t('appshell.removeItemAria')}
                    className="h-4 w-4 border border-border-light hover:border-danger hover:text-danger flex items-center justify-center"
                  >
                    <Trash2 className="w-2 h-2" strokeWidth={1.5} />
                  </button>
                </div>
                <TextInput
                  value={it.label}
                  onChange={(v) => {
                    const items = [...g.items];
                    items[iIdx] = { ...items[iIdx], label: v };
                    patchGroup(gIdx, { items });
                  }}
                  placeholder={t('appshell.sidenavItemLabelPlaceholder')}
                  testId={`sidenav-group-${gIdx}-item-${iIdx}-label`}
                />
                {/* Onda K.4 (Feedback #4) — página por título, não slug cru. */}
                <RouteSelect
                  value={it.href}
                  onChange={(v) => {
                    const items = [...g.items];
                    items[iIdx] = { ...items[iIdx], href: v };
                    patchGroup(gIdx, { items });
                  }}
                  data-testid={`sidenav-group-${gIdx}-item-${iIdx}-href`}
                />
                <select
                  value={it.icon ?? ''}
                  onChange={(e) => {
                    const items = [...g.items];
                    items[iIdx] = {
                      ...items[iIdx],
                      icon: e.target.value === '' ? null : e.target.value,
                    };
                    patchGroup(gIdx, { items });
                  }}
                  data-testid={`sidenav-group-${gIdx}-item-${iIdx}-icon`}
                  className="w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
                >
                  <option value="">{t('appshell.noIcon')}</option>
                  {SIDENAV_ICONS.map((ic) => (
                    <option key={ic} value={ic}>
                      {ic}
                    </option>
                  ))}
                </select>
                {/* Onda K.4 (Feedback #4) — permissão do catálogo IAM por
                    descrição humana, nunca perm-key digitada de cabeça. */}
                <PermSelect
                  value={it.perm_required ?? ''}
                  onChange={(v) => {
                    const items = [...g.items];
                    items[iIdx] = {
                      ...items[iIdx],
                      perm_required: v.trim() === '' ? null : v,
                    };
                    patchGroup(gIdx, { items });
                  }}
                  data-testid={`sidenav-group-${gIdx}-item-${iIdx}-perm`}
                />
                <TextInput
                  value={it.badge ?? ''}
                  onChange={(v) => {
                    const items = [...g.items];
                    items[iIdx] = {
                      ...items[iIdx],
                      badge: v.trim() === '' ? null : v,
                    };
                    patchGroup(gIdx, { items });
                  }}
                  placeholder={t('appshell.sidenavBadgePlaceholder')}
                  testId={`sidenav-group-${gIdx}-item-${iIdx}-badge`}
                />
              </div>
                )}
              </SortableRow>
            ))}
            </SortableList>
            <Button
              variant="outline"
              size="sm"
              data-testid={`sidenav-group-${gIdx}-add-item`}
              onClick={() => {
                const items = [
                  ...g.items,
                  {
                    key: `item-${Date.now()}`,
                    label: t('appshell.sidenavNewItem'),
                    icon: 'circle',
                    href: '/',
                    perm_required: null,
                    badge: null,
                  },
                ];
                patchGroup(gIdx, { items });
              }}
            >
              <Plus className="w-3 h-3" strokeWidth={1.5} />
              {t('appshell.sidenavAddItem')}
            </Button>
          </div>
        </div>
          )}
        </SortableRow>
      ))}
      </SortableList>
      <Button
        variant="outline"
        size="sm"
        data-testid="sidenav-add-group"
        onClick={() =>
          onChange([
            ...groups,
            {
              key: `group-${Date.now()}`,
              label: t('appshell.sidenavNewGroup'),
              collapsed_by_default: false,
              items: [],
            },
          ])
        }
      >
        <Plus className="w-3 h-3" strokeWidth={1.5} />
        {t('appshell.sidenavAddGroup')}
      </Button>
    </div>
  );
}

function SidenavInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  // Onda I.2 (Feedback #2): modelo real é `groups`. UI nunca mais mostra
  // "Seções legacy" — `sections` continua na config (compat backend) mas
  // o operador edita só via grupos. Migration silenciosa cuida do resto.
  const t = useT();
  const setSidenav = (patch: Partial<AppShellSidenavConfig>) =>
    onChange({ ...draft, sidenav: { ...draft.sidenav, ...patch } });
  return (
    <div className="space-y-3" data-testid="inspector-sidenav">
      {/* Onda K.4 (Feedback #2) — restaurar os grupos default de antes. */}
      <div className="flex items-center justify-between border border-border-light bg-canvas-light p-2">
        <p className="text-[10.5px] text-muted-on-light leading-snug pr-2">
          {t('appshell.sidenavRestoreHelp')}
        </p>
        <RestoreDefaultButton
          sectionLabel={t('appshell.sidenavSection')}
          testId="sidenav-restore-default"
          onRestore={() =>
            onChange({
              ...draft,
              sidenav: {
                ...draft.sidenav,
                sections: [],
                // Onda K.4 (Feedback #2) — repõe os grupos default canônicos
                // (Operação · Análise · Conteúdo), não os do DEFAULT_APP_SHELL
                // (que ficam vazios para o renderer cair no FALLBACK_NAV).
                groups: DEFAULT_SIDENAV_GROUPS.map((g) => ({
                  ...g,
                  items: g.items.map((it) => ({ ...it })),
                })),
                footer_link: DEFAULT_APP_SHELL.sidenav.footer_link ?? null,
              },
            })
          }
        />
      </div>
      <div>
        <FieldLabel>{t('appshell.sidenavWidth')}</FieldLabel>
        <input
          type="range"
          min={200}
          max={320}
          step={4}
          value={draft.sidenav.width_px ?? 220}
          onChange={(e) =>
            setSidenav({ width_px: Number(e.target.value) })
          }
          data-testid="sidenav-width-slider"
          aria-label={t('appshell.sidenavWidthAria')}
          className="w-full"
        />
        <p
          data-testid="sidenav-width-value"
          className="text-[10px] font-mono text-muted-on-light"
        >
          {draft.sidenav.width_px ?? 220}px
        </p>
      </div>
      <Toggle
        checked={!!draft.sidenav.dense}
        onChange={(v) => setSidenav({ dense: v })}
        label={t('appshell.sidenavDense')}
        testId="sidenav-dense-toggle"
      />
      <div>
        <FieldLabel>{t('appshell.sidenavFooterLink')}</FieldLabel>
        {/* Onda K.4 (Feedback #4) — rota por página, não slug cru. */}
        <RouteSelect
          value={draft.sidenav.footer_link ?? ''}
          onChange={(v) =>
            setSidenav({ footer_link: v.trim() === '' ? null : v })
          }
          placeholder={t('appshell.sidenavFooterLinkPlaceholder')}
          data-testid="sidenav-footer-link-input"
        />
      </div>

      <FieldLabel>{t('appshell.sidenavGroupsLabel')}</FieldLabel>
      <p className="text-[10.5px] text-muted-on-light italic mb-1">
        {t('appshell.sidenavGroupsHelp')}
      </p>
      <SidenavGroupsEditor
        groups={draft.sidenav.groups ?? []}
        onChange={(next) => setSidenav({ groups: next })}
      />
    </div>
  );
}


const FOOTER_SYSTEM_KEYS: Array<{ key: string; labelKey: string }> = [
  { key: 'system.cpu', labelKey: 'appshell.footerKeyCpu' },
  { key: 'system.ram', labelKey: 'appshell.footerKeyRam' },
  { key: 'system.time', labelKey: 'appshell.footerKeyTime' },
  { key: 'system.locale', labelKey: 'appshell.footerKeyLocale' },
];

function FooterStatusBarEditor({
  items,
  onChange,
}: {
  items: AppShellFooterStatusItem[];
  onChange: (next: AppShellFooterStatusItem[]) => void;
}) {
  const t = useT();
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const copy = [...items];
    const [it] = copy.splice(from, 1);
    copy.splice(to, 0, it);
    onChange(copy);
  };

  const update = (idx: number, patch: Partial<AppShellFooterStatusItem>) => {
    const copy = [...items];
    copy[idx] = { ...copy[idx], ...patch };
    onChange(copy);
  };

  const remove = (idx: number) => {
    const copy = [...items];
    copy.splice(idx, 1);
    onChange(copy);
  };

  return (
    <div className="space-y-2" data-testid="footer-status-bar-editor">
      {items.length === 0 && (
        <p
          data-testid="footer-status-empty"
          className="text-small text-muted-on-light italic"
        >
          {t('appshell.footerStatusEmpty')}
        </p>
      )}
      {items.map((item, idx) => (
        <div
          key={`fsi-${idx}`}
          data-testid={`footer-status-item-${idx}`}
          draggable
          onDragStart={() => setDragIdx(idx)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIdx !== null) move(dragIdx, idx);
            setDragIdx(null);
          }}
          className={cn(
            'border border-border-light p-2 space-y-1.5 bg-white',
            dragIdx === idx && 'border-primary',
          )}
        >
          <div className="flex items-center gap-1.5">
            <GripVertical
              className="w-3 h-3 text-muted-on-light cursor-grab"
              aria-hidden
              strokeWidth={1.5}
            />
            <span className="text-[11px] font-mono text-muted-on-light">
              #{idx + 1}
            </span>
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => move(idx, idx - 1)}
                data-testid={`footer-status-item-${idx}-up`}
                aria-label={t('appshell.moveUpShort')}
                disabled={idx === 0}
                className="h-5 w-5 border border-border-light hover:border-primary disabled:opacity-40 text-[10px]"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(idx, idx + 1)}
                data-testid={`footer-status-item-${idx}-down`}
                aria-label={t('appshell.moveDownShort')}
                disabled={idx === items.length - 1}
                className="h-5 w-5 border border-border-light hover:border-primary disabled:opacity-40 text-[10px]"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(idx)}
                data-testid={`footer-status-item-${idx}-remove`}
                aria-label={t('appshell.removeItemAria')}
                className="h-5 w-5 border border-border-light hover:border-danger hover:text-danger flex items-center justify-center"
              >
                <Trash2 className="w-2.5 h-2.5" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-muted-on-light">{t('appshell.footerTypePrefix')}</span>
            <button
              type="button"
              data-testid={`footer-status-item-${idx}-type-system`}
              onClick={() => update(idx, { type: 'system' })}
              className={cn(
                'h-6 px-2 border border-border-light',
                item.type === 'system'
                  ? 'bg-primary text-white border-primary'
                  : 'hover:border-primary',
              )}
            >
              {t('appshell.footerTypeSystem')}
            </button>
            <button
              type="button"
              data-testid={`footer-status-item-${idx}-type-custom`}
              onClick={() => update(idx, { type: 'custom' })}
              className={cn(
                'h-6 px-2 border border-border-light',
                item.type === 'custom'
                  ? 'bg-primary text-white border-primary'
                  : 'hover:border-primary',
              )}
            >
              {t('appshell.footerTypeCustom')}
            </button>
          </div>

          {item.type === 'system' ? (
            <select
              data-testid={`footer-status-item-${idx}-system-key`}
              value={item.key}
              onChange={(e) => {
                const k = e.target.value;
                const found = FOOTER_SYSTEM_KEYS.find((s) => s.key === k);
                update(idx, {
                  key: k,
                  label: found?.labelKey ? t(found.labelKey) : item.label,
                  icon:
                    k === 'system.cpu'
                      ? 'cpu'
                      : k === 'system.ram'
                        ? 'memory-stick'
                        : k === 'system.time'
                          ? 'clock'
                          : 'globe',
                });
              }}
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            >
              {FOOTER_SYSTEM_KEYS.map((s) => (
                <option key={s.key} value={s.key}>
                  {t(s.labelKey)} — {s.key}
                </option>
              ))}
            </select>
          ) : (
            <>
              <TextInput
                value={item.label}
                onChange={(v) => update(idx, { label: v })}
                placeholder={t('appshell.footerCustomLabelPlaceholder')}
                testId={`footer-status-item-${idx}-label`}
              />
              <TextInput
                value={item.value ?? ''}
                onChange={(v) =>
                  update(idx, { value: v.trim() === '' ? null : v })
                }
                placeholder={t('appshell.footerCustomValuePlaceholder')}
                testId={`footer-status-item-${idx}-value`}
              />
              {/* Onda K.4 (Feedback #4) — destino por página, não slug cru. */}
              <RouteSelect
                value={item.href ?? ''}
                onChange={(v) =>
                  update(idx, { href: v.trim() === '' ? null : v })
                }
                placeholder={t('appshell.footerNoLink')}
                data-testid={`footer-status-item-${idx}-href`}
              />
            </>
          )}

          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-muted-on-light">{t('appshell.posPrefix')}</span>
            {(['left', 'center', 'right'] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => update(idx, { position: pos })}
                data-testid={`footer-status-item-${idx}-pos-${pos}`}
                className={cn(
                  'h-6 px-2 border border-border-light',
                  item.position === pos
                    ? 'bg-primary text-white border-primary'
                    : 'hover:border-primary',
                )}
              >
                {pos === 'left'
                  ? t('appshell.posLeft')
                  : pos === 'center'
                    ? t('appshell.posCenter')
                    : t('appshell.posRight')}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          data-testid="footer-status-add-system"
          onClick={() =>
            onChange([
              ...items,
              {
                key: 'system.cpu',
                label: t('appshell.footerKeyCpu'),
                icon: 'cpu',
                type: 'system',
                value: null,
                href: null,
                position: 'left',
              },
            ])
          }
        >
          <Plus className="w-3 h-3" strokeWidth={1.5} />
          {t('appshell.footerTypeSystem')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="footer-status-add-custom"
          onClick={() =>
            onChange([
              ...items,
              {
                key: `custom-${Date.now()}`,
                label: t('appshell.footerNewCustom'),
                icon: 'flag',
                type: 'custom',
                value: null,
                href: null,
                position: 'left',
              },
            ])
          }
        >
          <Plus className="w-3 h-3" strokeWidth={1.5} />
          {t('appshell.footerTypeCustom')}
        </Button>
      </div>
    </div>
  );
}

function FooterInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  const t = useT();
  const columns = draft.footer.columns;
  const update = (next: AppShellConfig['footer']['columns']) =>
    onChange({ ...draft, footer: { ...draft.footer, columns: next } });
  const setFooter = (patch: Partial<AppShellFooterConfig>) =>
    onChange({ ...draft, footer: { ...draft.footer, ...patch } });
  return (
    <div className="space-y-3" data-testid="inspector-footer">
      <Toggle
        checked={draft.footer.visible}
        onChange={(v) => onChange({ ...draft, footer: { ...draft.footer, visible: v } })}
        label={t('appshell.footerVisible')}
        testId="footer-visible-toggle"
      />
      <Toggle
        checked={draft.footer.version_visible !== false}
        onChange={(v) => setFooter({ version_visible: v })}
        label={t('appshell.footerVersionVisible')}
        testId="footer-version-visible-toggle"
      />
      <div>
        <FieldLabel>{t('appshell.footerCopyright')}</FieldLabel>
        <TextInput
          value={draft.footer.copyright_text ?? ''}
          onChange={(v) =>
            setFooter({ copyright_text: v.trim() === '' ? null : v })
          }
          placeholder="© 2026 Safe-Core"
          testId="footer-copyright-input"
        />
      </div>
      <div>
        <FieldLabel>{t('appshell.footerStatusBar')}</FieldLabel>
        <p className="text-[10.5px] text-muted-on-light italic mb-1">
          {t('appshell.footerStatusBarHelp')}
        </p>
        <FooterStatusBarEditor
          items={draft.footer.status_bar_items ?? []}
          onChange={(next) => setFooter({ status_bar_items: next })}
        />
      </div>
      <FieldLabel>{t('appshell.footerColumnsLegacy')}</FieldLabel>
      {columns.length === 0 && (
        <p
          data-testid="footer-empty"
          className="text-small text-muted-on-light"
        >
          {t('appshell.footerEmpty')}
        </p>
      )}
      {columns.map((col, cIdx) => (
        <div
          key={`footer-col-${cIdx}`}
          data-testid={`footer-column-edit-${cIdx}`}
          className="border border-border-light p-2 space-y-1.5"
        >
          <TextInput
            value={col.title}
            onChange={(v) => {
              const copy = [...columns];
              copy[cIdx] = { ...copy[cIdx], title: v };
              update(copy);
            }}
            placeholder={t('appshell.footerColTitlePlaceholder')}
            testId={`footer-col-title-${cIdx}`}
          />
          {col.links.map((lk, lIdx) => (
            <div
              key={`footer-link-${cIdx}-${lIdx}`}
              className="bg-canvas-light border border-border-light p-1.5 space-y-1"
            >
              <TextInput
                value={lk.label}
                onChange={(v) => {
                  const copy = [...columns];
                  const links = [...copy[cIdx].links];
                  links[lIdx] = { ...links[lIdx], label: v };
                  copy[cIdx] = { ...copy[cIdx], links };
                  update(copy);
                }}
                placeholder={t('appshell.footerLinkLabelPlaceholder')}
                testId={`footer-link-label-${cIdx}-${lIdx}`}
              />
              {/* Onda K.4 (Feedback #4) — destino por página, não slug cru. */}
              <RouteSelect
                value={lk.href}
                onChange={(v) => {
                  const copy = [...columns];
                  const links = [...copy[cIdx].links];
                  links[lIdx] = { ...links[lIdx], href: v };
                  copy[cIdx] = { ...copy[cIdx], links };
                  update(copy);
                }}
                data-testid={`footer-link-href-${cIdx}-${lIdx}`}
              />
            </div>
          ))}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                const copy = [...columns];
                const links = [
                  ...copy[cIdx].links,
                  { label: t('appshell.footerNewLink'), href: '/', external: false },
                ];
                copy[cIdx] = { ...copy[cIdx], links };
                update(copy);
              }}
              data-testid={`footer-add-link-${cIdx}`}
              className="h-6 px-2 text-[11px] border border-border-light hover:border-primary"
            >
              {t('appshell.footerAddLink')}
            </button>
            <button
              type="button"
              onClick={() => {
                const copy = [...columns];
                copy.splice(cIdx, 1);
                update(copy);
              }}
              data-testid={`footer-remove-${cIdx}`}
              className="ml-auto h-6 px-2 text-[11px] border border-border-light hover:border-danger hover:text-danger"
            >
              {t('appshell.footerRemoveColumn')}
            </button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          update([...columns, { title: t('appshell.footerNewColumn'), links: [] }])
        }
        data-testid="footer-add-column"
      >
        <Plus className="w-3 h-3" strokeWidth={1.5} />
        {t('appshell.footerAddColumn')}
      </Button>
    </div>
  );
}

// ── Wave H.4.Y — Menu do usuário ───────────────────────────────────────────

const USER_MENU_ICONS = ['cog', 'activity', 'shield', 'life-buoy', 'globe', 'user', 'flag'];

function UserMenuInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  const t = useT();
  const items = draft.user_menu?.items ?? [];
  const update = (next: AppShellUserMenuItem[]) =>
    onChange({ ...draft, user_menu: { items: next } });

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    // Logout must stay last — não permite mover além dele.
    if (items[from].kind === 'logout') return;
    if (items[to].kind === 'logout') return;
    const copy = [...items];
    const [it] = copy.splice(from, 1);
    copy.splice(to, 0, it);
    update(copy);
  };

  const patch = (idx: number, p: Partial<AppShellUserMenuItem>) => {
    const copy = [...items];
    copy[idx] = { ...copy[idx], ...p };
    update(copy);
  };

  const remove = (idx: number) => {
    if (items[idx].kind === 'logout') return;
    const copy = [...items];
    copy.splice(idx, 1);
    update(copy);
  };

  return (
    <div className="space-y-2" data-testid="inspector-user-menu">
      <p className="text-[11px] text-muted-on-light">
        {t('appshell.userMenuHelp')}
      </p>
      {/* Onda K.4 (Feedback #2) — restaurar os itens default de antes. */}
      <div className="flex items-center justify-between border border-border-light bg-canvas-light p-2">
        <p className="text-[10.5px] text-muted-on-light leading-snug pr-2">
          {t('appshell.userMenuRestoreHelp')}
        </p>
        <RestoreDefaultButton
          sectionLabel={t('appshell.userMenuSection')}
          testId="user-menu-restore-default"
          onRestore={() =>
            update(
              DEFAULT_APP_SHELL.user_menu.items.map((it) => ({ ...it })),
            )
          }
        />
      </div>
      {items.length === 0 && (
        <p
          data-testid="user-menu-empty"
          className="text-small text-muted-on-light italic"
        >
          {t('appshell.userMenuEmpty')}
        </p>
      )}
      <SortableList
        ids={items.map((item, idx) => `${item.key}::${idx}`)}
        onReorder={move}
        className="space-y-2"
        testId="user-menu-sortable"
      >
      {items.map((item, idx) => (
        <SortableRow
          key={`um-${item.key}-${idx}`}
          id={`${item.key}::${idx}`}
          disabled={item.kind === 'logout'}
        >
          {({ handleProps, isDragging }) => (
        <div
          data-testid={`user-menu-item-${idx}`}
          data-kind={item.kind}
          className={cn(
            'border border-border-light p-2 space-y-1.5 bg-white',
            isDragging && 'border-primary',
          )}
        >
          <div className="flex items-center gap-1.5">
            {item.kind === 'logout' ? (
              <GripVertical
                className="w-3 h-3 text-muted-on-light opacity-30"
                aria-hidden
                strokeWidth={1.5}
              />
            ) : (
              <button
                type="button"
                {...handleProps}
                data-testid={`user-menu-item-${idx}-drag`}
                aria-label={t('appshell.reorderItemAria').replace(
                  '{name}',
                  item.label || item.key,
                )}
                className="w-4 h-4 flex items-center justify-center text-muted-on-light cursor-grab hover:text-primary touch-none focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <GripVertical className="w-3 h-3" aria-hidden strokeWidth={1.5} />
              </button>
            )}
            <span className="text-[11px] font-mono text-muted-on-light truncate">
              {item.key}
            </span>
            <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-muted-on-light">
              {item.kind}
            </span>
            <button
              type="button"
              onClick={() => move(idx, idx - 1)}
              data-testid={`user-menu-item-${idx}-up`}
              aria-label={t('appshell.moveUpShort')}
              disabled={
                idx === 0 || item.kind === 'logout' || items[idx - 1]?.kind === 'logout'
              }
              className="h-5 w-5 border border-border-light hover:border-primary disabled:opacity-40 text-[10px]"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(idx, idx + 1)}
              data-testid={`user-menu-item-${idx}-down`}
              aria-label={t('appshell.moveDownShort')}
              disabled={
                idx === items.length - 1 ||
                item.kind === 'logout' ||
                items[idx + 1]?.kind === 'logout'
              }
              className="h-5 w-5 border border-border-light hover:border-primary disabled:opacity-40 text-[10px]"
            >
              ↓
            </button>
            {item.kind !== 'logout' && (
              <button
                type="button"
                onClick={() => remove(idx)}
                data-testid={`user-menu-item-${idx}-remove`}
                aria-label={t('appshell.removeItemAria')}
                className="h-5 w-5 border border-border-light hover:border-danger hover:text-danger flex items-center justify-center"
              >
                <Trash2 className="w-2.5 h-2.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
          {item.kind === 'divider' ? (
            <p className="text-[10px] text-muted-on-light italic">
              {t('appshell.userMenuDivider')}
            </p>
          ) : (
            <>
              <TextInput
                value={item.label}
                onChange={(v) => patch(idx, { label: v })}
                placeholder={t('appshell.userMenuItemLabelPlaceholder')}
                testId={`user-menu-item-${idx}-label`}
              />
              {item.kind === 'link' && (
                <>
                  {/* Onda K.4 (Feedback #4) — destino por página. */}
                  <RouteSelect
                    value={item.href ?? ''}
                    onChange={(v) =>
                      patch(idx, { href: v.trim() === '' ? null : v })
                    }
                    placeholder={t('appshell.userMenuNoDest')}
                    data-testid={`user-menu-item-${idx}-href`}
                  />
                  <select
                    data-testid={`user-menu-item-${idx}-icon`}
                    value={item.icon ?? ''}
                    onChange={(e) =>
                      patch(idx, {
                        icon: e.target.value === '' ? null : e.target.value,
                      })
                    }
                    className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                  >
                    <option value="">{t('appshell.noIcon')}</option>
                    {USER_MENU_ICONS.map((ic) => (
                      <option key={ic} value={ic}>
                        {ic}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <Toggle
                checked={item.visible !== false}
                onChange={(v) => patch(idx, { visible: v })}
                label={t('appshell.userMenuVisible')}
                testId={`user-menu-item-${idx}-visible-toggle`}
              />
            </>
          )}
        </div>
          )}
        </SortableRow>
      ))}
      </SortableList>
      <div className="flex gap-1.5">
        {/* logout precisa estar no fim — find logout index e insere antes */}
        {(() => {
          const logoutIdx = items.findIndex((i) => i.kind === 'logout');
          const splice = (newItem: AppShellUserMenuItem) => {
            const copy = [...items];
            const insertAt = logoutIdx < 0 ? copy.length : logoutIdx;
            copy.splice(insertAt, 0, newItem);
            update(copy);
          };
          return (
            <>
              <Button
                variant="outline"
                size="sm"
                data-testid="user-menu-add-link"
                onClick={() =>
                  splice({
                    key: `link-${Date.now()}`,
                    label: t('appshell.userMenuNewLink'),
                    icon: 'circle',
                    href: '/',
                    kind: 'link',
                    visible: true,
                  })
                }
              >
                <Plus className="w-3 h-3" strokeWidth={1.5} />
                {t('appshell.userMenuAddLink')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="user-menu-add-divider"
                onClick={() =>
                  splice({
                    key: `div-${Date.now()}`,
                    label: '',
                    icon: null,
                    href: null,
                    kind: 'divider',
                    visible: true,
                  })
                }
              >
                <Minus className="w-3 h-3" strokeWidth={1.5} />
                {t('appshell.userMenuAddDivider')}
              </Button>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── Wave H.4.Y — Página inicial (redirect editor) ──────────────────────────

/**
 * Onda J.1 (2026-05-23) — aba "Página inicial" = seletor + atalho.
 *
 * Antes (Wave H.4.Y) esta aba tinha um editor inline de "blocos rápidos"
 * de 4 tipos (heading/paragraph/divider/link), que renderizava em `/`
 * via `HomepageMount`. Essa camada era redundante e fraca perto do
 * editor de Páginas (que reusa o Workshop completo, 78 widgets).
 *
 * Por `feedback_no_deprecation` (delete limpo, sem meio-termo), o editor
 * de 4 tipos foi REMOVIDO. A aba agora:
 *   (a) deixa o operador escolher QUAL Página é a inicial (dropdown das
 *       Páginas publicadas + "Home padrão (seed)");
 *   (b) leva ao editor de Páginas (Workshop completo) da escolhida;
 *   (c) explica a resolução de `/`.
 *
 * A escolha persiste em `config.homepage.page_id` (gravado no PUT
 * app-shell, que emite LineageEvent). Sem escolha → `/` usa o seed.
 */
function HomepageTabInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [pages, setPages] = React.useState<RegisteredPage[] | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Slug da Página inicial escolhida; '' = Home padrão (seed).
  const selectedSlug = draft.homepage?.page_id ?? '';

  React.useEffect(() => {
    let cancelled = false;
    Pages.list()
      .then((list) => {
        if (!cancelled) setPages(list);
      })
      .catch((e) => {
        if (!cancelled)
          setLoadErr((e as Error)?.message ?? 'Falha ao listar páginas');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSelected = (slug: string) => {
    onChange({
      ...draft,
      homepage: {
        ...draft.homepage,
        page_id: slug === '' ? null : slug,
      },
    });
  };

  // Abre o editor de Páginas (Workshop) da Página inicial. Quando a
  // escolha é "seed" (sem slug) cria uma Página "inicio" e a adota.
  const openEditor = async () => {
    setErr(null);
    setCreating(true);
    try {
      let slug = selectedSlug;
      if (slug === '') {
        slug = 'inicio';
        try {
          await Pages.get(slug);
        } catch {
          await Pages.create({
            slug,
            title: t('appshell.homepageTitleNew'),
            route: '/',
            status: 'draft',
            workspace_bindings: {
              operacao_id: null,
              espaco_id: null,
              sala_id: null,
            },
            marking_requirements: [],
            iam_perm_required: null,
            config: {},
          });
        }
        setSelected(slug);
      }
      router.push(`/painel-de-controle/paginas/${slug}/edit`);
    } catch (e) {
      setErr((e as Error)?.message ?? t('appshell.homepageOpenError'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="inspector-homepage">
      <p className="text-[11px] text-muted-on-light">
        {t('appshell.homepageHelp')}
      </p>

      <div>
        <FieldLabel>{t('appshell.homepageWhich')}</FieldLabel>
        <select
          data-testid="homepage-page-select"
          value={selectedSlug}
          onChange={(e) => setSelected(e.target.value)}
          aria-label={t('appshell.homepageAria')}
          className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
        >
          <option value="">{t('appshell.homepageSeedOption')}</option>
          {(pages ?? []).map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title} — /{p.slug}
            </option>
          ))}
        </select>
        {loadErr && (
          <p
            data-testid="homepage-pages-error"
            className="text-[10px] text-danger font-mono mt-1"
          >
            {loadErr}
          </p>
        )}
        <p className="text-[10.5px] text-muted-on-light italic mt-1">
          {selectedSlug === ''
            ? t('appshell.homepageSeedHelp')
            : t('appshell.homepageFromPageHelp').replace('{slug}', selectedSlug)}
        </p>
      </div>

      <Button
        variant="success"
        size="sm"
        data-testid="homepage-open-editor"
        onClick={() => void openEditor()}
        disabled={creating}
      >
        <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
        {creating ? t('appshell.homepageOpening') : t('appshell.homepageOpenEditor')}
      </Button>
      {err && (
        <p
          data-testid="homepage-error"
          className="text-small text-danger font-mono"
        >
          {err}
        </p>
      )}
    </div>
  );
}

function ContextInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-3" data-testid="inspector-context">
      {/* Onda K.4 (Feedback #5) — propósito CLARO. O operador reclamou
          que não sabia pra que servia nem via resultado. */}
      <div className="bg-canvas-light border border-border-light p-2.5">
        <p className="text-[12px] font-semibold text-text-on-light flex items-center gap-1.5">
          <ArrowLeftRight className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
          {t('appshell.contextTitle')}
        </p>
        <p className="text-[10.5px] text-muted-on-light mt-1 leading-snug">
          {t('appshell.contextHelp')}
        </p>
      </div>

      <Toggle
        checked={draft.context_switcher.visible}
        onChange={(v) =>
          onChange({
            ...draft,
            context_switcher: { ...draft.context_switcher, visible: v },
          })
        }
        label={t('appshell.contextVisible')}
        testId="context-visible-toggle"
      />
      <Toggle
        checked={draft.context_switcher.show_promoted_workspaces}
        onChange={(v) =>
          onChange({
            ...draft,
            context_switcher: {
              ...draft.context_switcher,
              show_promoted_workspaces: v,
            },
          })
        }
        label={t('appshell.contextPromoted')}
        testId="context-promoted-toggle"
      />
      <div>
        <FieldLabel>{t('appshell.contextDefaultScope')}</FieldLabel>
        <div className="flex gap-1.5">
          {(['org', 'tenant', 'personal'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  context_switcher: {
                    ...draft.context_switcher,
                    default_scope: s,
                  },
                })
              }
              data-testid={`context-scope-${s}`}
              className={cn(
                'h-7 px-2 text-[11px] border border-border-light',
                draft.context_switcher.default_scope === s
                  ? 'bg-primary text-white border-primary'
                  : 'hover:border-primary',
              )}
            >
              {s === 'org'
                ? t('appshell.contextScopeOrg')
                : s === 'tenant'
                  ? t('appshell.contextScopeTenant')
                  : t('appshell.contextScopePersonal')}
            </button>
          ))}
        </div>
      </div>

      {/* Onda K.4 (Feedback #5) — preview do resultado. */}
      <div className="border border-border-light p-2 bg-canvas-light">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1.5">
          {t('appshell.contextPreviewHeader')}
        </p>
        {draft.context_switcher.visible ? (
          <div
            data-testid="context-preview"
            className="h-9 px-2 flex items-center gap-2 bg-primary text-white text-[11px]"
          >
            <span className="font-semibold tracking-[0.16em]">AEGIS</span>
            {draft.context_switcher.show_promoted_workspaces && (
              <span
                data-testid="context-preview-salas"
                className="inline-flex items-center gap-1 border border-white/40 px-1.5 h-6"
              >
                <Store className="w-3 h-3" strokeWidth={1.5} aria-hidden />
                {t('appshell.contextPreviewRooms')}
              </span>
            )}
            <span
              data-testid="context-preview-trocar"
              className="ml-auto inline-flex items-center gap-1 border border-white/40 px-1.5 h-6"
            >
              <ArrowLeftRight className="w-3 h-3" strokeWidth={1.5} aria-hidden />
              {t('appshell.contextPreviewSwitch')}
            </span>
          </div>
        ) : (
          <p
            data-testid="context-preview-hidden"
            className="text-[11px] text-muted-on-light italic px-2 py-2"
          >
            {t('appshell.contextPreviewHidden')}
          </p>
        )}
      </div>
    </div>
  );
}

function ThemeInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2" data-testid="inspector-theme">
      <FieldLabel>{t('appshell.themeLabel')}</FieldLabel>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...draft, theme: 'light' })}
          data-testid="theme-light"
          className={cn(
            'h-12 border text-[12px] flex items-center justify-center',
            draft.theme === 'light'
              ? 'border-primary bg-primary/10 text-primary font-semibold'
              : 'border-border-light hover:border-primary',
          )}
        >
          {t('appshell.themeLight')}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...draft, theme: 'dark' })}
          data-testid="theme-dark"
          className={cn(
            'h-12 border text-[12px] flex items-center justify-center',
            draft.theme === 'dark'
              ? 'border-primary bg-primary/10 text-primary font-semibold'
              : 'border-border-light hover:border-primary',
          )}
        >
          {t('appshell.themeDark')}
        </button>
      </div>
    </div>
  );
}

// ── M2 (2026-05-24) — "Login" inspector + preview ──────────────────────────
//
// Personalização da tela /login pela marca do tenant, COM opção de ocultar
// (toggle "usar marca padrão AEGIS no login"). Quando o toggle está LIGADO,
// a /login mostra a marca AEGIS neutra e os campos de marca ficam ocultos.
// Quando DESLIGADO, o operador define logo (upload/URL), slogan, cor, fundo
// e mensagem. O endpoint público GET /styles/brand/public lê este bloco e
// devolve só campos seguros pré-login.

const DEFAULT_LOGIN_BLOCK: AppShellLoginConfig = {
  use_default_aegis: true,
  logo_url: null,
  slogan: null,
  background: null,
  primary_color: null,
  message: null,
};

function LoginInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  const t = useT();
  const login = draft.login ?? DEFAULT_LOGIN_BLOCK;
  const setLogin = (patch: Partial<AppShellLoginConfig>) =>
    onChange({ ...draft, login: { ...login, ...patch } });
  const [uploading, setUploading] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    setUploadErr(null);
    setUploading(true);
    try {
      const out = await Styles.uploadLogo(file);
      setLogin({ logo_url: out.url });
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : t('appshell.loginLogoUploadFailed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const usingDefault = login.use_default_aegis;

  return (
    <div className="space-y-3" data-testid="inspector-login">
      <div className="border border-border-light p-2.5 bg-canvas-light space-y-2">
        <p className="text-[11px] font-semibold text-text-on-light flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} aria-hidden />
          {t('appshell.loginBrandTitle')}
        </p>
        <p className="text-[10.5px] text-muted-on-light leading-snug">
          {t('appshell.loginBrandHelp')}
        </p>
        <Toggle
          checked={usingDefault}
          onChange={(v) => setLogin({ use_default_aegis: v })}
          label={t('appshell.loginUseDefault')}
          testId="login-use-default-toggle"
        />
      </div>

      {!usingDefault && (
        <div className="space-y-3" data-testid="login-brand-fields">
          <div>
            <FieldLabel>{t('appshell.loginLogo')}</FieldLabel>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              data-testid="login-logo-file"
              aria-label={t('appshell.loginLogoFileAria')}
              onChange={(e) => void onPickLogo(e.target.files?.[0])}
              className="block w-full text-[11px] text-muted-on-light file:mr-2 file:h-7 file:border file:border-border-light file:bg-white file:px-2 file:text-[11px] hover:file:border-primary"
              disabled={uploading}
            />
            {uploading && (
              <p
                data-testid="login-logo-uploading"
                className="text-[10.5px] text-muted-on-light italic mt-1"
              >
                {t('appshell.loginLogoUploading')}
              </p>
            )}
            {uploadErr && (
              <p
                data-testid="login-logo-error"
                className="text-[10.5px] text-danger mt-1"
              >
                {uploadErr}
              </p>
            )}
            <div className="mt-1.5">
              <TextInput
                value={login.logo_url ?? ''}
                onChange={(v) =>
                  setLogin({ logo_url: v.trim() === '' ? null : v })
                }
                placeholder={t('appshell.loginLogoUrlPlaceholder')}
                testId="login-logo-url-input"
              />
              <p className="text-[10px] text-muted-on-light italic mt-1">
                {t('appshell.loginLogoHelp')}
              </p>
            </div>
          </div>

          <div>
            <FieldLabel>{t('appshell.loginSlogan')}</FieldLabel>
            <TextInput
              value={login.slogan ?? ''}
              onChange={(v) => setLogin({ slogan: v.trim() === '' ? null : v })}
              placeholder={t('appshell.loginSloganPlaceholder')}
              testId="login-slogan-input"
            />
          </div>

          <div>
            <FieldLabel>{t('appshell.loginAccent')}</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={login.primary_color ?? '#2D77BE'}
                onChange={(e) => setLogin({ primary_color: e.target.value })}
                data-testid="login-primary-color-picker"
                aria-label={t('appshell.loginAccentAria')}
                className="h-8 w-10 border border-border-light bg-white p-0.5"
              />
              <TextInput
                value={login.primary_color ?? ''}
                onChange={(v) =>
                  setLogin({ primary_color: v.trim() === '' ? null : v })
                }
                placeholder="#2D77BE"
                testId="login-primary-color-input"
              />
            </div>
            <p className="text-[10px] text-muted-on-light italic mt-1">
              {t('appshell.loginAccentHelp')}
            </p>
          </div>

          <div>
            <FieldLabel>{t('appshell.loginBackground')}</FieldLabel>
            <TextInput
              value={login.background ?? ''}
              onChange={(v) =>
                setLogin({ background: v.trim() === '' ? null : v })
              }
              placeholder="https://…/fundo.jpg"
              testId="login-background-input"
            />
          </div>

          <div>
            <FieldLabel>{t('appshell.loginMessage')}</FieldLabel>
            <TextInput
              value={login.message ?? ''}
              onChange={(v) =>
                setLogin({ message: v.trim() === '' ? null : v })
              }
              placeholder={t('appshell.loginMessagePlaceholder')}
              testId="login-message-input"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Prévia ao vivo da tela de login. Replica a estrutura visual do
 * `app/login/page.tsx` (cartão centralizado + logo/slogan/mensagem + form
 * inerte) usando o bloco `draft.login`. Quando `use_default_aegis` está
 * ligado, mostra a marca AEGIS neutra.
 */
function LoginPreview({ login }: { login?: AppShellLoginConfig }) {
  const t = useT();
  const brand = useBrand();
  const block = login ?? DEFAULT_LOGIN_BLOCK;
  const useDefault = block.use_default_aegis;
  const logoUrl = useDefault
    ? '/aegis-logo.svg'
    : block.logo_url || '/aegis-logo.svg';
  const slogan = useDefault
    ? t('appshell.loginPreviewSlogan')
    : block.slogan || t('appshell.loginPreviewSlogan');
  const accent = useDefault ? undefined : block.primary_color || undefined;
  const background = useDefault ? undefined : block.background || undefined;
  const message = useDefault ? null : block.message || null;

  return (
    <div
      data-testid="login-preview"
      data-brand-default={useDefault ? 'true' : 'false'}
      className="border border-border-light bg-panel-light overflow-hidden"
      style={
        background
          ? {
              backgroundImage: `url(${background})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      <div className="p-8 flex items-center justify-center">
        <div className="w-full max-w-[300px] bg-canvas-light border border-border-light">
          <div className="px-5 py-4 border-b border-border-light flex flex-col items-center gap-1.5">
            {/* Onda M3 (2026-05-24) — sem filtro `invert`: o logo AEGIS padrão
                (aegis-logo.svg) já é azul (#2D77BE); inverter o azul produzia
                laranja. Renderiza o logo na cor real da marca — idêntico ao
                que a /login exibe (logo do tenant ou o AEGIS azul). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt=""
              width={28}
              height={28}
              data-testid="login-preview-logo"
              style={{ width: 28, height: 28, objectFit: 'contain' }}
            />
            <p
              className="text-[9px] font-mono tracking-[0.32em] uppercase"
              data-testid="login-preview-name"
            >
              {/* Onda brand (2026-07-09) — espelha exatamente o que a
                  /login real mostra (`brand?.pwa_name || 'AEGIS'`, ver
                  app/login/page.tsx); antes era um literal fixo que
                  ignorava a Marca configurada em styles-configurator. */}
              {brand.pwa_name || 'AEGIS'}
            </p>
            <p
              className="text-[9px] font-mono text-muted-on-light text-center"
              data-testid="login-preview-slogan"
            >
              {slogan}
            </p>
            {message && (
              <p
                className="text-[10px] text-text-on-light text-center mt-1"
                data-testid="login-preview-message"
              >
                {message}
              </p>
            )}
          </div>
          <div className="px-5 py-4 space-y-2.5">
            <div className="h-7 border border-border-light bg-white" aria-hidden />
            <div className="h-7 border border-border-light bg-white" aria-hidden />
            <div
              data-testid="login-preview-submit"
              className="h-7 bg-primary text-white text-[10px] uppercase tracking-[0.18em] flex items-center justify-center"
              style={accent ? { backgroundColor: accent } : undefined}
            >
              {t('appshell.loginPreviewSubmit')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Wave F.1 + Onda I.5 — "Loja de apps" inspector ─────────────────────────
//
// Onda I.5 (Feedback operador #4): a aba era só uma lista de Habilitar/
// Instalar sem contexto. Refinada para gerir a NAVEGAÇÃO dos apps já
// instalados — cada app ganha toggle "Visível na navegação" + posição
// (menu de apps / sidenav / oculto), reorder por arraste (@dnd-kit via
// SortableList), toggle global do menu Apps no header e atalho pra Loja
// completa. Preview do menu Apps populado fica no canvas (ver Canvas).
//
// Backend: app_shell.marketplace.apps_menu = {enabled, items:[{product_id,
// position, order}]} — persistido no PUT /app-shell + LineageEvent.

const APP_POSITION_OPTIONS: {
  value: AppShellAppMenuPosition;
  labelKey: string;
}[] = [
  { value: 'menu', labelKey: 'appshell.marketplacePosMenu' },
  { value: 'sidenav', labelKey: 'appshell.marketplacePosSidenav' },
  { value: 'hidden', labelKey: 'appshell.marketplacePosHidden' },
];

/** Linha mesclada: produto rico (nome/icon/slug) + posição/ordem do config. */
interface AppRow {
  product_id: string;
  slug: string;
  display_name: string;
  thumbnail_url: string | null;
  position: AppShellAppMenuPosition;
  order: number;
}

function emptyAppsMenu(): AppShellAppsMenuConfig {
  return { enabled: false, items: [] };
}

/**
 * Onda I.5 — preview do cabeçalho com o menu Apps aberto. Busca nomes
 * (storefront) + apps instalados (installed) e resolve a posição de cada
 * um exatamente como o inspetor: apps instalados sem entry explícita no
 * apps_menu.items assumem 'menu'. Mantém preview e inspetor coerentes sem
 * sujar o draft (a config só grava overrides quando o operador mexe).
 */
function AppsMenuHeaderPreview({
  appsMenu,
}: {
  appsMenu: AppShellAppsMenuConfig;
}) {
  const t = useT();
  const [names, setNames] = React.useState<Map<string, string>>(new Map());
  const [installedIds, setInstalledIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    let cancel = false;
    Promise.all([Marketplace.storefront(), Marketplace.installed()])
      .then(([rich, inst]) => {
        if (cancel) return;
        setNames(new Map(rich.map((p) => [p.id, p.display_name])));
        // Dedup product_id (reinstalações geram múltiplos registros).
        setInstalledIds([...new Set(inst.map((i) => i.product_id))]);
      })
      .catch(() => {
        /* preview é best-effort; sem dados mostra o estado vazio */
      });
    return () => {
      cancel = true;
    };
  }, []);

  const cfgById = new Map(appsMenu.items.map((it) => [it.product_id, it]));
  const menuItems = installedIds
    .map((id, idx) => {
      const cfg = cfgById.get(id);
      return {
        product_id: id,
        position: cfg?.position ?? ('menu' as AppShellAppMenuPosition),
        order: cfg?.order ?? idx,
      };
    })
    .filter((it) => it.position === 'menu')
    .sort((a, b) => a.order - b.order);

  return (
    <div
      data-testid="apps-menu-preview"
      className="border border-border-light bg-white overflow-hidden"
    >
      {/* Header mock */}
      <div className="h-10 px-3 bg-primary text-white flex items-center gap-3">
        <span className="text-[12px] font-semibold tracking-[0.18em]">
          AEGIS
        </span>
        <span
          data-testid="apps-menu-preview-trigger"
          data-enabled={appsMenu.enabled ? 'true' : 'false'}
          className={cn(
            'ml-auto inline-flex items-center gap-1 h-7 px-2 text-[11px] border border-white/40',
            appsMenu.enabled ? 'opacity-100' : 'opacity-40 line-through',
          )}
        >
          <Store className="w-3 h-3" strokeWidth={1.5} aria-hidden />
          {t('appshell.appsMenuTrigger')}
        </span>
      </div>
      {/* Dropdown mock */}
      {appsMenu.enabled ? (
        <div className="p-2 bg-canvas-light border-t border-border-light">
          {menuItems.length === 0 ? (
            <p
              data-testid="apps-menu-preview-empty"
              className="text-[11px] text-muted-on-light italic px-2 py-3 text-center"
            >
              {t('appshell.appsPreviewTriggerEmpty')}
            </p>
          ) : (
            <ul className="bg-white border border-border-light divide-y divide-border-light">
              {menuItems.map((it) => (
                <li
                  key={it.product_id}
                  data-testid={`apps-menu-preview-item-${it.product_id}`}
                  className="px-3 h-9 flex items-center gap-2 text-[12px] text-text-on-light"
                >
                  <Store
                    className="w-3.5 h-3.5 text-primary shrink-0"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="truncate">
                    {names.get(it.product_id) ?? it.product_id}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p
          data-testid="apps-menu-preview-disabled"
          className="text-[11px] text-muted-on-light italic px-3 py-4 text-center border-t border-border-light"
        >
          {t('appshell.appsPreviewDisabled')}
        </p>
      )}
    </div>
  );
}

function MarketplaceInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [products, setProducts] = React.useState<MarketplaceProductRich[]>([]);
  const [installed, setInstalled] = React.useState<MarketplaceInstall[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  // Onda K.4 (Feedback #10) — apps em instalação (spinner por card).
  const [installingId, setInstallingId] = React.useState<string | null>(null);

  const reload = React.useCallback(() => {
    let cancel = false;
    setLoading(true);
    Promise.all([Marketplace.storefront(), Marketplace.installed()])
      .then(([rich, inst]) => {
        if (cancel) return;
        setProducts(rich);
        setInstalled(inst);
        setLoading(false);
      })
      .catch((e) => {
        if (cancel) return;
        setErr((e as Error)?.message ?? t('appshell.marketplaceListError'));
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    return reload();
  }, [reload]);

  // Onda K.4 (Feedback #10) — instala um app direto da aba (a seção de
  // apps disponíveis voltou). Após instalar, recarrega as listas.
  const handleInstall = async (productId: string) => {
    setErr(null);
    setInstallingId(productId);
    try {
      await Marketplace.installWizard(productId, { confirm_text: 'instalar' });
      reload();
    } catch (e) {
      setErr((e as Error)?.message ?? t('appshell.marketplaceInstallError'));
    } finally {
      setInstallingId(null);
    }
  };

  const appsMenu = draft.marketplace?.apps_menu ?? emptyAppsMenu();
  const enabledSlugs = draft.marketplace?.enabled_app_slugs ?? [];

  const setAppsMenu = (next: AppShellAppsMenuConfig) => {
    onChange({
      ...draft,
      marketplace: {
        enabled_app_slugs: enabledSlugs,
        apps_menu: next,
      },
    });
  };

  // Mescla installs com metadados ricos + config de menu. Apps instalados
  // sem entry no apps_menu.items entram com posição default 'menu'.
  // Dedup por product_id: o backend pode ter mais de um registro de install
  // para o mesmo produto (reinstalações); a UI mostra uma linha por produto.
  const rows: AppRow[] = React.useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const cfgById = new Map(appsMenu.items.map((it) => [it.product_id, it]));
    const seen = new Set<string>();
    const uniqueInstalls = installed.filter((inst) => {
      if (seen.has(inst.product_id)) return false;
      seen.add(inst.product_id);
      return true;
    });
    const list = uniqueInstalls.map((inst, idx) => {
      const p = byId.get(inst.product_id);
      const cfg = cfgById.get(inst.product_id);
      return {
        product_id: inst.product_id,
        slug: p?.slug ?? inst.product_id,
        display_name: p?.display_name ?? inst.product_id,
        thumbnail_url: p?.thumbnail_url ?? null,
        position: cfg?.position ?? 'menu',
        order: cfg?.order ?? idx,
      } as AppRow;
    });
    return list.sort((a, b) => a.order - b.order);
  }, [products, installed, appsMenu.items]);

  // Onda K.4 (Feedback #10) — apps DISPONÍVEIS (storefront) ainda não
  // instalados. Esta seção tinha sumido quando a aba virou só-navegação;
  // restaurada ADITIVAMENTE (feedback_no_deprecation).
  const availableProducts = React.useMemo(() => {
    const installedIds = new Set(installed.map((i) => i.product_id));
    return products.filter((p) => !installedIds.has(p.id));
  }, [products, installed]);

  // Persiste a ordem/posição atual de `rows` de volta no config.
  const commitRows = (next: AppRow[]) => {
    setAppsMenu({
      enabled: appsMenu.enabled,
      items: next.map((r, idx) => ({
        product_id: r.product_id,
        position: r.position,
        order: idx,
      })),
    });
  };

  const setPosition = (productId: string, position: AppShellAppMenuPosition) => {
    commitRows(
      rows.map((r) => (r.product_id === productId ? { ...r, position } : r)),
    );
  };

  const setVisible = (productId: string, visible: boolean) => {
    // Visível na navegação = posição 'menu' (default). Oculto = 'hidden'.
    setPosition(productId, visible ? 'menu' : 'hidden');
  };

  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return;
    const copy = [...rows];
    const [it] = copy.splice(from, 1);
    copy.splice(to, 0, it);
    commitRows(copy);
  };

  return (
    <div className="space-y-3" data-testid="inspector-marketplace">
      {/* Header explicativo (Feedback #4: faltava contexto). */}
      <div className="bg-canvas-light border border-border-light p-2.5">
        <p className="text-[12px] font-semibold text-text-on-light flex items-center gap-1.5">
          <Store className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
          {t('appshell.marketplaceTitle')}
        </p>
        <p className="text-[10.5px] text-muted-on-light mt-1 leading-snug">
          {t('appshell.marketplaceHelp')}
        </p>
      </div>

      {/* Onda K.4 (Feedback #10) — seção "Apps disponíveis" RESTAURADA.
          O operador perguntou "cadê as páginas que ficavam na edição de
          Apps antes?". Aqui voltam os apps da Loja ainda não instalados,
          com botão Instalar direto. */}
      {!loading && availableProducts.length > 0 && (
        <div data-testid="apps-available-section" className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-on-light">
            {t('appshell.marketplaceAvailableTitle').replace(
              '{count}',
              String(availableProducts.length),
            )}
          </p>
          <ul className="space-y-1.5">
            {availableProducts.map((p) => (
              <li
                key={p.id}
                data-testid={`apps-available-${p.id}`}
                className="bg-white border border-border-light p-2 flex items-center gap-2"
              >
                <span className="inline-flex w-5 h-5 items-center justify-center bg-canvas-light border border-border-light shrink-0">
                  <Store
                    className="w-3 h-3 text-primary"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold truncate">
                    {p.display_name}
                  </p>
                  <p className="text-[10px] font-mono text-muted-on-light truncate">
                    {p.slug}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`apps-available-${p.id}-install`}
                  disabled={installingId !== null}
                  onClick={() => void handleInstall(p.id)}
                >
                  <Plus className="w-3 h-3" strokeWidth={1.5} />
                  {installingId === p.id
                    ? t('appshell.marketplaceInstalling')
                    : t('appshell.marketplaceInstall')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Toggle global do menu Apps no header. */}
      <div className="border border-border-light p-2.5 bg-white">
        <Toggle
          checked={appsMenu.enabled}
          onChange={(v) =>
            setAppsMenu({ enabled: v, items: appsMenu.items })
          }
          label={t('appshell.marketplaceMenuEnabled')}
          testId="apps-menu-enabled-toggle"
        />
        <p className="text-[10px] text-muted-on-light italic mt-1 pl-6">
          {t('appshell.marketplaceMenuEnabledHelp')}
        </p>
      </div>

      {loading && (
        <p
          data-testid="marketplace-loading"
          className="text-small text-muted-on-light italic"
        >
          {t('appshell.marketplaceLoading')}
        </p>
      )}
      {err && (
        <p
          data-testid="marketplace-error"
          className="text-small text-danger font-mono"
        >
          {err}
        </p>
      )}
      {!loading && !err && rows.length === 0 && (
        <div
          data-testid="marketplace-empty"
          className="border border-dashed border-border-light p-4 text-center space-y-2"
        >
          <p className="text-[12px] text-text-on-light font-medium">
            {t('appshell.marketplaceEmptyTitle')}
          </p>
          <p className="text-[11px] text-muted-on-light">
            {t('appshell.marketplaceEmptyHelp')}
          </p>
          <Button
            variant="outline"
            size="sm"
            data-testid="apps-menu-go-loja-empty"
            onClick={() => router.push('/painel-de-controle/loja')}
          >
            <Store className="w-3.5 h-3.5" strokeWidth={1.5} />
            {t('appshell.marketplaceOpenStore')}
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-on-light">
            {t('appshell.marketplaceInstalledTitle').replace(
              '{count}',
              String(rows.length),
            )}
          </p>
          <SortableList
            ids={rows.map((r) => r.product_id)}
            onReorder={reorder}
            className="space-y-2"
            testId="apps-menu-sortable"
          >
            {rows.map((r) => (
              <SortableRow key={r.product_id} id={r.product_id}>
                {({ handleProps, isDragging }) => (
                  <div
                    data-testid={`apps-menu-row-${r.product_id}`}
                    data-position={r.position}
                    className={cn(
                      'bg-white border border-border-light p-2 space-y-1.5',
                      isDragging && 'border-primary',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        {...handleProps}
                        data-testid={`apps-menu-row-${r.product_id}-drag`}
                        aria-label={t('appshell.marketplaceReorderAria').replace(
                          '{name}',
                          r.display_name,
                        )}
                        className="w-4 h-4 flex items-center justify-center text-muted-on-light cursor-grab hover:text-primary touch-none focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <GripVertical
                          className="w-3 h-3"
                          aria-hidden
                          strokeWidth={1.5}
                        />
                      </button>
                      <span className="inline-flex w-5 h-5 items-center justify-center bg-canvas-light border border-border-light shrink-0">
                        <Store
                          className="w-3 h-3 text-primary"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold truncate">
                          {r.display_name}
                        </p>
                        <p className="text-[10px] font-mono text-muted-on-light truncate">
                          {r.slug}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-6">
                      <Toggle
                        checked={r.position !== 'hidden'}
                        onChange={(v) => setVisible(r.product_id, v)}
                        label={t('appshell.marketplaceVisibleNav')}
                        testId={`apps-menu-row-${r.product_id}-visible`}
                      />
                    </div>
                    <div className="pl-6">
                      <label
                        className="text-[10px] uppercase tracking-[0.12em] text-muted-on-light font-semibold block mb-0.5"
                        htmlFor={`apps-menu-row-${r.product_id}-position`}
                      >
                        {t('appshell.marketplacePosition')}
                      </label>
                      <select
                        id={`apps-menu-row-${r.product_id}-position`}
                        data-testid={`apps-menu-row-${r.product_id}-position`}
                        value={r.position}
                        onChange={(e) =>
                          setPosition(
                            r.product_id,
                            e.target.value as AppShellAppMenuPosition,
                          )
                        }
                        className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                      >
                        {APP_POSITION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {t(opt.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </SortableRow>
            ))}
          </SortableList>
        </>
      )}

      {/* Atalho pra Loja completa (Feedback #4: dar saída de fluxo). */}
      <Button
        variant="outline"
        size="sm"
        data-testid="apps-menu-go-loja"
        onClick={() => router.push('/painel-de-controle/loja')}
        className="w-full"
      >
        <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
        {t('appshell.marketplaceManageFull')}
      </Button>
    </div>
  );
}

// ── Wave F.1 — Permissões padrão (R2 permissions/{default-workspace,landing-page}.md) ──

function PermissionsInspector({
  draft,
  onChange,
}: {
  draft: AppShellConfig;
  onChange: (n: AppShellConfig) => void;
}) {
  const t = useT();
  const [salas, setSalas] = React.useState<Workspace[]>([]);
  const [roles, setRoles] = React.useState<IamRole[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancel = false;
    Workspaces.list()
      .then((items) => {
        if (!cancel) setSalas(items);
      })
      .catch((e) => {
        if (!cancel) setErr((e as Error)?.message ?? t('appshell.permsListRoomsError'));
      });
    Iam.roles
      .list()
      .then((items) => {
        if (!cancel) setRoles(items);
      })
      .catch(() => {
        /* swallow — roles é opcional na UI */
      });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perms = draft.permissions ?? {
    default_workspace_id: null,
    landing_page_overrides: [],
  };
  const overrides = perms.landing_page_overrides ?? [];

  const setDefault = (id: string | null) => {
    onChange({
      ...draft,
      permissions: {
        ...perms,
        default_workspace_id: id,
        landing_page_overrides: overrides,
      },
    });
  };

  const addOverride = (group_id: string) => {
    if (!group_id) return;
    onChange({
      ...draft,
      permissions: {
        ...perms,
        landing_page_overrides: [
          ...overrides,
          { group_id, url: '/' },
        ],
      },
    });
  };

  const updateOverride = (idx: number, patch: { url?: string }) => {
    const next = overrides.slice();
    if (!next[idx]) return;
    next[idx] = { ...next[idx], ...patch };
    onChange({
      ...draft,
      permissions: { ...perms, landing_page_overrides: next },
    });
  };

  const removeOverride = (idx: number) => {
    const next = overrides.slice();
    next.splice(idx, 1);
    onChange({
      ...draft,
      permissions: { ...perms, landing_page_overrides: next },
    });
  };

  const availableRoles = roles.filter(
    (r) => !overrides.some((o) => o.group_id === r.id),
  );

  return (
    <div className="space-y-3" data-testid="inspector-permissions">
      {err && (
        <p
          data-testid="permissions-error"
          className="text-small text-danger font-mono"
        >
          {err}
        </p>
      )}

      <div>
        <FieldLabel>{t('appshell.permsDefaultRoom')}</FieldLabel>
        <p className="text-[10.5px] text-muted-on-light italic mb-1">
          {t('appshell.permsDefaultRoomHelp')}
        </p>
        <select
          data-testid="permissions-default-select"
          value={perms.default_workspace_id ?? ''}
          onChange={(e) => setDefault(e.target.value || null)}
          className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
        >
          <option value="">{t('appshell.permsDefaultRoomNone')}</option>
          {salas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name} ({s.slug})
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel>{t('appshell.permsOverridesLabel')}</FieldLabel>
        <p className="text-[10.5px] text-muted-on-light italic mb-1">
          {t('appshell.permsOverridesHelp')}
        </p>

        {overrides.length === 0 && (
          <p
            data-testid="permissions-overrides-empty"
            className="text-small text-muted-on-light italic"
          >
            {t('appshell.permsOverridesEmpty')}
          </p>
        )}

        <ul className="space-y-1.5" data-testid="permissions-overrides">
          {overrides.map((o, idx) => {
            const roleName =
              roles.find((r) => r.id === o.group_id)?.name ?? o.group_id;
            return (
              <li
                key={`override-${idx}`}
                data-testid={`permissions-override-${idx}`}
                className="bg-white border border-border-light p-2 space-y-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <KeyRound
                    className="w-3 h-3 text-primary shrink-0"
                    strokeWidth={1.5}
                  />
                  <span className="flex-1 text-[11.5px] font-semibold truncate">
                    {roleName}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeOverride(idx)}
                    data-testid={`permissions-override-${idx}-remove`}
                    aria-label={t('appshell.permsOverrideRemoveAria')}
                    className="h-6 w-6 inline-flex items-center justify-center bg-canvas-light border border-border-light hover:border-danger hover:text-danger"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </div>
                {/* Onda K.4 (Feedback #4) — destino por página, não URL crua. */}
                <RouteSelect
                  value={o.url}
                  onChange={(v) => updateOverride(idx, { url: v })}
                  placeholder={t('appshell.permsOverrideUrlPlaceholder')}
                  data-testid={`permissions-override-${idx}-url`}
                />
              </li>
            );
          })}
        </ul>

        <select
          data-testid="permissions-add-override"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) {
              addOverride(v);
              e.target.value = '';
            }
          }}
          className="w-full h-8 px-2 mt-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
        >
          <option value="">
            {availableRoles.length === 0
              ? t('appshell.permsAddOverrideAll')
              : t('appshell.permsAddOverridePrompt')}
          </option>
          {availableRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
