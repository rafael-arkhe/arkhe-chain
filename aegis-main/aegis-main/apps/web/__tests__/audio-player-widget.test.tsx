/**
 * Audio Player widget tests.
 *
 * Verifica: render do <audio> a partir de url direta / propriedade do
 * objeto; transcrição read-only quando transcript_field aponta texto;
 * placeholder quando não há fonte.
 */
import { render, screen } from '@testing-library/react';

import { AudioPlayer } from '@/components/workshop/widgets/audio-player';

type RP = Parameters<typeof AudioPlayer>[0];

function renderAP(
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
  return render(<AudioPlayer {...props} />);
}

describe('audio_player widget', () => {
  it('mostra placeholder quando não há fonte', () => {
    renderAP({});
    expect(screen.getByTestId('audio-player-widget')).toBeInTheDocument();
    expect(screen.getByTestId('audio-player-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-player-element')).not.toBeInTheDocument();
  });

  it('renderiza <audio> com a fonte quando url direta é dada', () => {
    renderAP({ url: 'https://example.com/a.mp3' });
    const el = screen.getByTestId('audio-player-element');
    expect(el.tagName.toLowerCase()).toBe('audio');
    expect(el).toHaveAttribute('src', 'https://example.com/a.mp3');
  });

  it('resolve a url a partir de uma propriedade do objeto (source_field)', () => {
    renderAP(
      { source: 'obj', source_field: 'audio_url' },
      { obj: { audio_url: 'https://example.com/call.ogg', nome: 'Chamada' } },
    );
    expect(screen.getByTestId('audio-player-element')).toHaveAttribute(
      'src',
      'https://example.com/call.ogg',
    );
  });

  it('resolve url e transcrição via envelope {properties}', () => {
    renderAP(
      { source: 'obj', source_field: 'audio_url', transcript_field: 'transcricao' },
      {
        obj: {
          properties: {
            audio_url: 'https://example.com/x.wav',
            transcricao: 'Alô, registro da ocorrência número 42.',
          },
        },
      },
    );
    expect(screen.getByTestId('audio-player-element')).toHaveAttribute(
      'src',
      'https://example.com/x.wav',
    );
    const tr = screen.getByTestId('audio-player-transcript');
    expect(tr).toBeInTheDocument();
    expect(tr).toHaveTextContent('Alô, registro da ocorrência número 42.');
  });

  it('resolve source string crua (igual ao video_player)', () => {
    renderAP({ source: 'minha_url' }, { minha_url: 'https://example.com/v.mp3' });
    expect(screen.getByTestId('audio-player-element')).toHaveAttribute(
      'src',
      'https://example.com/v.mp3',
    );
  });

  it('não mostra transcrição quando transcript_field não resolve texto', () => {
    renderAP(
      { url: 'https://example.com/a.mp3', transcript_field: 'transcricao' },
      {},
    );
    expect(screen.queryByTestId('audio-player-transcript')).not.toBeInTheDocument();
  });

  it('exibe o título quando configurado', () => {
    renderAP({ url: 'https://example.com/a.mp3', title: 'Chamada A' });
    expect(screen.getByText('Chamada A')).toBeInTheDocument();
  });
});
