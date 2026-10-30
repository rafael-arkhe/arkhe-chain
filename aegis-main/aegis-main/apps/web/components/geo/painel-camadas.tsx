'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bell,
  Camera,
  ChevronDown,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Hexagon,
  Layers,
  PenLine,
  RefreshCw,
  Search,
  Shapes,
  Trash2,
  Upload,
} from 'lucide-react';
import { Cctv, type CCTVStream } from '@/lib/api/cctv';
import { Alerts } from '@/lib/api';
import { Geo, type GeoNodeType } from '@/lib/api/geo';
import { cn } from '@/lib/cn';
import { useCan } from '@/lib/auth/useAuth';
import { Workshop } from '@/lib/workshop/client';
import { useT } from '@/lib/i18n/provider';
import { toast } from '@/components/ui/toast';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { useGeo, REF_LAYER_COLORS } from './geo-context';
import { RefParamControl } from './ref-param-control';
import { EvaluatorStatusCard } from './evaluator-status';
import { ImportarZonaModal } from './importar-zona-modal';
import { zoneStyle, ZONE_TYPES } from './geo-zones';
import { colorForNodeType, geofenceCenter, humanizeNodeType, SEVERITY_COLOR } from './geo-utils';
import {
  allSourceTags,
  buildGeoSources,
  filterGeoSources,
  normalizeGeoSource,
  sourceDeepLink,
  type GeoSource,
  type GeoSourceCategory,
  type GeoSourceState,
} from './geo-sources';

/**
 * Estado da fonte → cor (SÓ de estado, nunca decorativa): produzindo=verde,
 * ocioso/disponível=neutro, vazio/offline=vermelho.
 */
const SOURCE_STATE_COLOR: Record<GeoSourceState, string> = {
  active: 'text-success',
  idle: 'text-muted-on-light',
  available: 'text-muted-on-light',
  empty: 'text-danger',
  offline: 'text-danger',
};

/** Ícone lucide neutro por categoria de fonte (mesma linguagem das camadas). */
const SOURCE_CAT_ICON: Record<
  GeoSourceCategory,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  ontology: Hexagon,
  reference: Layers,
  cctv: Camera,
  geofence: Crosshair,
  correlation: GitBranch,
};

/** Ordem canônica das facetas de categoria. */
const SOURCE_CAT_ORDER: GeoSourceCategory[] = [
  'ontology',
  'reference',
  'cctv',
  'geofence',
  'correlation',
];

/** Centroide (média dos vértices) do anel [lon,lat] de uma zona — destino do
 *  flyTo ao clicar no nome. null se a geometria estiver vazia (nunca voa a
 *  destino inventado). */
function zoneCentroid(geometry: number[][]): { lat: number; lng: number } | null {
  if (!Array.isArray(geometry) || geometry.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [lon, lat] of geometry) {
    sx += lon;
    sy += lat;
  }
  return { lng: sx / geometry.length, lat: sy / geometry.length };
}

/**
 * Painel de camadas do /geo. Cada toggle muda visibilidade no Cesium
 * em tempo real (via GeoContext). As "Camadas da ontologia" nascem do
 * DADO do tenant (GET /geo/node-types) — zero hardcode de domínio.
 * Tab "fontes" mostra o que cada camada está consumindo do ontology.
 */
/** Slug do app da Loja (seed `construtor-camadas`) — o atalho da seção de
 *  camadas de referência resolve o id por ele. */
const CONSTRUTOR_APP_SLUG = 'construtor-camadas';
const CAMADA_MANAGE_PERM = 'security.geo.camada.manage';

export function PainelCamadas() {
  const {
    filters,
    setFilters,
    isFullscreen,
    nodeTypes,
    activeTypes,
    toggleNodeType,
    layerNodes,
    truncatedTypes,
    referenceLayers,
    activeReferenceLayers,
    referenceGeoJSON,
    toggleReferenceLayer,
    referenceRendered,
    geofences,
    reloadGeofences,
    pendingAlerts,
    flyToRef,
    setSelected,
    materializedCorrelations,
    zones = [],
    reloadZones,
    importZones,
  } = useGeo();
  const t = useT();
  const canManageFences = useCan('alerts.geofences.manage');
  const canManageZones = useCan('security.geo.zona.manage');
  const canManageCamadas = useCan(CAMADA_MANAGE_PERM);
  // id do app "Construtor de Camadas" quando instalado neste tenant (Loja) —
  // sem ele, nenhum atalho é oferecido (link morto é pior que ausência).
  const [construtorAppId, setConstrutorAppId] = useState<string | null>(null);
  const [tab, setTab] = useState<'camadas' | 'fontes'>('camadas');
  const [importZonaOpen, setImportZonaOpen] = useState(false);
  const [streams, setStreams] = useState<CCTVStream[]>([]);
  const [refParams, setRefParams] = useState<Record<string, string>>({});
  // Fontes do backend (ontologia + referência, com proveniência/estado) —
  // câmeras/cercas/correlações são compostas no cliente (buildGeoSources).
  const [backendSources, setBackendSources] = useState<GeoSource[]>([]);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceCat, setSourceCat] = useState<GeoSourceCategory | null>(null);
  const [sourceTag, setSourceTag] = useState<string | null>(null);
  // `referencia` nasce fechada porque o catálogo externo (IBGE/CNES) é ruído
  // no dia a dia — mas quando o tenant TEM camada própria materializada por
  // pipeline, ela é o resultado do trabalho do operador: publicar e não ver a
  // camada listada é a mesma armadilha do "board ok, mapa sem nada".
  const [openSections, setOpenSections] = useState({
    ontology: true,
    referencia: false,
    geofences: true,
    zones: true,
    cameras: true,
    detections: true,
    alerts: false,
    correlations: true,
  });

  useEffect(() => {
    Cctv.streams.list().then(setStreams).catch(() => setStreams([]));
  }, []);

  useEffect(() => {
    // Promise.resolve() antes de invocar torna resiliente a Geo.sources
    // ausente (mocks de teste) — qualquer erro cai no fallback [].
    Promise.resolve()
      .then(() => Geo.sources())
      .then((r) => setBackendSources((r?.sources ?? []).map(normalizeGeoSource)))
      .catch(() => setBackendSources([]));
  }, []);

  useEffect(() => {
    // O atalho pro Construtor só existe se o app estiver instalado (Loja) E o
    // operador puder desenhar. Falha-suave: sem app, sem atalho.
    if (!canManageCamadas) {
      setConstrutorAppId(null);
      return;
    }
    Promise.resolve()
      .then(() => Workshop.list())
      .then((apps) => {
        // no cliente do Workshop o slug do backend chega como `external_id`
        const app = (apps || []).find((a) => a.external_id === CONSTRUTOR_APP_SLUG);
        setConstrutorAppId(app?.id ?? null);
      })
      .catch(() => setConstrutorAppId(null));
  }, [canManageCamadas]);

  const refreshStreams = async () => {
    try {
      setStreams(await Cctv.streams.list());
    } catch {
      /* ignora */
    }
  };

  const toggleSection = (k: keyof typeof openSections) =>
    setOpenSections((p) => ({ ...p, [k]: !p[k] }));

  const removeFence = async (id: string, name: string) => {
    const ok = await confirmModal({
      title: t('geo.fence.removeTitle'),
      description: `${name} — ${t('geo.fence.removeBody')}`,
      tone: 'danger',
      confirmLabel: t('geo.fence.remove'),
    });
    if (!ok) return;
    try {
      await Alerts.geofences.remove(id);
      toast.success(t('geo.fence.removed'));
      setSelected(null);
      await reloadGeofences();
    } catch {
      toast.error(t('geo.fence.removeFailed'));
    }
  };

  const removeZone = async (id: string, name: string) => {
    const ok = await confirmModal({
      title: t('geo.zone.removeTitle'),
      description: `${name} — ${t('geo.zone.removeBody')}`,
      tone: 'danger',
      confirmLabel: t('geo.zone.remove'),
    });
    if (!ok) return;
    try {
      await Geo.deleteZone(id);
      toast.success(t('geo.zone.removed'));
      setSelected(null);
      await reloadZones();
    } catch {
      toast.error(t('geo.zone.removeFailed'));
    }
  };

  /** Rótulo do tipo de zona — cai no valor cru se não for canônico
   *  (o dicionário só cobre os ZONE_TYPES padrão). */
  const zoneTypeLabel = (zt: string) =>
    (ZONE_TYPES as readonly string[]).includes(zt) ? t(`geo.zone.type.${zt}`) : zt;

  const cameraCount = streams.length;
  const onlineCount = streams.filter((s) => s.status === 'online').length;
  const iaCount = streams.filter((s) => s.detection_enabled).length;

  // Abre a seção de referência na 1ª vez que aparecer uma camada do operador
  // (styled). Guard por ref: só o primeiro reconhecimento — depois disso quem
  // manda é o clique dele.
  const abriuRefRef = React.useRef(false);
  useEffect(() => {
    if (abriuRefRef.current) return;
    if (nodeTypes.some((nt) => nt.styled)) {
      abriuRefRef.current = true;
      setOpenSections((p) => ({ ...p, referencia: true }));
    }
  }, [nodeTypes]);

  // Camadas materializadas por PIPELINE (styled) são CAMADAS DE REFERÊNCIA — vão pra
  // seção "Camadas de referência" (não "ontologia"). As cruas (requerimento etc.)
  // ficam em "ontologia". Mesma UI de toggle (toggleNodeType).
  const styledTypes = nodeTypes.filter((nt) => nt.styled);
  const ontologyTypes = nodeTypes.filter((nt) => !nt.styled);
  const renderNodeTypeItem = (nt: GeoNodeType) => {
    const active = activeTypes.includes(nt.node_type);
    const loaded = layerNodes[nt.node_type]?.length;
    const truncated = truncatedTypes.includes(nt.node_type);
    return (
      <li
        key={nt.node_type}
        className="px-3 py-1 text-[11px] flex items-center gap-2 hover:bg-raised-light/50"
      >
        <span className="w-2 h-2 shrink-0" style={{ backgroundColor: colorForNodeType(nt.node_type) }} />
        <span className="flex-1 truncate" title={nt.node_type}>
          {nt.label || humanizeNodeType(nt.node_type)}
        </span>
        <span className="font-mono text-[9px] text-muted-on-light shrink-0">
          {active && loaded != null ? `${loaded}/${nt.count}` : nt.count}
          {truncated ? ` · ${t('geo.layers.truncated')}` : ''}
        </span>
        <button
          type="button"
          data-testid={`layer-toggle-${nt.node_type}`}
          onClick={() => toggleNodeType(nt.node_type)}
          aria-label={active ? 'Ocultar camada' : 'Mostrar camada'}
          className={cn(
            'h-5 w-5 flex items-center justify-center transition-colors shrink-0',
            active ? 'text-success' : 'text-muted-on-light hover:text-text-on-light',
          )}
        >
          {active ? <Eye className="w-3.5 h-3.5" strokeWidth={1.5} /> : <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />}
        </button>
      </li>
    );
  };

  if (isFullscreen) return null;

  // Registro unificado de FONTES (data-driven): backend + câmeras/cercas/
  // correlações compostas. Facetas e busca operam sobre esta lista.
  const allSources = buildGeoSources({
    backend: backendSources,
    cctvTotal: cameraCount,
    cctvOnline: onlineCount,
    geofenceTotal: geofences.length,
    geofenceActive: geofences.filter((g) => g.active).length,
    correlations: materializedCorrelations,
  });
  const sourceTags = allSourceTags(allSources);
  const presentCats = SOURCE_CAT_ORDER.filter((c) =>
    allSources.some((s) => s.category === c),
  );
  const filteredSources = filterGeoSources(allSources, {
    query: sourceQuery,
    category: sourceCat ?? undefined,
    tag: sourceTag ?? undefined,
  });

  return (
    <aside
      data-testid="painel-camadas"
      className="w-[300px] bg-panel-light border-r border-border-light flex flex-col shrink-0 overflow-hidden"
    >
      <div className="h-9 flex items-stretch border-b border-border-light">
        {(['camadas', 'fontes'] as const).map((tb) => (
          <button
            key={tb}
            type="button"
            data-testid={`tab-${tb}`}
            onClick={() => setTab(tb)}
            className={cn(
              'flex-1 text-[11px] uppercase tracking-wider transition-colors relative',
              tab === tb
                ? 'text-text-on-light font-medium after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-primary'
                : 'text-muted-on-light hover:text-text-on-light',
            )}
          >
            {tb}
          </button>
        ))}
      </div>

      {tab === 'camadas' && (
        <div className="flex-1 overflow-y-auto">
          {/* Camadas da ontologia — node_types do TENANT com nós geo
              (GET /geo/node-types). Lista nasce do dado, não de código. */}
          <div className="border-b border-border-light" data-testid="camadas-ontologia">
            <div className="w-full px-3 h-9 flex items-center gap-2 text-[12px] hover:bg-raised-light">
              <button
                type="button"
                onClick={() => toggleSection('ontology')}
                className="flex items-center gap-1.5 flex-1 text-left"
              >
                {openSections.ontology ? (
                  <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                ) : (
                  <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                )}
                <Hexagon className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
                <span className="flex-1 truncate">
                  {t('geo.layers.ontology')} · {ontologyTypes.length}
                </span>
              </button>
            </div>
            {openSections.ontology && (
              <ul className="pb-1">
                {ontologyTypes.length === 0 && (
                  <li className="px-9 py-1.5 text-[10px] text-muted-on-light leading-tight">
                    {t('geo.layers.ontologyEmpty')}
                  </li>
                )}
                {ontologyTypes.map(renderNodeTypeItem)}
              </ul>
            )}
          </div>

          {/* Camadas de REFERÊNCIA — geografia externa keyless (IBGE limites,
              CNES saúde) + as desenhadas pelo operador no Construtor de Camadas. */}
          <div className="border-b border-border-light" data-testid="camadas-referencia">
            <div className="w-full px-3 h-9 flex items-center gap-1.5 text-[12px] hover:bg-raised-light">
              <button
                type="button"
                onClick={() => toggleSection('referencia')}
                className="flex-1 flex items-center gap-1.5 text-left min-w-0"
              >
                {openSections.referencia ? (
                  <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                ) : (
                  <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                )}
                <Layers className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
                <span className="flex-1 truncate">
                  {t('geo.layers.reference')} · {referenceLayers.length + styledTypes.length}
                </span>
              </button>
              {/* Atalho pro Construtor — só aparece com a perm E com o app
                  instalado (o link morto seria pior que a ausência dele). */}
              {construtorAppId && (
                <Link
                  href={`/workshop/view/${construtorAppId}`}
                  data-testid="abrir-construtor-camadas"
                  title={t('geo.layers.openBuilder')}
                  aria-label={t('geo.layers.openBuilder')}
                  className="h-5 w-5 flex items-center justify-center shrink-0 text-muted-on-light hover:text-text-on-light"
                >
                  <PenLine className="w-3.5 h-3.5" strokeWidth={1.5} />
                </Link>
              )}
            </div>
            {openSections.referencia && (
              <ul className="pb-1">
                {/* camadas de referência materializadas por PIPELINE (styled) — o output
                    do DAG (ex.: zonas do município) aparece AQUI, junto do IBGE. */}
                {styledTypes.map(renderNodeTypeItem)}
                {referenceLayers.length === 0 && styledTypes.length === 0 && (
                  <li className="px-9 py-1.5 text-[10px] text-muted-on-light leading-tight">
                    {t('geo.layers.referenceEmpty')}
                  </li>
                )}
                {referenceLayers.map((l) => {
                  const active = activeReferenceLayers.includes(l.id);
                  const count = referenceGeoJSON[l.id]?.features.length;
                  const needsParam = l.params.length > 0;
                  const paramKey = l.params[0];
                  const paramVal = (refParams[l.id] ?? '').trim();
                  return (
                    <li
                      key={l.id}
                      className="px-3 py-1 text-[11px] hover:bg-raised-light/50"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 shrink-0 border border-white/40"
                          style={{ backgroundColor: REF_LAYER_COLORS[l.id] || '#2D77BE' }}
                          title={`cor da camada no mapa`}
                        />
                        <span className="flex-1 truncate" title={l.hint || l.label}>
                          {l.label}
                        </span>
                        {active && count != null && referenceRendered[l.id] == null && (
                          <span className="font-mono text-[9px] text-muted-on-light shrink-0">
                            {count}
                          </span>
                        )}
                        {active && referenceRendered[l.id] != null && (
                          <span
                            data-testid={`ref-layer-rendered-${l.id}`}
                            className="font-mono text-[9px] text-success shrink-0"
                            title="Feições desenhadas no globo"
                          >
                            {referenceRendered[l.id]} no mapa
                          </span>
                        )}
                        <button
                          type="button"
                          data-testid={`ref-layer-toggle-${l.id}`}
                          onClick={() =>
                            toggleReferenceLayer(
                              l.id,
                              needsParam
                                ? ({ [paramKey]: paramVal } as { uf?: string; municipio?: string })
                                : undefined,
                            )
                          }
                          disabled={needsParam && !active && !paramVal}
                          aria-label={active ? 'Ocultar camada' : 'Mostrar camada'}
                          className={cn(
                            'h-5 w-5 flex items-center justify-center transition-colors shrink-0 disabled:opacity-40',
                            active
                              ? 'text-success'
                              : 'text-muted-on-light hover:text-text-on-light',
                          )}
                        >
                          {active ? (
                            <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                          )}
                        </button>
                      </div>
                      {/* Parâmetro por SELETOR (UF/município) — nunca código cru.
                          Linha própria (o painel é estreito); o toggle acima só
                          habilita depois de escolher. */}
                      {needsParam && !active && (
                        <div className="mt-1 pl-4">
                          <RefParamControl
                            param={paramKey}
                            value={refParams[l.id] ?? ''}
                            onChange={(v) => setRefParams((p) => ({ ...p, [l.id]: v }))}
                            testId={`ref-layer-param-${l.id}`}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Cercas virtuais — a MESMA cerca que dispara alertas (store
              na ontologia, node_type='Geofence'). */}
          <Section
            label={`${t('geo.layers.geofences')} · ${geofences.length}`}
            open={openSections.geofences}
            onToggle={() => toggleSection('geofences')}
            visible={filters.showGeofences}
            onVisibilityChange={(v) => setFilters((p) => ({ ...p, showGeofences: v }))}
            icon={Crosshair}
          >
            <ul className="pb-1" data-testid="lista-cercas">
              {geofences.length === 0 && (
                <li className="px-9 py-1.5 text-[10px] text-muted-on-light leading-tight">
                  {t('geo.layers.geofencesEmpty')}
                </li>
              )}
              {geofences.map((g) => (
                <li
                  key={g.id}
                  className="px-3 py-1 text-[11px] flex items-center gap-2 hover:bg-raised-light/50"
                >
                  <span
                    className="w-2 h-2 shrink-0"
                    style={{ backgroundColor: SEVERITY_COLOR[g.severity] ?? '#2D77BE' }}
                    title={t(`geo.severity.${g.severity}`)}
                  />
                  <button
                    type="button"
                    data-testid={`cerca-${g.id}`}
                    onClick={() => {
                      const c = geofenceCenter(g);
                      if (c) flyToRef.current?.(c.lat, c.lng, 6000);
                      setSelected({ kind: 'geofence', geofence: g });
                    }}
                    className="flex-1 truncate text-left hover:text-primary"
                    title={g.name}
                  >
                    {g.name}
                  </button>
                  <span
                    className={cn(
                      'font-mono text-[9px] shrink-0',
                      g.active ? 'text-success' : 'text-muted-on-light',
                    )}
                  >
                    {g.active ? t('geo.fence.active') : t('geo.fence.inactive')}
                  </span>
                  {canManageFences && (
                    <button
                      type="button"
                      data-testid={`remover-cerca-${g.id}`}
                      onClick={() => removeFence(g.id, g.name)}
                      aria-label={t('geo.fence.remove')}
                      title={t('geo.fence.remove')}
                      className="h-5 w-5 flex items-center justify-center text-muted-on-light hover:text-danger shrink-0"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {/* Zonas operacionais (KMZ/KML/GeoJSON importadas) — camada no globo
              (exclusão/engajamento/observação/seguras). Store no tenant
              (node_type='GeoZone'), governada por security.geo.zona.manage. */}
          <Section
            label={`${t('geo.zone.layer')} · ${zones.length}`}
            open={openSections.zones}
            onToggle={() => toggleSection('zones')}
            visible={filters.showZones}
            onVisibilityChange={(v) => setFilters((p) => ({ ...p, showZones: v }))}
            icon={Shapes}
          >
            {canManageZones && (
              <div className="px-3 pt-1 pb-0.5">
                <button
                  type="button"
                  data-testid="importar-zona"
                  onClick={() => setImportZonaOpen(true)}
                  className="w-full h-7 flex items-center justify-center gap-1.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary"
                >
                  <Upload className="w-3 h-3" strokeWidth={1.5} />
                  {t('geo.zone.import')}
                </button>
              </div>
            )}
            <ul className="pb-1" data-testid="lista-zonas">
              {zones.length === 0 && (
                <li className="px-9 py-1.5 text-[10px] text-muted-on-light leading-tight">
                  {t('geo.zone.empty')}
                </li>
              )}
              {zones.map((z) => (
                <li
                  key={z.id}
                  data-testid={`zona-${z.id}`}
                  className="px-3 py-1 text-[11px] flex items-center gap-2 hover:bg-raised-light/50"
                >
                  <span
                    className="w-2 h-2 shrink-0"
                    style={{ backgroundColor: zoneStyle(z.zone_type).fill }}
                    title={zoneTypeLabel(z.zone_type)}
                  />
                  <button
                    type="button"
                    data-testid={`zona-nome-${z.id}`}
                    onClick={() => {
                      const c = zoneCentroid(z.geometry);
                      if (c) flyToRef.current?.(c.lat, c.lng, 8000);
                      setSelected({ kind: 'zone', zone: z });
                    }}
                    className="flex-1 truncate text-left hover:text-primary"
                    title={z.name}
                  >
                    {z.name}
                  </button>
                  <span className="px-1 text-[9px] uppercase tracking-wide text-muted-on-light border border-border-light shrink-0">
                    {zoneTypeLabel(z.zone_type)}
                  </span>
                  {canManageZones && (
                    <button
                      type="button"
                      data-testid={`remover-zona-${z.id}`}
                      onClick={() => removeZone(z.id, z.name)}
                      aria-label={t('geo.zone.remove')}
                      title={t('geo.zone.remove')}
                      className="h-5 w-5 flex items-center justify-center text-muted-on-light hover:text-danger shrink-0"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {/* Correlações espaço-temporais — linhas âncora↔vizinhos
              (exploração) + arestas CORRELACIONADO_COM materializadas.
              Liga/desliga o desenho no globo (cor distinta da relação). */}
          <Section
            label={`${t('geo.corr.layer')} · ${materializedCorrelations}`}
            open={openSections.correlations}
            onToggle={() => toggleSection('correlations')}
            visible={filters.showCorrelations}
            onVisibilityChange={(v) => setFilters((p) => ({ ...p, showCorrelations: v }))}
            icon={GitBranch}
          >
            <p
              data-testid="correlations-layer-hint"
              className="px-9 py-1.5 text-[10px] text-muted-on-light leading-tight"
            >
              {t('geo.corr.layerHint')}
            </p>
          </Section>

          {/* Alertas pendentes com geo (payload.coords das cercas). */}
          <Section
            label={`${t('geo.layers.alerts')} · ${pendingAlerts.length}`}
            open={openSections.alerts}
            onToggle={() => toggleSection('alerts')}
            visible={filters.showAlerts}
            onVisibilityChange={(v) => setFilters((p) => ({ ...p, showAlerts: v }))}
            icon={Bell}
          >
            <p className="px-9 py-1.5 text-[10px] text-muted-on-light leading-tight">
              {t('geo.layers.alertsHint')}
            </p>
          </Section>

          {/* Câmeras/Detecções: DINÂMICO — só aparecem quando o tenant tem streams
              de verdade (seed off / vertical sem câmera = nada de câmera no painel). */}
          {cameraCount > 0 && (
            <>
          {/* Câmeras CCTV */}
          <Section
            label={`Câmeras CCTV · ${cameraCount}`}
            open={openSections.cameras}
            onToggle={() => toggleSection('cameras')}
            visible={filters.showCameras}
            onVisibilityChange={(v) => setFilters((p) => ({ ...p, showCameras: v }))}
            icon={Camera}
            stats={
              <span className="font-mono text-[9px] text-muted-on-light">
                IA {iaCount}
              </span>
            }
            action={
              <button
                type="button"
                onClick={refreshStreams}
                aria-label="Recarregar"
                title="Recarregar streams do ontology"
                className="h-5 w-5 flex items-center justify-center text-muted-on-light hover:text-primary"
              >
                <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
              </button>
            }
          >
            <ul className="pb-1">
              {streams.map((s) => (
                <li
                  key={s.id}
                  className="px-9 py-1 text-[11px] flex items-center gap-2 hover:bg-raised-light/50"
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 shrink-0',
                      s.status === 'online' ? 'bg-success' : 'bg-muted-on-light',
                    )}
                  />
                  {/* gap d (Sprint 7): o nome era <span> estático — clicar
                      não fazia NADA (só as cercas tinham o botão com
                      flyToRef). Agora voa até a câmera + seleciona; sem
                      lat/lng NÃO voa (nunca destino inventado), só abre o
                      detalhe honesto. */}
                  <button
                    type="button"
                    data-testid={`camera-${s.id}`}
                    onClick={() => {
                      if (s.latitude != null && s.longitude != null) {
                        flyToRef.current?.(s.latitude, s.longitude, 1500);
                      }
                      setSelected({ kind: 'stream', stream: s });
                    }}
                    className="flex-1 truncate text-left text-muted-on-light hover:text-primary"
                    title={s.name}
                  >
                    {s.name}
                  </button>
                  {s.detection_enabled && (
                    <Activity className="w-2.5 h-2.5 text-success shrink-0" strokeWidth={2} />
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {/* Detecções recentes */}
          <Section
            label="Detecções recentes"
            open={openSections.detections}
            onToggle={() => toggleSection('detections')}
            visible={filters.showDetections}
            onVisibilityChange={(v) => setFilters((p) => ({ ...p, showDetections: v }))}
            icon={Activity}
            stats={
              <span className="font-mono text-[9px] text-muted-on-light">
                {filters.showDetections ? 'plotando' : 'oculto'}
              </span>
            }
          >
            <p className="px-9 py-1.5 text-[10px] text-muted-on-light leading-tight">
              Liga pra plotar pins das últimas detecções LPR/face — colorido
              por kind. Atualiza a cada 30s.
            </p>
          </Section>
            </>
          )}

        </div>
      )}

      {tab === 'fontes' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-[12px]">
          {/* Busca livre (nome | descrição | producer | tags). */}
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
            <input
              type="text"
              data-testid="fontes-busca"
              value={sourceQuery}
              onChange={(e) => setSourceQuery(e.target.value)}
              placeholder={t('geo.sources.search')}
              className="w-full h-7 bg-raised-light border border-border-light px-2 text-[12px] outline-none focus:border-primary"
            />
          </div>

          {/* Faceta de CATEGORIA — só as categorias presentes na lista. */}
          {presentCats.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {presentCats.map((c) => {
                const CatIcon = SOURCE_CAT_ICON[c];
                const sel = sourceCat === c;
                return (
                  <button
                    key={c}
                    type="button"
                    data-testid={`fontes-facet-cat-${c}`}
                    aria-pressed={sel}
                    onClick={() => setSourceCat(sel ? null : c)}
                    className={cn(
                      'h-6 px-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide border transition-colors',
                      sel
                        ? 'border-primary text-primary'
                        : 'border-border-light text-muted-on-light hover:bg-raised-light',
                    )}
                  >
                    <CatIcon className="w-3 h-3" strokeWidth={1.5} />
                    {t(`geo.sources.cat.${c}`)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Faceta de TAG — união ordenada de todas as tags das fontes. */}
          {sourceTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sourceTags.map((tg) => {
                const sel = sourceTag === tg;
                return (
                  <button
                    key={tg}
                    type="button"
                    data-testid={`fontes-facet-tag-${tg}`}
                    aria-pressed={sel}
                    onClick={() => setSourceTag(sel ? null : tg)}
                    className={cn(
                      'h-5 px-1.5 flex items-center text-[10px] border transition-colors',
                      sel
                        ? 'border-primary text-primary'
                        : 'border-border-light text-muted-on-light hover:bg-raised-light',
                    )}
                  >
                    {tg}
                  </button>
                );
              })}
            </div>
          )}

          {/* Fontes filtradas. */}
          <ul className="space-y-2" data-testid="fontes-lista">
            {filteredSources.length === 0 && (
              <li className="text-[10px] text-muted-on-light leading-tight">
                {t('geo.sources.empty')}
              </li>
            )}
            {filteredSources.map((s) => {
              const CatIcon = SOURCE_CAT_ICON[s.category];
              const link = sourceDeepLink(s);
              const linkLabel =
                s.category === 'ontology'
                  ? t('geo.sources.openFlow')
                  : t('geo.sources.openOrigin');
              return (
                <li
                  key={s.id}
                  data-testid={`fonte-${s.id}`}
                  className="border border-border-light p-2 hover:bg-raised-light"
                >
                  <div className="flex items-center gap-1.5">
                    <CatIcon
                      className="w-3 h-3 text-muted-on-light shrink-0"
                      strokeWidth={1.5}
                    />
                    <span className="flex-1 truncate font-medium" title={s.name}>
                      {s.name}
                    </span>
                    {s.count != null && (
                      <span className="font-mono text-[10px] text-muted-on-light shrink-0">
                        {s.count}
                      </span>
                    )}
                    <span
                      className={cn(
                        'text-[9px] uppercase tracking-wide shrink-0',
                        SOURCE_STATE_COLOR[s.state],
                      )}
                    >
                      {t(`geo.sources.state.${s.state}`)}
                    </span>
                  </div>
                  {(s.producer || s.description) && (
                    <p className="mt-1 text-[10px] text-muted-on-light leading-tight">
                      {s.producer ? `${s.producer} · ` : ''}
                      {s.description}
                    </p>
                  )}
                  {s.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.tags.map((tg) => (
                        <span
                          key={tg}
                          className="px-1 text-[9px] text-muted-on-light border border-border-light"
                        >
                          {tg}
                        </span>
                      ))}
                    </div>
                  )}
                  {link && (
                    <Link
                      href={link}
                      data-testid={`fonte-link-${s.id}`}
                      className="mt-1.5 h-6 bg-raised-light border border-border-light hover:border-primary text-[10px] flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink className="w-3 h-3" strokeWidth={1.5} /> {linkLabel}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {/* G10 — status do motor de geocercas (some sem atlas.evaluation.read). */}
      <EvaluatorStatusCard />

      {/* Importar zonas (KMZ/KML/GeoJSON) — modal DS (nunca diálogo nativo). */}
      {importZonaOpen && (
        <ImportarZonaModal
          importZones={importZones}
          onClose={() => setImportZonaOpen(false)}
        />
      )}
    </aside>
  );
}

function Section({
  label,
  open,
  onToggle,
  visible,
  onVisibilityChange,
  icon: Icon,
  stats,
  action,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  visible: boolean;
  onVisibilityChange: (v: boolean) => void;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  stats?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border-light">
      <div className="w-full px-3 h-9 flex items-center gap-2 text-[12px] hover:bg-raised-light">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 flex-1 text-left"
        >
          {open ? (
            <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
          ) : (
            <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
          )}
          <Icon className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
          <span className="flex-1 truncate">{label}</span>
        </button>
        {stats}
        {action}
        <button
          type="button"
          onClick={() => onVisibilityChange(!visible)}
          aria-label={visible ? 'Ocultar camada' : 'Mostrar camada'}
          className={cn(
            'h-5 w-5 flex items-center justify-center transition-colors',
            visible ? 'text-success' : 'text-muted-on-light hover:text-text-on-light',
          )}
        >
          {visible ? (
            <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
        </button>
      </div>
      {open && children}
    </div>
  );
}
