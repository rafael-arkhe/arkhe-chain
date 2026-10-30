'use client';

/**
 * Onda 3b (Safe Tag + AEGIS · 2026-07-09) — runtime do
 * ``experience_kind:'embed'``.
 *
 * Renderiza, em TELA CHEIA, uma SPA operacional já validada dentro de um
 * iframe SAME-ORIGIN. Same-origin é o ponto todo: o cookie httpOnly
 * ``aegis_access`` do operador flui automaticamente para o documento do iframe
 * e, de dentro dele, para o ``EventSource /api/stream/live`` — o push da
 * portaria (livemap/guestalerts) só funciona assim (o EventSource não seta
 * Authorization; depende do cookie same-origin).
 *
 * Segurança: só aceita ``src`` SAME-ORIGIN (``isSameOriginPath``). Embutir
 * origem externa arbitrária num iframe NÃO-sandboxed seria um vetor; o
 * ``frame-ancestors 'self'`` do ``next.config`` protege quem nos embute, não o
 * que embutimos — a validação aqui fecha o outro lado. NÃO usamos ``sandbox``
 * de propósito: a SPA é NOSSA (safetag-web servida same-origin) e PRECISA do
 * cookie + acesso a rede same-origin; um sandbox mataria o push.
 */
import * as React from 'react';

import { useT } from '@/lib/i18n/provider';
import { isSameOriginPath } from '@/lib/pages/embed-defaults';

export function EmbedFrame({ src, title }: { src: string; title: string }) {
  const t = useT();

  // Guarda de mesma origem — dado inesperado (config adulterado, URL externa)
  // vira estado neutro explícito, nunca um iframe apontando para fora.
  if (!isSameOriginPath(src)) {
    return (
      <div
        className="flex-1 min-h-0 flex items-center justify-center p-6"
        data-testid="embed-invalid"
      >
        <div className="max-w-md bg-white border border-warning/40 p-4 text-[12px] text-text-on-light">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-warning mb-1">
            {t('embed.invalid.title')}
          </p>
          <p>{t('embed.invalid.body')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 min-h-0 w-full flex"
      data-testid="embed-frame-root"
      data-embed-src={src}
    >
      <iframe
        src={src}
        title={title}
        data-testid="embed-frame"
        className="w-full h-full min-h-0 border-0 block"
        // Sem sandbox: SPA própria, same-origin, precisa do cookie + push.
      />
    </div>
  );
}
