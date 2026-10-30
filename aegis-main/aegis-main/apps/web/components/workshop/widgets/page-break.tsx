'use client';

/**
 * Quebra de página — T3-F2 (2026-06-29). Bloco-base de documento: marca um
 * limite de página. Na tela aparece como marcador discreto; no PDF a classe
 * `break-after-page` (CSS break-after: page) força a quebra. Presentational.
 */
import * as React from 'react';

import { registerWidget } from '../WorkshopV2Renderer';

function PageBreak() {
  return (
    <div
      data-testid="page-break-widget"
      className="break-after-page flex items-center gap-3 my-2 select-none"
      aria-hidden="true"
    >
      <span className="h-px flex-1 border-t border-dashed border-border-light" />
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-on-light font-mono whitespace-nowrap">
        Quebra de página
      </span>
      <span className="h-px flex-1 border-t border-dashed border-border-light" />
    </div>
  );
}

registerWidget('page_break', PageBreak, {
  group: 'content',
  label: 'Quebra de página',
  description: 'Força o início de uma nova página no PDF/impressão.',
  icon: 'scissors',
  defaultColSpan: 12,
  mockConfig: {},
});

export { PageBreak };
