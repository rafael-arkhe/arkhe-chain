/**
 * Onda 3b (Safe Tag + AEGIS · 2026-07-09) — catálogo e leitores do
 * ``experience_kind: 'embed'``.
 *
 * Uma Página ``app_route`` com ``experience_kind:'embed'`` embute, EM TELA
 * CHEIA e SAME-ORIGIN, uma SPA operacional já validada (as telas de portaria
 * ``livemap``/``guestalerts``, servidas por ``security-app`` em
 * ``public/portaria/*``). Same-origin é o que faz o cookie httpOnly do
 * operador fluir para dentro do iframe E para o ``EventSource
 * /api/stream/live`` (push) — o gesto de operador só fecha assim.
 *
 * O QUAL SPA embutir vive em ``Page.config.params.embed_src`` (blob de
 * parâmetros da experiência, preservado intacto por ``coercePageConfig``). O
 * operador escolhe de um DROPDOWN curado (nunca digita URL —
 * ``feedback_no_manual_technical_input``), e o valor é sempre validado como
 * caminho SAME-ORIGIN (raiz-relativo) antes de virar ``src`` de iframe:
 * embutir origem externa arbitrária seria um vetor (o ``frame-ancestors
 * 'self'`` protege quem nos embute, NÃO o que nós embutimos).
 *
 * Módulo leve (zero deps de UI/API) de propósito — entra no editor, no
 * runtime (``EmbedFrame``), na hidratação do nav e nos testes sem puxar
 * componente pesado. Os ``src`` aqui espelham o seed do backend
 * (``app/utils/seed_safetag.py`` → páginas ``portaria-mapa``/``portaria-alertas``).
 */

/** Rótulo do contrato app_route que roteia para o runtime de embed. */
export const EMBED_EXPERIENCE_KIND = 'embed';

/** Uma SPA operacional embutível same-origin (opção do dropdown curado). */
export interface EmbedApp {
  /** id estável (= slug da SPA em public/portaria/). */
  id: string;
  /** rótulo pt-BR (fallback; a i18n real é ``labelKey``). */
  label: string;
  /** chave i18n do rótulo exibido no dropdown. */
  labelKey: string;
  /** caminho SAME-ORIGIN da SPA (servida por security-app/public/portaria). */
  src: string;
  /** ícone lucide neutro sugerido para o item de nav (config.params.nav_icon). */
  navIcon: string;
}

/**
 * Catálogo curado das SPAs de portaria embutíveis (Onda 3). Fonte única do
 * dropdown do editor. ``src`` = caminho same-origin servido por
 * ``security-app/public/portaria/<id>/index.html`` (ver
 * ``safetag-web/sync-to-security-app.sh``).
 */
export const EMBED_APPS: EmbedApp[] = [
  {
    id: 'livemap',
    label: 'Mapa Vivo',
    labelKey: 'embed.app.livemap',
    src: '/portaria/livemap/index.html',
    navIcon: 'map-pin',
  },
  {
    id: 'guestalerts',
    label: 'Alertas ao Vivo',
    labelKey: 'embed.app.guestalerts',
    src: '/portaria/guestalerts/index.html',
    navIcon: 'bell-ring',
  },
];

/**
 * ``true`` se ``src`` é um caminho SAME-ORIGIN (raiz-relativo) — não uma URL
 * externa. Rejeita esquema explícito (``http://``), protocolo-relativo
 * (``//host``) e truques de backslash. É o único ``src`` que o ``EmbedFrame``
 * aceita renderizar.
 */
export function isSameOriginPath(src: unknown): src is string {
  return (
    typeof src === 'string' &&
    src.length > 1 &&
    src.startsWith('/') &&
    !src.startsWith('//') &&
    !src.includes('://') &&
    !src.includes('\\')
  );
}

/**
 * Lê o ``embed_src`` VALIDADO de um ``Page.config`` embed, ou ``null``. Só
 * devolve caminho quando: ``mode==='app_route'`` E
 * ``experience_kind==='embed'`` E ``params.embed_src`` é same-origin. Recebe o
 * config CRU (``page.config``) — mesma fonte que o nav usa.
 */
export function readEmbedSrc(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  const c = config as Record<string, unknown>;
  if (c.mode !== 'app_route' || c.experience_kind !== EMBED_EXPERIENCE_KIND) {
    return null;
  }
  const params =
    c.params && typeof c.params === 'object' && !Array.isArray(c.params)
      ? (c.params as Record<string, unknown>)
      : {};
  return isSameOriginPath(params.embed_src) ? params.embed_src : null;
}
