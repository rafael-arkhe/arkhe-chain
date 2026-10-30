'use client';

/**
 * Wave H.4.B (2026-05-23) — Comunicados banner stack.
 *
 * Renderiza no topo do shell autenticado (acima do header global)
 * uma pilha vertical de banners ativos buscados em
 * ``/platform/v23/comunicados/active``. Aplica:
 *
 *  - filtro server-side por audience + janela temporal + dismissals;
 *  - max 3 banners visíveis; restantes aparecem como "+N comunicados";
 *  - dismiss persistido via POST /{id}/dismiss/me;
 *  - auto-dismiss timer quando ``duration_s > 0``;
 *  - markdown safe-subset no body (negrito/itálico/link), sem
 *    ``dangerouslySetInnerHTML`` com HTML arbitrário;
 *  - prefers-reduced-motion respeitado (anim de slide-in/fade-out).
 *
 * DS pro-max:
 *  - sem `rounded-*` (UI Palantir-style sharp);
 *  - sem ``Sparkles`` lucide;
 *  - cores via tokens semânticos (bg-info/border-info etc.);
 *  - focus ring nativo + aria-label nos controles.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CircleAlert,
  CircleCheck,
  Info,
  X,
  ArrowRight,
} from 'lucide-react';
import { Comunicados, type ComunicadoKind, type ComunicadoOut } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/cn';


// Push em tempo (quase) real via SSE. O polling abaixo é só fallback de
// resiliência quando o EventSource não está disponível ou cai repetidamente
// (proxy/ambiente sem suporte a stream). Não é o caminho feliz.
const FALLBACK_POLL_INTERVAL_MS = 10_000;
const MAX_VISIBLE = 3;


function kindStyles(kind: ComunicadoKind) {
  // Tokens semânticos do tailwind.config.js (Wave D.2). Banner usa
  // /10 pra fundo + /100 (color base) pra borda.
  //
  // Feedback #12 (2026-05-24) — o texto SEMPRE precisa contrastar com o
  // fundo da severidade, independente da cor aplicada. Em vez de um cinza
  // escuro fixo (que ficava ilegível quando o fundo renderiza colorido/
  // escuro), o foreground passa a ser a PRÓPRIA cor da severidade
  // (mesma matiz da borda/ícone): saturada o bastante pra ler sobre o
  // tint pálido e nunca "preto sobre colorido". título/corpo/links/CTA
  // herdam via currentColor.
  switch (kind) {
    case 'info':
      return {
        wrap: 'bg-info/10 border-info text-info',
        icon: 'text-info',
      };
    case 'warning':
      return {
        wrap: 'bg-warning/10 border-warning text-warning',
        icon: 'text-warning',
      };
    case 'danger':
      return {
        wrap: 'bg-danger/10 border-danger text-danger',
        icon: 'text-danger',
      };
    case 'success':
      return {
        wrap: 'bg-success/10 border-success text-success',
        icon: 'text-success',
      };
  }
}


function defaultIconFor(kind: ComunicadoKind) {
  switch (kind) {
    case 'info':
      return Info;
    case 'warning':
      return AlertTriangle;
    case 'danger':
      return CircleAlert;
    case 'success':
      return CircleCheck;
  }
}


/**
 * Renderiza corpo de markdown safe-subset:
 *  - **bold** → <strong>
 *  - *italic* → <em>
 *  - [label](href) → <a target=_blank rel=noopener noreferrer>
 *
 * Tudo o mais sai escapado como texto. Sem dangerouslySetInnerHTML.
 */
function renderSafeMarkdown(body: string): React.ReactNode {
  if (!body) return null;
  // Tokeniza com regex única (split mantém matches via grupos de captura).
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = body.split(re);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      // Whitelist scheme — só http(s) e relative paths.
      const safe =
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('/');
      if (!safe) return label;
      return (
        <a
          key={idx}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline focus:outline-none focus:ring-2 focus:ring-focus"
        >
          {label}
        </a>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}


function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}


/**
 * Hook: lista comunicados ativos do user atual em push (quase) real-time.
 *
 * Transporte primário: SSE (``EventSource`` em ``/api/platform/v23/
 * comunicados/stream``). O servidor reavalia a cada ~5s e empurra a lista
 * só quando ela muda — um comunicado urgente aparece em ≤ ~5s sem reload.
 * O cookie httpOnly viaja sozinho (same-origin); o proxy Next injeta o
 * Bearer.
 *
 * Resiliência: se o ``EventSource`` não existir (SSR/ambiente sem suporte)
 * ou o stream cair repetidamente sem entregar dados, cai pra **polling**
 * (10s) via ``Comunicados.active()`` — e continua tentando reabrir o SSE.
 * Quedas transitórias são resolvidas pela reconexão nativa do EventSource.
 *
 * Falha silenciosa (banner some) — esse é um shell-level enhancement, não
 * pode bloquear navegação.
 */
export function useActiveComunicados(): {
  items: ComunicadoOut[];
  loading: boolean;
  remove: (id: string) => void;
  refresh: () => Promise<void>;
  /** Transporte ativo — exposto pra testes/observabilidade. */
  transport: 'sse' | 'polling' | 'connecting';
} {
  const [items, setItems] = useState<ComunicadoOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [transport, setTransport] = useState<'sse' | 'polling' | 'connecting'>(
    'connecting',
  );
  const mounted = useRef(true);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Conexões SSE que erraram sem nunca entregar 1 frame. Acima do limiar
  // desistimos do SSE nessa montagem e ficamos no polling.
  const failedConnects = useRef(0);
  const everReceived = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await Comunicados.active();
      if (mounted.current) {
        setItems(rows);
      }
    } catch {
      if (mounted.current) {
        setItems([]);
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    const stopPolling = () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const startPolling = () => {
      if (!mounted.current || pollRef.current !== null) return;
      setTransport('polling');
      void refresh();
      pollRef.current = setInterval(() => {
        void refresh();
      }, FALLBACK_POLL_INTERVAL_MS);
    };

    const closeStream = () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };

    const openStream = () => {
      // Sem suporte a EventSource (SSR/jsdom/ambiente antigo) → polling.
      if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
        startPolling();
        return;
      }
      try {
        closeStream();
        setTransport('connecting');
        // withCredentials envia o cookie httpOnly de sessão same-origin.
        const es = new EventSource(Comunicados.streamUrl, {
          withCredentials: true,
        });
        esRef.current = es;

        es.addEventListener('comunicados', (ev: MessageEvent) => {
          if (!mounted.current) return;
          everReceived.current = true;
          failedConnects.current = 0;
          // Stream é a fonte da verdade enquanto vivo — desliga o polling.
          stopPolling();
          setTransport('sse');
          try {
            const rows = JSON.parse(ev.data) as ComunicadoOut[];
            setItems(Array.isArray(rows) ? rows : []);
          } catch {
            // Frame malformado — ignora, mantém estado anterior.
          } finally {
            setLoading(false);
          }
        });

        es.onopen = () => {
          if (!mounted.current) return;
          setTransport('sse');
        };

        es.onerror = () => {
          if (!mounted.current) return;
          // EventSource tenta reconectar sozinho (readyState=CONNECTING).
          // Se nunca entregou dados, conta a falha e, no limiar, desiste e
          // assume polling como fallback resiliente.
          if (!everReceived.current) {
            failedConnects.current += 1;
            if (failedConnects.current >= 2) {
              closeStream();
              startPolling();
            }
          } else {
            // Já recebeu dados antes: enquanto reconecta, garante frescor
            // via polling; quando o SSE voltar, o handler desliga o poll.
            startPolling();
          }
        };
      } catch {
        startPolling();
      }
    };

    openStream();

    return () => {
      mounted.current = false;
      closeStream();
      stopPolling();
    };
  }, [refresh]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { items, loading, remove, refresh, transport };
}


interface ComunicadoBannerRowProps {
  comunicado: ComunicadoOut;
  onDismiss: (id: string) => void;
}

function ComunicadoBannerRow({ comunicado, onDismiss }: ComunicadoBannerRowProps) {
  const t = useT();
  const [visible, setVisible] = useState(true);
  const [entered, setEntered] = useState(false);
  const styles = kindStyles(comunicado.kind);
  const IconCmp = defaultIconFor(comunicado.kind);

  // Slide-in trigger no mount; respeita prefers-reduced-motion.
  useEffect(() => {
    if (prefersReducedMotion()) {
      setEntered(true);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    // Fade out → backend persist → remove do estado pai.
    const finalize = () => {
      void Comunicados.dismissMe(comunicado.id).catch(() => {
        // Falha persiste? UI mantém oculto na sessão; refresh próximo
        // pega novamente, e operador re-clica.
      });
      onDismiss(comunicado.id);
    };
    if (prefersReducedMotion()) {
      finalize();
    } else {
      window.setTimeout(finalize, 150);
    }
  }, [comunicado.id, onDismiss]);

  // Auto-dismiss timer (duration_s > 0). Não confunde com closable=false:
  // o timer dispara o mesmo path do dismiss manual (persiste backend).
  useEffect(() => {
    if (!comunicado.duration_s || comunicado.duration_s <= 0) return;
    const id = window.setTimeout(() => {
      handleDismiss();
    }, comunicado.duration_s * 1000);
    return () => window.clearTimeout(id);
  }, [comunicado.duration_s, handleDismiss]);

  return (
    <div
      data-testid="comunicado-banner"
      data-comunicado-id={comunicado.id}
      data-kind={comunicado.kind}
      role="status"
      aria-live="polite"
      className={cn(
        'border-b px-4 py-2 flex items-start gap-3 text-sm select-text',
        styles.wrap,
        // Animation: 200ms slide-in / 150ms fade-out.
        'transition-all ease-out',
        entered && visible
          ? 'translate-y-0 opacity-100 duration-200'
          : !visible
            ? 'opacity-0 -translate-y-1 duration-150'
            : '-translate-y-2 opacity-0 duration-200',
      )}
    >
      <IconCmp
        aria-hidden
        className={cn('w-4 h-4 mt-0.5 shrink-0', styles.icon)}
      />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13px] leading-tight">
          {comunicado.title}
        </div>
        {comunicado.body && (
          <div className="text-[12px] mt-0.5 leading-snug break-words">
            {renderSafeMarkdown(comunicado.body)}
          </div>
        )}
      </div>
      {comunicado.cta_label && comunicado.cta_href && (
        <a
          href={comunicado.cta_href}
          target={comunicado.cta_href.startsWith('http') ? '_blank' : undefined}
          rel={
            comunicado.cta_href.startsWith('http')
              ? 'noopener noreferrer'
              : undefined
          }
          data-testid="comunicado-cta"
          className={cn(
            'shrink-0 px-2 py-1 text-[12px] font-medium border',
            'inline-flex items-center gap-1',
            'border-current hover:bg-current/10',
            'focus:outline-none focus:ring-2 focus:ring-focus',
          )}
          aria-label={comunicado.cta_label}
        >
          <span>{comunicado.cta_label}</span>
          <ArrowRight aria-hidden className="w-3 h-3" />
        </a>
      )}
      {comunicado.closable && (
        <button
          type="button"
          onClick={handleDismiss}
          data-testid="comunicado-dismiss"
          aria-label={t('comunicados.dismiss')}
          className={cn(
            'shrink-0 p-1 hover:bg-current/10',
            'focus:outline-none focus:ring-2 focus:ring-focus',
          )}
        >
          <X aria-hidden className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}


export function ComunicadosBanner() {
  const t = useT();
  const { items, remove } = useActiveComunicados();

  const { visible, extra } = useMemo(() => {
    if (items.length <= MAX_VISIBLE) {
      return { visible: items, extra: 0 };
    }
    return {
      visible: items.slice(0, MAX_VISIBLE),
      extra: items.length - MAX_VISIBLE,
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div
      data-testid="comunicados-banner-stack"
      role="region"
      aria-label="Comunicados"
      className="flex flex-col"
    >
      {visible.map((c) => (
        <ComunicadoBannerRow
          key={c.id}
          comunicado={c}
          onDismiss={remove}
        />
      ))}
      {extra > 0 && (
        <div
          data-testid="comunicado-extra-count"
          className="border-b border-border bg-panel-light px-4 py-1 text-[11px] font-medium text-muted-on-light"
        >
          {t('comunicados.moreCount').replace('{n}', String(extra))}
        </div>
      )}
    </div>
  );
}
