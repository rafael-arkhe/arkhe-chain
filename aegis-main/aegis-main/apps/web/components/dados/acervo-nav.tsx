'use client';

/**
 * Acervo — pane esquerda (280px) da Tela de Dados (Onda 2 · I1b).
 *
 * Substitui os botões horizontais `dd-tab-*` por uma nav vertical agrupada
 * (Palantir-style, espelhando components/buscar/painel-filtros.tsx). Duas
 * famílias:
 *   ▸ Acervo (a camada de dados): Fontes · Datasets · Arquivos · Pipelines · Marcações
 *   ▸ Infra de IA (transitório até o hub próprio): Provedores · Modelos
 *
 * Gating: o pai (Tela de Dados) já filtra `items` pelas perms do principal
 * (admin curto-circuita) — item sem perm NÃO chega aqui. A busca filtra os itens
 * por rótulo (honesta). Os chips de governança + a listagem de assets individuais
 * (Fontes/Datasets como itens) entram em I2/I3, quando há lista de assets a
 * filtrar — não há UI morta nesta casca.
 *
 * Régua: cantos retos, `#2D77BE` só como estado (seleção), ícones neutros
 * (currentColor), rótulos via useT() pt-BR+en-US.
 */
import * as React from 'react';
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';

export type AcervoValue =
  | 'conexoes'
  | 'cameras'
  | 'datasets'
  | 'arquivos'
  | 'pipelines'
  | 'ide'
  | 'marcacoes'
  | 'provedores'
  | 'modelos';

export type AcervoGroup = 'dados' | 'infra';

export type AcervoItem = {
  value: AcervoValue;
  labelKey: string;
  Icon: LucideIcon;
  /** Perm do recurso — usada pelo pai p/ filtrar (não consumida aqui). */
  perm: string;
  group: AcervoGroup;
};

const GROUPS: { key: AcervoGroup; labelKey: string }[] = [
  { key: 'dados', labelKey: 'acervo.grupo.dados' },
  { key: 'infra', labelKey: 'acervo.grupo.infra' },
];

type Props = {
  /** Itens JÁ filtrados por permissão (visíveis). */
  items: AcervoItem[];
  active: AcervoValue | null;
  onSelect: (v: AcervoValue) => void;
  /**
   * 2º nível CONTEXTUAL da seção ativa (Onda 2 · I2): lista os assets dela
   * (ex.: Pipelines → boards). Quando presente, a nav de seções fica compacta e
   * o slot ocupa o resto do rail. I3 reusa o slot p/ Datasets/Fontes.
   */
  contextualSlot?: React.ReactNode;
  /** A3 — collapse controlado pelo pai (padrão do CP sidenav): colapsado vira
   *  rail de 44px só com ícones; ao entrar em ?aba=pipelines nasce colapsado
   *  (foco no canvas). Sem as props, comporta como antes (sempre aberto). */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export function AcervoNav({ items, active, onSelect, contextualSlot, collapsed = false, onCollapsedChange }: Props) {
  const t = useT();
  const [q, setQ] = React.useState('');
  const query = q.trim().toLowerCase();

  const visible = React.useMemo(
    () =>
      query
        ? items.filter((it) => t(it.labelKey).toLowerCase().includes(query))
        : items,
    [items, query, t],
  );

  // A3 — rail colapsado: 44px, só ícones (clicar navega E expande? não — só
  // navega; expandir é o botão dedicado). Mantém o operador orientado sem
  // roubar o foco do canvas.
  if (collapsed) {
    return (
      <aside
        data-testid="acervo-nav"
        data-collapsed="true"
        className="w-[44px] shrink-0 bg-panel-light border-r border-border-light flex flex-col items-center overflow-y-auto scrollbar-hide"
      >
        <button
          type="button"
          onClick={() => onCollapsedChange?.(false)}
          data-testid="acervo-expand"
          title={t('acervo.expandir')}
          aria-label={t('acervo.expandir')}
          className="h-12 w-full flex items-center justify-center border-b border-border-light text-muted-on-light hover:text-primary shrink-0"
        >
          <PanelLeftOpen className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <ul className="py-1 w-full">
          {items.map(({ value, labelKey, Icon }) => {
            const isActive = active === value;
            return (
              <li key={value}>
                <button
                  type="button"
                  data-testid={`acervo-item-${value}`}
                  onClick={() => onSelect(value)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-pressed={isActive}
                  title={t(labelKey)}
                  className={cn(
                    'w-full h-8 flex items-center justify-center border-l-2 transition-colors',
                    isActive
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-transparent text-text-on-light hover:bg-raised-light',
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    );
  }

  return (
    <aside
      data-testid="acervo-nav"
      className="w-[280px] shrink-0 bg-panel-light border-r border-border-light flex flex-col overflow-y-auto scrollbar-hide"
    >
      <header className="h-12 px-4 border-b border-border-light flex items-center justify-between shrink-0">
        <h1 className="text-[13px] font-semibold text-text-on-light">{t('acervo.titulo')}</h1>
        {onCollapsedChange && (
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            data-testid="acervo-collapse"
            title={t('acervo.colapsar')}
            aria-label={t('acervo.colapsar')}
            className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-primary"
          >
            <PanelLeftClose className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
      </header>

      {/* Busca — filtra os itens da nav por rótulo. */}
      <div className="p-3 border-b border-border-light">
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('acervo.buscarPlaceholder')}
            data-testid="acervo-busca"
            className="w-full h-8 pl-7 pr-2 text-[12px] bg-white border border-border-light focus:border-primary outline-none"
          />
        </div>
      </div>

      <nav className={contextualSlot ? 'shrink-0' : 'flex-1'} role="navigation" aria-label={t('acervo.titulo')}>
        {GROUPS.map((g) => {
          const groupItems = visible.filter((it) => it.group === g.key);
          if (groupItems.length === 0) return null;
          return (
            <section key={g.key} className="border-b border-border-light" data-testid={`acervo-grupo-${g.key}`}>
              <p className="px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono">
                {t(g.labelKey)}
              </p>
              <ul className="pb-2">
                {groupItems.map(({ value, labelKey, Icon }) => {
                  const isActive = active === value;
                  return (
                    <li key={value}>
                      <button
                        type="button"
                        data-testid={`acervo-item-${value}`}
                        onClick={() => onSelect(value)}
                        aria-current={isActive ? 'page' : undefined}
                        aria-pressed={isActive}
                        className={cn(
                          'w-full px-3 h-8 flex items-center gap-2 text-[12px] border-l-2 transition-colors',
                          isActive
                            ? 'border-primary bg-primary/5 text-primary font-medium'
                            : 'border-transparent text-text-on-light hover:bg-raised-light',
                        )}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                        <span className="flex-1 text-left truncate">{t(labelKey)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {visible.length === 0 && (
          <p
            data-testid="acervo-busca-vazio"
            className="px-3 py-4 text-[11px] text-muted-on-light italic"
          >
            {t('acervo.buscaVazia')}
          </p>
        )}
      </nav>

      {/* 2º nível contextual da seção ativa (I2: boards das Pipelines). */}
      {contextualSlot && (
        <div data-testid="acervo-contextual" className="flex-1 min-h-0 flex flex-col border-t border-border-light">
          {contextualSlot}
        </div>
      )}
    </aside>
  );
}
