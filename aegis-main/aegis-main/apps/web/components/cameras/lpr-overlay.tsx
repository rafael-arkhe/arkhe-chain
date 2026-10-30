'use client';

import { useEffect, useState } from 'react';
import type { CCTVDetection } from '@/lib/api/cctv';
import { useT } from '@/lib/i18n/provider';
import { detectionClassLabel, detectionKindLabel } from '@/lib/i18n/detection';

type Props = {
  detections: CCTVDetection[];
  refWidth?: number;
  refHeight?: number;
  showLPR?: boolean;
  showFace?: boolean;
  showObject?: boolean;
  /** Janela em ms para considerar uma detecção "ao vivo". Default 5000 (5s).
   *  Detecções mais antigas que isso não são desenhadas sobre o vídeo. */
  liveWindowMs?: number;
  /** Quando false, desenha TUDO (modo histórico — usado em debug/replay). */
  liveOnly?: boolean;
};

const COLORS = {
  lpr: { stroke: '#E97D2A', bg: 'rgba(233,125,42,0.22)', text: '#0a0e14' },
  face: { stroke: '#C8341F', bg: 'rgba(200,52,31,0.22)', text: '#ffffff' },
  object: { stroke: '#E8B33B', bg: 'rgba(232,179,59,0.22)', text: '#0a0e14' },
} as const;

/**
 * AR overlay TEMPO-REAL.
 *
 * Desenha SÓ detecções recentes (dentro de `liveWindowMs`, default 5s) —
 * porque a bbox foi calculada num frame específico e perde sentido após o
 * stream avançar. A opacidade decresce linearmente conforme a detecção
 * envelhece, e ela some quando passa da janela.
 *
 * O histórico completo continua na sidebar `Detecções IA` da página
 * `/cameras` (que é onde o operador clica pra abrir a ficha).
 */
export function LprOverlay({
  detections,
  refWidth = 1280,
  refHeight = 720,
  showLPR = true,
  showFace = true,
  showObject = true,
  liveWindowMs = 5_000,
  liveOnly = true,
}: Props) {
  const t = useT();
  // tick a cada 200ms pra forçar reavaliação do fade
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!liveOnly) return;
    const id = setInterval(() => setNow((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [liveOnly]);

  const now = Date.now();

  const visible = detections
    .filter((d) => {
      if (!d.bbox) return false;
      if (d.kind === 'lpr' && !showLPR) return false;
      if (d.kind === 'face' && !showFace) return false;
      if (d.kind === 'object' && !showObject) return false;
      return true;
    })
    .map((d) => {
      const ageMs = now - new Date(d.detected_at).getTime();
      const alpha = liveOnly ? Math.max(0, 1 - ageMs / liveWindowMs) : 1;
      return { ...d, _alpha: alpha, _ageMs: ageMs };
    })
    .filter((d) => !liveOnly || d._alpha > 0);

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${refWidth} ${refHeight}`}
      preserveAspectRatio="none"
      data-testid="lpr-overlay"
    >
      {visible.map((d) => {
        const [x0, y0, x1, y1] = d.bbox!;
        const c = COLORS[d.kind as keyof typeof COLORS] || COLORS.object;
        const w = Math.max(1, x1 - x0);
        const h = Math.max(1, y1 - y0);
        const labelText = `${detectionKindLabel(t, d.kind)} · ${detectionClassLabel(t, d.label)} · ${Math.round(d.confidence * 100)}%`;
        const labelWidth = Math.max(200, labelText.length * 9);
        const labelY = y0 < 28 ? y1 + 4 : y0 - 26;

        return (
          <g key={d.id} opacity={d._alpha}>
            <rect
              x={x0}
              y={y0}
              width={w}
              height={h}
              fill={c.bg}
              stroke={c.stroke}
              strokeWidth={3}
              strokeDasharray="6 3"
            />
            <path
              d={`M${x0},${y0 + 14} L${x0},${y0} L${x0 + 14},${y0}
                  M${x1 - 14},${y0} L${x1},${y0} L${x1},${y0 + 14}
                  M${x0},${y1 - 14} L${x0},${y1} L${x0 + 14},${y1}
                  M${x1 - 14},${y1} L${x1},${y1} L${x1},${y1 - 14}`}
              fill="none"
              stroke={c.stroke}
              strokeWidth={5}
            />
            <rect x={x0} y={labelY} width={labelWidth} height={22} fill={c.stroke} />
            <text
              x={x0 + 6}
              y={labelY + 16}
              fill={c.text}
              fontFamily="JetBrains Mono, monospace"
              fontSize="14"
              fontWeight="700"
            >
              {labelText}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
