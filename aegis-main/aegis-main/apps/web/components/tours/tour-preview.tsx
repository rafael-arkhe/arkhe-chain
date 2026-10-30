'use client';

/**
 * <TourPreview /> — Wave H.1 (2026-05-23).
 *
 * Overlay de pré-visualização do Tour para o operador validar antes de
 * publicar/ativar. Renderiza os pages como slides full-overlay com:
 *   - número do slide (n/total) · título · descrição · media/doc links
 *   - botões Anterior / Próximo / Sair
 *   - barra de progresso
 *   - se `target_selector` está definido: scrolla o elemento na página
 *     hospedeira e desenha um spotlight ao redor (modo "in-page")
 *
 * Pode ser disparado:
 *   - dentro do TourEditor (botão "Pré-visualizar") — preview-only, não
 *     marca seen
 *   - dentro do TourRunner runtime — marca seen no final/dismiss
 *
 * Honra DS:
 *   - feedback_no_rounded_no_sparkles · sharp edges · sem rounded-*
 *   - feedback_no_emojis_in_ui · zero emoji · ícones lucide-react
 *   - aria-live="polite" no contador, aria-modal no overlay
 */
import * as React from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import type { WorkspaceUpdatePage } from '@/lib/api';

interface TourPreviewProps {
  title: string;
  summary?: string | null;
  pages: WorkspaceUpdatePage[] | LocalPage[];
  /** Quando true, NÃO chama markSeen ao final (modo preview puro). */
  previewOnly?: boolean;
  onClose: () => void;
  onComplete?: () => void;
  /** Quando true, ativa loop automático (auto-advance). */
  autoAdvanceMs?: number;
}

interface LocalPage {
  title: string;
  description?: string | null;
  media_url?: string | null;
  documentation_url?: string | null;
  target_selector?: string | null;
}

export function TourPreview({
  title,
  summary,
  pages,
  previewOnly = true,
  onClose,
  onComplete,
  autoAdvanceMs,
}: TourPreviewProps) {
  const [idx, setIdx] = React.useState(0);
  const visiblePages = React.useMemo(
    () => (pages as LocalPage[]).filter((p) => p.title && p.title.trim()),
    [pages],
  );
  const total = visiblePages.length;
  const current = visiblePages[idx];

  // Wave H.1: auto-advance opcional (slide_loop).
  React.useEffect(() => {
    if (!autoAdvanceMs || autoAdvanceMs < 1000 || total <= 1) return;
    const t = window.setTimeout(() => {
      setIdx((cur) => (cur + 1) % total);
    }, autoAdvanceMs);
    return () => window.clearTimeout(t);
  }, [autoAdvanceMs, idx, total]);

  // Keyboard nav (Esc = close, ArrowLeft/Right = nav).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        setIdx((cur) => Math.max(0, cur - 1));
      } else if (e.key === 'ArrowRight') {
        setIdx((cur) => Math.min(total - 1, cur + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [total, onClose]);

  // Spotlight: scroll target element into view + draw outline.
  const [spotlightRect, setSpotlightRect] = React.useState<DOMRect | null>(null);
  React.useEffect(() => {
    if (!current?.target_selector) {
      setSpotlightRect(null);
      return;
    }
    try {
      const el = document.querySelector(current.target_selector) as HTMLElement | null;
      if (!el) {
        setSpotlightRect(null);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Delay measurement to allow scroll to settle.
      const t = window.setTimeout(() => {
        setSpotlightRect(el.getBoundingClientRect());
      }, 250);
      return () => window.clearTimeout(t);
    } catch {
      setSpotlightRect(null);
    }
  }, [idx, current?.target_selector]);

  if (total === 0) {
    return (
      <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        data-testid="tour-preview-empty"
        className="fixed inset-0 z-50 flex items-center justify-center p-12 ds-overlay"
        onClick={onClose}
      >
        <div
          className="w-full max-w-[480px] bg-white border border-border-light shadow-2xl p-6 space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[12px] text-muted-on-light italic">
            Nenhuma página configurada para pré-visualizar.
          </p>
          <button
            type="button"
            onClick={onClose}
            data-testid="tour-preview-close"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
          >
            Fechar
          </button>
        </div>
      </div>
      </ModalPortal>
    );
  }

  const advance = () => {
    if (idx < total - 1) {
      setIdx(idx + 1);
    } else {
      onComplete?.();
      onClose();
    }
  };

  const back = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Pré-visualização do tour ${title}`}
      data-testid="tour-preview"
      className="fixed inset-0 z-50 ds-overlay"
    >
      {/* Spotlight outline (driver.js-like). */}
      {spotlightRect && (
        <div
          data-testid="tour-preview-spotlight"
          aria-hidden
          className="fixed pointer-events-none border-2 border-primary"
          style={{
            top: Math.max(0, spotlightRect.top - 6),
            left: Math.max(0, spotlightRect.left - 6),
            width: spotlightRect.width + 12,
            height: spotlightRect.height + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          }}
        />
      )}

      {/* Slide card. */}
      <div
        data-testid="tour-preview-card"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[560px] bg-white border border-border-light shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-on-light flex-1">
            {previewOnly ? 'Pré-visualização' : 'Tour'} · {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sair do tour"
            data-testid="tour-preview-exit"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <div
            data-testid="tour-preview-counter"
            aria-live="polite"
            className="text-[10px] font-mono text-muted-on-light"
          >
            Passo {idx + 1} de {total}
          </div>
          <h3
            data-testid="tour-preview-title"
            className="text-[15px] font-semibold text-text-on-light"
          >
            {current.title}
          </h3>
          {current.description && (
            <p
              data-testid="tour-preview-desc"
              className="text-[12.5px] text-text-on-light whitespace-pre-wrap"
            >
              {current.description}
            </p>
          )}
          {current.media_url && (
            <a
              href={current.media_url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="tour-preview-media"
              className="inline-flex items-center gap-1.5 text-[11px] bg-canvas-light border border-border-light px-2 h-7 hover:border-primary text-text-on-light"
            >
              <ImageIcon className="w-3 h-3" strokeWidth={1.5} />
              Abrir mídia
            </a>
          )}
          {current.documentation_url && (
            <a
              href={current.documentation_url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="tour-preview-doc"
              className="inline-flex items-center gap-1.5 text-[11px] bg-canvas-light border border-border-light px-2 h-7 hover:border-primary text-text-on-light ml-2"
            >
              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
              Documentação
            </a>
          )}
          {summary && idx === 0 && (
            <p className="text-[11px] text-muted-on-light italic border-t border-border-light pt-2">
              {summary}
            </p>
          )}
        </div>

        {/* Progress bar. */}
        <div className="h-1 bg-canvas-light border-t border-border-light">
          <div
            data-testid="tour-preview-progress"
            className="h-full bg-primary"
            style={{ width: `${((idx + 1) / total) * 100}%` }}
          />
        </div>

        <footer className="px-4 py-2 border-t border-border-light flex items-center gap-2">
          <button
            type="button"
            onClick={back}
            disabled={idx === 0}
            data-testid="tour-preview-prev"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary disabled:opacity-40 flex items-center gap-1.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
            Anterior
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={advance}
            data-testid="tour-preview-next"
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5"
          >
            {idx < total - 1 ? 'Próximo' : 'Concluir'}
            {idx < total - 1 && <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />}
          </button>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}
