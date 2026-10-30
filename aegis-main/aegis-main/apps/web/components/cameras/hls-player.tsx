'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, Loader2, WifiOff } from 'lucide-react';
import { useT } from '@/lib/i18n/provider';

/** Recuperação do caminho hls.js: erro fatal de REDE tenta `hls.startLoad()`
 *  com backoff exponencial (2s → 4s → 8s, máx 3 tentativas); erro de MÍDIA
 *  tenta `hls.recoverMediaError()` (máx 2). Esgotado → erro terminal. */
const HLS_NETWORK_MAX_RETRIES = 3;
const HLS_MEDIA_MAX_RETRIES = 2;
const HLS_BACKOFF_BASE_MS = 2000;
/** Caminho NATIVO (Safari/WebKit): recarrega a playlist (re-set de video.src)
 *  NATIVE_RETRY_DELAY_MS após cada falha, até NATIVE_MAX_RETRIES tentativas
 *  antes do erro terminal. */
const NATIVE_MAX_RETRIES = 5;
const NATIVE_RETRY_DELAY_MS = 5000;

/** Snapshot de tempo emitido a cada `timeupdate` REAL do `<video>`. */
export interface PlayerTimeInfo {
  /** posição atual em segundos (tempo de MÍDIA — VOD: desde o início da
   *  playlist; live: relógio interno do hls.js) */
  currentTime: number;
  /** janela `video.seekable` real (live = janela do playlist HLS); null
   *  quando o browser ainda não expôs seekable */
  seekableStart: number | null;
  seekableEnd: number | null;
}

/** API IMPERATIVA real do player — nada decorativo: cada método toca o
 *  `<video>` de verdade. Aditivo: consumidores sem ref (mosaic-view)
 *  seguem intactos. */
export interface HlsPlayerHandle {
  play(): void;
  pause(): void;
  /** seek absoluto em segundos de mídia (clamp na janela seekable/0) */
  seekTo(seconds: number): void;
  /** seek relativo (ex.: -10 = Voltar 10s), com o mesmo clamp */
  seekBy(deltaSeconds: number): void;
  setRate(rate: number): void;
  getCurrentTime(): number;
  getSeekable(): { start: number; end: number } | null;
}

type Props = {
  url: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  /** Conteúdo desenhado SOBRE o vídeo no mesmo wrapper `aspect-video`.
   *  Coordenadas em viewBox 1280x720 = pixel space do frame original. */
  overlay?: React.ReactNode;
  onReady?: () => void;
  onError?: (msg: string) => void;
  /** `timeupdate` real do video (página usa pro cursor da timeline). */
  onTime?: (info: PlayerTimeInfo) => void;
  /** eventos `play`/`pause` REAIS — o ícone da página segue isto. */
  onPlayState?: (playing: boolean) => void;
  /** evento `ratechange` real — o destaque de velocidade segue isto. */
  onRate?: (rate: number) => void;
};

/**
 * Segmentos .ts da GRAVAÇÃO chegam na playlist VOD com URL ABSOLUTA do
 * backend (ex.: http://host:8002/api/v1/cctv/recordings/<sha>.ts) e exigem
 * auth de operador. O browser não tem o token em JS (cookie httpOnly) —
 * reescrevemos pro proxy do Next (/api/...), que injeta o Bearer.
 * Qualquer outra URL (câmeras externas, playlists) passa intocada.
 */
export function rewriteRecordingUrlToProxy(url: string): string {
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, base);
    if (parsed.pathname.startsWith('/api/v1/cctv/recordings/')) {
      return `/api${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // URL inválida — deixa o hls.js reportar o erro real
  }
  return url;
}

/**
 * Câmera-SNAPSHOT: a fonte publica uma IMAGEM que atualiza (JPEG/PNG) em vez de
 * HLS de vídeo — ex.: CETSP (`/cams/{n}/1.jpg`) e DAER/RS (`imagem.php?id=...`).
 * HLS é SEMPRE `.m3u8`; qualquer imagem ou endpoint de imagem cai aqui. Detecção
 * pela URL porque o player só recebe a URL (sem o metadata do stream).
 */
export function isSnapshotUrl(url: string): boolean {
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const p = new URL(url, base).pathname.toLowerCase();
    if (/\.(jpe?g|png|gif|bmp|webp)$/.test(p)) return true;
    if (p.includes('imagem') || p.includes('snapshot')) return true;
  } catch {
    /* URL inválida — trata como stream normal, o hls.js reporta o erro real */
  }
  return false;
}

/**
 * Player HLS (hls.js + Safari nativo) num wrapper `aspect-video` (16:9).
 *
 * Critical pro AR: o `<video>` usa `object-cover` para preencher EXATAMENTE
 * o wrapper, e o `overlay` é renderizado no mesmo wrapper. Sem isso a bbox
 * do SVG flutua sobre as bordas pretas do letterbox.
 */
export const HlsPlayer = forwardRef<HlsPlayerHandle, Props>(function HlsPlayer(
  {
    url,
    className,
    autoPlay = true,
    muted = true,
    controls = false,
    overlay,
    onReady,
    onError,
    onTime,
    onPlayState,
    onRate,
  }: Props,
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');
  const [msg, setMsg] = useState<string>('');
  // Contadores de recuperação em ref: os handlers assíncronos (timers/eventos)
  // leem o valor ATUAL sem religar listeners. network/media = caminho hls.js;
  // native = recarregamentos da playlist no caminho Safari/WebKit. Zerados a
  // cada attach novo e quando um manifest novo carrega.
  const retryRef = useRef({ network: 0, media: 0, native: 0 });
  const t = useT();

  // Câmera-snapshot (JPEG que atualiza — CETSP/DAER): renderiza <img> com
  // refresh em vez de tocar como vídeo (senão o <video> dá "falha de stream
  // nativa" ao receber um JPEG). Detecta pela URL.
  const isSnapshot = isSnapshotUrl(url);
  const [snapTick, setSnapTick] = useState(0);
  const snapReadyRef = useRef(false);

  // Callbacks em refs: os listeners do <video> são anexados UMA vez e leem
  // sempre a versão atual — sem re-subscribe quando a página re-renderiza.
  const onTimeRef = useRef(onTime);
  const onPlayStateRef = useRef(onPlayState);
  const onRateRef = useRef(onRate);
  onTimeRef.current = onTime;
  onPlayStateRef.current = onPlayState;
  onRateRef.current = onRate;

  const seekableRange = (video: HTMLVideoElement) => {
    const s = video.seekable;
    if (!s || s.length === 0) return null;
    return { start: s.start(0), end: s.end(s.length - 1) };
  };

  useImperativeHandle(ref, () => {
    const clampSeek = (video: HTMLVideoElement, t: number) => {
      const range = seekableRange(video);
      if (range) return Math.min(range.end, Math.max(range.start, t));
      return Math.max(0, t);
    };
    return {
      play: () => {
        const p = videoRef.current?.play();
        // autoplay policy pode rejeitar — erro real aparece nos eventos
        if (p && typeof p.catch === 'function') p.catch(() => {});
      },
      pause: () => videoRef.current?.pause(),
      seekTo: (seconds: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = clampSeek(video, seconds);
      },
      seekBy: (delta: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = clampSeek(video, video.currentTime + delta);
      },
      setRate: (rate: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.playbackRate = rate;
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      getSeekable: () =>
        videoRef.current ? seekableRange(videoRef.current) : null,
    };
  }, []);

  // Eventos REAIS do <video> — anexados uma vez por montagem.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTime = () => {
      const range = seekableRange(video);
      onTimeRef.current?.({
        currentTime: video.currentTime,
        seekableStart: range?.start ?? null,
        seekableEnd: range?.end ?? null,
      });
    };
    const handlePlay = () => onPlayStateRef.current?.(true);
    const handlePause = () => onPlayStateRef.current?.(false);
    const handleRate = () => onRateRef.current?.(video.playbackRate);
    video.addEventListener('timeupdate', handleTime);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ratechange', handleRate);
    return () => {
      video.removeEventListener('timeupdate', handleTime);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ratechange', handleRate);
    };
  }, []);

  useEffect(() => {
    // Snapshot: sem HLS/<video>. Só um timer que troca a query `_t` p/ o
    // browser rebuscar o JPEG (~3s). O <img> reporta ready/erro nos seus
    // próprios eventos (onLoad/onError abaixo).
    if (isSnapshot) {
      setState('loading');
      setMsg('');
      snapReadyRef.current = false;
      const iv = setInterval(() => setSnapTick((t) => t + 1), 3000);
      return () => clearInterval(iv);
    }
    const video = videoRef.current;
    if (!video) return;
    setState('loading');
    setMsg('');
    // Attach NOVO (troca de url/remount) → orçamento de recuperação zerado.
    retryRef.current.network = 0;
    retryRef.current.media = 0;
    retryRef.current.native = 0;

    let hls: import('hls.js').default | null = null;
    let cancelled = false;
    // Timer de recuperação pendente (backoff hls.js / reload nativo) —
    // limpo SEMPRE no cleanup, junto do hls.destroy()/video.load().
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

    const handleError = (m: string) => {
      if (cancelled) return;
      setState('error');
      setMsg(m);
      onError?.(m);
    };

    const tryAttach = async () => {
      // 🔴 2026-09-09 — hls.js PRIMEIRO. Antes: `canPlayType('application/
      // vnd.apple.mpegurl')` decidia o caminho, e o Chromium/Edge (WebView2
      // incl.) ANUNCIA HLS nativo que não sustenta a playlist (no-store +
      // byte-range): 25s de tela preta (5×5s) e "falha de stream nativa",
      // às vezes entrando depois de vários cliques. O hls.js (MSE) é o que
      // funciona — provado no FAB/Desktop; nativo vira FALLBACK para
      // ambiente sem MSE (iOS antigo).
      let hlsjs: typeof import('hls.js').default | null = null;
      try {
        hlsjs = (await import('hls.js')).default;
      } catch {
        // import falhou — caminho nativo abaixo
      }
      const usarHls = hlsjs !== null && hlsjs.isSupported();
      if (!usarHls && video.canPlayType('application/vnd.apple.mpegurl')) {
        // Caminho NATIVO (Safari/WebKit). O listener de error é PERSISTENTE:
        // cada falha agenda recarregar a playlist (re-set de video.src) após
        // NATIVE_RETRY_DELAY_MS, até NATIVE_MAX_RETRIES tentativas; esgotou,
        // erro terminal.
        const loadNative = () => {
          video.src = url;
          video.addEventListener(
            'canplay',
            () => {
              if (cancelled) return;
              setState('playing');
              onReady?.();
            },
            { once: true },
          );
        };
        loadNative();
        video.addEventListener('error', () => {
          // guards anti-race: desmontado, ou o src já é de outro carregamento
          if (cancelled || video.getAttribute('src') !== url) return;
          if (retryRef.current.native >= NATIVE_MAX_RETRIES) {
            handleError(t('cameras.hls.nativeError').replace('{url}', url));
            return;
          }
          retryRef.current.native += 1;
          if (recoveryTimer) clearTimeout(recoveryTimer);
          recoveryTimer = setTimeout(() => {
            if (cancelled || video.getAttribute('src') !== url) return;
            loadNative();
          }, NATIVE_RETRY_DELAY_MS);
        });
        return;
      }
      if (usarHls && hlsjs) {
        const Hls = hlsjs;
        // VOD da gravação: .ts content-addressed exigem o Bearer — o proxy
        // do Next injeta a partir do cookie httpOnly. A troca de URL é no
        // LOADER (context.url antes do load), porque xhrSetup NÃO basta: o
        // hls.js pode reabrir o XHR com a URL original (fragmento .ts
        // escapou pro túnel público e deu 404 — provado pelo gesto em
        // 2026-06-12). Subclasse cobre playlist E fragmentos.
        type AnyLoader = {
          load(ctx: { url?: string }, c: unknown, cb: unknown): void;
        };
        const BaseLoader = Hls.DefaultConfig.loader as unknown as new (
          cfg: unknown,
        ) => AnyLoader;
        class ProxyLoader extends BaseLoader {
          load(
            context: { url?: string },
            config: unknown,
            callbacks: unknown,
          ): void {
            if (context?.url) context.url = rewriteRecordingUrlToProxy(context.url);
            super.load(context, config, callbacks);
          }
        }
        // Instância em CONST local: dentro dos handlers o `hls` externo é
        // `| null` para o TS (variável mutável capturada por closure).
        // 🔴 Controle de latência (2026-09-09): segmentos de 2s; alvo de 3
        // segmentos (~6s atrás do vivo) e TETO de 7 (~14s) — sem o teto, cada
        // soluço de rede empurra o buffer e o hls.js NUNCA reencaixa no vivo
        // (atraso observado em campo crescendo até >1min). O 1.5x reencaixa
        // suave (acelera em vez de pular).
        const player = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          loader: ProxyLoader as never,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 7,
          maxLiveSyncPlaybackRate: 1.5,
        });
        hls = player;
        player.loadSource(url);
        player.attachMedia(video);
        player.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          // Manifest novo carregou → recuperação provada; orçamento renovado.
          retryRef.current.network = 0;
          retryRef.current.media = 0;
          setState('playing');
          onReady?.();
        });
        player.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          // ErrorTypes do hls.js são as strings estáveis 'networkError'/
          // 'mediaError' — comparadas cru para não depender do objeto estático
          // Hls.ErrorTypes (ausente no mock do jest).
          const tipo = String(data.type);
          if (
            tipo === 'networkError' &&
            retryRef.current.network < HLS_NETWORK_MAX_RETRIES
          ) {
            // Backoff exponencial: 2000 → 4000 → 8000 ms.
            retryRef.current.network += 1;
            const delay =
              HLS_BACKOFF_BASE_MS * 2 ** (retryRef.current.network - 1);
            if (recoveryTimer) clearTimeout(recoveryTimer);
            recoveryTimer = setTimeout(() => {
              if (cancelled) return;
              player.startLoad();
            }, delay);
            return;
          }
          if (
            tipo === 'mediaError' &&
            retryRef.current.media < HLS_MEDIA_MAX_RETRIES
          ) {
            retryRef.current.media += 1;
            player.recoverMediaError();
            return;
          }
          handleError(`HLS ${data.type}: ${data.details}`);
        });
      }
      handleError(t('cameras.hls.noMseSupport'));
    };

    tryAttach();

    return () => {
      cancelled = true;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      if (hls) hls.destroy();
      if (video) {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [url, onReady, onError, isSnapshot]);

  return (
    <div
      className={className ?? 'w-full h-full bg-black flex items-center justify-center'}
      data-testid="hls-player"
    >
      {/* Wrapper que MANTÉM aspect 16:9. Video + overlay cobrem este box
          juntos, então as bboxes do AR alinham 1:1 com os pixels do vídeo. */}
      <div
        className="relative w-full h-full max-w-full max-h-full"
        style={{ aspectRatio: '16 / 9' }}
      >
        {isSnapshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${url}${url.includes('?') ? '&' : '?'}_t=${snapTick}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover bg-black"
            onLoad={() => {
              setState('playing');
              if (!snapReadyRef.current) {
                snapReadyRef.current = true;
                onReady?.();
              }
            }}
            onError={() => {
              const m = t('cameras.hls.snapshotError');
              setState('error');
              setMsg(m);
              onError?.(m);
            }}
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay={autoPlay}
            muted={muted}
            playsInline
            controls={controls}
            className="absolute inset-0 w-full h-full object-cover bg-black"
          />
        )}
        {overlay && (
          <div className="absolute inset-0 pointer-events-none" data-testid="hls-overlay-slot">
            {overlay}
          </div>
        )}
        {state === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2 z-20">
            <Loader2 className="w-5 h-5 animate-spin text-primary" strokeWidth={1.5} />
            <p className="text-[11px] font-mono text-white/80">{isSnapshot ? 'Carregando imagem…' : t('cameras.hls.connecting')}</p>
          </div>
        )}
        {state === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-2 text-danger z-20">
            <WifiOff className="w-5 h-5" strokeWidth={1.5} />
            <p className="text-[11px] font-mono">{msg}</p>
            <p className="text-[10px] font-mono text-white/60">{url}</p>
          </div>
        )}
      </div>
    </div>
  );
});

export function HlsBadge({ live }: { live: boolean }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ' +
        (live ? 'bg-danger/90 text-white' : 'bg-warning/85 text-black')
      }
    >
      {live ? (
        <>
          <span className="w-1 h-1 bg-white animate-pulse" />
          ao vivo
        </>
      ) : (
        <>
          <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
          buffer offline
        </>
      )}
    </span>
  );
}
