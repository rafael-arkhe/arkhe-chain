'use client';

/**
 * Object Card widget — Sprint L7 (2026-05-23).
 *
 * Card compacto que renderiza UM objeto da ontologia (Person, Vehicle,
 * Place, Organization, Event…) com:
 *   - Header: ícone por kind + display_name + URN compacto
 *   - 3-5 props chave (configuráveis)
 *   - CTA "Abrir ficha" (link para /ficha/[id])
 *
 * Diferente de `object_view` (formulário com grupos verticais), o card
 * é tag-style horizontal pensado pra grids/loops e pra slot lateral em
 * pages 3-pane.
 *
 * Pesquisa R2 Slate · widgets/platform.md: Object Card é o pick #1 do
 * agente L0.1 — materializa "AIP-em-qualquer-painel" sem código.
 *
 * Config:
 *   - source: string         external_id da variable que tem o objeto
 *   - props?: string[]       lista de chaves a exibir (default top-5)
 *   - link_label?: string    rótulo da CTA (default "Abrir ficha")
 *   - link_template?: string templating com {{id}}, default "/ficha/{{id}}"
 */
import * as React from 'react';
import {
  ArrowUpRight,
  User,
  Car,
  MapPin,
  Building,
  Calendar,
  Hash,
} from 'lucide-react';
import Link from 'next/link';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  source?: string;
  props?: string[];
  link_label?: string;
  link_template?: string;
  show_link?: boolean;
};

const KIND_ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Person: User,
  Vehicle: Car,
  Place: MapPin,
  Organization: Building,
  Event: Calendar,
};

function pickObject(
  variables: Record<string, unknown>,
  bindings: Record<string, unknown>,
  source: string | undefined,
): Record<string, unknown> | null {
  if (!source) return null;
  // Objeto selecionado vive numa BINDING (não variável declarada) → fallback.
  const v = source in variables ? variables[source] : bindings[source];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function resolveLink(template: string, obj: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = obj[k];
    return v == null ? '' : String(v);
  });
}

export function ObjectCard({ config, variables, bindings }: WidgetRenderProps) {
  const cfg = (config ?? {}) as Cfg;
  const obj = pickObject(variables ?? {}, bindings ?? {}, cfg.source);

  if (!obj) {
    return (
      <div
        className="border border-border-light bg-white p-3 text-[11px] text-muted-on-light"
        data-testid="object-card-empty"
      >
        Sem objeto. Configure `source` no inspector.
      </div>
    );
  }

  const kind = (obj.kind ?? obj.type ?? 'Object') as string;
  const Icon = KIND_ICON[kind] ?? Hash;
  const displayName = (obj.display_name ?? obj.name ?? obj.label ?? 'Sem nome') as string;
  const urn = (obj.urn ?? obj.id ?? '') as string;

  // `props` é string[] hoje (FieldKind 'property' multi). Mas apps salvos antes
  // da migração podem ter `props` como string CSV (campo era 'string') — sem
  // normalizar, `.filter` numa string estoura TypeError no render. Normaliza:
  const rawProps = cfg.props as unknown;
  const allowedProps: string[] = Array.isArray(rawProps)
    ? (rawProps as string[])
    : typeof rawProps === 'string'
      ? rawProps.split(',').map((s) => s.trim()).filter(Boolean)
      : Object.keys(obj).slice(0, 5);
  const visible = allowedProps
    .filter(
      (k) =>
        !['display_name', 'name', 'label', 'urn', 'id', 'kind', 'type'].includes(k),
    )
    .slice(0, 5);

  const linkTemplate = cfg.link_template ?? '/ficha/{{id}}';
  const showLink = cfg.show_link !== false;
  const href = resolveLink(linkTemplate, obj);

  return (
    <div
      className="border border-border-light bg-white p-3 flex flex-col gap-2"
      data-testid="object-card"
    >
      <div className="flex items-start gap-2">
        <span className="inline-flex w-8 h-8 items-center justify-center bg-canvas-light border border-border-light shrink-0">
          <Icon className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-text-on-light truncate">
            {displayName}
          </p>
          <p className="text-[10px] font-mono text-muted-on-light truncate">
            {kind} · {String(urn).slice(0, 32)}
          </p>
        </div>
      </div>

      {visible.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          {visible.map((k) => (
            <React.Fragment key={k}>
              <dt className="text-[10px] uppercase tracking-wider text-muted-on-light truncate">
                {k}
              </dt>
              <dd className="text-[11px] text-text-on-light truncate">
                {obj[k] == null || obj[k] === '' ? '—' : String(obj[k])}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {showLink && href && (
        <Link
          href={href}
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline self-start"
          data-testid="object-card-link"
        >
          <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
          {cfg.link_label ?? 'Abrir ficha'}
        </Link>
      )}
    </div>
  );
}

const OBJECT_CARD_MOCK_VARS = {
  alvo: {
    id: 'ON-2026-00042',
    urn: 'aegis://node/Person/ON-2026-00042',
    kind: 'Person',
    display_name: 'João da Silva',
    cpf: '123.456.789-09',
    nascimento: '1987-04-12',
    cidade: 'São Paulo',
    risco: 'médio',
  },
};

registerWidget('object_card', ObjectCard, {
  group: 'content',
  label: 'Cartão de objeto',
  icon: 'id-card',
  description:
    'Card compacto de um nó da ontologia (Person/Vehicle/Place/Org/Event) com CTA pra ficha.',
  mockConfig: {
    source: 'alvo',
    show_link: true,
  },
  mockVariables: OBJECT_CARD_MOCK_VARS,
  config_schema: [
    {
      name: 'source',
      label: 'Dado de origem',
      description: 'Variável que contém o objeto a exibir.',
      field: 'variable-ref',
    },
    {
      name: 'props',
      label: 'Propriedades exibidas',
      description:
        'Escolhidas do contrato tipado do Object Type (resolvido pelo dado de origem).',
      field: 'property',
      multi: true,
      typeFrom: 'source',
    },
    {
      name: 'link_label',
      label: 'Rótulo do link',
      field: 'string',
    },
    {
      name: 'link_template',
      label: 'Template do link (usa {{prop}})',
      field: 'string',
    },
    {
      name: 'show_link',
      label: 'Mostrar link',
      field: 'boolean',
    },
  ],
});
