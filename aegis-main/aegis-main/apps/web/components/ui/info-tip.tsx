'use client';

/**
 * InfoTip — dica de campo (tooltip) leve, sem dependência externa.
 *
 * UX calibrada (ux-clarity-first): cada campo técnico ganha um ícone de ajuda
 * que, no hover/focus, mostra uma instrução curta na linguagem do operador.
 *
 * #14 (fix do operador) — o tooltip era `absolute` dentro do painel: estourava
 * a largura e era CLIPADO pelo overflow do painel ("comia metade, não dava pra
 * ler"). Agora renderiza num PORTAL com posição `fixed` clampada ao viewport —
 * nunca clipa, nunca sai da tela. Sharp, sem emoji, acessível (botão focável +
 * aria-label sempre presente).
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

const TIP_W = 256;
const MARGIN = 8;

export function InfoTip({ text, label }: { text: string; label?: string }) {
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    let left = r.left;
    if (left + TIP_W > window.innerWidth - MARGIN) left = window.innerWidth - TIP_W - MARGIN;
    if (left < MARGIN) left = MARGIN;
    setPos({ top: r.bottom + 4, left });
  };
  const hide = () => setPos(null);

  return (
    <span className="inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        tabIndex={0}
        aria-label={label || text}
        className="text-muted-on-light hover:text-primary focus:text-primary outline-none"
        data-testid="info-tip"
        onClick={(e) => e.preventDefault()}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <HelpCircle className="w-3 h-3" strokeWidth={1.5} />
      </button>
      {pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            role="tooltip"
            data-testid="info-tip-content"
            style={{ top: pos.top, left: pos.left, width: TIP_W }}
            className="pointer-events-none fixed z-[100] border border-border-light bg-white px-2 py-1.5 text-[11px] leading-snug text-text-on-light shadow-md"
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
