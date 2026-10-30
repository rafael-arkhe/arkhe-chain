'use client';

/**
 * SchemaFieldTree (Fase 3a · overhaul DAG n8n) — árvore de campos SELECIONÁVEL.
 *
 * Renderiza o schema inferido de um "Testar chamada" (`SyncSchemaField[]`) como
 * uma lista de campos selecionáveis — cada linha: checkbox + ícone de tipo
 * (NEUTRO, régua feedback_no_colored_icons) + chave (mono) + tipo + prévia do
 * valor da 1ª amostra (como no n8n). A seleção forma o schema final que o
 * "Gerar dataset" materializa. i18n via useT(); cantos retos.
 */
import * as React from 'react';
import { Type, Hash, Calendar, ToggleLeft, type LucideIcon } from 'lucide-react';

import type { SyncSchemaField } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';

/** tipo do campo → ícone lucide NEUTRO (nunca cor). Exportado p/ teste. */
export function fieldTypeIcon(type: string): LucideIcon {
  if (type === 'number') return Hash;
  if (type === 'date') return Calendar;
  if (type === 'boolean') return ToggleLeft;
  return Type; // text / default
}

function previewValue(row: Record<string, unknown> | undefined, key: string): string {
  const v = row?.[key];
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 28 ? s.slice(0, 28) + '…' : s;
}

export function SchemaFieldTree({
  fields,
  selected,
  onChange,
  sampleRows,
}: {
  fields: SyncSchemaField[];
  selected: string[];
  onChange: (keys: string[]) => void;
  sampleRows?: Record<string, unknown>[];
}) {
  const t = useT();
  const sel = React.useMemo(() => new Set(selected), [selected]);
  const allOn = fields.length > 0 && fields.every((f) => sel.has(f.key));

  // Toggle preserva a ORDEM do schema (não a ordem de clique) — o dataset gerado
  // sai com as colunas na ordem do response.
  const toggle = (key: string) => {
    const next = new Set(sel);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(fields.filter((f) => next.has(f.key)).map((f) => f.key));
  };
  const toggleAll = () => onChange(allOn ? [] : fields.map((f) => f.key));

  if (fields.length === 0) {
    return (
      <p data-testid="schema-tree-empty" className="text-[11px] text-muted-on-light px-1 py-2">
        {t('schemaTree.empty')}
      </p>
    );
  }

  return (
    <div data-testid="schema-tree" className="border border-border-light bg-white">
      <button
        type="button"
        onClick={toggleAll}
        data-testid="schema-tree-all"
        className="w-full flex items-center gap-2 px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-on-light border-b border-border-light hover:text-primary"
      >
        <input type="checkbox" readOnly checked={allOn} className="accent-primary pointer-events-none" aria-hidden />
        {t('schemaTree.selectAll')}
        <span className="ml-auto font-mono normal-case">{selected.length}/{fields.length}</span>
      </button>
      <ul className="max-h-[260px] overflow-auto scrollbar-hide">
        {fields.map((f) => {
          const Icon = fieldTypeIcon(f.type);
          const on = sel.has(f.key);
          const pv = previewValue(sampleRows?.[0], f.key);
          return (
            <li key={f.key}>
              <button
                type="button"
                onClick={() => toggle(f.key)}
                data-testid={`schema-field-${f.key}`}
                aria-pressed={on}
                className={'w-full flex items-center gap-2 px-2 py-1 text-[11px] text-left hover:bg-panel-light ' + (on ? 'bg-primary/5' : '')}
              >
                <input type="checkbox" readOnly checked={on} className="accent-primary pointer-events-none" aria-hidden />
                <Icon className="w-3 h-3 shrink-0 text-muted-on-light" strokeWidth={1.75} aria-hidden />
                <span className="font-mono text-text-on-light truncate">{f.key}</span>
                <span className="text-[9px] text-muted-on-light shrink-0">{t(`schemaTree.type.${f.type}`)}</span>
                {pv && (
                  <span className="ml-auto font-mono text-[9px] text-muted-on-light truncate max-w-[40%]" title={pv}>
                    {pv}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
