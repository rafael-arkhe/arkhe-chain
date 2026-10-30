'use client';

/**
 * FloatingPopover — primitivo ÚNICO de popover/dropdown ancorado (ELO popovers).
 *
 * Substitui os popovers ad-hoc (Composer "+"/"Ferramentas", MultiselectField
 * de /buscar, …) por um comportamento correto e consistente:
 *
 *   - PORTAL para `document.body` → escapa QUALQUER `overflow` de ancestral
 *     (a área de mensagens do chat e a busca avançada têm overflow).
 *   - `position: fixed` ancorado ao gatilho (placement top/bottom + align
 *     start/end), reposicionado em `resize`.
 *   - Fecha em ESC e em mousedown FORA (do popover E do gatilho).
 *   - CRÍTICO — scroll: se o evento veio de DENTRO do popover
 *     (`popRef.contains(e.target)`) → NÃO fecha (deixa a lista rolar); senão
 *     → REPOSICIONA (também não fecha). Isto mata o bug em que rolar a lista
 *     "Ferramentas" ou a lista de sites fechava o popover.
 *   - Conteúdo recebe `max-height` (default `min(70vh, 520px)`) +
 *     `overflow-y-auto` (`scrollbar-hide`), então nunca estoura a viewport.
 *   - Foco no 1º item interativo ao abrir (nav por teclado).
 *
 * Invariantes DS ("A Sala de Situação Clara"):
 *   - cantos retos (0px — borderRadius zerado no tailwind.config); SEM rounded-*
 *   - sombra declarada localmente, sem depender de classes legadas de sombra.
 *   - superfície analítica clara explícita (`bg-canvas-light text-text-on-light`)
 *     porque o portal sai da superfície e herdaria a cor do <body>.
 *   - sem glassmorphism / backdrop-blur.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/cn';

export interface FloatingPopoverProps {
  /** Aberto? Quando false o portal não monta (nada no DOM). */
  open: boolean;
  /** Pedido de fechamento (ESC / clique-fora). O dono controla o estado. */
  onClose: () => void;
  /** Ref do gatilho — origem da ancoragem e exceção do clique-fora. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Acima ('top') ou abaixo ('bottom', default) do gatilho. */
  placement?: 'top' | 'bottom';
  /** Alinhamento horizontal à borda esquerda ('start') ou direita ('end'). */
  align?: 'start' | 'end';
  /** Folga (px) entre o gatilho e o popover. Default 6. */
  offset?: number;
  /** Casa a LARGURA do popover com a do gatilho (usa `minWidth` como piso). */
  matchTriggerWidth?: boolean;
  /** Largura mínima (px). Com `matchTriggerWidth`, vira o piso de `max()`. */
  minWidth?: number;
  /** Altura máxima do corpo rolável. Default `min(70vh, 520px)`. */
  maxHeight?: string;
  /** z-index do popover. Default 60. */
  zIndex?: number;
  /** Papel ARIA do container. Omitido → sem atributo. */
  role?: 'menu' | 'group' | 'listbox' | 'dialog';
  ariaLabel?: string;
  /** data-testid do container (popRef). */
  testId?: string;
  /** Cabeçalho FIXO (não rola) — ex.: busca + templates do multiselect. */
  header?: React.ReactNode;
  /** Corpo ROLÁVEL — recebe max-h + overflow-y-auto. */
  children: React.ReactNode;
  /** Classe extra no container externo. */
  className?: string;
  /** Classe extra no corpo rolável. */
  bodyClassName?: string;
  /** data-testid do corpo rolável. */
  bodyTestId?: string;
  /** Foca o 1º item interativo ao abrir (default true). */
  autoFocus?: boolean;
}

type Rect = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width?: number;
};

export function FloatingPopover({
  open,
  onClose,
  anchorRef,
  placement = 'bottom',
  align = 'start',
  offset = 6,
  matchTriggerWidth = false,
  minWidth,
  maxHeight = 'min(70vh, 520px)',
  zIndex = 60,
  role,
  ariaLabel,
  testId,
  header,
  children,
  className,
  bodyClassName,
  bodyTestId,
  autoFocus = true,
}: FloatingPopoverProps) {
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);

  // `autoFocus` lido via ref — o callback-ref de foco é estável (roda no commit).
  const autoFocusRef = React.useRef(autoFocus);
  autoFocusRef.current = autoFocus;

  const reposition = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const next: Rect = {};
    if (placement === 'top') {
      // ancora o RODAPÉ do popover `offset`px acima do topo do gatilho.
      next.bottom = Math.max(8, window.innerHeight - r.top + offset);
    } else {
      next.top = r.bottom + offset;
    }
    if (align === 'end') {
      next.right = Math.max(8, window.innerWidth - r.right);
    } else {
      next.left = r.left;
    }
    if (matchTriggerWidth) {
      next.width = Math.max(r.width, minWidth ?? 0);
    }
    setRect(next);
  }, [anchorRef, placement, align, offset, matchTriggerWidth, minWidth]);

  React.useEffect(() => {
    if (!open) return;
    reposition();

    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        anchorRef.current?.focus?.();
      }
    };
    // CRÍTICO: scroll de DENTRO do popover NÃO fecha (deixa rolar). Scroll de
    // qualquer ancestral apenas REPOSICIONA — nunca fecha. O `instanceof Node`
    // protege o caso em que `e.target` é o `window`/`document` (não é Node em
    // jsdom) — sem isso `contains()` lançaria.
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && popRef.current?.contains(target)) return;
      reposition();
    };

    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    // capture:true → enxerga o scroll de QUALQUER ancestral com overflow.
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, reposition, onClose, anchorRef]);

  // Foco gerenciado: ao montar o conteúdo (callback-ref roda após os filhos
  // estarem no DOM), foca o 1º item interativo.
  const setPopNode = React.useCallback((node: HTMLDivElement | null) => {
    popRef.current = node;
    if (node && autoFocusRef.current) {
      const first = node.querySelector<HTMLElement>(
        'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      (first ?? node).focus?.();
    }
  }, []);

  if (!open || !rect || typeof document === 'undefined') return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex,
    maxHeight,
    ...(rect.top !== undefined ? { top: rect.top } : {}),
    ...(rect.bottom !== undefined ? { bottom: rect.bottom } : {}),
    ...(rect.left !== undefined ? { left: rect.left } : {}),
    ...(rect.right !== undefined ? { right: rect.right } : {}),
    ...(rect.width !== undefined ? { width: rect.width } : {}),
    ...(!matchTriggerWidth && minWidth ? { minWidth } : {}),
  };

  return createPortal(
    <div
      ref={setPopNode}
      role={role}
      tabIndex={-1}
      aria-label={ariaLabel}
      data-testid={testId}
      data-floating-popover="true"
      style={style}
      className={cn(
        'flex flex-col overflow-hidden border border-border-light bg-canvas-light text-text-on-light shadow-[0_12px_28px_rgba(15,23,42,0.16)] outline-none',
        className,
      )}
    >
      {header}
      <div
        data-testid={bodyTestId}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto scrollbar-hide',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
