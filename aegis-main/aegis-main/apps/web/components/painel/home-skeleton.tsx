'use client';

/**
 * Skeleton da Home — preenche o `<main>` enquanto useResolvedApp()
 * resolve a versão do template (backend → cache → fallback).
 *
 * Espelha a estrutura visível da home publicada (5 KPIs + linha
 * mid com mini-map / alertas / câmeras / contagens + linha do tempo)
 * pra evitar layout-shift quando o conteúdo real entra.
 */
export function HomeSkeleton() {
  return (
    <div
      data-testid="home-skeleton"
      aria-hidden="true"
      className="grid gap-3 p-4 animate-pulse"
      style={{ gridTemplateColumns: 'repeat(20, minmax(0, 1fr))' }}
    >
      {/* Linha 1 — 5 KPI cards (col-span 4 cada) */}
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonBlock key={`kpi-${i}`} colSpan={4} className="h-[110px]" />
      ))}

      {/* Linha 2 — 4 widgets mid (col-span 5 cada) */}
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBlock key={`mid-${i}`} colSpan={5} className="h-[460px]" />
      ))}

      {/* Linha 3 — timeline full-width */}
      <SkeletonBlock colSpan={20} className="h-[340px]" />
    </div>
  );
}

function SkeletonBlock({
  colSpan,
  className = '',
}: {
  colSpan: number;
  className?: string;
}) {
  return (
    <div
      style={{ gridColumn: `span ${colSpan}` }}
      className={`relative bg-panel-light border border-border-light overflow-hidden ${className}`}
    >
      {/* Header simulado */}
      <div className="px-3 pt-3 flex items-center gap-2">
        <div className="w-3 h-3 bg-border-light" />
        <div className="h-2 bg-border-light w-24" />
        <div className="ml-auto h-2 bg-border-light w-12" />
      </div>
      {/* Corpo simulado — 3 linhas de "conteúdo" */}
      <div className="absolute inset-x-3 bottom-3 space-y-2">
        <div className="h-2 bg-border-light w-3/5" />
        <div className="h-2 bg-border-light w-4/5" />
        <div className="h-2 bg-border-light w-2/5" />
      </div>
    </div>
  );
}
