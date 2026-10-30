'use client';

/**
 * Citação — T3-F (2026-06-29). Bloco-base de editor de documento: bloco de
 * citação com texto e fonte/atribuição. Presentational. Sem side-stripe banido
 * (usa ícone + moldura reta).
 */
import * as React from 'react';
import { Quote as QuoteIcon } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = { text?: string; cite?: string };

function Quote({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  return (
    <figure
      className="border border-border-light bg-canvas-light p-4 text-text-on-light"
      data-testid="quote-widget"
    >
      <QuoteIcon className="w-4 h-4 text-muted-on-light mb-1.5" strokeWidth={1.5} />
      <blockquote className="text-[13px] italic leading-relaxed whitespace-pre-wrap">
        {cfg.text || '—'}
      </blockquote>
      {cfg.cite && (
        <figcaption className="text-[11px] text-muted-on-light mt-2 font-mono">
          — {cfg.cite}
        </figcaption>
      )}
    </figure>
  );
}

registerWidget('quote', Quote, {
  group: 'content',
  label: 'Citação',
  description: 'Bloco de citação com texto e fonte/atribuição.',
  icon: 'quote',
  defaultColSpan: 12,
  mockConfig: { text: 'Clareza para decisões complexas.', cite: 'Doutrina operacional' } satisfies Cfg,
  config_schema: [
    { name: 'text', label: 'Texto', field: 'textarea', placeholder: 'Texto da citação' },
    { name: 'cite', label: 'Fonte', field: 'string', placeholder: 'ex.: Relatório X, 2026' },
  ],
});

export { Quote };
