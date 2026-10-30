'use client';

/**
 * SelectField — escolha ÚNICA dirigida por DADO (P1 FUNDAÇÃO, kind 'select').
 * Campo de seleção única de fonte (ex.: sort/tipo/cargo/ordem/sigla/region/dataset)
 * que o upstream honra. Valor CANÔNICO: o value ÚNICO escolhido — vira
 * `p_<tool>__<prop>=<value>` na URL do SSE.
 *
 * Duas origens de opções (data-driven, zero hardcode por fonte):
 *  - ENUM inline (`options=[{value,label}]`) declarado no schema do adapter; OU
 *  - CATÁLOGO dinâmico (`catalog`) — reusa useSiteCatalog (lista ACHATADA, sem
 *    grupos obrigatórios: cada site vira uma opção {value:id,label}).
 *
 * UX (ELO popovers): NÃO usa mais `<select>` NATIVO. O popup do select nativo é
 * desenhado pelo browser/SO — no Windows herda o material Fluent/acrylic
 * translúcido (o "backblur branco" que o operador reportou) e foge totalmente ao
 * nosso design-system. Agora é GATILHO + `FloatingPopover` (portal/fixed, sólido
 * `bg-canvas-light`, sombra DS, escapa overflow), idêntico ao MultiselectField —
 * 100% sob nosso controle, sem glassmorphism. Busca aparece quando há muitas
 * opções (catálogo). A opção "vazio" limpa a seleção.
 *
 * Regras duras: cantos retos (0px), sem rounded-*, lucide neutro/sem cor, sem
 * emoji, i18n via useT. data-testid={`buscar-campo-${name}`} no gatilho (e2e).
 */
import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useSiteCatalog } from '@/lib/buscar/use-site-catalog';
import { useT } from '@/lib/i18n/provider';
import { FloatingPopover } from '@/components/ui/floating-popover';

/** Opção de um ENUM inline (escolha única). */
export type SelectOption = { value: string; label: string };

type Props = {
  /** Nome do campo — chave do estado e do data-testid. */
  name: string;
  /** Rótulo — string OU nó rico (ex.: finalidade com hint + tooltip). Omitido → sem rótulo. */
  label?: React.ReactNode;
  /** Valor CANÔNICO atual (o value único). */
  value: string;
  /** Emite o value único escolhido. */
  onChange: (value: string) => void;
  /** ENUM inline (precede o catálogo quando presente). */
  options?: SelectOption[];
  /** Nome do catálogo dinâmico (ui_fields[propKey].catalog) — reusa useSiteCatalog. */
  catalog?: string;
  disabled?: boolean;
  /** z-index do popover. Default 50; DENTRO de um modal use >z do modal (ex.: 70). */
  popoverZIndex?: number;
  /** Texto da opção "vazio" + placeholder do gatilho. Default genérico. */
  emptyLabel?: string;
  /** data-testid do gatilho. Default `buscar-campo-${name}` (compat e2e). */
  testId?: string;
  /** Mostra a opção "vazio" (limpar). Default true; use false p/ pick obrigatório. */
  clearable?: boolean;
};

export function SelectField({
  name,
  label,
  value,
  onChange,
  options,
  catalog,
  disabled,
  popoverZIndex = 50,
  emptyLabel,
  testId: testIdProp,
  clearable = true,
}: Props) {
  const t = useT();
  const testId = testIdProp ?? `buscar-campo-${name}`;
  // Catálogo dinâmico só é buscado quando NÃO há enum inline (catalog vazio → no-op).
  const hasInline = !!(options && options.length);
  const { sites, loading } = useSiteCatalog(hasInline ? undefined : catalog);

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Opções ACHATADAS (sem grupos): enum inline tem precedência; senão o catálogo.
  // Valor legado fora do conjunto atual → preserva visível (não some).
  const opts: SelectOption[] = React.useMemo(() => {
    const base = hasInline
      ? (options as SelectOption[])
      : sites.map((s) => ({ value: s.id, label: s.label }));
    if (value && !base.some((o) => o.value === value)) {
      return [{ value, label: value }, ...base];
    }
    return base;
  }, [hasInline, options, sites, value]);

  const selectedLabel = React.useMemo(
    () => opts.find((o) => o.value === value)?.label ?? '',
    [opts, value],
  );

  const q = query.trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      !q
        ? opts
        : opts.filter(
            (o) =>
              o.label.toLowerCase().includes(q) ||
              o.value.toLowerCase().includes(q),
          ),
    [opts, q],
  );

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const emptyText = emptyLabel ?? t('buscar.campo.select.vazio');
  const placeholder = loading ? t('buscar.multiselect.carregando') : emptyText;

  return (
    <div className="flex flex-col gap-1" data-testid={`${testId}-wrap`}>
      {label != null && label !== '' && (
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {label}
        </span>
      )}

      {/* GATILHO — visual idêntico ao campo antigo (h-9, borda, bg sólido). */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 items-center justify-between gap-2 border border-border-light bg-canvas-light px-2 text-left text-[12px] outline-none hover:border-primary focus:border-primary disabled:opacity-60"
      >
        <span
          className={
            selectedLabel
              ? 'truncate text-text-on-light'
              : 'truncate text-muted-on-light'
          }
        >
          {selectedLabel || placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-muted-on-light transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>

      {/* POPOVER sólido (portal/fixed) — substitui o popup nativo do <select>. */}
      <FloatingPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom"
        align="start"
        offset={4}
        matchTriggerWidth
        minWidth={200}
        maxHeight="min(60vh, 320px)"
        zIndex={popoverZIndex}
        role="listbox"
        ariaLabel={typeof label === 'string' ? label : name}
        testId={`${testId}-pop`}
        bodyTestId={`${testId}-options`}
        header={
          <span className="flex h-9 shrink-0 items-center gap-1 border-b border-border-light px-2">
            <Search
              className="w-3.5 h-3.5 shrink-0 text-muted-on-light"
              strokeWidth={1.5}
            />
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
        }
      >
        {/* opção "vazio" — limpa a seleção (equivale ao 1º <option> do nativo).
            Suprimida quando clearable=false (pick obrigatório, ex.: tipo de objeto). */}
        {clearable && (
          <Option
            label={emptyText}
            selected={!value}
            muted
            disabled={disabled}
            onChoose={() => choose('')}
            testId={`${testId}-opt-`}
          />
        )}
        {visible.length === 0 ? (
          <p className="px-2 py-2 text-[10px] italic text-muted-on-light">
            {t('buscar.multiselect.vazio')}
          </p>
        ) : (
          // key inclui índice: alguns catálogos têm value repetido (ex.: a mesma
          // 'relação' apontando p/ tipos-alvo diferentes) — sem o índice o React
          // reclamaria de key duplicada.
          visible.map((o, i) => (
            <Option
              key={`${o.value}-${i}`}
              label={o.label}
              selected={o.value === value}
              disabled={disabled}
              onChoose={() => choose(o.value)}
              testId={`${testId}-opt-${o.value}`}
            />
          ))
        )}
      </FloatingPopover>
    </div>
  );
}

function Option({
  label,
  selected,
  muted,
  disabled,
  onChoose,
  testId,
}: {
  label: string;
  selected: boolean;
  muted?: boolean;
  disabled?: boolean;
  onChoose: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      onClick={onChoose}
      data-testid={testId}
      className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-primary/5 disabled:opacity-60"
    >
      <span
        aria-hidden
        className={[
          'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border',
          selected ? 'border-primary bg-primary' : 'border-border-light',
        ].join(' ')}
      >
        {selected && <Check className="w-3 h-3 text-white" strokeWidth={2} />}
      </span>
      <span className={`truncate ${muted ? 'text-muted-on-light' : ''}`}>
        {label}
      </span>
    </button>
  );
}
