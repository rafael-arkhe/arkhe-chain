'use client';

/**
 * Onda I.5 (2026-05-23) — ComunicadosList.
 * Mission #10 (2026-05-24) — reescrita do row + estado selecionado.
 *
 * Painel esquerdo do CRUD admin de Comunicados. 3 filtros + busca por
 * título + renderização linear de rows.
 *
 * - Filtros: status_temporal (todos/active/future/past), kind (todos/info/
 *   warning/danger/success), search (substring case-insensitive em title
 *   e body).
 * - Cada row: barra de acento (kind) à esquerda · status badge + título
 *   truncado + meta compacta (data/agenda + CTA + fixo) · ações de
 *   duplicar/excluir em overlay (hover/focus) — NÃO somam altura à linha.
 *
 * Fix Mission #10:
 *  - Altura da linha é contida (uma única <button> preenche o <li>); as
 *    ações ficam em overlay absoluto, então a linha não "estoura".
 *  - Estado selecionado é coeso: barra de acento à esquerda + fundo sutil
 *    + ring inset — sem mais "metade azul / metade branca com borda preta".
 *
 * Memórias honradas:
 *  - feedback_no_rounded_no_sparkles · zero rounded-*.
 *  - feedback_no_emojis_in_ui · só ícones lucide.
 *  - feedback_no_localstorage_for_persistence · filtros vêm via props.
 *  - feedback_ui_english_only (i18n) · strings novas via useT().
 */
import * as React from 'react';
import { Copy, Pin, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { formatDataBR } from '@/lib/datetime';
import type { ComunicadoOut } from '@/lib/api';
import {
  ComunicadoStatusBadge,
  deriveStatus,
  type ComunicadoStatus,
} from './comunicado-status-badge';

export type ListStatusFilter = 'all' | 'active' | 'future' | 'past';
export type ListKindFilter = 'all' | 'info' | 'warning' | 'danger' | 'success';

export interface ComunicadosListProps {
  items: ComunicadoOut[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  search: string;
  statusFilter: ListStatusFilter;
  kindFilter: ListKindFilter;
  onSearch: (q: string) => void;
  onStatusFilter: (s: ListStatusFilter) => void;
  onKindFilter: (k: ListKindFilter) => void;
  onSelect: (c: ComunicadoOut) => void;
  onNew: () => void;
  onDelete: (c: ComunicadoOut) => void;
  onDuplicate: (c: ComunicadoOut) => void;
}

const STATUS_FILTERS: { value: ListStatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'future', label: 'Agendados' },
  { value: 'past', label: 'Expirados' },
];

const KIND_FILTERS: { value: ListKindFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Atenção' },
  { value: 'danger', label: 'Crítico' },
  { value: 'success', label: 'Sucesso' },
];

/** Barra de acento + ponto do kind — espelha as cores do banner. */
const KIND_ACCENT_CLASS: Record<string, string> = {
  info: 'bg-info',
  warning: 'bg-warning',
  danger: 'bg-danger',
  success: 'bg-success',
};

function passesStatus(c: ComunicadoOut, f: ListStatusFilter, now: Date): boolean {
  if (f === 'all') return true;
  const s = deriveStatus(c, now);
  if (f === 'active') return s === 'active';
  if (f === 'future') return s === 'future';
  if (f === 'past') return s === 'past';
  return true;
}

function passesKind(c: ComunicadoOut, f: ListKindFilter): boolean {
  if (f === 'all') return true;
  return c.kind === f;
}

function passesSearch(c: ComunicadoOut, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    c.title.toLowerCase().includes(needle) ||
    (c.body ?? '').toLowerCase().includes(needle)
  );
}

/**
 * Texto de meta temporal compacto, derivado do mesmo status do badge:
 *  - future → "Início {data}"
 *  - past   → "Fim {data}"
 *  - resto  → "Criado {data}"
 */
function metaDate(
  c: ComunicadoOut,
  status: ComunicadoStatus,
  t: (k: string) => string,
): string {
  if (status === 'future' && c.schedule_start) {
    return t('comunicadosAdmin.rowScheduled').replace(
      '{date}',
      formatDataBR(c.schedule_start),
    );
  }
  if (status === 'past' && c.schedule_end) {
    return t('comunicadosAdmin.rowExpired').replace(
      '{date}',
      formatDataBR(c.schedule_end),
    );
  }
  return t('comunicadosAdmin.rowCreated').replace(
    '{date}',
    formatDataBR(c.created_at),
  );
}

interface RowProps {
  c: ComunicadoOut;
  status: ComunicadoStatus;
  selected: boolean;
  onSelect: (c: ComunicadoOut) => void;
  onDelete: (c: ComunicadoOut) => void;
  onDuplicate: (c: ComunicadoOut) => void;
  t: (k: string) => string;
}

function ComunicadoRow({
  c,
  status,
  selected,
  onSelect,
  onDelete,
  onDuplicate,
  t,
}: RowProps) {
  const accent = KIND_ACCENT_CLASS[c.kind] ?? 'bg-muted-on-light';
  return (
    <li
      data-testid={`comunicado-row-${c.id}`}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        // `relative` ancora a barra de acento + o overlay de ações; a
        // borda inferior é o único divisor (cor de borda suave, nunca preta).
        // `group/row` revela as ações SÓ desta linha no hover.
        'group/row relative border-b border-border-light',
        'transition-colors',
        selected
          ? 'bg-primary/[0.07]'
          : 'hover:bg-panel-light focus-within:bg-panel-light',
      )}
    >
      {/* Barra de acento à esquerda — kind-colorida e sólida quando
          selecionado; um vinco sutil no hover. Tratamento ÚNICO do estado
          selecionado (sem mais "metade azul / metade branca"). */}
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[3px] transition-colors',
          selected
            ? accent
            : 'bg-transparent group-hover/row:bg-border-light',
        )}
      />

      <button
        type="button"
        onClick={() => onSelect(c)}
        data-testid={`comunicado-row-${c.id}-select`}
        aria-current={selected ? 'true' : undefined}
        aria-label={`Editar comunicado ${c.title}`}
        className={cn(
          // Altura contida: padding fixo, sem elementos-irmãos que somem
          // altura. pr-14 reserva espaço pro overlay de ações sem sobrepor
          // o texto. focus-visible cobre a linha INTEIRA (ring inset).
          'w-full text-left pl-3 pr-14 py-2.5 flex flex-col gap-1',
          'outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className={cn('w-1.5 h-1.5 shrink-0', accent)}
          />
          <span
            className={cn(
              'text-[12.5px] leading-tight truncate min-w-0',
              selected
                ? 'font-semibold text-text-on-light'
                : 'font-medium text-text-on-light',
            )}
            title={c.title}
          >
            {c.title}
          </span>
        </div>
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <ComunicadoStatusBadge
            status={status}
            testId={`comunicado-row-${c.id}-status`}
          />
          <span className="text-[10.5px] text-muted-on-light shrink-0 tabular-nums">
            {metaDate(c, status, t)}
          </span>
          {!c.closable && (
            <span
              data-testid={`comunicado-row-${c.id}-pinned`}
              title={t('comunicadosAdmin.rowNotClosableHint')}
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-on-light shrink-0"
            >
              <Pin className="w-2.5 h-2.5" aria-hidden strokeWidth={1.5} />
              {t('comunicadosAdmin.rowNotClosable')}
            </span>
          )}
          {c.cta_label && (
            <span
              className="text-[10px] text-muted-on-light truncate min-w-0"
              title={`${t('comunicadosAdmin.rowHasCta')}: ${c.cta_label}`}
            >
              · {c.cta_label}
            </span>
          )}
        </div>
      </button>

      {/* Overlay de ações — absoluto, NÃO soma altura à linha. Revelado
          no hover/focus DESTA linha; sempre visível quando selecionado. */}
      <div
        className={cn(
          'absolute top-1.5 right-2 flex gap-1 transition-opacity',
          selected
            ? 'opacity-100'
            : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100',
        )}
      >
        <button
          type="button"
          onClick={() => onDuplicate(c)}
          data-testid={`comunicado-row-${c.id}-duplicate`}
          aria-label={`Duplicar ${c.title}`}
          title={t('comunicadosAdmin.duplicate')}
          className="inline-flex items-center justify-center w-6 h-6 bg-white border border-border-light text-muted-on-light hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Copy className="w-3 h-3" aria-hidden strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(c)}
          data-testid={`comunicado-row-${c.id}-delete`}
          aria-label={`Excluir ${c.title}`}
          title={t('comunicadosAdmin.delete')}
          className="inline-flex items-center justify-center w-6 h-6 bg-white border border-border-light text-muted-on-light hover:border-danger hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Trash2 className="w-3 h-3" aria-hidden strokeWidth={1.5} />
        </button>
      </div>
    </li>
  );
}

export function ComunicadosList(props: ComunicadosListProps) {
  const {
    items,
    loading,
    error,
    selectedId,
    search,
    statusFilter,
    kindFilter,
    onSearch,
    onStatusFilter,
    onKindFilter,
    onSelect,
    onNew,
    onDelete,
    onDuplicate,
  } = props;

  const t = useT();
  const now = React.useMemo(() => new Date(), [items]);

  const filtered = React.useMemo(
    () =>
      items.filter(
        (c) =>
          passesStatus(c, statusFilter, now) &&
          passesKind(c, kindFilter) &&
          passesSearch(c, search),
      ),
    [items, statusFilter, kindFilter, search, now],
  );

  return (
    <aside
      data-testid="comunicados-list"
      className="w-[320px] shrink-0 bg-white border-r border-border-light flex flex-col overflow-hidden"
    >
      <header className="px-3 py-3 border-b border-border-light space-y-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-on-light flex-1">
            Comunicados
          </h2>
          {!loading && !error && (
            <span
              data-testid="comunicados-count"
              className="text-[10.5px] text-muted-on-light tabular-nums"
            >
              {t('comunicadosAdmin.listCount')
                .replace('{n}', String(filtered.length))
                .replace('{total}', String(items.length))}
            </span>
          )}
          <button
            type="button"
            onClick={onNew}
            data-testid="comunicados-new"
            aria-label="Criar novo comunicado"
            className="inline-flex items-center gap-1 h-7 px-2 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Plus className="w-3 h-3" aria-hidden strokeWidth={1.5} />
            Novo
          </button>
        </div>
        <div className="relative">
          <Search
            className="w-3 h-3 absolute left-2 top-2.5 text-muted-on-light"
            aria-hidden
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por título…"
            data-testid="comunicados-search"
            aria-label="Buscar comunicados"
            className="w-full h-8 pl-7 pr-2 text-[12px] bg-canvas-light border border-border-light outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-focus"
          />
        </div>
        <div data-testid="comunicados-status-filter" className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onStatusFilter(f.value)}
              data-testid={`comunicados-filter-status-${f.value}`}
              aria-pressed={statusFilter === f.value}
              className={cn(
                'h-6 px-2 text-[10.5px] border focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                statusFilter === f.value
                  ? 'bg-primary text-white border-primary'
                  : 'bg-canvas-light border-border-light hover:border-primary',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div data-testid="comunicados-kind-filter" className="flex flex-wrap gap-1">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onKindFilter(f.value)}
              data-testid={`comunicados-filter-kind-${f.value}`}
              aria-pressed={kindFilter === f.value}
              className={cn(
                'h-6 px-2 text-[10.5px] border focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                kindFilter === f.value
                  ? 'bg-primary text-white border-primary'
                  : 'bg-canvas-light border-border-light hover:border-primary',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p
            data-testid="comunicados-loading"
            className="px-3 py-3 text-[11px] text-muted-on-light italic"
          >
            Carregando comunicados…
          </p>
        )}
        {error && !loading && (
          <p
            data-testid="comunicados-error"
            className="px-3 py-3 text-[11px] text-danger font-mono"
          >
            {error}
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <p
            data-testid="comunicados-empty"
            className="px-3 py-3 text-[11px] text-muted-on-light italic"
          >
            Nenhum comunicado encontrado.
          </p>
        )}
        {/* group/list habilita o reveal das ações por hover na linha. */}
        <ul className="group/list">
          {filtered.map((c) => (
            <ComunicadoRow
              key={c.id}
              c={c}
              status={deriveStatus(c, now)}
              selected={selectedId === c.id}
              onSelect={onSelect}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              t={t}
            />
          ))}
        </ul>
      </div>
    </aside>
  );
}
