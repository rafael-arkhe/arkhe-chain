/**
 * MosaicView — mosaico DVR SINCRONIZADO (mesmo relógio wall-clock).
 *
 * Invariantes:
 *  - alternância Ao vivo ↔ Gravação no próprio mosaico; modo Gravação carrega
 *    em CADA célula a playlist VOD da MESMA janela congelada;
 *  - célula sem gravação na janela = placeholder honesto (nunca player vazio);
 *  - RELÓGIO MESTRE: controles únicos (play/pause/velocidade/seek na timeline
 *    compartilhada) aplicados a todas as células via refs;
 *  - correção de deriva: a cada onTime do mestre, célula com |Δ| > 1.5s
 *    re-seeka pro instante certo DA SUA playlist (cada playlist comprime
 *    buracos diferentes — mapeamento abs↔mídia POR CÉLULA);
 *  - célula sem mídia no instante atual pausa com overlay discreto e
 *    re-entra quando o relógio alcança a próxima janela de coverage;
 *  - timeline compartilhada embaixo com coverages FUNDIDAS + cursor do mestre;
 *    clique → seek-all.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

type Handle = Record<string, jest.Mock>;
type Inst = { props: Record<string, any>; handle: Handle };

jest.mock('@/components/cameras/hls-player', () => {
  const ReactM = require('react');
  const instances: Inst[] = [];
  const makeHandle = () => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    seekBy: jest.fn(),
    setRate: jest.fn(),
    getCurrentTime: jest.fn(() => 0),
    getSeekable: jest.fn(() => null),
  });
  const HlsPlayer = ReactM.forwardRef(
    (props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      const instRef = ReactM.useRef(null) as { current: Inst | null };
      if (!instRef.current) {
        instRef.current = { props, handle: makeHandle() };
        instances.push(instRef.current);
      }
      instRef.current.props = props;
      ReactM.useImperativeHandle(ref, () => instRef.current!.handle);
      return ReactM.createElement('div', {
        'data-testid': 'hls-player',
        'data-url': props.url,
      });
    },
  );
  return { __esModule: true, HlsPlayer, HlsBadge: () => null, __instances: instances };
});
jest.mock('@/components/cameras/lpr-overlay', () => ({ LprOverlay: () => null }));

jest.mock('@/lib/api/cctv', () => {
  const actual = jest.requireActual('@/lib/api/cctv');
  return {
    ...actual,
    Cctv: {
      ...actual.Cctv,
      recordings: {
        coverage: jest.fn(),
        playlistUrl: actual.Cctv.recordings.playlistUrl,
      },
    },
  };
});

import { Cctv } from '@/lib/api/cctv';
import { absToMediaS } from '@/lib/cctv-timeline';
import * as playerModule from '@/components/cameras/hls-player';
import { MosaicView } from '@/components/cameras/mosaic-view';

const instances = (playerModule as unknown as { __instances: Inst[] }).__instances;
const mCoverage = (Cctv as unknown as { recordings: { coverage: jest.Mock } })
  .recordings.coverage;

const NOW = Date.now();

const mkStream = (id: string, name: string) => ({
  id,
  name,
  url: `https://cams.example/${id}/live.m3u8`,
  latitude: null,
  longitude: null,
  country: null,
  city: 'Sorocaba/SP',
  status: 'online',
  source_type: 'hls',
  detection_enabled: false,
  stream_metadata: {},
  tags: [],
  thumbnail_url: null,
});

const STREAMS = [mkStream('s1', 'Portaria'), mkStream('s2', 'Garagem'), mkStream('s3', 'Quadra')];

// s1 = MAIOR cobertura (vira o relógio mestre); s2 tem um BURACO no meio;
// s3 não tem gravação na janela.
const COV_A = [{ t_start_ms: NOW - 3_000_000, t_end_ms: NOW - 600_000 }]; // 40min
const COV_B = [
  { t_start_ms: NOW - 3_000_000, t_end_ms: NOW - 2_400_000 }, // 10min
  { t_start_ms: NOW - 1_200_000, t_end_ms: NOW - 600_000 }, // 10min (buraco no meio)
];

const covOut = (id: string, cov: { t_start_ms: number; t_end_ms: number }[]) => ({
  stream_id: id,
  from_ms: NOW - 3_600_000,
  to_ms: NOW,
  coverage: cov,
  segments_count: cov.length * 10,
  bytes_total: 1024,
});

beforeEach(() => {
  jest.clearAllMocks();
  instances.length = 0;
  mCoverage.mockImplementation(async (id: string) => {
    if (id === 's1') return covOut('s1', COV_A);
    if (id === 's2') return covOut('s2', COV_B);
    return covOut('s3', []);
  });
});

function renderMosaic() {
  render(
    <MosaicView
      streams={STREAMS}
      detectionsByStreamId={new Map()}
      showLPR
      showFace
      showObject
    />,
  );
}

async function enterDvr() {
  renderMosaic();
  fireEvent.click(await screen.findByTestId('mosaic-mode-dvr'));
  await waitFor(() => expect(mCoverage).toHaveBeenCalledTimes(3));
  // células com gravação tocam a playlist VOD da MESMA janela
  await waitFor(() => {
    const urls = screen
      .getAllByTestId('hls-player')
      .map((el) => el.getAttribute('data-url'));
    expect(urls.filter((u) => u?.includes('/recordings/playlist.m3u8'))).toHaveLength(2);
  });
  const cell = (id: string) =>
    instances.find((i) =>
      String(i.props.url).includes(`/streams/${id}/recordings/playlist.m3u8`),
    )!;
  const a = cell('s1');
  const b = cell('s2');
  // janela CONGELADA — a mesma nas 2 playlists
  const [, fromMs, toMs] = mCoverage.mock.calls[0];
  expect(String(b.props.url)).toContain(`from_ms=${fromMs}`);
  expect(String(a.props.url)).toContain(`to_ms=${toMs}`);
  return { a, b, fromMs, toMs };
}

test('modo Gravação: playlist VOD por célula; sem gravação na janela = placeholder honesto', async () => {
  const { a, b } = await enterDvr();
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  // s3 sem coverage → placeholder, NUNCA um player decorativo
  const ph = screen.getByTestId('mosaic-nocoverage-s3');
  expect(ph).toHaveTextContent('Sem gravação na janela');
  // timeline compartilhada embaixo, com coverage fundida sombreada
  expect(screen.getByTestId('mosaic-timeline')).toBeInTheDocument();
  expect(screen.getByTestId('timeline-coverage-0')).toBeInTheDocument();
});

test('sem gravação em NENHUMA câmera → erro honesto e continua ao vivo', async () => {
  mCoverage.mockResolvedValue(covOut('x', []));
  renderMosaic();
  fireEvent.click(await screen.findByTestId('mosaic-mode-dvr'));
  expect(await screen.findByTestId('mosaic-dvr-error')).toBeInTheDocument();
  const urls = screen
    .getAllByTestId('hls-player')
    .map((el) => el.getAttribute('data-url'));
  expect(urls.every((u) => u?.endsWith('live.m3u8'))).toBe(true);
});

test('play/pause únicos aplicam em TODAS as células via refs', async () => {
  const { a, b } = await enterDvr();
  // mestre = s1 (maior cobertura): só ele emite onTime/onPlayState
  expect(typeof a.props.onTime).toBe('function');
  expect(b.props.onTime).toBeUndefined();

  fireEvent.click(screen.getByTestId('mosaic-playpause'));
  expect(a.handle.pause).toHaveBeenCalledTimes(1);
  expect(b.handle.pause).toHaveBeenCalledTimes(1);

  // o estado do botão segue o evento REAL do mestre
  act(() => a.props.onPlayState?.(false));
  fireEvent.click(screen.getByTestId('mosaic-playpause'));
  expect(a.handle.play).toHaveBeenCalledTimes(1);
  expect(b.handle.play).toHaveBeenCalledTimes(1);
});

test('velocidade única aplica setRate em todas as células', async () => {
  const { a, b } = await enterDvr();
  fireEvent.click(screen.getByTestId('mosaic-rate-2'));
  expect(a.handle.setRate).toHaveBeenCalledWith(2);
  expect(b.handle.setRate).toHaveBeenCalledWith(2);
});

test('deriva: onTime do mestre re-seeka célula com |Δ| > 1.5s; dentro da tolerância não mexe', async () => {
  const { a, b } = await enterDvr();
  // mestre em 300s de mídia → abs = início de COV_A + 300s (dentro de COV_B[0])
  const absMs = COV_A[0].t_start_ms + 300_000;
  const targetB = absToMediaS(COV_B, absMs)!; // 300s na playlist de B
  b.handle.getCurrentTime.mockReturnValue(targetB + 10); // Δ=10s > 1.5s
  act(() =>
    a.props.onTime?.({ currentTime: 300, seekableStart: 0, seekableEnd: 2400 }),
  );
  expect(b.handle.seekTo).toHaveBeenCalledWith(targetB);

  // dentro da tolerância (Δ=0.5s) → NÃO re-seeka
  b.handle.seekTo.mockClear();
  b.handle.getCurrentTime.mockReturnValue(targetB + 1 + 0.5);
  act(() =>
    a.props.onTime?.({ currentTime: 301, seekableStart: 0, seekableEnd: 2400 }),
  );
  expect(b.handle.seekTo).not.toHaveBeenCalled();
});

test('célula em buraco de coverage pausa com overlay e RE-ENTRA quando o relógio alcança', async () => {
  const { a, b } = await enterDvr();
  // mestre em 900s → abs dentro do BURACO de B (entre as 2 janelas)
  act(() =>
    a.props.onTime?.({ currentTime: 900, seekableStart: 0, seekableEnd: 2400 }),
  );
  expect(b.handle.pause).toHaveBeenCalled();
  const gap = await screen.findByTestId('mosaic-gap-s2');
  expect(gap).toHaveTextContent('sem gravação neste instante');

  // relógio alcança a 2ª janela de B → célula re-seeka e volta a tocar
  const absMs = NOW - 1_100_000; // dentro de COV_B[1]
  const mediaA = (absMs - COV_A[0].t_start_ms) / 1000;
  b.handle.getCurrentTime.mockReturnValue(absToMediaS(COV_B, absMs)!);
  act(() =>
    a.props.onTime?.({ currentTime: mediaA, seekableStart: 0, seekableEnd: 2400 }),
  );
  expect(b.handle.play).toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByTestId('mosaic-gap-s2')).toBeNull());
});

test('clique na timeline compartilhada → seek-all com o tempo de mídia DE CADA célula', async () => {
  const { a, b, fromMs, toMs } = await enterDvr();
  const span = toMs - fromMs;
  // instante coberto pelas DUAS células (última janela de ambas);
  // clientX INTEIRO — MouseEvent.clientX é `long` no jsdom (trunca float)
  const targetAbs = NOW - 700_000;
  const clientX = Math.round(((targetAbs - fromMs) / span) * 1000);
  const track = screen.getByTestId('timeline-track');
  track.getBoundingClientRect = () =>
    ({ left: 0, width: 1000, top: 0, height: 24, right: 1000, bottom: 24, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  fireEvent.click(track, { clientX });

  const absClicked = Math.round(fromMs + Math.min(1, Math.max(0, clientX / 1000)) * span);
  expect(a.handle.seekTo).toHaveBeenCalledWith(absToMediaS(COV_A, absClicked));
  // a playlist de B comprime um buraco DIFERENTE → tempo de mídia distinto
  expect(b.handle.seekTo).toHaveBeenCalledWith(absToMediaS(COV_B, absClicked));
  expect(absToMediaS(COV_A, absClicked)).not.toBe(absToMediaS(COV_B, absClicked));
});

test('voltar pro Ao vivo restaura as URLs das câmeras', async () => {
  await enterDvr();
  fireEvent.click(screen.getByTestId('mosaic-mode-live'));
  await waitFor(() => {
    const urls = screen
      .getAllByTestId('hls-player')
      .map((el) => el.getAttribute('data-url'));
    expect(urls).toHaveLength(3);
    expect(urls.every((u) => u?.endsWith('live.m3u8'))).toBe(true);
  });
  expect(screen.queryByTestId('mosaic-timeline')).toBeNull();
});
