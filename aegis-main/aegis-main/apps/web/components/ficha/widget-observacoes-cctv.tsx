'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Camera } from 'lucide-react';
import { Cctv, detectionFrameUrl, type CCTVDetection } from '@/lib/api/cctv';
import { formatHoraSegBR, formatDataBR } from '@/lib/datetime';
import { useT } from '@/lib/i18n/provider';
import { detectionClassLabel, detectionConf, detectionKindLabel } from '@/lib/i18n/detection';
import { cn } from '@/lib/cn';

type Props = {
  entityId: string;
  title?: string;
};

/**
 * Linha do tempo de observações CCTV (EntityLink rel="observed") pra
 * uma Entity (kind=person, lpr_plate, face_match, …). Carrega via
 * GET /api/v1/cctv/entities/{id}/observations e renderiza:
 *   thumb · hora · câmera · conf · bbox
 *
 * É o que materializa "cada pessoa correlaciona eventos": toda vez
 * que uma pessoa foi vista em qualquer câmera aparece aqui.
 */
export function WidgetObservacoesCctv({ entityId, title = 'Observações em câmeras' }: Props) {
  const t = useT();
  const [items, setItems] = useState<CCTVDetection[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const obs = await Cctv.entityObservations(entityId, 200);
        if (!cancelled) setItems(obs);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'falha ao carregar');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  return (
    <div className="bg-white border border-border-light flex flex-col">
      <div className="h-9 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light/40">
        <Camera className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em]">{title}</h3>
        {items && (
          <span className="ml-auto text-[10px] font-mono text-muted-on-light">
            {items.length} {items.length === 1 ? 'evento' : 'eventos'}
          </span>
        )}
      </div>

      {err && (
        <p className="px-3 py-4 text-[11px] text-danger">Falha: {err}</p>
      )}

      {items && items.length === 0 && (
        <p className="px-3 py-6 text-center text-[11px] text-muted-on-light italic">
          Nenhuma observação registrada ainda. O cctv-worker correlaciona
          em tempo real toda vez que esta entidade for vista numa câmera.
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="divide-y divide-border-light/60 overflow-y-auto max-h-[480px]">
          {items.map((o) => {
            const thumb = detectionFrameUrl(o);
            const lp = (o.metadata as { stream_id?: unknown }) || {};
            const conf = Math.round(o.confidence * 100);
            const lpProps = o as unknown as { stream_id?: string };
            const streamId = String(lpProps.stream_id ?? lp.stream_id ?? '').slice(0, 8);
            return (
              <li
                key={o.id}
                className={cn(
                  'px-3 py-2.5 flex items-start gap-3 hover:bg-raised-light/40',
                )}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={`frame ${o.label}`}
                    loading="lazy"
                    className="w-20 h-14 object-cover bg-black shrink-0 border border-border-light"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-20 h-14 bg-raised-light/60 shrink-0 border border-border-light flex items-center justify-center">
                    <Camera className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-[12px] font-medium truncate">
                      <span className="font-mono uppercase text-muted-on-light mr-1.5">
                        {detectionKindLabel(t, o.kind)}
                      </span>
                      {detectionClassLabel(t, o.label)}
                    </p>
                    <span className="ml-auto font-mono text-[10px] text-muted-on-light shrink-0">
                      {formatHoraSegBR(o.detected_at)}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-muted-on-light mt-0.5">
                    {formatDataBR(o.detected_at)} · {detectionConf(t, conf)}
                    {streamId && ` · stream ${streamId}…`}
                  </p>
                  {o.bbox && (
                    <p className="text-[10px] font-mono text-muted-on-light/70 mt-0.5">
                      bbox [{o.bbox.join(', ')}]
                    </p>
                  )}
                  {streamId && (
                    <Link
                      href={`/cameras?stream=${streamId}`}
                      className="text-[10px] text-primary hover:underline mt-1 inline-block"
                    >
                      abrir câmera
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
