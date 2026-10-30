'use client';

/**
 * Metric Card — Sprint 5 do parity roadmap.
 *
 * Chip pequeno mostrando count/agregação numa única linha — pensado pra
 * ir em header de tabela/lista ("Resultados · 142"). Diferente do
 * `security.kpi_card` (card grande tipo dashboard), esse é
 * compacto/inline.
 *
 * Sprint D4 (Parity Audit): suporte a `format_rules[]` — quando o valor
 * resolvido casa com uma regra, a cor da regra substitui a `variant`
 * padrão. Aplicável a 1 valor único (sem `field` no rule).
 */
import * as React from 'react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { cn } from '@/lib/cn';
// Sprint D4: formatação condicional. Lógica de avaliação vive em
// lib/workshop/format-rules.ts (fonte única, compartilhada com object_table_v2
// e security.kpi_card) — aqui só mapeamos cor→classe e renderizamos.
import {
  type FormatColor,
  type FormatRule,
  evaluateFormatRule,
  matchFormatRule,
  parseFormatRules,
} from '@/lib/workshop/format-rules';
import { fmtDurationSeconds } from '@/lib/format/number';

const FORMAT_VARIANT_CLS: Record<FormatColor, string> = {
  success: 'bg-success/10 border-success/40 text-success',
  warning: 'bg-warning/10 border-warning/40 text-warning',
  danger: 'bg-danger/10 border-danger/40 text-danger',
  info: 'bg-info/10 border-info/40 text-info',
};

/* -------------------------------------------------------------------------- */

type Cfg = {
  label?: string;
  value_from?: string;
  prefix?: string;
  suffix?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  /** Sprint D4: regras de cor condicional avaliadas contra o valor resolvido. */
  format_rules?: FormatRule[] | string;
  /**
   * BACKLOG #6a (gestão/auditoria): formato do valor. `duration_s` lê o valor
   * como SEGUNDOS e renderiza duração legível (MTTR do painel). Ausente =
   * número cru (`toLocaleString`).
   */
  format?: 'duration_s';
  /**
   * BACKLOG #6a: external_id de uma WorkshopVariable (numérica) que carrega o
   * LIMIAR de comparação — o card fica vermelho quando o valor ULTRAPASSA o
   * limiar (ex.: MTTR > SLA), verde quando dentro. O limiar é DADO
   * CONFIGURÁVEL (nunca hardcode): vem do evaluate/Workshop. Reusa o util de
   * "Regras de cor" (Onda 1). `format_rules` explícito tem prioridade.
   */
  threshold_from?: string;
};

const VARIANT_CLS: Record<string, string> = {
  default: 'bg-canvas-light border-border-light text-text-on-light',
  primary: 'bg-primary/10 border-primary/40 text-primary',
  success: 'bg-success/10 border-success/40 text-success',
  warning: 'bg-warning/10 border-warning/40 text-warning',
  danger: 'bg-danger/10 border-danger/40 text-danger',
};

function MetricCard({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const raw = cfg.value_from ? variables[cfg.value_from] : null;
  const value =
    typeof raw === 'number'
      ? cfg.format === 'duration_s'
        ? fmtDurationSeconds(raw)
        : raw.toLocaleString('pt-BR')
      : typeof raw === 'string'
        ? raw
        : '—';
  const variant = cfg.variant ?? 'default';

  /* Sprint D4: rule match sobrescreve a variant default. */
  const rules = React.useMemo(() => parseFormatRules(cfg.format_rules), [cfg.format_rules]);
  const matched = React.useMemo(() => matchFormatRule(raw, rules), [rules, raw]);

  /**
   * BACKLOG #6a: cor por LIMIAR configurável (`threshold_from`) — MTTR vs SLA.
   * Reusa `evaluateFormatRule` (Onda 1): valor > limiar → danger (estourou),
   * senão success. Só quando ambos são numéricos e não há `format_rules`
   * explícito casando. O limiar é dado (WorkshopVariable), nunca hardcode.
   */
  const slaColor = React.useMemo<FormatColor | null>(() => {
    if (matched || !cfg.threshold_from) return null;
    const threshold = variables[cfg.threshold_from];
    if (typeof raw !== 'number' || typeof threshold !== 'number') return null;
    return evaluateFormatRule(raw, { op: 'gt', threshold, color: 'danger' })
      ? 'danger'
      : 'success';
  }, [matched, cfg.threshold_from, variables, raw]);

  const appliedCls = matched
    ? FORMAT_VARIANT_CLS[matched.color]
    : slaColor
      ? FORMAT_VARIANT_CLS[slaColor]
      : VARIANT_CLS[variant];

  return (
    <span
      className={cn(
        'inline-flex items-center h-7 px-2 text-[11px] border gap-1.5 font-mono',
        appliedCls,
      )}
      data-testid="metric-card"
    >
      {cfg.label && (
        <span className="text-[10px] uppercase tracking-wider opacity-80">
          {cfg.label}
        </span>
      )}
      <span className="font-semibold tabular-nums">
        {cfg.prefix}
        {value}
        {cfg.suffix}
      </span>
    </span>
  );
}

registerWidget('metric_card', MetricCard, {
  group: 'viz',
  label: 'Indicador compacto',
  description:
    'Indicador em linha com rótulo e valor numérico. Ideal para mostrar totais no topo de tabelas e listas.',
  icon: 'tag',
  defaultColSpan: 3,
  mockConfig: {
    label: 'Total',
    value_from: 'count',
    suffix: ' BOs',
    variant: 'primary',
  },
  mockVariables: { count: 142 },
  previewWidth: 240,
  previewHeight: 50,
  config_schema: [
    { name: 'label', label: 'Rótulo', field: 'string', placeholder: 'Total' },
    { name: 'value_from', label: 'Dado do valor', field: 'variable-ref' },
    { name: 'prefix', label: 'Prefixo', field: 'string', placeholder: 'R$ ' },
    { name: 'suffix', label: 'Sufixo', field: 'string', placeholder: ' BOs' },
    { name: 'variant', label: 'Variante', field: 'select', options: [
      { value: 'default', label: 'Neutro' },
      { value: 'primary', label: 'Azul' },
      { value: 'success', label: 'Verde' },
      { value: 'warning', label: 'Amarelo' },
      { value: 'danger', label: 'Vermelho' },
    ], default: 'default' },
    {
      name: 'format',
      label: 'Formato do valor',
      description: 'Como exibir o número. Duração lê o valor como segundos (MTTR).',
      field: 'select',
      options: [
        { value: '', label: 'Número' },
        { value: 'duration_s', label: 'Duração (segundos)' },
      ],
      default: '',
    },
    {
      name: 'threshold_from',
      label: 'Limiar (SLA) da cor',
      description:
        'Variável numérica com o limiar: vermelho quando o valor ultrapassa, verde quando dentro. Configurável — nunca fixo no código.',
      field: 'variable-ref',
    },
    {
      name: 'format_rules',
      label: 'Regras de cor',
      // Sprint F3 (2026-05-21): builder visual substitui o textarea JSON.
      // Para o metric_card o campo "Coluna" pode ficar vazio (regra aplica ao
      // valor único resolvido por `value_from`). Toggle "Avançado (JSON)"
      // mantém o fallback raw pra copy/paste entre painéis.
      description: 'Sobrescreve a variante por regra. A primeira que casa vence.',
      field: 'format-rules',
    },
  ],
});
