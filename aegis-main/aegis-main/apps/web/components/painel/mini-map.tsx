'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, Map as MapIcon } from 'lucide-react';
import { Cctv } from '@/lib/api/cctv';

/**
 * Skeleton mostrado enquanto o chunk dinâmico do Cesium baixa + monta.
 * Mantém UX consistente — mesma moldura do mini-map, só com shimmer
 * sutil + ícone girando no centro. Sai automaticamente quando o
 * <CesiumGlobe> renderiza.
 */
function MiniMapSkeleton() {
  return (
    <div className="absolute inset-0 bg-deep flex items-center justify-center overflow-hidden">
      {/* shimmer horizontal sutil */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-20"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'mini-map-shimmer 1.8s linear infinite',
        }}
      />
      <Loader2
        className="w-4 h-4 text-white/60 animate-spin relative z-10"
        strokeWidth={1.5}
      />
    </div>
  );
}

const CesiumGlobe = dynamic(
  () => import('@/components/geo/cesium-globe').then((m) => m.CesiumGlobe),
  { ssr: false, loading: () => <MiniMapSkeleton /> },
);

type Hotspot = { lat: number; lon: number; label: string; count: number };

export interface MiniMapProps {
  /** Liga auto-foco no cluster com maior atividade nas últimas 24h.
   *  Quando true, ignora `center`. Default: true. */
  autoFocusCluster?: boolean;
  /** Centro manual (usado se `autoFocusCluster=false`). */
  center?: { lat: number; lon: number };
  /** Altitude da câmera (m). Default: 45000 (60000 quando há hotspot). */
  zoomHeight?: number;
  /** Interatividade (drag/zoom). Mini-map é teaser → default false. */
  interactive?: boolean;
  /** Mostra os controles UI do Cesium. Default: false. */
  showControls?: boolean;
  /** Renderiza pins de streams. Default: false. */
  showPins?: boolean;
  /** Mostra a barra de "abrir Mapa" no rodapé. Default: true. */
  showOpenLink?: boolean;
}

/** Mini-mapa do painel `/`. Centraliza automaticamente no stream com
 *  mais detecções nas últimas 24h (quando `autoFocusCluster=true`). */
export function MiniMap({
  autoFocusCluster = true,
  center,
  zoomHeight,
  interactive = false,
  showControls = false,
  showPins = false,
  showOpenLink = true,
}: MiniMapProps = {}) {
  const [hotspot, setHotspot] = useState<Hotspot | null>(null);

  useEffect(() => {
    // Center manual sempre vence: se o operador setou lat/lng no
    // schema, ignora o auto-focus mesmo que esteja ligado.
    if (!autoFocusCluster || center) return;
    let cancelled = false;
    (async () => {
      try {
        const [dets, streams] = await Promise.all([
          Cctv.detections({ limit: 500, since_minutes: 1440 }),
          Cctv.streams.list(),
        ]);
        if (cancelled) return;
        const streamById = new Map(streams.map((s) => [s.id, s]));
        const counts = new Map<string, number>();
        for (const d of dets) counts.set(d.stream_id, (counts.get(d.stream_id) ?? 0) + 1);
        let best: Hotspot | null = null;
        for (const [sid, c] of counts) {
          const s = streamById.get(sid);
          if (!s || s.latitude == null || s.longitude == null) continue;
          if (!best || c > best.count) {
            best = { lat: s.latitude, lon: s.longitude, label: s.city ?? s.name, count: c };
          }
        }
        if (!best) {
          const first = streams.find((s) => s.latitude != null && s.longitude != null);
          if (first) {
            best = {
              lat: first.latitude!,
              lon: first.longitude!,
              label: first.city ?? first.name,
              count: 0,
            };
          }
        }
        if (best) setHotspot(best);
      } catch {
        /* sem rede — fica no default de SP */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoFocusCluster]);

  // Prioridade: center manual > hotspot detectado > fallback do globo.
  const resolvedCenter = center
    ? center
    : autoFocusCluster && hotspot
      ? { lat: hotspot.lat, lon: hotspot.lon }
      : undefined;
  const resolvedZoom = zoomHeight ?? (hotspot && !center ? 60_000 : 45_000);

  const containerClass =
    'relative block bg-panel-light border border-border-light overflow-hidden h-full hover:border-primary transition-colors group';

  const inner = (
    <>
      <div className="absolute inset-0">
        <CesiumGlobe
          interactive={interactive}
          showControls={showControls}
          showPins={showPins}
          zoomLevel={resolvedZoom}
          center={resolvedCenter}
        />
      </div>

      <div className="absolute top-2 left-3 right-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.16em] z-10 pointer-events-none">
        <span className="inline-flex items-center gap-1.5 bg-deep/80 text-white px-1.5 py-0.5">
          <MapIcon className="w-3 h-3" strokeWidth={1.5} />
          <span>
            {autoFocusCluster
              ? hotspot
                ? `${hotspot.label} · hotspot`
                : 'São Paulo · centro'
              : center
                ? `${center.lat.toFixed(3)}, ${center.lon.toFixed(3)}`
                : 'São Paulo · centro'}
          </span>
        </span>
        <span className="bg-deep/80 text-white px-1.5 py-0.5">3D</span>
      </div>

      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] font-mono z-10 pointer-events-none">
        <span className="bg-deep/80 text-white px-1.5 py-0.5">
          {hotspot ? `${hotspot.count} eventos · 24h` : 'sem eventos · 24h'}
        </span>
        {showOpenLink && (
          <span className="bg-primary text-white px-1.5 py-0.5 group-hover:underline">
            Abrir Mapa →
          </span>
        )}
      </div>
    </>
  );

  if (showOpenLink) {
    return (
      <Link
        href="/geo"
        data-testid="mini-map"
        aria-label="Abrir mapa operacional"
        className={containerClass}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div data-testid="mini-map" className={containerClass}>
      {inner}
    </div>
  );
}
