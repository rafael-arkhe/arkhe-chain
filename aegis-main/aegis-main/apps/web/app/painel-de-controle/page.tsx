'use client';

/**
 * Painel de Controle · Início
 *
 * Sprint H1 + H5 (2026-05-22). Home espelhando `cp-homepage.png`:
 * - "Getting started" (4 cards 2x2 grid em 2 grupos)
 * - "Visão geral" (ENROLLMENT DETAILS + ORGANIZATIONS)
 * - "Gerenciando o AEGIS" (cards por perm)
 *
 * Strings traduzidas — NUNCA "Foundry"/"Palantir" visíveis no DOM
 * (memory rule `[[feedback_no_palantir_product_names]]`).
 *
 * #1 (2026-05-24): "Visão geral" deixou de ser estática. "Detalhes da
 * unidade" e "Organizações" passam a refletir o contexto REAL do operador,
 * compostos a partir de endpoints existentes (sem inventar API nova):
 *   - `GET /me/context`        → unidade/Organização ativa (display_name)
 *   - `GET /me/organizations`  → Organizações do operador (com slug + papel)
 * O slug da unidade ativa vem do cruzamento do `organization_id` do contexto
 * com a lista de Organizações. Os cards/seções seguem vindo do `home()`.
 *
 * #3 (2026-05-24): bloco compacto "Seu escopo" entre "Detalhes da unidade"
 * e "Organizações". Duas métricas úteis no dia a dia — Espaços e Operações
 * ATIVOS do operador — reaproveitando endpoints existentes:
 *   - `GET /spaces`    → Espaços (conta os `active`)
 *   - `GET /projects`  → Operações (conta os `active`)
 * É um par de tiles (mesmo peso visual de "Detalhes da unidade"), NÃO uma
 * lista — não compete com "Organizações". Sem API nova; contagem client-side.
 */
import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  FolderSearch,
  Globe2,
  Layers,
  Palette,
  Search,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { useT } from '@/lib/i18n/provider';
import {
  ControlPanel,
  MeContextApi,
  Projects,
  Spaces,
  type CPHome,
  type MeContext,
  type OrganizationMembership,
  type ProjectListItem,
  type Space,
} from '@/lib/api';

const ICONS = {
  'book-open': BookOpen,
  'user-cog': UserCog,
  boxes: Boxes,
  'shield-check': ShieldCheck,
  'globe-2': Globe2,
  palette: Palette,
  'bar-chart-3': BarChart3,
} as const;

export default function PainelHomePage() {
  const [home, setHome] = React.useState<CPHome | null>(null);
  const [context, setContext] = React.useState<MeContext | null>(null);
  const [organizations, setOrganizations] = React.useState<
    OrganizationMembership[] | null
  >(null);
  const [spaces, setSpaces] = React.useState<Space[] | null>(null);
  const [projects, setProjects] = React.useState<ProjectListItem[] | null>(null);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    ControlPanel.home()
      .then(setHome)
      .catch(() => {});
    // "Visão geral" — dados reais do tenant/Organizações do operador.
    // Reutiliza os mesmos endpoints do seletor de contexto (CpContextSwitcher).
    MeContextApi.get()
      .then(setContext)
      .catch(() => setContext(null));
    MeContextApi.listOrganizations()
      .then(setOrganizations)
      .catch(() => setOrganizations([]));
    // "Seu escopo" — Espaços + Operações do operador (mesmos endpoints das
    // páginas /espacos e /operacoes). Só a contagem dos ativos é usada aqui.
    Spaces.list()
      .then(setSpaces)
      .catch(() => setSpaces([]));
    Projects.list()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  if (!home) {
    return (
      <div className="px-6 py-10 text-[12px] text-muted-on-light italic">
        Carregando…
      </div>
    );
  }

  const [setupEnrollment, setupOrg, managing] = home.sections;

  return (
    <div data-testid="cp-home" className="flex flex-col">
      <CpPageHeader title="Início" subtitle="Configure e gerencie a plataforma AEGIS" actions={
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light pointer-events-none" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Buscar configurações"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="cp-home-search"
            className="h-8 w-[260px] pl-7 pr-12 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          />
          <kbd className="text-[10px] absolute right-2 top-1/2 -translate-y-1/2 text-muted-on-light/70 font-mono">⌘J</kbd>
        </div>
      } />

      <div className="px-6 py-6 space-y-8">
        <Section title={setupEnrollment.title}>
          {setupEnrollment.cards.map((c, i) => (
            <ActionCard key={i} card={c} />
          ))}
        </Section>

        <Section title={setupOrg.title}>
          {setupOrg.cards.map((c, i) => (
            <ActionCard key={i} card={c} />
          ))}
        </Section>

        <OverviewPanel
          context={context}
          organizations={organizations}
          spaces={spaces}
          projects={projects}
        />

        <Section title={managing.title}>
          {managing.cards.map((c, i) => (
            <ActionCard key={i} card={c} />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-on-light mb-2.5">
        {title}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

function ActionCard({ card }: { card: CPHome['sections'][number]['cards'][number] }) {
  const Icon = (ICONS as Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>>)[card.icon] || Boxes;
  return (
    <Link
      href={card.href}
      data-testid={`cp-card-${card.href.replace(/\//g, '-')}`}
      className="group bg-white border border-border-light p-3.5 hover:border-primary transition-colors flex items-start gap-3"
    >
      <div className="w-9 h-9 bg-canvas-light border border-border-light flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-text-on-light">{card.title}</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-on-light group-hover:text-primary transition-colors" strokeWidth={1.5} />
        </div>
        <p className="mt-0.5 text-[11.5px] text-muted-on-light leading-snug">
          {card.description}
        </p>
      </div>
    </Link>
  );
}

/**
 * "Visão geral" — totalmente dinâmico.
 *
 * - "Detalhes da unidade": Organização ativa do contexto (display_name) +
 *   slug real cruzado de `organizations`. Sem fallback fabricado.
 * - "Seu escopo": dois tiles compactos — Espaços e Operações ATIVOS do
 *   operador (contagem). Mesmo peso visual de "Detalhes da unidade"; não é
 *   lista, então não compete com "Organizações".
 * - "Organizações": Organizações reais do operador (nome + slug + papel),
 *   com contagem quando houver mais de uma e marca da unidade ativa.
 */
function OverviewPanel({
  context,
  organizations,
  spaces,
  projects,
}: {
  context: MeContext | null;
  organizations: OrganizationMembership[] | null;
  spaces: Space[] | null;
  projects: ProjectListItem[] | null;
}) {
  const t = useT();
  const orgsLoading = organizations === null;
  const ctxLoading = context === null && organizations === null;
  const scopeLoading = spaces === null || projects === null;

  // Slug real da unidade ativa (cruzamento context ↔ organizations).
  const activeSlug = React.useMemo(() => {
    if (!context || !organizations) return null;
    const match = organizations.find((o) => o.id === context.organization_id);
    return match?.slug ?? null;
  }, [context, organizations]);

  const orgCount = organizations?.length ?? 0;
  // Só os ativos contam para o escopo de trabalho do dia a dia.
  const activeSpaces = spaces?.filter((s) => s.active).length ?? 0;
  const activeProjects = projects?.filter((p) => p.active).length ?? 0;

  return (
    <section className="bg-white border border-border-light" data-testid="cp-overview">
      <header className="px-3.5 py-2.5 border-b border-border-light">
        <h2 className="text-[13px] font-semibold text-text-on-light">
          {t('cp.overview.title')}
        </h2>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border-light">
        {/* Detalhes da unidade — Organização ativa do contexto */}
        <div className="p-3.5">
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light mb-2">
            {t('cp.overview.unit')}
          </p>
          {ctxLoading ? (
            <p className="text-[11.5px] text-muted-on-light italic">
              {t('common.loading')}
            </p>
          ) : context ? (
            <div className="flex items-center gap-2" data-testid="cp-overview-unit">
              <span className="inline-flex w-7 h-7 items-center justify-center bg-canvas-light border border-border-light">
                <Building2 className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-text-on-light truncate">
                  {context.organization_name}
                </p>
                {activeSlug && (
                  <p className="text-[10.5px] text-muted-on-light font-mono truncate">
                    {activeSlug}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[11.5px] text-muted-on-light italic">
              {t('cp.overview.unitEmpty')}
            </p>
          )}
        </div>

        {/* Seu escopo — Espaços + Operações ativos (contagem). Compacto. */}
        <div className="p-3.5">
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light mb-2">
            {t('cp.overview.scope')}
          </p>
          {scopeLoading ? (
            <p className="text-[11.5px] text-muted-on-light italic">
              {t('common.loading')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2" data-testid="cp-overview-scope">
              <ScopeStat
                icon={Layers}
                label={t('nav.espacos')}
                value={activeSpaces}
                testid="cp-overview-scope-spaces"
              />
              <ScopeStat
                icon={FolderSearch}
                label={t('nav.operacoes')}
                value={activeProjects}
                testid="cp-overview-scope-projects"
              />
            </div>
          )}
        </div>

        {/* Organizações — Organizações reais do operador */}
        <div className="p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light">
              {t('common.orgPlural')}
            </p>
            {orgCount > 1 && (
              <span
                className="text-[10px] font-mono text-muted-on-light bg-canvas-light border border-border-light px-1.5 leading-[1.4]"
                data-testid="cp-overview-orgs-count"
              >
                {orgCount}
              </span>
            )}
          </div>
          {orgsLoading ? (
            <p className="text-[11.5px] text-muted-on-light italic">
              {t('common.loading')}
            </p>
          ) : orgCount === 0 ? (
            <p className="text-[11.5px] text-muted-on-light italic">
              {t('cp.overview.orgsEmpty')}
            </p>
          ) : (
            <div className="space-y-1.5" data-testid="cp-overview-orgs">
              {organizations!.map((o) => {
                const isActive = context?.organization_id === o.id;
                return (
                  <div key={o.id} className="flex items-center gap-2">
                    <span className="inline-flex w-7 h-7 items-center justify-center bg-canvas-light border border-border-light shrink-0">
                      <Boxes className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0 flex items-baseline gap-1.5">
                      <span className="text-[12px] font-medium text-text-on-light truncate">
                        {o.display_name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-on-light shrink-0">
                        {o.slug}
                      </span>
                      {isActive && (
                        <span className="text-[9.5px] uppercase tracking-[0.12em] font-semibold text-primary shrink-0">
                          {t('cp.overview.active')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Tile compacto de métrica de escopo (Espaços / Operações). Número em
 * destaque + rótulo + ícone. Sharp — sem cantos arredondados nem emoji.
 */
function ScopeStat({
  icon: Icon,
  label,
  value,
  testid,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: number;
  testid: string;
}) {
  return (
    <div
      className="bg-canvas-light border border-border-light p-2.5 flex items-center gap-2.5"
      data-testid={testid}
    >
      <span className="inline-flex w-7 h-7 items-center justify-center bg-white border border-border-light shrink-0">
        <Icon className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
      </span>
      <div className="min-w-0">
        <p className="text-[18px] leading-none font-semibold text-text-on-light tabular-nums">
          {value}
        </p>
        <p className="mt-1 text-[10.5px] text-muted-on-light truncate">{label}</p>
      </div>
    </div>
  );
}
