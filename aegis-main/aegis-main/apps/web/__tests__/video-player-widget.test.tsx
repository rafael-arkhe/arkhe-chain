/**
 * Wave D.4 — Video Player widget tests (2026-05-23).
 */
import { render, screen } from '@testing-library/react';

import { VideoPlayer } from '@/components/workshop/widgets/video-player';

type RP = Parameters<typeof VideoPlayer>[0];

function renderVP(
  config: Record<string, unknown>,
  variables: Record<string, unknown> = {},
) {
  const props = {
    config,
    variables,
    bindings: {},
    appId: 'test-app',
    setBinding: jest.fn(),
    emit: jest.fn(),
  } as unknown as RP;
  return render(<VideoPlayer {...props} />);
}

describe('video_player widget — Wave D.4', () => {
  it('mostra placeholder quando source vazio', () => {
    renderVP({});
    expect(screen.getByTestId('video-player-widget')).toBeInTheDocument();
    expect(screen.getByTestId('video-player-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('video-player-element')).not.toBeInTheDocument();
  });

  it('renderiza <video> quando source é URL direta', () => {
    renderVP({ source: 'https://example.com/v.mp4', controls: true });
    expect(screen.getByTestId('video-player-element')).toBeInTheDocument();
    expect(screen.getByTestId('video-player-element')).toHaveAttribute(
      'src',
      'https://example.com/v.mp4',
    );
  });

  it('resolve source a partir de variable string', () => {
    renderVP(
      { source: 'minha_url' },
      { minha_url: 'https://example.com/v2.webm' },
    );
    expect(screen.getByTestId('video-player-element')).toHaveAttribute(
      'src',
      'https://example.com/v2.webm',
    );
  });

  it('resolve source a partir de variable {url: ...}', () => {
    renderVP(
      { source: 'media' },
      { media: { url: 'https://example.com/v3.mp4' } },
    );
    expect(screen.getByTestId('video-player-element')).toHaveAttribute(
      'src',
      'https://example.com/v3.mp4',
    );
  });

  it('liga muted automaticamente quando autoplay está ligado e muted não foi explicitado', () => {
    renderVP({ source: 'https://example.com/v.mp4', autoplay: true });
    const el = screen.getByTestId('video-player-element') as HTMLVideoElement;
    expect(el.muted).toBe(true);
  });

  it('renderiza título no header quando configurado', () => {
    renderVP({ source: 'https://example.com/v.mp4', title: 'Captura A' });
    expect(screen.getByText('Captura A')).toBeInTheDocument();
  });
});
