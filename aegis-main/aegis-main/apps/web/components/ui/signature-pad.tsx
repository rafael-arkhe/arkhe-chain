'use client';

/**
 * SignaturePad — canvas de desenho à mão (#3). Pointer-based, sem dependência
 * externa. Exporta `toDataUrl()` (PNG, ou null se vazio) + `clear()`. Estética
 * do DS: cantos retos, borda 1px, traço na tinta escura.
 */
import * as React from 'react';

import { cn } from '@/lib/cn';

export interface SignaturePadHandle {
  /** PNG data URL do desenho, ou null se nada foi desenhado. */
  toDataUrl: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

export const SignaturePad = React.forwardRef<
  SignaturePadHandle,
  { height?: number; className?: string; onChange?: (empty: boolean) => void }
>(function SignaturePad({ height = 140, className, onChange }, ref) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const dirty = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);

  React.useImperativeHandle(ref, () => ({
    toDataUrl: () => (dirty.current ? canvasRef.current?.toDataURL('image/png') ?? null : null),
    clear: () => {
      const c = canvasRef.current;
      if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
      dirty.current = false;
      onChange?.(true);
    },
    isEmpty: () => !dirty.current,
  }));

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (c.width / Math.max(1, r.width)),
      y: (e.clientY - r.top) * (c.height / Math.max(1, r.height)),
    };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    last.current = pos(e);
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture pode falhar em jsdom — ignora */
    }
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.strokeStyle = '#14181E';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!dirty.current) {
      dirty.current = true;
      onChange?.(false);
    }
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      width={520}
      height={height}
      data-testid="signature-pad"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
      className={cn('w-full border border-border-light bg-white touch-none cursor-crosshair', className)}
      style={{ height }}
    />
  );
});
