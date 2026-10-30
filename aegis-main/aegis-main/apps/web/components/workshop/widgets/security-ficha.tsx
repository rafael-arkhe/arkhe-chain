'use client';

/**
 * Widget composto `security.ficha.layout` — reproduz a ficha
 * atual (paleta esquerda + canvas central com 3-col grid de
 * widgets + inspetor direita), preservando UX intacta.
 *
 * `entity_id`, `properties` e `obj` chegam via `variables`:
 *   - variables.entity_id   → string (UUID)
 *   - variables.properties  → Record (passa pro WidgetIdentificacao)
 *   - variables.obj         → objeto completo (passa pro Inspetor)
 *
 * F6.5 quebra esse macro em widgets individuais pra customização real.
 */

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { PaletaWidgets } from '@/components/ficha/paleta';
import { Inspetor } from '@/components/ficha/inspetor';
import { WidgetCidades } from '@/components/ficha/widget-cidades';
import { WidgetObservacoesCctv } from '@/components/ficha/widget-observacoes-cctv';
import {
  WidgetAntecedentes,
  WidgetEnderecos,
  WidgetIdentificacao,
  WidgetLinhaTempo,
  WidgetMandados,
  WidgetVeiculos,
} from '@/components/ficha/widgets-prontos';
import { cn } from '@/lib/cn';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  /** Lista das abas. Default = 7 abas atuais. */
  tabs?: string[];
  /** Lista de "widgets" da área canvas (cada item é um id renderizado
   *  inline). Default = ['identificacao', 'antecedentes', ...]. */
  canvas_widgets?: string[];
  /** Mostra/esconde inspetor à direita. */
  show_inspetor?: boolean;
  /** Mostra/esconde paleta à esquerda. */
  show_paleta?: boolean;
};

const DEFAULT_TABS = [
  'Visão geral',
  'Propriedades',
  'Vínculos',
  'Mapa',
  'Mídia',
  'Histórico',
  'AVA',
];

const DEFAULT_CANVAS = [
  'identificacao',
  'antecedentes',
  'mandados',
  'veiculos',
  'enderecos',
  'linha_tempo',
  'cidades',
  'observacoes_cctv',
];

function FichaWidget({
  id,
  entityId,
  properties,
}: {
  id: string;
  entityId: string | null;
  properties: Record<string, unknown>;
}) {
  switch (id) {
    case 'identificacao':
      return <WidgetIdentificacao properties={properties} />;
    case 'antecedentes':
      return <WidgetAntecedentes />;
    case 'mandados':
      return <WidgetMandados />;
    case 'veiculos':
      return <WidgetVeiculos />;
    case 'enderecos':
      return <WidgetEnderecos />;
    case 'linha_tempo':
      return <WidgetLinhaTempo />;
    case 'cidades':
      return entityId ? <WidgetCidades entityId={entityId} /> : null;
    case 'observacoes_cctv':
      return entityId ? <WidgetObservacoesCctv entityId={entityId} /> : null;
    default:
      return (
        <div className="bg-white border border-dashed border-warning p-3 text-[11px] text-warning">
          widget desconhecido: {id}
        </div>
      );
  }
}

function SecurityFichaLayout({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const tabs = cfg.tabs ?? DEFAULT_TABS;
  const canvasWidgets = cfg.canvas_widgets ?? DEFAULT_CANVAS;
  const showInspetor = cfg.show_inspetor !== false;
  const showPaleta = cfg.show_paleta !== false;
  const entityId =
    typeof variables.entity_id === 'string' ? variables.entity_id : null;
  const properties =
    (variables.properties as Record<string, unknown>) ?? {};
  const obj =
    (variables.obj as Parameters<typeof Inspetor>[0]['obj'] | undefined) ?? null;
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="h-full flex flex-col">
      <div className="h-9 border-b border-border-light flex items-stretch bg-panel-light shrink-0">
        {tabs.map((aba, i) => (
          <button
            key={aba}
            type="button"
            onClick={() => setActiveTab(i)}
            className={cn(
              'px-4 text-[12px] whitespace-nowrap transition-colors relative',
              i === activeTab
                ? 'text-text-on-light font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary'
                : 'text-muted-on-light hover:text-text-on-light',
            )}
          >
            {aba}
          </button>
        ))}
        <button
          type="button"
          aria-label="Mais opções"
          className="ml-auto px-2 text-muted-on-light hover:text-text-on-light"
        >
          <MoreHorizontal className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {showPaleta && <PaletaWidgets />}
        <section
          data-testid="canvas-ficha"
          className="flex-1 bg-canvas-light overflow-y-auto p-4"
        >
          <div className="grid grid-cols-3 gap-3">
            {canvasWidgets.map((id) => (
              <div
                key={id}
                className={
                  id === 'observacoes_cctv' || id === 'linha_tempo'
                    ? 'col-span-3'
                    : ''
                }
              >
                <FichaWidget id={id} entityId={entityId} properties={properties} />
              </div>
            ))}
          </div>
        </section>
        {showInspetor && obj && <Inspetor obj={obj} />}
      </div>
    </div>
  );
}
registerWidget('security.ficha.layout', SecurityFichaLayout, {
  group: 'ficha',
  label: 'Ficha · layout completo',
  description: 'Macro completa da ficha: identificação no topo + abas (histórico, atividade) embaixo.',
  icon: 'id-card',
  defaultColSpan: 20,
  previewWidth: 1080,
  previewHeight: 720,
  mockVariables: {
    properties: {
      nome: 'José da Silva',
      cpf: '123.456.789-00',
      data_nascimento: '1982-03-17',
    },
    obj: {
      id: '00000000-0000-4000-8000-000000000042',
      name: 'José da Silva',
      entity_type: 'pessoa',
      classification: 'restrito',
      version: 3,
    },
  },
  config_schema: [
    {
      name: 'show_identificacao',
      label: 'Mostrar identificação',
      field: 'boolean',
      default: true,
    },
    {
      name: 'tabs',
      label: 'Abas visíveis (CSV)',
      description:
        'Entre: antecedentes, mandados, veiculos, enderecos, linha_tempo, cidades, observacoes_cctv. Vazio = todas.',
      field: 'string',
      placeholder: 'ex.: antecedentes,linha_tempo',
    },
    {
      name: 'default_tab',
      label: 'Aba inicial',
      description: 'Qual aba abrir no primeiro carregamento.',
      field: 'string',
      placeholder: 'ex.: antecedentes',
    },
  ],
});
