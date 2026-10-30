'use client';

import {
  Bell,
  Camera,
  FileText,
  Gavel,
  LayoutTemplate,
  Link2,
  ScrollText,
  Shield,
  Truck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/provider';
import { CLASSIFICATION_BG, CLASSIFICATION_LABEL, type ClassificationLevel } from '@/lib/classification';
import { cn } from '@/lib/cn';
import { formatHoraBR } from '@/lib/datetime';

type TimelineEvent = {
  id: string;
  at: string;
  kind: string;
  text: string;
  classification: string;
  _entity_id?: string | null;
};

const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  bo: ScrollText,
  alerta: Bell,
  mandado: Gavel,
  objeto: Link2,
  briefing: LayoutTemplate,
  relatorio: FileText,
  viatura: Truck,
  cerca: Shield,
};

const COLOR: Record<string, string> = {
  bo: 'text-warning',
  alerta: 'text-danger',
  mandado: 'text-cls-sigiloso',
  objeto: 'text-primary',
  briefing: 'text-info',
  relatorio: 'text-success',
  viatura: 'text-muted-on-light',
  cerca: 'text-danger',
};

type Props = {
  events: TimelineEvent[];
  liveCctv?: { streams_total: number; streams_online: number; detections_total: number } | null;
};

export function LinhaTempo({ events, liveCctv }: Props) {
  const router = useRouter();
  const t = useT();
  return (
    <div
      data-testid="linha-tempo"
      className="bg-panel-light border border-border-light flex flex-col overflow-hidden h-full"
    >
      <div className="h-9 border-b border-border-light flex items-center px-3 gap-2 shrink-0">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider">
          Linha do tempo
        </h2>
        {liveCctv && (
          <span
            data-testid="linha-tempo-cctv-badge"
            className="ml-2 flex items-center gap-1.5 px-1.5 py-0.5 bg-primary/10 border border-primary text-[10px] font-mono text-primary"
          >
            CCTV {liveCctv.streams_online}/{liveCctv.streams_total} · {liveCctv.detections_total} detecções
          </span>
        )}
        {/* SHELL HONESTO (2026-06-12): o filtro "por unidade" morreu —
            listava unidades FABRICADAS (13ª DP, 5º BPM, GCM-Centro) num
            select inerte. Quando houver unidades reais por dado, volta. */}
        <div className="ml-auto flex items-center gap-3">
          <select
            aria-label="Filtrar por gravidade"
            className="bg-raised-light border border-border-light text-[11px] h-6 px-2 outline-none focus:border-primary"
          >
            <option>Todas as gravidades</option>
            <option>Crítica</option>
            <option>Alta</option>
            <option>Normal</option>
          </select>
          <span className="text-[10px] font-mono text-muted-on-light">polling 5s</span>
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {events.length === 0 && (
          <li
            data-testid="linha-tempo-empty"
            className="px-3 py-6 text-center text-[11px] text-muted-on-light"
          >
            {t('common.empty')}
          </li>
        )}
        {events.map((e) => {
          const isCctv = e.id.startsWith('cctv-');
          const Icon = isCctv ? Camera : ICONS[e.kind] || ScrollText;
          const hora = formatHoraBR(e.at);
          const cls = (e.classification as ClassificationLevel) || 'restrito';
          const clickable = isCctv && e._entity_id;
          return (
            <li
              key={e.id}
              data-testid={`timeline-${e.id}`}
              onClick={() => clickable && router.push(`/ficha/${e._entity_id}`)}
              className={cn(
                'px-3 py-2 border-b border-border-light/60 transition-colors flex items-center gap-3',
                clickable
                  ? 'hover:bg-primary/10 cursor-pointer'
                  : 'hover:bg-raised-light/50',
              )}
              title={clickable ? 'Clique para abrir ficha da entidade na ontologia' : undefined}
            >
              <span className="font-mono text-[11px] text-muted-on-light w-12 shrink-0">{hora}</span>
              <Icon
                className={cn(
                  'w-3.5 h-3.5 shrink-0',
                  isCctv ? null : COLOR[e.kind] || 'text-muted-on-light',
                )}
                strokeWidth={1.5}
              />
              <span className="text-[12px] flex-1 truncate">{e.text}</span>
              {isCctv && (
                <span className="px-1 text-[9px] font-mono bg-primary/15 text-primary uppercase tracking-wide">
                  CCTV
                </span>
              )}
              <span
                className={cn(
                  'px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase shrink-0',
                  CLASSIFICATION_BG[cls],
                  cls === 'restrito' ? 'text-black' : 'text-white',
                )}
              >
                {CLASSIFICATION_LABEL[cls]}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
