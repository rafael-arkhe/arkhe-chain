'use client';

/**
 * MosaicView — mosaico 2×N com dois modos:
 *
 *   AO VIVO   (original): um HlsPlayer por stream + AR overlay com as
 *             detecções do respectivo stream_id.
 *   GRAVAÇÃO  (DVR SINCRONIZADO): cada célula toca a playlist VOD da MESMA
 *             janela congelada, todas no MESMO relógio wall-clock.
 *
 * Arquitetura do sincronismo (modo Gravação):
 *
 *   - RELÓGIO MESTRE: a célula com MAIOR cobertura total na janela vira o
 *     mestre (minimiza trechos pulados — a playlist VOD do mestre comprime
 *     só os buracos DELE). Os controles são ÚNICOS: play/pause/velocidade/
 *     seek aplicam em todas as células via refs imperativos do HlsPlayer.
 *   - MAPEAMENTO POR CÉLULA: cada playlist comprime buracos DIFERENTES
 *     (EXT-X-DISCONTINUITY não soma tempo de mídia), então wall-clock ↔
 *     tempo de mídia usa SEMPRE a coverage da própria célula
 *     (lib/cctv-timeline.ts: absToMediaS / mediaToAbsMs).
 *   - CORREÇÃO DE DERIVA: a cada onTime do mestre, célula com desvio
 *     |atual − alvo| > DRIFT_TOLERANCE_S re-seeka pro alvo (drift de rede/
 *     decodificação acumula; abaixo da tolerância não mexe — seek constante
 *     causaria stutter).
 *   - BURACOS: instante do mestre fora da coverage da célula → a célula
 *     PAUSA com overlay honesto "sem gravação neste instante", estacionada
 *     no início da própria próxima janela (absToMediaS já mapeia buraco →
 *     próxima janela); quando o relógio do mestre alcança a coverage dela,
 *     re-seeka e volta a tocar sozinha.
 *   - TIMELINE COMPARTILHADA: embaixo, com as coverages de todas as células
 *     FUNDIDAS (mergeCoverage) + cursor do mestre; clique → seek-all.
 */
import { useCallback, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import {
  HlsPlayer,
  type HlsPlayerHandle,
  type PlayerTimeInfo,
} from './hls-player';
import { LprOverlay } from './lpr-overlay';
import { CameraTimeline } from './camera-timeline';
import {
  Cctv,
  type CCTVDetection,
  type CCTVStream,
  type RecordingCoverageWindow,
} from '@/lib/api/cctv';
import {
  absToMediaS,
  isInCoverage,
  mediaToAbsMs,
  mergeCoverage,
} from '@/lib/cctv-timeline';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/cn';
import type { MosaicCols } from '@/lib/cameras/mosaic';

/** Deriva máxima tolerada (s) entre o relógio mestre e cada célula antes
 *  de re-seekar. 1.5s ≈ meio segmento HLS curto: imperceptível no mosaico,
 *  grande o bastante pra não re-seekar a cada timeupdate. */
export const DRIFT_TOLERANCE_S = 1.5;

/** Janelas da gravação (h) — mesmas do player principal. */
const MOSAIC_WINDOW_HOURS = [1, 6, 24] as const;
type MosaicWindowHours = (typeof MOSAIC_WINDOW_HOURS)[number];

/** Velocidades aplicadas a TODAS as células (controle único). */
const MOSAIC_RATES = [
  { label: '½×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '4×', value: 4 },
] as const;

type DvrState = {
  /** janela CONGELADA na entrada — o mapeamento mídia↔wall-clock depende dela */
  fromMs: number;
  toMs: number;
  byStream: Record<string, RecordingCoverageWindow[]>;
  /** célula com MAIOR cobertura total — o relógio mestre */
  masterId: string;
  /** coverages fundidas — sombreado da timeline compartilhada */
  merged: RecordingCoverageWindow[];
};

type Props = {
  streams: CCTVStream[];
  detectionsByStreamId: Map<string, CCTVDetection[]>;
  showLPR: boolean;
  showFace: boolean;
  showObject: boolean;
  /** Colunas do mosaico ativo (§C C1). 'auto'/undefined = grade derivada da
   *  contagem (≈ raiz quadrada, teto 4); número = fixo escolhido pelo operador. */
  cols?: MosaicCols;
};

export function MosaicView({
  streams,
  detectionsByStreamId,
  showLPR,
  showFace,
  showObject,
  cols: colsProp,
}: Props) {
  const t = useT();
  const [mode, setMode] = useState<'live' | 'dvr'>('live');
  const [windowHours, setWindowHours] = useState<MosaicWindowHours>(1);
  const [dvr, setDvr] = useState<DvrState | null>(null);
  const [dvrError, setDvrError] = useState(false);
  const [cursorMs, setCursorMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1);
  /** células atualmente num buraco da PRÓPRIA gravação (overlay honesto) */
  const [gapped, setGapped] = useState<Record<string, boolean>>({});

  const cellRefs = useRef<Record<string, HlsPlayerHandle | null>>({});
  // Espelhos em ref pros handlers de onTime (anexados uma vez no player —
  // leem sempre o estado atual sem re-subscribe).
  const dvrRef = useRef<DvrState | null>(null);
  const gappedRef = useRef<Record<string, boolean>>({});
  const playingRef = useRef(true);
  const lastCursorTickRef = useRef(0);

  const enterDvr = useCallback(
    async (hours: MosaicWindowHours) => {
      setDvrError(false);
      try {
        const to = Date.now();
        const from = to - hours * 3_600_000;
        // coverage POR CÂMERA na MESMA janela; falha individual = sem gravação
        const results = await Promise.all(
          streams.map(async (s): Promise<[string, RecordingCoverageWindow[]]> => {
            try {
              const r = await Cctv.recordings.coverage(s.id, from, to);
              return [s.id, r.coverage];
            } catch {
              return [s.id, []];
            }
          }),
        );
        const withCoverage = results.filter(([, c]) => c.length > 0);
        if (!withCoverage.length) {
          // nenhuma célula tem gravação na janela → erro honesto, segue ao vivo
          setDvrError(true);
          return;
        }
        const totalMs = (c: RecordingCoverageWindow[]) =>
          c.reduce((acc, w) => acc + (w.t_end_ms - w.t_start_ms), 0);
        const masterId = withCoverage.reduce((best, cur) =>
          totalMs(cur[1]) > totalMs(best[1]) ? cur : best,
        )[0];
        const next: DvrState = {
          fromMs: from,
          toMs: to,
          byStream: Object.fromEntries(results),
          masterId,
          merged: mergeCoverage(withCoverage.map(([, c]) => c)),
        };
        dvrRef.current = next;
        gappedRef.current = {};
        playingRef.current = true;
        setGapped({});
        setDvr(next);
        setCursorMs(null);
        setPlaying(true);
        setMode('dvr');
      } catch {
        setDvrError(true);
      }
    },
    [streams],
  );

  const exitDvr = useCallback(() => {
    dvrRef.current = null;
    gappedRef.current = {};
    playingRef.current = true;
    setMode('live');
    setDvr(null);
    setDvrError(false);
    setCursorMs(null);
    setGapped({});
    setPlaying(true);
    setRate(1);
  }, []);

  const selectWindow = (h: MosaicWindowHours) => {
    setWindowHours(h);
    if (mode === 'dvr') void enterDvr(h);
  };

  /**
   * Sincroniza TODAS as células com o relógio do mestre (chamado a cada
   * onTime REAL do mestre):
   *   - célula cujo instante cai num BURACO da própria coverage → pausa +
   *     overlay, estacionada no início da próxima janela (re-entrada
   *     instantânea quando o relógio alcançar);
   *   - célula que estava em buraco e o instante voltou pra coverage →
   *     re-seeka e volta a tocar (se o mosaico está tocando);
   *   - célula em coverage com |Δ| > DRIFT_TOLERANCE_S → re-seeka
   *     (correção de deriva); dentro da tolerância não mexe.
   */
  const syncCells = useCallback(
    (absMs: number, d: DvrState) => {
      let gapChanged = false;
      for (const s of streams) {
        if (s.id === d.masterId) continue;
        const cov = d.byStream[s.id] ?? [];
        if (!cov.length) continue; // placeholder — sem player
        const ref = cellRefs.current[s.id];
        if (!ref) continue;
        const target = absToMediaS(cov, absMs);
        if (target === null) continue;
        if (!isInCoverage(cov, absMs)) {
          if (!gappedRef.current[s.id]) {
            gappedRef.current[s.id] = true;
            gapChanged = true;
            ref.pause();
            ref.seekTo(target); // início da próxima janela DELA
          }
          continue;
        }
        if (gappedRef.current[s.id]) {
          gappedRef.current[s.id] = false;
          gapChanged = true;
          ref.seekTo(target);
          if (playingRef.current) ref.play();
          continue;
        }
        if (Math.abs(ref.getCurrentTime() - target) > DRIFT_TOLERANCE_S) {
          ref.seekTo(target); // correção de deriva (> 1.5s)
        }
      }
      if (gapChanged) setGapped({ ...gappedRef.current });
    },
    [streams],
  );

  /** onTime do MESTRE → wall-clock (coverage DO MESTRE) → sync + cursor. */
  const handleMasterTime = useCallback(
    (info: PlayerTimeInfo) => {
      const d = dvrRef.current;
      if (!d) return;
      const absMs = mediaToAbsMs(d.byStream[d.masterId] ?? [], info.currentTime);
      if (absMs === null) return;
      syncCells(absMs, d);
      // cursor re-renderiza a página — throttle de 300ms (timeupdate é ~4×/s)
      const now = Date.now();
      if (now - lastCursorTickRef.current >= 300) {
        lastCursorTickRef.current = now;
        setCursorMs(absMs);
      }
    },
    [syncCells],
  );

  const handleMasterPlayState = useCallback((p: boolean) => {
    playingRef.current = p;
    setPlaying(p);
  }, []);

  const playAll = useCallback(() => {
    for (const s of streams) {
      if (gappedRef.current[s.id]) continue; // célula em buraco fica parada
      cellRefs.current[s.id]?.play();
    }
  }, [streams]);

  const pauseAll = useCallback(() => {
    for (const s of streams) cellRefs.current[s.id]?.pause();
  }, [streams]);

  const setRateAll = useCallback(
    (r: number) => {
      for (const s of streams) cellRefs.current[s.id]?.setRate(r);
    },
    [streams],
  );

  /** Clique na timeline compartilhada → seek-all: cada célula busca o
   *  tempo de mídia DA SUA playlist pro MESMO instante wall-clock. */
  const seekAll = useCallback(
    (absMs: number) => {
      const d = dvrRef.current;
      if (!d) return;
      let gapChanged = false;
      for (const s of streams) {
        const cov = d.byStream[s.id] ?? [];
        if (!cov.length) continue;
        const ref = cellRefs.current[s.id];
        if (!ref) continue;
        const target = absToMediaS(cov, absMs);
        if (target === null) continue;
        ref.seekTo(target);
        if (isInCoverage(cov, absMs)) {
          if (gappedRef.current[s.id]) {
            gappedRef.current[s.id] = false;
            gapChanged = true;
          }
          if (playingRef.current) ref.play();
        } else if (!gappedRef.current[s.id]) {
          gappedRef.current[s.id] = true;
          gapChanged = true;
          ref.pause();
        }
      }
      if (gapChanged) setGapped({ ...gappedRef.current });
      setCursorMs(absMs);
    },
    [streams],
  );

  // Colunas: explícitas quando o mosaico define um número; 'auto' (ou ausente)
  // deriva da contagem (raiz quadrada, teto 4) para caber recortes maiores.
  const autoCols =
    streams.length <= 1 ? 1 : Math.min(4, Math.ceil(Math.sqrt(streams.length)));
  const cols = typeof colsProp === 'number' ? colsProp : autoCols;
  const rows = Math.max(1, Math.ceil(streams.length / cols));
  const dvrState = mode === 'dvr' ? dvr : null;
  const inDvr = dvrState !== null;

  return (
    <div data-testid="mosaic-view" className="absolute inset-0 flex flex-col bg-deep">
      {/* header — alternância + controles ÚNICOS do relógio mestre */}
      <div className="h-9 px-2 shrink-0 border-b border-border-dark bg-deep flex items-center gap-2 overflow-x-auto scrollbar-hide">
        <div className="flex items-center text-[10px] uppercase tracking-[0.14em] shrink-0">
          <button
            type="button"
            data-testid="mosaic-mode-live"
            onClick={exitDvr}
            className={cn(
              'h-7 px-2 border',
              !inDvr
                ? 'bg-primary text-white border-primary'
                : 'bg-deep border-border-dark text-muted-on-dark hover:text-white',
            )}
          >
            {t('cameras.modeLive')}
          </button>
          <button
            type="button"
            data-testid="mosaic-mode-dvr"
            onClick={() => void enterDvr(windowHours)}
            className={cn(
              'h-7 px-2 border -ml-px',
              inDvr
                ? 'bg-primary text-white border-primary'
                : 'bg-deep border-border-dark text-muted-on-dark hover:text-white',
            )}
          >
            {t('cameras.modeDvr')}
          </button>
        </div>
        <div
          className="flex items-center gap-1 text-[10px] font-mono shrink-0"
          title={t('cameras.windowTitle')}
        >
          {MOSAIC_WINDOW_HOURS.map((h) => (
            <button
              key={h}
              type="button"
              data-testid={`mosaic-window-${h}h`}
              onClick={() => selectWindow(h)}
              className={cn(
                'h-7 px-1.5 border',
                windowHours === h
                  ? 'bg-primary text-white border-primary'
                  : 'bg-deep border-border-dark text-muted-on-dark hover:text-white',
              )}
            >
              {h}h
            </button>
          ))}
        </div>
        {dvrError && (
          <span
            data-testid="mosaic-dvr-error"
            className="text-[10px] font-mono text-danger shrink-0"
          >
            {t('cameras.mosaic.dvrUnavailable')}
          </span>
        )}
        {inDvr && (
          <>
            <button
              type="button"
              data-testid="mosaic-playpause"
              onClick={() => (playing ? pauseAll() : playAll())}
              aria-label={playing ? t('cameras.pause') : t('cameras.play')}
              title={playing ? t('cameras.pause') : t('cameras.play')}
              className="w-7 h-7 bg-deep border border-border-dark text-muted-on-dark hover:text-white flex items-center justify-center shrink-0"
            >
              {playing ? (
                <Pause className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
            </button>
            <div
              className="flex items-center gap-1 text-[10px] font-mono shrink-0"
              title={t('cameras.speed')}
            >
              {MOSAIC_RATES.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`mosaic-rate-${value}`}
                  onClick={() => setRateAll(value)}
                  className={cn(
                    'h-7 px-1.5 border',
                    rate === value
                      ? 'bg-primary text-white border-primary'
                      : 'bg-deep border-border-dark text-muted-on-dark hover:text-white',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* grade de células */}
      <div
        className="flex-1 grid gap-px bg-border-dark min-h-0"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {streams.map((s) => {
          const dets = detectionsByStreamId.get(s.id) ?? [];
          const cov = dvrState ? (dvrState.byStream[s.id] ?? []) : null;
          // GRAVAÇÃO sem coverage na janela → placeholder honesto (sem player)
          if (cov !== null && cov.length === 0) {
            return (
              <div
                key={s.id}
                data-testid={`mosaic-nocoverage-${s.id}`}
                className="relative bg-black overflow-hidden flex items-center justify-center"
              >
                <span className="px-2 py-1 text-[10px] font-mono text-white/70 border border-border-dark bg-deep/85">
                  {t('cameras.mosaic.noCoverageWindow')}
                </span>
                <div className="absolute left-0 right-0 bottom-0 px-2 py-1 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
                  <p className="text-[11px] text-white truncate font-semibold">{s.name}</p>
                </div>
              </div>
            );
          }
          const isMaster = dvrState !== null && dvrState.masterId === s.id;
          const url = dvrState
            ? Cctv.recordings.playlistUrl(s.id, dvrState.fromMs, dvrState.toMs)
            : s.url;
          return (
            <div key={s.id} className="relative bg-black overflow-hidden">
              <HlsPlayer
                ref={(h) => {
                  cellRefs.current[s.id] = h;
                }}
                url={url}
                autoPlay
                muted
                className="absolute inset-0 w-full h-full"
                // só o MESTRE alimenta o relógio — as outras células seguem
                onTime={isMaster ? handleMasterTime : undefined}
                onPlayState={isMaster ? handleMasterPlayState : undefined}
                onRate={isMaster ? setRate : undefined}
                overlay={
                  // AR só faz sentido AO VIVO (bbox é do frame atual da câmera)
                  cov === null ? (
                    <LprOverlay
                      detections={dets}
                      showLPR={showLPR}
                      showFace={showFace}
                      showObject={showObject}
                    />
                  ) : null
                }
              />
              {/* célula num buraco DA PRÓPRIA gravação — pausada, esperando
                  o relógio do mestre alcançar a próxima janela dela */}
              {cov !== null && gapped[s.id] && (
                <div
                  data-testid={`mosaic-gap-${s.id}`}
                  className="absolute inset-0 z-20 bg-black/70 flex items-center justify-center pointer-events-none"
                >
                  <span className="px-2 py-1 text-[10px] font-mono text-white/80 border border-border-dark bg-deep/85">
                    {t('cameras.mosaic.gapInstant')}
                  </span>
                </div>
              )}
              <div className="absolute top-1 left-1 right-1 z-30 flex items-center justify-between gap-1 pointer-events-none">
                {cov === null ? (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-danger/90 text-[9px] font-mono font-semibold text-white uppercase">
                    <span className="w-1 h-1 bg-white animate-pulse" />
                    {t('cameras.mosaic.liveBadge')}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-primary/90 text-[9px] font-mono font-semibold text-white uppercase">
                    {t('cameras.modeDvr')}
                  </span>
                )}
                {cov === null && dets.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-primary/90 text-[9px] font-mono font-semibold text-white uppercase">
                    {dets.length} {t('cameras.mosaic.detections')}
                  </span>
                )}
              </div>
              <div className="absolute left-0 right-0 bottom-0 z-30 px-2 py-1 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
                <p className="text-[11px] text-white truncate font-semibold">{s.name}</p>
                <p className="text-[9px] font-mono text-white/70 truncate">
                  {s.city || s.source_type || s.id}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* timeline COMPARTILHADA — coverages fundidas + cursor do mestre */}
      {dvrState && (
        <div
          data-testid="mosaic-timeline"
          className="shrink-0 bg-panel-light border-t border-border-light px-3 py-2 flex items-center gap-3"
        >
          <CameraTimeline
            fromMs={dvrState.fromMs}
            toMs={dvrState.toMs}
            coverage={dvrState.merged}
            detections={[]}
            bookmarks={[]}
            cursorMs={cursorMs}
            onSeek={seekAll}
          />
        </div>
      )}
    </div>
  );
}
