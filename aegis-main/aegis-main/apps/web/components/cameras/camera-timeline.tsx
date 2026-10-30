'use client';

/**
 * CameraTimeline — barra temporal REAL de /cameras (posição = tempo).
 *
 * Substitui a antiga faixa de chips pseudo-aleatória (left = (i*13)%100):
 *   - escala LINEAR de tempo na janela [fromMs, toMs];
 *   - janelas de coverage da GRAVAÇÃO sombreadas;
 *   - marcadores de detecção posicionados pelo detected_at REAL;
 *   - bookmarks como marcadores DISTINTOS (acento primário);
 *   - cursor de posição atual avançando com o onTime do player;
 *   - clique na faixa → onSeek do instante (só quando o modo permite —
 *     sem handler a faixa não é clicável, nada decorativo);
 *   - timestamps em JetBrains Mono (font-mono), cantos retos.
 */
import { posPct, type CoverageWindow } from '@/lib/cctv-timeline';
import { formatHoraSegBR } from '@/lib/datetime';
import { cn } from '@/lib/cn';

export interface TimelineDetection {
  id: string;
  atMs: number;
  label: string;
  confidence: number;
  entityId: string | null;
}

export interface TimelineBookmark {
  id: string;
  atMs: number;
  label: string;
}

type Props = {
  fromMs: number;
  toMs: number;
  coverage: CoverageWindow[];
  detections: TimelineDetection[];
  bookmarks: TimelineBookmark[];
  /** posição atual (wall-clock ms) — null esconde o cursor */
  cursorMs: number | null;
  /** presente = faixa clicável (modo Gravação); ausente = só marcadores */
  onSeek?: (absMs: number) => void;
  onDetectionClick?: (d: TimelineDetection) => void;
  onBookmarkClick?: (b: TimelineBookmark) => void;
};

export function CameraTimeline({
  fromMs,
  toMs,
  coverage,
  detections,
  bookmarks,
  cursorMs,
  onSeek,
  onDetectionClick,
  onBookmarkClick,
}: Props) {
  const span = Math.max(1, toMs - fromMs);
  const inWindow = (atMs: number) => atMs >= fromMs && atMs <= toMs;

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(Math.round(fromMs + frac * span));
  };

  return (
    <div
      data-testid="camera-timeline"
      className="flex-1 min-w-[240px] flex flex-col gap-0.5"
    >
      <div
        data-testid="timeline-track"
        onClick={handleTrackClick}
        className={cn(
          'relative h-6 bg-raised-light border border-border-light overflow-hidden',
          onSeek && 'cursor-pointer',
        )}
      >
        {/* coverage da gravação — sombreado por tempo */}
        {coverage.map((w, i) => {
          const left = posPct(w.t_start_ms, fromMs, toMs);
          const right = posPct(w.t_end_ms, fromMs, toMs);
          if (right <= left) return null;
          return (
            <div
              key={`${w.t_start_ms}-${w.t_end_ms}`}
              data-testid={`timeline-coverage-${i}`}
              className="absolute inset-y-0 bg-primary/25 pointer-events-none"
              style={{ left: `${left}%`, width: `${right - left}%` }}
            />
          );
        })}

        {/* detecções — posição = detected_at REAL */}
        {detections.filter((d) => inWindow(d.atMs)).map((d) => (
          <button
            key={d.id}
            type="button"
            data-testid={`timeline-detection-${d.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onDetectionClick?.(d);
            }}
            title={`${d.label} · ${formatHoraSegBR(new Date(d.atMs))}`}
            className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 bg-warning hover:w-[4px]"
            style={{
              left: `${posPct(d.atMs, fromMs, toMs)}%`,
              opacity: 0.5 + d.confidence * 0.5,
            }}
          />
        ))}

        {/* bookmarks — marcador DISTINTO (acento primário, cabeça quadrada) */}
        {bookmarks.filter((b) => inWindow(b.atMs)).map((b) => (
          <button
            key={b.id}
            type="button"
            data-testid={`timeline-bookmark-${b.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onBookmarkClick?.(b);
            }}
            title={`${b.label} · ${formatHoraSegBR(new Date(b.atMs))}`}
            className="absolute top-0 bottom-0 w-[3px] -translate-x-1/2 bg-primary"
            style={{ left: `${posPct(b.atMs, fromMs, toMs)}%` }}
          >
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-primary" />
          </button>
        ))}

        {/* cursor de posição atual */}
        {cursorMs !== null && inWindow(cursorMs) && (
          <div
            data-testid="timeline-cursor"
            className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 bg-text-on-light pointer-events-none"
            style={{ left: `${posPct(cursorMs, fromMs, toMs)}%` }}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-[9px] font-mono text-muted-on-light leading-none">
        <span data-testid="timeline-from">{formatHoraSegBR(new Date(fromMs))}</span>
        {cursorMs !== null && inWindow(cursorMs) && (
          <span data-testid="timeline-cursor-time" className="text-text-on-light">
            {formatHoraSegBR(new Date(cursorMs))}
          </span>
        )}
        <span data-testid="timeline-to">{formatHoraSegBR(new Date(toMs))}</span>
      </div>
    </div>
  );
}
