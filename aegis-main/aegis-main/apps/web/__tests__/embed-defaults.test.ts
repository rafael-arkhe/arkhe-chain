/**
 * Onda 3b (Safe Tag) — leitores/validadores do experience_kind:'embed'.
 *
 * Pura (sem React): trava o contrato de SEGURANÇA (só same-origin vira iframe)
 * e o roteamento de nav (grupo/ícone da experiência embed + override por
 * Página).
 */
import {
  EMBED_APPS,
  EMBED_EXPERIENCE_KIND,
  isSameOriginPath,
  readEmbedSrc,
} from '@/lib/pages/embed-defaults';
import {
  EXPERIENCE_KIND_TO_GROUP,
  ICON_BY_EXPERIENCE_KIND,
  readNavIconParam,
} from '@/lib/nav/modular-apps';

describe('isSameOriginPath — só caminho raiz-relativo vira iframe', () => {
  it.each([
    '/portaria/livemap/index.html',
    '/portaria/guestalerts/index.html',
    '/a',
  ])('aceita same-origin: %s', (p) => {
    expect(isSameOriginPath(p)).toBe(true);
  });

  it.each([
    'http://evil.com',
    'https://evil.com/x',
    '//evil.com',
    'javascript:alert(1)',
    'data:text/html,x',
    '/\\evil',
    'portaria/livemap', // sem barra inicial
    '/',
    '',
    null,
    undefined,
    42,
    {},
  ])('rejeita não-same-origin: %s', (p) => {
    expect(isSameOriginPath(p as unknown)).toBe(false);
  });
});

describe('readEmbedSrc — só devolve src de um embed válido', () => {
  it('devolve o embed_src de um config embed same-origin', () => {
    expect(
      readEmbedSrc({
        mode: 'app_route',
        experience_kind: 'embed',
        params: { embed_src: '/portaria/livemap/index.html' },
      }),
    ).toBe('/portaria/livemap/index.html');
  });

  it('null quando o src é externo (não embute origem arbitrária)', () => {
    expect(
      readEmbedSrc({
        mode: 'app_route',
        experience_kind: 'embed',
        params: { embed_src: 'https://evil.com' },
      }),
    ).toBeNull();
  });

  it('null quando não é embed (outro experience_kind / mode)', () => {
    expect(
      readEmbedSrc({ mode: 'app_route', experience_kind: 'agents' }),
    ).toBeNull();
    expect(
      readEmbedSrc({ mode: 'workshop', params: { embed_src: '/x' } }),
    ).toBeNull();
    expect(readEmbedSrc(null)).toBeNull();
    expect(readEmbedSrc({})).toBeNull();
  });

  it('o catálogo curado é só caminho same-origin (nada externo semeável)', () => {
    expect(EMBED_APPS.length).toBeGreaterThan(0);
    for (const app of EMBED_APPS) {
      expect(isSameOriginPath(app.src)).toBe(true);
    }
  });
});

describe('nav — embed é de Operação, com ícone por-Página', () => {
  it('embed cai em Operação e tem ícone-de-kind default', () => {
    expect(EXPERIENCE_KIND_TO_GROUP[EMBED_EXPERIENCE_KIND]).toBe('operacao');
    expect(ICON_BY_EXPERIENCE_KIND[EMBED_EXPERIENCE_KIND]).toBe('frame');
    // não regride os kinds existentes.
    expect(ICON_BY_EXPERIENCE_KIND['aip_chat']).toBe('audio-lines');
  });

  it('readNavIconParam lê o ícone declarado pela Página (config.params.nav_icon)', () => {
    expect(
      readNavIconParam({ params: { nav_icon: 'map-pin' } }),
    ).toBe('map-pin');
    expect(readNavIconParam({ params: {} })).toBeNull();
    expect(readNavIconParam({})).toBeNull();
    expect(readNavIconParam(null)).toBeNull();
  });
});
