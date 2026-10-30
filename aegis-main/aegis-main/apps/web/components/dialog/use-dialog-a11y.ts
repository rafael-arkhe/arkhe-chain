'use client';

/**
 * useDialogA11y — Sprint UX-4.3 (2026-05-22).
 *
 * Hook reusável para dialogs/popovers:
 *   - Escape key fecha
 *   - Focus trap: Tab cicla dentro do dialog
 *   - Autofocus no primeiro tabable
 *   - Restaura focus ao elemento anterior ao fechar
 *
 * Uso:
 *   const ref = useDialogA11y({ open, onClose });
 *   <div ref={ref} role="dialog" aria-modal="true">...</div>
 */
import * as React from 'react';

interface Options {
  open: boolean;
  onClose: () => void;
  /** Se ``false``, Escape não fecha (use para confirm crítico). */
  closeOnEsc?: boolean;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y({
  open,
  onClose,
  closeOnEsc = true,
}: Options): React.MutableRefObject<HTMLDivElement | null> {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    lastFocusedRef.current = (document.activeElement as HTMLElement) ?? null;

    const node = ref.current;
    if (!node) return;

    // Autofocus first focusable inside the dialog.
    const focusables = Array.from(
      node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    const first = focusables[0];
    if (first) {
      // setTimeout 0 dá tempo do DOM estabilizar (alguns refs ainda
      // não vinculados na primeira passada).
      setTimeout(() => first.focus(), 0);
    }

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEsc) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      // Trap.
      const currentFocusables = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (currentFocusables.length === 0) return;
      const firstEl = currentFocusables[0];
      const lastEl = currentFocusables[currentFocusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === firstEl || !node.contains(active)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      // Restore focus.
      const last = lastFocusedRef.current;
      if (last && document.contains(last)) {
        try {
          last.focus();
        } catch {
          // ignore
        }
      }
    };
  }, [open, onClose, closeOnEsc]);

  return ref;
}
