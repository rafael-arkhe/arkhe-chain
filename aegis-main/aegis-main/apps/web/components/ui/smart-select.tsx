'use client';

/**
 * SmartSelect — wrapper que decide entre `<select>` nativo e o
 * `SearchableSelect` (combobox com busca) baseado em duas condições:
 *
 *   1. nº de opções > `searchThreshold` (default 10)
 *   2. trigger tem largura suficiente pra mostrar a barra de busca
 *      sem cortar (default 180px)
 *
 * Se ambas batem → SearchableSelect. Caso contrário → `<select>` nativo
 * com optgroups (rápido, leve, acessível, comportamento mobile nativo).
 *
 * Override manual via `variant`:
 *   - `auto`    (default) — usa as heurísticas acima
 *   - `search`  — força combobox com busca
 *   - `native`  — força `<select>` nativo
 *
 * Sharp: sem rounded-*, sem shadow.
 */
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SearchableSelect, type SelectOption } from './searchable-select';

export type SmartSelectVariant = 'auto' | 'search' | 'native';

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  'data-testid'?: string;
  /** auto (default) decide pelo nº de opções + largura. */
  variant?: SmartSelectVariant;
  /** Mínimo de opções pra ativar busca em modo auto. */
  searchThreshold?: number;
  /** Largura mínima (px) do trigger pra ativar busca em modo auto. */
  searchMinWidth?: number;
};

export function SmartSelect({
  value,
  onChange,
  options,
  placeholder = '— escolha —',
  emptyLabel,
  searchPlaceholder,
  disabled,
  id,
  'data-testid': testId,
  variant = 'auto',
  searchThreshold = 10,
  searchMinWidth = 180,
}: Props) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [hasRoom, setHasRoom] = React.useState(false);

  // Mede a largura do wrapper pra decidir se cabe a barra de busca.
  // Só roda em modo auto — search/native não dependem dessa medição.
  React.useEffect(() => {
    if (variant !== 'auto') return;
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      setHasRoom(w >= searchMinWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant, searchMinWidth]);

  // Agrupa por optgroup pra modo nativo (preservando ordem de origem).
  // Sempre calcula — não pode estar atrás de early return ou viola hooks.
  const grouped = React.useMemo(() => {
    const buckets = new Map<string, SelectOption[]>();
    const order: string[] = [];
    for (const o of options) {
      const g = o.group ?? '';
      if (!buckets.has(g)) {
        buckets.set(g, []);
        order.push(g);
      }
      buckets.get(g)!.push(o);
    }
    return order.map((g) => ({ group: g, items: buckets.get(g)! }));
  }, [options]);

  const useSearch =
    variant === 'search' ||
    (variant === 'auto' && options.length > searchThreshold && hasRoom);

  if (useSearch) {
    return (
      <div ref={wrapperRef}>
        <SearchableSelect
          id={id}
          data-testid={testId}
          value={value}
          onChange={onChange}
          options={options}
          placeholder={placeholder}
          emptyLabel={emptyLabel}
          searchPlaceholder={searchPlaceholder}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      data-testid={testId ? `${testId}-native-wrap` : undefined}
    >
      <select
        id={id}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full h-9 pl-2.5 pr-7 text-[12px] bg-canvas-light border border-border-light outline-none appearance-none',
          'focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed',
          !value && 'text-muted-on-light',
        )}
      >
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {grouped.map((g) =>
          g.group ? (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <React.Fragment key="_ungrouped">
              {g.items.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </React.Fragment>
          ),
        )}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light"
        strokeWidth={1.5}
      />
    </div>
  );
}

export type { SelectOption };
