'use client';

/**
 * Loop Layout — Sprint 3 do parity roadmap.
 *
 * Itera sobre uma variable do tipo array (ObjectSet ou Array<obj>) e
 * renderiza um sub-layout PRA CADA ITEM, escopando o item como
 * `variables[alias]` (default `item`).
 *
 * Útil pra:
 *   - "Render `security.ficha.mandato` pra cada parlamentar"
 *   - "Render card de detalhe pra cada alerta selecionado"
 *
 * Config:
 *   - `source`: variable-ref (array de objetos)
 *   - `alias`: nome da variable injetada dentro da iteração (default `item`)
 *   - `template`: WorkshopAppLayout — sub-árvore de widgets renderizada
 *     por item
 *   - `gap`: spacing entre items (default '0.75rem')
 *   - `max_items`: limite duro de iterações (default 50)
 *
 * Limitação Sprint 3: eventos disparados de dentro do loop não têm
 * acesso ao escopo `item` (compartilham `bindings` da app pai). Pra
 * resolver, evento `set_variable` precisa receber `from: 'item.foo'`
 * — backlog Sprint 4.
 */
import * as React from 'react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import type { WorkshopAppLayout } from '@/lib/workshop/types';
import { getWidgetComponent, getWidgetMeta } from '../WorkshopV2Renderer';

type Cfg = {
  source?: string;
  alias?: string;
  template?: WorkshopAppLayout;
  gap?: string;
  max_items?: number;
};

function LoopLayout({
  config,
  variables,
  bindings,
  setBinding,
  emit,
  appId,
}: WidgetRenderProps) {
  const cfg = config as Cfg;
  const alias = cfg.alias || 'item';
  const max = cfg.max_items ?? 50;
  const gap = cfg.gap ?? '0.75rem';
  const tpl = cfg.template;

  const raw = cfg.source ? variables[cfg.source] : undefined;
  // Aceita array direto OU ObjectSet (que tem `.rows`)
  let items: unknown[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)) {
    items = (raw as { rows: unknown[] }).rows;
  }
  items = items.slice(0, max);

  if (!cfg.source) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Configure `source` (variable do tipo array/ObjectSet) no Inspetor.
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Nenhum item em <code className="text-primary">{cfg.source}</code> pra iterar.
      </div>
    );
  }
  if (!tpl || !Array.isArray(tpl.root)) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Configure `template` (sub-layout) no Inspetor.
      </div>
    );
  }

  const cols = tpl.columns ?? 1;

  return (
    <div className="flex flex-col" style={{ gap }} data-testid="loop-layout">
      {items.map((item, idx) => {
        const scopedVars = {
          ...variables,
          [alias]: item,
          [`${alias}_index`]: idx,
        };
        return (
          <div
            key={idx}
            data-testid={`loop-item-${idx}`}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: '0.75rem',
            }}
          >
            {tpl.root.map((node) => {
              const entry = getWidgetComponent(node.widget.type);
              if (!entry) {
                return (
                  <div
                    key={node.id}
                    className="border border-dashed border-warning bg-warning/5 p-2 text-[10px] font-mono text-warning"
                  >
                    Widget desconhecido: {node.widget.type}
                  </div>
                );
              }
              const Component = entry;
              const meta = getWidgetMeta(node.widget.type);
              const style: React.CSSProperties = {};
              if (node.layout?.col_span)
                style.gridColumn = `span ${node.layout.col_span}`;
              if (node.layout?.min_height)
                style.minHeight = node.layout.min_height;
              return (
                <div key={node.id} style={style}>
                  <Component
                    appId={appId}
                    config={
                      {
                        ...(meta?.mockConfig ?? {}),
                        ...((node.widget.props as Record<string, unknown>) ?? {}),
                      } as Record<string, unknown>
                    }
                    variables={scopedVars}
                    bindings={bindings}
                    setBinding={setBinding}
                    emit={emit}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const MOCK_LIST = [
  { nome: 'Ana Carolina Mendes', partido: 'PT', uf: 'BA' },
  { nome: 'Carlos Almeida', partido: 'PSDB', uf: 'SP' },
  { nome: 'Beatriz Souza', partido: 'PSOL', uf: 'RJ' },
];

registerWidget('loop_layout', LoopLayout, {
  group: 'content',
  label: 'Loop (repete por item)',
  description:
    'Renderiza um sub-layout pra cada item de uma lista — útil pra fichas, cards ou mini-painéis repetidos.',
  icon: 'list-restart',
  defaultColSpan: 20,
  mockConfig: {
    source: 'items',
    alias: 'item',
    template: {
      columns: 1,
      root: [
        {
          id: 'tpl_md',
          widget: {
            type: 'markdown_v2',
            props: {
              content: '**${item.nome}** · ${item.partido} · ${item.uf}',
            },
          },
        },
      ],
    },
    gap: '0.5rem',
  },
  mockVariables: { items: MOCK_LIST },
  previewWidth: 360,
  previewHeight: 220,
  config_schema: [
    {
      name: 'source',
      label: 'Lista a iterar',
      description:
        'ID do dado que retorna a lista (resultado de busca ou lista de objetos).',
      field: 'variable-ref',
    },
    {
      name: 'alias',
      label: 'Nome do item',
      description: 'Como cada item será referenciado dentro do bloco. Padrão: `item`.',
      field: 'string',
      placeholder: 'item',
    },
    {
      name: 'max_items',
      label: 'Limite de itens',
      description: 'Quantidade máxima de itens exibidos. Padrão: 50.',
      field: 'number',
      min: 1,
      max: 500,
      step: 1,
      default: 50,
    },
    {
      name: 'gap',
      label: 'Espaçamento entre itens',
      description: 'Espaço entre cada repetição (padrão: 0.75rem).',
      field: 'string',
      placeholder: '0.75rem',
    },
    {
      name: 'template',
      label: 'Modelo (formato JSON)',
      description:
        'Sub-painel repetido por item. Use ${item.campo} nos textos pra mostrar valores do item atual.',
      field: 'string',
      placeholder: '{"columns":1,"root":[{"id":"x","widget":{"type":"markdown_v2","props":{"content":"${item.nome}"}}}]}',
    },
  ],
});
