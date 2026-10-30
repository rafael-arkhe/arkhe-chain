'use client';

/**
 * Callout / Aviso — T3-F (2026-06-29). Bloco-base de editor de documento:
 * caixa destacada por TOM (info/atenção/perigo/sucesso) com título + texto.
 * Presentational (config-driven, sem ontologia). Cantos retos, sem side-stripe.
 */
import * as React from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Info } from 'lucide-react';

import { cn } from '@/lib/cn';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Tone = 'info' | 'warning' | 'danger' | 'success';
type Cfg = { tone?: Tone; title?: string; body?: string };

const TONES: Tone[] = ['info', 'warning', 'danger', 'success'];
const TONE_BOX: Record<Tone, string> = {
  info: 'border-primary/40 bg-primary/5',
  warning: 'border-warning/50 bg-warning/10',
  danger: 'border-danger/40 bg-danger/5',
  success: 'border-success/40 bg-success/5',
};
const TONE_ICON: Record<Tone, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertCircle,
  success: CheckCircle2,
};

function Callout({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const tone: Tone = TONES.includes(cfg.tone as Tone) ? (cfg.tone as Tone) : 'info';
  const Icon = TONE_ICON[tone];
  return (
    <div
      className={cn('border p-3 flex items-start gap-2.5 text-text-on-light', TONE_BOX[tone])}
      data-testid="callout-widget"
      data-tone={tone}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-on-light" strokeWidth={1.5} />
      <div className="min-w-0">
        {cfg.title && <p className="text-[12px] font-semibold mb-0.5">{cfg.title}</p>}
        <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{cfg.body || '—'}</p>
      </div>
    </div>
  );
}

registerWidget('callout', Callout, {
  group: 'content',
  label: 'Aviso / Destaque',
  description: 'Caixa destacada por tom (informação/atenção/perigo/sucesso) com título e texto.',
  icon: 'alert-triangle',
  defaultColSpan: 12,
  mockConfig: {
    tone: 'warning',
    title: 'Atenção',
    body: 'Informação relevante para o leitor do documento.',
  } satisfies Cfg,
  config_schema: [
    {
      name: 'tone',
      label: 'Tom',
      field: 'select',
      default: 'info',
      options: [
        { value: 'info', label: 'Informação' },
        { value: 'warning', label: 'Atenção' },
        { value: 'danger', label: 'Perigo' },
        { value: 'success', label: 'Sucesso' },
      ],
    },
    { name: 'title', label: 'Título', field: 'string', placeholder: 'ex.: Atenção' },
    { name: 'body', label: 'Texto', field: 'textarea', placeholder: 'Conteúdo do aviso' },
  ],
});

export { Callout };
