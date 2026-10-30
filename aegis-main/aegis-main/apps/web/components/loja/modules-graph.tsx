'use client';

/**
 * Onda I.3 — visualização tabular dos módulos AEGIS dependentes do produto.
 *
 * Mostra status (requerido/opcional) + estado atual (instalado/faltando)
 * por módulo. Quando um requerido está faltando, pinta em warning para
 * o operador entender o gap antes de tentar instalar.
 *
 * Não é um grafo SVG — é uma lista densa com badge de status. O grafo
 * de dependências completo (DependenciesPanel) faz o papel "visual".
 */
import * as React from 'react';
import { AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import type { MarketplaceModuleDep } from '@/lib/api';
import { cn } from '@/lib/cn';

export interface ModulesGraphProps {
  modulos: MarketplaceModuleDep[];
  /** Conjunto de slugs de módulos atualmente instalados/nativos. */
  installedSlugs: Set<string>;
  testIdPrefix?: string;
}

export function ModulesGraph({
  modulos,
  installedSlugs,
  testIdPrefix = 'loja-modules',
}: ModulesGraphProps): React.ReactElement | null {
  if (!modulos || modulos.length === 0) {
    return (
      <p
        data-testid={`${testIdPrefix}-empty`}
        className="text-[11.5px] text-muted-on-light italic"
      >
        Não declara módulos como pré-requisito.
      </p>
    );
  }

  return (
    <ul data-testid={`${testIdPrefix}-list`} className="space-y-1.5">
      {modulos.map((m) => {
        const isInstalled = installedSlugs.has(m.modulo);
        const isRequired = m.status === 'requerido';
        const isBlocking = isRequired && !isInstalled;
        return (
          <li
            key={m.modulo}
            data-testid={`${testIdPrefix}-item-${m.modulo}`}
            data-status={isBlocking ? 'blocking' : isInstalled ? 'ok' : 'optional-missing'}
            className={cn(
              'flex items-start gap-2 text-[11.5px] text-text-on-light',
              'px-2 py-1.5 border',
              isBlocking
                ? 'bg-warning/10 border-warning'
                : 'bg-canvas-light border-border-light',
            )}
          >
            <Package
              className={cn(
                'w-3 h-3 mt-[2px] shrink-0',
                isBlocking ? 'text-warning' : 'text-primary',
              )}
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-semibold">{m.modulo}</span>
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-wider px-1.5 border',
                    isRequired
                      ? 'bg-warning text-text-on-light border-warning'
                      : 'bg-canvas-light text-muted-on-light border-border-light',
                  )}
                >
                  {isRequired ? 'Requerido' : 'Opcional'}
                </span>
                {isInstalled ? (
                  <span
                    data-testid={`${testIdPrefix}-installed-${m.modulo}`}
                    className="text-[10px] text-success flex items-center gap-0.5"
                  >
                    <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                    instalado
                  </span>
                ) : (
                  <span
                    data-testid={`${testIdPrefix}-missing-${m.modulo}`}
                    className={cn(
                      'text-[10px] flex items-center gap-0.5',
                      isBlocking ? 'text-warning' : 'text-muted-on-light',
                    )}
                  >
                    <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                    {isBlocking ? 'precisa instalar' : 'não instalado'}
                  </span>
                )}
              </div>
              {m.motivo && (
                <p className="text-[11px] text-muted-on-light mt-0.5">
                  {m.motivo}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
