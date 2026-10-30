'use client';

/**
 * Handlebars Text — Sprint L7 (2026-05-23).
 *
 * Texto rico com placeholders `{{var.path}}` resolvidos via engine puro
 * (lib/handlebars/engine.ts). Suporta `{{#if}}` e `{{#each}}` para
 * composição declarativa em painéis de operador (briefing, header,
 * cabeçalhos contextuais).
 *
 * Diferença vs `markdown-v2`: este widget é especializado em interpolação
 * dinâmica. Não renderiza markdown — texto sai inline com escape HTML.
 *
 * Config:
 *   - template: string   texto handlebars
 *   - tag: 'p' | 'h1'..'h6' | 'span'   tag de envelope (default 'p')
 *   - className?: string    classes Tailwind extras
 *   - align?: 'left' | 'center' | 'right' (default 'left')
 *   - emphasis?: 'normal' | 'muted' | 'strong' (default 'normal')
 */
import * as React from 'react';

import { compile } from '@/lib/handlebars/engine';
import { cn } from '@/lib/cn';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  template?: string;
  tag?: 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  className?: string;
  align?: 'left' | 'center' | 'right';
  emphasis?: 'normal' | 'muted' | 'strong';
};

export function HandlebarsText({ config, variables, bindings }: WidgetRenderProps) {
  const cfg = (config ?? {}) as Cfg;
  const template = typeof cfg.template === 'string' ? cfg.template : '';

  // Merge variables + bindings; binding sobrescreve quando colidir
  // (consistente com o resto do renderer).
  const ctx = React.useMemo(
    () => ({ ...(variables ?? {}), ...(bindings ?? {}) }),
    [variables, bindings],
  );

  const html = React.useMemo(() => {
    try {
      return compile(template, ctx);
    } catch {
      return '';
    }
  }, [template, ctx]);

  if (!template) {
    return (
      <div
        className="border border-border-light bg-white p-3 text-[11px] text-muted-on-light"
        data-testid="handlebars-text-empty"
      >
        Configure `template` no Inspector. Use {'{{ '}variável{' }}'} para
        interpolar valores.
      </div>
    );
  }

  const Tag = (cfg.tag ?? 'p') as keyof React.JSX.IntrinsicElements;
  const alignClass =
    cfg.align === 'center'
      ? 'text-center'
      : cfg.align === 'right'
        ? 'text-right'
        : 'text-left';
  const emphasisClass =
    cfg.emphasis === 'muted'
      ? 'text-muted-on-light'
      : cfg.emphasis === 'strong'
        ? 'text-text-on-light font-semibold'
        : 'text-text-on-light';

  return (
    <div
      className="border border-border-light bg-white p-3"
      data-testid="handlebars-text"
    >
      <Tag
        className={cn(
          'text-[12px] leading-relaxed whitespace-pre-wrap break-words',
          alignClass,
          emphasisClass,
          cfg.className,
        )}
        // dangerouslySetInnerHTML é seguro aqui — `compile()` faz escape de
        // HTML em todos os mustaches `{{ }}` por default. Triple `{{{ }}}`
        // é opt-in explícito do operador (mesmo contrato do handlebars.js).
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

registerWidget('handlebars_text', HandlebarsText, {
  group: 'content',
  label: 'Texto dinâmico',
  description:
    'Texto com marcadores {{variável}} substituídos pelos valores do painel. Permite condicionais e listas curtas.',
  icon: 'text',
  defaultColSpan: 6,
  mockConfig: {
    template: 'Olá, {{alvo.display_name}}. Cidade: {{alvo.cidade}}.',
    tag: 'p',
    emphasis: 'normal',
  },
  mockVariables: {
    alvo: { display_name: 'João da Silva', cidade: 'São Paulo' },
  },
  previewWidth: 380,
  previewHeight: 90,
  config_schema: [
    {
      name: 'template',
      label: 'Template',
      field: 'string',
      placeholder: 'Olá, {{nome}}!',
    },
    {
      name: 'tag',
      label: 'Elemento',
      field: 'select',
      options: [
        { value: 'p', label: 'Parágrafo' },
        { value: 'span', label: 'Trecho' },
        { value: 'h1', label: 'Título 1' },
        { value: 'h2', label: 'Título 2' },
        { value: 'h3', label: 'Título 3' },
        { value: 'h4', label: 'Título 4' },
        { value: 'h5', label: 'Título 5' },
        { value: 'h6', label: 'Título 6' },
      ],
      default: 'p',
    },
    {
      name: 'align',
      label: 'Alinhamento',
      field: 'select',
      options: [
        { value: 'left', label: 'Esquerda' },
        { value: 'center', label: 'Centro' },
        { value: 'right', label: 'Direita' },
      ],
      default: 'left',
    },
    {
      name: 'emphasis',
      label: 'Ênfase',
      field: 'select',
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'muted', label: 'Discreta' },
        { value: 'strong', label: 'Forte' },
      ],
      default: 'normal',
    },
  ],
});
