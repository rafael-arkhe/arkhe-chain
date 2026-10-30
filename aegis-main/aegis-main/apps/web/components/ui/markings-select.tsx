'use client';

/**
 * MarkingsSelect — seletor MULTI de Marcações (classificação), dirigido pelo
 * catálogo real (`Markings.list()`).
 *
 * Erro do operador: campos de "Marcações" eram texto/JSON livre → ele tinha que
 * DECORAR os identificadores de cabeça (régua `feedback_no_manual_technical_input`).
 * Antes virou chips toggle do catálogo; agora é o MESMO combobox de BUSCA do
 * /buscar (gatilho + FloatingPopover sólido com campo de busca + checklist) — a
 * lista de marcações escala (dezenas) sem virar um mural de chips. Valor = lista
 * de slugs (o backend espera ["UNCLASSIFIED", …]).
 *
 * Estética: cantos retos, sem emoji, lucide neutro, strings via useT().
 */
import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { Markings, type Marking } from '@/lib/api';
import { FloatingPopover } from '@/components/ui/floating-popover';

/** Normaliza o valor do param (array, JSON-string ou vazio) → lista de slugs. */
export function parseMarkingsValue(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x);
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string' && !!x);
      }
    } catch {
      // string única não-JSON: trata como 1 slug.
      return [v.trim()];
    }
  }
  return [];
}

export function MarkingsSelect({
  value,
  onChange,
  testid = 'markings-select',
  popoverZIndex = 50,
}: {
  value: unknown;
  onChange: (slugs: string[]) => void;
  testid?: string;
  /** z-index do popover. DENTRO de um modal use > z do modal (ex.: 70). */
  popoverZIndex?: number;
}) {
  const t = useT();
  const [markings, setMarkings] = React.useState<Marking[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const selected = React.useMemo(() => new Set(parseMarkingsValue(value)), [value]);

  React.useEffect(() => {
    let alive = true;
    void Markings.list()
      .then((rows) => {
        if (alive) setMarkings(rows.filter((m) => m.active));
      })
      .catch(() => {
        if (alive) setMarkings([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (slug: string) => {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange(Array.from(next));
  };

  const list = markings ?? [];
  const q = query.trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      !q
        ? list
        : list.filter(
            (m) =>
              (m.display_name || m.slug).toLowerCase().includes(q) ||
              m.slug.toLowerCase().includes(q),
          ),
    [list, q],
  );

  const selectedLabels = list.filter((m) => selected.has(m.slug)).map((m) => m.display_name || m.slug);
  const triggerText =
    selected.size === 0
      ? t('markingsSelect.placeholder')
      : selectedLabels.length
        ? selectedLabels.join(', ')
        : `${selected.size}`;

  return (
    <div className="flex flex-col gap-1 min-w-0 flex-1" data-testid={`${testid}-wrap`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={testid}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-7 items-center justify-between gap-2 border border-border-light bg-white px-2 text-left text-[11px] outline-none hover:border-primary focus:border-primary"
      >
        <span className={selected.size ? 'truncate text-text-on-light' : 'truncate text-muted-on-light'}>
          {triggerText}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-muted-on-light transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>

      <FloatingPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom"
        align="start"
        offset={4}
        matchTriggerWidth
        minWidth={220}
        maxHeight="min(60vh, 320px)"
        zIndex={popoverZIndex}
        role="listbox"
        ariaLabel={t('relatorios.markings')}
        testId={`${testid}-pop`}
        bodyTestId={`${testid}-options`}
        header={
          <span className="flex h-9 shrink-0 items-center gap-1 border-b border-border-light px-2">
            <Search className="w-3.5 h-3.5 shrink-0 text-muted-on-light" strokeWidth={1.5} />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('buscar.multiselect.buscar')}
              data-testid={`${testid}-input`}
              className="flex-1 bg-transparent text-[12px] outline-none"
            />
          </span>
        }
      >
        {markings === null ? (
          <p className="px-2 py-2 text-[10px] italic text-muted-on-light">{t('schemaForm.loading')}</p>
        ) : list.length === 0 ? (
          <p className="px-2 py-2 text-[10px] italic text-muted-on-light">{t('markingsSelect.empty')}</p>
        ) : visible.length === 0 ? (
          <p className="px-2 py-2 text-[10px] italic text-muted-on-light">{t('buscar.multiselect.vazio')}</p>
        ) : (
          visible.map((m) => {
            const on = selected.has(m.slug);
            return (
              <button
                key={m.slug}
                type="button"
                role="option"
                aria-selected={on}
                aria-pressed={on}
                data-testid={`${testid}-opt-${m.slug}`}
                data-on={on ? 'true' : 'false'}
                onClick={() => toggle(m.slug)}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-primary/5"
              >
                <span
                  aria-hidden
                  className={[
                    'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border',
                    on ? 'border-primary bg-primary' : 'border-border-light',
                  ].join(' ')}
                >
                  {on && <Check className="w-3 h-3 text-white" strokeWidth={2} />}
                </span>
                <span className="truncate">{m.display_name || m.slug}</span>
              </button>
            );
          })
        )}
      </FloatingPopover>
    </div>
  );
}
