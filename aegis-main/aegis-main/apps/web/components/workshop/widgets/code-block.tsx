'use client';

/**
 * Bloco de código — T3-F2 (2026-06-29). Bloco-base de documento: trecho de
 * código/dado em monoespaçado, com rótulo de linguagem opcional. Presentational.
 */
import * as React from 'react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = { code?: string; language?: string };

function CodeBlock({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  return (
    <div data-testid="code-block-widget" className="border border-border-light bg-canvas-light">
      {cfg.language && (
        <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-on-light border-b border-border-light">
          {cfg.language}
        </div>
      )}
      <pre className="p-3 text-[11px] font-mono leading-relaxed text-text-on-light overflow-x-auto scrollbar-hide whitespace-pre">
        <code>{cfg.code || ''}</code>
      </pre>
    </div>
  );
}

registerWidget('code_block', CodeBlock, {
  group: 'content',
  label: 'Bloco de código',
  description: 'Trecho de código ou dado em monoespaçado, com rótulo de linguagem.',
  icon: 'code',
  defaultColSpan: 12,
  mockConfig: { language: 'json', code: '{\n  "status": "ok",\n  "itens": 3\n}' } satisfies Cfg,
  config_schema: [
    { name: 'language', label: 'Linguagem (rótulo)', field: 'string', placeholder: 'ex.: json, sql, python' },
    { name: 'code', label: 'Código', field: 'textarea', placeholder: 'cole o código aqui…' },
  ],
});

export { CodeBlock };
