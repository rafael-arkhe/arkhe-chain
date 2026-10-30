'use client';

/**
 * Widgets ESTRUTURAIS da ficha — fazem parte do "chrome" do template:
 *   - security.ficha.tabs      → barra de abas
 *   - security.ficha.paleta    → sidebar esquerda (catálogo)
 *   - security.ficha.inspetor  → sidebar direita (metadados do entity)
 *
 * São widgets normais do registry — operador adiciona/remove/move via
 * editor igual qualquer outro. Cada um declara `slot` default no schema
 * pra o `FichaWorkshopShell` saber onde encaixar quando a app for
 * renderizada na `/ficha/{id}`.
 *
 * Comunicação tab/canvas: o widget `security.ficha.tabs` lê a lista de
 * abas DECLARADAS pelos demais nodes (via `node.layout.tab`) — ele
 * mesmo não precisa de configuração pra saber quais abas exibir.
 * Active-tab é mantido em URL binding (`?var.active_tab=...`) pra
 * deep-link funcionar.
 */
import * as React from 'react';
import {
  Car,
  Crosshair,
  FileText,
  Gavel,
  Image as ImageIcon,
  Link2,
  MapPin,
  Phone,
  ScrollText,
  StickyNote,
  Table,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { iconByName } from '@/lib/icon-by-name';
import {
  CLASSIFICATION_BG,
  CLASSIFICATION_LABEL,
  type ClassificationLevel,
} from '@/lib/classification';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

// ─── 1) security.ficha.tabs ────────────────────────────────────────

type TabsCfg = {
  /** external_id da variable que carrega o array de specs `{id,label,count}`.
   *  Default: o shell injeta como `__ficha_tabs__`. */
  tabs_from?: string;
};

function FichaTabsWidget({ config, variables, bindings, setBinding }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as TabsCfg;
  const key = cfg.tabs_from ?? '__ficha_tabs__';
  const tabsRaw = variables[key];
  const tabs: { id: string; label: string; count: number }[] = Array.isArray(tabsRaw)
    ? (tabsRaw as { id: string; label: string; count: number }[])
    : [];
  const active =
    typeof bindings.active_tab === 'string' && bindings.active_tab
      ? (bindings.active_tab as string)
      : tabs[0]?.id;

  if (tabs.length === 0) {
    return (
      <div className="h-9 px-4 border-b border-border-light flex items-center text-[10px] font-mono text-muted-on-light italic">
        {t('ficha.chrome.tabs.empty')}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      data-testid="ficha-tabs"
      className="bg-canvas-light border-b border-border-light flex items-stretch px-4"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`ficha-tab-${t.id}`}
            onClick={() => setBinding('active_tab', t.id)}
            className={cn(
              'h-9 px-4 text-[11px] uppercase tracking-[0.18em] font-mono transition-colors relative',
              isActive
                ? 'text-text-on-light after:absolute after:bottom-0 after:inset-x-3 after:h-[2px] after:bg-primary'
                : 'text-muted-on-light hover:text-text-on-light',
            )}
          >
            {t.label}
            <span className="ml-2 text-[10px] opacity-60">{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

registerWidget('security.ficha.tabs', FichaTabsWidget, {
  group: 'ficha',
  label: 'Ficha · barra de abas',
  description: 'Header de navegação entre abas (Identidade, Histórico, Atividade, etc) com sync via URL.',
  icon: 'panels-top-left',
  defaultColSpan: 20,
  previewWidth: 720,
  previewHeight: 40,
  mockVariables: {
    __ficha_tabs__: [
      { id: 'identidade', label: 'Identidade', count: 4 },
      { id: 'historico', label: 'Histórico', count: 2 },
      { id: 'atividade', label: 'Atividade', count: 1 },
    ],
  },
  config_schema: [
    {
      name: 'tabs_from',
      label: 'Variável das abas',
      description:
        'external_id da variable com `{id,label,count}[]`. Default: __ficha_tabs__ (injetado pelo shell).',
      field: 'variable-ref',
    },
  ],
});

// ─── 2) security.ficha.paleta ──────────────────────────────────────

type PaletaCfg = {
  /** Itens da paleta. Default: catálogo nativo (15 widgets de ficha). */
  items?: { id: string; label: string; category: string; icon?: string }[];
  title?: string;
};

const DEFAULT_PALETA: { id: string; label: string; category: string; icon: string }[] = [
  { id: 'identificacao', label: 'Identificação', category: 'Propriedades', icon: 'user' },
  { id: 'antecedentes', label: 'Antecedentes criminais', category: 'Histórico', icon: 'scroll' },
  { id: 'mandados', label: 'Mandados', category: 'Histórico', icon: 'gavel' },
  { id: 'veiculos', label: 'Veículos associados', category: 'Histórico', icon: 'car' },
  { id: 'enderecos', label: 'Endereços conhecidos', category: 'Mapa', icon: 'map-pin' },
  { id: 'telefones', label: 'Telefones e contatos', category: 'Vínculos', icon: 'phone' },
  { id: 'vinculos-sociais', label: 'Vínculos familiares', category: 'Vínculos', icon: 'link-2' },
  { id: 'foto-face', label: 'Foto / face-match', category: 'Mídia', icon: 'image' },
  { id: 'lpr', label: 'Detecções LPR', category: 'Câmeras', icon: 'car' },
  { id: 'linha-tempo', label: 'Linha do tempo', category: 'Cronologia', icon: 'scroll' },
  { id: 'processos', label: 'Processos judiciais', category: 'Documentos', icon: 'file-text' },
  { id: 'armas', label: 'Armas associadas', category: 'Vínculos', icon: 'crosshair' },
  { id: 'organizacoes', label: 'Organizações', category: 'Vínculos', icon: 'users' },
  { id: 'notas', label: 'Notas operacionais', category: 'Custom', icon: 'sticky-note' },
  { id: 'tabela-custom', label: 'Tabela custom', category: 'Custom', icon: 'table' },
];

const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  user: UserIcon,
  scroll: ScrollText,
  gavel: Gavel,
  car: Car,
  'map-pin': MapPin,
  phone: Phone,
  'link-2': Link2,
  image: ImageIcon,
  'file-text': FileText,
  crosshair: Crosshair,
  users: Users,
  'sticky-note': StickyNote,
  table: Table,
};

// A "paleta" agora é o NAVEGADOR DE ASSOCIAÇÕES real (Links.neighbors + evidências),
// não mais o catálogo-teatro de widgets. Mantém o type-key `security.ficha.paleta` por
// compat de layout, mas renderiza dado vivo da entidade. (DEFAULT_PALETA/ICONS ficam só
// p/ o preview no catálogo do editor.)
type FichaNavItem = { id: string; tab: string; label: string; icon?: string };

// Left nav = ÍNDICE NAVEGÁVEL das seções da ficha (multi-domínio). Lê __ficha_nav__
// (injetado pelo shell a partir do layout REAL) e __ficha_tabs__ (rótulos pt-BR). Clicar
// NAVEGA pra aba (setBinding active_tab) — não é display de dados, é navegação.
function FichaPaletaWidget({ variables, bindings, setBinding }: WidgetRenderProps) {
  const t = useT();
  const nav: FichaNavItem[] = Array.isArray(variables?.__ficha_nav__)
    ? (variables.__ficha_nav__ as FichaNavItem[])
    : [];
  const tabsRaw = variables?.__ficha_tabs__;
  const tabLabel = new Map(
    (Array.isArray(tabsRaw) ? tabsRaw : []).map(
      (t: { id: string; label: string }) => [t.id, t.label] as const,
    ),
  );
  const active = typeof bindings?.active_tab === 'string' ? (bindings.active_tab as string) : '';

  const order: string[] = [];
  const byTab = new Map<string, FichaNavItem[]>();
  for (const it of nav) {
    if (!byTab.has(it.tab)) {
      byTab.set(it.tab, []);
      order.push(it.tab);
    }
    byTab.get(it.tab)!.push(it);
  }

  return (
    <aside
      data-testid="ficha-nav-rail"
      className="bg-panel-light border-r border-border-light h-full overflow-y-auto scrollbar-hide w-full"
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light sticky top-0 z-10">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-text-on-light">{t('ficha.chrome.nav.title')}</p>
      </header>
      {nav.length === 0 && (
        <p className="px-3 py-3 text-[11px] text-muted-on-light italic">{t('ficha.chrome.nav.empty')}</p>
      )}
      {order.map((tab) => (
        <div key={tab} className="border-b border-border-light">
          <button
            type="button"
            onClick={() => setBinding('active_tab', tab)}
            className={cn(
              'w-full text-left px-3 py-2 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5',
              active === tab ? 'text-text-on-light' : 'text-muted-on-light hover:text-text-on-light',
            )}
          >
            {tabLabel.get(tab) ?? tab}
            {active === tab && <span className="ml-auto w-1 h-1 bg-primary" />}
          </button>
          <ul className="pb-1">
            {(byTab.get(tab) ?? []).map((it) => {
              const Icon = iconByName(it.icon || 'circle');
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    data-testid={`ficha-nav-${it.id}`}
                    onClick={() => setBinding('active_tab', it.tab)}
                    title={`${it.label} — ir para a seção`}
                    className="w-full text-left px-3 h-8 text-[12px] flex items-center gap-2 text-text-on-light hover:bg-raised-light transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{it.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}

registerWidget('security.ficha.paleta', FichaPaletaWidget, {
  group: 'ficha',
  label: 'Ficha · navegação de seções',
  description:
    'Barra esquerda: índice NAVEGÁVEL das seções da ficha, derivado do layout real (multi-domínio: pessoa, empresa, instituição, evento). Clicar abre a aba.',
  icon: 'panels-top-left',
  defaultColSpan: 4,
  previewWidth: 220,
  previewHeight: 480,
  mockVariables: {
    __ficha_tabs__: [
      { id: 'identidade', label: 'Identidade', count: 2 },
      { id: 'historico', label: 'Histórico', count: 2 },
    ],
    __ficha_nav__: [
      { id: 'n1', tab: 'identidade', label: 'Identificação', icon: 'user' },
      { id: 'n2', tab: 'identidade', label: 'Endereços', icon: 'map-pin' },
      { id: 'n3', tab: 'historico', label: 'Antecedentes', icon: 'scroll-text' },
      { id: 'n4', tab: 'historico', label: 'Mandados', icon: 'gavel' },
    ],
  },
});

// ─── 3) security.ficha.inspetor ────────────────────────────────────

type InspetorCfg = {
  title?: string;
  /** external_id da variable contendo o objeto-entidade. Default: `obj`. */
  obj_from?: string;
};

function FichaInspetorWidget({ config, variables }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as InspetorCfg;
  const obj = (variables[cfg.obj_from ?? 'obj'] ?? null) as
    | (Record<string, unknown> & {
        id?: string;
        entity_type?: string;
        classification?: ClassificationLevel;
        version?: number;
        signed_hash?: string;
        created_by?: string;
        created_at?: string;
        updated_at?: string;
      })
    | null;

  if (!obj) {
    return (
      <aside className="w-full bg-panel-light border-l border-border-light h-full p-3 text-[11px] text-muted-on-light italic">
        {t('ficha.chrome.inspetor.empty')}
      </aside>
    );
  }

  const cls = obj.classification as ClassificationLevel | undefined;

  return (
    <aside
      data-testid="inspetor"
      className="bg-panel-light border-l border-border-light h-full overflow-y-auto"
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light sticky top-0 z-10">
        <p className="text-[11px] uppercase tracking-wider font-semibold">
          {cfg.title ?? t('ficha.chrome.inspetor.title')}
        </p>
      </header>

      <section className="p-3 border-b border-border-light">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
          {t('ficha.chrome.inspetor.metadados')}
        </p>
        <dl className="space-y-2 text-[11px]">
          {obj.id && (
            <div>
              <dt className="text-muted-on-light">{t('ficha.chrome.inspetor.identificador')}</dt>
              <dd className="font-mono break-all">{obj.id}</dd>
            </div>
          )}
          {obj.entity_type && (
            <div>
              <dt className="text-muted-on-light">{t('ficha.chrome.inspetor.tipo')}</dt>
              <dd className="font-mono uppercase">{obj.entity_type}</dd>
            </div>
          )}
          {cls && (
            <div>
              <dt className="text-muted-on-light">{t('ficha.chrome.inspetor.classificacao')}</dt>
              <dd>
                <span
                  className={cn(
                    'inline-flex items-center h-5 px-1.5 text-[10px] font-mono uppercase tracking-wider border',
                    CLASSIFICATION_BG[cls],
                  )}
                >
                  {CLASSIFICATION_LABEL[cls]}
                </span>
              </dd>
            </div>
          )}
          {typeof obj.version === 'number' && (
            <div>
              <dt className="text-muted-on-light">{t('ficha.chrome.inspetor.versao')}</dt>
              <dd className="font-mono">v{obj.version}</dd>
            </div>
          )}
          {obj.signed_hash && (
            <div>
              <dt className="text-muted-on-light">{t('ficha.chrome.inspetor.hash')}</dt>
              <dd className="font-mono text-[10px] break-all">{obj.signed_hash}</dd>
            </div>
          )}
        </dl>
      </section>

      {(obj.created_at || obj.updated_at) && (
        <section className="p-3 border-b border-border-light">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
            {t('ficha.chrome.inspetor.auditoria')}
          </p>
          <dl className="space-y-2 text-[11px]">
            {obj.created_at && (
              <div>
                <dt className="text-muted-on-light">{t('ficha.chrome.inspetor.criado')}</dt>
                <dd className="font-mono">
                  {new Date(obj.created_at).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {obj.created_by ? ` · ${obj.created_by}` : ''}
                </dd>
              </div>
            )}
            {obj.updated_at && (
              <div>
                <dt className="text-muted-on-light">{t('ficha.chrome.inspetor.atualizado')}</dt>
                <dd className="font-mono">
                  {new Date(obj.updated_at).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </aside>
  );
}

registerWidget('security.ficha.inspetor', FichaInspetorWidget, {
  group: 'ficha',
  label: 'Ficha · inspetor de metadados',
  description: 'Sidebar direita: ID, tipo, classificação, versão, hash assinado e auditoria.',
  icon: 'id-card',
  defaultColSpan: 4,
  previewWidth: 260,
  previewHeight: 480,
  mockConfig: { title: 'Metadados' },
  mockVariables: {
    obj: {
      id: '00000000-0000-4000-8000-000000000042',
      name: 'José da Silva',
      entity_type: 'pessoa',
      classification: 'restrito',
      version: 3,
      created_at: '2024-11-12T14:32:00Z',
      updated_at: '2026-05-10T09:18:00Z',
      created_by: 'analista_01',
    },
  },
  config_schema: [
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho do inspetor.',
      field: 'string',
      placeholder: 'Inspetor',
    },
    {
      name: 'obj_from',
      label: 'Variável da entidade',
      description: 'external_id da variable com o objeto-entidade. Default: `obj`.',
      field: 'variable-ref',
      placeholder: 'obj',
    },
  ],
});
