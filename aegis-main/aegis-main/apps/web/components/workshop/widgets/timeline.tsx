'use client';

/**
 * Timeline widget — Sprint L17 (2026-05-23).
 *
 * Renderiza uma lista de eventos cronológicos em modo timeline vertical.
 * Cada evento tem timestamp, label, optional kind/actor.
 *
 * Config:
 *   - source: string         external_id da variable (array de eventos)
 *   - timestamp_key: string  default "timestamp"
 *   - label_key: string      default "label"
 *   - kind_key?: string      default "kind"
 *   - actor_key?: string     default "actor"
 *   - max_items?: number     default 50
 *   - direction: 'desc' | 'asc' default 'desc' (mais recente em cima)
 *
 * Útil para audit logs, sequências de eventos operacionais, lineage view
 * por entidade. Pesquisa R2 Slate · widgets/time.md baseline.
 */
import * as React from 'react';
import { Clock, ChevronRight } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { formatDataHoraBR } from '@/lib/datetime';
import { getField } from './_row';

type Cfg = {
  source?: string;
  timestamp_key?: string;
  label_key?: string;
  kind_key?: string;
  actor_key?: string;
  max_items?: number;
  direction?: 'asc' | 'desc';
};

function pickArray(
  variables: Record<string, unknown>,
  source: string | undefined,
): Record<string, unknown>[] {
  if (!source) return [];
  const v = variables[source];
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  return [];
}

export function Timeline({ config, variables }: WidgetRenderProps) {
  const cfg = (config ?? {}) as Cfg;
  const events = pickArray(variables ?? {}, cfg.source);

  if (events.length === 0) {
    return (
      <div
        className="border border-border-light bg-white p-3 text-[11px] text-muted-on-light"
        data-testid="timeline-empty"
      >
        Sem eventos. Configure `source` no inspector.
      </div>
    );
  }

  const tsKey = cfg.timestamp_key ?? 'timestamp';
  const labelKey = cfg.label_key ?? 'label';
  const kindKey = cfg.kind_key ?? 'kind';
  const actorKey = cfg.actor_key ?? 'actor';
  const maxItems = cfg.max_items ?? 50;
  const direction = cfg.direction ?? 'desc';

  const sorted = [...events].sort((a, b) => {
    const ta = String(getField(a, tsKey) ?? '');
    const tb = String(getField(b, tsKey) ?? '');
    return direction === 'desc' ? tb.localeCompare(ta) : ta.localeCompare(tb);
  });
  const visible = sorted.slice(0, maxItems);

  return (
    <ol
      className="bg-white border border-border-light"
      data-testid="timeline"
    >
      {visible.map((ev, i) => {
        const ts = getField(ev, tsKey) as string | undefined;
        const kindVal = getField(ev, kindKey);
        const actorVal = getField(ev, actorKey);
        let tsLabel = '—';
        if (ts) {
          try {
            tsLabel = formatDataHoraBR(ts);
          } catch {
            tsLabel = String(ts);
          }
        }
        return (
          <li
            key={i}
            className="flex items-start gap-2 px-3 py-2 border-b border-border-light last:border-b-0"
          >
            <Clock
              className="w-3 h-3 text-muted-on-light mt-1 shrink-0"
              strokeWidth={1.5}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono text-muted-on-light">{tsLabel}</p>
              <p className="text-[12px] text-text-on-light font-medium">
                {String(getField(ev, labelKey) ?? '—')}
              </p>
              <p className="text-[10px] text-muted-on-light">
                {kindVal != null && (
                  <span className="font-mono uppercase tracking-wide">
                    {String(kindVal)}
                  </span>
                )}
                {actorVal != null && (
                  <>
                    {kindVal != null && <span> · </span>}
                    <span>por {String(actorVal)}</span>
                  </>
                )}
              </p>
            </div>
            <ChevronRight
              className="w-3 h-3 text-muted-on-light shrink-0 mt-1"
              strokeWidth={1.5}
            />
          </li>
        );
      })}
      {sorted.length > visible.length && (
        <li className="px-3 py-1.5 text-[10px] font-mono text-muted-on-light bg-canvas-light">
          + {sorted.length - visible.length} eventos não mostrados (ajuste `max_items`)
        </li>
      )}
    </ol>
  );
}

const TIMELINE_MOCK_VARS = {
  audit: [
    {
      timestamp: '2026-05-23T10:30:00Z',
      label: 'Caso aberto',
      kind: 'create',
      actor: 'alice',
    },
    {
      timestamp: '2026-05-23T10:45:00Z',
      label: 'Atualização de severidade → alta',
      kind: 'update',
      actor: 'bob',
    },
    {
      timestamp: '2026-05-23T11:15:00Z',
      label: 'Ação executada: notificar BPM',
      kind: 'action.execute.success',
      actor: 'carol',
    },
  ],
};

registerWidget('timeline', Timeline, {
  group: 'content',
  label: 'Timeline (eventos)',
  icon: 'activity',
  description:
    'Lista cronológica de eventos. Útil para audit logs, sequência operacional, lineage por entidade.',
  mockConfig: {
    source: 'audit',
    direction: 'desc',
    max_items: 50,
  },
  mockVariables: TIMELINE_MOCK_VARS,
  config_schema: [
    {
      name: 'source',
      label: 'Dado de origem (lista de eventos)',
      description: 'Variável que devolve a lista de eventos a exibir.',
      field: 'variable-ref',
    },
    {
      name: 'timestamp_key',
      label: 'Propriedade de data/hora',
      description: 'Propriedade usada na linha do tempo (default: timestamp). Vem do contrato do tipo do dado de origem.',
      field: 'property',
      typeFrom: 'source',
    },
    {
      name: 'label_key',
      label: 'Propriedade do rótulo',
      description: 'Propriedade exibida como título do evento (default: label).',
      field: 'property',
      typeFrom: 'source',
    },
    {
      name: 'kind_key',
      label: 'Propriedade do tipo de evento',
      description: 'Propriedade mostrada como categoria (default: kind).',
      field: 'property',
      typeFrom: 'source',
    },
    {
      name: 'actor_key',
      label: 'Propriedade do autor',
      description: 'Propriedade mostrada como "por …" (default: actor).',
      field: 'property',
      typeFrom: 'source',
    },
    {
      name: 'max_items',
      label: 'Máximo de itens (default 50)',
      field: 'number',
    },
    {
      name: 'direction',
      label: 'Ordenação',
      description: 'Mais recente primeiro (desc) ou mais antigo primeiro (asc).',
      field: 'select',
      options: [
        { value: 'desc', label: 'Mais recente primeiro' },
        { value: 'asc', label: 'Mais antigo primeiro' },
      ],
    },
  ],
});
