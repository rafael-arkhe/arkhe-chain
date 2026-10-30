/**
 * Onda 3b (Safe Tag) — experience_kind:'embed' no security-app.
 *
 * Cobre:
 *   - EmbedFrame: src same-origin → iframe; src externo → estado neutro (nunca
 *     iframe pra fora);
 *   - auto-registro do kind 'embed' no registry de experiências;
 *   - o editor persiste embed_src + nav_icon via Pages.putConfig PRESERVANDO o
 *     blob app_route;
 *   - a view canônica renderiza o iframe (full-bleed, sem header) para uma Page
 *     embed publicada.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// i18n identidade (chave = texto) — padrão dos testes de view.
jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

// ── EmbedFrame (runtime) ────────────────────────────────────────────────────
import { EmbedFrame } from '@/components/pages/embed-app';

describe('EmbedFrame — só embute same-origin', () => {
  it('src same-origin → iframe com o src', () => {
    render(<EmbedFrame src="/portaria/livemap/index.html" title="Mapa Vivo" />);
    const frame = screen.getByTestId('embed-frame') as HTMLIFrameElement;
    expect(frame).toBeInTheDocument();
    expect(frame.getAttribute('src')).toBe('/portaria/livemap/index.html');
    // sem sandbox: SPA própria precisa do cookie + push.
    expect(frame).not.toHaveAttribute('sandbox');
  });

  it('src externo → estado neutro, nunca iframe pra fora', () => {
    render(<EmbedFrame src="https://evil.com" title="x" />);
    expect(screen.getByTestId('embed-invalid')).toBeInTheDocument();
    expect(screen.queryByTestId('embed-frame')).not.toBeInTheDocument();
  });
});

// ── Editor + registry ───────────────────────────────────────────────────────
jest.mock('@/lib/api', () => ({
  Pages: { putConfig: jest.fn() },
}));

import {
  getExperienceConfig,
  hasExperienceConfig,
} from '@/lib/pages/experience-registry';
import '@/components/pages-editor/embed-experience-editor';
import { EmbedExperienceEditor } from '@/components/pages-editor/embed-experience-editor';
import { Pages } from '@/lib/api';

const pagesApi = Pages as jest.Mocked<typeof Pages>;

function makeEmbedPage(over: Record<string, unknown> = {}) {
  return {
    slug: 'portaria-mapa',
    title: 'Mapa Vivo',
    route: '/paginas/portaria-mapa/view',
    status: 'published',
    marking_requirements: [],
    iam_perm_required: 'security.geo.view',
    config: {
      mode: 'app_route',
      experience_kind: 'embed',
      params: { embed_src: '/portaria/livemap/index.html', nav_icon: 'map-pin' },
    },
    last_edited_by: null,
    created_at: '2026-07-09T12:00:00+00:00',
    ...over,
  } as any;
}

describe('experience-registry · auto-registro do kind embed', () => {
  it('importar o editor registra o kind `embed`', () => {
    expect(hasExperienceConfig('embed')).toBe(true);
    const def = getExperienceConfig('embed');
    expect(def?.ConfigEditor).toBeTruthy();
    expect(def?.labelKey).toBe('pages.configureExperience');
  });
});

describe('EmbedExperienceEditor · persiste embed_src+nav_icon preservando o blob', () => {
  beforeEach(() => {
    pagesApi.putConfig.mockReset();
    pagesApi.putConfig.mockResolvedValue(makeEmbedPage());
  });

  it('troca p/ guestalerts e salva embed_src + nav_icon, preservando mode/kind/note', async () => {
    const page = makeEmbedPage({
      config: {
        mode: 'app_route',
        experience_kind: 'embed',
        note: 'NOTE',
        params: { embed_src: '/portaria/livemap/index.html', extra: 1 },
      },
    });
    render(<EmbedExperienceEditor page={page} />);

    fireEvent.change(screen.getByTestId('embed-experience-src'), {
      target: { value: '/portaria/guestalerts/index.html' },
    });
    fireEvent.click(screen.getByTestId('embed-experience-salvar'));

    await waitFor(() => expect(pagesApi.putConfig).toHaveBeenCalledTimes(1));
    const [slug, cfg] = pagesApi.putConfig.mock.calls[0] as [string, any];
    expect(slug).toBe('portaria-mapa');
    expect(cfg.mode).toBe('app_route');
    expect(cfg.experience_kind).toBe('embed');
    expect(cfg.note).toBe('NOTE');
    // embed_src novo + nav_icon da SPA escolhida (guestalerts → bell-ring),
    // preservando params já gravados (extra).
    expect(cfg.params.embed_src).toBe('/portaria/guestalerts/index.html');
    expect(cfg.params.nav_icon).toBe('bell-ring');
    expect(cfg.params.extra).toBe(1);
    expect(await screen.findByText('embed.experience.save.saved')).toBeInTheDocument();
  });
});
