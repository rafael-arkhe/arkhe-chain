'use client';

/**
 * Painel lateral de filtros + fontes — coluna esquerda do /buscar.
 *
 * Restaura o 3-pane do mockup original e move o multi-select de fontes
 * pra cá (em vez de dropdown no input). Hierarquia:
 *
 *   ▸ Palavra-chave (input + modo)
 *   ▸ Tipo de entidade (chips toggle)
 *   ▸ Classificação (chips toggle)
 *   ▸ Período (chips toggle)
 *   ▸ Fontes — categorias colapsáveis com checkboxes
 *   ▸ Footer: Salvar busca · Criar alerta
 */
import * as React from 'react';
import { Bell, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { CLASSIFICATION_LABEL, type ClassificationLevel } from '@/lib/classification';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  SOURCE_CATALOG,
  type SourceCategory,
  type SourceDef,
} from '@/lib/buscar/types';
import {
  sourceServesKind,
  sourceNeedsOther,
  acceptsLabel,
  kindLabel,
  type DossierKind,
} from '@/lib/buscar/classify';

const CLASSIFICACOES: ClassificationLevel[] = [
  'sigiloso',
  'confidencial',
  'restrito',
  'publico',
];

/** Set vazio estável — evita recriar a cada render quando não há fontes fixadas. */
const EMPTY_PINNED: Set<string> = new Set();


type Props = {
  query: string;
  setQuery: (v: string) => void;

  /** Classificações selecionadas (filtro). */
  selectedClass: Set<string>;
  toggleClass: (c: string) => void;

  /** Fontes externas marcadas (chaves do SOURCE_CATALOG). */
  selectedSourceKeys: Set<string>;
  toggleSource: (key: string) => void;
  /**
   * Catálogo de fontes OFERECIDO neste tenant — derivado do vendor override
   * (`source_overrides`, via useEnabledSources). Default = catálogo inteiro.
   * Fontes escondidas pelo tenant NÃO chegam aqui. ADD-alongside: prop opcional
   * pra não quebrar chamadas/testes existentes.
   */
  catalog?: SourceDef[];
  /** Chaves fixadas no topo pelo tenant (sobem dentro da categoria). */
  pinnedKeys?: Set<string>;
  /** Tools MCP realmente expostas pelo backend. */
  availableMcpTools: Set<string>;
  /** Carregando lista de adapters. */
  loadingAdapters: boolean;
  /** Guia de fontes: tipo inferido do dado digitado + accepts por tool (name@version). */
  inferredKind: DossierKind | null;
  acceptsByTool: Record<string, string[]>;

  onSubmit: () => void;
  /** Salva a busca atual como SearchFeed (busca salva + monitorável → /alertas). */
  onSalvarBusca?: () => void;
  /** Operador pode criar/monitorar busca salva (perm alerts.feeds.subscribe). */
  canMonitor?: boolean;
  /** Salvando agora (desabilita o botão). */
  salvando?: boolean;
};

export function PainelFiltros({
  query,
  setQuery,
  selectedClass,
  toggleClass,
  selectedSourceKeys,
  toggleSource,
  catalog = SOURCE_CATALOG,
  pinnedKeys,
  availableMcpTools,
  loadingAdapters,
  inferredKind,
  acceptsByTool,
  onSubmit,
  onSalvarBusca,
  salvando,
  canMonitor = true,
}: Props) {
  const t = useT();
  const pinned = pinnedKeys ?? EMPTY_PINNED;

  // Agrupa fontes por categoria. Mantém visível a fonte selecionada-mas-
  // indisponível (renderizada desabilitada com badge) em vez de removê-la
  // silenciosamente — assim o operador entende que ela existe e está fora,
  // não que "sumiu" (Onda 1). Enquanto carrega, mostra todas.
  const offered = catalog.filter(
    (s) =>
      s.alwaysOn ||
      !s.mcpTool ||
      loadingAdapters ||
      availableMcpTools.has(s.mcpTool) ||
      selectedSourceKeys.has(s.key),
  );
  const byCat = {} as Record<SourceCategory, SourceDef[]>;
  for (const cat of CATEGORY_ORDER) byCat[cat] = [];
  for (const s of offered) {
    if (byCat[s.category]) byCat[s.category].push(s);
  }
  // Conta só o que VAI rodar (espelha o filtro do handleSubmit).
  const totalSel = catalog.filter(
    (s) =>
      (s.alwaysOn || selectedSourceKeys.has(s.key)) &&
      (s.alwaysOn || !s.mcpTool || availableMcpTools.has(s.mcpTool)),
  ).length;

  // Guia: quantas fontes SERVEM ao dado digitado vs PEDEM outro tipo.
  let serveCount = 0;
  let needsCount = 0;
  if (inferredKind) {
    for (const s of offered) {
      const acc = s.mcpTool ? acceptsByTool[s.mcpTool] : undefined;
      if (sourceServesKind(acc, inferredKind)) serveCount++;
      else if (sourceNeedsOther(acc, inferredKind)) needsCount++;
    }
  }

  return (
    <aside
      data-testid="buscar-painel-filtros"
      className="w-[280px] shrink-0 bg-panel-light border-r border-border-light flex flex-col overflow-y-auto"
    >
      {/* ─── Classificação ─────────────────────────────── */}
      <section className="p-3 border-b border-border-light">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono mb-2">
          {t('buscar.filtros.classificacao')}
        </p>
        <div className="flex flex-wrap gap-1">
          {CLASSIFICACOES.map((c) => {
            const active = selectedClass.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleClass(c)}
                data-testid={`buscar-filtro-class-${c}`}
                className={cn(
                  'px-2 h-6 text-[11px] border transition-colors',
                  active
                    ? 'bg-primary text-white border-primary'
                    : 'bg-canvas-light border-border-light text-text-on-light hover:border-primary',
                )}
              >
                {CLASSIFICATION_LABEL[c]}
              </button>
            );
          })}
        </div>
      </section>


      {/* ─── Fontes externas ───────────────────────────── */}
      <section className="border-b border-border-light">
        <div className="px-3 pt-3 pb-1 flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono flex-1">
            {t('buscar.filtros.fontes')}
          </p>
          <span className="px-1.5 py-0.5 text-[10px] font-mono bg-raised-light border border-border-light">
            {loadingAdapters ? '…' : totalSel}
          </span>
        </div>
        {inferredKind && query.trim() && (
          <div
            data-testid="buscar-guia-banner"
            className="mx-3 mb-1.5 px-2 py-1 text-[10px] bg-raised-light border-l-2 border-primary text-muted-on-light"
          >
            {t('buscar.filtros.detectado')}{' '}
            <span className="text-primary font-semibold">{kindLabel(inferredKind)}</span>
            {' · '}
            <span className="text-text-on-light">{serveCount}</span> {t('buscar.filtros.servem')}
            {needsCount > 0 && (
              <>
                {' · '}
                <span className="text-text-on-light">{needsCount}</span> {t('buscar.filtros.pedemOutroDado')}
              </>
            )}
          </div>
        )}
        <div>
          {CATEGORY_ORDER.map((cat) => {
            const items = byCat[cat];
            if (items.length === 0) return null;
            return (
              <FontesCategoria
                key={cat}
                cat={cat}
                items={items}
                selectedSourceKeys={selectedSourceKeys}
                toggleSource={toggleSource}
                pinnedKeys={pinned}
                availableMcpTools={availableMcpTools}
                loadingAdapters={loadingAdapters}
                inferredKind={inferredKind}
                acceptsByTool={acceptsByTool}
              />
            );
          })}
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────── */}
      {/* Botão só aparece com a perm de monitorar (alerts.feeds.subscribe) —
          antes ficava sempre visível e dava 403 no backend para quem não tinha. */}
      {canMonitor && (
      <div className="mt-auto p-3 flex flex-col gap-2 border-t border-border-light bg-raised-light">
        <button
          type="button"
          onClick={onSalvarBusca}
          disabled={!onSalvarBusca || salvando || !query.trim()}
          title={t('buscar.filtros.salvarTooltip')}
          data-testid="buscar-salvar"
          className="h-8 px-3 text-[12px] bg-primary text-white hover:bg-primary-hover flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {salvando ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <Bell className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          {salvando ? t('buscar.filtros.salvando') : t('buscar.filtros.salvarBuscaMonitorar')}
        </button>
      </div>
      )}
    </aside>
  );
}


/* -------------------------------------------------------------------------- */
/* Categoria de fontes — colapsável                                           */
/* -------------------------------------------------------------------------- */
function FontesCategoria({
  cat,
  items,
  selectedSourceKeys,
  toggleSource,
  pinnedKeys,
  availableMcpTools,
  loadingAdapters,
  inferredKind,
  acceptsByTool,
}: {
  cat: SourceCategory;
  items: SourceDef[];
  selectedSourceKeys: Set<string>;
  toggleSource: (key: string) => void;
  pinnedKeys: Set<string>;
  availableMcpTools: Set<string>;
  loadingAdapters: boolean;
  inferredKind: DossierKind | null;
  acceptsByTool: Record<string, string[]>;
}) {
  const t = useT();
  const hasPinned = items.some((s) => pinnedKeys.has(s.key));
  // Categorias "local" e "aegis" abrem por padrão; também abre qualquer
  // categoria que tenha uma fonte FIXADA pelo tenant (vendor). Demais ficam
  // fechadas pra não inundar 280px de checkbox.
  const defaultOpen = cat === 'local' || cat === 'aegis' || hasPinned;
  const [open, setOpen] = React.useState(defaultOpen);
  const total = items.length;
  const marcados = items.filter((s) => s.alwaysOn || selectedSourceKeys.has(s.key)).length;

  // Ordena: fixadas pelo tenant primeiro; depois as que SERVEM ao dado digitado
  // sobem; as que PEDEM outro descem.
  const rankOf = (s: SourceDef): number => {
    if (pinnedKeys.has(s.key)) return -1;
    if (!inferredKind) return 1;
    const acc = s.mcpTool ? acceptsByTool[s.mcpTool] : undefined;
    if (sourceServesKind(acc, inferredKind)) return 0;
    if (sourceNeedsOther(acc, inferredKind)) return 2;
    return 1;
  };
  const ordered =
    inferredKind || hasPinned
      ? [...items].sort((a, b) => rankOf(a) - rankOf(b))
      : items;

  return (
    <div className="border-t border-border-light/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 h-7 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-on-light hover:bg-raised-light"
        data-testid={`buscar-categoria-${cat}`}
      >
        {open ? (
          <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
        )}
        <span className="flex-1 text-left font-mono font-semibold">
          {CATEGORY_LABEL[cat]}
        </span>
        <span className="font-mono">
          {marcados}/{total}
        </span>
      </button>
      {open && (
        <ul className="pb-1">
          {ordered.map((s) => {
            const checked = s.alwaysOn || selectedSourceKeys.has(s.key);
            const unavailable =
              !s.alwaysOn && !!s.mcpTool && !loadingAdapters && !availableMcpTools.has(s.mcpTool);
            const acc = s.mcpTool ? acceptsByTool[s.mcpTool] : undefined;
            const serve = !!inferredKind && sourceServesKind(acc, inferredKind);
            const needs = !!inferredKind && sourceNeedsOther(acc, inferredKind);
            const pinned = pinnedKeys.has(s.key);
            return (
              <li key={s.key}>
                <label
                  className={cn(
                    'flex items-center gap-2 px-3 py-1 text-[11px] cursor-pointer hover:bg-raised-light border-l-2 border-transparent',
                    s.alwaysOn && 'cursor-default opacity-90',
                    unavailable && 'opacity-60 cursor-not-allowed',
                    serve && !unavailable && 'border-primary bg-primary/5',
                    needs && !unavailable && 'opacity-55',
                  )}
                  title={
                    unavailable
                      ? t('buscar.filtros.conectorIndisponivel')
                      : acc && acc.length
                        ? `${t('buscar.filtros.aceita')} ${acceptsLabel(acc)}`
                        : s.hint || s.mcpTool || ''
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={s.alwaysOn || unavailable}
                    onChange={() => !s.alwaysOn && !unavailable && toggleSource(s.key)}
                    data-testid={`buscar-fonte-${s.key}`}
                    className="w-3 h-3"
                  />
                  {s.icon && (
                    <s.icon
                      className="w-3.5 h-3.5 text-muted-on-light shrink-0"
                      strokeWidth={1.5}
                    />
                  )}
                  <span className="flex-1 truncate text-text-on-light">{s.label}</span>
                  {pinned && (
                    <span
                      data-testid={`buscar-fonte-fixada-${s.key}`}
                      title={t('buscar.filtros.fixadaTooltip')}
                      className="text-[9px] font-mono text-primary uppercase tracking-wider"
                    >
                      {t('buscar.filtros.fixada')}
                    </span>
                  )}
                  {serve && !unavailable && (
                    <span
                      data-testid={`buscar-fonte-serve-${s.key}`}
                      className="text-[9px] font-mono text-primary uppercase tracking-wider"
                    >
                      {t('buscar.filtros.serve')}
                    </span>
                  )}
                  {needs && !unavailable && (
                    <span className="text-[9px] font-mono text-muted-on-light">
                      {t('buscar.filtros.requer')} {acceptsLabel(acc)}
                    </span>
                  )}
                  {s.alwaysOn && (
                    <span className="text-[9px] font-mono text-muted-on-light">{t('buscar.filtros.sempre')}</span>
                  )}
                  {unavailable && (
                    <span
                      data-testid={`buscar-fonte-indisponivel-${s.key}`}
                      className="text-[9px] font-mono text-muted-on-light uppercase tracking-wider"
                    >
                      {t('buscar.filtros.indisponivel')}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
