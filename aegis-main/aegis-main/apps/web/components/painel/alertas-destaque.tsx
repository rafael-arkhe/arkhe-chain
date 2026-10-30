'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import {
  Cctv,
  detectionFrameUrl,
  nonAggregate,
  type CCTVDetection,
} from '@/lib/api/cctv';
import { cn } from '@/lib/cn';
import { formatHoraBR } from '@/lib/datetime';
import { useT } from '@/lib/i18n/provider';
import { detectionClassLabel, detectionConf, detectionKindLabel } from '@/lib/i18n/detection';
import { isTechnicalField } from '@/lib/ontology/technical-fields';

const KIND_COLOR: Record<string, string> = {
  lpr: 'bg-danger',
  face: 'bg-cls-sigiloso',
  object: 'bg-warning',
};

/**
 * Feed de DETECÇÕES recentes (CCTV) agregadas da ontologia
 * (/api/v1/cctv/detections). Cada card é clicável → /ficha/{entity_id};
 * "ver câmeras" leva a /cameras (a MESMA fonte). NÃO confundir com o widget
 * `alert_list` (Alertas), que lê o inbox de regra/geocerca e leva a /alertas
 * (#4: fonte e destino consistentes; são dois widgets distintos).
 */
export function AlertasDestaque() {
  const router = useRouter();
  const t = useT();
  // Estado inicial VAZIO — o fallback fabricado foi removido (2026-06-11).
  const [items, setItems] = useState<CCTVDetection[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchDetections = async () => {
      try {
        // Pede limite maior porque o filtro de agregados pode remover vários
        const d = await Cctv.detections({ limit: 24 });
        const filtered = d.filter(nonAggregate).slice(0, 6);
        if (!cancelled) {
          setItems(filtered);
          setLive(true);
        }
      } catch {
        // backend fora — mantém o último estado real
      }
    };
    fetchDetections();
    const id = setInterval(fetchDetections, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div
      data-testid="alertas-destaque"
      className="bg-panel-light border border-border-light flex flex-col h-full overflow-hidden"
    >
      <div className="h-9 border-b border-border-light flex items-center px-3 gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider">{t('home.deteccoes.titulo')}</h2>
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
          {t('home.deteccoes.vertodos')} <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <li className="px-3 py-6 text-center text-[11px] text-muted-on-light italic">
            Sem detecções recentes do cctv-worker.
          </li>
        )}
        {items.slice(0, 5).map((a) => {
          const clickable = !!a.linked_entity_id;
          const hora = formatHoraBR(a.detected_at);
          return (
            <li
              key={a.id}
              data-testid={`alerta-destaque-${a.id}`}
              onClick={() => clickable && router.push(`/ficha/${a.linked_entity_id}`)}
              className={cn(
                'px-3 py-2.5 border-b border-border-light/60 transition-colors',
                clickable
                  ? 'hover:bg-primary/5 cursor-pointer'
                  : 'hover:bg-raised-light',
              )}
              title={clickable ? 'Clique para abrir ficha da entidade' : 'Sem entidade vinculada'}
            >
              <div className="flex items-start gap-2.5">
                <span className={cn('w-1 self-stretch shrink-0', KIND_COLOR[a.kind] || 'bg-info')} />
                {(() => {
                  const thumb = detectionFrameUrl(a);
                  return thumb ? (
                    <img
                      src={thumb}
                      alt={`frame ${a.label}`}
                      loading="lazy"
                      className="w-14 h-10 object-cover bg-black shrink-0 border border-border-light"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : null;
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-[12px] font-medium truncate">
                      {detectionKindLabel(t, a.kind)} · {detectionClassLabel(t, a.label)}
                    </p>
                    <span className="ml-auto font-mono text-[10px] text-muted-on-light shrink-0">
                      {hora}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-on-light mt-0.5 truncate">
                    {detectionConf(t, Math.round(a.confidence * 100))}
                    {(() => {
                      // Só metadado OPERACIONAL (placa, cidade, etc.) — técnico de
                      // pipeline (device/cuda/source/frame_index) é escondido,
                      // mesma régua da ficha (#6/#7). Valor cru, sem "chave=".
                      const isAssetRef = (v: unknown) => {
                        const s = String(v);
                        // URL/caminho/asset interno (frame, crop, thumbnail) nunca
                        // é metadado operacional — é ref técnica de pipeline.
                        return (
                          /^\/|^https?:\/\//i.test(s) ||
                          /\.(jpg|jpeg|png|webp|gif)$/i.test(s) ||
                          s.length > 40
                        );
                      };
                      const ops = Object.entries(a.metadata).filter(
                        ([k, v]) =>
                          !isTechnicalField(k) &&
                          !['kind', 'first_seen_at', 'last_seen_at'].includes(k) &&
                          v != null &&
                          v !== '' &&
                          !isAssetRef(v),
                      );
                      return ops.length > 0
                        ? ` · ${ops.slice(0, 2).map(([, v]) => String(v)).join(' · ')}`
                        : '';
                    })()}
                  </p>
                  <p className="text-[10px] font-mono text-muted-on-light/70 mt-1 uppercase tracking-wide">
                    stream {a.stream_id.slice(0, 8)}…
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
