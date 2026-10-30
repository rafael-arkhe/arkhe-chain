'use client';

/**
 * Onda I.3 — DependenciesPanel: renderiza o `dependency_graph` retornado
 * por `GET /marketplace/{id}/details` como uma árvore "produto → módulo /
 * recurso externo". Não é grafo SVG (overkill) — é hierárquico com chips.
 *
 * Também aceita `precheckGaps` pra destacar os requeridos faltando antes
 * mesmo do operador abrir o wizard.
 */
import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Network as NetworkIcon,
  Package,
} from 'lucide-react';
import type {
  MarketplaceDependencyGraph,
  MarketplaceInstallGap,
} from '@/lib/api';
import { cn } from '@/lib/cn';

export interface DependenciesPanelProps {
  graph: MarketplaceDependencyGraph | null | undefined;
  precheckGaps?: MarketplaceInstallGap[];
  testIdPrefix?: string;
}

export function DependenciesPanel({
  graph,
  precheckGaps,
  testIdPrefix = 'loja-deps',
}: DependenciesPanelProps): React.ReactElement | null {
  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return (
      <p
        data-testid={`${testIdPrefix}-empty`}
        className="text-[11.5px] text-muted-on-light italic"
      >
        Sem dependências declaradas.
      </p>
    );
  }

  const productNode = graph.nodes.find((n) => n.kind === 'product');
  const moduleNodes = graph.nodes.filter((n) => n.kind === 'modulo');
  const externalNodes = graph.nodes.filter((n) => n.kind === 'recurso_externo');

  const gapSet = new Set(
    (precheckGaps ?? [])
      .filter((g) => g.tipo === 'modulo')
      .map((g) => g.nome),
  );

  return (
    <div
      data-testid={`${testIdPrefix}-tree`}
      className="space-y-2 text-[11.5px] text-text-on-light"
    >
      {productNode && (
        <div className="flex items-center gap-2">
          <Cpu
            className="w-3.5 h-3.5 text-primary"
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="font-semibold">{productNode.label}</span>
        </div>
      )}

      {moduleNodes.length > 0 && (
        <div data-testid={`${testIdPrefix}-modules`} className="pl-4 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            Módulos dependentes
          </p>
          {moduleNodes.map((n) => {
            const slug = n.id.replace(/^mod:/, '');
            const blocking = gapSet.has(slug);
            return (
              <div
                key={n.id}
                data-testid={`${testIdPrefix}-node-${slug}`}
                className={cn(
                  'flex items-start gap-2 px-2 py-1 border',
                  blocking
                    ? 'bg-warning/10 border-warning'
                    : 'bg-canvas-light border-border-light',
                )}
              >
                <Package
                  className={cn(
                    'w-3 h-3 mt-[2px] shrink-0',
                    blocking ? 'text-warning' : 'text-primary',
                  )}
                  strokeWidth={1.5}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold">{n.label}</span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 border bg-canvas-light text-muted-on-light border-border-light">
                      {n.status ?? 'opcional'}
                    </span>
                    {blocking ? (
                      <span className="text-[10px] text-warning flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                        precisa instalar
                      </span>
                    ) : (
                      <span className="text-[10px] text-success flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                        ok
                      </span>
                    )}
                  </div>
                  {n.motivo && (
                    <p className="text-[11px] text-muted-on-light mt-0.5">
                      {n.motivo}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {externalNodes.length > 0 && (
        <div data-testid={`${testIdPrefix}-externals`} className="pl-4 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            Recursos externos
          </p>
          {externalNodes.map((n) => (
            <div
              key={n.id}
              data-testid={`${testIdPrefix}-ext-${n.id.replace(/[^a-z0-9]+/gi, '-')}`}
              className="flex items-start gap-2 px-2 py-1 bg-canvas-light border border-border-light"
            >
              <NetworkIcon
                className="w-3 h-3 mt-[2px] shrink-0 text-primary"
                strokeWidth={1.5}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <span className="font-semibold">{n.label}</span>
                {n.custo_aprox && (
                  <span className="ml-2 text-[10px] text-muted-on-light">
                    · custo: {n.custo_aprox}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
