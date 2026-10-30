'use client';

/**
 * Status Pill — Sprint Wave D.4 (2026-05-23).
 *
 * Pill colorida por valor. Lê uma variable, casa contra a tabela de
 * `mappings: [{value, label, tone}]`, e renderiza com a cor adequada
 * usando tokens do DS (sem hex inline). Útil pra "status do caso",
 * "nível de alerta", "estado da fila" etc.
 *
 * Tons → tokens:
 *   - success  → bg-success
 *   - warning  → bg-warning
 *   - danger   → bg-danger
 *   - primary  → bg-primary
 *   - neutral  → bg-canvas-light + border-border-light
 *
 * Config:
 *   - source:   external_id da variable
 *   - mappings: [{ value: string|number|boolean, label: string, tone: ... }]
 *   - title?:   título acima da pill
 *   - fallback_label?: rótulo quando valor não casa (default "—")
 */
import * as React from 'react';
import { CheckCircle2, AlertTriangle, XOctagon, Info, Circle } from 'lucide-react';

import { cn } from '@/lib/cn';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Tone = 'success' | 'warning' | 'danger' | 'primary' | 'neutral';

interface Mapping {
  value: string | number | boolean;
  label: string;
  tone: Tone;
}

type Cfg = {
  source?: string;
  mappings?: Mapping[] | string;
  title?: string;
  fallback_label?: string;
};

function readMappings(cfg: Cfg): Mapping[] {
  const raw = cfg.mappings;
  if (Array.isArray(raw)) return raw.filter(isMapping);
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter(isMapping);
    } catch {
      // ignore
    }
  }
  return [];
}

function isMapping(m: unknown): m is Mapping {
  if (!m || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return (
    'value' in o &&
    typeof o.label === 'string' &&
    typeof o.tone === 'string' &&
    ['success', 'warning', 'danger', 'primary', 'neutral'].includes(
      o.tone as string,
    )
  );
}

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success text-white border-success',
  warning: 'bg-warning text-text-on-light border-warning',
  danger: 'bg-danger text-white border-danger',
  primary: 'bg-primary text-white border-primary',
  neutral: 'bg-canvas-light text-text-on-light border-border-light',
};

function ToneIcon({ tone }: { tone: Tone }) {
  switch (tone) {
    case 'success':
      return <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />;
    case 'warning':
      return <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />;
    case 'danger':
      return <XOctagon className="w-3 h-3" strokeWidth={1.5} />;
    case 'primary':
      return <Info className="w-3 h-3" strokeWidth={1.5} />;
    default:
      return <Circle className="w-3 h-3" strokeWidth={1.5} />;
  }
}

function StatusPill({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const mappings = readMappings(cfg);
  const raw = cfg.source ? variables[cfg.source] : undefined;

  const match = mappings.find((m) => sameValue(m.value, raw));
  const label = match?.label ?? cfg.fallback_label ?? '—';
  const tone: Tone = match?.tone ?? 'neutral';

  return (
    <div
      className="bg-white border border-border-light p-3 flex flex-col gap-1.5"
      data-testid="status-pill-widget"
    >
      {cfg.title && (
        <p className="text-caption uppercase tracking-wider text-muted-on-light font-semibold">
          {cfg.title}
        </p>
      )}
      <span
        data-testid="status-pill"
        data-tone={tone}
        className={cn(
          'self-start inline-flex items-center gap-1.5 px-2 py-1 border text-small font-mono uppercase tracking-wider',
          TONE_CLASSES[tone],
        )}
      >
        <ToneIcon tone={tone} />
        <span data-testid="status-pill-label">{label}</span>
      </span>
      <p
        className="text-caption font-mono text-muted-on-light"
        data-testid="status-pill-raw"
      >
        valor: <span className="text-text-on-light">{stringifyValue(raw)}</span>
      </p>
    </div>
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'string') return String(a) === b;
  if (typeof a === 'string' && typeof b === 'number') return a === String(b);
  if (typeof a === 'boolean' && typeof b === 'string') {
    return a === (b === 'true');
  }
  return false;
}

function stringifyValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

registerWidget('status_pill', StatusPill, {
  group: 'viz',
  label: 'Pílula de status',
  description:
    'Mostra um valor como pílula colorida segundo a tabela de mapeamento (success/warning/danger/primary/neutral).',
  icon: 'circle',
  defaultColSpan: 4,
  mockConfig: {
    source: 'status_caso',
    title: 'Status do caso',
    fallback_label: 'Não classificado',
    mappings: [
      { value: 'aberto', label: 'Em aberto', tone: 'warning' },
      { value: 'em_andamento', label: 'Em andamento', tone: 'primary' },
      { value: 'concluido', label: 'Concluído', tone: 'success' },
      { value: 'urgente', label: 'Urgente', tone: 'danger' },
    ],
  } satisfies Cfg,
  mockVariables: { status_caso: 'em_andamento' },
  config_schema: [
    {
      name: 'source',
      label: 'Dado de origem',
      description: 'external_id do dado cujo valor será classificado.',
      field: 'variable-ref',
    },
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho acima da pílula.',
      field: 'string',
      placeholder: 'ex.: Status do caso',
    },
    {
      name: 'fallback_label',
      label: 'Rótulo quando não casa',
      description: 'Texto exibido se o valor atual não estiver no mapeamento.',
      field: 'string',
      placeholder: 'ex.: Não classificado',
    },
    {
      name: 'mappings',
      label: 'Mapeamentos (JSON)',
      description:
        'Lista [{value, label, tone}]. tone aceita success | warning | danger | primary | neutral.',
      field: 'string',
      placeholder:
        '[{"value":"aberto","label":"Em aberto","tone":"warning"}]',
    },
  ],
});

export { StatusPill };
