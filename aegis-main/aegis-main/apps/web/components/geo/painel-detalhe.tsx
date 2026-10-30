'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, GitBranch, MapPin, Power, Scissors, SquarePen, Trash2, X } from 'lucide-react';
import { HlsBadge, HlsPlayer } from '@/components/cameras/hls-player';
import { Alerts, Ontology } from '@/lib/api';
import {
  Situational,
  type CorrelationEdge,
  type SituationalNeighbor,
} from '@/lib/api/situational';
import type { AlertGeofence, AlertItem } from '@/lib/api/types';
import { Geo, type GeoNode } from '@/lib/api/geo';
import type { GeoZone } from './geo-zones';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { toast } from '@/components/ui/toast';
import { confirmModal, promptModal } from '@/components/dialog/confirm-dialog';
import { alertCoords, useGeo, type CorrelationLine } from './geo-context';
import { geofenceCenter, GEOFENCE_SEVERITIES, humanizeNodeType, humanizePinLabel, toolForShape, type GeofenceSeverity } from './geo-utils';
import { cn } from '@/lib/cn';

/** Cor distinta da correlação no globo — laranja (≠ azul da relação do
 *  Sprint 7). Vizinho explorado (tracejado) vs aresta materializada (cheia)
 *  são distinguidos pelo `kind` no desenho do globo. */
const CORRELATION_COLOR = '#E97D2A';

/** Raios humanos (m) e janelas humanas (s) — controles discretos. */
const NEARBY_RADII = [100, 200, 500] as const;
const NEARBY_WINDOWS = [
  { s: 300, key: 'geo.nearby.window5' },
  { s: 900, key: 'geo.nearby.window15' },
  { s: 3600, key: 'geo.nearby.window60' },
] as const;

function fmtDistance(m: number): string {
  return m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(2)} km`;
}

function fmtDelta(s: number): string {
  const abs = Math.abs(s);
  if (abs < 60) return `${abs.toFixed(0)} s`;
  if (abs < 3600) return `${(abs / 60).toFixed(1)} min`;
  return `${(abs / 3600).toFixed(1)} h`;
}

export function PainelDetalheGeo() {
  const { selected, setSelected, isFullscreen } = useGeo();

  const body = (
    <>
      {selected?.kind === 'stream' && <StreamDetalhe stream={selected.stream} />}
      {selected?.kind === 'node' && <NodeDetalhe node={selected.node} />}
      {selected?.kind === 'zone' && <ZoneDetalhe zone={selected.zone} />}
      {selected?.kind === 'geofence' && <GeofenceDetalhe geofence={selected.geofence} />}
      {selected?.kind === 'alert' && <AlertDetalhe alert={selected.alert} />}
      {selected?.kind === 'refFeature' && (
        <RefFeatureDetalhe layer={selected.layer} title={selected.title} props={selected.props} />
      )}
    </>
  );

  // Em fullscreen, o painel só aparece quando há seleção e fica como
  // OVERLAY ABSOLUTO sobre o mapa — nunca faz resize do canvas. Quando
  // não fullscreen, é aside lateral fixo (resize normal).
  if (isFullscreen) {
    if (!selected) return null;
    return (
      <aside
        data-testid="painel-detalhe-geo"
        className="absolute top-12 right-3 z-30 w-[320px] max-h-[calc(100vh-6rem)] bg-panel-light border border-border-light flex flex-col overflow-y-auto"
      >
        <header className="h-9 px-3 border-b border-border-light flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-wider font-semibold flex-1">
            Detalhe da seleção
          </p>
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Fechar"
            className="w-5 h-5 flex items-center justify-center hover:text-danger"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>
        {body}
      </aside>
    );
  }

  return (
    <aside
      data-testid="painel-detalhe-geo"
      className={cn(
        'w-[320px] bg-panel-light border-l border-border-light flex flex-col shrink-0 overflow-y-auto',
      )}
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center">
        <p className="text-[11px] uppercase tracking-wider font-semibold">Detalhe da seleção</p>
      </header>

      {!selected && (
        <div className="p-3 text-[11px] text-muted-on-light italic">
          Clique num pin do mapa pra ver detalhes — câmeras CCTV trazem stream
          ao vivo; entidades da ontologia abrem a ficha; cercas mostram
          severidade e remoção.
        </div>
      )}

      {body}
    </aside>
  );
}

/** Feição de uma CAMADA DE REFERÊNCIA (geo_reference): mostra TODOS os atributos
 *  disponíveis quando o operador clica — contexto pra decisão (imprescindível). */
const REF_LAYER_LABEL: Record<string, string> = {
  cnes_saude: 'Estabelecimento de saúde (CNES)',
  incra_assentamentos: 'Assentamento rural (INCRA)',
  terras_indigenas: 'Terra indígena (FUNAI)',
  ucs_federais: 'Unidade de conservação (ICMBio)',
  prodes_ti: 'Desmatamento em TI (PRODES)',
  prodes_geral: 'Desmatamento (PRODES Amazônia Legal)',
  deter_amz: 'Alerta DETER (desmatamento/mineração recente)',
  focos_calor: 'Foco de calor ativo (INPE)',
  ibge_uf_malha: 'Limite estadual (IBGE)',
  ibge_municipio_malha: 'Limite municipal (IBGE)',
};

function humanizeKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function RefFeatureDetalhe({
  layer,
  title,
  props,
}: {
  layer: string;
  title?: string;
  props: Record<string, unknown>;
}) {
  const entries = Object.entries(props || {}).filter(
    ([k, val]) => k !== '_layer' && val != null && val !== '',
  );
  return (
    <div className="p-3 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {REF_LAYER_LABEL[layer] || layer}
        </p>
        {title && <p className="text-sm font-semibold break-words">{title}</p>}
      </div>
      <dl className="space-y-1">
        {entries.length === 0 && (
          <p className="text-[11px] text-muted-on-light italic">Sem atributos nesta feição.</p>
        )}
        {entries.map(([k, val]) => (
          <div key={k} className="flex gap-2 text-[11px] border-b border-border-light/50 pb-1">
            <dt className="w-24 shrink-0 text-muted-on-light">{humanizeKey(k)}</dt>
            <dd className="flex-1 font-mono break-words">{String(val)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Nó da ontologia plotado por uma camada data-driven — pin clicável →
 *  ficha da entidade (navegação canônica /ficha/[id]). */
function NodeDetalhe({ node }: { node: GeoNode }) {
  const t = useT();
  const { setSelected, reloadLayers } = useGeo();
  const canManage = useCan('ontology.objects.write');
  const resumo = Object.entries(node.properties_resumo ?? {});

  const rename = async () => {
    const name = await promptModal({
      title: t('geo.node.renameTitle'),
      defaultValue: node.name,
      placeholder: t('geo.node.name'),
    });
    const trimmed = name?.trim();
    if (!trimmed || trimmed === node.name) return;
    try {
      await Ontology.updateNode(node.id, { name: trimmed });
      setSelected({ kind: 'node', node: { ...node, name: trimmed } });
      await reloadLayers();
      toast.success(t('geo.node.updated'));
    } catch {
      toast.error(t('geo.node.updateFailed'));
    }
  };

  const remove = async () => {
    const ok = await confirmModal({
      title: t('geo.node.removeTitle'),
      description: `${node.name} — ${t('geo.node.removeBody')}`,
      tone: 'danger',
      confirmLabel: t('geo.node.remove'),
    });
    if (!ok) return;
    try {
      await Ontology.deleteNode(node.id);
      toast.success(t('geo.node.removed'));
      setSelected(null);
      await reloadLayers();
    } catch {
      toast.error(t('geo.node.removeFailed'));
    }
  };

  return (
    <section className="p-3 border-b border-border-light" data-testid="node-detalhe">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
        {t('geo.detail.node')} · {humanizeNodeType(node.node_type)}
      </p>
      <p className="text-[12px] font-semibold">{humanizePinLabel(node.name, node.node_type, node.id)}</p>
      <dl className="space-y-1 text-[11px] mt-2">
        <div className="flex justify-between">
          <dt className="text-muted-on-light flex items-center gap-1">
            <MapPin className="w-3 h-3" strokeWidth={1.5} /> {t('geo.detail.coords')}
          </dt>
          <dd className="font-mono">
            {node.lat.toFixed(4)}, {node.lng.toFixed(4)}
          </dd>
        </div>
        {node.detected_at && (
          <div className="flex justify-between">
            <dt className="text-muted-on-light">{t('geo.detail.seenAt')}</dt>
            <dd className="font-mono">{node.detected_at}</dd>
          </div>
        )}
        {resumo.slice(0, 8).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-muted-on-light truncate">{k}</dt>
            <dd className="font-mono truncate" title={String(v)}>
              {String(v)}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        href={`/ficha/${node.id}`}
        className="mt-3 h-7 bg-raised-light border border-border-light hover:border-primary text-[11px] flex items-center justify-center gap-1.5"
      >
        <ExternalLink className="w-3 h-3" strokeWidth={1.5} /> {t('geo.detail.openFicha')}
      </Link>
      {canManage && (
        <div className="grid grid-cols-2 gap-2 mt-2" data-testid="node-gestao">
          <button
            type="button"
            data-testid="node-renomear"
            onClick={rename}
            className="h-7 text-[11px] bg-raised-light border border-border-light text-text-on-light hover:border-primary flex items-center justify-center gap-1.5"
          >
            <SquarePen className="w-3 h-3" strokeWidth={1.5} /> {t('geo.node.rename')}
          </button>
          <button
            type="button"
            data-testid="node-remover"
            onClick={remove}
            className="h-7 text-[11px] bg-raised-light border border-border-light text-danger hover:border-danger flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3 h-3" strokeWidth={1.5} /> {t('geo.node.remove')}
          </button>
        </div>
      )}
      <SensoresProximos
        nodeId={node.id}
        anchorLat={node.lat}
        anchorLng={node.lng}
        anchorName={node.name}
      />
    </section>
  );
}

/** Zona operacional (KMZ/GeoJSON importada) — categoria + altura 3D + fonte,
 *  com remoção governada (security.geo.zona.manage). */
function ZoneDetalhe({ zone }: { zone: GeoZone }) {
  const t = useT();
  const { setSelected, reloadZones } = useGeo();
  const canManage = useCan('security.geo.zona.manage');

  const remove = async () => {
    const ok = await confirmModal({
      title: t('geo.zone.removeTitle'),
      description: `${zone.name} — ${t('geo.zone.removeBody')}`,
      tone: 'danger',
      confirmLabel: t('geo.zone.remove'),
    });
    if (!ok) return;
    try {
      await Geo.deleteZone(zone.id);
      toast.success(t('geo.zone.removed'));
      setSelected(null);
      await reloadZones();
    } catch {
      toast.error(t('geo.zone.removeFailed'));
    }
  };

  return (
    <section className="p-3 border-b border-border-light" data-testid="zone-detalhe">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
        {t('geo.zone.detail')}
      </p>
      <p className="text-[12px] font-semibold">{zone.name}</p>
      <dl className="space-y-1 text-[11px] mt-2">
        <div className="flex justify-between">
          <dt className="text-muted-on-light">{t('geo.detail.type')}</dt>
          <dd className="font-mono">{t(`geo.zone.type.${zone.zone_type}`)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-on-light">{t('geo.zone.height')}</dt>
          <dd className="font-mono">
            {zone.extruded_height > 0 ? `${zone.extruded_height} m` : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-on-light shrink-0">{t('geo.zone.source')}</dt>
          <dd className="font-mono truncate" title={zone.source ?? undefined}>
            {zone.source ?? '—'}
          </dd>
        </div>
      </dl>
      {canManage && (
        <button
          type="button"
          data-testid="remover-zona"
          onClick={remove}
          className="mt-3 w-full h-7 text-[11px] bg-raised-light border border-border-light text-danger hover:border-danger flex items-center justify-center gap-1.5"
        >
          <Trash2 className="w-3 h-3" strokeWidth={1.5} /> {t('geo.zone.remove')}
        </button>
      )}
    </section>
  );
}

/** Cerca virtual (a MESMA que dispara alertas de borda no avaliador). */
function GeofenceDetalhe({ geofence }: { geofence: AlertGeofence }) {
  const t = useT();
  const { setSelected, reloadGeofences, setEditingFence, setTool } = useGeo();
  const canManage = useCan('alerts.geofences.manage');
  const center = geofenceCenter(geofence);

  // Redesenhar: entra em modo edição (o próximo desenho dá PATCH na geometria,
  // preservando name/severity) + arma a ferramenta certa pro shape + fecha o
  // detalhe pra focar o mapa.
  const redraw = () => {
    // Redesenho preserva o TIPO da cerca (só muda a geometria). Arma a
    // ferramenta do shape original; a paleta trava as outras (ver mapa.tsx).
    // Pré-carrega a largura atual (corredor/rota) pra não resetar pro default.
    const coords = geofence.coordinates;
    const widthMeters =
      coords && typeof coords === 'object' && !Array.isArray(coords)
        ? Number((coords as { width_meters?: unknown }).width_meters) || undefined
        : undefined;
    setEditingFence({
      id: geofence.id,
      name: geofence.name,
      severity: geofence.severity,
      shape: geofence.shape,
      widthMeters,
    });
    setTool(toolForShape(geofence.shape));
    setSelected(null);
  };

  // PATCH parcial → reflete na seleção (objeto devolvido, evita painel stale)
  // + recarrega a camada do globo.
  const applyUpdate = async (changes: Partial<Omit<AlertGeofence, 'id'>>) => {
    try {
      const updated = await Alerts.geofences.update(geofence.id, changes);
      setSelected({ kind: 'geofence', geofence: updated });
      await reloadGeofences();
      toast.success(t('geo.fence.updated'));
    } catch {
      toast.error(t('geo.fence.updateFailed'));
    }
  };

  const rename = async () => {
    const name = await promptModal({
      title: t('geo.fence.renameTitle'),
      defaultValue: geofence.name,
      placeholder: t('geo.fence.name'),
    });
    const trimmed = name?.trim();
    if (!trimmed || trimmed === geofence.name) return;
    await applyUpdate({ name: trimmed });
  };

  const toggleActive = async () => {
    if (geofence.active) {
      const ok = await confirmModal({
        title: t('geo.fence.deactivateTitle'),
        description: `${geofence.name} — ${t('geo.fence.deactivateBody')}`,
        confirmLabel: t('geo.fence.deactivate'),
      });
      if (!ok) return;
    }
    await applyUpdate({ active: !geofence.active });
  };

  const remove = async () => {
    const ok = await confirmModal({
      title: t('geo.fence.removeTitle'),
      description: `${geofence.name} — ${t('geo.fence.removeBody')}`,
      tone: 'danger',
      confirmLabel: t('geo.fence.remove'),
    });
    if (!ok) return;
    try {
      await Alerts.geofences.remove(geofence.id);
      toast.success(t('geo.fence.removed'));
      setSelected(null);
      await reloadGeofences();
    } catch {
      toast.error(t('geo.fence.removeFailed'));
    }
  };

  return (
    <section className="p-3 border-b border-border-light" data-testid="geofence-detalhe">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
        {t('geo.detail.geofence')}
      </p>
      <p className="text-[12px] font-semibold">{geofence.name}</p>
      <dl className="space-y-1 text-[11px] mt-2">
        <div className="flex justify-between">
          <dt className="text-muted-on-light">{t('geo.fence.severity')}</dt>
          <dd className="font-mono">{t(`geo.severity.${geofence.severity}`)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-on-light">{t('geo.detail.type')}</dt>
          <dd className="font-mono">{geofence.shape}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-on-light">{t('geo.fence.active')}</dt>
          <dd className={geofence.active ? 'text-success font-mono' : 'text-muted-on-light font-mono'}>
            {geofence.active ? t('geo.fence.active') : t('geo.fence.inactive')}
          </dd>
        </div>
        {center && (
          <div className="flex justify-between">
            <dt className="text-muted-on-light">{t('geo.detail.coords')}</dt>
            <dd className="font-mono">
              {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
            </dd>
          </div>
        )}
      </dl>
      {canManage && (
        <div className="mt-3 space-y-2" data-testid="geofence-gestao">
          {/* Severidade = enumerado → select (nunca texto livre). */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-muted-on-light shrink-0 flex-1">
              {t('geo.fence.severity')}
            </label>
            <select
              data-testid="detalhe-fence-severity"
              value={geofence.severity}
              onChange={(e) => applyUpdate({ severity: e.target.value as GeofenceSeverity })}
              className="w-28 h-7 bg-raised-light border border-border-light px-1 text-[11px] outline-none focus:border-primary"
            >
              {GEOFENCE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {t(`geo.severity.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="detalhe-renomear-cerca"
              onClick={rename}
              className="h-7 text-[11px] bg-raised-light border border-border-light text-text-on-light hover:border-primary flex items-center justify-center gap-1.5"
            >
              <SquarePen className="w-3 h-3" strokeWidth={1.5} /> {t('geo.fence.rename')}
            </button>
            <button
              type="button"
              data-testid="detalhe-toggle-ativa"
              onClick={toggleActive}
              className="h-7 text-[11px] bg-raised-light border border-border-light text-text-on-light hover:border-primary flex items-center justify-center gap-1.5"
            >
              <Power className="w-3 h-3" strokeWidth={1.5} />
              {geofence.active ? t('geo.fence.deactivate') : t('geo.fence.activate')}
            </button>
          </div>
          <button
            type="button"
            data-testid="detalhe-redesenhar-cerca"
            onClick={redraw}
            title={t('geo.fence.redrawHint')}
            className="w-full h-7 text-[11px] bg-raised-light border border-border-light text-text-on-light hover:border-primary flex items-center justify-center gap-1.5"
          >
            <MapPin className="w-3 h-3" strokeWidth={1.5} /> {t('geo.fence.redraw')}
          </button>
          <button
            type="button"
            data-testid="detalhe-remover-cerca"
            onClick={remove}
            className="w-full h-7 text-[11px] bg-raised-light border border-border-light text-danger hover:border-danger flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3 h-3" strokeWidth={1.5} /> {t('geo.fence.remove')}
          </button>
        </div>
      )}
    </section>
  );
}

/** Alerta de cerca pendente plotado pela camada de alertas. */
function AlertDetalhe({ alert }: { alert: AlertItem }) {
  const t = useT();
  const coords = alertCoords(alert);
  return (
    <section className="p-3 border-b border-border-light" data-testid="alert-detalhe">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
        {t('geo.detail.alert')}
      </p>
      <p className="text-[12px] font-semibold">{alert.title}</p>
      <dl className="space-y-1 text-[11px] mt-2">
        {alert.severity && (
          <div className="flex justify-between">
            <dt className="text-muted-on-light">{t('geo.fence.severity')}</dt>
            <dd className="font-mono">{t(`geo.severity.${alert.severity}`)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted-on-light">{t('geo.detail.seenAt')}</dt>
          <dd className="font-mono">{alert.created_at}</dd>
        </div>
        {coords && (
          <div className="flex justify-between">
            <dt className="text-muted-on-light">{t('geo.detail.coords')}</dt>
            <dd className="font-mono">
              {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </dd>
          </div>
        )}
      </dl>
      <Link
        href="/alertas"
        className="mt-3 h-7 bg-raised-light border border-border-light hover:border-primary text-[11px] flex items-center justify-center gap-1.5"
      >
        <ExternalLink className="w-3 h-3" strokeWidth={1.5} /> {t('geo.detail.openAlertas')}
      </Link>
      {coords && (
        <SensoresProximos
          nodeId={alert.id}
          anchorLat={coords.lat}
          anchorLng={coords.lng}
          anchorName={alert.title}
        />
      )}
    </section>
  );
}

function StreamDetalhe({ stream }: { stream: import('@/lib/api/cctv').CCTVStream }) {
  return (
    <>
      <section className="p-3 border-b border-border-light space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold flex-1">
            Câmera CCTV
          </p>
          <HlsBadge live={stream.status === 'online'} />
        </div>
        <p className="text-[12px] font-semibold leading-tight">{stream.name}</p>

        {/* Mini HLS player ao vivo */}
        <div className="aspect-video bg-black border border-border-light overflow-hidden">
          <HlsPlayer url={stream.url} autoPlay muted controls={false} />
        </div>

        <dl className="space-y-1 text-[11px] mt-1">
          <div className="flex justify-between">
            <dt className="text-muted-on-light flex items-center gap-1">
              <MapPin className="w-3 h-3" strokeWidth={1.5} /> Coordenadas
            </dt>
            <dd className="font-mono">
              {stream.latitude?.toFixed(4) ?? '—'}, {stream.longitude?.toFixed(4) ?? '—'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-on-light">Cidade</dt>
            <dd>{stream.city ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-on-light">Tipo</dt>
            <dd className="font-mono">{stream.source_type ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-on-light">IA (LPR/face)</dt>
            <dd className={stream.detection_enabled ? 'text-success font-mono' : 'text-muted-on-light font-mono'}>
              {stream.detection_enabled ? 'on' : 'off'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-on-light">Status</dt>
            <dd className="font-mono">{stream.status}</dd>
          </div>
        </dl>

        {stream.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {stream.tags.slice(0, 6).map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 bg-raised-light text-[9px] font-mono uppercase tracking-wide border border-border-light"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <Link
            href={`/cameras?stream=${stream.id}`}
            className="flex-1 h-7 bg-raised-light border border-border-light hover:border-primary text-[11px] flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" strokeWidth={1.5} /> Abrir /cameras
          </Link>
          <Link
            href={`/ficha/${stream.id}`}
            className="flex-1 h-7 bg-raised-light border border-border-light hover:border-primary text-[11px] flex items-center justify-center gap-1.5"
          >
            Ficha do sensor
          </Link>
        </div>
      </section>
      {stream.latitude != null && stream.longitude != null && (
        <section className="p-3 border-b border-border-light">
          <SensoresProximos
            nodeId={stream.id}
            anchorLat={stream.latitude}
            anchorLng={stream.longitude}
            anchorName={stream.name}
          />
        </section>
      )}
    </>
  );
}

/**
 * Sensores próximos + correlação espaço-temporal — o "câmera sinaliza
 * evento → ver vizinhos" do operador.
 *
 * Roda sobre QUALQUER nó posicionado (Event de câmera / Observation de
 * telemetria / Alert / cctv_stream): chama GET /situational/nearby ao vivo
 * (raio + janela), lista os vizinhos com distância + Δtempo (JetBrains Mono),
 * desenha as linhas âncora→vizinhos no globo (cor distinta da relação do
 * Sprint 7) e oferece materializar/cortar as correlações.
 *
 * Multidomínio: nenhuma classe de domínio aqui — mineração herda igual
 * (caminhão=Observation de telemetria, câmera de pátio=Event). 'acidente'
 * jamais é hardcoded; o motor cruza qualquer Observation.
 */
function SensoresProximos({
  nodeId,
  anchorLat,
  anchorLng,
  anchorName,
}: {
  nodeId: string;
  anchorLat: number;
  anchorLng: number;
  anchorName: string;
}) {
  const t = useT();
  const { flyToRef, setSelected, setCorrelationLines, setMaterializedCorrelations } =
    useGeo();
  // CORRELAÇÃO é gesto auditado e reversível — Correlacionar/Cortar pedem
  // a perm de gestão (situational.correlate.manage).
  const canManage = useCan('situational.correlate.manage');

  const [radiusM, setRadiusM] = useState<number>(200);
  const [windowS, setWindowS] = useState<number>(900);
  const [neighbors, setNeighbors] = useState<SituationalNeighbor[]>([]);
  const [existing, setExisting] = useState<CorrelationEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [working, setWorking] = useState(false);

  // O desenho das linhas é por nó — usamos uma ref pra limpar SÓ o que
  // este painel desenhou quando desmonta/troca de seleção.
  const anchorRef = useRef({ lat: anchorLat, lng: anchorLng });
  anchorRef.current = { lat: anchorLat, lng: anchorLng };

  const drawLines = useCallback(
    (viz: SituationalNeighbor[], edges: CorrelationEdge[]) => {
      const a = anchorRef.current;
      const targetById = new Map(viz.map((n) => [n.node_id, n]));
      const nearbyLines: CorrelationLine[] = viz.map((n) => ({
        id: `nearby-${nodeId}-${n.node_id}`,
        kind: 'nearby',
        path: [
          [a.lat, a.lng],
          [n.lat, n.lng],
        ],
        label: fmtDistance(n.distance_m),
      }));
      // Aresta materializada cuja ponta é um vizinho conhecido vira linha
      // cheia (evidência) — quando a ponta não está na lista atual de
      // vizinhos, não há coordenada pra desenhar (fica só na lista textual).
      const matLines: CorrelationLine[] = [];
      for (const e of edges) {
        const otherId = e.source_node_id === nodeId ? e.target_node_id : e.source_node_id;
        const other = targetById.get(otherId);
        if (!other) continue;
        matLines.push({
          id: `materialized-${e.edge_id}`,
          kind: 'materialized',
          path: [
            [a.lat, a.lng],
            [other.lat, other.lng],
          ],
          label: fmtDistance(other.distance_m),
        });
      }
      setCorrelationLines([...nearbyLines, ...matLines]);
      setMaterializedCorrelations(edges.length);
    },
    [nodeId, setCorrelationLines, setMaterializedCorrelations],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [nb, corr] = await Promise.all([
        Situational.nearby({ node_id: nodeId, radius_m: radiusM, window_s: windowS }),
        Situational.correlations(nodeId).catch(() => ({ correlations: [] })),
      ]);
      setNeighbors(nb.neighbors);
      setExisting(corr.correlations);
      drawLines(nb.neighbors, corr.correlations);
    } catch {
      setError(true);
      setNeighbors([]);
      setCorrelationLines([]);
    } finally {
      setLoading(false);
    }
  }, [nodeId, radiusM, windowS, drawLines, setCorrelationLines]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Limpa o desenho ao trocar de nó / desmontar (não deixa linha órfã).
  useEffect(() => {
    return () => {
      setCorrelationLines([]);
      setMaterializedCorrelations(0);
    };
  }, [setCorrelationLines, setMaterializedCorrelations]);

  const focusNeighbor = (n: SituationalNeighbor) => {
    flyToRef.current?.(n.lat, n.lng, 2000);
    setSelected({
      kind: 'node',
      node: {
        id: n.node_id,
        node_type: n.node_type,
        name: n.name,
        lat: n.lat,
        lng: n.lng,
        detected_at: null,
        properties_resumo: {},
      },
    });
  };

  const correlate = async () => {
    if (working) return;
    const ok = await confirmModal({
      title: t('geo.corr.correlateTitle'),
      description: `${anchorName} · ${neighbors.length} ${t('geo.nearby.title').toLowerCase()} — ${t('geo.corr.correlateBody')}`,
      confirmLabel: t('geo.corr.correlate'),
    });
    if (!ok) return;
    setWorking(true);
    try {
      const res = await Situational.correlate({
        anchor_node_id: nodeId,
        radius_m: radiusM,
        window_s: windowS,
      });
      if (res.correlations.length === 0) {
        toast.error(t('geo.corr.correlateNone'));
      } else {
        toast.success(t('geo.corr.correlated'));
      }
      await reload();
    } catch {
      toast.error(t('geo.corr.correlateFailed'));
    } finally {
      setWorking(false);
    }
  };

  const cut = async (edge: CorrelationEdge) => {
    if (working) return;
    const ok = await confirmModal({
      title: t('geo.corr.cutTitle'),
      description: t('geo.corr.cutBody'),
      tone: 'danger',
      confirmLabel: t('geo.corr.cut'),
    });
    if (!ok) return;
    setWorking(true);
    try {
      await Situational.cutCorrelation(edge.edge_id);
      toast.success(t('geo.corr.cutDone'));
      await reload();
    } catch {
      toast.error(t('geo.corr.cutFailed'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-border-light" data-testid="sensores-proximos">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
        {t('geo.nearby.title')}
      </p>
      <p className="text-[10px] text-muted-on-light leading-tight mb-2">
        {t('geo.nearby.hint')}
      </p>

      {/* Controles discretos — raio + janela com rótulos humanos. */}
      <div className="space-y-1.5 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-on-light w-12 shrink-0">
            {t('geo.nearby.radius')}
          </span>
          <div className="flex gap-1">
            {NEARBY_RADII.map((r) => (
              <button
                key={r}
                type="button"
                data-testid={`nearby-radius-${r}`}
                onClick={() => setRadiusM(r)}
                className={cn(
                  'h-6 px-2 text-[10px] font-mono border',
                  radiusM === r
                    ? 'bg-primary text-white border-primary'
                    : 'bg-raised-light border-border-light text-muted-on-light hover:border-primary',
                )}
              >
                {r} m
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-on-light w-12 shrink-0">
            {t('geo.nearby.window')}
          </span>
          <div className="flex gap-1">
            {NEARBY_WINDOWS.map((w) => (
              <button
                key={w.s}
                type="button"
                data-testid={`nearby-window-${w.s}`}
                onClick={() => setWindowS(w.s)}
                className={cn(
                  'h-6 px-2 text-[10px] font-mono border',
                  windowS === w.s
                    ? 'bg-primary text-white border-primary'
                    : 'bg-raised-light border-border-light text-muted-on-light hover:border-primary',
                )}
              >
                {t(w.key)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de vizinhos — distância + Δtempo em JetBrains Mono. */}
      {loading && (
        <p className="text-[11px] text-muted-on-light italic py-1">
          {t('geo.nearby.loading')}
        </p>
      )}
      {!loading && error && (
        <p className="text-[11px] text-danger py-1">{t('geo.nearby.error')}</p>
      )}
      {!loading && !error && neighbors.length === 0 && (
        <p className="text-[11px] text-muted-on-light italic py-1">
          {t('geo.nearby.empty')}
        </p>
      )}
      {!loading && !error && neighbors.length > 0 && (
        <ul className="space-y-1" data-testid="nearby-list">
          {neighbors.map((n) => (
            <li key={n.node_id}>
              <button
                type="button"
                data-testid={`nearby-neighbor-${n.node_id}`}
                onClick={() => focusNeighbor(n)}
                className="w-full text-left px-2 py-1.5 bg-raised-light border border-border-light hover:border-primary"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] truncate" title={n.name}>
                    {n.name}
                  </span>
                  <span
                    className="text-[9px] uppercase tracking-wide text-muted-on-light shrink-0"
                    style={{ color: CORRELATION_COLOR }}
                  >
                    {humanizeNodeType(n.node_type)}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 font-mono text-[10px] text-muted-on-light">
                  <span>{fmtDistance(n.distance_m)}</span>
                  <span>{`Δ ${fmtDelta(n.delta_s)}`}</span>
                  <span className="ml-auto">{`${(n.confidence * 100).toFixed(0)}%`}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Materializar — gesto auditado/reversível (gated manage). */}
      {canManage && neighbors.length > 0 && (
        <button
          type="button"
          data-testid="correlacionar"
          disabled={working}
          onClick={correlate}
          className="mt-2 w-full h-7 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <GitBranch className="w-3 h-3" strokeWidth={1.5} /> {t('geo.corr.correlate')}
        </button>
      )}

      {/* Correlações existentes — cada uma com Cortar (reversível). */}
      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
          {t('geo.corr.existing')}
        </p>
        {existing.length === 0 ? (
          <p className="text-[11px] text-muted-on-light italic">
            {t('geo.corr.existingEmpty')}
          </p>
        ) : (
          <ul className="space-y-1" data-testid="correlations-list">
            {existing.map((e) => {
              const otherId = e.source_node_id === nodeId ? e.target_node_id : e.source_node_id;
              const viz = neighbors.find((n) => n.node_id === otherId);
              return (
                <li
                  key={e.edge_id}
                  className="flex items-center gap-2 px-2 py-1.5 bg-raised-light border border-border-light"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] truncate" title={viz?.name ?? otherId}>
                      {viz?.name ?? otherId}
                    </p>
                    <p className="font-mono text-[10px] text-muted-on-light">
                      {e.distance_m != null ? fmtDistance(e.distance_m) : '—'}
                      {' · Δ '}
                      {e.delta_s != null ? fmtDelta(e.delta_s) : '—'}
                      {e.confidence != null
                        ? ` · ${(e.confidence * 100).toFixed(0)}% ${t('geo.corr.confidence')}`
                        : ''}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      data-testid={`cortar-correlacao-${e.edge_id}`}
                      onClick={() => cut(e)}
                      disabled={working}
                      aria-label={t('geo.corr.cut')}
                      title={t('geo.corr.cut')}
                      className="h-5 w-5 flex items-center justify-center text-muted-on-light hover:text-danger shrink-0 disabled:opacity-50"
                    >
                      <Scissors className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
