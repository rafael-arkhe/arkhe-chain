'use client';

/**
 * <ColorLegend /> — M5-10 (2026-05-23), M5-polish (2026-05-24).
 *
 * Legenda de cores progressiva para o Mapa do Workflow, espelhando os
 * QUATRO grupos do Workflow Lineage do Foundry (General / Permissions /
 * Usage / Organization). O eixo ativo (`axis`) é selecionável via botões;
 * cada eixo expande a sua lista de swatches. A seleção controla a cor de
 * realce dos nós no `<LineageFlowCanvas colorAxis={axis} />`.
 *
 * O grupo Organization colore por Operação/Espaço do recurso (`node.org`,
 * vindo do backend) — equivalente AEGIS ao Folder/Project do Foundry. As
 * cores são categóricas/dinâmicas (uma por Operação), então a legenda
 * descreve a dimensão em vez de listar swatches fixos.
 *
 * Honra DS: sharp corners (sem rounded-*), sem emojis, lucide icons,
 * focus rings, aria, e todas as strings via useT().
 */
import * as React from 'react';
import {
  Boxes,
  Zap,
  Brain,
  GitBranch,
  Workflow,
  Bot,
  FolderTree,
  CircleDashed,
  type LucideIcon,
} from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import type { ColorAxis } from './lineage-flow-canvas';

interface Swatch {
  color: string;
  labelKey: string;
  /** Tooltip curto explicando o que o sinal significa (não só a cor). */
  titleKey: string;
  icon?: LucideIcon;
}

/* Espelha KIND_META do canvas (General). */
const GENERAL_SWATCHES: Swatch[] = [
  { color: '#2D77BE', labelKey: 'grafo.kindDataAsset', titleKey: 'grafo.swatchTitleDataAsset', icon: Boxes },
  { color: '#7C3AED', labelKey: 'grafo.kindActionType', titleKey: 'grafo.swatchTitleActionType', icon: Zap },
  { color: '#0D9488', labelKey: 'grafo.kindLogicFunction', titleKey: 'grafo.swatchTitleLogicFunction', icon: Brain },
  { color: '#64748B', labelKey: 'grafo.kindOntologyNode', titleKey: 'grafo.swatchTitleOntologyNode', icon: GitBranch },
  { color: '#D97706', labelKey: 'grafo.kindWorkspace', titleKey: 'grafo.swatchTitleWorkspace', icon: Workflow },
  { color: '#DB2777', labelKey: 'grafo.kindLanguageModel', titleKey: 'grafo.swatchTitleLanguageModel', icon: Bot },
];
const PERMISSIONS_SWATCHES: Swatch[] = [
  { color: '#D97706', labelKey: 'grafo.legendMarked', titleKey: 'grafo.swatchTitleMarked' },
  { color: '#0D9488', labelKey: 'grafo.legendUnmarked', titleKey: 'grafo.swatchTitleUnmarked' },
];
const USAGE_SWATCHES: Swatch[] = [
  { color: '#DC2626', labelKey: 'grafo.legendOutdated', titleKey: 'grafo.swatchTitleOutdated' },
  { color: '#2D77BE', labelKey: 'grafo.legendCurrent', titleKey: 'grafo.swatchTitleCurrent' },
];
/* Organization — cores categóricas por Operação/Espaço (dinâmicas). A
   legenda descreve a dimensão; o cinza é o "sem Operação". */
const ORGANIZATION_SWATCHES: Swatch[] = [
  { color: '#2D77BE', labelKey: 'grafo.legendByProject', titleKey: 'grafo.swatchTitleByProject', icon: FolderTree },
  { color: '#94A3B8', labelKey: 'grafo.legendOrgUnassigned', titleKey: 'grafo.swatchTitleOrgUnassigned', icon: CircleDashed },
];

/* Cada eixo carrega a EXPLICAÇÃO do sinal de decisão (descKey) — exposta como
   title + aria-describedby da aba, para o operador saber o "porquê" da cor. */
const AXES: Array<{ value: ColorAxis; labelKey: string; descKey: string }> = [
  { value: 'general', labelKey: 'grafo.legendGeneral', descKey: 'grafo.legendDescGeneral' },
  { value: 'permissions', labelKey: 'grafo.legendPermissions', descKey: 'grafo.legendDescPermissions' },
  { value: 'usage', labelKey: 'grafo.legendUsage', descKey: 'grafo.legendDescUsage' },
  { value: 'organization', labelKey: 'grafo.legendOrganization', descKey: 'grafo.legendDescOrganization' },
];

function swatchesFor(axis: ColorAxis): Swatch[] {
  if (axis === 'permissions') return PERMISSIONS_SWATCHES;
  if (axis === 'usage') return USAGE_SWATCHES;
  if (axis === 'organization') return ORGANIZATION_SWATCHES;
  return GENERAL_SWATCHES;
}

export interface ColorLegendProps {
  axis: ColorAxis;
  onAxisChange: (axis: ColorAxis) => void;
}

export function ColorLegend({ axis, onAxisChange }: ColorLegendProps) {
  const t = useT();
  return (
    <div
      data-testid="grafo-color-legend"
      className="border border-border-light bg-white"
    >
      <header className="px-3 py-2 border-b border-border-light">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          {t('grafo.legendTitle')}
        </p>
      </header>

      {/* Seletor de eixo (grupo) */}
      <div
        className="flex items-stretch border-b border-border-light"
        role="tablist"
        aria-label={t('grafo.legendAxis')}
      >
        {AXES.map((a) => {
          const active = a.value === axis;
          return (
            <button
              key={a.value}
              type="button"
              role="tab"
              id={`grafo-legend-tab-${a.value}`}
              aria-selected={active}
              aria-controls="grafo-legend-panel"
              aria-describedby={`grafo-legend-desc-${a.value}`}
              title={t(a.descKey)}
              data-testid={`grafo-legend-axis-${a.value}`}
              onClick={() => onAxisChange(a.value)}
              className={`flex-1 h-8 px-2 text-[10px] uppercase tracking-wider font-semibold border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                active
                  ? 'bg-canvas-light text-primary border-primary'
                  : 'border-transparent text-muted-on-light hover:text-text-on-light'
              }`}
            >
              {t(a.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Descrições do sinal de decisão de cada eixo — alvo do aria-describedby
          das abas (visível só p/ leitores de tela; o mouse usa o title). */}
      <div className="sr-only">
        {AXES.map((a) => (
          <span key={a.value} id={`grafo-legend-desc-${a.value}`}>
            {t(a.descKey)}
          </span>
        ))}
      </div>

      {/* Swatches do eixo ativo — tabpanel rotulado pela aba ativa. */}
      <ul
        id="grafo-legend-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`grafo-legend-tab-${axis}`}
        className="px-3 py-2 space-y-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        data-testid={`grafo-legend-list-${axis}`}
      >
        {swatchesFor(axis).map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.labelKey} className="flex items-center gap-2" title={t(s.titleKey)}>
              <span
                aria-hidden
                className="inline-block w-3 h-3 border border-border-light shrink-0"
                style={{ background: s.color }}
              />
              {Icon && (
                <Icon
                  className="w-3 h-3 shrink-0 text-muted-on-light"
                  strokeWidth={1.5}
                  aria-hidden
                />
              )}
              <span className="text-[11px] text-text-on-light leading-tight">
                {t(s.labelKey)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ColorLegend;
