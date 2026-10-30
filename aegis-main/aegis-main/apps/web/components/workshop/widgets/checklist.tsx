'use client';

/**
 * Checklist — T3-F2 (2026-06-29). Bloco-base de documento: lista de tarefas.
 * Uma tarefa por linha; prefixe com [x] para concluída. Presentational.
 */
import * as React from 'react';
import { CheckSquare, Square } from 'lucide-react';

import { cn } from '@/lib/cn';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = { title?: string; items?: string };

function Checklist({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const lines = String(cfg.items || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <div data-testid="checklist-widget" className="text-text-on-light">
      {cfg.title && <p className="text-[12px] font-semibold mb-1.5">{cfg.title}</p>}
      <ul className="space-y-1">
        {lines.map((line, i) => {
          const done = /^\[x\]/i.test(line);
          const text = line.replace(/^\[[ xX]?\]\s*/, '').replace(/^-\s*/, '');
          return (
            <li key={i} className="flex items-start gap-2 text-[12px]">
              {done ? (
                <CheckSquare className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" strokeWidth={1.5} />
              ) : (
                <Square className="w-3.5 h-3.5 mt-0.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
              )}
              <span className={cn(done && 'line-through text-muted-on-light')}>{text}</span>
            </li>
          );
        })}
        {lines.length === 0 && <li className="text-[11px] text-muted-on-light italic">(sem itens)</li>}
      </ul>
    </div>
  );
}

registerWidget('checklist', Checklist, {
  group: 'content',
  label: 'Lista de tarefas',
  description: 'Checklist — uma tarefa por linha; prefixe com [x] para concluída.',
  icon: 'list-checks',
  defaultColSpan: 12,
  mockConfig: {
    title: 'Pendências',
    items: '[x] Coletar fontes\n[ ] Validar vínculos\n[ ] Revisar com supervisor',
  } satisfies Cfg,
  config_schema: [
    { name: 'title', label: 'Título', field: 'string', placeholder: 'ex.: Pendências' },
    {
      name: 'items',
      label: 'Itens',
      field: 'textarea',
      placeholder: '[x] Tarefa concluída\n[ ] Tarefa pendente',
      description: 'Uma tarefa por linha. Prefixe com [x] para marcar como concluída.',
    },
  ],
});

export { Checklist };
