'use client';

import * as React from 'react';
import { useMemo } from 'react';
import { useObjectSet } from '@/lib/workshop/runtime';
import { Functions } from '@/lib/api';
import { cn } from '@/lib/cn';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { formatDataBR, formatHoraBR } from '@/lib/datetime';
// Sprint D3: formatação condicional. Lógica de avaliação vive em
// lib/workshop/format-rules.ts (fonte única, compartilhada com metric_card e
// security.kpi_card) — aqui só mapeamos cor→classe e escopamos por coluna.
import {
  type FormatColor,
  type FormatRule,
  matchFormatRule,
  parseFormatRules,
} from '@/lib/workshop/format-rules';

/* Onda 1.B (GAP 1) — coluna FUNCTION-BACKED: o valor é computado por uma
 * CodeFunction (sandbox) em vez de vir da property. Invoca UMA vez com todas as
 * linhas (1 sandbox/render, não N): a Function recebe {rows:[...]} e imprime
 * {results:{<rowId>: valor}}. `field` (opcional) indexa o objeto de saída por linha. */
type Column = { field: string; label?: string; width?: number; function_slug?: string; type?: string };

/* -------------------------------------------------------------------------- */
/* Sprint D3 (Parity Audit): formatação condicional por célula.               */
/* -------------------------------------------------------------------------- */

/**
 * Map estático (tailwind safelist-safe) cor → classes da célula.
 * Mantemos string completa pra evitar que o JIT do tailwind descarte.
 */
const FORMAT_CELL_CLS: Record<FormatColor, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
};

/* -------------------------------------------------------------------------- */

const DEFAULT_COLUMNS: Column[] = [
  { field: 'name', label: 'Nome' },
  { field: 'node_type', label: 'Tipo' },
];

/**
 * Normaliza `columns` em array. Aceita array (canônico, do builder visual
 * 'object-columns'), string JSON (apps salvos quando o campo ainda era 'string')
 * ou ausente → default. Sem isto, uma string em `cfg.columns` estouraria
 * `.map` no render.
 */
function normalizeColumns(
  raw: unknown,
): Column[] {
  if (Array.isArray(raw)) return raw.length > 0 ? raw : DEFAULT_COLUMNS;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  }
  return DEFAULT_COLUMNS;
}

type Cfg = {
  title?: string;
  /** external_id da variável kind=objectSet. */
  source: string;
  columns?: Column[];
  page_size?: number;
  /** Mensagem vazia em lingua do operador (a seed preenche; default neutro). */
  empty_label?: string;
  /**
   * Sprint D1 (Parity Audit): captura de filtro por coluna.
   * Quando `target_filter` + `filter_field` definidos, mostra input
   * "Filtrar…" abaixo do header da coluna cujo `field === filter_field`.
   * Operador digita → grava predicate AST `{op:'contains', field, value}`
   * em `bindings[target_filter]`. Vazio → null.
   */
  target_filter?: string;
  filter_field?: string;
  /** Sprint D3: regras de formatação condicional (JSON ou array). */
  format_rules?: FormatRule[] | string;
};

export function ObjectTable({ appId, config, bindings, setBinding, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const pageSize = cfg.page_size ?? 25;
  // Paginação REAL no SERVIDOR: offset = página × tamanho; o total vem do backend
  // (COUNT real). Antes a tabela só buscava a 1ª janela (sem offset/controles) e
  // mostrava "25/17052" sem como navegar — o dono pediu "TABELAS PAGINADAS".
  const [page, setPage] = React.useState(0);
  const bindingsKey = JSON.stringify(bindings);
  // Volta à página 0 quando muda a fonte ou o filtro (a página atual pode não
  // existir no novo total).
  React.useEffect(() => { setPage(0); }, [cfg.source, bindingsKey]);
  const query = useMemo(
    () => ({
      variable: cfg.source,
      overrides: bindings,
      limit: pageSize,
      offset: page * pageSize,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.source, pageSize, page, bindingsKey],
  );
  const { status, rows, total, error } = useObjectSet(appId, query);
  const pageCount = Math.max(1, Math.ceil((total || 0) / pageSize));
  const firstRow = total === 0 ? 0 : page * pageSize + 1;
  const lastRow = page * pageSize + rows.length;

  const cols = normalizeColumns(cfg.columns);

  /* Onda 1.B — colunas function-backed: slugs distintos + saída por (slug,rowId). */
  const fnSlugs = useMemo(
    () => Array.from(new Set(cols.map((c) => c.function_slug).filter((s): s is string => !!s))),
    [cols],
  );
  const [fnOutputs, setFnOutputs] = React.useState<Record<string, Record<string, unknown>>>({});
  const [fnLoading, setFnLoading] = React.useState(false);

  React.useEffect(() => {
    if (fnSlugs.length === 0 || rows.length === 0) {
      setFnOutputs({});
      return;
    }
    let cancelled = false;
    setFnLoading(true);
    // Payload mínimo por linha (id + name + node_type + properties) — 1 invoke/slug.
    const payloadRows = rows.map((r) => ({
      id: r.id, name: r.name, node_type: r.node_type, properties: r.properties,
    }));
    Promise.all(
      fnSlugs.map((slug) =>
        Functions.invoke(slug, { rows: payloadRows })
          .then((res) => {
            const out = res.ok && res.output && typeof res.output === 'object'
              ? ((res.output as Record<string, unknown>).results as Record<string, unknown> | undefined)
              : undefined;
            return [slug, out ?? {}] as const;
          })
          .catch(() => [slug, {}] as const),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setFnOutputs(Object.fromEntries(pairs));
      setFnLoading(false);
    });
    return () => { cancelled = true; };
  }, [fnSlugs, rows]);

  /* Sprint D3: parse rules uma vez por config-change. */
  const rules = useMemo(() => parseFormatRules(cfg.format_rules), [cfg.format_rules]);

  /* Sprint D1: estado do input "Filtrar…" sincronizado com binding. */
  const filterEnabled = !!(cfg.target_filter && cfg.filter_field);
  const currentFilterValue = React.useMemo(() => {
    if (!filterEnabled) return '';
    const raw = bindings[cfg.target_filter!];
    if (
      raw &&
      typeof raw === 'object' &&
      'value' in (raw as Record<string, unknown>) &&
      typeof (raw as { value: unknown }).value === 'string'
    ) {
      return (raw as { value: string }).value;
    }
    return '';
  }, [filterEnabled, cfg.target_filter, bindings]);
  const [filterText, setFilterText] = React.useState(currentFilterValue);
  const filterTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setFilterText(currentFilterValue);
  }, [currentFilterValue]);

  const onFilterChange = (next: string) => {
    setFilterText(next);
    if (!filterEnabled) return;
    if (filterTimer.current) clearTimeout(filterTimer.current);
    filterTimer.current = setTimeout(() => {
      const trimmed = next.trim();
      const predicate = trimmed
        ? { op: 'contains' as const, field: cfg.filter_field!, value: trimmed }
        : null;
      setBinding(cfg.target_filter!, predicate);
      emit?.('value_change', { value: predicate, target: cfg.target_filter });
    }, 250);
  };

  return (
    <div className="bg-white border border-border-light flex flex-col">
      <div className="h-8 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light/40">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold flex-1">
          {cfg.title ?? cfg.source}
        </p>
        <span className="text-[10px] font-mono text-muted-on-light">
          {status === 'loading' ? 'carregando…' : `${firstRow}–${lastRow} de ${total}`}
        </span>
      </div>
      {error && (
        <p className="px-3 py-2 text-[11px] text-danger">{error}</p>
      )}
      {!error && rows.length === 0 && status === 'ready' && (
        <p className="px-3 py-3 text-[11px] text-muted-on-light italic">
          {/* Mesma lingua do operador: o rotulo `empty_label` da configuracao
              (a seed preenche) ou uma frase neutra -- nunca o nome interno da
              variavel, que e' endereco de programador. */}
          {typeof cfg.empty_label === 'string' && cfg.empty_label.trim()
            ? cfg.empty_label
            : 'Nenhum registro no per\u00edodo.'}
        </p>
      )}
      {rows.length > 0 && (
        <table className="w-full text-[11px] table-fixed">
          <thead>
            <tr className="border-b border-border-light bg-raised-light/30">
              {cols.map((c) => (
                <th
                  key={c.field}
                  className="text-left px-3 h-7 text-[10px] uppercase tracking-wider text-muted-on-light font-semibold align-top"
                  style={c.width ? { width: c.width } : undefined}
                >
                  <div className="flex flex-col gap-1 py-1">
                    <span>{c.label ?? c.field}</span>
                    {filterEnabled && c.field === cfg.filter_field && (
                      <input
                        type="text"
                        value={filterText}
                        onChange={(e) => onFilterChange(e.target.value)}
                        placeholder="Filtrar…"
                        data-testid={`object-table-filter-${c.field}`}
                        className="w-full h-6 px-1.5 text-[11px] normal-case tracking-normal font-normal bg-canvas-light border border-border-light outline-none focus:border-primary text-text-on-light"
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() =>
                  emit?.('select_change', {
                    selected: r,
                    selected_id: r.id,
                  })
                }
                data-testid={`object-table-row-${r.id}`}
                className="border-b border-border-light/60 hover:bg-raised-light/40 cursor-pointer"
              >
                {cols.map((c) => {
                  let v: unknown;
                  if (c.function_slug) {
                    // Valor computado pela CodeFunction: results[rowId] (objeto →
                    // indexa por c.field se houver). "…" enquanto computa.
                    const cell = fnOutputs[c.function_slug]?.[r.id];
                    v = c.field && cell && typeof cell === 'object'
                      ? (cell as Record<string, unknown>)[c.field]
                      : cell;
                    if (v === undefined) v = fnLoading ? '…' : null;
                  } else {
                    v =
                      c.field === 'name'
                        ? r.name
                        : c.field === 'node_type'
                          ? r.node_type
                          : r.properties[c.field];
                  }
                  /* Sprint D3: aplica a primeira rule que casa esta coluna. */
                  const matched = matchFormatRule(v, rules, c.field);
                  // Coluna de IMAGEM (`type: 'image'`, ex. frame_url da
                  // contagem): thumbnail clicável com a evidência do evento.
                  // O `frame_url` vem do backend como `/api/v1/cctv/frames/…`
                  // (single) — no proxy do security-app a forma CERTA é
                  // `/api/api/v1/…` (API_BASE='/api' + path), senão o Next
                  // encaminha `v1/…` e o backend responde 404 (imagem preta).
                  const isImage = c.type === 'image' || c.field === 'frame_url';
                  const imgSrc = isImage && v
                    ? (String(v).startsWith('/api/') ? `/api${String(v)}` : String(v))
                    : '';
                  return (
                    <td
                      key={c.field}
                      className={cn(
                        'px-3 h-7 truncate',
                        matched && FORMAT_CELL_CLS[matched.color],
                      )}
                    >
                      {isImage ? (
                        imgSrc ? (
                          <a href={imgSrc} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imgSrc}
                              alt={c.label || c.field}
                              className="h-9 w-16 object-cover border border-border-light bg-black/40"
                              loading="lazy"
                            />
                          </a>
                        ) : (
                          '—'
                        )
                      ) : c.type === 'datetime' && typeof v === 'string' && v ? (
                        // Datas em linguagem do operador (pt-BR curto) — o ISO
                        // cru era ilegível na operação (queixa 11/09/2026).
                        (() => {
                          const d = new Date(v);
                          if (Number.isNaN(d.getTime())) return String(v);
                          return `${formatDataBR(d)} ${formatHoraBR(d)}`;
                        })()
                      ) : c.type === 'number' && typeof v === 'number' ? (
                        // Números tabulares alinhados à direita (operação lê
                        // coluna de números comparando verticalmente).
                        <span className="tabular-nums">{v.toLocaleString('pt-BR')}</span>
                      ) : v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {total > pageSize && (
        <div className="h-8 px-3 border-t border-border-light flex items-center justify-between gap-2 bg-raised-light/40">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            data-testid="object-table-prev"
            className="text-[10px] uppercase tracking-[0.14em] px-2 h-6 border border-border-light disabled:opacity-40 enabled:hover:bg-raised-light"
          >
            Anterior
          </button>
          <span className="text-[10px] font-mono text-muted-on-light">
            Página {page + 1} de {pageCount}
          </span>
          <button
            type="button"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            data-testid="object-table-next"
            className="text-[10px] uppercase tracking-[0.14em] px-2 h-6 border border-border-light disabled:opacity-40 enabled:hover:bg-raised-light"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
const OBJECT_TABLE_SCHEMA = [
  {
    name: 'title',
    label: 'Título',
    description: 'Cabeçalho da tabela (opcional).',
    field: 'string' as const,
  },
  {
    name: 'source',
    label: 'Busca a exibir',
    description: 'ID de uma busca criada nos Dados que devolve a lista de objetos.',
    field: 'variable-ref' as const,
  },
  {
    name: 'page_size',
    label: 'Linhas por página',
    description: 'Quantas linhas exibir antes de paginar. Padrão: 25.',
    field: 'number' as const,
    min: 5,
    max: 200,
    step: 5,
    default: 25,
  },
  {
    name: 'columns',
    label: 'Colunas',
    description:
      'Cada coluna escolhe a propriedade pelo contrato do tipo da busca (+ rótulo e largura opcionais). Vazio mostra Nome + Tipo.',
    field: 'object-columns' as const,
    typeFrom: 'source',
  },
  {
    name: 'target_filter',
    label: 'Filtro de busca (opcional)',
    description:
      'ID de um dado do tipo "Filtro de busca". Quando preenchido junto com "Campo do filtro", aparece um campo "Filtrar…" no header da coluna que outras buscas podem consumir server-side.',
    field: 'variable-ref' as const,
  },
  {
    name: 'filter_field',
    label: 'Propriedade do filtro',
    description:
      'Propriedade da coluna usada no predicate. O input "Filtrar…" só aparece na coluna cujo `field` bate com este valor. Vem do contrato do tipo da busca.',
    field: 'property' as const,
    typeFrom: 'source',
  },
  {
    name: 'format_rules',
    label: 'Regras de cor',
    // Sprint F3 (2026-05-21): builder visual substitui o textarea JSON.
    // O Inspetor genérico renderiza um FormatRulesEditor — operador escolhe
    // op/threshold/color em UI; toggle "Avançado (JSON)" mantém o fallback raw.
    description:
      'Cada regra pinta a célula quando o valor da coluna casa. A primeira que casa vence.',
    field: 'format-rules' as const,
  },
];

const OBJECT_TABLE_MOCK_CONFIG = {
  title: 'Resultados',
  source: 'rows',
  columns: [
    { field: 'name', label: 'Nome' },
    { field: 'node_type', label: 'Tipo' },
  ],
};

registerWidget('object_table_v2', ObjectTable, {
  group: 'data',
  label: 'Tabela de objetos',
  description: 'Tabela de uma busca de objetos com colunas configuráveis, paginação e ordenação.',
  icon: 'table',
  defaultColSpan: 10,
  mockConfig: OBJECT_TABLE_MOCK_CONFIG,
  config_schema: OBJECT_TABLE_SCHEMA,
});
registerWidget('object_table', ObjectTable, {
  group: 'data',
  label: 'Tabela (legado)',
  description: 'Versão antiga da tabela de objetos — mantida pra compatibilidade com painéis existentes.',
  icon: 'table',
  mockConfig: OBJECT_TABLE_MOCK_CONFIG,
  config_schema: OBJECT_TABLE_SCHEMA,
  hidden: true,
});
