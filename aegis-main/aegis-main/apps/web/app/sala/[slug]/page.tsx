'use client';

/**
 * /sala/[slug] — Sprint PR2 (2026-05-22).
 *
 * Viewer Carbon-like de uma Sala (Workspace). Surface dedicada fora do
 * painel de controle. Estrutura espelha o Foundry Carbon Workspace:
 *
 *   - Menu Bar (topo): Navigation Menu (dropdown promoted) + Tabs +
 *     Module Button + Utility (perfil, ajuda, voltar).
 *   - Home Page: search Ontology-aware + colunas configuráveis com
 *     links para módulos, object types e Foundry resources.
 *
 * MVP: tabs vêm de `config.tabs[]`; cada tab abre uma rota da app.
 * Home page exibe Operação dona da Sala + atalhos para Marcações/Tours.
 *
 * Gated por `workspace.read`.
 */
import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Search,
  Edit3,
  ArrowLeft,
  HelpCircle,
  User,
  Tag,
  BookOpen,
  FolderSearch,
  ChevronDown,
  Boxes,
  Database,
  Info,
  X,
  Lock,
} from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { NavigationGuard } from '@/components/sala/navigation-guard';
import { useGuardedRouter } from '@/components/sala/use-guarded-router';
import {
  Workspaces,
  WorkspacePromotions,
  Projects,
  deriveKnownApplications,
  decideNavigation,
  type Workspace,
  type PromotedWorkspace,
  type KnownApplication,
} from '@/lib/api';

export default function SalaViewerPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug as string;
  const [sala, setSala] = React.useState<Workspace | null>(null);
  const [projectName, setProjectName] = React.useState<string | null>(null);
  const [navMenu, setNavMenu] = React.useState<PromotedWorkspace[]>([]);
  const [navOpen, setNavOpen] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // Onda L.4 — catálogo de aplicações conhecidas (rotas reais via
  // Pages.list); alimenta o filtro de atalhos e o interceptor de
  // navegação. Fallback estático embutido em deriveKnownApplications.
  const [knownApps, setKnownApps] = React.useState<KnownApplication[]>([]);
  // Wave F.1 — Onboarding card (R2 getting-started.md). Visível na 1a
  // visita; cookie marca como vista. NÃO usa localStorage (Memory:
  // feedback_no_localstorage_for_persistence — cookies são aceitáveis
  // como cache transitório UX).
  const [showOnboarding, setShowOnboarding] = React.useState(false);

  React.useEffect(() => {
    if (!slug || typeof document === 'undefined') return;
    const cookieName = `aegis_sala_visited_${slug}`;
    const visited = document.cookie
      .split(';')
      .map((c) => c.trim())
      .some((c) => c.startsWith(`${cookieName}=`));
    setShowOnboarding(!visited);
  }, [slug]);

  const dismissOnboarding = React.useCallback(() => {
    if (!slug || typeof document === 'undefined') return;
    const cookieName = `aegis_sala_visited_${slug}`;
    // 1 ano = 60*60*24*365 = 31536000s. Path=/ pra cobrir toda a app.
    document.cookie = `${cookieName}=1; max-age=31536000; path=/; SameSite=Lax`;
    setShowOnboarding(false);
  }, [slug]);

  // Onda L.4 — carrega aplicações conhecidas uma vez (independe do slug).
  React.useEffect(() => {
    let alive = true;
    deriveKnownApplications()
      .then((apps) => {
        if (alive) setKnownApps(apps);
      })
      .catch(() => {
        /* deriveKnownApplications já cai no fallback estático */
      });
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!slug) return;
    Workspaces.getBySlug(slug)
      .then((w) => {
        setSala(w);
        // Look up parent Project name (if any).
        if (w.project_id) {
          Projects.list().then((all) => {
            const p = all.find((x) => x.id === w.project_id);
            setProjectName(p?.display_name ?? null);
          });
        }
        // Carregar promoted da Org ativa (nav menu).
        WorkspacePromotions.listForOrganization(w.tenant_id)
          .then(setNavMenu)
          .catch(() => setNavMenu([]));
      })
      .catch((e) => setErr((e as Error)?.message ?? 'Sala não encontrada'));
  }, [slug]);

  // Wave D.2: aplica/remove classe `dark` no <html> conforme
  // `config.carbon.theme`. `auto` segue a media-query do SO.
  React.useEffect(() => {
    const carbon = (sala?.config?.carbon as { theme?: 'light' | 'dark' | 'auto' } | undefined);
    const theme = carbon?.theme ?? 'light';
    const html = typeof document !== 'undefined' ? document.documentElement : null;
    if (!html) return;
    const apply = (mode: 'light' | 'dark') => {
      html.classList.toggle('dark', mode === 'dark');
      html.setAttribute('data-sala-theme', mode);
    };
    let mq: MediaQueryList | null = null;
    const onChange = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
    if (theme === 'auto' && typeof window !== 'undefined') {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches ? 'dark' : 'light');
      mq.addEventListener('change', onChange);
    } else if (theme === 'dark') {
      apply('dark');
    } else {
      apply('light');
    }
    return () => {
      if (mq) mq.removeEventListener('change', onChange);
      html.classList.remove('dark');
      html.removeAttribute('data-sala-theme');
    };
  }, [sala?.config]);

  if (err) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas-light text-text-on-light">
        <div className="bg-white border border-border-light p-6 max-w-[420px]">
          <p className="text-[13px] font-semibold mb-1">Sala não encontrada</p>
          <p className="text-[11.5px] text-muted-on-light mb-3">{err}</p>
          <Link
            href="/painel-de-controle/salas"
            className="text-[11.5px] text-primary hover:underline"
          >
            ← Ver catálogo de Salas
          </Link>
        </div>
      </div>
    );
  }

  if (!sala) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas-light text-text-on-light">
        <p className="text-[11.5px] text-muted-on-light italic">Carregando Sala…</p>
      </div>
    );
  }

  const tabs = Array.isArray(sala.config?.tabs)
    ? (sala.config?.tabs as string[])
    : [];
  const homePage = (sala.config?.home_page as string) ?? '';
  // Wave D.2 + Wave F.1 — Carbon (Sala) config.
  type HomeItemCfg = {
    kind: string;
    ref: string;
    label?: string;
  };
  type HomeSectionCfg = {
    title: string;
    displayAs?: 'LIST' | 'CARD';
    items?: HomeItemCfg[];
  };
  const carbon = (sala.config?.carbon as
    | {
        menuBar?: {
          visible?: boolean;
          items?: { label: string; href: string; position?: 'left' | 'right' }[];
        };
        homePage?: {
          welcomeText?: string;
          shouldHideSearchBar?: boolean;
          sections?: HomeSectionCfg[];
        };
      }
    | undefined);
  const menuBarVisible = carbon?.menuBar?.visible !== false;
  const menuBarItems = carbon?.menuBar?.items ?? [];
  const leftMenu = menuBarItems.filter((i) => (i.position ?? 'left') === 'left');
  const rightMenu = menuBarItems.filter((i) => i.position === 'right');

  // Wave F.1 — homePage extras
  const welcomeText = carbon?.homePage?.welcomeText;
  const hideSearchBar = carbon?.homePage?.shouldHideSearchBar === true;
  const configuredSections: HomeSectionCfg[] = carbon?.homePage?.sections ?? [];

  // ─── Onda L.4 — política de navegação (enforcement runtime) ───
  // A policy vive em `config.navigation` (Fase Foundry-I). Defaults
  // permissivos: navegação liberada + whitelist vazia (= todas as apps).
  const navCfg = (sala.config?.navigation as
    | { navigate_out_allowed?: boolean; allowed_applications?: string[] }
    | undefined);
  const navPolicy = {
    navigate_out_allowed: navCfg?.navigate_out_allowed !== false,
    allowed_applications: Array.isArray(navCfg?.allowed_applications)
      ? (navCfg?.allowed_applications as string[])
      : [],
  };
  const whitelistActive = navPolicy.allowed_applications.length > 0;
  const navRestricted = whitelistActive || !navPolicy.navigate_out_allowed;
  // Atalho: um href é permitido na barra de contexto/menu desta Sala?
  const hrefAllowedInBar = (href: string): boolean =>
    decideNavigation(href, navPolicy, knownApps) === 'allow';

  return (
    <RequirePerm perm="workspace.read">
      <NavigationGuard
        policy={navPolicy}
        knownApps={knownApps}
        currentSlug={slug}
      >
      <div
        className="h-screen flex flex-col bg-canvas-light dark:bg-deep text-text-on-light dark:text-text-on-dark"
        data-testid="sala-viewer"
      >
        {/* ─── Carbon Menu Bar — visível por padrão; toggle no composer ─── */}
        {menuBarVisible && (
        <header
          className="h-12 px-3 flex items-center gap-2 bg-white dark:bg-panel-dark border-b border-border-light dark:border-border-dark shrink-0"
          data-testid="sala-menu-bar"
        >
          {/* Sala name top-left (Foundry pattern). */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex w-7 h-7 items-center justify-center bg-canvas-light border border-border-light">
              <LayoutDashboard className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
            </span>
            <div className="flex flex-col min-w-0">
              <span
                className="text-[13px] font-semibold text-text-on-light truncate leading-tight"
                data-testid="sala-name-top"
              >
                {sala.display_name}
              </span>
              <span className="text-[10px] font-mono text-muted-on-light truncate leading-tight">
                {sala.slug} · v{sala.version}
                {projectName ? ` · ${projectName}` : ''}
              </span>
            </div>
          </div>

          {/* Onda L.4 — indicador de navegação restrita. */}
          {navRestricted && (
            <span
              data-testid="sala-nav-restricted-badge"
              title={
                whitelistActive
                  ? `Navegação restrita a ${navPolicy.allowed_applications.length} aplicação(ões)`
                  : 'Saída para fora desta Sala restrita'
              }
              className="inline-flex items-center gap-1 h-6 px-2 bg-canvas-light dark:bg-raised-dark border border-border-light dark:border-border-dark text-[10px] uppercase tracking-[0.1em] text-muted-on-light"
            >
              <Lock className="w-3 h-3" strokeWidth={1.5} aria-hidden="true" />
              Navegação restrita
            </span>
          )}

          {/* Navigation menu (dropdown) — Foundry "Promoted workspaces". */}
          <div className="relative ml-4">
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              data-testid="sala-nav-menu-toggle"
              className="h-7 px-2.5 text-[11.5px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
            >
              Salas em destaque
              <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
            </button>
            {navOpen && (
              <div
                data-testid="sala-nav-menu"
                className="absolute top-8 left-0 z-40 w-[280px] bg-white border border-border-light shadow-lg"
                onMouseLeave={() => setNavOpen(false)}
              >
                {navMenu.length === 0 ? (
                  <p className="p-3 text-[11px] text-muted-on-light italic">
                    Nenhuma Sala em destaque nesta Organização.
                  </p>
                ) : (
                  <ul>
                    {navMenu.map((p) => (
                      <li key={p.workspace_id}>
                        <Link
                          href={`/sala/${p.workspace_slug}`}
                          className={`flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-canvas-light border-b border-border-light last:border-b-0 ${
                            p.workspace_slug === slug
                              ? 'bg-canvas-light font-semibold text-primary'
                              : ''
                          }`}
                          onClick={() => setNavOpen(false)}
                        >
                          <LayoutDashboard
                            className="w-3 h-3 text-primary shrink-0"
                            strokeWidth={1.5}
                          />
                          <span className="flex-1 truncate">
                            {p.workspace_display_name}
                          </span>
                          <span className="text-[9px] font-mono text-muted-on-light">
                            v{p.workspace_version}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Tabs ancoradas. */}
          {tabs.length > 0 && (
            <nav
              data-testid="sala-tabs"
              className="ml-2 flex items-center gap-0.5"
            >
              {tabs.map((t, idx) => (
                <button
                  key={`${t}-${idx}`}
                  type="button"
                  data-testid={`sala-tab-${t}`}
                  className="h-7 px-2.5 text-[11.5px] font-mono bg-white dark:bg-panel-dark border border-transparent hover:border-border-light dark:hover:border-border-dark"
                  title={`Tab: ${t}`}
                >
                  {t}
                </button>
              ))}
            </nav>
          )}

          {/* Wave D.2: itens left da barra de menu configurada. */}
          {leftMenu.length > 0 && (
            <nav
              data-testid="sala-menubar-left"
              className="ml-2 flex items-center gap-0.5"
            >
              {leftMenu.map((it, idx) => (
                <Link
                  key={`mb-left-${idx}`}
                  href={it.href}
                  data-testid={`sala-menubar-left-item-${idx}`}
                  className="h-7 px-2.5 text-[11.5px] bg-canvas-light dark:bg-raised-dark border border-border-light dark:border-border-dark hover:border-primary flex items-center"
                >
                  {it.label}
                </Link>
              ))}
            </nav>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Wave D.2: itens right da barra de menu configurada. */}
          {rightMenu.length > 0 && (
            <nav
              data-testid="sala-menubar-right"
              className="flex items-center gap-0.5 mr-2"
            >
              {rightMenu.map((it, idx) => (
                <Link
                  key={`mb-right-${idx}`}
                  href={it.href}
                  data-testid={`sala-menubar-right-item-${idx}`}
                  className="h-7 px-2.5 text-[11.5px] bg-canvas-light dark:bg-raised-dark border border-border-light dark:border-border-dark hover:border-primary flex items-center"
                >
                  {it.label}
                </Link>
              ))}
            </nav>
          )}

          {/* Utility controls (right). */}
          {/* Onda R.4 — push programático passa pelo guarded router para
              respeitar a policy de navegação (antes furava a policy). */}
          <SalaEditButton salaId={sala.id} />
          <Link
            href="/ajuda"
            aria-label="Ajuda"
            title="Ajuda"
            className="h-7 w-7 inline-flex items-center justify-center bg-white border border-border-light hover:border-primary"
          >
            <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Link>
          <Link
            href="/perfil"
            aria-label="Perfil"
            title="Perfil"
            className="h-7 w-7 inline-flex items-center justify-center bg-white border border-border-light hover:border-primary"
          >
            <User className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Link>
          <Link
            href="/"
            aria-label="Voltar"
            title="Voltar ao AEGIS"
            data-testid="sala-back"
            className="h-7 w-7 inline-flex items-center justify-center bg-canvas-light dark:bg-raised-dark border border-border-light dark:border-border-dark hover:border-primary"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Link>
        </header>
        )}

        {/* ─── Home Page (Foundry default: search + 2 cols) ─── */}
        <main className="flex-1 overflow-y-auto" data-testid="sala-home">
          <div className="max-w-[1100px] mx-auto p-6 space-y-6">
            {/* Wave F.1 — Onboarding card (R2 getting-started.md) */}
            {showOnboarding && (
              <section
                data-testid="sala-onboarding"
                role="region"
                aria-labelledby="sala-onboarding-title"
                className="bg-primary/5 border border-primary p-4 flex items-start gap-3"
              >
                <Info
                  className="w-5 h-5 text-primary shrink-0 mt-0.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p
                    id="sala-onboarding-title"
                    className="text-[13px] font-semibold mb-1"
                  >
                    Bem-vindo a {sala.display_name}
                  </p>
                  <p className="text-[11.5px] text-muted-on-light leading-relaxed">
                    Esta Sala reúne os módulos e atalhos do operador. Use
                    a barra de busca para localizar objetos da ontologia
                    ou os atalhos abaixo para começar.
                    {!menuBarVisible && (
                      ' A barra superior foi desativada nesta Sala — acesse o painel pelos atalhos.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissOnboarding}
                  data-testid="sala-onboarding-dismiss"
                  aria-label="Fechar boas-vindas"
                  className="h-7 w-7 inline-flex items-center justify-center bg-white border border-border-light hover:border-primary"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </section>
            )}

            {/* Wave F.1 — Welcome text custom (R2 configuration/home.md · Subtitle Area) */}
            {welcomeText && (
              <p
                data-testid="sala-welcome-text"
                className="text-h2 font-semibold text-text-on-light"
              >
                {welcomeText}
              </p>
            )}

            {sala.description && (
              <p className="text-[12.5px] text-muted-on-light">
                {sala.description}
              </p>
            )}

            {/* Ontology-aware search bar (Wave F.1 — hideable via shouldHideSearchBar) */}
            {!hideSearchBar && (
              <section
                data-testid="sala-search"
                className="bg-white border border-border-light px-3 h-11 flex items-center gap-2"
              >
                <Search className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
                <input
                  type="text"
                  placeholder="Buscar objetos da ontologia, recursos, Operações…"
                  className="flex-1 h-full text-[12.5px] bg-transparent outline-none"
                  aria-label="Buscar na Sala"
                />
                <span className="text-[10px] font-mono text-muted-on-light">⌘ J</span>
              </section>
            )}

            {/* Wave F.1 — sections configuradas (R2 configuration/home.md ·
                Featured Items Display); fallback nas 2 colunas padrão. */}
            {configuredSections.length > 0 ? (
              <div
                className="grid grid-cols-2 gap-4"
                data-testid="sala-configured-sections"
              >
                {configuredSections.map((sec, sIdx) => {
                  const cards = (sec.displayAs ?? 'LIST') === 'CARD';
                  return (
                    <section
                      key={`sala-sec-${sIdx}`}
                      data-testid={`sala-section-${sIdx}`}
                      className="bg-white border border-border-light p-4"
                    >
                      <header className="flex items-center gap-2 mb-3">
                        <Boxes className="w-4 h-4 text-primary" strokeWidth={1.5} />
                        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
                          {sec.title}
                        </p>
                      </header>
                      {(sec.items ?? []).length === 0 ? (
                        <p className="text-small text-muted-on-light italic">
                          Sem itens nesta seção.
                        </p>
                      ) : cards ? (
                        <div className="grid grid-cols-2 gap-2">
                          {(sec.items ?? []).map((it, iIdx) => (
                            <div
                              key={`sala-item-${sIdx}-${iIdx}`}
                              data-testid={`sala-item-${sIdx}-${iIdx}`}
                              className="bg-canvas-light border border-border-light p-3"
                            >
                              <p className="text-[11.5px] font-semibold truncate">
                                {it.label ?? it.ref}
                              </p>
                              <p className="text-[10px] font-mono text-muted-on-light truncate">
                                {it.kind} · {it.ref}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {(sec.items ?? []).map((it, iIdx) => (
                            <HomeLink
                              key={`sala-item-${sIdx}-${iIdx}`}
                              href={`/${it.kind === 'application' ? it.ref : `${it.kind}/${it.ref}`}`}
                              label={it.label ?? it.ref}
                              icon={
                                <Boxes
                                  className="w-3.5 h-3.5"
                                  strokeWidth={1.5}
                                />
                              }
                              testId={`sala-item-${sIdx}-${iIdx}`}
                            />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <section
                  data-testid="sala-col-types"
                  className="bg-white border border-border-light p-4"
                >
                  <header className="flex items-center gap-2 mb-3">
                    <Boxes className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
                      Tipos de Objeto
                    </p>
                  </header>
                  <ul className="space-y-1" data-testid="sala-types-links">
                    {hrefAllowedInBar('/ontologia/tipos') && (
                      <HomeLink
                        href="/ontologia/tipos"
                        label="Catálogo de tipos"
                        icon={<Boxes className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      />
                    )}
                    {hrefAllowedInBar('/ontologia/instancias') && (
                      <HomeLink
                        href="/ontologia/instancias"
                        label="Instâncias"
                        icon={<Database className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      />
                    )}
                    {hrefAllowedInBar('/ontologia/grafo') && (
                      <HomeLink
                        href="/ontologia/grafo"
                        label="Grafo da ontologia"
                        icon={<LayoutDashboard className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      />
                    )}
                    {navRestricted &&
                      !hrefAllowedInBar('/ontologia/tipos') && (
                        <li
                          data-testid="sala-types-restricted"
                          className="px-2 py-1.5 text-[11px] text-muted-on-light italic"
                        >
                          Indisponível nesta Sala.
                        </li>
                      )}
                  </ul>
                </section>

                <section
                  data-testid="sala-col-resources"
                  className="bg-white border border-border-light p-4"
                >
                  <header className="flex items-center gap-2 mb-3">
                    <FolderSearch className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
                      Atalhos da Sala
                    </p>
                  </header>
                  <ul className="space-y-1" data-testid="sala-shortcuts">
                    {sala.project_id && hrefAllowedInBar('/painel-de-controle/operacoes') && (
                      <HomeLink
                        href={`/painel-de-controle/operacoes`}
                        label={projectName ?? 'Operação dona da Sala'}
                        icon={<FolderSearch className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      />
                    )}
                    {hrefAllowedInBar('/painel-de-controle/marcacoes') && (
                      <HomeLink
                        href="/painel-de-controle/marcacoes"
                        label="Marcações"
                        icon={<Tag className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      />
                    )}
                    {hrefAllowedInBar('/painel-de-controle/tours') && (
                      <HomeLink
                        href="/painel-de-controle/tours"
                        label="Tours desta Sala"
                        icon={<BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      />
                    )}
                    {navRestricted &&
                      !hrefAllowedInBar('/painel-de-controle/marcacoes') &&
                      !hrefAllowedInBar('/painel-de-controle/tours') &&
                      !(sala.project_id && hrefAllowedInBar('/painel-de-controle/operacoes')) && (
                        <li
                          data-testid="sala-shortcuts-restricted"
                          className="px-2 py-1.5 text-[11px] text-muted-on-light italic"
                        >
                          Atalhos indisponíveis: navegação restrita às
                          aplicações permitidas desta Sala.
                        </li>
                      )}
                  </ul>
                </section>
              </div>
            )}

            {homePage && (
              <p className="text-[10.5px] font-mono text-muted-on-light italic">
                Home page configurada: <code>{homePage}</code>
              </p>
            )}
          </div>
        </main>
      </div>
      </NavigationGuard>
    </RequirePerm>
  );
}

/**
 * Onda R.4 — botão "Editar" que navega via `useGuardedRouter()`.
 *
 * Renderizado DENTRO do `<NavigationGuard>`, portanto consome o contexto do
 * guard: o `push` para `/painel-de-controle/salas?edit=…` agora respeita a
 * policy de navegação (block/new_tab/allow), em vez de furá-la.
 */
function SalaEditButton({ salaId }: { salaId: string }) {
  const router = useGuardedRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/painel-de-controle/salas?edit=${salaId}`)}
      data-testid="sala-edit"
      title="Editar Sala (vai pro painel)"
      className="h-7 px-2.5 text-[11.5px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
    >
      <Edit3 className="w-3 h-3" strokeWidth={1.5} />
      Editar
    </button>
  );
}

function HomeLink({
  href,
  label,
  icon,
  testId,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  testId?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        data-testid={testId}
        className="flex items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-canvas-light border border-transparent hover:border-border-light"
      >
        <span className="inline-flex w-6 h-6 items-center justify-center bg-canvas-light border border-border-light shrink-0">
          {icon}
        </span>
        <span className="flex-1 truncate">{label}</span>
        <span className="text-[10px] text-muted-on-light">→</span>
      </Link>
    </li>
  );
}
