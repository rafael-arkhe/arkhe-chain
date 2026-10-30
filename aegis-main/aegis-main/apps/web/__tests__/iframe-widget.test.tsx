/**
 * Onda 5 (Safe Tag + AEGIS) — widget `iframe` aceita caminho SAME-ORIGIN
 * (raiz-relativo) além da allowlist de hosts externos.
 *
 * É o "embed 3b em tile": as telas de portaria (/portaria/livemap|guestalerts)
 * entram como TILES da página Início do condomínio. Same-origin = o cookie
 * httpOnly do operador flui p/ o iframe E p/ o EventSource /api/stream/live —
 * e, espelhando o EmbedFrame fullscreen, tile same-origin NÃO leva sandbox.
 */
import { render, screen } from '@testing-library/react';

import { Iframe } from '@/components/workshop/widgets/iframe';

type RP = Parameters<typeof Iframe>[0];

function renderIframe(config: Record<string, unknown>) {
  const props = {
    config,
    variables: {},
    bindings: {},
    appId: 'test-app',
    setBinding: jest.fn(),
    emit: jest.fn(),
  } as unknown as RP;
  return render(<Iframe {...props} />);
}

describe('iframe widget — allowlist externa (comportamento existente)', () => {
  it('renderiza host externo aprovado, com sandbox', () => {
    renderIframe({
      url: 'https://www.openstreetmap.org/export/embed.html',
      allowed_hosts: 'www.openstreetmap.org',
    });
    const el = screen.getByTestId('iframe-widget');
    expect(el).toHaveAttribute(
      'src',
      'https://www.openstreetmap.org/export/embed.html',
    );
    expect(el).toHaveAttribute('sandbox');
  });

  it('bloqueia host externo fora da allowlist', () => {
    renderIframe({ url: 'https://malicioso.example.com/x' });
    expect(screen.getByText('Host não aprovado')).toBeInTheDocument();
    expect(screen.queryByTestId('iframe-widget')).not.toBeInTheDocument();
  });
});

describe('iframe widget — tile SAME-ORIGIN (Onda 5)', () => {
  it('aceita caminho raiz-relativo sem allowlist (telas de portaria)', () => {
    renderIframe({
      url: '/portaria/livemap/index.html',
      title: 'Mapa Vivo',
      height: 440,
    });
    const el = screen.getByTestId('iframe-widget');
    expect(el).toHaveAttribute('src', '/portaria/livemap/index.html');
    expect(screen.getByText('Mapa Vivo')).toBeInTheDocument();
  });

  it('tile same-origin NÃO leva sandbox (espelha o EmbedFrame do 3b)', () => {
    renderIframe({ url: '/portaria/guestalerts/index.html' });
    expect(screen.getByTestId('iframe-widget')).not.toHaveAttribute('sandbox');
  });

  it('rejeita protocolo-relativo (//host não é same-origin)', () => {
    renderIframe({ url: '//malicioso.example.com/x' });
    expect(screen.getByText('Host não aprovado')).toBeInTheDocument();
    expect(screen.queryByTestId('iframe-widget')).not.toBeInTheDocument();
  });

  it('rejeita truque de backslash', () => {
    renderIframe({ url: '/\\malicioso.example.com/x' });
    expect(screen.getByText('Host não aprovado')).toBeInTheDocument();
    expect(screen.queryByTestId('iframe-widget')).not.toBeInTheDocument();
  });
});
