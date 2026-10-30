'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Camera, Check, Crosshair, Eye, EyeOff, Layers, Maximize2, Minimize2, Search, Undo2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useGeo } from './geo-context';
import { Cctv, type CCTVStream } from '@/lib/api/cctv';
import type { GeoNode } from '@/lib/api/geo';
import { Alerts } from '@/lib/api';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { toast } from '@/components/ui/toast';
import {
  countNodesInPolygon,
  fenceBodyCoordinates,
  fenceGeometryValid,
  geometryMatchesFenceShape,
  GEOFENCE_SEVERITIES,
  humanizeNodeType,
  TIME_WINDOWS,
  toolForShape,
  type FenceGeometry,
  type GeofenceSeverity,
  type LngLat,
} from './geo-utils';

const CesiumGlobe = dynamic(
  () => import('./cesium-globe').then((m) => m.CesiumGlobe),
  { ssr: false, loading: () => <div className="w-full h-full bg-deep" /> },
);

function FiltroToggle({
  label,
  icon: Icon,
  value,
  onChange,
  hint,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-raised-light/60 border-b border-border-light/60 last:border-b-0"
    >
      <Icon className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] truncate">{label}</p>
        {hint && <p className="text-[10px] text-muted-on-light truncate">{hint}</p>}
      </div>
      {value ? (
        <Eye className="w-3.5 h-3.5 text-success shrink-0" strokeWidth={1.5} />
      ) : (
        <EyeOff className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
      )}
    </button>
  );
}

function formatAlt(meters: number): string {
  if (meters < 1000) return `${meters.toFixed(0)} m`;
  if (meters < 100_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${(meters / 1000).toFixed(0)} km`;
}

/** Vértice do polígono: % da tela (render SVG) + coordenada GEOGRÁFICA
 *  real (cerca/contagem) convertida pelo globo no momento do clique. */
type PolygonVertex = { x: number; y: number; lat: number; lng: number };

export function MapaCanvas() {
  const {
    filters,
    setFilters,
    camera,
    flyToRef,
    setSelected,
    setIsFullscreen: setGeoFullscreen,
    tool,
    setTool,
    shapeDraft,
    setShapeDraft,
    editingFence,
    setEditingFence,
    clearDrawingsRef,
    screenToGeoRef,
    projectLonLatRef,
    onGlobeFrameRef,
    layerNodes,
    sinceMinutes,
    setSinceMinutes,
    reloadGeofences,
  } = useGeo();
  const t = useT();
  const canManageFences = useCan('alerts.geofences.manage');
  const sectionRef = useRef<HTMLElement>(null);
  // Mantém `selectedTool` sincronizado com `tool` do GeoContext — alguns
  // consumidores locais (poligono-overlay SVG) ainda usam string solta.
  const selectedTool = tool;
  const setSelectedTool = setTool;
  const [polygon, setPolygon] = useState<PolygonVertex[]>([]);
  const [fenceName, setFenceName] = useState('');
  const [fenceSeverity, setFenceSeverity] = useState<GeofenceSeverity>('high');
  // Largura do corredor (shape route) — desenho dá só os waypoints; a
  // meia-largura é o que o avaliador de borda usa pra acender o alerta.
  const [routeWidth, setRouteWidth] = useState(80);
  // "Ativar sem retroagir": não alertar quem já está dentro no momento da criação.
  const [baselineSilent, setBaselineSilent] = useState(false);
  const [creatingFence, setCreatingFence] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [streams, setStreams] = useState<CCTVStream[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Refs do overlay/SVG p/ re-projetar o polígono por frame via DOM direto
  // (sem setState a 60fps). Mirror do polygon p/ o callback de frame ler o atual.
  const overlayElRef = useRef<HTMLDivElement>(null);
  const svgPolygonRef = useRef<SVGPolygonElement>(null);
  const svgVertsRef = useRef<SVGGElement>(null);
  const polygonRef = useRef<PolygonVertex[]>([]);
  // Último clique (timestamp+pixel) p/ detectar duplo-clique = concluir.
  const lastClickRef = useRef<{ t: number; x: number; y: number } | null>(null);

  useEffect(() => {
    Cctv.streams.list().then(setStreams).catch(() => setStreams([]));
  }, []);

  useEffect(() => {
    const onFs = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      setGeoFullscreen(fs);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [setGeoFullscreen]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return streams
      .filter((s) => {
        const hay = `${s.name} ${s.city ?? ''} ${s.source_type ?? ''} ${(s.tags || []).join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [streams, searchQuery]);

  const goTo = (s: CCTVStream) => {
    if (s.latitude != null && s.longitude != null && flyToRef.current) {
      flyToRef.current(s.latitude, s.longitude, 4000);
    }
    setSelected({ kind: 'stream', stream: s });
    setSearchOpen(false);
    setSearchQuery('');
  };

  const toggleFullscreen = async () => {
    // Fullscreen no container pai (`#geo-fullscreen-root` em geo/page.tsx)
    // pra englobar PainelCamadas + Mapa + PainelDetalheGeo — antes o
    // fullscreen era só no <section> do mapa e o painel direito sumia.
    const el =
      (typeof document !== 'undefined' &&
        (document.getElementById('geo-fullscreen-root') as HTMLElement | null)) ||
      sectionRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      try {
        await el.requestFullscreen();
      } catch (e) {
        console.warn('fullscreen falhou:', e);
      }
    } else {
      await document.exitFullscreen();
    }
  };

  // Conclui o polígono (>=3 vértices): sai do modo desenho (Cesium volta a
  // responder) — o card de criar-cerca permanece (anel>=3) p/ nomear + criar.
  const finishPolygon = () => {
    if (polygonRef.current.length >= 3) setSelectedTool('selecionar');
  };

  // Desfaz o último vértice (Desfazer ponto / Ctrl+Z / Backspace).
  const undoLastPoint = () => setPolygon((p) => p.slice(0, -1));

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectedTool !== 'poligono') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    // Duplo-clique = CONCLUIR. Dois cliques <300ms no MESMO ponto (<6px). O 1º
    // já colocou o vértice final; o 2º conclui sem duplicar. Cliques em pontos
    // distintos (desenho normal) nunca disparam isto.
    const now = Date.now();
    const last = lastClickRef.current;
    const isDouble =
      !!last && now - last.t < 300 && Math.hypot(xPx - last.x, yPx - last.y) < 6;
    lastClickRef.current = { t: now, x: xPx, y: yPx };
    if (isDouble) {
      lastClickRef.current = null;
      finishPolygon();
      return;
    }
    // Coordenada geográfica REAL do clique (overlay e canvas do Cesium
    // ocupam o mesmo retângulo — px é 1:1). Sem conversão não há vértice:
    // a cerca precisa de lon/lat de verdade, não % de tela.
    const geo = screenToGeoRef.current?.(xPx, yPx);
    if (!geo) return;
    // Começar um polígono descarta um draft de círculo/rota pendente — só
    // uma geometria fica ativa de cada vez (exclusão mútua com o draft).
    if (shapeDraft) setShapeDraft(null);
    const x = (xPx / rect.width) * 100;
    const y = (yPx / rect.height) * 100;
    setPolygon((p) => [...p, { x, y, lat: geo.lat, lng: geo.lng }]);
  };

  // Anel [[lon,lat],...] — o MESMO contrato do avaliador de cercas.
  const ring = useMemo<LngLat[]>(
    () => polygon.map((p) => [p.lng, p.lat] as LngLat),
    [polygon],
  );

  // Mirror p/ o callback de frame (registrado uma vez) ler o polígono atual.
  polygonRef.current = polygon;

  // Re-projeta o polígono em construção a partir de lon/lat (fonte da verdade)
  // → pixel atual do globo, a cada frame. Mantém o desenho GRUDADO no chão
  // quando a câmera move. DOM direto (sem setState/frame). No-op gracioso
  // quando não há projeção (jsdom) — aí vale o % congelado do clique.
  const reprojectPolygon = useCallback(() => {
    const project = projectLonLatRef.current;
    const overlay = overlayElRef.current;
    if (!project || !overlay) return;
    const rect = overlay.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const verts = polygonRef.current;
    const g = svgVertsRef.current;
    const pts: string[] = [];
    verts.forEach((v, i) => {
      const circle = g?.children[i] as SVGCircleElement | undefined;
      const p = project(v.lng, v.lat);
      if (!p) {
        if (circle) circle.style.display = 'none';
        return;
      }
      const x = (p.xPx / rect.width) * 100;
      const y = (p.yPx / rect.height) * 100;
      pts.push(`${x},${y}`);
      if (circle) {
        circle.style.display = '';
        circle.setAttribute('cx', String(x));
        circle.setAttribute('cy', String(y));
      }
    });
    if (svgPolygonRef.current) {
      svgPolygonRef.current.setAttribute('points', pts.join(' '));
    }
  }, [projectLonLatRef]);

  // Registra a re-projeção no tique do globo enquanto desenha polígono.
  useEffect(() => {
    if (selectedTool !== 'poligono') return;
    onGlobeFrameRef.current = reprojectPolygon;
    reprojectPolygon();
    return () => {
      if (onGlobeFrameRef.current === reprojectPolygon) onGlobeFrameRef.current = null;
    };
  }, [selectedTool, reprojectPolygon, onGlobeFrameRef, polygon.length]);

  // Atalhos do desenho: Ctrl+Z / Backspace = desfazer último ponto. Escopado
  // ao modo polígono e ignorando foco em campo de texto (nome/largura).
  useEffect(() => {
    if (selectedTool !== 'poligono') return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;
      if (typing) return;
      const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z';
      if (isUndo || e.key === 'Backspace') {
        if (polygonRef.current.length === 0) return;
        e.preventDefault();
        undoLastPoint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedTool]);

  // Geometria ativa (draft de círculo/rota tem precedência sobre o anel do
  // polígono; ver exclusão mútua acima). É o que o card de criar-cerca usa.
  const activeGeometry = useMemo<FenceGeometry | null>(() => {
    if (shapeDraft?.kind === 'circle') {
      return { shape: 'circle', center: shapeDraft.center, radiusMeters: shapeDraft.radiusMeters };
    }
    if (shapeDraft?.kind === 'route') {
      return { shape: 'route', waypoints: shapeDraft.waypoints, widthMeters: routeWidth };
    }
    if (ring.length >= 3) return { shape: 'polygon', ring };
    return null;
  }, [shapeDraft, ring, routeWidth]);

  // Draft de círculo/rota desenhado → some o polígono pendente (exclusão
  // mútua; o draft vem do Cesium e não consegue zerar o estado local).
  useEffect(() => {
    if (shapeDraft) setPolygon([]);
  }, [shapeDraft]);

  // Redesenho de corredor/rota: pré-carrega a largura ATUAL da cerca no input
  // (senão o redesenho gravaria o default 80m, perdendo a largura original).
  useEffect(() => {
    if (editingFence?.widthMeters && editingFence.widthMeters > 0) {
      setRouteWidth(editingFence.widthMeters);
    }
  }, [editingFence]);

  // Limpa o desenho ativo (criar-com-sucesso ou descartar). Polígono é só
  // estado local; círculo/rota têm entidades efêmeras no globo a remover.
  const clearActiveDraw = () => {
    setFenceName('');
    setBaselineSilent(false);
    setPolygon([]);
    if (editingFence) setEditingFence(null);
    if (shapeDraft) {
      setShapeDraft(null);
      clearDrawingsRef.current?.();
    }
  };

  // Contagem REAL: nós carregados das camadas visíveis dentro do polígono
  // (point_in_polygon client-side — mesma matemática do backend).
  const polygonCount = useMemo(() => {
    if (ring.length < 3) return null;
    const visible: Record<string, GeoNode[]> = { ...layerNodes };
    if (filters.showCameras && streams.length > 0) {
      visible.cctv_stream = streams
        .filter((s) => s.latitude != null && s.longitude != null)
        .map((s) => ({
          id: s.id,
          node_type: 'cctv_stream',
          name: s.name,
          lat: s.latitude as number,
          lng: s.longitude as number,
          detected_at: null,
          properties_resumo: {},
        }));
    }
    return countNodesInPolygon(visible, ring);
  }, [ring, layerNodes, filters.showCameras, streams]);

  const createFence = async () => {
    if (!activeGeometry || creatingFence || !fenceGeometryValid(activeGeometry)) return;
    // Redesenho NUNCA muda o tipo da cerca — guarda contra geometria de shape
    // diferente (a paleta já trava as outras ferramentas; isto é cinto+suspensório).
    if (editingFence && !geometryMatchesFenceShape(activeGeometry.shape, editingFence.shape)) {
      toast.error(t('geo.fence.redrawShapeMismatch'));
      return;
    }
    const coordinates = fenceBodyCoordinates(activeGeometry);
    setCreatingFence(true);
    try {
      if (editingFence) {
        // REDESENHO: PATCH só a geometria. Preserva o shape ORIGINAL (incl.
        // 'corridor', que a ferramenta Rota normalizaria p/ 'route') e
        // name/severity (editados no painel-detalhe).
        await Alerts.geofences.update(editingFence.id, {
          shape: editingFence.shape,
          coordinates,
        });
        toast.success(t('geo.fence.updated'));
      } else {
        const name = fenceName.trim();
        if (!name) return;
        await Alerts.geofences.create({
          name,
          shape: activeGeometry.shape,
          coordinates,
          severity: fenceSeverity,
          baseline_silent: baselineSilent,
        });
        toast.success(t('geo.fence.created'));
      }
      clearActiveDraw();
      await reloadGeofences();
      setFilters((p) => ({ ...p, showGeofences: true }));
    } catch {
      toast.error(editingFence ? t('geo.fence.updateFailed') : t('geo.fence.createFailed'));
    } finally {
      setCreatingFence(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      data-testid="mapa-canvas"
      className="flex-1 relative bg-canvas-light flex flex-col"
    >
      <div className="h-10 px-3 border-b border-border-light flex items-center gap-2 bg-panel-light shrink-0">
        <div className="relative flex items-center gap-2 flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder={streams.length > 0 ? 'Localizar câmeras, cidades, placas…' : 'Localizar no mapa…'}
            className="w-full h-7 bg-raised-light border border-border-light px-2 text-[12px] outline-none focus:border-primary"
          />
          {searchOpen && searchQuery && (
            <div
              data-testid="search-results"
              className="absolute top-full left-6 right-0 mt-1 bg-panel-light border border-border-light z-30 max-h-80 overflow-y-auto"
            >
              {searchResults.length === 0 && (
                <p className="px-3 py-2 text-[11px] text-muted-on-light italic">
                  Nada encontrado pra "{searchQuery}".
                </p>
              )}
              {searchResults.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // evita blur antes do click
                    goTo(s);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-raised-light/60 border-b border-border-light/60 last:border-b-0 flex items-start gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] truncate">{s.name}</p>
                    <p className="text-[10px] font-mono text-muted-on-light truncate">
                      {s.city ?? '—'} ·{' '}
                      {s.latitude?.toFixed(4)}, {s.longitude?.toFixed(4)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 w-1.5 h-1.5 mt-1.5',
                      s.status === 'online' ? 'bg-success' : 'bg-muted-on-light',
                    )}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <button
            type="button"
            data-testid="abrir-filtros"
            onClick={() => setFiltersOpen((p) => !p)}
            className={cn(
              'h-7 px-2.5 text-[11px] border flex items-center gap-1.5',
              filtersOpen
                ? 'bg-primary text-white border-primary'
                : 'bg-raised-light border-border-light hover:border-primary',
            )}
          >
            <Layers className="w-3 h-3" strokeWidth={1.5} /> Filtros de exibição
          </button>
          {filtersOpen && (
            <div
              data-testid="filtros-popover"
              className="absolute top-full right-0 mt-1 w-[260px] bg-panel-light border border-border-light z-30"
            >
              <p className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold border-b border-border-light">
                Camadas no mapa
              </p>
              {/* CCTV é DINÂMICO: os toggles de câmera/detecção só aparecem quando o
                  tenant tem streams de fato (seed off / vertical sem câmera = nada de
                  câmera na UI). Nada de camada hardcoded que não existe. */}
              {streams.length > 0 && (
                <>
                  <FiltroToggle
                    label="Câmeras CCTV"
                    icon={Camera}
                    value={filters.showCameras}
                    onChange={(v) => setFilters((p) => ({ ...p, showCameras: v }))}
                  />
                  <FiltroToggle
                    label="Detecções recentes"
                    icon={Activity}
                    value={filters.showDetections}
                    onChange={(v) => setFilters((p) => ({ ...p, showDetections: v }))}
                    hint="Pins efêmeros · refresh 30s"
                  />
                </>
              )}
              <FiltroToggle
                label={t('geo.layers.geofences')}
                icon={Crosshair}
                value={filters.showGeofences}
                onChange={(v) => setFilters((p) => ({ ...p, showGeofences: v }))}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          data-testid="toggle-fullscreen"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          title={isFullscreen ? 'Sair da tela cheia (Esc)' : 'Maximizar'}
          className={cn(
            'h-7 w-7 border flex items-center justify-center',
            isFullscreen
              ? 'bg-primary text-white border-primary'
              : 'bg-raised-light border-border-light hover:border-primary',
          )}
        >
          {isFullscreen ? (
            <Minimize2 className="w-3 h-3" strokeWidth={1.5} />
          ) : (
            <Maximize2 className="w-3 h-3" strokeWidth={1.5} />
          )}
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0">
          <CesiumGlobe interactive={selectedTool !== 'poligono'} />
        </div>

        <div
          ref={overlayElRef}
          data-testid="poligono-overlay"
          onClick={handleOverlayClick}
          // Backup do duplo-clique (alguns navegadores entregam dblclick mesmo
          // com os dois clicks); a detecção por timing no onClick é a principal.
          onDoubleClick={finishPolygon}
          className={cn(
            'absolute inset-0',
            selectedTool === 'poligono' ? 'cursor-crosshair' : 'pointer-events-none',
          )}
        >
          {polygon.length > 0 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              {polygon.length >= 3 && (
                <polygon
                  ref={svgPolygonRef}
                  points={polygon.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(45,119,190,0.18)"
                  stroke="#2D77BE"
                  strokeWidth="0.3"
                  strokeDasharray="1 0.6"
                />
              )}
              <g ref={svgVertsRef}>
                {polygon.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={0.6} fill="#2D77BE" stroke="#0a0e14" strokeWidth="0.3" />
                ))}
              </g>
            </svg>
          )}
        </div>

        {/* Indicador flutuante enquanto desenha (1–2 pontos, antes do card):
            contagem + desfazer + dica de concluir. */}
        {selectedTool === 'poligono' && polygon.length > 0 && polygon.length < 3 && (
          <div
            data-testid="poligono-progresso"
            className="absolute bottom-12 right-3 bg-panel-light border border-border-light text-text-on-light p-2 w-[240px] z-50"
          >
            <p className="text-[11px] mb-2 font-mono">
              {polygon.length} {t('geo.polygon.vertices')} · {t('geo.polygon.needMore')}
            </p>
            <button
              type="button"
              data-testid="desfazer-ponto-chip"
              onClick={undoLastPoint}
              className="w-full h-7 text-[11px] bg-canvas-light border border-border-light text-text-on-light hover:border-primary flex items-center justify-center gap-1.5"
            >
              <Undo2 className="w-3 h-3" strokeWidth={1.5} /> {t('geo.polygon.undo')}
            </button>
          </div>
        )}

        {activeGeometry && (
          <div
            data-testid="geofence-actions"
            // Canto inferior-direito do mapa — fora da área quente onde o
            // operador acabou de soltar o último vértice (canto sup-dir e
            // centro). z-50 garante visibilidade mesmo com o canvas
            // Cesium em fullscreen.
            className="absolute bottom-12 right-3 bg-panel-light border border-border-light text-text-on-light p-3 w-[280px] z-50"
          >
            {editingFence && (
              <p data-testid="editando-cerca" className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1.5">
                {t('geo.fence.redraw')} · {editingFence.name}
              </p>
            )}
            {activeGeometry.shape === 'polygon' && (
              <>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1.5">
                  {t('geo.polygon.title')} · {polygon.length} {t('geo.polygon.vertices')}
                </p>
                {/* Contagem REAL dos nós carregados (camadas visíveis) dentro
                    do anel — mesma matemática ray-casting do avaliador. */}
                {polygonCount && polygonCount.total > 0 ? (
                  <p data-testid="polygon-count" className="text-[12px] mb-3 font-mono">
                    {polygonCount.total} {t('geo.polygon.inside')}
                    {' · '}
                    {Object.entries(polygonCount.byType)
                      .sort((a, b) => b[1] - a[1])
                      .map(([nt, n]) => `${humanizeNodeType(nt)}: ${n}`)
                      .join(' · ')}
                  </p>
                ) : (
                  <p data-testid="polygon-count" className="text-[11px] mb-3 text-muted-on-light">
                    {t('geo.polygon.empty')}
                  </p>
                )}
                {/* Refino do desenho: desfazer último ponto + concluir (sair do
                    modo desenho). Ícones neutros; ações diretas (sem confirm). */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    data-testid="desfazer-ponto"
                    onClick={undoLastPoint}
                    className="h-7 text-[11px] bg-canvas-light border border-border-light text-text-on-light hover:border-primary flex items-center justify-center gap-1.5"
                  >
                    <Undo2 className="w-3 h-3" strokeWidth={1.5} /> {t('geo.polygon.undo')}
                  </button>
                  <button
                    type="button"
                    data-testid="concluir-poligono"
                    onClick={finishPolygon}
                    className="h-7 text-[11px] bg-canvas-light border border-border-light text-text-on-light hover:border-primary flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3 h-3" strokeWidth={1.5} /> {t('geo.polygon.finish')}
                  </button>
                </div>
              </>
            )}
            {activeGeometry.shape === 'circle' && (
              <>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1.5">
                  {t('geo.shape.circle')}
                </p>
                <p data-testid="circle-radius" className="text-[12px] mb-3 font-mono">
                  {t('geo.fence.radius')}: {activeGeometry.radiusMeters} m
                </p>
              </>
            )}
            {activeGeometry.shape === 'route' && (
              <>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1.5">
                  {t('geo.shape.route')} · {activeGeometry.waypoints.length} {t('geo.route.points')}
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-[11px] text-muted-on-light shrink-0">
                    {t('geo.fence.width')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    data-testid="route-width"
                    value={routeWidth}
                    onChange={(e) => setRouteWidth(Math.max(1, Number(e.target.value) || 0))}
                    className="flex-1 h-7 bg-raised-light border border-border-light px-2 text-[12px] font-mono outline-none focus:border-primary"
                  />
                </div>
              </>
            )}
            {canManageFences && (
              <div className="space-y-2 mb-2">
                {/* Em redesenho, name/severity são preservados (editados no
                    painel-detalhe) — o card só captura a nova geometria. */}
                {!editingFence && (
                  <>
                    <input
                      type="text"
                      data-testid="fence-name"
                      value={fenceName}
                      onChange={(e) => setFenceName(e.target.value)}
                      placeholder={t('geo.fence.name')}
                      className="w-full h-7 bg-raised-light border border-border-light px-2 text-[12px] outline-none focus:border-primary"
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-muted-on-light shrink-0">
                        {t('geo.fence.severity')}
                      </label>
                      <select
                        data-testid="fence-severity"
                        value={fenceSeverity}
                        onChange={(e) => setFenceSeverity(e.target.value as GeofenceSeverity)}
                        className="flex-1 h-7 bg-raised-light border border-border-light px-1 text-[12px] outline-none focus:border-primary"
                      >
                        {GEOFENCE_SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {t(`geo.severity.${s}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* "Ativar sem retroagir": não alertar quem já está dentro
                        agora — evita inundar o inbox sobre área movimentada. */}
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        data-testid="fence-baseline-silent"
                        checked={baselineSilent}
                        onChange={(e) => setBaselineSilent(e.target.checked)}
                        className="mt-0.5 accent-primary"
                      />
                      <span className="text-[11px] text-muted-on-light leading-tight">
                        {t('geo.fence.baselineSilent')}
                      </span>
                    </label>
                  </>
                )}
                <button
                  type="button"
                  data-testid="criar-geofence"
                  disabled={
                    creatingFence ||
                    !fenceGeometryValid(activeGeometry) ||
                    (!editingFence && !fenceName.trim())
                  }
                  onClick={createFence}
                  className="w-full h-8 bg-primary text-white text-[12px] hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Crosshair className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {editingFence ? t('geo.fence.saveRedraw') : t('geo.fence.create')}
                </button>
              </div>
            )}
            <button
              type="button"
              data-testid="descartar-desenho"
              onClick={clearActiveDraw}
              className="w-full h-7 text-[11px] bg-canvas-light border border-border-light text-text-on-light hover:border-primary"
            >
              {activeGeometry.shape === 'polygon' ? t('geo.polygon.clear') : t('geo.fence.discard')}
            </button>
          </div>
        )}

        {/* Em redesenho, antes de desenhar a nova geometria: instrução + cancelar. */}
        {editingFence && !activeGeometry && (
          <div
            data-testid="redesenho-banner"
            className="absolute bottom-12 right-3 bg-panel-light border border-border-light text-text-on-light p-3 w-[280px] z-50"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1.5">
              {t('geo.fence.redraw')} · {editingFence.name}
            </p>
            <p className="text-[11px] text-muted-on-light mb-2">{t('geo.fence.redrawHint')}</p>
            <button
              type="button"
              data-testid="cancelar-redesenho"
              onClick={() => setEditingFence(null)}
              className="w-full h-7 text-[11px] bg-canvas-light border border-border-light text-text-on-light hover:border-primary"
            >
              {t('geo.fence.cancelRedraw')}
            </button>
          </div>
        )}

        <div className="absolute left-3 top-3 bg-panel-dark border border-border-dark text-text-on-dark flex flex-col z-10">
          {(
            [
              { id: 'selecionar', label: 'Sel.' },
              { id: 'poligono', label: 'Ponto' },
              { id: 'pin', label: 'Pin' },
              { id: 'raio', label: 'Raio' },
              { id: 'rota', label: 'Rota' },
              { id: 'medir', label: 'Medir' },
            ] as const
          ).map((tl) => {
            // Em redesenho, só a ferramenta do shape original (+ Sel.) fica
            // ativa — o redesenho nunca troca o tipo da cerca.
            const lockedTool = editingFence ? toolForShape(editingFence.shape) : null;
            const disabled =
              lockedTool != null && tl.id !== 'selecionar' && tl.id !== lockedTool;
            return (
              <button
                key={tl.id}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedTool(tl.id)}
                data-testid={`tool-${tl.id}`}
                title={disabled ? t('geo.fence.redrawToolLocked') : undefined}
                className={cn(
                  'w-14 h-8 text-[10px] uppercase tracking-[0.14em] border-b border-border-dark last:border-b-0',
                  disabled && 'opacity-40 cursor-not-allowed',
                  selectedTool === tl.id
                    ? 'bg-primary text-white'
                    : 'text-muted-on-dark hover:bg-raised-dark hover:text-text-on-dark',
                )}
              >
                {tl.label}
              </button>
            );
          })}
          <button
            type="button"
            // Limpa TUDO: entidades efêmeras do Cesium + o polígono local em
            // construção (senão o rascunho SVG fica órfão na tela).
            onClick={() => {
              clearDrawingsRef.current?.();
              clearActiveDraw();
            }}
            data-testid="tool-limpar"
            title="Limpar tudo que foi desenhado"
            className="w-14 h-8 text-[10px] uppercase tracking-[0.14em] border-t border-border-dark text-muted-on-dark hover:bg-raised-dark hover:text-text-on-dark"
          >
            Limpar
          </button>
        </div>

        <div className="absolute top-3 right-3 bg-panel-dark border border-border-dark px-2 py-1 text-[10px] font-mono text-muted-on-dark flex items-center gap-3 z-10">
          <span>LAT {camera ? camera.lat.toFixed(4) : '—'}</span>
          <span>LNG {camera ? camera.lng.toFixed(4) : '—'}</span>
          <span>ALT {camera ? formatAlt(camera.altitude) : '—'}</span>
        </div>

        {/* Janela temporal REAL — refaz o fetch das camadas dinâmicas
            (detecções + camadas da ontologia) com since_minutes. */}
        <div
          data-testid="janela-temporal"
          className="absolute bottom-3 left-3 bg-panel-dark border border-border-dark text-text-on-dark px-3 py-2 flex items-center gap-2 z-10"
          title={t('geo.window.hint')}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-on-dark shrink-0">
            {t('geo.window.label')}
          </span>
          {TIME_WINDOWS.map((w) => (
            <button
              key={w.labelKey}
              type="button"
              data-testid={`janela-${w.minutes ?? 'tudo'}`}
              onClick={() => setSinceMinutes(w.minutes)}
              className={cn(
                'h-6 px-2 text-[10px] font-mono border',
                sinceMinutes === w.minutes
                  ? 'bg-primary text-white border-primary'
                  : 'bg-raised-dark border-border-dark text-muted-on-dark hover:border-primary',
              )}
            >
              {t(w.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
