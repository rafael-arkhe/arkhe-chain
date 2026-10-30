'use client';

/**
 * MultiselectField — combobox MULTI dirigido pelo CATÁLOGO da fonte (FE-A).
 * Seleção múltipla de sites/categorias (ex.: maigret `sites`/`categorias`/`pais`,
 * wmn `sites`/`categorias`, sherlock `sites`). Valor CANÔNICO: CSV dos ids
 * selecionados — vira `p_<tool>__<prop>=GitHub,GitLab` na URL do SSE.
 *
 * UX (redesign): NÃO é mais uma lista inline sempre aberta (empilhava listas
 * gigantes e quebrava o scroll). Agora é um GATILHO COMPACTO ("Todos" / "N
 * selecionados" / "Selecionar…") que abre um POPOVER em portal (position:fixed,
 * ancorado ao gatilho) com busca + templates por categoria + opções agrupadas.
 * O popover flutua acima de tudo → não clipa em containers com overflow, e o
 * campo ocupa 1 linha quando fechado. Fecha em Esc / clique fora (FloatingPopover);
 * rolar a lista NÃO fecha (o scroll interno reposiciona, nunca dá close).
 *
 * Regras: cantos retos (0px), lucide neutro, sem emoji, sem diálogo nativo,
 * i18n via useT. data-testid={`buscar-campo-${name}`}.
 */
import * as React from 'react';
import { X, Check, Search, ChevronDown } from 'lucide-react';
import { useSiteCatalog, type SiteCatalogSite } from '@/lib/buscar/use-site-catalog';
import { useT } from '@/lib/i18n/provider';
import { FloatingPopover } from '@/components/ui/floating-popover';

type Props = {
  name: string;
  label: string;
  /** Nome do catálogo (ui_fields[propKey].catalog): 'maigret'|'wmn'|'sherlock'… */
  catalog: string;
  /** Valor CANÔNICO atual: CSV de ids. */
  value: string;
  /** Emite o CSV dos ids selecionados. */
  onChange: (csv: string) => void;
  includeNsfw?: boolean;
  labelKey?: string;
  disabled?: boolean;
};

const splitCsv = (csv: string): string[] =>
  (csv || '').split(',').map((s) => s.trim()).filter(Boolean);

export function MultiselectField({
  name,
  label,
  catalog,
  value,
  onChange,
  includeNsfw,
  labelKey,
  disabled,
}: Props) {
  const t = useT();
  const testId = `buscar-campo-${name}`;
  const { categories, sites, loading, error } = useSiteCatalog(catalog, { includeNsfw });
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const selected = React.useMemo(() => new Set(splitCsv(value)), [value]);
  const grouped = categories.length > 0;

  const byId = React.useMemo(() => {
    const m = new Map<string, SiteCatalogSite>();
    for (const s of sites) m.set(s.id, s);
    return m;
  }, [sites]);

  const q = query.trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      !q
        ? sites
        : sites.filter(
            (s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
          ),
    [sites, q],
  );

  const byCategory = React.useMemo(() => {
    if (!grouped) return [] as { cat: { key: string; label: string }; items: SiteCatalogSite[] }[];
    const map = new Map<string, SiteCatalogSite[]>();
    for (const s of visible) {
      const k = s.category || '';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return categories
      .map((cat) => ({ cat, items: map.get(cat.key) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [grouped, visible, categories]);

  const emit = (next: Set<string>) => onChange(Array.from(next).join(','));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    emit(next);
  };
  const selectAll = () => emit(new Set(sites.map((s) => s.id)));
  const clearAll = () => onChange('');
  const selectCategory = (catKey: string) => {
    const next = new Set(selected);
    for (const s of sites) if ((s.category || '') === catKey) next.add(s.id);
    emit(next);
  };

  const headerLabel = labelKey ? t(labelKey) : label;
  const allSelected = sites.length > 0 && selected.size === sites.length;

  // Resumo compacto no gatilho.
  const summary =
    selected.size === 0
      ? t('buscar.multiselect.placeholder') // vazio = a fonte usa o default dela
      : allSelected
        ? t('buscar.multiselect.todosSel')
        : t('buscar.multiselect.selecionados').replace('{n}', String(selected.size));

  return (
    <div className="flex flex-col gap-1" data-testid={`${testId}-wrap`}>
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
        {headerLabel}
      </span>

      {/* GATILHO compacto (1 linha) */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
        aria-expanded={open}
        className="flex h-9 items-center justify-between gap-2 border border-border-light bg-canvas-light px-2 text-left text-[12px] outline-none hover:border-primary focus:border-primary disabled:opacity-60"
      >
        <span className={selected.size === 0 ? 'text-muted-on-light' : 'text-text-on-light'}>
          {loading ? t('buscar.multiselect.carregando') : summary}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-muted-on-light transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>

      {/* chips dos selecionados (só quando há seleção parcial) */}
      {selected.size > 0 && !allSelected && (
        <div className="flex flex-wrap items-center gap-1" data-testid={`${testId}-chips`}>
          {Array.from(selected).slice(0, 12).map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px]"
            >
              {byId.get(id)?.label ?? id}
              <button
                type="button"
                aria-label={t('buscar.multiselect.remover')}
                disabled={disabled}
                onClick={() => toggle(id)}
                className="inline-flex"
              >
                <X className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
              </button>
            </span>
          ))}
          {selected.size > 12 && (
            <span className="text-[10px] text-muted-on-light">
              {t('buscar.multiselect.maisN').replace('{n}', String(selected.size - 12))}
            </span>
          )}
        </div>
      )}

      {/* POPOVER — primitivo FloatingPopover (portal/fixed, escapa overflow,
          rola SEM fechar). text-text-on-light é garantido pelo primitivo, que
          fixa a superfície analítica clara mesmo portado p/ fora dela. */}
      <FloatingPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom"
        align="start"
        offset={4}
        matchTriggerWidth
        minWidth={240}
        maxHeight="min(60vh, 360px)"
        zIndex={50}
        testId={`${testId}-pop`}
        ariaLabel={headerLabel}
        bodyTestId={`${testId}-options`}
        header={
          <>
            {/* busca */}
            <span className="flex shrink-0 items-center gap-1 border-b border-border-light px-2 h-9">
              <Search className="w-3.5 h-3.5 shrink-0 text-muted-on-light" strokeWidth={1.5} />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('buscar.multiselect.buscar')}
                data-testid={`${testId}-input`}
                disabled={disabled}
                className="flex-1 bg-transparent text-[12px] outline-none"
              />
            </span>

            {/* templates: Todos / Limpar / 1 por category */}
            {sites.length > 0 && (
              <div
                className="flex shrink-0 flex-wrap gap-1 border-b border-border-light p-1.5"
                data-testid={`${testId}-templates`}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={selectAll}
                  className="border border-border-light px-1.5 py-0.5 text-[10px] hover:border-primary"
                >
                  {t('buscar.multiselect.todos')}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={clearAll}
                  className="border border-border-light px-1.5 py-0.5 text-[10px] hover:border-primary"
                >
                  {t('buscar.multiselect.limpar')}
                </button>
                {grouped &&
                  categories.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectCategory(cat.key)}
                      className="border border-border-light px-1.5 py-0.5 text-[10px] hover:border-primary"
                    >
                      {cat.label}
                    </button>
                  ))}
              </div>
            )}
          </>
        }
      >
        {/* lista de opções (rola dentro do popover, SEM fechar) */}
        {loading ? (
          <p className="px-2 py-2 text-[10px] italic text-muted-on-light">
            {t('buscar.multiselect.carregando')}
          </p>
        ) : error ? (
          <p className="px-2 py-2 text-[10px] text-danger" data-testid={`${testId}-erro`}>
            {t('buscar.multiselect.erro')}
          </p>
        ) : visible.length === 0 ? (
          <p className="px-2 py-2 text-[10px] italic text-muted-on-light">
            {t('buscar.multiselect.vazio')}
          </p>
        ) : grouped ? (
          byCategory.map((g) => (
            <div key={g.cat.key}>
              <p className="sticky top-0 bg-canvas-light px-2 py-1 text-[9px] uppercase tracking-wider text-muted-on-light">
                {g.cat.label}
              </p>
              {g.items.map((s) => (
                <Option
                  key={s.id}
                  site={s}
                  checked={selected.has(s.id)}
                  disabled={disabled}
                  onToggle={() => toggle(s.id)}
                  testId={testId}
                />
              ))}
            </div>
          ))
        ) : (
          visible.map((s) => (
            <Option
              key={s.id}
              site={s}
              checked={selected.has(s.id)}
              disabled={disabled}
              onToggle={() => toggle(s.id)}
              testId={testId}
            />
          ))
        )}
      </FloatingPopover>
    </div>
  );
}

function Option({
  site,
  checked,
  disabled,
  onToggle,
  testId,
}: {
  site: SiteCatalogSite;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      disabled={disabled}
      onClick={onToggle}
      data-testid={`${testId}-opt-${site.id}`}
      className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-primary/5 disabled:opacity-60"
    >
      <span
        aria-hidden
        className={[
          'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border',
          checked ? 'bg-primary border-primary' : 'border-border-light',
        ].join(' ')}
      >
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={2} />}
      </span>
      <span className="truncate">{site.label}</span>
    </button>
  );
}
