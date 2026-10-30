'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Cctv, type CCTVStream } from '@/lib/api/cctv';
import { HlsPlayer } from '@/components/cameras/hls-player';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';

export function CamerasPrioritarias() {
  const t = useT();
  // Estado inicial VAZIO — o fallback fabricado foi removido (2026-06-11).
  const [streams, setStreams] = useState<CCTVStream[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchStreams = async () => {
      try {
        const d = await Cctv.streams.list();
        if (!cancelled) {
          setStreams(d.slice(0, 4));
          setLive(true);
        }
      } catch {
        // backend fora — mantém o último estado real
      }
    };
    fetchStreams();
    const id = setInterval(fetchStreams, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div
      data-testid="cameras-prioritarias"
      className="bg-panel-light border border-border-light flex flex-col h-full overflow-hidden"
    >
      <div className="h-9 border-b border-border-light flex items-center px-3 gap-2 shrink-0">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider">Câmeras ao vivo</h2>
        <span
          className={cn(
            'px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border',
            live ? 'border-success text-success' : 'border-warning text-warning',
          )}
        >
          {live ? t('common.online') : t('common.offline')}
        </span>
        <Link
          href="/cameras"
          className="ml-auto text-[11px] text-primary hover:underline flex items-center gap-1"
        >
          abrir mosaico <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>

      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-px bg-border-light p-px overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => {
          const c = streams[i];
          if (!c) {
            return (
              <div
                key={`empty-${i}`}
                className="bg-black flex items-center justify-center text-[10px] font-mono text-white/40"
              >
                sem stream
              </div>
            );
          }
          const online = c.status === 'online';
          // `bc-ready` = câmera de CONTAGEM (Bag Counting). Sem o teste de
          // tag, `detection_enabled` fazia toda câmera de visão cair no
          // badge LPR — a contagem aparecia etiquetada como placa.
          const hasBc = (c.tags || []).includes('bc-ready');
          const hasLpr = (c.tags || []).includes('lpr-ready') || (c.detection_enabled && !hasBc);
          return (
            <Link
              key={c.id}
              href="/cameras"
              data-testid={`painel-stream-${c.id}`}
              className="relative bg-black overflow-hidden block group"
              title={c.name}
            >
              <HlsPlayer
                url={c.url}
                autoPlay
                muted
                className="absolute inset-0 w-full h-full"
              />
              {/* badges sobre o vídeo */}
              <div className="absolute top-1 left-1 right-1 z-20 flex items-center justify-between gap-1 pointer-events-none">
                {online && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-danger/90 text-[9px] font-mono font-semibold text-white uppercase tracking-wide">
                    <span className="w-1 h-1 bg-white animate-pulse" />
                    ao vivo
                  </span>
                )}
                {hasBc ? (
                  <span className="ml-auto px-1.5 py-0.5 bg-success/85 text-[9px] font-mono font-semibold text-white uppercase">
                    CON
                  </span>
                ) : hasLpr ? (
                  <span className="ml-auto px-1.5 py-0.5 bg-primary/85 text-[9px] font-mono font-semibold text-white uppercase">
                    LPR
                  </span>
                ) : null}
              </div>
              {/* legenda inferior */}
              <div className="absolute left-0 right-0 bottom-0 z-20 px-1.5 py-1 bg-gradient-to-t from-black/85 to-transparent pointer-events-none">
                <p className="text-[10px] text-white truncate font-medium">{c.name}</p>
                <p className="text-[9px] font-mono text-white/70 truncate">
                  {c.city || c.source_type || c.id}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
