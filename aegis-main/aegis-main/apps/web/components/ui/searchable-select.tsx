'use client';

/**
 * Combobox com busca interna — substitui `<select>` quando a lista de
 * opções é grande (>15) e a barra de filtro acelera muito a escolha.
 *
 * Suporta optgroups (`group` por opção), keyboard nav (↑/↓/Enter/Esc),
 * click outside pra fechar e foco automático na busca quando abre.
 *
 * Sharp: sem rounded-*, sem shadow.
 */
import * as React from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  /** Optgroup label — opções com mesmo `group` ficam agrupadas. */
  group?: string;
  /** Texto extra pesquisável que não aparece no label. */
  hint?: string;
  /** Segunda linha (muted) sob o label — detalhe rico por item (pesquisável). */
  sublabel?: string;
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  'data-testid'?: string;
  id?: string;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '— escolha —',
  emptyLabel = 'Nenhuma opção encontrada',
  searchPlaceholder = 'Buscar…',
  disabled,
  'data-testid': testId,
  id,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [hoverIdx, setHoverIdx] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Foco no input ao abrir
  React.useEffect(() => {
    if (open) {
      setQuery('');
      setHoverIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Click outside fecha
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.hint ?? '').toLowerCase().includes(q) ||
        (o.sublabel ?? '').toLowerCase().includes(q) ||
        (o.group ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  // Agrupa filtered por `group` preservando a ordem de origem
  const grouped = React.useMemo(() => {
    const buckets = new Map<string, SelectOption[]>();
    const order: string[] = [];
    for (const o of filtered) {
      const g = o.group ?? '';
      if (!buckets.has(g)) {
        buckets.set(g, []);
        order.push(g);
      }
      buckets.get(g)!.push(o);
    }
    return order.map((g) => ({ group: g, items: buckets.get(g)! }));
  }, [filtered]);

  // Flat index pra keyboard navigation
  const flatItems = React.useMemo(
    () => grouped.flatMap((g) => g.items),
    [grouped],
  );

  React.useEffect(() => {
    if (hoverIdx >= flatItems.length) setHoverIdx(0);
  }, [flatItems.length, hoverIdx]);

  const selected = options.find((o) => o.value === value);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHoverIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHoverIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = flatItems[hoverIdx];
      if (pick) {
        onChange(pick.value);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  // Scroll item highlighted into view
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${hoverIdx}"]`,
    );
    // jsdom não implementa scrollIntoView — guard defensivo.
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [hoverIdx, open]);

  return (
    <div ref={wrapRef} className="relative" data-testid={testId}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          'w-full h-9 pl-2.5 pr-2 text-[12px] bg-canvas-light border border-border-light outline-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed',
          open ? 'border-primary' : 'hover:border-primary/60',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={cn(
            'flex-1 text-left truncate',
            !selected && 'text-muted-on-light',
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        {selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="text-muted-on-light hover:text-danger p-0.5"
            title="Limpar"
          >
            <X className="w-3 h-3" strokeWidth={1.5} />
          </span>
        )}
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-muted-on-light transition-transform',
            open && 'rotate-180',
          )}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 bg-canvas-light border border-border-light z-50 max-h-[280px] flex flex-col"
          data-testid={testId ? `${testId}-dropdown` : undefined}
        >
          <div className="relative border-b border-border-light shrink-0">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light"
              strokeWidth={1.5}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHoverIdx(0);
              }}
              onKeyDown={handleKey}
              placeholder={searchPlaceholder}
              className="w-full h-8 pl-7 pr-2 text-[12px] bg-canvas-light outline-none"
              data-testid={testId ? `${testId}-search` : undefined}
            />
          </div>

          <div
            ref={listRef}
            role="listbox"
            className="flex-1 overflow-y-auto"
          >
            {flatItems.length === 0 && (
              <p className="px-3 py-3 text-[11px] text-muted-on-light italic">
                {emptyLabel}
              </p>
            )}
            {grouped.map((g) => (
              <div key={g.group || '_'}>
                {g.group && (
                  <p className="px-2.5 pt-2 pb-1 text-[9px] font-mono uppercase tracking-[0.16em] text-muted-on-light font-semibold border-t border-border-light/40 first:border-t-0 bg-raised-light/40">
                    {g.group}
                  </p>
                )}
                <ul>
                  {g.items.map((o) => {
                    const idx = flatItems.indexOf(o);
                    const isHover = idx === hoverIdx;
                    const isSel = o.value === value;
                    return (
                      <li key={o.value}>
                        <button
                          type="button"
                          onClick={() => {
                            onChange(o.value);
                            setOpen(false);
                          }}
                          onMouseEnter={() => setHoverIdx(idx)}
                          data-idx={idx}
                          data-testid={
                            testId ? `${testId}-option-${o.value}` : undefined
                          }
                          className={cn(
                            'w-full text-left px-2.5 py-1.5 text-[12px] flex items-center gap-2',
                            isHover && 'bg-raised-light',
                            isSel && 'bg-primary/5 text-primary',
                          )}
                          role="option"
                          aria-selected={isSel}
                        >
                          <Check
                            className={cn(
                              'w-3 h-3 shrink-0',
                              isSel ? 'opacity-100' : 'opacity-0',
                            )}
                            strokeWidth={2}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block">{o.label}</span>
                            {o.sublabel && (
                              <span className="block text-[10px] text-muted-on-light leading-snug">
                                {o.sublabel}
                              </span>
                            )}
                          </span>
                          {o.hint && (
                            <span className="text-[10px] font-mono text-muted-on-light shrink-0 self-start mt-0.5">
                              {o.hint}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
