'use client';

/**
 * Onda I.3 — datasources consumidos pelo produto.
 *
 * Variant "compact" pro card de catálogo, "full" pro detail pane com
 * obrigatório/opcional e observações por linha.
 */
import * as React from 'react';
import { Database } from 'lucide-react';
import type { MarketplaceDatasource } from '@/lib/api';
import { cn } from '@/lib/cn';

const TIPO_LABEL: Record<string, string> = {
  postgres: 'Postgres',
  minio: 'MinIO',
  qdrant: 'Qdrant',
  redis: 'Redis',
  external_api: 'API externa',
};

export interface DataSourceListProps {
  datasources: MarketplaceDatasource[];
  variant?: 'compact' | 'full';
  maxVisible?: number;
  testIdPrefix?: string;
}

export function DataSourceList({
  datasources,
  variant = 'compact',
  maxVisible = 2,
  testIdPrefix = 'loja-datasource',
}: DataSourceListProps): React.ReactElement | null {
  if (!datasources || datasources.length === 0) {
    return variant === 'full' ? (
      <p
        data-testid={`${testIdPrefix}-empty`}
        className="text-[11.5px] text-muted-on-light italic"
      >
        Não declara datasources adicionais.
      </p>
    ) : null;
  }

  if (variant === 'compact') {
    const visible = datasources.slice(0, maxVisible);
    const overflow = datasources.length - visible.length;
    return (
      <div
        data-testid={`${testIdPrefix}-chips`}
        className="flex flex-wrap items-center gap-1"
      >
        {visible.map((d) => (
          <span
            key={d.nome}
            data-testid={`${testIdPrefix}-chip-${slug(d.nome)}`}
            className={cn(
              'h-5 px-1.5 text-[10px] flex items-center gap-1 border',
              d.obrigatorio
                ? 'bg-warning text-text-on-light border-warning'
                : 'bg-canvas-light text-text-on-light border-border-light',
            )}
            title={`${d.nome} (${d.tipo}) — ${
              d.obrigatorio ? 'obrigatório' : 'opcional'
            }`}
          >
            <Database className="w-2.5 h-2.5" strokeWidth={1.5} aria-hidden />
            {TIPO_LABEL[d.tipo] ?? d.tipo}
          </span>
        ))}
        {overflow > 0 && (
          <span
            data-testid={`${testIdPrefix}-overflow`}
            className="h-5 px-1.5 text-[10px] bg-canvas-light text-text-on-light border border-border-light flex items-center"
          >
            +{overflow}
          </span>
        )}
      </div>
    );
  }

  return (
    <ul
      data-testid={`${testIdPrefix}-full`}
      className="space-y-1.5"
    >
      {datasources.map((d) => (
        <li
          key={d.nome}
          data-testid={`${testIdPrefix}-full-${slug(d.nome)}`}
          className={cn(
            'flex items-start gap-2 text-[11.5px] text-text-on-light',
            'bg-canvas-light border border-border-light px-2 py-1.5',
          )}
        >
          <Database
            className={cn(
              'w-3 h-3 mt-[2px] shrink-0',
              d.obrigatorio ? 'text-warning' : 'text-muted-on-light',
            )}
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{d.nome}</span>
              <span className="text-[10px] font-mono text-muted-on-light">
                {TIPO_LABEL[d.tipo] ?? d.tipo}
              </span>
              <span
                className={cn(
                  'text-[10px] uppercase tracking-wider px-1.5 border',
                  d.obrigatorio
                    ? 'bg-warning text-text-on-light border-warning'
                    : 'bg-canvas-light text-muted-on-light border-border-light',
                )}
              >
                {d.obrigatorio ? 'Obrigatório' : 'Opcional'}
              </span>
            </div>
            {d.observacoes && (
              <p className="text-[11px] text-muted-on-light mt-0.5">
                {d.observacoes}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
