/**
 * Onda I.1 (2026-05-23) — adapter Page.config <-> WorkshopApp.
 *
 * O ``WorkshopEditor`` original opera sobre ``WorkshopApp`` (id +
 * external_id + display + layout + variables + ...) e persiste via
 * ``Workshop.update``. O editor de Páginas precisa exatamente do mesmo
 * UX (paleta · canvas · inspetor) MAS persiste em ``Pages.putConfig``.
 *
 * Solução: tratamos cada Page como um **WorkshopApp virtual** —
 * carregamos o config blob no shape ``{mode, workshop_layout, ...}``,
 * embrulhamos como WorkshopApp, e na hora de salvar desempacotamos de
 * volta pro Page.config. Zero código duplicado de widget/registro.
 *
 * Compat retroativa: configs antigas (mode='legacy', ``blocks: []``)
 * permanecem intactas no storage; o adapter abre como WorkshopApp
 * vazio e oferece migração explícita por botão (não automática — não
 * perdemos os blocks até o operador confirmar).
 */
import type {
  LayoutNode,
  WorkshopApp,
  WorkshopAppLayout,
  WorkshopOverlay,
  WorkshopSurface,
  WorkshopVariable,
} from '@/lib/workshop/types';
import type { RegisteredPage } from '@/lib/api';

/** Modes válidos do Page.config (Onda I.1 + K.1). */
export type PageConfigMode = 'workshop' | 'legacy' | 'app_route';

/** Shape canônico do Page.config no mode=workshop. */
export interface PageWorkshopConfig {
  mode: 'workshop';
  workshop_layout: WorkshopAppLayout;
  variables?: WorkshopVariable[];
  overlays?: WorkshopOverlay[];
  surface?: WorkshopSurface;
  target_kind?: string | null;
  target_source?: string | null;
  /** Auto-refresh (s): re-avalia a página em loop (KPIs ao vivo). */
  refresh_seconds?: number | null;
}

/** Shape canônico do Page.config no mode=legacy (editor H.4.A). */
export interface PageLegacyConfig {
  mode: 'legacy';
  blocks: Array<{
    id: string;
    kind: 'heading' | 'paragraph' | 'table' | 'chart' | 'map';
    props: Record<string, unknown>;
  }>;
}

/**
 * Shape do Page.config no mode=app_route (Onda K.1). Rotas servidas por
 * código de aplicação (``/docs``, ``/workshop``, ``/sala/[slug]``) — NÃO
 * montáveis por widgets. O editor mostra um estado explícito de "rota de
 * aplicação" em vez do banner de migração.
 */
export interface PageAppRouteConfig {
  mode: 'app_route';
  note?: string;
  /**
   * W0 (2026-06-28) — rótulo da aplicação bespoke que serve a rota. O
   * frontend roteia a experiência por este ``experience_kind`` (registry
   * genérico), NÃO pelo slug. String livre; quando ausente, fica ausente
   * (sem default inventado — espelha o contrato do backend, que descarta
   * valores não-string em ``_coerce_config_mode``). Só existe em
   * ``app_route`` (workshop/legacy nunca recebem o campo).
   */
  experience_kind?: string;
  /**
   * W2 (2026-06-28) — PARÂMETROS da experiência bespoke (blob livre,
   * data-driven). Onde o operador parametriza COMO a experiência se
   * comporta sem widgets — ex.: a /solutions guarda aqui ``depth`` /
   * ``scope`` / ``model`` default do AIP Arquiteto. Persistido em
   * ``Page.config.params`` (Tenant.metadata_, sem migração) e PRESERVADO
   * intacto pelo editor de canvas/Workshop (nunca apagado por um save de
   * widgets). Cada experiência define seu próprio shape; aqui é opaco.
   */
  params?: Record<string, unknown>;
}

/**
 * LOTE3 (2026-06-28) — CHROME da experiência bespoke (vive em
 * ``Page.config.params.chrome``). Controla como a VIEW canônica
 * (``/paginas/[slug]/view``) emoldura o app de uma ``app_route``:
 *  - ``hide_page_header``: oculta o cabeçalho do PRÓPRIO app (a barra de
 *    título do ``PageShell`` / a toolbar de título) para ganhar o máximo de
 *    espaço vertical (ex.: chat, canvas). Default ``false``.
 *  - ``full_bleed``: o app ocupa toda a largura disponível (default). Quando
 *    ``false``, a view centraliza o app numa coluna ``max-w-[1400px]``.
 *
 * Como mora dentro de ``params`` (blob opaco), o ``coerce`` já o preserva
 * intacto no round-trip — este tipo só documenta o shape e alimenta o
 * leitor defensivo ``readPageChrome``.
 */
export interface PageChromeConfig {
  hide_page_header?: boolean;
  full_bleed?: boolean;
}

export type PageConfig =
  | PageWorkshopConfig
  | PageLegacyConfig
  | PageAppRouteConfig;

/**
 * Normaliza um raw config (qualquer shape) pra o discriminated union.
 * Espelha exatamente o ``_coerce_config_mode`` do backend.
 */
export function coercePageConfig(raw: unknown): PageConfig {
  if (!raw || typeof raw !== 'object') {
    return { mode: 'legacy', blocks: [] };
  }
  const obj = raw as Record<string, unknown>;
  const mode = obj.mode;
  if (mode === 'app_route') {
    return {
      mode: 'app_route',
      note: typeof obj.note === 'string' ? obj.note : undefined,
      // Preserva o rótulo da experiência bespoke (W0). Não-string é
      // descartado (mesma regra do backend) — vira ausente, não default.
      experience_kind:
        typeof obj.experience_kind === 'string'
          ? obj.experience_kind
          : undefined,
      // Preserva os PARÂMETROS da experiência (W2) intactos. Objeto opaco
      // (cada experiência define o shape); não-objeto vira ausente. O editor
      // de canvas/Workshop nunca toca app_route, mas se algum caller
      // re-serializar o config, os params sobrevivem ao round-trip.
      params:
        obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)
          ? (obj.params as Record<string, unknown>)
          : undefined,
    };
  }
  if (mode === 'workshop') {
    const layout = (obj.workshop_layout as WorkshopAppLayout | undefined) ?? {
      columns: 20,
      root: [],
    };
    return {
      mode: 'workshop',
      workshop_layout: {
        columns: typeof layout.columns === 'number' ? layout.columns : 20,
        root: Array.isArray(layout.root) ? (layout.root as LayoutNode[]) : [],
      },
      variables: Array.isArray(obj.variables)
        ? (obj.variables as WorkshopVariable[])
        : [],
      overlays: Array.isArray(obj.overlays)
        ? (obj.overlays as WorkshopOverlay[])
        : [],
      surface: (obj.surface as WorkshopSurface | undefined) ?? undefined,
      target_kind: (obj.target_kind as string | null | undefined) ?? null,
      target_source: (obj.target_source as string | null | undefined) ?? null,
    };
  }
  if (mode === 'legacy') {
    return {
      mode: 'legacy',
      blocks: Array.isArray(obj.blocks)
        ? (obj.blocks as PageLegacyConfig['blocks'])
        : [],
    };
  }
  // Sem `mode` declarado: infere o modo pelo conteúdo.
  if ('workshop_layout' in obj || 'variables' in obj || 'surface' in obj) {
    const layout = (obj.workshop_layout as WorkshopAppLayout | undefined) ?? {
      columns: 20,
      root: [],
    };
    return {
      mode: 'workshop',
      workshop_layout: {
        columns: typeof layout.columns === 'number' ? layout.columns : 20,
        root: Array.isArray(layout.root) ? (layout.root as LayoutNode[]) : [],
      },
      variables: Array.isArray(obj.variables)
        ? (obj.variables as WorkshopVariable[])
        : [],
      overlays: Array.isArray(obj.overlays)
        ? (obj.overlays as WorkshopOverlay[])
        : [],
    };
  }
  return {
    mode: 'legacy',
    blocks: Array.isArray(obj.blocks)
      ? (obj.blocks as PageLegacyConfig['blocks'])
      : [],
  };
}

/** Chrome resolvido (defaults seguros aplicados). */
export interface ResolvedPageChrome {
  /** Oculta o cabeçalho do próprio app (PageShell / toolbar de título). */
  hidePageHeader: boolean;
  /** App ocupa toda a largura (default). ``false`` → centraliza em max-w. */
  fullBleed: boolean;
}

/**
 * Lê o CHROME (``params.chrome``) de uma Page de QUALQUER shape, aplicando
 * defaults seguros: cabeçalho VISÍVEL (``hidePageHeader=false``) e
 * FULL-BLEED (``fullBleed=true``). Defensivo: aceita o config cru e nunca
 * lança. Pages não-``app_route`` (sem ``params``) caem nos defaults.
 */
export function readPageChrome(config: unknown): ResolvedPageChrome {
  const cfg = coercePageConfig(config);
  const params = cfg.mode === 'app_route' ? cfg.params : undefined;
  const chrome =
    params &&
    typeof params.chrome === 'object' &&
    params.chrome !== null &&
    !Array.isArray(params.chrome)
      ? (params.chrome as Record<string, unknown>)
      : {};
  return {
    hidePageHeader: chrome.hide_page_header === true,
    // Default full-bleed: só recua para centralizado quando explicitamente false.
    fullBleed: chrome.full_bleed !== false,
  };
}

/**
 * Compat retroativa (W0): tenants antigos têm Pages ``app_route`` SEM o
 * rótulo ``experience_kind`` (semeado depois). O backfill idempotente do
 * backend injeta o rótulo na próxima leitura de ``/pages``; até lá
 * mapeamos slug→kind aqui para ZERO regressão. Só ``buscar`` está na
 * lista — novas experiências sempre trazem ``experience_kind`` no config.
 */
export const LEGACY_SLUG_KIND: Record<string, string> = { buscar: 'buscar' };

/**
 * Resolve o ``experience_kind`` de uma Page: prioriza o rótulo do config
 * (mode=app_route), e cai no mapa de compat por slug quando ausente.
 * Roteia a experiência bespoke pelo KIND, nunca pelo slug.
 */
export function resolveExperienceKind(page: RegisteredPage): string | undefined {
  const config = coercePageConfig(page.config);
  const fromConfig =
    config.mode === 'app_route' ? config.experience_kind : undefined;
  return fromConfig ?? LEGACY_SLUG_KIND[page.slug];
}

/**
 * Page → WorkshopApp virtual. Usado pra alimentar componentes
 * (paleta, canvas, inspector) que já sabem operar sobre WorkshopApp.
 *
 * Surface default = 'standalone'. Quando a página tem
 * ``workspace_bindings.operacao_id`` ou similar, mantemos standalone
 * porque "Páginas" são rotas operacionais, não fichas.
 */
export function pageToWorkshopApp(
  page: RegisteredPage,
  config: PageWorkshopConfig,
): WorkshopApp {
  return {
    id: `page::${page.slug}`,
    external_id: `page.${page.slug}`,
    display: page.title,
    description: `Página /${page.slug} — rota ${page.route}`,
    schema_version: 2,
    variables: config.variables ?? [],
    layout: config.workshop_layout,
    overlays: config.overlays ?? [],
    surface: config.surface ?? 'standalone',
    target_kind: config.target_kind ?? null,
    target_source: config.target_source ?? null,
    refresh_seconds: config.refresh_seconds ?? null,
    markings: page.marking_requirements,
  };
}

/**
 * WorkshopApp (edição em memória) → PageConfig (shape persistido).
 *
 * Único caminho de serialização pro PUT /pages/{slug}/config — garante
 * que sempre escrevemos com ``mode: 'workshop'`` declarado.
 */
export function workshopAppToPageConfig(app: WorkshopApp): PageWorkshopConfig {
  return {
    mode: 'workshop',
    workshop_layout: app.layout,
    variables: app.variables,
    overlays: app.overlays,
    surface: app.surface,
    target_kind: app.target_kind,
    target_source: app.target_source,
  };
}

/**
 * Migração explícita: legacy → workshop. Converte cada PageBlock em um
 * widget Workshop equivalente. Não-destrutiva — só roda quando o
 * operador clica o botão "Migrar para Workshop".
 *
 * Mapeamento:
 *   heading    → markdown_v2 com `# {text}`
 *   paragraph  → markdown_v2 com `{text}`
 *   table      → object_table com props.source
 *   chart      → metric_card temporário (placeholder — operador troca
 *                pra widget de chart real depois)
 *   map        → geo_map placeholder vazio
 */
export function migrateLegacyToWorkshop(
  legacy: PageLegacyConfig,
): PageWorkshopConfig {
  const root: LayoutNode[] = legacy.blocks.map((b) => {
    let widgetType = 'markdown_v2';
    let props: Record<string, unknown> = {};
    switch (b.kind) {
      case 'heading': {
        widgetType = 'markdown_v2';
        const level = Number(b.props.level ?? 1);
        const hashes = '#'.repeat(Math.min(Math.max(level, 1), 6));
        props = { content: `${hashes} ${String(b.props.text ?? '')}` };
        break;
      }
      case 'paragraph': {
        widgetType = 'markdown_v2';
        props = { content: String(b.props.text ?? '') };
        break;
      }
      case 'table': {
        widgetType = 'object_table';
        props = { ...b.props };
        break;
      }
      case 'chart': {
        widgetType = 'metric_card';
        props = { label: 'Gráfico (configure)', value: 0 };
        break;
      }
      case 'map': {
        widgetType = 'geo_map';
        props = { ...b.props };
        break;
      }
    }
    return {
      id: b.id || `node_${Math.random().toString(36).slice(2, 10)}`,
      widget: { type: widgetType, props },
      layout: { col_span: 20 },
    };
  });
  return {
    mode: 'workshop',
    workshop_layout: { columns: 20, root },
    variables: [],
    overlays: [],
    surface: 'standalone',
  };
}
