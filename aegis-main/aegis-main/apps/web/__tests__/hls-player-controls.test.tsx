/**
 * HlsPlayer OPERACIONAL — API imperativa real (ref) + eventos do <video>.
 *
 * Invariantes:
 *  - ref.play()/pause() chamam o <video> DE VERDADE;
 *  - ref.seekTo/seekBy mexem currentTime real (clamp em 0 sem seekable);
 *  - ref.setRate seta playbackRate real;
 *  - onTime segue 'timeupdate'; onPlayState segue 'play'/'pause' do video
 *    (o ícone da página segue o estado REAL, nunca um boolean decorativo);
 *  - onRate segue 'ratechange';
 *  - VOD da gravação: os .ts content-addressed resolvem pro proxy
 *    autenticado do Next via LOADER subclass (context.url reescrito antes
 *    do load) — xhrSetup NÃO basta: o hls.js pode reabrir o XHR com a URL
 *    original (404 no túnel provado pelo gesto em 2026-06-12).
 */
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react';

jest.mock('hls.js', () => {
  const baseLoads: string[] = [];
  class MockBaseLoader {
    load(context: { url?: string }) {
      baseLoads.push(String(context?.url ?? ''));
    }
  }
  class MockHls {
    static __last: MockHls | null = null;
    static __baseLoads = baseLoads;
    static DefaultConfig = { loader: MockBaseLoader };
    static isSupported() {
      return true;
    }
    static Events = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError' };
    config: Record<string, unknown>;
    handlers: Record<string, (...a: unknown[]) => void> = {};
    loadSource = jest.fn();
    attachMedia = jest.fn();
    destroy = jest.fn();
    constructor(config: Record<string, unknown>) {
      this.config = config;
      MockHls.__last = this;
    }
    on(event: string, cb: (...a: unknown[]) => void) {
      this.handlers[event] = cb;
    }
  }
  return { __esModule: true, default: MockHls };
});

import {
  HlsPlayer,
  rewriteRecordingUrlToProxy,
  type HlsPlayerHandle,
} from '@/components/cameras/hls-player';

const playSpy = jest
  .spyOn(window.HTMLMediaElement.prototype, 'play')
  .mockImplementation(() => Promise.resolve());
const pauseSpy = jest
  .spyOn(window.HTMLMediaElement.prototype, 'pause')
  .mockImplementation(() => {});

beforeEach(() => {
  playSpy.mockClear();
  pauseSpy.mockClear();
});

function setup() {
  const ref = React.createRef<HlsPlayerHandle>();
  const onTime = jest.fn();
  const onPlayState = jest.fn();
  const onRate = jest.fn();
  const utils = render(
    <HlsPlayer
      ref={ref}
      url="https://cam.example/live.m3u8"
      onTime={onTime}
      onPlayState={onPlayState}
      onRate={onRate}
    />,
  );
  const video = utils.container.querySelector('video') as HTMLVideoElement;
  // jsdom não implementa playback — propriedades graváveis pro teste
  Object.defineProperty(video, 'currentTime', { writable: true, value: 0 });
  Object.defineProperty(video, 'playbackRate', { writable: true, value: 1 });
  return { ref, onTime, onPlayState, onRate, video, ...utils };
}

test('play/pause imperativos chamam o <video> real', () => {
  const { ref } = setup();
  act(() => ref.current!.play());
  expect(playSpy).toHaveBeenCalledTimes(1);
  act(() => ref.current!.pause());
  expect(pauseSpy).toHaveBeenCalledTimes(1);
});

test('seekTo/seekBy mexem currentTime real (clamp em 0)', () => {
  const { ref, video } = setup();
  act(() => ref.current!.seekTo(42));
  expect(video.currentTime).toBe(42);
  act(() => ref.current!.seekBy(-10));
  expect(video.currentTime).toBe(32);
  act(() => ref.current!.seekBy(-999));
  expect(video.currentTime).toBe(0);
});

test('setRate seta playbackRate real', () => {
  const { ref, video } = setup();
  act(() => ref.current!.setRate(2));
  expect(video.playbackRate).toBe(2);
  act(() => ref.current!.setRate(0.25));
  expect(video.playbackRate).toBe(0.25);
});

test('onTime segue timeupdate com o currentTime real', () => {
  const { onTime, video } = setup();
  video.currentTime = 7;
  fireEvent.timeUpdate(video);
  expect(onTime).toHaveBeenCalledWith(
    expect.objectContaining({ currentTime: 7 }),
  );
});

test('onPlayState segue eventos play/pause REAIS do video', () => {
  const { onPlayState, video } = setup();
  fireEvent.play(video);
  expect(onPlayState).toHaveBeenLastCalledWith(true);
  fireEvent.pause(video);
  expect(onPlayState).toHaveBeenLastCalledWith(false);
});

test('onRate segue ratechange com o playbackRate real', () => {
  const { onRate, video } = setup();
  video.playbackRate = 0.5;
  fireEvent(video, new Event('ratechange'));
  expect(onRate).toHaveBeenLastCalledWith(0.5);
});

describe('rewriteRecordingUrlToProxy — segmentos .ts autenticados via proxy', () => {
  const SHA = 'a'.repeat(64);
  test('URL absoluta do backend vira path do proxy /api', () => {
    expect(
      rewriteRecordingUrlToProxy(`http://localhost:8002/api/v1/cctv/recordings/${SHA}.ts`),
    ).toBe(`/api/api/v1/cctv/recordings/${SHA}.ts`);
  });
  test('URL externa de câmera passa intocada', () => {
    expect(rewriteRecordingUrlToProxy('https://dot.example/cam5.m3u8')).toBe(
      'https://dot.example/cam5.m3u8',
    );
  });
  test('playlist já proxiada passa intocada', () => {
    const u = '/api/api/v1/cctv/streams/st-1/recordings/playlist.m3u8?from_ms=1&to_ms=2';
    expect(rewriteRecordingUrlToProxy(u)).toBe(u);
  });
});

test('loader do hls.js reescreve o .ts da gravação pro proxy ANTES do load', async () => {
  setup();
  const Hls = (jest.requireMock('hls.js') as unknown as {
    default: {
      __last: { config: { loader?: new () => { load: (c: { url: string }, cfg: unknown, cb: unknown) => void } } } | null;
      __baseLoads: string[];
    };
  }).default;
  await waitFor(() => expect(Hls.__last).not.toBeNull());
  const LoaderClass = Hls.__last!.config.loader;
  expect(typeof LoaderClass).toBe('function');
  Hls.__baseLoads.length = 0;
  const SHA = 'b'.repeat(64);
  const loader = new LoaderClass!();
  // fragmento da gravação (URL absoluta resolvida pelo hls.js) → proxy
  loader.load({ url: `http://localhost:3002/api/v1/cctv/recordings/${SHA}.ts` }, {}, {});
  // URL que não é gravação (câmera externa) → intocada
  loader.load({ url: 'https://dot.example/cam5.m3u8' }, {}, {});
  expect(Hls.__baseLoads).toEqual([
    `/api/api/v1/cctv/recordings/${SHA}.ts`,
    'https://dot.example/cam5.m3u8',
  ]);
});
