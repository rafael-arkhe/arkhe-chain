'use client';

import { useEffect } from 'react';
import { useClassification } from '@/lib/store';
import type { ClassificationLevel } from '@/lib/classification';
import { cn } from '@/lib/cn';

type Props = {
  /** string OU ReactNode — permite incluir InlineRename/badges no title
   *  sem precisar de header duplicado dentro do `children`. */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  classification?: ClassificationLevel;
  classificationLabel?: string;
  theme?: 'dark' | 'light';
  toolbar?: React.ReactNode;
  /** Sub-nav opcional (barra de abas) renderada ABAIXO do header — usada p/
   *  unir telas irmãs num explorador coeso (ex.: OntologiaTabs). */
  subnav?: React.ReactNode;
  /** LOTE3 — oculta a barra de título (h-12). Mantém subnav + children. O
   *  app vira dono total do espaço vertical (ex.: chat/canvas). A view
   *  canônica já não desenha header pra apps registrados; este flag remove
   *  ATÉ o header do próprio app. Default false. */
  hideHeader?: boolean;
  /** LOTE3 — quando false, centraliza os children numa coluna
   *  ``max-w-[1400px]``. Default true (ocupa toda a largura). */
  fullBleed?: boolean;
  children: React.ReactNode;
};

export function PageShell({
  title,
  subtitle,
  classification,
  classificationLabel,
  theme = 'dark',
  toolbar,
  subnav,
  hideHeader = false,
  fullBleed = true,
  children,
}: Props) {
  const setContext = useClassification((s) => s.setContext);

  useEffect(() => {
    if (classification) {
      setContext(classification, classificationLabel || '');
    }
  }, [classification, classificationLabel, setContext]);

  return (
    <div
      className={cn(
        'flex-1 flex flex-col overflow-hidden',
        theme === 'dark'
          ? 'bg-deep text-text-on-dark scope-dark'
          : 'bg-canvas-light text-text-on-light',
      )}
    >
      {!hideHeader && (
        <div
          data-testid="page-shell-header"
          className={cn(
            'h-12 px-4 flex items-center gap-3 border-b shrink-0',
            theme === 'dark' ? 'border-border-dark bg-panel-dark' : 'border-border-light bg-panel-light',
          )}
        >
          <div className="flex flex-col">
            <h1 className="text-[14px] font-semibold tracking-tight inline-flex items-center gap-2">
              {title}
            </h1>
            {subtitle && (
              <p
                className={cn(
                  'text-[11px] truncate',
                  theme === 'dark' ? 'text-muted-on-dark' : 'text-muted-on-light',
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
          {toolbar && <div className="ml-auto flex items-center gap-2">{toolbar}</div>}
        </div>
      )}
      {subnav}
      <div className="flex-1 overflow-hidden">
        {fullBleed ? (
          children
        ) : (
          <div className="mx-auto w-full max-w-[1400px] h-full">{children}</div>
        )}
      </div>
    </div>
  );
}
