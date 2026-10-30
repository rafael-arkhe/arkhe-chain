'use client';

/**
 * Object List — Sprint 5 do parity roadmap.
 *
 * Lista simples de objetos (versão "lite" da `object_table` — sem
 * paginação/colunas configuráveis). Cada item mostra `primary_field`
 * + `secondary_field` opcional. Click emite `select_change`.
 *
 * Lê de uma variable que produz array (ObjectSet.rows ou array direto).
 */
import * as React from 'react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { cn } from '@/lib/cn';

type Cfg = {
  source?: string;
  title?: string;
  primary_field?: string;
  secondary_field?: string;
  empty_label?: string;
};

function pickRows(variables: Record<string, unknown>, source: string | undefined): unknown[] {
  if (!source) return [];
  const raw = variables[source];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)) {
    return (raw as { rows: unknown[] }).rows;
  }
  return [];
}

function getField(obj: unknown, field: string | undefined): string {
  if (!field || !obj || typeof obj !== 'object') return '';
  const rec = obj as Record<string, unknown>;
  // A instância canônica (objectSet) carrega os dados em `properties` — sem este
  // fallback, primary/secondary só achavam name/id (top-level) e NUNCA uma
  // propriedade real (bio, categoria, a inferência da IA…).
  let v = rec[field];
  if (v == null && rec.properties && typeof rec.properties === 'object') {
    v = (rec.properties as Record<string, unknown>)[field];
  }
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function ObjectList({ config, variables, bindings, setBinding, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const rows = pickRows(variables, cfg.source);
  const primary = cfg.primary_field ?? 'name';
  const secondary = cfg.secondary_field;

  // Selection via binding `selected_id`
  const selectedId =
    typeof bindings.selected_id === 'string' ? bindings.selected_id : null;

  const onClick = (item: unknown, idx: number) => {
    const obj = (item ?? {}) as Record<string, unknown>;
    const id =
      typeof obj.id === 'string'
        ? obj.id
        : typeof obj[primary] === 'string'
          ? (obj[primary] as string)
          : String(idx);
    setBinding('selected_id', id);
    emit?.('select_change', { selected: item, selected_id: id });
  };

  if (!cfg.source) {
    return (
      <div className="bg-white border border-border-light p-2 text-[11px] text-muted-on-light italic">
        Configure `source` (variable array) no Inspetor.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-border-light">
        {cfg.title && (
          <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono">
              {cfg.title}
            </p>
          </header>
        )}
        <p className="px-3 py-4 text-[11px] text-muted-on-light italic text-center">
          {cfg.empty_label ?? 'Sem itens.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-light flex flex-col" data-testid="object-list">
      {cfg.title && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1">
            {cfg.title}
          </p>
          <span className="text-[10px] font-mono text-muted-on-light">
            {rows.length}
          </span>
        </header>
      )}
      <ul className="divide-y divide-border-light/60">
        {rows.map((r, i) => {
          const obj = (r ?? {}) as Record<string, unknown>;
          const id =
            typeof obj.id === 'string'
              ? obj.id
              : typeof obj[primary] === 'string'
                ? (obj[primary] as string)
                : String(i);
          const isActive = selectedId === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onClick(r, i)}
                data-testid={`object-list-item-${id}`}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 hover:bg-raised-light/40 transition-colors',
                  isActive && 'bg-primary/5 border-l-2 border-l-primary',
                )}
              >
                <p className="text-[11px] font-medium text-text-on-light truncate">
                  {getField(r, primary) || '—'}
                </p>
                {secondary && (
                  <p className="text-[10px] text-muted-on-light truncate">
                    {getField(r, secondary)}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const MOCK_LIST = [
  { id: 'p1', nome: 'Ana Carolina Mendes', partido: 'PT · BA' },
  { id: 'p2', nome: 'Carlos Almeida', partido: 'PSDB · SP' },
  { id: 'p3', nome: 'Beatriz Souza', partido: 'PSOL · RJ' },
  { id: 'p4', nome: 'Diego Pereira', partido: 'NOVO · MG' },
];

registerWidget('object_list', ObjectList, {
  group: 'data',
  label: 'Lista de itens',
  description:
    'Lista enxuta com título e subtítulo por item. Ao clicar, marca o item como selecionado. Para várias colunas, use Tabela.',
  icon: 'list',
  defaultColSpan: 5,
  mockConfig: {
    title: 'Parlamentares',
    source: 'items',
    primary_field: 'nome',
    secondary_field: 'partido',
  },
  mockVariables: { items: MOCK_LIST },
  previewWidth: 320,
  previewHeight: 240,
  config_schema: [
    { name: 'title', label: 'Título', field: 'string', placeholder: 'Parlamentares' },
    { name: 'source', label: 'Lista a exibir', field: 'variable-ref' },
    {
      name: 'primary_field',
      label: 'Propriedade principal',
      description: 'Propriedade exibida em destaque (default: nome). Vem do contrato do tipo da lista.',
      field: 'property',
      typeFrom: 'source',
    },
    {
      name: 'secondary_field',
      label: 'Propriedade secundária',
      description: 'Propriedade exibida na segunda linha (opcional).',
      field: 'property',
      typeFrom: 'source',
    },
    { name: 'empty_label', label: 'Mensagem quando vazio', field: 'string', placeholder: 'Sem itens.' },
  ],
});
