/**
 * Onda L.4 (2026-05-23) — Funções puras de enforcement de navegação.
 *
 * Testa a implementação REAL de @/lib/api (sem mock do módulo):
 *  - resolveApplicationForHref — resolve href → aplicação conhecida.
 *  - decideNavigation — decide allow | new_tab | block.
 *  - deriveKnownApplications — deriva apps das rotas reais (Pages.list),
 *    excluindo a rota dinâmica /sala/[slug]; fallback estático em falha.
 *
 * Memory: feedback_no_manual_technical_input — apps via seletor derivado
 * de rotas conhecidas, NUNCA texto livre / const desalinhada.
 */
import * as api from '@/lib/api';

const {
  resolveApplicationForHref,
  decideNavigation,
  deriveKnownApplications,
  KNOWN_APPLICATIONS,
} = api;

const KNOWN: api.KnownApplication[] = [
  { slug: 'inicio', label: 'Início', route: '/' },
  { slug: 'buscar', label: 'Buscar', route: '/buscar' },
  { slug: 'mapa', label: 'Mapa', route: '/mapa' },
  { slug: 'painel', label: 'Painel de Controle', route: '/painel-de-controle' },
];

describe('resolveApplicationForHref', () => {
  it('casa rota exata para a aplicação conhecida', () => {
    expect(resolveApplicationForHref('/mapa', KNOWN)?.slug).toBe('mapa');
  });

  it('casa por prefixo (sub-rota) para a app de rota mais longa', () => {
    expect(
      resolveApplicationForHref('/painel-de-controle/salas', KNOWN)?.slug,
    ).toBe('painel');
  });

  it('a raiz `/` só casa exatamente (não vira prefixo de tudo)', () => {
    expect(resolveApplicationForHref('/', KNOWN)?.slug).toBe('inicio');
    expect(resolveApplicationForHref('/mapa', KNOWN)?.slug).toBe('mapa');
  });

  it('retorna null para rota fora do catálogo', () => {
    expect(resolveApplicationForHref('/rota-desconhecida', KNOWN)).toBeNull();
  });

  it('retorna null para esquemas não-navegáveis', () => {
    expect(resolveApplicationForHref('#secao', KNOWN)).toBeNull();
    expect(resolveApplicationForHref('mailto:a@b.com', KNOWN)).toBeNull();
    expect(resolveApplicationForHref('', KNOWN)).toBeNull();
  });

  it('URL absoluta do mesmo origin resolve pelo pathname', () => {
    // jsdom origin default = http://localhost
    expect(
      resolveApplicationForHref('http://localhost/mapa', KNOWN)?.slug,
    ).toBe('mapa');
  });

  it('URL absoluta de host externo => null (não é app conhecida)', () => {
    expect(resolveApplicationForHref('https://exemplo.com/mapa', KNOWN)).toBeNull();
  });
});

describe('decideNavigation', () => {
  const allowAll = { navigate_out_allowed: true, allowed_applications: [] };
  const whitelist = {
    navigate_out_allowed: true,
    allowed_applications: ['mapa', 'buscar'],
  };
  const noOut = { navigate_out_allowed: false, allowed_applications: [] };

  it('whitelist vazia + saída liberada => tudo allow', () => {
    expect(decideNavigation('/mapa', allowAll, KNOWN)).toBe('allow');
    expect(decideNavigation('/rota-x', allowAll, KNOWN)).toBe('allow');
  });

  it('whitelist ativa => app permitida allow, app conhecida fora => block', () => {
    expect(decideNavigation('/mapa', whitelist, KNOWN)).toBe('allow');
    expect(
      decideNavigation('/painel-de-controle/salas', whitelist, KNOWN),
    ).toBe('block');
  });

  it('saída desabilitada => destino externo/fora-catálogo abre em nova aba', () => {
    expect(decideNavigation('/rota-desconhecida', noOut, KNOWN)).toBe('new_tab');
    expect(decideNavigation('https://exemplo.com', noOut, KNOWN)).toBe('new_tab');
  });

  it('saída desabilitada mas destino é app conhecida (whitelist vazia) => allow', () => {
    expect(decideNavigation('/mapa', noOut, KNOWN)).toBe('allow');
  });

  it('whitelist ativa tem precedência sobre app conhecida fora dela', () => {
    // /buscar é app conhecida mas não está em ['mapa'] => block.
    const wl = { navigate_out_allowed: true, allowed_applications: ['mapa'] };
    expect(decideNavigation('/buscar', wl, KNOWN)).toBe('block');
  });
});

describe('deriveKnownApplications', () => {
  afterEach(() => jest.restoreAllMocks());

  it('deriva das rotas reais e exclui a rota dinâmica /sala/[slug]', async () => {
    jest.spyOn(api.Pages, 'list').mockResolvedValue([
      { slug: 'inicio', title: 'Início', route: '/' },
      { slug: 'mapa', title: 'Mapa', route: '/mapa' },
      { slug: 'buscar', title: 'Buscar', route: '/buscar' },
      { slug: 'sala', title: 'Sala', route: '/sala/[slug]' },
    ] as never);
    const apps = await deriveKnownApplications();
    const slugs = apps.map((a) => a.slug);
    expect(slugs).toContain('mapa');
    expect(slugs).toContain('buscar');
    expect(slugs).not.toContain('sala'); // rota dinâmica excluída
    // ordenado por label pt-BR
    expect(apps.map((a) => a.label)).toEqual(
      [...apps.map((a) => a.label)].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    );
  });

  it('cai no fallback estático quando Pages.list falha', async () => {
    jest.spyOn(api.Pages, 'list').mockRejectedValue(new Error('offline'));
    const apps = await deriveKnownApplications();
    expect(apps).toBe(KNOWN_APPLICATIONS);
  });

  it('fallback estático quando catálogo vem vazio', async () => {
    jest.spyOn(api.Pages, 'list').mockResolvedValue([] as never);
    const apps = await deriveKnownApplications();
    expect(apps).toBe(KNOWN_APPLICATIONS);
  });
});
