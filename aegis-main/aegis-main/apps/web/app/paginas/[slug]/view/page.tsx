'use client';

/**
 * /paginas/[slug]/view — Onda I.1 (2026-05-23).
 *
 * Renderiza uma Page do registry usando o ``WorkshopV2Renderer`` —
 * mesmo runtime usado pela home (/) e por todos os apps Workshop
 * standalone. Sem duplicação de pipeline.
 *
 * Pages com ``config.mode === 'workshop'`` renderizam direto. Pages
 * em ``mode === 'legacy'`` (criadas antes da Onda I.1) mostram fallback
 * informativo orientando o operador a migrar no editor.
 *
 * Política IAM (Mission #8 · 2026-05-24): a perm + as marcações exigidas
 * vêm da própria page. A leitura passa ``enforce=true`` → o BACKEND aplica
 * o gate (``iam_perm_required`` via RBAC + ``marking_requirements`` via
 * clearance) e responde 403 real. O <RequirePerm> permanece como gate de
 * UX rápido pra perm; o 403 do backend é a autoridade (e cobre marcações,
 * que o RequirePerm não enxerga).
 */
import * as React from 'react';
import { useParams } from 'next/navigation';
import { Pages, type RegisteredPage } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { WorkshopV2Renderer } from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets'; // registry populado
import {
  coercePageConfig,
  pageToWorkshopApp,
  readPageChrome,
  type PageConfig,
  type ResolvedPageChrome,
} from '@/components/pages-editor/page-config-adapter';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { RequirePerm } from '@/components/auth/require-perm';
import {
  getAppRouteComponent,
  type AppRouteComponent,
} from '@/lib/pages/app-route-registry';
import { EmbedFrame } from '@/components/pages/embed-app';
import { readEmbedSrc } from '@/lib/pages/embed-defaults';
import { cn } from '@/lib/cn';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { AppWindow } from 'lucide-react';
import { useT } from '@/lib/i18n/provider';
// 🔴 O AIP saiu do produto a 29/09/2026. O `AipThreadsApp` era o que
// registrava o slug `aip-threads` nesta lista — e o slug e o registo
// que ia com ele, que e o que a pagina `/agentes` usava para se saber
// agente. Sem o AIP nao ha o que registar.
import '@/components/solution-designer/SolutionsApp'; // registra o slug solutions (W8)
import '@/components/agentes/AgentesApp'; // registra o slug agentes (W8)
import '@/components/geo/ConstrutorCamadasApp'; // registra o slug construtor-camadas

export default function ViewPaginaPage() {
  return <ViewPaginaInner />;
}

function ViewPaginaInner() {
  const t = useT();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [page, setPage] = React.useState<RegisteredPage | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  // Mission #8 — 403 do backend (perm/marcação faltando) é tratado à parte
  // pra mostrar "acesso negado" em vez de um erro genérico.
  const [denied, setDenied] = React.useState(false);

  const load = React.useCallback(() => {
    if (!slug) return;
    setErr(null);
    setDenied(false);
    // enforce=true: o backend gateia perm + marcações e responde 403.
    Pages.get(slug, { enforce: true })
      .then((p) => setPage(p))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) {
          setDenied(true);
          return;
        }
        setErr((e as Error)?.message ?? 'Falha ao carregar página');
      });
  }, [slug]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (denied) {
    return (
      <div className="p-6" data-testid="paginas-view-denied">
        <div className="border border-border-light p-4 text-[11px] font-mono text-muted-on-light bg-white">
          <div className="text-text-on-light uppercase tracking-[0.22em] text-[10px] mb-1">
            Acesso negado
          </div>
          Você não possui a permissão ou marcação exigida para abrir esta
          página. Solicite escalonamento de privilégio na rota
          Administração.
        </div>
      </div>
    );
  }
  if (err && !page) {
    return <CpErrorState description={err} retry={load} />;
  }
  if (!page) return <CpSkeleton />;

  // W8 — Page arquivada em Páginas → operador não chega na experiência por esta
  // rota. Espelha o estado "indisponível" que as rotas canônicas antigas
  // (aip-threads/solutions/agentes) aplicavam em seus próprios shells.
  if (page.status === 'archived') {
    return (
      <div data-testid="paginas-view-archived" className="h-full">
        <CpEmptyState
          icon={AppWindow}
          title={t('paginas.archived.title')}
          description={t('paginas.archived.desc')}
        />
      </div>
    );
  }

  // LOTE3 — quem é DONO do cabeçalho?
  // Uma ``app_route`` COM componente registrado é dona do próprio chrome
  // (PageShell / toolbar). A view NÃO desenha header pra ela → elimina a
  // duplicação. Demais casos (app_route sem componente, workshop, legacy)
  // ganham um header mínimo (só o título; a rota crua era ruído).
  const config = coercePageConfig(page.config);
  // Onda 3b — experience_kind:'embed' (SPA same-origin em tela cheia). Tem
  // precedência sobre o registry slug→componente: a Page é servida por um
  // iframe same-origin, não por código registrado. ``null`` se não-embed ou
  // src inválido.
  const embedSrc = readEmbedSrc(page.config);
  const AppRoute =
    config.mode === 'app_route' && !embedSrc
      ? getAppRouteComponent(page.slug)
      : null;
  const chrome = readPageChrome(page.config);
  // Embed é full-bleed (a SPA tem chrome próprio) → sem header da view, igual a
  // uma app_route com componente registrado.
  const showViewHeader = !AppRoute && !embedSrc;

  const content = (
    // flex-1 min-w-0 w-full: a view é filha do <main className="flex-1 flex">
    // (uma ROW) do AuthShell. Sem flex-1/w-full ela encolhia para a largura do
    // conteúdo (AIP/Conversas espremido). Agora ocupa toda a largura disponível.
    <div
      className="h-full min-h-0 w-full flex-1 min-w-0 flex flex-col overflow-hidden bg-canvas-light"
      data-testid="paginas-view-root"
      data-page-slug={page.slug}
    >
      {showViewHeader && (
        <header className="bg-white border-b border-border-light px-6 py-3 shrink-0">
          <h1
            className="text-[16px] font-semibold text-text-on-light"
            data-testid="paginas-view-title"
          >
            {page.title}
          </h1>
        </header>
      )}
      <ViewContent
        page={page}
        config={config}
        appRoute={AppRoute}
        chrome={chrome}
        embedSrc={embedSrc}
      />
    </div>
  );

  if (page.iam_perm_required) {
    return (
      <RequirePerm perm={page.iam_perm_required}>{content}</RequirePerm>
    );
  }
  return content;
}

function ViewContent({
  page,
  config,
  appRoute: AppRoute,
  chrome,
  embedSrc,
}: {
  page: RegisteredPage;
  config: PageConfig;
  appRoute: AppRouteComponent | null;
  chrome: ResolvedPageChrome;
  embedSrc: string | null;
}) {
  // Onda 3b — embed same-origin em tela cheia tem precedência: a SPA
  // (livemap/guestalerts) é dona do próprio chrome + scroll.
  if (embedSrc) {
    return <EmbedFrame src={embedSrc} title={page.title} />;
  }
  if (config.mode === 'legacy') {
    return (
      <div
        className="flex-1 min-h-0 overflow-y-auto p-6 text-[12px] text-text-on-light"
        data-testid="paginas-view-legacy-fallback"
      >
        <div className="bg-white border border-warning/40 p-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-warning mb-1">
            Página no formato antigo
          </p>
          <p>
            Esta página ainda usa o editor antigo. Abra o painel de edição
            e clique em "Migrar para Workshop" para habilitar a paleta
            completa de widgets.
          </p>
        </div>
      </div>
    );
  }
  if (config.mode === 'app_route') {
    // Rota de aplicação COM componente registrado (ex.: aip-threads /
    // Conversas) → renderiza o corpo real. Sem registro (docs/workshop/
    // sala, servidos pela própria rota) → estado explicativo.
    if (AppRoute) {
      // O app é DONO do scroll: ocupa ``flex-1 min-h-0`` e o próprio app
      // gerencia overflow internamente (um único dono de scroll). Quando o
      // chrome NÃO é full-bleed, centraliza numa coluna confortável.
      return (
        <div
          data-testid="paginas-view-app-route-live"
          className={cn(
            'flex-1 min-h-0 flex flex-col',
            !chrome.fullBleed && 'mx-auto w-full max-w-[1400px]',
          )}
        >
          <AppRoute />
        </div>
      );
    }
    return (
      <div
        className="flex-1 min-h-0 overflow-y-auto p-6 text-[12px] text-text-on-light"
        data-testid="paginas-view-app-route"
      >
        <div className="bg-white border border-border-light p-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-on-light mb-1">
            Rota de aplicação
          </p>
          <p>
            Esta página é servida por código da aplicação e não é montável
            por widgets.
          </p>
        </div>
      </div>
    );
  }
  if (config.workshop_layout.root.length === 0) {
    return (
      <div
        className="flex-1 min-h-0 overflow-y-auto p-6 text-[12px] text-muted-on-light"
        data-testid="paginas-view-empty"
      >
        Esta página ainda não tem widgets configurados.
      </div>
    );
  }
  const app = pageToWorkshopApp(page, config);
  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto"
      data-testid="paginas-view-workshop"
    >
      <WorkshopV2Renderer app={app} />
    </div>
  );
}
