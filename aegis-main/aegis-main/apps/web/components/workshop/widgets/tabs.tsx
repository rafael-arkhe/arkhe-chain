'use client';

import { useState } from 'react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { Workshop, isPersistedAppId } from '@/lib/workshop/client';
import { cn } from '@/lib/cn';

type Cfg = {
  tabs?: Array<{ id: string; label: string; content?: string }>;
  /** Aba inicial (id). Default: a primeira. */
  default_tab?: string;
};

/** Tabs simples — cada tab tem string `content` (renderizada como
 *  text/markdown). Pra abas com WIDGETS embutidos por aba, futura
 *  fase faz recursive layout. */
function Tabs({ appId, config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const tabs = cfg.tabs ?? [];
  // default_tab (config_schema) agora é respeitado: abre nela se existir.
  const initial =
    cfg.default_tab && tabs.some((t) => t.id === cfg.default_tab)
      ? cfg.default_tab
      : tabs[0]?.id ?? '';
  const [active, setActive] = useState(initial);
  if (tabs.length === 0) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Nenhuma aba configurada.
      </div>
    );
  }
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="bg-white border border-border-light flex flex-col">
      <div className="h-9 px-1 border-b border-border-light flex items-stretch bg-raised-light/40">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (t.id === active) return;
              // Sprint PE3: ingest tab_view fire-and-forget — só pra apps
              // persistidos no backend (seeds/local.app.* não têm UUID).
              // O toggle de opt-out por painel (metrics_enabled) é
              // verificado no client.logUsageEvent? — não: aqui não temos
              // a app em scope. WorkshopV2Renderer filtra. Mas widget é
              // descendente: aceitamos enviar e backend descarta no
              // worker quando o painel tiver metrics_enabled=false (PE4
              // backend rule). Em apps locais, isPersistedAppId já filtra.
              if (isPersistedAppId(appId)) {
                Workshop.logUsageEvent(appId, {
                  event_type: 'tab_view',
                  tab_id: t.id,
                });
              }
              setActive(t.id);
            }}
            className={cn(
              'px-3 text-[11px] uppercase tracking-wider transition-colors relative',
              active === t.id
                ? 'text-text-on-light font-medium after:absolute after:bottom-0 after:inset-x-2 after:h-[2px] after:bg-primary'
                : 'text-muted-on-light hover:text-text-on-light',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3 text-[12px] whitespace-pre-wrap leading-relaxed">
        {current.content ?? ''}
      </div>
    </div>
  );
}
registerWidget('tabs', Tabs, {
  group: 'content',
  label: 'Abas (container)',
  description: 'Bloco de abas com texto formatado em cada uma. Pra aninhar outros widgets dentro das abas, use a versão da ficha.',
  icon: 'panels-top-left',
  defaultColSpan: 10,
  mockConfig: {
    tabs: [
      { id: 'geral', label: 'Geral', content: 'Conteúdo da aba Geral.\nResumo, KPIs ou texto.' },
      { id: 'historico', label: 'Histórico', content: 'Eventos e ocorrências por data.' },
      { id: 'cctv', label: 'CCTV', content: 'Detecções recentes nas câmeras.' },
    ],
  },
  config_schema: [
    {
      name: 'tabs',
      label: 'Abas',
      description: 'Cada aba tem um identificador, um rótulo e um conteúdo.',
      field: 'option-list',
      itemShape: 'tabs',
    },
    {
      name: 'default_tab',
      label: 'Aba inicial',
      description: 'Identificador da aba aberta no primeiro carregamento.',
      field: 'string',
    },
  ],
});
