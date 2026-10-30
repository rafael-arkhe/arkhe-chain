'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { CCTVDetection, CCTVStream } from '@/lib/api/cctv';
import { Cctv, nonAggregate } from '@/lib/api/cctv';
import { cn } from '@/lib/cn';
import { ModalPortal } from '@/components/ui/modal-backdrop';

type Props = {
  stream: CCTVStream;
  onClose: () => void;
};

const WINDOWS = [
  { label: '5 min', minutes: 5 },
  { label: '30 min', minutes: 30 },
  { label: '60 min', minutes: 60 },
  { label: '24 h', minutes: 1440 },
];

/**
 * Heatmap 2D agregando bboxes de todas detecções no intervalo selecionado.
 * Cada bbox vira um blob gaussiano no canvas, com cor por densidade.
 */
export function HeatmapModal({ stream, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [windowMin, setWindowMin] = useState(60);
  const [detections, setDetections] = useState<CCTVDetection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Pega histórico do stream selecionado limit alto.
        const d = await Cctv.streams.detections(stream.id, 500);
        const cutoff = Date.now() - windowMin * 60_000;
        const filtered = d
          .filter(nonAggregate)
          .filter((x) => new Date(x.detected_at).getTime() >= cutoff);
        if (!cancelled) setDetections(filtered);
      } catch {
        if (!cancelled) setDetections([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stream.id, windowMin]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = (canvas.width = 1280);
    const H = (canvas.height = 720);
    ctx.clearRect(0, 0, W, H);
    // background escuro
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // blobs por detecção
    for (const d of detections) {
      if (!d.bbox) continue;
      const [x0, y0, x1, y1] = d.bbox;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const r = Math.max(40, ((x1 - x0) + (y1 - y0)) / 2);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const baseHue =
        d.kind === 'lpr' ? 30 : d.kind === 'face' ? 0 : 50; // laranja / vermelho / amarelo
      grad.addColorStop(0, `hsla(${baseHue}, 100%, 60%, 0.55)`);
      grad.addColorStop(0.6, `hsla(${baseHue}, 100%, 50%, 0.18)`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }, [detections]);

  return (
    <ModalPortal>
    <div
      data-testid="heatmap-modal"
      className="fixed inset-0 z-50 flex items-center justify-center ds-overlay p-6"
      onClick={onClose}
    >
      <div
        className="bg-canvas-light text-text-on-light border border-border-light max-w-5xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="h-10 px-3 border-b border-border-light flex items-center gap-3 bg-panel-light">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider">
            Heatmap · {stream.name}
          </h3>
          <span className="text-[10px] font-mono text-muted-on-light">
            {detections.length} detecções na janela
          </span>
          <div className="ml-auto flex items-center gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.minutes}
                type="button"
                onClick={() => setWindowMin(w.minutes)}
                className={cn(
                  'h-6 px-2 text-[10px] font-mono uppercase tracking-wide border',
                  windowMin === w.minutes
                    ? 'bg-primary text-white border-primary'
                    : 'border-border-light hover:border-primary',
                )}
              >
                {w.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center hover:bg-raised-light ml-1"
              aria-label="Fechar"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </header>
        <div className="p-4 flex-1 overflow-auto">
          {loading ? (
            <p className="text-[11px] font-mono text-muted-on-light text-center py-10">
              Carregando…
            </p>
          ) : detections.length === 0 ? (
            <p className="text-[11px] font-mono text-muted-on-light text-center py-10">
              Sem detecções no intervalo. Aguardando cctv-worker.
            </p>
          ) : (
            <canvas ref={canvasRef} className="w-full h-auto border border-border-light" />
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
