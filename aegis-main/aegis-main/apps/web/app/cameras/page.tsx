'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useContextClassification } from '@/lib/use-context-classification';
import {
  Bookmark,
  Brain,
  Camera,
  ChevronDown,
  Cloud,
  Car,
  Crosshair,
  Download,
  Grid3x3,
  ListOrdered,
  Pause,
  Play,
  RotateCcw,
  ScanSearch,
  Search,
  Slash,
  Video,
  X,
} from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import {
  HlsBadge,
  HlsPlayer,
  type HlsPlayerHandle,
  type PlayerTimeInfo,
} from '@/components/cameras/hls-player';
import { LprOverlay } from '@/components/cameras/lpr-overlay';
import {
  Cctv,
  detectionFrameUrl,
  detectionFrameObject,
  findStreamByFocusParam,
  nonAggregate,
  pollDetectNow,
  residualMeaningful,
  type CameraBookmark,
  type CCTVDetection,
  type CCTVStream,
  type GcpsState,
  type RecordingCoverageWindow,
} from '@/lib/api/cctv';
import { useT } from '@/lib/i18n/provider';
import { detectionClassLabel, detectionConf, detectionKindLabel } from '@/lib/i18n/detection';
import { useCan } from '@/lib/auth/useAuth';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { formatHoraSegBR } from '@/lib/datetime';
import { absToMediaS, isoToMs, mediaToAbsMs } from '@/lib/cctv-timeline';
import {
  CameraTimeline,
  type TimelineBookmark,
  type TimelineDetection,
} from '@/components/cameras/camera-timeline';
import { confirmModal, promptModal } from '@/components/dialog/confirm-dialog';
import { MosaicView } from '@/components/cameras/mosaic-view';
import { RecordingControl } from '@/components/cameras/recording-control';
import { HeatmapModal } from '@/components/cameras/heatmap-modal';
import { ExportModal } from '@/components/cameras/export-modal';
// Volta a /cameras (ADD-alongside do §C C5): as seções do GESTOR são
// auto-gating (sem a perm elas retornam null) e superfície clara.
import { HotlistSection } from '@/components/dados/hotlist-section';
import { PipelineSection } from '@/components/dados/pipeline-section';
import { CalibrateModal } from '@/components/cameras/calibrate-modal';
import { LineCalibrateModal } from '@/components/cameras/line-calibrate-modal';
import { ContagemProof } from '@/components/cameras/contagem-proof';
import { MultidomainModal } from '@/components/cameras/multidomain-modal';
import { cameraKindOf, capabilitiesOf } from '@/lib/cameras/camera-kind';
import {
  filterStreams,
  deriveCities,
  filterDetectionGroups,
} from '@/components/cameras/camera-filters';
import { MosaicToolbar } from '@/components/cameras/mosaic-toolbar';
import { MosaicEditorModal } from '@/components/cameras/mosaic-editor-modal';
import { useCameraMosaics } from '@/lib/cameras/use-camera-mosaics';
import { resolveMosaic, type Mosaic } from '@/lib/cameras/mosaic';
import { Geo, type GeoZoneApi } from '@/lib/api/geo';

/** Velocidades REAIS — cada botão seta `video.playbackRate`; o destaque
 *  segue o `ratechange` do próprio video, nunca um índice fixo. */
const RATES = [
  { label: '¼×', value: 0.25 },
  { label: '½×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '4×', value: 4 },
] as const;

/** Janelas da timeline/gravação (h) — "última 1h" é o default do produto. */
const WINDOW_HOURS = [1, 6, 24] as const;
type WindowHours = (typeof WINDOW_HOURS)[number];

type DetectionGroup = {
  id: string;
  kind: 'lpr' | 'face' | 'object' | string;
  label: string;
  count: number;
  confidence_max: number;
  first_at: string;
  last_at: string;
  thumb: string | null;
  entity_id: string | null;
  sample: CCTVDetection;
};

/**
 * Agrupa detecções pela mesma entidade resolvida (Pessoa #N, placa,
 * objeto) — evita lista paginada infinita quando o mesmo rosto/placa
 * é visto N frames em sequência. Chave preferida: `linked_entity_id`
 * (resolução do ontology via Qdrant); fallback: `kind:label` quando
 * a entity ainda não foi resolvida.
 */
function groupDetections(dets: CCTVDetection[]): DetectionGroup[] {
  const groups = new Map<string, CCTVDetection[]>();
  for (const d of dets) {
    const key = d.linked_entity_id || `${d.kind}:${d.label}`;
    const arr = groups.get(key) ?? [];
    arr.push(d);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .map(([key, group]) => {
      // ordenado por detected_at desc — primeiro é o mais recente
      const sorted = [...group].sort((a, b) =>
        b.detected_at.localeCompare(a.detected_at),
      );
      const latest = sorted[0];
      const oldest = sorted[sorted.length - 1];
      return {
        id: key,
        kind: latest.kind,
        label: latest.label,
        count: group.length,
        confidence_max: Math.max(...group.map((d) => d.confidence)),
        first_at: oldest.detected_at,
        last_at: latest.detected_at,
        thumb: detectionFrameUrl(latest),
        entity_id: latest.linked_entity_id,
        sample: latest,
      };
    })
    .sort((a, b) => b.last_at.localeCompare(a.last_at));
}

/** Estado do job "Detectar agora" — mesmo padrão de boot assíncrono do
 *  provedores-workspace (submitting → booting → running → done/error). */
type DetectState = {
  phase: 'submitting' | 'booting' | 'running' | 'done' | 'error';
  /** wall-clock do início (Date.now) — o elapsed do banner é derivado no
   *  render (Date.now() - startedAt), nunca por contagem de ticks: timers
   *  de aba fora de foco são throttled e o contador atrasava (Tarefa W). */
  startedAt: number;
  /** congelado nas fases terminais (done/error) */
  elapsed: number;
  count?: number;
  pushed?: boolean;
  msg?: string;
  /** IN_QUEUE com só workers throttled (sem ready/initializing/running) —
   *  provedor sem capacidade; o banner explica em vez de "GPU inicializando" */
  noCapacity?: boolean;
  /** EXPIRED/PROVIDER_ERROR → banner oferece "Tentar novamente" (re-submete) */
  retryable?: boolean;
};

/** Select compacto de filtro — cantos retos, primary quando ativo (≠ "all").
 *  Espelha a DS dos painéis (h-7, bg-raised-light, border-border-light) com
 *  appearance-none + chevron neutro (mesmo padrão do SmartSelect nativo). */
function FilterSelect({
  value,
  onChange,
  active,
  testid,
  title,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  active: boolean;
  testid: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-w-0">
      <select
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={title}
        aria-label={title}
        className={cn(
          'w-full h-7 pl-2 pr-6 text-[10px] bg-raised-light border outline-none appearance-none truncate focus:border-primary',
          active ? 'border-primary text-primary' : 'border-border-light text-text-on-light',
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-on-light"
        strokeWidth={1.5}
      />
    </div>
  );
}

export default function CamerasPage() {
  const shellClassification = useContextClassification();
  const router = useRouter();
  const t = useT();
  // Estado inicial VAZIO — sem dado fabricado. Backend fora → 'error'
  // (mensagem honesta + tentar de novo); zero câmeras → empty state com CTA.
  const [streams, setStreams] = useState<CCTVStream[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeUrl, setActiveUrl] = useState<string>('');
  const [detections, setDetections] = useState<CCTVDetection[]>([]);
  const [showLPR, setShowLPR] = useState(true);
  const [showFace, setShowFace] = useState(true);
  const [showObject, setShowObject] = useState(true);
  // Master toggle do overlay AR sobre o vídeo. Quando OFF, esconde
  // TODOS os bboxes (LPR/Face/Objeto) mesmo que os toggles
  // individuais estejam ligados.
  //
  // Default OFF (2026-09-10): o vídeo dos serviços de visão já carrega a
  // inferência QUEIMADA no quadro (bbox/linha/total) — o overlay CSS
  // duplicava os boxes. Para verticais que ainda dependem de AR (LPR puro),
  // o operador liga no botão; a preferência é explícita, nunca suposição.
  const [showAR, setShowAR] = useState(false);
  // Estado REAL do <video> — alimentado pelos eventos play/pause/ratechange
  // via HlsPlayer (nunca um boolean decorativo).
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1);
  const [timeInfo, setTimeInfo] = useState<PlayerTimeInfo | null>(null);
  const playerRef = useRef<HlsPlayerHandle>(null);
  const lastTimeTickRef = useRef(0);
  // timeupdate dispara ~4×/s — throttle de 500ms pro re-render da página.
  const handleTime = useCallback((info: PlayerTimeInfo) => {
    const now = Date.now();
    if (now - lastTimeTickRef.current < 500) return;
    lastTimeTickRef.current = now;
    setTimeInfo(info);
  }, []);
  const tags = useMemo(() => groupDetections(detections), [detections]);
  const [tagAtivaId, setTagAtivaId] = useState<string | null>(null);

  // ── §C C2-C4 · filtros/busca escaláveis das 3 listas ──────────────────────
  // STREAMS: busca livre (client) + status/city/detecção (SERVIDOR — loadStreams
  // reenvia os params). DETECÇÕES: busca + kind COMPARTILHADOS entre os painéis
  // "Observações vinculadas" e "Detecções IA".
  const [streamQuery, setStreamQuery] = useState('');
  const [streamStatus, setStreamStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [streamCity, setStreamCity] = useState<string>('all');
  const [streamDetection, setStreamDetection] = useState<'all' | 'on' | 'off'>('all');
  const [detQuery, setDetQuery] = useState('');
  const [detKind, setDetKind] = useState<'all' | 'lpr' | 'face' | 'object'>('all');
  const streamFilterActive =
    streamStatus !== 'all' || streamCity !== 'all' || streamDetection !== 'all';
  const filteredStreams = useMemo(
    () => filterStreams(streams, streamQuery),
    [streams, streamQuery],
  );
  // Opções de cidade derivadas da lista carregada; garante que a cidade
  // selecionada continue presente mesmo quando o filtro de servidor a isola.
  const cityOptions = useMemo(() => {
    const cities = deriveCities(streams);
    if (streamCity !== 'all' && !cities.includes(streamCity)) return [streamCity, ...cities];
    return cities;
  }, [streams, streamCity]);
  const filteredTags = useMemo(
    () => filterDetectionGroups(tags, { query: detQuery, kind: detKind }),
    [tags, detQuery, detKind],
  );

  // Carrega/recarrega a lista do backend. Lista vazia é estado VÁLIDO
  // (empty state); só falha de rede/backend vira 'error'.
  const loadStreams = useCallback(() => {
    setLoadState('loading');
    Cctv.streams
      .list({
        status: streamStatus !== 'all' ? streamStatus : undefined,
        city: streamCity !== 'all' ? streamCity : undefined,
        detection_enabled: streamDetection === 'all' ? undefined : streamDetection === 'on',
        limit: 1000,
      })
      .then((d) => {
        setStreams(d);
        setLoadState('ready');
        if (d.length > 0) {
          const toHls = (s: CCTVStream) => `https://${window.location.host}/hls/${s.id}/live.m3u8`;
          setActiveUrl((u) => (d.some((s) => toHls(s) === u) ? u : toHls(d[0])));
        }
      })
      .catch(() => setLoadState('error'));
  }, [streamStatus, streamCity, streamDetection]);

  useEffect(() => {
    loadStreams();
  }, [loadStreams]);

  const hlsUrlForStream = (s: CCTVStream) => `https://${typeof window !== 'undefined' ? window.location.host : 'ouroville.lat'}/hls/${s.id}/live.m3u8`;

  // Deep-link `?focus=<stream_id>` (origem: fonte Câmeras do /buscar).
  // Consome uma vez só — depois a seleção manual do operador manda.
  const [focusConsumed, setFocusConsumed] = useState(false);
  useEffect(() => {
    if (focusConsumed || typeof window === 'undefined') return;
    const focused = findStreamByFocusParam(streams, window.location.search);
    if (focused) {
      setActiveUrl(hlsUrlForStream(focused));
      setFocusConsumed(true);
    }
  }, [streams, focusConsumed]);

  useEffect(() => {
    const active = streams.find((s) => hlsUrlForStream(s) === activeUrl);
    if (!active) return;
    let cancelled = false;

    const fetchDetections = async () => {
      try {
        const d = await Cctv.streams.detections(active.id, 30);
        const filtered = d.filter(nonAggregate);
        if (!cancelled) setDetections(filtered);
      } catch {
        // mantém último set
      }
    };

    fetchDetections();
    const id = setInterval(fetchDetections, 5_000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeUrl, streams]);

  // A seleção do operador é pela URL HLS (`hlsUrlForStream`), nunca por
  // `s.url` (RTSP de origem) — o cartão ativo precisa casar com o mesmo
  // critério do setActiveUrl, senão o destaque cai no streams[0].
  const active = streams.find((s) => hlsUrlForStream(s) === activeUrl) ?? streams[0];
  const isLive = active?.status === 'online';
  // Tipo da câmera ativa (tags) — equilibra a toolbar: câmera CON não mostra
  // "Placas procuradas", câmera OCR não desenha linha de contagem, etc.
  const activeKind = cameraKindOf(active);
  const caps = capabilitiesOf(activeKind);

  // ── §C C1 · Mosaicos NOMEADOS ─────────────────────────────────────────────
  // Mosaico ativo (null = câmera única). Lista persistida por operador no
  // backend (/me/context camera_mosaics, nunca localStorage). Zonas do /geo
  // alimentam o filtro por polígono (ponto-em-polígono client-side). O antigo
  // "Mosaico N×" (todas as câmeras) morreu — nunca "todas".
  const { mosaics, upsert: upsertMosaic, remove: removeMosaic } = useCameraMosaics();
  const [activeMosaicId, setActiveMosaicId] = useState<string | null>(null);
  const [mosaicEditor, setMosaicEditor] = useState<{ open: boolean; initial: Mosaic | null }>({
    open: false,
    initial: null,
  });
  const [zones, setZones] = useState<GeoZoneApi[]>([]);
  const mosaicMode = activeMosaicId !== null;
  const activeMosaic = useMemo(
    () => mosaics.find((m) => m.id === activeMosaicId) ?? null,
    [mosaics, activeMosaicId],
  );
  // Streams do mosaico ativo — o grid e o polling operam SÓ sobre este subconjunto.
  const mosaicStreams = useMemo(
    () => (activeMosaic ? resolveMosaic(activeMosaic, streams, zones) : []),
    [activeMosaic, streams, zones],
  );
  const mosaicStreamKey = mosaicStreams.map((s) => s.id).join(',');

  // Zonas operacionais do /geo (best-effort — sem perm security.geo.view → []).
  useEffect(() => {
    let cancelled = false;
    Geo.zones()
      .then((r) => {
        if (!cancelled) setZones(r.zones);
      })
      .catch(() => {
        if (!cancelled) setZones([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mosaico ativo apagado noutra aba/sessão → volta à câmera única (sem grade órfã).
  useEffect(() => {
    if (activeMosaicId && !mosaics.some((m) => m.id === activeMosaicId)) {
      setActiveMosaicId(null);
    }
  }, [mosaics, activeMosaicId]);

  const handleSaveMosaic = useCallback(
    (m: Mosaic) => {
      const isNew = !mosaics.some((x) => x.id === m.id);
      upsertMosaic(m);
      setMosaicEditor({ open: false, initial: null });
      if (isNew) setActiveMosaicId(m.id); // ativa o recém-criado
    },
    [mosaics, upsertMosaic],
  );
  const handleDeleteMosaic = useCallback(
    (id: string) => {
      removeMosaic(id);
      setActiveMosaicId((cur) => (cur === id ? null : cur));
    },
    [removeMosaic],
  );
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // GCP picker — "Calibrar posição" (gesto na PÁGINA da câmera, onde o player
  // e os demais gestos por câmera já vivem; gated pela perm do PUT gcps).
  const canManageCameras = useCan('security.cameras.manage');
  // Análise multidomínio hospedada (egress externo, demo/eval) — perm
  // privilegiada fora do bundle default.
  const canCloudInference = useCan('security.cameras.cloud_inference');
  const [multidomainOpen, setMultidomainOpen] = useState(false);
  // Volta a /cameras (ADD-alongside): drawer claro com Placas procuradas /
  // Pipeline de detecções (os botões auto-somem sem a perm — UI honesta).
  const [opsPanel, setOpsPanel] = useState<null | 'hotlist' | 'pipeline'>(null);
  const canHotlist = useCan('security.cameras.hotlist');
  const canPipelineView = useCan('events.pipeline.view');
  useEffect(() => {
    if (!opsPanel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpsPanel(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [opsPanel]);
  const [calibrateOpen, setCalibrateOpen] = useState(false);
  const [gcps, setGcps] = useState<GcpsState | null>(null);
  const [gcpsRefresh, setGcpsRefresh] = useState(0);
  // Desenho da LINHA/ROI da contagem (câmera CON) — modal próprio com
  // cliques no frame; o serviço contagem-sacos aplica por polling.
  const [linhaOpen, setLinhaOpen] = useState(false);

  // ── Gravação (DVR) + timeline temporal + bookmarks ────────────────────────
  const activeId = active?.id ?? null;
  const canBookmark = useCan('security.cameras.bookmark');
  const [mode, setMode] = useState<'live' | 'dvr'>('live');
  const [windowHours, setWindowHours] = useState<WindowHours>(1);
  const [coverage, setCoverage] = useState<RecordingCoverageWindow[]>([]);
  // janela do DVR CONGELADA ao entrar — o mapeamento mídia↔wall-clock da
  // playlist VOD depende dela (lib/cctv-timeline).
  const [dvr, setDvr] = useState<{
    fromMs: number;
    toMs: number;
    coverage: RecordingCoverageWindow[];
  } | null>(null);
  const [dvrError, setDvrError] = useState(false);
  const [bookmarks, setBookmarks] = useState<CameraBookmark[]>([]);
  const [bookmarkRefresh, setBookmarkRefresh] = useState(0);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);

  // Troca de câmera → volta pro AO VIVO (o DVR é por stream).
  useEffect(() => {
    setMode('live');
    setDvr(null);
    setDvrError(false);
    setTimeInfo(null);
  }, [activeId]);

  // Estado de calibração da câmera ativa → selo "Posição calibrada · ±X m".
  // Falha de leitura = sem selo (estado honesto), nunca derruba a página.
  useEffect(() => {
    if (!activeId) {
      setGcps(null);
      return;
    }
    let cancelled = false;
    Cctv.gcps
      .get(activeId)
      .then((g) => {
        if (!cancelled) setGcps(g);
      })
      .catch(() => {
        if (!cancelled) setGcps(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, gcpsRefresh]);

  // Frame mais barato p/ o GCP picker: o frame mais recente JÁ arquivado
  // pelas detecções da câmera (MinIO via detectionFrameUrl) — zero job novo.
  const calibrateFrameUrl = useMemo(
    () => detections.map(detectionFrameUrl).find(Boolean) ?? null,
    [detections],
  );
  // Último quadro arquivado (`<sha>.jpg`) para a análise multidomínio — o
  // backend lê os bytes do acervo e faz POST-bytes ao serverless.
  const multidomainFrameObject = useMemo(
    () => detections.map(detectionFrameObject).find(Boolean) ?? null,
    [detections],
  );

  // Coverage da gravação na janela — alimenta a alternância Ao vivo↔Gravação
  // e o sombreado da timeline. Falha/ausência = sem toggle (nada decorativo).
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const to = Date.now();
        const res = await Cctv.recordings.coverage(
          activeId,
          to - windowHours * 3_600_000,
          to,
        );
        if (!cancelled) setCoverage(res.coverage);
      } catch {
        if (!cancelled) setCoverage([]);
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeId, windowHours]);

  // Bookmarks da câmera (nós canônicos Bookmark da ontologia).
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    Cctv.bookmarks
      .list(activeId, { limit: 200 })
      .then((b) => {
        if (!cancelled) setBookmarks(b);
      })
      .catch(() => {
        if (!cancelled) setBookmarks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, bookmarkRefresh]);

  const enterDvr = useCallback(
    async (hours: WindowHours) => {
      if (!activeId) return;
      setDvrError(false);
      try {
        const to = Date.now();
        const from = to - hours * 3_600_000;
        const res = await Cctv.recordings.coverage(activeId, from, to);
        if (!res.coverage.length) {
          setDvrError(true);
          return;
        }
        setCoverage(res.coverage);
        setDvr({ fromMs: from, toMs: to, coverage: res.coverage });
        setMode('dvr');
        // tempo do AO VIVO não vale na playlist VOD — zera até o 1º
        // timeupdate real do novo carregamento.
        setTimeInfo(null);
      } catch {
        setDvrError(true);
      }
    },
    [activeId],
  );

  const exitDvr = useCallback(() => {
    setMode('live');
    setDvr(null);
    setDvrError(false);
    setTimeInfo(null);
  }, []);

  const selectWindow = (h: WindowHours) => {
    setWindowHours(h);
    if (mode === 'dvr') void enterDvr(h);
  };

  // URL do player: AO VIVO = stream da câmera; GRAVAÇÃO = playlist VOD da
  // API no MESMO HlsPlayer (seek nativo do hls.js).
  const playerUrl =
    mode === 'dvr' && dvr && activeId
      ? Cctv.recordings.playlistUrl(activeId, dvr.fromMs, dvr.toMs)
      : activeUrl;

  // Janela da timeline (posição = tempo) + cursor wall-clock.
  const nowMs = Date.now();
  const tlFrom = mode === 'dvr' && dvr ? dvr.fromMs : nowMs - windowHours * 3_600_000;
  const tlTo = mode === 'dvr' && dvr ? dvr.toMs : nowMs;
  const cursorMs =
    mode === 'dvr' && dvr
      ? timeInfo
        ? mediaToAbsMs(dvr.coverage, timeInfo.currentTime)
        : null
      : nowMs;
  const tlDetections: TimelineDetection[] = useMemo(
    () =>
      detections.map((d) => ({
        id: d.id,
        atMs: isoToMs(d.detected_at),
        label: d.label,
        confidence: d.confidence,
        entityId: d.linked_entity_id,
      })),
    [detections],
  );
  const tlBookmarks: TimelineBookmark[] = useMemo(
    () => bookmarks.map((b) => ({ id: b.id, atMs: b.t_ms, label: b.label })),
    [bookmarks],
  );

  /** Seek REAL pra um instante wall-clock — só no modo Gravação. */
  const seekAbs = (absMs: number) => {
    if (mode !== 'dvr' || !dvr) return;
    const s = absToMediaS(dvr.coverage, absMs);
    if (s !== null) playerRef.current?.seekTo(s);
  };

  const handleDetectionMarker = (d: TimelineDetection) => {
    if (mode === 'dvr') {
      seekAbs(d.atMs);
      return;
    }
    // AO VIVO: abre a ficha como hoje na sidebar.
    if (d.entityId) router.push(`/ficha/${d.entityId}`);
  };

  const handleBookmarkMarker = (b: TimelineBookmark) => {
    if (mode === 'dvr') seekAbs(b.atMs);
  };

  // "Voltar 10s" honesto: na GRAVAÇÃO sempre (clamp em 0); no AO VIVO só
  // quando o HLS expõe janela seekable atrás da posição (liveSyncPosition
  // do hls.js reflete em video.seekable). Sem janela → DESABILITADO.
  const canSeekBack =
    timeInfo !== null &&
    (mode === 'dvr' ||
      (timeInfo.seekableStart !== null &&
        timeInfo.currentTime - timeInfo.seekableStart > 1));

  const addBookmark = async () => {
    if (!activeId) return;
    const atMs =
      mode === 'dvr' && dvr
        ? mediaToAbsMs(dvr.coverage, timeInfo?.currentTime ?? 0)
        : Date.now();
    if (atMs === null) return;
    const label = await promptModal({
      title: t('cameras.bookmarkAdd'),
      description: t('cameras.bookmarkPromptDesc'),
      placeholder: t('cameras.bookmarkPromptPlaceholder'),
      confirmLabel: t('common.create'),
      cancelLabel: t('common.cancel'),
    });
    if (!label || !label.trim()) return;
    setBookmarkError(null);
    try {
      await Cctv.bookmarks.create(activeId, {
        t_ms: Math.round(atMs),
        label: label.trim(),
      });
      setBookmarkRefresh((n) => n + 1);
    } catch {
      setBookmarkError(t('cameras.bookmarkCreateFailed'));
    }
  };

  const removeBookmark = async (b: CameraBookmark) => {
    const ok = await confirmModal({
      title: t('cameras.bookmarkRemoveTitle'),
      description: `${b.label} · ${formatHoraSegBR(new Date(b.t_ms))} — ${t('cameras.bookmarkRemoveConfirm')}`,
      tone: 'danger',
      confirmLabel: t('common.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBookmarkError(null);
    try {
      await Cctv.bookmarks.remove(b.id);
      setBookmarkRefresh((n) => n + 1);
    } catch {
      setBookmarkError(t('cameras.bookmarkRemoveFailed'));
    }
  };

  const [allDetections, setAllDetections] = useState<Map<string, CCTVDetection[]>>(new Map());

  // "Detectar agora": POST 202 → POLLA mostrando o boot (cold-start da GPU
  // leva minutos; a UI nunca estoura timeout — mesmo padrão do
  // provedores-workspace). push=true → as detecções aparecem pelo polling
  // normal de 5s; sem push, o total vem no próprio job.
  const [detect, setDetect] = useState<DetectState | null>(null);
  const detectRef = useRef(false);
  const detectBusy =
    detect !== null && ['submitting', 'booting', 'running'].includes(detect.phase);
  const runDetectNow = async () => {
    if (!active || detectRef.current) return;
    detectRef.current = true;
    const t0 = Date.now();
    setDetect({ phase: 'submitting', startedAt: t0, elapsed: 0 });
    try {
      const sub = await Cctv.streams.detectNow(active.id);
      setDetect({ phase: 'booting', startedAt: t0, elapsed: 0, pushed: sub.push });
      // cap de segurança ~25min (375 × 4s) — igual ao teste de detecção dos provedores
      for (let i = 0; i < 375; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await pollDetectNow(sub);
        const elapsed = Math.round((Date.now() - t0) / 1000);
        if (st.status === 'COMPLETED') {
          setDetect({
            phase: 'done',
            startedAt: t0,
            elapsed,
            count: st.count ?? st.detections?.length ?? 0,
            pushed: sub.push,
          });
          return;
        }
        // Tarefa W — o backend nunca devolve 500 no poll: job purgado no
        // provedor vira EXPIRED; falha na consulta vira PROVIDER_ERROR.
        // Ambos são re-submetíveis ("Tentar novamente").
        if (st.status === 'EXPIRED' || st.status === 'PROVIDER_ERROR') {
          const base =
            st.status === 'EXPIRED'
              ? t('cameras.detectExpired')
              : t('cameras.detectProviderError');
          setDetect({
            phase: 'error',
            startedAt: t0,
            elapsed,
            msg: st.error ? `${base} (${st.error})` : base,
            retryable: true,
          });
          return;
        }
        if (st.status === 'FAILED' || st.status === 'CANCELLED' || st.status === 'TIMED_OUT') {
          setDetect({ phase: 'error', startedAt: t0, elapsed, msg: st.error || st.status });
          return;
        }
        // IN_QUEUE com só workers throttled = provedor sem capacidade agora;
        // o job segue na fila e roda quando liberar (banner explica).
        const w = st.workers;
        const noCapacity =
          st.status === 'IN_QUEUE' &&
          !!w &&
          (w.throttled ?? 0) > 0 &&
          (w.ready ?? 0) + (w.initializing ?? 0) + (w.running ?? 0) === 0;
        setDetect({
          phase: st.status === 'IN_PROGRESS' ? 'running' : 'booting',
          startedAt: t0,
          elapsed,
          pushed: sub.push,
          noCapacity,
        });
      }
      setDetect({
        phase: 'error',
        startedAt: t0,
        elapsed: Math.round((Date.now() - t0) / 1000),
        msg: '25min',
      });
    } catch (e) {
      setDetect({
        phase: 'error',
        startedAt: t0,
        elapsed: Math.round((Date.now() - t0) / 1000),
        msg: (e as Error)?.message || t('cameras.detectError'),
      });
    } finally {
      detectRef.current = false;
    }
  };

  // Elapsed em WALL-CLOCK: o ticker de 1s só força re-render; o valor exibido
  // é sempre Date.now() - startedAt. Aba fora de foco throttla o ticker, mas o
  // primeiro tick ao voltar já mostra o tempo REAL (visto ao vivo: 253s
  // exibidos vs ~870s reais com contador por ticks).
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!detectBusy) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [detectBusy]);
  const detectElapsed = detect
    ? Math.max(0, Math.round((nowTick - detect.startedAt) / 1000))
    : 0;

  // §C C1 — polling do mosaico é ESCOPADO ao mosaico ativo (antes: TODOS os
  // streams a cada 5s — não escala). `mosaicStreamKey` (ids do subconjunto)
  // re-dispara só quando a composição do mosaico muda, não a cada poll de streams.
  useEffect(() => {
    if (!mosaicMode || mosaicStreams.length === 0) return;
    const targets = mosaicStreams;
    let cancelled = false;
    const fetchScoped = async () => {
      try {
        const entries = await Promise.all(
          targets.map(async (s): Promise<[string, CCTVDetection[]]> => {
            try {
              const ds = await Cctv.streams.detections(s.id, 200);
              return [s.id, ds.filter(nonAggregate)];
            } catch {
              return [s.id, []];
            }
          }),
        );
        if (!cancelled) setAllDetections(new Map(entries));
      } catch {
        // mantém último
      }
    };
    fetchScoped();
    const id = setInterval(fetchScoped, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mosaicMode, mosaicStreamKey]);

  return (
    <RequirePerm perm="security.cameras.view">
      <PageShell
        title={active ? `Câmeras · ${active.name}` : 'Câmeras'}
        subtitle={`HLS via intel-module · /api/v1/cctv/streams · ${streams.length} streams`}
        classification={shellClassification.level}
        classificationLabel={shellClassification.label}
        theme="light"
        toolbar={
          <>
            <MosaicToolbar
              mosaics={mosaics}
              activeId={activeMosaicId}
              streams={streams}
              zones={zones}
              onSelect={setActiveMosaicId}
              onNew={() => setMosaicEditor({ open: true, initial: null })}
              onEdit={(m) => setMosaicEditor({ open: true, initial: m })}
              onDelete={handleDeleteMosaic}
            />
            <button
              type="button"
              data-testid="detectar-agora"
              onClick={runDetectNow}
              disabled={!active || detectBusy}
              title={t('provedores.testBootHint')}
              className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ScanSearch className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.detectNow')}
            </button>
            {canCloudInference && caps.multidominio && (
              <button
                type="button"
                data-testid="abrir-multidominio"
                onClick={() => setMultidomainOpen(true)}
                disabled={!active}
                title={t('cameras.multidomainTitle')}
                className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Cloud className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.multidomain')}
              </button>
            )}
            {canManageCameras && caps.gcp && (
              <button
                type="button"
                data-testid="abrir-calibrar"
                onClick={() => setCalibrateOpen(true)}
                disabled={!active}
                title={t('cameras.calibrateTitle')}
                className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Crosshair className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.calibrate')}
              </button>
            )}
            {canManageCameras && caps.linha && (
              <button
                type="button"
                data-testid="abrir-linha"
                onClick={() => setLinhaOpen(true)}
                disabled={!active}
                title={t('cameras.linhaTitle')}
                className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Slash className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.linha')}
              </button>
            )}
            {canManageCameras && caps.linha && (
              <button
                type="button"
                data-testid="abrir-treino"
                onClick={() => router.push('/treino-contagem')}
                title={t('treino.title')}
                className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
              >
                <Brain className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.treino')}
              </button>
            )}
            <button
              type="button"
              data-testid="abrir-exportar"
              onClick={() => setExportOpen(true)}
              className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
            >
              <Download className="w-3 h-3" strokeWidth={1.5} /> Exportar clipe
            </button>
            {/* Volta a /cameras (ADD-alongside do §C C5): o operador front-line
                caça placas e vê o pipeline SEM ir ao gestor. Auto-gated. */}
            {canHotlist && caps.hotlist && (
              <button
                type="button"
                data-testid="cam-ops-hotlist-btn"
                onClick={() => setOpsPanel((v) => (v === 'hotlist' ? null : 'hotlist'))}
                title={t('cameras.opsHotlistTitle')}
                className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
              >
                <Car className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.opsHotlist')}
              </button>
            )}
            {canPipelineView && (
              <button
                type="button"
                data-testid="cam-ops-pipeline-btn"
                onClick={() => setOpsPanel((v) => (v === 'pipeline' ? null : 'pipeline'))}
                title={t('cameras.opsPipelineTitle')}
                className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
              >
                <ListOrdered className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.opsPipeline')}
              </button>
            )}
            {/* §C C5 — "Registrar câmera" SAIU daqui: provisionamento é do GESTOR
                (Painel de Controle › Dados › Câmeras). /cameras só OPERA. */}
          </>
        }
      >
        {loadState === 'error' ? (
          <div
            data-testid="cameras-error"
            className="h-full flex flex-col items-center justify-center gap-3 bg-panel-light"
          >
            <p className="text-[12px] text-danger">{t('cameras.backendDown')}</p>
            <button
              type="button"
              data-testid="cameras-retry"
              onClick={loadStreams}
              className="h-7 px-3 text-[11px] border border-border-light hover:border-primary flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> {t('common.retry')}
            </button>
          </div>
        ) : loadState === 'loading' && streams.length === 0 ? (
          <div
            data-testid="cameras-loading"
            className="h-full flex items-center justify-center text-[11px] text-muted-on-light bg-panel-light"
          >
            {t('common.loading')}
          </div>
        ) : streams.length === 0 && !streamFilterActive ? (
          <div
            data-testid="cameras-empty"
            className="h-full flex flex-col items-center justify-center gap-3 bg-panel-light"
          >
            <Video className="w-6 h-6 text-muted-on-light" strokeWidth={1.5} />
            <p className="text-[12px] font-semibold">{t('cameras.emptyTitle')}</p>
            <p className="text-[11px] text-muted-on-light max-w-[380px] text-center">
              {t('cameras.emptyHint')}
            </p>
            {/* §C C5 — sem CTA de registro aqui: o cadastro é do gestor
                (Painel de Controle › Dados › Câmeras). */}
          </div>
        ) : (
        <div className="h-full flex flex-col overflow-hidden">
          {detect && (
            <div
              data-testid="detect-status"
              className="h-8 px-3 shrink-0 border-b border-border-light bg-raised-light flex items-center gap-2 text-[11px] font-mono"
            >
              <ScanSearch className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
              {detect.phase === 'submitting' && <span>{t('cameras.detectSubmitting')}</span>}
              {detect.phase === 'booting' && detect.noCapacity && (
                <span className="text-warning truncate" title={t('provedores.testBootHint')}>
                  {t('cameras.gpuSemCapacidade')} · {detectElapsed}s
                </span>
              )}
              {detect.phase === 'booting' && !detect.noCapacity && (
                <span title={t('provedores.testBootHint')}>
                  {t('provedores.testBooting')} · {detectElapsed}s
                </span>
              )}
              {detect.phase === 'running' && (
                <span>
                  {t('provedores.testRunning')} · {detectElapsed}s
                </span>
              )}
              {detect.phase === 'done' && (
                <span className="text-success truncate">
                  {detect.count} {t('cameras.detectDoneObjects')} ·{' '}
                  {detect.pushed ? t('cameras.detectDonePushed') : t('cameras.detectDoneInline')}
                </span>
              )}
              {detect.phase === 'error' && (
                <span className="text-danger truncate">
                  {t('cameras.detectError')} · {detect.msg}
                </span>
              )}
              {detect.phase === 'error' && detect.retryable && (
                <button
                  type="button"
                  data-testid="detect-retry"
                  onClick={runDetectNow}
                  className="h-5 px-1.5 text-[10px] border border-border-light hover:border-primary flex items-center gap-1 shrink-0"
                >
                  <RotateCcw className="w-2.5 h-2.5" strokeWidth={1.5} /> {t('common.retry')}
                </button>
              )}
              {(detect.phase === 'done' || detect.phase === 'error') && (
                <button
                  type="button"
                  data-testid="detect-status-close"
                  onClick={() => setDetect(null)}
                  aria-label={t('common.close')}
                  className="ml-auto w-5 h-5 flex items-center justify-center border border-border-light hover:border-primary shrink-0"
                >
                  <X className="w-3 h-3" strokeWidth={1.5} />
                </button>
              )}
            </div>
          )}
        <div className="flex-1 flex overflow-hidden">
          <aside
            data-testid="cameras-tags"
            className="w-[320px] bg-panel-light border-r border-border-light flex flex-col shrink-0 overflow-hidden"
          >
            <div className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light">
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold flex-1">
                Streams · <span className="font-mono">{filteredStreams.length}</span>
                {streams.length >= 1000 && (
                  <span className="ml-1 font-normal normal-case tracking-normal text-muted-on-light">
                    {t('cameras.filter.capHint')}
                  </span>
                )}
              </p>
            </div>
            <div className="px-3 py-2 border-b border-border-light bg-panel-light space-y-1.5 shrink-0">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-on-light"
                  strokeWidth={1.5}
                />
                <input
                  data-testid="streams-busca"
                  value={streamQuery}
                  onChange={(e) => setStreamQuery(e.target.value)}
                  placeholder={t('cameras.filter.searchStreams')}
                  aria-label={t('cameras.filter.searchStreams')}
                  className="w-full h-7 pl-7 pr-2 text-[11px] bg-raised-light border border-border-light outline-none focus:border-primary placeholder:text-muted-on-light"
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <FilterSelect
                  testid="streams-filter-status"
                  value={streamStatus}
                  onChange={(v) => setStreamStatus(v as 'all' | 'online' | 'offline')}
                  active={streamStatus !== 'all'}
                  title={t('cameras.filter.status')}
                >
                  <option value="all">{t('cameras.filter.statusAll')}</option>
                  <option value="online">{t('cameras.filter.statusOnline')}</option>
                  <option value="offline">{t('cameras.filter.statusOffline')}</option>
                </FilterSelect>
                <FilterSelect
                  testid="streams-filter-city"
                  value={streamCity}
                  onChange={setStreamCity}
                  active={streamCity !== 'all'}
                  title={t('cameras.filter.city')}
                >
                  <option value="all">{t('cameras.filter.cityAll')}</option>
                  {cityOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect
                  testid="streams-filter-detection"
                  value={streamDetection}
                  onChange={(v) => setStreamDetection(v as 'all' | 'on' | 'off')}
                  active={streamDetection !== 'all'}
                  title={t('cameras.filter.detection')}
                >
                  <option value="all">{t('cameras.filter.detectionAll')}</option>
                  <option value="on">{t('cameras.filter.detectionOn')}</option>
                  <option value="off">{t('cameras.filter.detectionOff')}</option>
                </FilterSelect>
              </div>
              {(streamFilterActive || streamQuery.length > 0) && (
                <button
                  type="button"
                  data-testid="streams-filter-clear"
                  onClick={() => {
                    setStreamQuery('');
                    setStreamStatus('all');
                    setStreamCity('all');
                    setStreamDetection('all');
                  }}
                  className="h-6 px-2 text-[10px] border border-border-light hover:border-primary text-muted-on-light flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.filter.clear')}
                </button>
              )}
            </div>
            <ul className="overflow-y-auto">
              {filteredStreams.length === 0 && (
                <li className="px-3 py-3 text-[11px] text-muted-on-light italic">
                  {t('cameras.filter.noStreams')}
                </li>
              )}
              {filteredStreams.map((s) => {
                const kind = cameraKindOf(s);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      data-testid={`stream-card-${s.id}`}
                      onClick={() => setActiveUrl(hlsUrlForStream(s))}
                      className={cn(
                        'w-full text-left px-3 py-2.5 border-b border-border-light transition-colors',
                        hlsUrlForStream(s) === activeUrl ? 'bg-raised-light border-l-2 border-l-primary' : 'hover:bg-raised-light/50',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium truncate flex-1">{s.name}</span>
                        <HlsBadge live={s.status === 'online'} />
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono text-muted-on-light">
                        {kind === 'con' && (
                          <span className="px-1 bg-success/85 text-white">CON</span>
                        )}
                        {kind === 'ocr' && (
                          <span className="px-1 bg-warning/80 text-black">OCR</span>
                        )}
                        {kind === 'face' && (
                          <span className="px-1 bg-purple-600/80 text-white">FACE</span>
                        )}
                        {kind === 'lpr' && (
                          <span className="px-1 bg-primary/80 text-white">LPR</span>
                        )}
                        <span className="truncate">{s.city || '—'}</span>
                        {s.latitude !== null && s.longitude !== null && (
                          <span className="ml-auto truncate">
                            {s.latitude.toFixed(3)},{s.longitude.toFixed(3)}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {(bookmarks.length > 0 || bookmarkError) && (
              <div
                data-testid="cameras-bookmarks"
                className="border-t border-border-light p-3 space-y-1.5 max-h-[180px] overflow-y-auto shrink-0"
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">
                  {t('cameras.bookmarks')} · {bookmarks.length}
                </p>
                {bookmarkError && (
                  <p data-testid="bookmark-error" className="text-[10px] text-danger">
                    {bookmarkError}
                  </p>
                )}
                {bookmarks.map((b) => (
                  <div
                    key={b.id}
                    data-testid={`bookmark-item-${b.id}`}
                    className="flex items-center gap-2 border border-border-light px-2 py-1"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        handleBookmarkMarker({ id: b.id, atMs: b.t_ms, label: b.label })
                      }
                      title={b.label}
                      className="flex-1 min-w-0 text-left flex items-baseline gap-2"
                    >
                      <span className="font-mono text-[10px] text-muted-on-light shrink-0">
                        {formatHoraSegBR(new Date(b.t_ms))}
                      </span>
                      <span className="text-[11px] truncate">{b.label}</span>
                    </button>
                    {canBookmark && (
                      <button
                        type="button"
                        data-testid={`bookmark-remove-${b.id}`}
                        onClick={() => void removeBookmark(b)}
                        aria-label={t('cameras.bookmarkRemoveTitle')}
                        className="w-5 h-5 flex items-center justify-center border border-border-light hover:border-danger hover:text-danger shrink-0"
                      >
                        <X className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex-1 flex flex-col overflow-hidden border-t border-border-light">
              <div className="p-3 pb-2 space-y-2 shrink-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">
                  Observações vinculadas · <span className="font-mono">{filteredTags.length}</span>
                </p>
                <div className="flex gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <Search
                      className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-on-light"
                      strokeWidth={1.5}
                    />
                    <input
                      data-testid="obs-busca"
                      value={detQuery}
                      onChange={(e) => setDetQuery(e.target.value)}
                      placeholder={t('cameras.filter.searchDetections')}
                      aria-label={t('cameras.filter.searchDetections')}
                      className="w-full h-7 pl-7 pr-2 text-[11px] bg-raised-light border border-border-light outline-none focus:border-primary placeholder:text-muted-on-light"
                    />
                  </div>
                  <div className="w-24 shrink-0">
                    <FilterSelect
                      testid="obs-filter-kind"
                      value={detKind}
                      onChange={(v) => setDetKind(v as 'all' | 'lpr' | 'face' | 'object')}
                      active={detKind !== 'all'}
                      title={t('cameras.filter.kind')}
                    >
                      <option value="all">{t('cameras.filter.kindAll')}</option>
                      <option value="lpr">{t('cameras.filter.kindLpr')}</option>
                      <option value="face">{t('cameras.filter.kindFace')}</option>
                      <option value="object">{t('cameras.filter.kindObject')}</option>
                    </FilterSelect>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2.5">
              {filteredTags.length === 0 && (
                <p className="text-[11px] text-muted-on-light italic">
                  {tags.length === 0
                    ? 'Sem observações ainda. Aguardando detecções do cctv-worker.'
                    : t('cameras.filter.noDetections')}
                </p>
              )}
              {filteredTags.map((det) => {
                const conf = Math.round(det.confidence_max * 100);
                const KIND_COLOR: Record<string, string> = {
                  lpr: 'bg-danger/15 text-danger border-danger/40',
                  face: 'bg-cls-sigiloso/15 text-cls-sigiloso border-cls-sigiloso/40',
                  object: 'bg-warning/15 text-warning border-warning/40',
                };
                const cityLabel = active?.city ?? '—';
                return (
                  <button
                    key={det.id}
                    type="button"
                    onClick={() => {
                      setTagAtivaId(det.id);
                      if (det.entity_id) router.push(`/ficha/${det.entity_id}`);
                    }}
                    className={cn(
                      'w-full text-left p-2 border text-[11px] transition-colors flex gap-2',
                      tagAtivaId === det.id ? 'border-primary' : 'border-border-light hover:border-primary',
                      det.entity_id && 'cursor-pointer hover:bg-primary/5',
                    )}
                    title={det.entity_id ? 'Abrir ficha da entidade' : 'Sem entidade vinculada'}
                  >
                    {det.thumb ? (
                      <img
                        src={det.thumb}
                        alt={`frame ${detectionClassLabel(t, det.label)}`}
                        loading="lazy"
                        className="w-14 h-10 object-cover bg-black shrink-0 border border-border-light"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-14 h-10 bg-raised-light/60 shrink-0 border border-border-light flex items-center justify-center">
                        <Camera className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={cn(
                            'px-1 text-[9px] font-mono font-semibold uppercase border',
                            KIND_COLOR[det.kind] ?? 'bg-raised-light text-muted-on-light border-border-light',
                          )}
                        >
                          {detectionKindLabel(t, det.kind)}
                        </span>
                        <span className="font-medium truncate">{detectionClassLabel(t, det.label)}</span>
                      </div>
                      <p className="font-mono text-[9px] text-muted-on-light mt-0.5">
                        {det.count}× · {detectionConf(t, conf)} · {cityLabel}
                      </p>
                      <p className="font-mono text-[9px] text-muted-on-light/70 mt-0.5">
                        {formatHoraSegBR(det.first_at)} → {formatHoraSegBR(det.last_at)}
                      </p>
                    </div>
                  </button>
                );
              })}
              </div>
            </div>
          </aside>

          <section data-testid="cameras-player" className="flex-1 flex flex-col bg-deep overflow-hidden">
            <div className="flex-1 relative overflow-hidden">
              {mosaicMode ? (
                mosaicStreams.length > 0 ? (
                  <MosaicView
                    streams={mosaicStreams}
                    detectionsByStreamId={allDetections}
                    showLPR={showAR && showLPR}
                    showFace={showAR && showFace}
                    showObject={showAR && showObject}
                    cols={activeMosaic?.layout.cols}
                  />
                ) : (
                  <div
                    data-testid="mosaic-empty"
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-deep text-center px-6"
                  >
                    <Grid3x3 className="w-6 h-6 text-muted-on-dark" strokeWidth={1.5} />
                    <p className="text-[12px] text-white">{t('cameras.mosaic.activeEmpty')}</p>
                    <p className="text-[11px] text-muted-on-dark max-w-[360px]">
                      {t('cameras.mosaic.activeEmptyHint')}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {activeMosaic && (
                        <button
                          type="button"
                          data-testid="mosaic-empty-edit"
                          onClick={() => setMosaicEditor({ open: true, initial: activeMosaic })}
                          className="h-7 px-3 text-[11px] bg-raised-dark border border-border-dark text-white hover:border-primary"
                        >
                          {t('cameras.mosaic.edit')}
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="mosaic-empty-single"
                        onClick={() => setActiveMosaicId(null)}
                        className="h-7 px-3 text-[11px] bg-raised-dark border border-border-dark text-white hover:border-primary"
                      >
                        {t('cameras.mosaic.single')}
                      </button>
                    </div>
                  </div>
                )
              ) : active ? (
                <HlsPlayer
                  ref={playerRef}
                  url={playerUrl}
                  autoPlay
                  onTime={handleTime}
                  onPlayState={setPlaying}
                  onRate={setRate}
                  overlay={
                    showAR ? (
                      <LprOverlay
                        detections={detections}
                        showLPR={showLPR}
                        showFace={showFace}
                        showObject={showObject}
                      />
                    ) : null
                  }
                />
              ) : null}

              {/* no mosaico, o header do MosaicView (h-9) ocupa o topo —
                  os toggles AR descem pra não cobrir os controles únicos */}
              <div
                className={cn(
                  'absolute left-3 right-3 flex items-center justify-between gap-2 z-10 pointer-events-none',
                  mosaicMode ? 'top-12' : 'top-3',
                )}
              >
                {!mosaicMode && (
                  <div className="flex items-center gap-2 min-w-0 max-w-[60%]">
                    <div className="flex items-center gap-2 px-2 py-1 bg-deep/85 border border-border-dark text-[10px] font-mono pointer-events-auto min-w-0">
                      <HlsBadge live={isLive} />
                      <span className='text-white shrink-0'>·</span>
                      <span className='text-white truncate' title={active?.name}>
                        {active?.name}
                      </span>
                    </div>
                    {/* Gravação contínua — o GESTO é AQUI, na página da câmera
                        (nunca na central técnica de conectores). */}
                    {activeId && <RecordingControl streamId={activeId} />}
                  </div>
                )}
                {mosaicMode && <div />}
                <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
                  <button
                    type="button"
                    data-testid="toggle-ar"
                    onClick={() => setShowAR((p) => !p)}
                    title={
                      showAR
                        ? 'Desliga TODOS os bboxes AR sobre o vídeo (master)'
                        : 'Liga overlay AR (LPR + face + objeto sobre o vídeo)'
                    }
                    className={cn(
                      'h-7 px-2 text-[10px] uppercase tracking-[0.14em] border flex items-center gap-1.5 bg-deep/85 border-border-dark hover:text-white',
                      showAR ? 'text-muted-on-dark' : 'text-muted-on-dark/50',
                    )}
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 shrink-0',
                        showAR ? 'bg-success' : 'bg-muted-on-dark/40',
                      )}
                    />
                    AR {showAR ? 'on' : 'off'}
                  </button>
                  <button
                    type="button"
                    data-testid="toggle-lpr"
                    onClick={() => setShowLPR(!showLPR)}
                    disabled={!showAR}
                    className={cn(
                      'h-7 px-2 text-[10px] uppercase tracking-[0.14em] border transition-opacity',
                      !showAR && 'opacity-40 cursor-not-allowed',
                      showLPR ? 'bg-primary text-white border-primary' : 'bg-deep/85 border-border-dark hover:border-primary',
                    )}
                  >
                    LPR
                  </button>
                  <button
                    type="button"
                    data-testid="toggle-face"
                    onClick={() => setShowFace(!showFace)}
                    disabled={!showAR}
                    className={cn(
                      'h-7 px-2 text-[10px] uppercase tracking-[0.14em] border transition-opacity',
                      !showAR && 'opacity-40 cursor-not-allowed',
                      showFace ? 'bg-danger text-white border-danger' : 'bg-deep/85 border-border-dark hover:border-primary',
                    )}
                  >
                    Face
                  </button>
                  <button
                    type="button"
                    data-testid="toggle-object"
                    onClick={() => setShowObject(!showObject)}
                    disabled={!showAR}
                    className={cn(
                      'h-7 px-2 text-[10px] uppercase tracking-[0.14em] border transition-opacity',
                      !showAR && 'opacity-40 cursor-not-allowed',
                      showObject ? 'bg-warning text-black border-warning' : 'bg-deep/85 border-border-dark hover:border-primary',
                    )}
                  >
                    Objeto
                  </button>
                </div>
              </div>

              <div className="absolute bottom-3 left-3 z-10 flex items-end gap-3 pointer-events-none">
                <div className="px-2 py-1 bg-deep/85 border border-border-dark text-[10px] font-mono">
                  <p className="text-muted-on-dark uppercase tracking-wider">LAT</p>
                  <p className="text-white">{active?.latitude?.toFixed(4) ?? '—'}</p>
                </div>
                <div className="px-2 py-1 bg-deep/85 border border-border-dark text-[10px] font-mono">
                  <p className="text-muted-on-dark uppercase tracking-wider">LNG</p>
                  <p className="text-white">{active?.longitude?.toFixed(4) ?? '—'}</p>
                </div>
                <div className="px-2 py-1 bg-deep/85 border border-border-dark text-[10px] font-mono">
                  <p className="text-muted-on-dark uppercase tracking-wider">CIDADE</p>
                  <p className="text-white">{active?.city ?? '—'}</p>
                </div>
                <div className="px-2 py-1 bg-deep/85 border border-warning text-[10px] font-mono text-warning">
                  {active?.source_type ?? 'desconhecido'}
                </div>
                {/* Selo discreto — câmera com homografia calibrada (GCPs).
                    Com 4 pontos o erro ~0 é interpolação exata (não mede a
                    marcação) → ±— em vez de número fingido. */}
                {gcps?.homography && (
                  <div
                    data-testid="calibrated-badge"
                    className="px-2 py-1 bg-deep/85 border border-success/60 text-[10px] font-mono text-success"
                  >
                    {t('cameras.calibratedBadge').replace(
                      '{m}',
                      residualMeaningful(gcps.homography, gcps.gcps.length)
                        ? gcps.homography.reproj_error_m.toFixed(1)
                        : '—',
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Barra do player ÚNICO — no mosaico ela some: os controles
                únicos (relógio mestre) vivem dentro do próprio MosaicView,
                nada de dois jogos de botões disputando o operador. */}
            {!mosaicMode && (
            <div className="bg-panel-light border-t border-border-light text-text-on-light flex items-center px-3 py-2 gap-3 flex-wrap">
              <button
                type="button"
                data-testid="player-playpause"
                onClick={() =>
                  playing ? playerRef.current?.pause() : playerRef.current?.play()
                }
                className="w-9 h-9 bg-raised-light border border-border-light hover:border-primary flex items-center justify-center shrink-0"
                aria-label={playing ? t('cameras.pause') : t('cameras.play')}
                title={playing ? t('cameras.pause') : t('cameras.play')}
              >
                {playing ? (
                  <Pause className="w-4 h-4" strokeWidth={1.5} />
                ) : (
                  <Play className="w-4 h-4" strokeWidth={1.5} />
                )}
              </button>
              <button
                type="button"
                data-testid="player-back10"
                onClick={() => playerRef.current?.seekBy(-10)}
                disabled={!canSeekBack}
                aria-label={t('cameras.back10s')}
                title={canSeekBack ? t('cameras.back10s') : t('cameras.back10sUnavailable')}
                className="w-9 h-9 bg-raised-light border border-border-light hover:border-primary flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-light"
              >
                <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
              {canBookmark && (
                <button
                  type="button"
                  data-testid="bookmark-add"
                  onClick={() => void addBookmark()}
                  title={t('cameras.bookmarkAdd')}
                  className="h-9 px-2.5 bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] shrink-0"
                >
                  <Bookmark className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {t('cameras.bookmarkAdd')}
                </button>
              )}

              <CameraTimeline
                fromMs={tlFrom}
                toMs={tlTo}
                coverage={mode === 'dvr' && dvr ? dvr.coverage : coverage}
                detections={tlDetections}
                bookmarks={tlBookmarks}
                cursorMs={cursorMs}
                onSeek={mode === 'dvr' ? seekAbs : undefined}
                onDetectionClick={handleDetectionMarker}
                onBookmarkClick={mode === 'dvr' ? handleBookmarkMarker : undefined}
              />

              {(coverage.length > 0 || mode === 'dvr') && (
                <div className="flex items-center text-[10px] uppercase tracking-[0.14em] shrink-0">
                  <button
                    type="button"
                    data-testid="mode-live"
                    onClick={exitDvr}
                    className={cn(
                      'h-7 px-2 border',
                      mode === 'live'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-raised-light border-border-light hover:border-primary',
                    )}
                  >
                    {t('cameras.modeLive')}
                  </button>
                  <button
                    type="button"
                    data-testid="mode-dvr"
                    onClick={() => void enterDvr(windowHours)}
                    className={cn(
                      'h-7 px-2 border -ml-px',
                      mode === 'dvr'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-raised-light border-border-light hover:border-primary',
                    )}
                  >
                    {t('cameras.modeDvr')}
                  </button>
                </div>
              )}
              <div
                className="flex items-center gap-1 text-[10px] font-mono shrink-0"
                title={t('cameras.windowTitle')}
              >
                {WINDOW_HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    data-testid={`window-${h}h`}
                    onClick={() => selectWindow(h)}
                    className={cn(
                      'h-7 px-1.5 border',
                      windowHours === h
                        ? 'bg-primary text-white border-primary'
                        : 'bg-raised-light border-border-light hover:border-primary',
                    )}
                  >
                    {h}h
                  </button>
                ))}
              </div>
              {dvrError && (
                <span data-testid="dvr-error" className="text-[10px] text-danger shrink-0">
                  {t('cameras.dvrUnavailable')}
                </span>
              )}
              <div
                className="flex items-center gap-1.5 text-[10px] font-mono shrink-0"
                title={t('cameras.speed')}
              >
                {RATES.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    data-testid={`player-rate-${value}`}
                    onClick={() => playerRef.current?.setRate(value)}
                    className={cn(
                      'h-7 px-2 border',
                      rate === value
                        ? 'bg-primary text-white border-primary'
                        : 'bg-raised-light border-border-light hover:border-primary',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            )}
          </section>

          <aside
            data-testid="cameras-detections"
            className="w-[320px] bg-panel-light border-l border-border-light flex flex-col shrink-0 overflow-hidden"
          >
            <div className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light gap-2">
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold flex-1">
                Detecções IA · <span className="font-mono">{filteredTags.length}</span> entidades
              </p>
              <button
                type="button"
                data-testid="toggle-ia-stream"
                onClick={async () => {
                  if (!active) return;
                  const next = !active.detection_enabled;
                  // Mutação otimista — UI vira imediatamente. PATCH vai pros
                  // 2 backends: ontology (fonte da verdade pra UI) + intel
                  // (worker recarrega in-place a cada 30s).
                  setStreams((prev) =>
                    prev.map((s) => (s.id === active.id ? { ...s, detection_enabled: next } : s)),
                  );
                  const tasks: Promise<unknown>[] = [
                    Cctv.streams.update(active.id, { detection_enabled: next }).catch((e) => {
                      console.warn('ontology PATCH falhou', e);
                      return null;
                    }),
                  ];
                  const numericId = Number(active.id);
                  if (Number.isInteger(numericId) && numericId > 0) {
                    const { Intel } = await import('@/lib/api/intel');
                    tasks.push(
                      Intel.cctv.update(numericId, { detection_enabled: next }).catch((e) => {
                        console.warn('intel PATCH falhou', e);
                        return null;
                      }),
                    );
                  }
                  await Promise.all(tasks);
                }}
                title={
                  active?.detection_enabled
                    ? 'Clique para DESLIGAR a IA neste sensor'
                    : 'Clique para LIGAR a IA neste sensor'
                }
                className={cn(
                  'px-2 h-6 text-[10px] font-mono uppercase tracking-wide border transition-colors',
                  active?.detection_enabled
                    ? 'bg-success/10 border-success text-success hover:bg-success/20'
                    : 'bg-raised-light border-border-light text-muted-on-light hover:border-warning hover:text-warning',
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      'w-1.5 h-1.5',
                      active?.detection_enabled ? 'bg-success animate-pulse' : 'bg-muted-on-light',
                    )}
                  />
                  IA {active?.detection_enabled ? 'on' : 'off'}
                </span>
              </button>
            </div>
            {caps.linha && active && (
              <ContagemProof key={active.id} streamId={active.id} />
            )}
            <div className="px-3 py-2 border-b border-border-light bg-panel-light flex gap-1.5 shrink-0">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-on-light"
                  strokeWidth={1.5}
                />
                <input
                  data-testid="det-busca"
                  value={detQuery}
                  onChange={(e) => setDetQuery(e.target.value)}
                  placeholder={t('cameras.filter.searchDetections')}
                  aria-label={t('cameras.filter.searchDetections')}
                  className="w-full h-7 pl-7 pr-2 text-[11px] bg-raised-light border border-border-light outline-none focus:border-primary placeholder:text-muted-on-light"
                />
              </div>
              <div className="w-24 shrink-0">
                <FilterSelect
                  testid="det-filter-kind"
                  value={detKind}
                  onChange={(v) => setDetKind(v as 'all' | 'lpr' | 'face' | 'object')}
                  active={detKind !== 'all'}
                  title={t('cameras.filter.kind')}
                >
                  <option value="all">{t('cameras.filter.kindAll')}</option>
                  <option value="lpr">{t('cameras.filter.kindLpr')}</option>
                  <option value="face">{t('cameras.filter.kindFace')}</option>
                  <option value="object">{t('cameras.filter.kindObject')}</option>
                </FilterSelect>
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto">
              {filteredTags.length === 0 && (
                <li className="px-3 py-3 text-[11px] text-muted-on-light italic">
                  {tags.length === 0
                    ? t('cameras.filter.noDetectionsYet')
                    : t('cameras.filter.noDetections')}
                </li>
              )}
              {filteredTags.map((g) => (
                <li
                  key={g.id}
                  data-testid={`detection-${g.id}`}
                  onClick={() => g.entity_id && router.push(`/ficha/${g.entity_id}`)}
                  className={cn(
                    'px-3 py-2 border-b border-border-light/60 transition-colors',
                    g.entity_id
                      ? 'hover:bg-primary/10 cursor-pointer'
                      : 'hover:bg-raised-light/50',
                  )}
                  title={g.entity_id ? 'Abrir ficha da entidade' : 'Sem entidade vinculada'}
                >
                  <div className="flex gap-2">
                    {g.thumb ? (
                      <img
                        src={g.thumb}
                        alt={`frame ${g.label}`}
                        loading="lazy"
                        className="w-16 h-12 object-cover bg-black shrink-0 border border-border-light"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-16 h-12 bg-raised-light/60 shrink-0 border border-border-light flex items-center justify-center">
                        <Camera className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] truncate">
                          <span className="font-mono uppercase text-muted-on-light mr-1.5">{g.kind}</span>
                          {g.label}
                        </p>
                        <span className="font-mono text-[10px] text-muted-on-light shrink-0">
                          {g.count}×
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-muted-on-light/80 mt-0.5">
                        {formatHoraSegBR(g.first_at)} → {formatHoraSegBR(g.last_at)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 bg-raised-light">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${g.confidence_max * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-muted-on-light">
                          {(g.confidence_max * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border-light p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-2">
                Soak Tool
              </p>
              <p className="text-[10px] text-muted-on-light leading-tight">
                Heatmap acumulado das detecções no intervalo selecionado da câmera atual.
              </p>
              <button
                type="button"
                data-testid="abrir-heatmap"
                onClick={() => setHeatmapOpen(true)}
                className="mt-2 w-full h-7 text-[11px] border border-border-light hover:border-primary hover:bg-primary/5"
              >
                Gerar heatmap (60s)
              </button>
            </div>
          </aside>
        </div>
        </div>
        )}
        {heatmapOpen && active && (
          <HeatmapModal stream={active} onClose={() => setHeatmapOpen(false)} />
        )}
        {mosaicEditor.open && (
          <MosaicEditorModal
            initial={mosaicEditor.initial}
            streams={streams}
            zones={zones}
            existing={mosaics}
            onSave={handleSaveMosaic}
            onClose={() => setMosaicEditor({ open: false, initial: null })}
          />
        )}
        {calibrateOpen && active && (
          <CalibrateModal
            stream={active}
            frameUrl={calibrateFrameUrl}
            onClose={() => setCalibrateOpen(false)}
            onChanged={() => setGcpsRefresh((n) => n + 1)}
          />
        )}
        {linhaOpen && active && (
          <LineCalibrateModal
            stream={active}
            frameUrl={calibrateFrameUrl}
            onClose={() => setLinhaOpen(false)}
            onChanged={() => setGcpsRefresh((n) => n + 1)}
          />
        )}
        {/* Events da análise multidomínio aparecem no painel "Detecções IA"
            pelo poll de 5s — sem reload manual. */}
        {multidomainOpen && active && (
          <MultidomainModal
            streamName={active.name}
            streamId={active.id}
            frameObject={multidomainFrameObject}
            onClose={() => setMultidomainOpen(false)}
          />
        )}
        {exportOpen && active && (
          <ExportModal
            stream={active}
            // Modo GRAVAÇÃO: começo do trecho = posição atual do player
            // (wall-clock); o backend monta o clipe dos segmentos gravados.
            recordingStartMs={
              mode === 'dvr' && dvr
                ? mediaToAbsMs(dvr.coverage, timeInfo?.currentTime ?? 0)
                : null
            }
            onClose={() => setExportOpen(false)}
          />
        )}
        {/* Drawer claro (slide-over à direita) — Placas procuradas / Pipeline
            de detecções DE VOLTA no cockpit (ADD-alongside; o gestor mantém
            as mesmas seções em /dados). Superfície clara EXPLÍCITA (a página
            é dark-first — mesma lição do fix de contraste dos modais). */}
        {opsPanel && (
          <div
            data-testid="cam-ops-drawer"
            className="fixed top-0 right-0 bottom-0 z-50 w-[660px] max-w-[92vw] bg-panel-light text-text-on-light border-l border-border-light flex flex-col"
            role="dialog"
            aria-label={opsPanel === 'hotlist' ? t('cameras.opsHotlist') : t('cameras.opsPipeline')}
          >
            <div className="h-9 px-3 border-b border-border-light bg-white flex items-center justify-between shrink-0">
              <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                {opsPanel === 'hotlist' ? t('cameras.opsHotlist') : t('cameras.opsPipeline')}
              </span>
              <button
                type="button"
                onClick={() => setOpsPanel(null)}
                aria-label={t('cameras.opsClose')}
                data-testid="cam-ops-drawer-close"
                className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-primary"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3">
              {opsPanel === 'hotlist' ? <HotlistSection /> : <PipelineSection />}
            </div>
          </div>
        )}
      </PageShell>
    </RequirePerm>
  );
}
