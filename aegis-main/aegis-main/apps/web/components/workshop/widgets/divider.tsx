'use client';

/**
 * Separador — T3-F (2026-06-29). Bloco-base de editor de documento: linha
 * divisória entre seções, com rótulo opcional centralizado. Presentational.
 */
import * as React from 'react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = { label?: string };

function Divider({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  if (cfg.label) {
    return (
      <div className="flex items-center gap-3 my-1" data-testid="divider-widget">
        <span className="h-px flex-1 bg-border-light" />
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-mono whitespace-nowrap">
          {cfg.label}
        </span>
        <span className="h-px flex-1 bg-border-light" />
      </div>
    );
  }
  return <div className="h-px bg-border-light my-2" data-testid="divider-widget" />;
}

registerWidget('divider', Divider, {
  group: 'content',
  label: 'Separador',
  description: 'Linha divisória entre seções, com rótulo opcional.',
  icon: 'minus',
  defaultColSpan: 12,
  mockConfig: { label: 'Anexos' } satisfies Cfg,
  config_schema: [
    {
      name: 'label',
      label: 'Rótulo (opcional)',
      field: 'string',
      placeholder: 'ex.: Anexos',
      description: 'Texto centralizado na linha. Vazio = linha simples.',
    },
  ],
});

export { Divider };
