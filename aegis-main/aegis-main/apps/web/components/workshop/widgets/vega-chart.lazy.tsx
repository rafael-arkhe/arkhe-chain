'use client';

/**
 * Registro LAZY do widget `vega_chart`. PERF #5 (2026-06-28).
 *
 * O barrel `widgets/index.ts` importa ESTE arquivo (leve) em vez de
 * `./vega-chart`. A META (`VEGA_META`) fica registrada EAGER — a paleta lista
 * o widget normalmente —, mas o COMPONENTE e o bundle pesado do Vega
 * (`vega-embed` → `vega-canvas`) só entram via `next/dynamic` (ssr:false)
 * quando um `vega_chart` de fato renderiza.
 *
 * `ssr:false` também exclui o vega do build do SERVER, eliminando a resolução
 * de `vega-canvas/build/vega-canvas.node.js` → `Module not found: Can't
 * resolve 'canvas'` (o resto é tratado em `next.config.mjs`).
 */
import dynamic from 'next/dynamic';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { useT } from '@/lib/i18n/provider';
import { VEGA_META } from './vega-chart.meta';

function VegaChartLoading() {
  const t = useT();
  return (
    <div
      data-testid="vega-chart-loading"
      className="bg-white border border-border-light p-3 text-caption text-muted-on-light italic"
    >
      {t('vega.loading')}
    </div>
  );
}

const VegaChartDynamic = dynamic(
  () => import('./vega-chart').then((m) => m.VegaChart),
  { ssr: false, loading: () => <VegaChartLoading /> },
);

/** Wrapper fino → o componente registrado é um `ComponentType<WidgetRenderProps>`
 *  normal (mesmo padrão de `network_graph`/`globe_live`). */
function VegaChartLazy(props: WidgetRenderProps) {
  return <VegaChartDynamic {...props} />;
}

registerWidget('vega_chart', VegaChartLazy, VEGA_META);

export { VegaChartLazy };
