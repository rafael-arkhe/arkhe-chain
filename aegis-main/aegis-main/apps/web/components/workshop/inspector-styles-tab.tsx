'use client';

/**
 * InspectorStylesTab — Wave G.2 (2026-05-23).
 *
 * Override real de tokens por widget. Persiste em
 * `widget.props.style_overrides`. WorkshopV2Renderer aplica via wrapper
 * de classes Tailwind no `<div data-testid="workshop-widget-...">`.
 *
 * Tokens disponíveis (dropdowns, NUNCA texto livre):
 *   - textStyle: '' | 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'caption'
 *   - spacing  : '' | 'sm' | 'md' | 'lg'         → padding p-2/p-3/p-4
 *   - background:'' | 'canvas' | 'panel' | 'raised'
 *   - border   : '' | 'none' | 'subtle' | 'strong'
 *   - padding  : '' | 'gap-2' | 'gap-3' | 'gap-4'
 *
 * Cada select tem valor vazio = "padrão (sem override)". Botão "Restaurar
 * padrão" zera todos. Live preview: alterar reflete instantâneo no
 * canvas porque o componente chama `onChange` com `widget.props`
 * patched — o WorkshopV2Renderer já re-renderiza.
 */
import * as React from 'react';
import { RotateCcw } from 'lucide-react';
import type { LayoutNode } from '@/lib/workshop/types';

export interface StyleOverrides {
  textStyle?: '' | 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'caption';
  spacing?: '' | 'sm' | 'md' | 'lg';
  background?: '' | 'canvas' | 'panel' | 'raised';
  border?: '' | 'none' | 'subtle' | 'strong';
  padding?: '' | 'gap-2' | 'gap-3' | 'gap-4';
}

const TEXT_STYLE_OPTIONS: { value: NonNullable<StyleOverrides['textStyle']>; label: string }[] = [
  { value: '', label: 'Padrão' },
  { value: 'h1', label: 'Título grande (20px)' },
  { value: 'h2', label: 'Título médio (16px)' },
  { value: 'h3', label: 'Título pequeno (14px)' },
  { value: 'body', label: 'Corpo (14px)' },
  { value: 'small', label: 'Pequeno (12px)' },
  { value: 'caption', label: 'Legenda (11px)' },
];
const SPACING_OPTIONS: { value: NonNullable<StyleOverrides['spacing']>; label: string }[] = [
  { value: '', label: 'Padrão' },
  { value: 'sm', label: 'Compacto (p-2)' },
  { value: 'md', label: 'Médio (p-3)' },
  { value: 'lg', label: 'Confortável (p-4)' },
];
const BACKGROUND_OPTIONS: { value: NonNullable<StyleOverrides['background']>; label: string }[] = [
  { value: '', label: 'Padrão' },
  { value: 'canvas', label: 'Canvas (branco)' },
  { value: 'panel', label: 'Painel (cinza claro)' },
  { value: 'raised', label: 'Elevado (cinza mais escuro)' },
];
const BORDER_OPTIONS: { value: NonNullable<StyleOverrides['border']>; label: string }[] = [
  { value: '', label: 'Padrão' },
  { value: 'none', label: 'Sem borda' },
  { value: 'subtle', label: 'Sutil' },
  { value: 'strong', label: 'Forte (primária)' },
];
const PADDING_OPTIONS: { value: NonNullable<StyleOverrides['padding']>; label: string }[] = [
  { value: '', label: 'Padrão' },
  { value: 'gap-2', label: 'Espaço pequeno (gap-2)' },
  { value: 'gap-3', label: 'Espaço médio (gap-3)' },
  { value: 'gap-4', label: 'Espaço amplo (gap-4)' },
];

function getOverrides(node: LayoutNode): StyleOverrides {
  const props = (node.widget.props as Record<string, unknown>) ?? {};
  const so = (props.style_overrides as StyleOverrides | undefined) ?? {};
  return {
    textStyle: so.textStyle ?? '',
    spacing: so.spacing ?? '',
    background: so.background ?? '',
    border: so.border ?? '',
    padding: so.padding ?? '',
  };
}

function setOverrides(node: LayoutNode, next: StyleOverrides): LayoutNode {
  const props = { ...((node.widget.props as Record<string, unknown>) ?? {}) };
  // limpa chaves vazias pra não poluir o JSON persistido
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(next)) {
    if (v && v !== '') cleaned[k] = v as string;
  }
  if (Object.keys(cleaned).length === 0) {
    delete props.style_overrides;
  } else {
    props.style_overrides = cleaned;
  }
  return { ...node, widget: { ...node.widget, props } };
}

/**
 * Converte overrides em classes Tailwind para o wrapper do widget.
 * Exportado pra que o WorkshopV2Renderer use o MESMO mapeamento (single
 * source of truth, evita drift entre preview e runtime).
 */
export function overridesToClassName(so: StyleOverrides | undefined): string {
  if (!so) return '';
  const parts: string[] = [];
  if (so.textStyle) parts.push(`text-${so.textStyle}`);
  if (so.spacing) {
    if (so.spacing === 'sm') parts.push('p-2');
    if (so.spacing === 'md') parts.push('p-3');
    if (so.spacing === 'lg') parts.push('p-4');
  }
  if (so.background === 'canvas') parts.push('bg-canvas-light');
  if (so.background === 'panel') parts.push('bg-panel-light');
  if (so.background === 'raised') parts.push('bg-raised-light');
  if (so.border === 'none') parts.push('border-0');
  if (so.border === 'subtle') parts.push('border', 'border-border-light');
  if (so.border === 'strong') parts.push('border', 'border-primary');
  if (so.padding) parts.push(so.padding);
  return parts.join(' ');
}

export interface InspectorStylesTabProps {
  node: LayoutNode;
  onChange: (next: LayoutNode) => void;
}

export function InspectorStylesTab({ node, onChange }: InspectorStylesTabProps) {
  const overrides = getOverrides(node);
  const hasAnyOverride = Object.values(overrides).some((v) => v && v !== '');

  const update = (patch: Partial<StyleOverrides>) => {
    onChange(setOverrides(node, { ...overrides, ...patch }));
  };

  return (
    <div
      data-testid="inspector-styles-panel"
      className="px-3 py-3 text-[11px] text-text-on-light space-y-3"
    >
      <header className="flex items-center justify-between gap-2">
        <p className="font-semibold uppercase tracking-[0.16em] text-[10px] text-muted-on-light">
          Estilos do widget
        </p>
        <button
          type="button"
          onClick={() => onChange(setOverrides(node, {}))}
          disabled={!hasAnyOverride}
          data-testid="inspector-styles-reset"
          className="h-6 px-2 text-[10.5px] border border-border-light bg-white hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          title="Limpar todos os overrides deste widget"
        >
          <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> Restaurar padrão
        </button>
      </header>
      <p className="text-muted-on-light leading-snug">
        Overrides afetam apenas este widget. O configurador global continua
        controlando os defaults do tenant.
      </p>
      <StyleField
        label="Tipografia"
        testId="inspector-styles-text-style"
        value={overrides.textStyle ?? ''}
        options={TEXT_STYLE_OPTIONS}
        onChange={(v) => update({ textStyle: v as StyleOverrides['textStyle'] })}
      />
      <StyleField
        label="Espaçamento interno"
        testId="inspector-styles-spacing"
        value={overrides.spacing ?? ''}
        options={SPACING_OPTIONS}
        onChange={(v) => update({ spacing: v as StyleOverrides['spacing'] })}
      />
      <StyleField
        label="Fundo"
        testId="inspector-styles-background"
        value={overrides.background ?? ''}
        options={BACKGROUND_OPTIONS}
        onChange={(v) => update({ background: v as StyleOverrides['background'] })}
      />
      <StyleField
        label="Borda"
        testId="inspector-styles-border"
        value={overrides.border ?? ''}
        options={BORDER_OPTIONS}
        onChange={(v) => update({ border: v as StyleOverrides['border'] })}
      />
      <StyleField
        label="Gap entre itens"
        testId="inspector-styles-padding"
        value={overrides.padding ?? ''}
        options={PADDING_OPTIONS}
        onChange={(v) => update({ padding: v as StyleOverrides['padding'] })}
      />
      <div
        data-testid="inspector-styles-preview"
        data-style-classes={overridesToClassName(overrides)}
        className={`mt-2 border border-dashed border-border-light bg-canvas-light/60 p-3 ${overridesToClassName(overrides)}`}
      >
        <p className="text-[10px] text-muted-on-light uppercase tracking-wider">
          Pré-visualização
        </p>
        <p>
          O widget <code>{node.widget.type}</code> usará estas classes:{' '}
          <code data-testid="inspector-styles-preview-classes">
            {overridesToClassName(overrides) || '(nenhuma)'}
          </code>
        </p>
      </div>
    </div>
  );
}

function StyleField({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="h-7 w-full px-1.5 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
