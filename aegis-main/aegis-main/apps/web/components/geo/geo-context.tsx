'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { CCTVStream, CCTVDetection } from '@/lib/api/cctv';
import { Geo, type GeoNode, type GeoNodeType, type GeoReferenceLayer } from '@/lib/api/geo';
import type { GeoZone, ZoneFeature } from './geo-zones';

type RefFeatureCollection = { type: 'FeatureCollection'; features: unknown[] };
import { Alerts } from '@/lib/api';
import type { AlertGeofence, AlertItem } from '@/lib/api/types';
import { expandirBbox, type LngLat } from './geo-utils';

/** Item geo-selecionado (clique no Cesium → painel detalhe + balão). */
export type GeoSelected =
  | { kind: 'stream'; stream: CCTVStream }
  | { kind: 'detection'; detection: CCTVDetection; stream?: CCTVStream }
  | { kind: 'node'; node: GeoNode }
  | { kind: 'zone'; zone: GeoZone }
  | { kind: 'geofence'; geofence: AlertGeofence }
  | { kind: 'alert'; alert: AlertItem }
  | { kind: 'refFeature'; layer: string; title?: string; props: Record<string, unknown> }
  | null;

/** Cor de cada camada de referência no /geo — DEVE casar com REF_STYLE do
 *  cesium-globe (o quadradinho do seletor usa isto pra o operador saber quem é
 *  quem no globo). */
export const REF_LAYER_COLORS: Record<string, string> = {
  ibge_uf_malha: '#2D77BE',
  ibge_municipio_malha: '#2D77BE',
  cnes_saude: '#2E8B7A',
  incra_assentamentos: '#C9A227',
  terras_indigenas: '#C56B4A',
  ucs_federais: '#3A8E6B',
  prodes_ti: '#E2483B',
  prodes_geral: '#E2483B',
  deter_amz: '#D6336C',
  focos_calor: '#FF6A00',
};

export type GeoFilters = {
  showCameras: boolean;
  showDetections: boolean;
  showGeofences: boolean;
  /** Zonas operacionais importadas (KMZ/GeoJSON) — camada no globo. */
  showZones: boolean;
  showAlerts: boolean;
  /** Correlações espaço-temporais (linhas âncora↔vizinhos / arestas
   *  CORRELACIONADO_COM materializadas). Liga/desliga a camada no globo. */
  showCorrelations: boolean;
};

/** Linha de correlação desenhada no mapa (par do GlobeLine/MapRoute do
 *  Sprint 7, mas cor distinta). `path` em [lat, lng] (convenção AEGIS).
 *  `kind`: 'nearby' = vizinho ainda NÃO materializado (exploração);
 *  'materialized' = aresta CORRELACIONADO_COM já gravada (evidência). */
export type CorrelationLine = {
  id: string;
  path: [number, number][];
  label?: string;
  kind: 'nearby' | 'materialized';
};

export type CameraPosition = {
  /** graus decimais */
  lat: number;
  lng: number;
  /** metros acima do ellipsoid */
  altitude: number;
};

export type FlyToFn = (lat: number, lng: number, altitudeMeters?: number) => void;

export type GeoTool =
  | 'selecionar'
  | 'poligono'
  | 'pin'
  | 'raio'
  | 'rota'
  | 'medir';

/** Geometria desenhada pelas ferramentas Raio (círculo) e Rota (corredor) no
 *  globo, pendente de nomear+criar como cerca. O polígono usa estado local do
 *  MapaCanvas (overlay SVG); círculo/rota nascem do Cesium e precisam de uma
 *  ponte — este draft. Coordenadas em [lon, lat] (contrato do store). */
export type ShapeDraft =
  | { kind: 'circle'; center: LngLat; radiusMeters: number }
  | { kind: 'route'; waypoints: LngLat[] }
  | null;

/** Cerca em REDESENHO: o operador clicou "Redesenhar no mapa" no painel-detalhe;
 *  o próximo desenho (polígono/raio/rota) SALVA via PATCH na cerca `id`
 *  (preserva name/severity), em vez de criar uma nova. null = modo criação. */
export type EditingFence = {
  id: string;
  name: string;
  severity: string;
  shape: string;
  /** Largura atual do corredor/rota (m) — pré-carrega o input no redesenho pra
   *  não resetar silenciosamente pro default. */
  widthMeters?: number;
} | null;

type Ctx = {
  selected: GeoSelected;
  setSelected: (s: GeoSelected) => void;
  filters: GeoFilters;
  setFilters: (f: GeoFilters | ((p: GeoFilters) => GeoFilters)) => void;
  camera: CameraPosition | null;
  setCamera: (c: CameraPosition | null) => void;
  /** Setado pelo CesiumGlobe quando o viewer está pronto; consumido
   *  pela busca/lateral pra animar a câmera até uma coordenada. */
  flyToRef: { current: FlyToFn | null };
  /** Modo tela cheia (escondem laterais não-essenciais). */
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  /** Tool ativa (palette à esquerda). Selecionar = pick padrão. */
  tool: GeoTool;
  setTool: (t: GeoTool) => void;
  /** Geometria de círculo/rota desenhada no globo, aguardando nome+severidade
   *  pra virar cerca. Setada pelo CesiumGlobe (Raio/Rota), consumida pelo
   *  card de criar-cerca do MapaCanvas. */
  shapeDraft: ShapeDraft;
  setShapeDraft: Dispatch<SetStateAction<ShapeDraft>>;
  /** Cerca sendo redesenhada (PATCH no save) ou null (modo criação). */
  editingFence: EditingFence;
  setEditingFence: (f: EditingFence) => void;
  /** Função pra limpar tudo que foi desenhado no mapa (pin/raio/rota/medir). */
  clearDrawingsRef: { current: (() => void) | null };
  /** Converte pixel do canvas → lat/lng do globo (setado pelo CesiumGlobe).
   *  É o que dá coordenada GEOGRÁFICA real ao polígono desenhado. */
  screenToGeoRef: {
    current: ((xPx: number, yPx: number) => { lat: number; lng: number } | null) | null;
  };
  /** Captura o canvas do Cesium como PNG dataURL (Exportar PNG real). */
  capturePngRef: { current: (() => string | null) | null };
  /** Inverso de screenToGeoRef: lon/lat do globo → pixel do canvas (setado pelo
   *  CesiumGlobe via SceneTransforms). É o que mantém o polígono em construção
   *  GRUDADO no chão quando a câmera move (flyTo/resize/fullscreen). null fora
   *  do globo (jsdom) → o overlay cai no % congelado do clique. */
  projectLonLatRef: {
    current: ((lon: number, lat: number) => { xPx: number; yPx: number } | null) | null;
  };
  /** Chamado pelo CesiumGlobe a cada frame (postRender). Um consumidor (o
   *  MapaCanvas, ao desenhar polígono) registra aqui sua re-projeção. */
  onGlobeFrameRef: { current: (() => void) | null };

  // ── Camadas da ontologia (data-driven — GET /geo/node-types) ──────────
  nodeTypes: GeoNodeType[];
  /** node_types com camada LIGADA. */
  activeTypes: string[];
  toggleNodeType: (nodeType: string) => void;
  /** Nós carregados por tipo ativo (GET /geo/nodes). */
  layerNodes: Record<string, GeoNode[]>;
  /** Refaz o fetch dos nós das camadas ativas (ex.: após editar/remover um
   *  nó pelo pino — o pin some/atualiza sem trocar de camada). */
  reloadLayers: () => Promise<void>;
  /** Tipos cuja resposta veio truncada (refine a janela). */
  truncatedTypes: string[];
  /** bbox do viewport atual "min_lon,min_lat,max_lon,max_lat" — carregamento
   *  progressivo. Setado pelo CesiumGlobe quando a câmera assenta; null = sem
   *  recorte (carga cega, teto default do backend). Ver rectangleToBbox. */
  viewportBbox: string | null;
  setViewportBbox: (b: string | null) => void;

  // ── Camadas de REFERÊNCIA (externas: IBGE limites, CNES saúde) ────────
  /** Catálogo de camadas de referência (GET /geo/reference-layers). */
  referenceLayers: GeoReferenceLayer[];
  /** Ids das camadas de referência LIGADAS. */
  activeReferenceLayers: string[];
  /** GeoJSON carregado por camada de referência ativa. */
  referenceGeoJSON: Record<string, RefFeatureCollection>;
  /** Liga/desliga uma camada de referência (busca o GeoJSON ao ligar). */
  toggleReferenceLayer: (id: string, params?: { uf?: string; municipio?: string }) => void;
  /** Nº de feições REALMENTE desenhadas no globo por camada (o CesiumGlobe
   *  reporta após adicionar o GeoJsonDataSource) — prova "está no mapa". */
  referenceRendered: Record<string, number>;
  /** Chamado pelo CesiumGlobe ao desenhar uma camada de referência. */
  markReferenceRendered: (id: string, count: number) => void;

  // ── Janela temporal REAL (since_minutes; null = sem filtro) ───────────
  sinceMinutes: number | null;
  setSinceMinutes: (m: number | null) => void;

  // ── Zonas operacionais (KMZ/GeoJSON — GET /geo/zones) ─────────────────
  /** Zonas persistidas do tenant (exclusão/engajamento/observação/seguras). */
  zones: GeoZone[];
  /** Refaz o fetch das zonas (fail-soft → []). */
  reloadZones: () => Promise<void>;
  /** Importa zonas normalizadas (saída de `geojsonToZoneFeatures`) e recarrega. */
  importZones: (
    features: ZoneFeature[],
    opts?: { source?: string; extruded_height?: number },
  ) => Promise<void>;

  // ── Cercas virtuais (Alerts.geofences — store na ontologia) ───────────
  geofences: AlertGeofence[];
  reloadGeofences: () => Promise<void>;

  // ── Alertas pendentes com geo (payload.coords das cercas) ─────────────
  pendingAlerts: AlertItem[];
  reloadAlerts: () => Promise<void>;

  // ── Correlação espaço-temporal (linhas no globo + camada) ─────────────
  /** Linhas âncora↔vizinhos desenhadas no mapa (cor distinta de relação).
   *  Setadas pelo painel-detalhe (Sensores próximos / Correlações). */
  correlationLines: CorrelationLine[];
  setCorrelationLines: (l: CorrelationLine[]) => void;
  /** Total de correlações materializadas em foco (camada do painel). */
  materializedCorrelations: number;
  setMaterializedCorrelations: (n: number) => void;
};

const GeoCtx = createContext<Ctx | null>(null);

/** Coords geográficas do payload de alerta de cerca ({lat, lon}). */
export function alertCoords(a: AlertItem): { lat: number; lng: number } | null {
  const coords = (a.payload as { coords?: unknown } | null | undefined)?.coords;
  if (!coords || typeof coords !== 'object') return null;
  const c = coords as { lat?: unknown; lon?: unknown; lng?: unknown };
  const lat = Number(c.lat);
  const lng = Number(c.lng ?? c.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function GeoProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<GeoSelected>(null);
  const [filters, setFilters] = useState<GeoFilters>({
    showCameras: true,
    showDetections: false,
    showGeofences: true,
    showZones: false,
    showAlerts: false,
    showCorrelations: true,
  });
  const [correlationLines, setCorrelationLines] = useState<CorrelationLine[]>([]);
  const [materializedCorrelations, setMaterializedCorrelations] = useState(0);
  const [camera, setCamera] = useState<CameraPosition | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tool, setTool] = useState<GeoTool>('selecionar');
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft>(null);
  const [editingFence, setEditingFence] = useState<EditingFence>(null);
  const flyToRef = useRef<FlyToFn | null>(null);
  const clearDrawingsRef = useRef<(() => void) | null>(null);
  const screenToGeoRef = useRef<((x: number, y: number) => { lat: number; lng: number } | null) | null>(null);
  const capturePngRef = useRef<(() => string | null) | null>(null);
  const projectLonLatRef = useRef<((lon: number, lat: number) => { xPx: number; yPx: number } | null) | null>(null);
  const onGlobeFrameRef = useRef<(() => void) | null>(null);

  const [nodeTypes, setNodeTypes] = useState<GeoNodeType[]>([]);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [layerNodes, setLayerNodes] = useState<Record<string, GeoNode[]>>({});
  /** Último resultado BOM por camada — rede que falha não apaga o mapa. */
  const anterioresRef = useRef<Record<string, GeoNode[]>>({});
  const [truncatedTypes, setTruncatedTypes] = useState<string[]>([]);
  const [viewportBbox, setViewportBbox] = useState<string | null>(null);
  const [sinceMinutes, setSinceMinutes] = useState<number | null>(null);
  const [geofences, setGeofences] = useState<AlertGeofence[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<AlertItem[]>([]);
  const [zones, setZones] = useState<GeoZone[]>([]);

  // Camadas disponíveis nascem do DADO do tenant (zero hardcode de domínio).
  useEffect(() => {
    let cancel = false;
    Geo.nodeTypes()
      .then((r) => {
        if (!cancel) setNodeTypes(r.node_types);
      })
      .catch(() => {
        if (!cancel) setNodeTypes([]);
      });
    return () => {
      cancel = true;
    };
  }, []);

  // Refaz o fetch dos nós das camadas ativas. Exposto p/ refresh manual
  // (ex.: após editar/remover um nó pelo pino — G11).
  const reloadLayers = useCallback(async () => {
    const next: Record<string, GeoNode[]> = {};
    const truncated: string[] = [];
    await Promise.all(
      activeTypes.map(async (nodeType) => {
        try {
          const r = await Geo.nodes({
            node_type: nodeType,
            since_minutes: sinceMinutes ?? undefined,
            // Viewport ativo → carrega só os nós visíveis, num teto MAIOR que
            // os 500 cegos do default; sem viewport, deixa o backend aplicar o
            // teto padrão (ambos undefined = sem recorte). Ver rectangleToBbox.
            // Carrega com FOLGA em volta da tela: sem isso o pin que encosta
            // na borda some no instante em que sai da vista e só volta depois
            // de uma ida ao servidor — era o "os marcadores somem quando movo
            // o mapa". A folga faz o que está logo fora já vir junto.
            bbox: viewportBbox ? expandirBbox(viewportBbox) : undefined,
            limit: viewportBbox ? 2000 : undefined,
          });
          next[nodeType] = r.nodes;
          if (r.truncated) truncated.push(nodeType);
        } catch {
          // Requisição cancelada/falha NÃO significa "não há nada aqui".
          // Transformar erro em camada vazia era o que fazia os marcadores
          // sumirem ao mover o globo: um arrasto dispara várias buscas, o
          // browser cancela as antigas, e cada cancelamento apagava a camada.
          // Mantém o que já estava desenhado.
          next[nodeType] = anterioresRef.current[nodeType] ?? [];
        }
      }),
    );
    anterioresRef.current = next;
    setLayerNodes(next);
    setTruncatedTypes(truncated);
    // viewportBbox nos deps: mudar o recorte da câmera recria reloadLayers, e o
    // effect [reloadLayers] abaixo re-dispara a carga progressiva por viewport
    // (uma única vez — sem effect redundante que fetcharia em dobro).
  }, [activeTypes, sinceMinutes, viewportBbox]);

  // Camada ligada (ou janela alterada) → refaz o fetch dos nós por tipo.
  useEffect(() => {
    let cancel = false;
    // Espera a câmera ASSENTAR antes de buscar. Sem isto, um arrasto disparava
    // uma busca completa por micro-movimento (medido: 6 num único gesto) — e
    // as antigas, canceladas pelo browser, apagavam a camada.
    const timer = setTimeout(() => {
      if (cancel) return;
      reloadLayers().catch(() => {
        // erro real: preserva o que já está no mapa (ver `anterioresRef`)
        if (!cancel) setTruncatedTypes([]);
      });
    }, 350);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [reloadLayers]);

  // ── Camadas de referência (externas) — catálogo + toggle com fetch ────
  const [referenceLayers, setReferenceLayers] = useState<GeoReferenceLayer[]>([]);
  const [activeReferenceLayers, setActiveReferenceLayers] = useState<string[]>([]);
  const [referenceGeoJSON, setReferenceGeoJSON] = useState<Record<string, RefFeatureCollection>>({});
  const [referenceRendered, setReferenceRendered] = useState<Record<string, number>>({});

  const markReferenceRendered = useCallback((id: string, count: number) => {
    setReferenceRendered((r) => ({ ...r, [id]: count }));
  }, []);

  useEffect(() => {
    let cancel = false;
    Geo.referenceLayers()
      .then((r) => { if (!cancel) setReferenceLayers(r.layers); })
      .catch(() => { if (!cancel) setReferenceLayers([]); });
    return () => { cancel = true; };
  }, []);

  const toggleReferenceLayer = useCallback(
    (id: string, params?: { uf?: string; municipio?: string }) => {
      setActiveReferenceLayers((prev) => {
        if (prev.includes(id)) {
          setReferenceGeoJSON((g) => {
            const n = { ...g };
            delete n[id];
            return n;
          });
          setReferenceRendered((r) => {
            const n = { ...r };
            delete n[id];
            return n;
          });
          return prev.filter((x) => x !== id);
        }
        // ativando → busca o GeoJSON (fail-soft: camada vazia não derruba o mapa).
        Geo.referenceLayer(id, params)
          .then((r) => setReferenceGeoJSON((g) => ({ ...g, [id]: r.geojson })))
          .catch(() =>
            setReferenceGeoJSON((g) => ({
              ...g,
              [id]: { type: 'FeatureCollection', features: [] },
            })),
          );
        return [...prev, id];
      });
    },
    [],
  );

  const toggleNodeType = useCallback((nodeType: string) => {
    setActiveTypes((prev) => {
      const wasActive = prev.includes(nodeType);
      // Ao LIGAR uma camada: busca os nós SEM recorte de viewport e voa a câmera
      // p/ enquadrá-los. Resolve "camada ligada mas fora da vista" (ex.: zonas de
      // um município longe do centro atual) — o fetch com bbox do viewport voltava
      // 0/N e nada aparecia. Genérico p/ qualquer node_type. Fail-soft.
      if (!wasActive) {
        Geo.nodes({ node_type: nodeType, limit: 2000 })
          .then((r) => {
            const pts = (r.nodes || []).filter((n) => n.lat != null && n.lng != null);
            if (!pts.length) return;
            const lat = pts.reduce((s, n) => s + n.lat, 0) / pts.length;
            const lng = pts.reduce((s, n) => s + n.lng, 0) / pts.length;
            // flyToRef pode NÃO estar pronto (globo Cesium ainda bootando quando a
            // camada auto-ativa) — RETENTA até ~12s. Sem isso o voo era corrida e às
            // vezes o mapa ficava no centro default (SP) com a camada fora da vista.
            let tries = 0;
            const doFly = () => {
              if (flyToRef.current) { flyToRef.current(lat, lng, 16000); return; }
              if (tries++ < 24) setTimeout(doFly, 500);
            };
            doFly();
          })
          .catch(() => { /* sem voo — operador navega manual */ });
      }
      return wasActive ? prev.filter((t) => t !== nodeType) : [...prev, nodeType];
    });
  }, []);

  // Liga por PADRÃO as camadas de PIPELINE (styled = materializadas por um fluxo do
  // DAG, com geo_style). Assim o output do pipeline APARECE SOZINHO no /geo — o
  // operador não precisa ligar, e a 1ª ativação voa a câmera pra ela. Roda UMA vez
  // (guard): se o operador desligar depois, fica desligada.
  const autoActivatedRef = useRef(false);
  useEffect(() => {
    if (autoActivatedRef.current || nodeTypes.length === 0) return;
    const styled = nodeTypes.filter((nt) => nt.styled).map((nt) => nt.node_type);
    if (styled.length > 0) {
      autoActivatedRef.current = true;
      styled.forEach((nt) => toggleNodeType(nt));
    }
  }, [nodeTypes, toggleNodeType]);

  const reloadGeofences = useCallback(async () => {
    try {
      setGeofences(await Alerts.geofences.list());
    } catch {
      setGeofences([]);
    }
  }, []);

  useEffect(() => {
    reloadGeofences();
  }, [reloadGeofences]);

  // Zonas operacionais (KMZ/GeoJSON importadas) — snake_case do backend
  // já casa com GeoZone; mapeamos explicitamente e caímos p/ [] fail-soft.
  const reloadZones = useCallback(async () => {
    try {
      const r = await Geo.zones();
      setZones(
        (r.zones ?? []).map((z) => ({
          id: z.id,
          name: z.name,
          zone_type: z.zone_type,
          geometry: z.geometry,
          extruded_height: z.extruded_height,
          source: z.source,
        })),
      );
    } catch {
      setZones([]);
    }
  }, []);

  useEffect(() => {
    reloadZones();
  }, [reloadZones]);

  // Importa zonas normalizadas (o body do backend usa a chave `zones`) e
  // recarrega a camada — o operador vê o KMZ/GeoJSON no globo na hora.
  const importZones = useCallback(
    async (
      features: ZoneFeature[],
      opts?: { source?: string; extruded_height?: number },
    ) => {
      await Geo.importZones({
        features,
        extruded_height: opts?.extruded_height,
        source_name: opts?.source,
      });
      await reloadZones();
    },
    [reloadZones],
  );

  const reloadAlerts = useCallback(async () => {
    try {
      const rows = await Alerts.geofences.alerts();
      // pendentes = sem acknowledged_at; só os com coords são plotáveis.
      setPendingAlerts(rows.filter((a) => !a.acknowledged_at && alertCoords(a)));
    } catch {
      setPendingAlerts([]);
    }
  }, []);

  useEffect(() => {
    if (!filters.showAlerts) return;
    reloadAlerts();
  }, [filters.showAlerts, reloadAlerts]);

  const v = useMemo(
    () => ({
      selected,
      setSelected,
      filters,
      setFilters,
      camera,
      setCamera,
      flyToRef,
      isFullscreen,
      setIsFullscreen,
      tool,
      setTool,
      shapeDraft,
      setShapeDraft,
      editingFence,
      setEditingFence,
      clearDrawingsRef,
      screenToGeoRef,
      capturePngRef,
      projectLonLatRef,
      onGlobeFrameRef,
      nodeTypes,
      activeTypes,
      toggleNodeType,
      layerNodes,
      reloadLayers,
      truncatedTypes,
      viewportBbox,
      setViewportBbox,
      referenceLayers,
      activeReferenceLayers,
      referenceGeoJSON,
      toggleReferenceLayer,
      referenceRendered,
      markReferenceRendered,
      sinceMinutes,
      setSinceMinutes,
      zones,
      reloadZones,
      importZones,
      geofences,
      reloadGeofences,
      pendingAlerts,
      reloadAlerts,
      correlationLines,
      setCorrelationLines,
      materializedCorrelations,
      setMaterializedCorrelations,
    }),
    [
      selected,
      filters,
      camera,
      isFullscreen,
      tool,
      shapeDraft,
      editingFence,
      nodeTypes,
      activeTypes,
      toggleNodeType,
      layerNodes,
      reloadLayers,
      truncatedTypes,
      viewportBbox,
      referenceLayers,
      activeReferenceLayers,
      referenceGeoJSON,
      toggleReferenceLayer,
      referenceRendered,
      markReferenceRendered,
      sinceMinutes,
      zones,
      reloadZones,
      importZones,
      geofences,
      reloadGeofences,
      pendingAlerts,
      reloadAlerts,
      correlationLines,
      materializedCorrelations,
    ],
  );
  return <GeoCtx.Provider value={v}>{children}</GeoCtx.Provider>;
}

export function useGeo() {
  const c = useContext(GeoCtx);
  if (!c) throw new Error('useGeo deve ser usado dentro de <GeoProvider>');
  return c;
}

/** Versão tolerante — fora do provider devolve null (CesiumGlobe é
 *  reutilizado em rotas que não têm provider). */
export function useGeoOptional() {
  return useContext(GeoCtx);
}
