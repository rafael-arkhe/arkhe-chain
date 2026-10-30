'use client';

/**
 * ColumnSelect / ColumnMultiSelect — SF2 (Onda 1 · Clareza nº1).
 *
 * Mata o "texto livre de coluna" no inspetor de transform: o operador ESCOLHE a
 * coluna numa lista vinda do schema do nó a montante (TransformPreviewResult /
 * payload_keys), nunca a digita (memory feedback_no_manual_technical_input).
 *
 * Degradação honesta: quando o schema não pôde ser inferido (cadeia sem Fonte,
 * preview falhou), cai num <input> de texto com dica — melhor um gesto possível
 * do que um dropdown vazio quebrado. O valor atual fora do schema é preservado
 * como opção extra (não perde config antiga).
 *
 * Estética: cantos retos (0px), JetBrains Mono pra dados, #2D77BE único acento.
 */
import * as React from 'react';
import { useT } from '@/lib/i18n/provider';

const SEL =
  'w-full h-7 px-2 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary';

export const COLUMN_KEY_DRAG_MIME = 'application/x-aegis-column-key';

function readDroppedColumn(e: React.DragEvent): string {
  return (
    e.dataTransfer.getData(COLUMN_KEY_DRAG_MIME) ||
    e.dataTransfer.getData('text/plain') ||
    ''
  ).replace(/^\{\{\s*\$json\./, '').replace(/\s*\}\}$/, '').trim();
}

function allowColumnDrop(e: React.DragEvent) {
  if (!e.dataTransfer.types.includes(COLUMN_KEY_DRAG_MIME) && !e.dataTransfer.types.includes('text/plain')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

export interface ColumnSelectProps {
  value: string;
  onChange: (v: string) => void;
  cols: string[];
  loading?: boolean;
  testid: string;
  /** Rótulo da opção vazia (— coluna —). */
  placeholder?: string;
}

/** Dropdown de coluna única dirigido pelo schema do nó a montante. */
export function ColumnSelect({
  value,
  onChange,
  cols,
  loading,
  testid,
  placeholder,
}: ColumnSelectProps) {
  const t = useT();
  if (loading) {
    return (
      <select disabled className={SEL} data-testid={testid} aria-busy="true">
        <option>{t('pbw.columnLoading')}</option>
      </select>
    );
  }
  if (cols.length === 0) {
    // Schema indisponível → fallback texto (mantém o gesto possível, com dica).
    return (
      <input
        type="text"
        className={SEL}
        data-testid={testid}
        data-drop-target="true"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onDragOver={allowColumnDrop}
        onDrop={(e) => {
          const col = readDroppedColumn(e);
          if (!col) return;
          e.preventDefault();
          onChange(col);
        }}
        title={t('pbw.columnUnavailableTip')}
        placeholder={t('pbw.columnPlaceholder')}
      />
    );
  }
  const known = value === '' || cols.includes(value);
  return (
    <select
      className={SEL}
      data-testid={testid}
      data-drop-target="true"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onDragOver={allowColumnDrop}
      onDrop={(e) => {
        const col = readDroppedColumn(e);
        if (!col) return;
        e.preventDefault();
        onChange(col);
      }}
    >
      <option value="">{placeholder ?? t('pbw.columnPlaceholderOption')}</option>
      {cols.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      {!known && (
        <option value={value}>{value} (fora do schema)</option>
      )}
    </select>
  );
}

export interface SuggestInputProps {
  value: string;
  onChange: (v: string) => void;
  /** Sugestões reais (colunas, valores, branches, tipos…). Não restringe o texto. */
  suggestions: string[];
  testid: string;
  placeholder?: string;
}

/**
 * A7 — combobox: input com <datalist> de sugestões REAIS do dado (colunas, valores
 * de coluna, branches, tipos). Diferente do ColumnSelect (dropdown ESTRITO): aqui o
 * operador pode escolher uma sugestão OU digitar um NOME NOVO (ex.: campo novo do
 * `set`, kind novo, branch nova) — "nomes-novos ganham sugestão, não select estrito".
 * Aceita drop de coluna (mesmo MIME do ColumnSelect).
 */
export function SuggestInput({ value, onChange, suggestions, testid, placeholder }: SuggestInputProps) {
  const listId = `${testid}-dl`;
  const seen = new Set<string>();
  const opts = suggestions.filter((s) => s && !seen.has(s) && (seen.add(s), true));
  return (
    <>
      <input
        type="text"
        className={SEL}
        data-testid={testid}
        data-drop-target="true"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onDragOver={allowColumnDrop}
        onDrop={(e) => {
          const col = readDroppedColumn(e);
          if (!col) return;
          e.preventDefault();
          onChange(col);
        }}
      />
      <datalist id={listId}>
        {opts.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

export interface ColumnMultiSelectProps {
  values: string[];
  onChange: (v: string[]) => void;
  cols: string[];
  loading?: boolean;
  testid: string;
}

/** Multi-seleção de colunas via chips toggláveis (sem texto livre). */
export function ColumnMultiSelect({
  values,
  onChange,
  cols,
  loading,
  testid,
}: ColumnMultiSelectProps) {
  const t = useT();
  if (loading) {
    return (
      <div className="text-[11px] text-muted-on-light" data-testid={testid} aria-busy="true">
        {t('pbw.columnLoading')}
      </div>
    );
  }
  if (cols.length === 0) {
    // Fallback texto vírgula quando o schema é desconhecido.
    return (
      <input
        type="text"
        className={SEL}
        data-testid={testid}
        data-drop-target="true"
        value={values.join(', ')}
        onChange={(e) =>
          onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
        }
        onDragOver={allowColumnDrop}
        onDrop={(e) => {
          const col = readDroppedColumn(e);
          if (!col) return;
          e.preventDefault();
          onChange(values.includes(col) ? values : [...values, col]);
        }}
        title={t('pbw.columnsUnavailableTip')}
        placeholder={t('pbw.columnsPlaceholder')}
      />
    );
  }
  const toggle = (c: string) =>
    onChange(values.includes(c) ? values.filter((x) => x !== c) : [...values, c]);
  // Valores fora do schema (config antiga) seguem visíveis p/ não perder seleção.
  const extra = values.filter((v) => !cols.includes(v));
  return (
    <div
      className="flex flex-wrap gap-1"
      data-testid={testid}
      data-drop-target="true"
      onDragOver={allowColumnDrop}
      onDrop={(e) => {
        const col = readDroppedColumn(e);
        if (!col) return;
        e.preventDefault();
        onChange(values.includes(col) ? values : [...values, col]);
      }}
    >
      {[...cols, ...extra].map((c) => {
        const on = values.includes(c);
        return (
          <button
            type="button"
            key={c}
            data-testid={`${testid}-opt-${c}`}
            aria-pressed={on}
            onClick={() => toggle(c)}
            className={
              'h-6 px-2 text-[10px] font-mono border ' +
              (on
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border-light bg-white text-muted-on-light hover:border-primary')
            }
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}
