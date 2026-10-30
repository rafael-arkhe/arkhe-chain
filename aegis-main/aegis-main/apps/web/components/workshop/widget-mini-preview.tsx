'use client';

/**
 * MiniWidgetPreview — renderiza um widget em sandbox usando seus
 * `mockVariables`/`mockConfig`, escalado pra caber em containers
 * pequenos (thumb na paleta, popover de hover).
 *
 * Duas estratégias de fit:
 *   - `fit="width"`  (default thumb)  — escala pela largura, conteúdo
 *     que estoura por baixo é cropado. Aparência de screenshot.
 *   - `fit="both"`   (popover)        — escala pra caber largura E
 *     altura. Mostra o widget inteiro, com letterbox se aspect diferir.
 *
 * `transform-origin: top left` mantém o widget alinhado pelo canto
 * superior — não há corte invisível no topo.
 *
 * Sem mock → cai pro placeholder discreto (icon + label).
 */
import * as React from 'react';
import { cn } from '@/lib/cn';
import {
  getWidgetComponent,
  getWidgetMeta,
} from '@/components/workshop/WorkshopV2Renderer';
import { iconByName } from '@/lib/icon-by-name';

const BASE_WIDTH = 320;

type Props = {
  type: string;
  /** Altura visível do thumb. Ignorada quando fit="natural". */
  height?: number;
  /**
   * - `width`   (default thumb) escala pra preencher largura, croppa overflow vertical.
   * - `both`    escala pra caber largura E altura (letterbox).
   * - `natural` zero scaling — widget renderiza tamanho real (BASE_WIDTH × auto).
   *             Container cresce com o conteúdo; pai pode limitar via max-height.
   */
  fit?: 'width' | 'both' | 'natural';
  className?: string;
};

export function MiniWidgetPreview({
  type,
  height,
  fit = 'width',
  className,
}: Props) {
  const Component = getWidgetComponent(type);
  const meta = getWidgetMeta(type);
  const outerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(fit === 'natural' ? 1 : 0);

  React.useEffect(() => {
    if (fit === 'natural') {
      setScale(1);
      return;
    }
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const recalc = () => {
      const outerRect = outer.getBoundingClientRect();
      const ow = outerRect.width;
      const oh = outerRect.height;
      if (ow <= 0 || oh <= 0) return;
      const ih = inner.scrollHeight || BASE_WIDTH;
      const sw = ow / BASE_WIDTH;
      const sh = oh / ih;
      const s = fit === 'both' ? Math.min(sw, sh, 1) : Math.min(sw, 1);
      setScale(s);
    };

    recalc();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(recalc);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [fit]);

  const hasMock = !!(meta?.mockVariables || meta?.mockConfig);
  if (!Component || !hasMock) {
    return (
      <PlaceholderThumb type={type} height={height ?? 64} className={className} />
    );
  }

  // Modo natural: widget no tamanho declarado (meta.previewWidth/Height).
  // `previewHeight` é obrigatório pra widgets com h-full na raiz (senão
  // colapsam); pra os demais fica auto.
  //
  // IMPORTANTE: `surface-light` força bg+texto claro no escopo. O body
  // global tem `text-text-on-dark` (branco), então widgets que não
  // declaram cor explícita herdam branco e somem no preview.
  if (fit === 'natural') {
    const previewW = meta.previewWidth ?? BASE_WIDTH;
    const previewH = meta.previewHeight;
    return (
      <div
        className={cn('surface-light', className)}
        style={{ width: previewW, height: previewH }}
        aria-hidden="true"
      >
        <div
          className="pointer-events-none select-none"
          style={{ width: previewW, height: previewH }}
        >
          <Component
            appId="palette-preview"
            config={meta.mockConfig ?? {}}
            variables={meta.mockVariables ?? {}}
            bindings={{}}
            setBinding={() => {}}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={outerRef}
      className={cn(
        'relative overflow-hidden surface-light border border-border-light',
        className,
      )}
      style={{ height }}
      aria-hidden="true"
    >
      <div
        ref={innerRef}
        className="absolute top-0 left-0 pointer-events-none select-none"
        style={{
          width: BASE_WIDTH,
          transform: `scale(${scale || 0.0001})`,
          transformOrigin: 'top left',
          visibility: scale > 0 ? 'visible' : 'hidden',
        }}
      >
        <Component
          appId="palette-preview"
          config={meta.mockConfig ?? {}}
          variables={meta.mockVariables ?? {}}
          bindings={{}}
          setBinding={() => {}}
        />
      </div>
    </div>
  );
}

function PlaceholderThumb({
  type,
  height,
  className,
}: {
  type: string;
  height: number;
  className?: string;
}) {
  const meta = getWidgetMeta(type);
  const Icon = iconByName(meta?.icon ?? 'square');
  return (
    <div
      className={cn(
        'relative bg-raised-light/40 border border-dashed border-border-light flex flex-col items-center justify-center gap-1 px-2',
        className,
      )}
      style={{ height }}
      aria-hidden="true"
    >
      <Icon className="w-4 h-4 text-muted-on-light/50" strokeWidth={1.5} />
      <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-on-light/60 text-center leading-tight">
        {meta?.label ?? type}
      </p>
    </div>
  );
}
