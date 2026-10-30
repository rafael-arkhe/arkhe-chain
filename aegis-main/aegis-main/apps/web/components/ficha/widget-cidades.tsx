'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Cctv } from '@/lib/api/cctv';
import { formatDataHoraBR } from '@/lib/datetime';

type CityRow = {
  city_entity_id: string;
  city: string;
  observation_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  stream_ids: string[];
};

type Props = { entityId: string };

/**
 * Lista cidades onde a pessoa foi vista (EntityLink rel="seen_in"
 * agregado por cidade). Material pra perguntar "onde ela esteve" e
 * pivotar pro Cesium /geo com a trajetória.
 */
export function WidgetCidades({ entityId }: Props) {
  const [rows, setRows] = useState<CityRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Cctv.entityCities(entityId)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  return (
    <div className="bg-white border border-border-light flex flex-col">
      <div className="h-9 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light/40">
        <MapPin className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em]">
          Cidades onde foi vista
        </h3>
        {rows && (
          <span className="ml-auto text-[10px] font-mono text-muted-on-light">
            {rows.length}
          </span>
        )}
      </div>
      {rows === null && (
        <p className="px-3 py-4 text-[11px] text-muted-on-light italic">Carregando…</p>
      )}
      {rows && rows.length === 0 && (
        <p className="px-3 py-6 text-center text-[11px] text-muted-on-light italic">
          Sem registro em cidades ainda. Cada câmera com `city` configurada
          gera um vínculo automático ao detectar esta pessoa.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-border-light/60">
          {rows.map((c) => (
            <li key={c.city_entity_id} className="px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <p className="text-[12px] font-medium">{c.city}</p>
                <span className="ml-auto text-[10px] font-mono text-muted-on-light">
                  {c.observation_count} obs
                </span>
              </div>
              {c.first_seen_at && (
                <p className="text-[10px] font-mono text-muted-on-light/80 mt-0.5">
                  {formatDataHoraBR(c.first_seen_at)}
                  {c.last_seen_at && c.last_seen_at !== c.first_seen_at && (
                    <> → {formatDataHoraBR(c.last_seen_at)}</>
                  )}
                </p>
              )}
              <Link
                href={`/geo?focus=${entityId}`}
                className="text-[10px] text-primary hover:underline mt-1 inline-block"
              >
                ver trajetória no mapa
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
