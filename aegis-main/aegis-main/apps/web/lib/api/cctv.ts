/**
 * Cliente CCTV via ontology-module bridge.
 *
 * O `intel-module` continua sendo o produtor (captura HLS/RTSP, roda LPR/face/object)
 * mas TODA chamada a partir do security-app passa pelo `ontology-module`. Razão:
 *
 *   - cada stream vira `Entity(kind="cctv_stream")` no ontology, com Evidence
 *   - cada detecção vira `Entity(kind="lpr_plate"|"face_match"|"object_det")`
 *     vinculada ao stream via `EntityLink(rel="observed")`
 *   - clicar uma LPR em `/cameras` abre direto `/ficha/{entity_id}` da placa,
 *     que aparece na busca, no quadro de rede, em alertas, etc.
 *   - o intel-module em PC GPU postar no webhook `POST /api/v1/cctv/detections/ingest`
 *     do ontology-module e a UI já pega via polling normal
 *
 * Endpoints (montados em /api/v1/cctv no ontology-module):
 *   GET    /streams
 *   GET    /streams/{id}
 *   POST   /streams                                  upsert
 *   DELETE /streams/{id}
 *   GET    /streams/{id}/detections
 *   POST   /streams/{id}/detect-now                  job GPU on-demand (202 + poll)
 *   POST   /streams/test                             testa URL na GPU antes de salvar (202 + poll)
 *   POST   /detections/ingest                        webhook intel-module
 *   GET    /lpr/{plate}/observations                 cruzamento
 *   GET    /count
 */
import { API_BASE, apiFetch } from './client';

export { API_BASE };

/**
 * Converte o ``frame_url`` relativo do backend (`/api/v1/cctv/frames/<sha>.jpg`)
 * em URL carregável pelo browser (a forma que o proxy do Next encaminha certo).
 */
export function framePathToUrl(raw: string): string {
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${API_BASE}${raw}`;
}

export interface CCTVStream {
  id: string;
  name: string;
  url: string;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  city: string | null;
  status: 'online' | 'offline' | string;
  source_type: string | null;
  detection_enabled: boolean;
  stream_metadata: Record<string, unknown>;
  tags: string[];
  thumbnail_url: string | null;
  /** POST /streams: True = a URL JÁ estava registrada (nada novo criado). */
  reusado?: boolean;
}

export interface CCTVDetection {
  id: string;
  stream_id: string;
  kind: 'lpr' | 'face' | 'object' | string;
  label: string;
  confidence: number;
  t_start_ms: number;
  t_end_ms: number;
  bbox: [number, number, number, number] | null;
  metadata: Record<string, unknown>;
  detected_at: string;
  linked_entity_id: string | null;
}

/**
 * Detecção agregada (`__flow__`) do flood-control do cctv-worker.
 * Vide docs/security-app/cctv-flood-control.md — batches de classes
 * de tráfego de fundo (car, boat, …) por minuto. NÃO renderiza em
 * lista de alertas/timeline; só serve pra widgets de tráfego que
 * consomem `metadata.class_counts`.
 */
export function isAggregateDetection(d: CCTVDetection): boolean {
  if (d.label === '__flow__') return true;
  const m = d.metadata as { aggregate?: unknown } | null | undefined;
  return m?.aggregate === true;
}

export function nonAggregate(d: CCTVDetection): boolean {
  return !isAggregateDetection(d);
}

/**
 * URL absoluta do frame da detecção, ou null se a detecção não tem evidência.
 *
 * O cctv-worker replica o JPEG no MinIO do ontology e grava em
 * `metadata.frame_url = "/api/v1/cctv/frames/<sha>.jpg"`. Aqui prefixamos
 * com o host do ontology-module pra que `<img src>` funcione direto do
 * browser, independente do PC GPU estar online.
 */
export function detectionFrameUrl(d: CCTVDetection): string | null {
  const raw = (d.metadata as { frame_url?: unknown } | null | undefined)?.frame_url;
  if (typeof raw !== 'string' || !raw) return null;
  // Já é URL absoluta? deixa passar.
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  // Path do ontology — prefixa com a base API.
  // Base relativa (`/api`) ⇒ `/api/api/v1/cctv/frames/…`, a forma que o
  // proxy do security-app encaminha certo (o Next consome o 1º `/api`).
  // Sem NEXT_PUBLIC_* em build de ilha, o fallback `/api` é o que FUNCIONA
  // same-origin; antes caía em http://localhost:8002 (imagem preta no browser).
  if (raw.startsWith('/api/v1/cctv/frames/')) {
    const base =
      (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ONTOLOGY_API_URL) ||
      '/api';
    return `${base}${raw}`;
  }
  // Path antigo (MinIO do intel-module) — sem proxy não dá pra renderizar.
  return null;
}

/**
 * Nome do objeto de frame arquivado (`<sha256>.jpg`) a partir do `frame_url`
 * da detecção — o backend lê os bytes do acervo (MinIO) e faz POST-bytes ao
 * serverless (caminho robusto da análise multidomínio). null quando a detecção
 * não tem frame arquivado.
 */
export function detectionFrameObject(d: CCTVDetection): string | null {
  const raw = (d.metadata as { frame_url?: unknown } | null | undefined)?.frame_url;
  if (typeof raw !== 'string' || !raw) return null;
  const m = raw.match(/\/frames\/([A-Za-z0-9]+\.jpg)(?:\?|$)/);
  return m ? m[1] : null;
}

/**
 * Resolve o deep-link `/cameras?focus=<stream_id>` (origem: fonte
 * "Câmeras / detecções" do /buscar). Retorna o stream apontado pelo
 * param `focus`, ou null quando ausente/desconhecido.
 */
export function findStreamByFocusParam(
  streams: CCTVStream[],
  search: string,
): CCTVStream | null {
  const focus = new URLSearchParams(search).get('focus');
  if (!focus) return null;
  return streams.find((s) => s.id === focus) ?? null;
}

// ── "Detectar agora" — job GPU on-demand por câmera (Tarefa D/E 2026-06-11) ──
//
// POST /streams/{id}/detect-now (202): a GPU abre o stream da câmera, amostra
// `frames` frames espaçados por `frame_stride` e — com push efetivo (base
// pública + service token configurados no backend) — EMPURRA as detecções pro
// ingest (aparecem no polling normal). Sem push, o resultado volta no próprio
// job (campo `detections` do poll quando COMPLETED).

export interface DetectNowOptions {
  /** 1..16 — cap espelha o clamp do handler GPU */
  frames?: number;
  /** 1..120 */
  frame_stride?: number;
  /** push efetivo só com AEGIS_PUBLIC_BASE_URL + AEGIS_CCTV_SERVICE_TOKEN no backend */
  push?: boolean;
}

export interface DetectNowSubmit {
  provider: string;
  provider_id: string;
  endpoint_id: string;
  job_id: string;
  push: boolean;
  status: string;
  /** path de status REAL: /compute/vision/jobs/{provider_id}/{endpoint_id}/{job_id} (sem /api/v1) */
  poll: string;
}

export interface DetectNowJobStatus {
  /** EXPIRED = job purgado/desconhecido no provedor; PROVIDER_ERROR = a
   *  consulta de status no provedor falhou (o backend nunca devolve 500). */
  status:
    | 'IN_QUEUE'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'FAILED'
    | 'EXPIRED'
    | 'PROVIDER_ERROR'
    | string;
  delay_ms?: number;
  execution_ms?: number;
  /** presente em IN_QUEUE (best-effort, health do endpoint) — a UI distingue
   *  "GPU subindo" de "provedor sem capacidade" (só throttled, nada ativo). */
  workers?: {
    ready?: number;
    initializing?: number;
    running?: number;
    throttled?: number;
    idle?: number;
    unhealthy?: number;
  };
  count?: number;
  detections?: {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
    confidence?: number;
    label?: string;
  }[];
  error?: string;
  /** COMPLETED de job camera_url: [W, H] do frame decodificado — o "Testar
   *  stream" mostra "Stream OK · WxH" (passthrough do backend, Tarefa D). */
  frame_size?: number[] | null;
  /** 1ºs erros do handler (curtos, honestos) — errors[0] é a mensagem da UI. */
  errors?: string[];
}

/**
 * Status do job "Detectar agora" — mesmo path/shape do client de vision jobs
 * (`Compute.visionJobStatus` em lib/api/index.ts). Prefere o `poll` retornado
 * pelo 202; reconstrói o path se vier vazio.
 */
export function pollDetectNow(
  sub: Pick<DetectNowSubmit, 'poll' | 'provider_id' | 'endpoint_id' | 'job_id'>,
): Promise<DetectNowJobStatus> {
  const path =
    sub.poll ||
    `/compute/vision/jobs/${sub.provider_id}/${sub.endpoint_id}/${sub.job_id}`;
  return apiFetch<DetectNowJobStatus>(path);
}

// ── Export de clipe SERVER-SIDE (Tarefa X, 2026-06-11) ─────────────────────
//
// O backend remuxa o HLS via PyAV (stream copy), arquiva o mp4 no MinIO
// `cctv-clips` e devolve o SHA-256 (cadeia de custódia). O modal antigo que
// gerava comando de terminal pro operador copiar foi REMOVIDO — operador
// nunca roda shell.

export interface ClipExportJob {
  id: string;
  stream_id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | string;
  duration_s: number;
  sha256: string | null;
  size_bytes?: number | null;
  error: string | null;
  /** path do backend (ex.: /api/v1/cctv/exports/{id}/download) quando done */
  download_url: string | null;
  created_at?: string | null;
}

/**
 * POST /streams/{id}/export — 202 com o job recém-criado (status queued).
 *
 * Sem `range`: o servidor grava o trecho AO VIVO (comportamento original).
 * Com `range` (modo Gravação): o backend monta o clipe COPIANDO os
 * segmentos .ts já gravados (from_ms/to_ms wall-clock, sempre juntos —
 * regra do ClipExportIn; janela máx. CCTV_REC_RANGE_EXPORT_MAX_MS).
 */
export function exportClip(
  streamId: string,
  durationS: number,
  range?: { from_ms: number; to_ms: number },
): Promise<ClipExportJob> {
  return apiFetch<ClipExportJob>(`/api/v1/cctv/streams/${streamId}/export`, {
    method: 'POST',
    body: JSON.stringify(
      range ? { duration_s: durationS, ...range } : { duration_s: durationS },
    ),
  });
}

/** GET /exports/{job_id} — status do job (queued/running/done/failed). */
export function pollExport(jobId: string): Promise<ClipExportJob> {
  return apiFetch<ClipExportJob>(`/api/v1/cctv/exports/${jobId}`);
}

/**
 * Link de download AUTENTICADO via proxy do Next (`/api/...`): o cookie
 * httpOnly viaja com o `<a href>` e o proxy injeta o Bearer — sem token em JS.
 */
export function downloadUrl(job: Pick<ClipExportJob, 'download_url'>): string | null {
  return job.download_url ? `/api${job.download_url}` : null;
}

/** §C C5 — página da lista gerida (GET /streams/page → StreamsPageOut). */
export interface CCTVStreamPage {
  items: CCTVStream[];
  total: number;
  offset: number;
  limit: number;
}

export interface CCTVStreamCreate {
  name: string;
  url: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  city?: string;
  source_type?: string;
  detection_enabled?: boolean;
  stream_metadata?: Record<string, unknown>;
  tags?: string[];
}

// ── Onda 4 — catálogo de presets por concessionária (GET /cctv/presets) ─────
//
// Substitui os presets HARDCODED do modal "Registrar câmera": o catálogo é
// DADO no backend (app/services/cctv_presets.py do ontology-module), já
// FILTRADO pelo allowed_domains do tenant (multidomínio — tenant sem
// 'rodovias' recebe []). Cada preset (menos `key`) é payload PRONTO pro
// POST /api/v1/cctv/streams (shape do CCTVStreamCreate).

/** Um preset de câmera REAL (HLS validado) — `key` estável p/ o dropdown. */
export interface CameraPreset {
  key: string;
  name: string;
  url: string;
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  source_type: string;
  detection_enabled: boolean;
  stream_metadata: Record<string, unknown>;
  tags: string[];
}

/** Grupo por concessionária/operadora — vira `<optgroup>` no modal.
 *  `domains` = tag de domínio do catálogo (vazio = neutro/todo tenant). */
export interface CameraPresetGroup {
  key: string;
  group: string;
  domains: string[];
  presets: CameraPreset[];
}

/** Tarefa A — uma classe válida do detector ativo (RF-DETR → COCO-80):
 *  `name` = canônico em inglês (o CONTRATO do modelo/job GPU — é o que viaja
 *  no CSV de input.classes); `label` = rótulo humano pt-BR (o que se vê);
 *  `category` = taxonomia operacional (slug — ADITIVO 2026-06-11; opcional
 *  p/ tolerar backend antigo). */
export interface DetectorClass {
  name: string;
  label: string;
  category?: string;
}

/** Categoria OPERACIONAL do catálogo de classes (taxonomia multidomínio).
 *  `advanced=true` = uso avançado (interiores/alimentos/pelúcia) — a UI
 *  colapsa por padrão; lista chega ORDENADA do backend (advanced no fim). */
export interface DetectorCategory {
  key: string;
  label: string;
  advanced: boolean;
}

// ── Gravação (DVR) — Sprint 4 · Onda 1 (cctv_recordings.py) ────────────────
//
// A skill camera.record copia segmentos .ts content-addressed (SHA-256) pro
// MinIO; estes endpoints são SÓ leitura:
//   GET /streams/{id}/recordings?from_ms&to_ms        → coverage da janela
//   GET /streams/{id}/recordings/playlist.m3u8?…      → playlist VOD (hls.js
//       toca com seek nativo); 404 = sem gravação no intervalo
//   GET /recordings/{sha}.ts                          → segmento (auth de
//       operador — o HlsPlayer reescreve pro proxy /api)
// Janela máxima por consulta: 24h.

export interface RecordingCoverageWindow {
  t_start_ms: number;
  t_end_ms: number;
}

export interface RecordingsCoverage {
  stream_id: string;
  from_ms: number;
  to_ms: number;
  coverage: RecordingCoverageWindow[];
  segments_count: number;
  bytes_total: number;
}

// ── Controle de gravação POR CÂMERA — Sprint 4 · Onda 2 ────────────────────
//
// Fachada fina do backend sobre o trilho de conectores (Agent worker +
// SkillBinding camera.record + cron_preset do tick genérico). O GESTO é na
// página da câmera — ligar/desligar gravação NUNCA manda o operador pra
// central técnica (cctv_recording_control.py do ontology-module):
//   GET  /streams/{id}/recording   estado (perm security.cameras.view)
//   POST /streams/{id}/recording   {action: start|stop, cadence?}
//        (perm connectors.manage — iam.governance também passa; idempotente)

/** Cadências expostas no gesto — subset curto do agendador (Literal do
 *  backend; 422 automático fora do catálogo). 2min é o default do produto. */
export const RECORDING_CADENCES = ['1min', '2min', '5min'] as const;
export type RecordingCadence = (typeof RECORDING_CADENCES)[number];
export const DEFAULT_RECORDING_CADENCE: RecordingCadence = '2min';

export interface RecordingStatus {
  active: boolean;
  cadence: string | null;
  agent_id: string | null;
  last_run_at: string | null;
  segments_24h: number;
  bytes_24h: number;
}

export type RecordingControlBody =
  | { action: 'start'; cadence: RecordingCadence }
  | { action: 'stop' };

// ── Bookmarks temporais — primitivo GENÉRICO de marcação (cctv_bookmarks.py) ─
//
// Nó canônico OntologyNode(node_type="Bookmark") com signed_hash + aresta
// MARKS_INTERVAL pro nó Camera. t_ms/t_end_ms em wall-clock epoch ms (mesmo
// eixo do detected_at e do coverage da gravação).
//   POST   /streams/{id}/bookmarks   (perm security.cameras.bookmark)
//   GET    /streams/{id}/bookmarks   ?from_ms&to_ms&limit (perm .view)
//   DELETE /bookmarks/{node_id}      (perm .bookmark) — delete REAL

export interface CameraBookmark {
  id: string;
  stream_id: string;
  camera_node_id: string | null;
  t_ms: number;
  t_end_ms: number | null;
  label: string;
  severity: 'low' | 'medium' | 'high' | string | null;
  created_by: string;
  created_at: string | null;
  signed_hash: string | null;
}

export interface CameraBookmarkCreate {
  t_ms: number;
  t_end_ms?: number;
  label: string;
  severity?: 'low' | 'medium' | 'high';
}

// ── Calibração GCP → homografia por câmera (fundação do twin) ───────────────
//
// O operador marca 4–8 pares pixel↔mapa (px/py no viewBox 1280x720 das
// detecções — o MESMO eixo dos bboxes); o backend resolve a homografia (DLT)
// e devolve o erro médio de reprojeção HONESTO em metros. Com a câmera
// calibrada, a ponte georreferencia cada detecção pelo PÉ do bbox
// (geo_source='homography') em vez do ponto fixo da câmera.
//   PUT    /streams/{id}/gcps   (perm security.cameras.manage) — calibra
//   GET    /streams/{id}/gcps   (perm security.cameras.view)   — estado
//   DELETE /streams/{id}/gcps   (perm security.cameras.manage) — descalibra

/** Par pixel(frame 1280x720) ↔ ponto no mapa (lat/lng). */
export interface GcpPair {
  px: number;
  py: number;
  lat: number;
  lng: number;
}

export interface GcpsHomography {
  matrix: number[][];
  /** Erro médio de reprojeção dos próprios GCPs, em METROS. Só é resíduo
   *  REAL com 5+ pares — vide residual_meaningful. */
  reproj_error_m: number;
  /** Nº de GCPs usados no solve (4–8). Ausente = calibração legada. */
  n_gcps?: number;
  /** false = 4 pares (mínimo matemático): a homografia interpola os
   *  próprios pontos e o erro é ~0 POR CONSTRUÇÃO — não mede a marcação.
   *  A UI mostra ±— em vez do número. */
  residual_meaningful?: boolean;
  calibrated_at: string;
  calibrated_by: string;
}

/** A partir do 5º GCP o DLT vira mínimos-quadrados e o erro é resíduo REAL. */
export const RESIDUAL_MIN_GCPS = 5;

/** O reproj_error_m desta homografia é confiável como medida de qualidade?
 *  Backend manda residual_meaningful; legado sem o campo → deriva de
 *  n_gcps/nº de pares conhecidos; sem NENHUM dado → false (±— em vez de
 *  número fingido — honestidade > maquiagem). */
export function residualMeaningful(
  h: GcpsHomography,
  nPairs?: number,
): boolean {
  if (typeof h.residual_meaningful === 'boolean') return h.residual_meaningful;
  const n = h.n_gcps ?? nPairs;
  return typeof n === 'number' && n >= RESIDUAL_MIN_GCPS;
}

export interface GcpsState {
  stream_id: string;
  gcps: GcpPair[];
  /** null = câmera descalibrada. */
  homography: GcpsHomography | null;
}

// ── Calibração de LINHA/ROI da contagem (vertical contagem de sacos) ──────
//
// O operador desenha a linha de cruzamento (2 pontos) e a área de detecção
// (polígono) no FRAME, no /cameras — coordenadas NORMALIZADAS 0..1 (o MESMO
// formato do `calibracao.json` de clipe). O backend grava em
// `properties.calibracao` do stream e o serviço `contagem-sacos` aplica
// (poll periódico — a linha desenhada entra em vigor sem reiniciar nada).
//   PUT    /streams/{id}/calibracao   (perm security.cameras.manage)
//   GET    /streams/{id}/calibracao   (perm security.cameras.view)
//   DELETE /streams/{id}/calibracao   (perm security.cameras.manage)

/** Ponto normalizado (0..1) relativo ao frame — independe da resolução. */
export type PontoNormalizado = [number, number];

export interface CalibracaoLinhaPut {
  linha: [PontoNormalizado, PontoNormalizado];
  /** 1 = A→B; -1 = B→A (o cruzamento só conta nesta direção). */
  direcao: 1 | -1;
  /** Área de detecção (polígono, ≥3 vértices, 0..1) — opcional. */
  roi?: PontoNormalizado[] | null;
  /** Confiança mínima da contagem (0..1) — opcional. */
  conf_min?: number | null;
  dist_min_px?: number | null;
  cooldown_ms?: number | null;
}

export interface CalibracaoLinha {
  status: string;
  linha: PontoNormalizado[] | null;
  direcao: number | null;
  roi: PontoNormalizado[] | null;
  conf_min: number | null;
  dist_min_px: number | null;
  cooldown_ms: number | null;
  versao: number | null;
  atualizado_em: string | null;
}

export interface CalibracaoState {
  stream_id: string;
  calibracao: CalibracaoLinha;
}

// ── Probe da AEGIS Bridge (go2rtc :1984) — "Testar na ponte" ───────────────
//
// O teste de GPU nunca alcança o 100.x do tailnet (o pod RunPod está fora) —
// quem prova a câmera da Bridge é a ILHA, contra o go2rtc do PC do cliente.
export interface BridgeProbeOut {
  ok: boolean;
  detalhe: string;
}

// ── Treinamento da contagem (D2 RunPod + D3 avaliação) ────────────────────
export interface TreinoStatus {
  modelo: {
    online: boolean;
    modo?: string;
    total?: number;
    clipe?: string | null;
    erro?: string;
  };
  provider: {
    presente: boolean;
    slug?: string;
    enabled?: boolean;
    credencial?: boolean;
    auto_endpoint?: Record<string, unknown>;
  };
  /** Chave da conta de anotação já no cofre do tenant (uma vez só). */
  credencial_dataset?: boolean;
  /** Câmeras da OPERAÇÃO (CON) e os quadros de evidência que já arquivaram —
   *  o material do treino in-domain. */
  cameras?: {
    id: string;
    nome: string;
    online: boolean;
    quadros: number;
  }[];
}

export interface TreinoPreset {
  id: string;
  nome: string;
  descricao: string;
  /** Categoria de loja (data-driven — cada vertical acrescenta a sua). */
  categoria?: string;
  tags?: string[];
  meta: { contagem_pct: string; map50: string };
  estimativa_horas: string;
  dataset: { workspace: string; projeto: string; versao: number };
  recomendado: boolean;
}

export interface TreinoPod {
  id: string;
  nome: string;
  status?: string;
  gpu?: string | null;
  cost_usd_hr?: number | null;
  uptime_s?: number | null;
  /** Real value — custo ACUMULADO (custo/h × tempo) e início do lineage. */
  custo_acumulado_usd?: number | null;
  iniciado_em?: string | null;
  /** Detalhes do run (lineage + vendor) — para qual câmera, dataset, receita. */
  camera?: string | null;
  dataset?: string | null;
  receita?: string | null;
  vcpu?: number | null;
  mem_gb?: number | null;
  disk_gb?: number | null;
  imagem?: string | null;
}

export interface TreinoIniciarBody {
  preset: 'padrao' | 'rapido' | 'preciso';
  /** Câmera de DESTINO do treino (o run fica auditado no lineage). */
  camera_id?: string | null;
  /** Dataset DA CASA (anotado) — quando vazio, usa a biblioteca pública. */
  workspace?: string | null;
  projeto?: string | null;
  versao?: number | null;
  /** 🔴 WARM-UP OBRIGATÓRIO: id do aquecimento VÁLIDO para esta configuração.
   *  O backend valida (fail-closed) — sem ele, o deep training não sobe. */
  aquecimento_id?: string | null;
}

export interface TreinoIniciado {
  pod_id: string;
  run_id?: string | null;
  aquecimento_id?: string | null;
  nome: string;
  gpu: string | null;
  provider: string;
  aviso: string;
}

// ── Warm-up Validated Training (WVT) ──────────────────────────────────────

export type AquecimentoEstado =
  | 'NONE' | 'RUNNING' | 'VALID' | 'EXPIRED' | 'INVALIDATED' | 'FAILED' | 'UNKNOWN';

export interface AquecimentoFalha {
  estagio: string;
  detalhe: string;
}

export interface WvtQualidadeComponente {
  nome: string;
  pontos: number;
  maximo: number;
  detalhe: string;
}

export interface WvtQualidade {
  nota: number;
  nivel: 'ALTA' | 'MEDIA' | 'BAIXA' | string;
  componentes: WvtQualidadeComponente[];
  frase: string;
}

export interface WvtBenchmarkLinha {
  metrica: string;
  medido: string;
  referencia: string;
  estado: 'OK' | 'ATENCAO' | 'PENDENTE' | string;
  contexto: string;
}

export interface WvtLeigo {
  titulo: string;
  paragrafos: string[];
  glossario: { termo: string; explicacao: string }[];
}

export interface AquecimentoVeredito {
  passed: boolean;
  critical_issues: number;
  falhas: AquecimentoFalha[];
  warns: AquecimentoFalha[];
  resumo: string;
  /** Nota 0–100 + componentes (linguagem para leigos e auditoria). */
  qualidade?: WvtQualidade | null;
  /** Comparação com padrões recentes de mercado (rotulados). */
  benchmark?: WvtBenchmarkLinha[] | null;
  /** Explicação em palavras simples + glossário. */
  para_leigos?: WvtLeigo | null;
}

export interface AquecimentoRun {
  id: string;
  kind: 'warmup' | 'deep' | string;
  status: string;
  config_id: string;
  preset?: string | null;
  modelo?: string | null;
  camera_id?: string | null;
  pod_id?: string | null;
  gpu?: string | null;
  provider?: string | null;
  erro?: string | null;
  note?: string;
  criado_em?: string | null;
  iniciado_em?: string | null;
  terminado_em?: string | null;
  expira_em?: string | null;
  invalidado_em?: string | null;
  invalidado_motivo?: string | null;
  progresso?: Record<string, unknown>;
  veredito?: AquecimentoVeredito | null;
  relatorio?: Record<string, unknown> | null;
}

export interface ProntidaoData {
  prontidao: {
    estado: AquecimentoEstado;
    config_id: string;
    config_id_aquecimento?: string;
    aquecimento_id: string | null;
    validado_em: string | null;
    expira_em: string | null;
    divergencias: { campo: string; aquecimento: unknown; atual: unknown }[];
    resumo?: string | null;
    detalhe?: string;
  };
  config_id: string;
  plano: Record<string, unknown>;
  fonte: {
    online: boolean;
    modo?: string | null;
    device?: string | null;
    captura: boolean;
    versao?: string | null;
    modelo_info?: Record<string, unknown> | null;
    fps_medido?: number;
    brilho?: number;
  };
  run: AquecimentoRun | null;
  artefatos: number;
}

export interface AquecimentoDetalhe extends AquecimentoRun {
  plano?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
  fonte?: Record<string, unknown>;
  artefatos?: { path: string; bytes: number; md5_etag?: string | null }[];
}

export interface AvaliarBody {
  desde?: string | null;
  ate?: string | null;
  manual: number;
}

export interface AvaliarResultado {
  eventos: number;
  manual: number;
  erro_absoluto: number;
  acuracia_pct: number;
  aceite_99_4: boolean;
}

// ── Hotlist de placas procuradas — Onda 2 (cctv_hotlist.py) ────────────────
//
// WatchedPlate = OntologyNode(node_type='WatchedPlate'), markings=['PII'] (a
// placa é PII por construção). A lista de placas procuradas é DADO da
// ontologia — primitivo GENÉRICO (mineração herda: caminhão por placa no
// pátio), zero tabela vertical. O match acontece no ramo lpr da ingestão e
// emite o alerta `lpr_hotlist`. A placa é INPUT do operador, validada no
// formato Mercosul/antigo (mesma regra do backend) antes do POST.
//   GET    /api/v1/cctv/hotlist?active_only=false   (perm security.cameras.hotlist)
//   POST   /api/v1/cctv/hotlist  {plate, reason?, severity}  → 201 (422 inválida)
//   DELETE /api/v1/cctv/hotlist/{id}  → 204 (nó + lineage); 404 inexistente

export interface WatchedPlate {
  id: string;
  plate: string;
  reason: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical' | string;
  active: boolean;
  added_by: string | null;
  hits: number;
  /** sempre ['PII'] — a placa é PII por construção. */
  markings: string[];
  created_at: string | null;
}

export interface WatchedPlateCreate {
  plate: string;
  reason?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

// Formato de placa BR — paridade EXATA com o backend
// (cctv_hotlist.normalize_and_validate): Mercosul LLLNLNN (3 letras, 1 dígito,
// 1 letra, 2 dígitos) ou antigo LLLNNNN, validado SOBRE a forma normalizada (alnum-upper, sem
// hífen/espaço). O backend é a fonte da verdade (422 honesto); esta validação
// só evita um round-trip e dá erro imediato ao operador.
const PLATE_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const PLATE_ANTIGA = /^[A-Z]{3}[0-9]{4}$/;

/** Normaliza a placa do jeito do backend: maiúscula, só alfanumérico. */
export function normalizePlate(plate: string): string {
  return Array.from(plate || '')
    .filter((ch) => /[a-zA-Z0-9]/.test(ch))
    .join('')
    .toUpperCase();
}

/** A placa (normalizada) está num formato BR válido (Mercosul ou antigo)? */
export function isValidPlate(plate: string): boolean {
  const norm = normalizePlate(plate);
  return PLATE_MERCOSUL.test(norm) || PLATE_ANTIGA.test(norm);
}

/**
 * Domínio multidomínio hospedado servível (GET /api/v1/multidomain/domains).
 * Espelha o registro do manifesto curado. `data_egress='roboflow_cloud'` +
 * `recommended_use='demo-eval'` carregam o aviso de SOBERANIA (o frame sai pra
 * nuvem externa). `is_replacement` + `coverage_note` marcam cobertura parcial.
 */
export interface MultidomainDomain {
  domain: string;
  domain_label: string;
  workspace_project: string;
  endpoint: string;
  version: string;
  type: string;
  classes: string[];
  has_hosted_model: boolean;
  license: string | null;
  commercial_ok: boolean;
  data_egress: string;
  recommended_use: string;
  metric: Record<string, unknown>;
  is_replacement: boolean;
  coverage_note: string | null;
  live_verified_at: string | null;
}

export interface MultidomainDetectIn {
  domain: string;
  /** Nome do frame arquivado (`<sha>.jpg`) — caminho robusto (backend lê o MinIO). */
  frame_object?: string;
  image_url?: string;
  image_b64?: string;
  camera_node_id?: string;
  /** id da Entity cctv_stream — backend resolve o nó Camera e geo-ancora o Event. */
  camera_stream_id?: string;
  /** SOBERANIA: opt-in explícito de egress do frame pra nuvem externa. */
  allow_cloud_egress: boolean;
}

export interface MultidomainDetectOut {
  ok: boolean;
  domain: string;
  status: number | null;
  predictions: number;
  events: string[];
  model: string;
  data_egress: string;
  recommended_use: string;
  is_replacement: boolean;
  coverage_note: string | null;
  error: string | null;
}

export const Cctv = {
  hotlist: {
    /** Lista as placas procuradas do tenant (active_only=false = todas). */
    list: (params?: { active_only?: boolean }) => {
      const qs =
        params?.active_only !== undefined
          ? `?active_only=${params.active_only}`
          : '';
      return apiFetch<WatchedPlate[]>(`/api/v1/cctv/hotlist${qs}`);
    },
    /** Adiciona (ou re-ativa) uma placa procurada. Placa fora do formato
     *  Mercosul/antigo OU severity inválida → 422 com motivo. Idempotente
     *  por placa+tenant. markings sempre ['PII']. */
    add: (body: WatchedPlateCreate) =>
      apiFetch<WatchedPlate>('/api/v1/cctv/hotlist', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    /** Remove a placa da hotlist (nó + lineage). 404 se não existir. */
    remove: (watchedId: string) =>
      apiFetch<void>(`/api/v1/cctv/hotlist/${watchedId}`, { method: 'DELETE' }),
  },
  recordings: {
    /** Janelas de gravação disponíveis na janela [from_ms, to_ms] (default
     *  do backend: últimas 24h; máx. 24h). */
    coverage: (streamId: string, fromMs?: number, toMs?: number) => {
      const qs = new URLSearchParams();
      if (fromMs !== undefined) qs.set('from_ms', String(fromMs));
      if (toMs !== undefined) qs.set('to_ms', String(toMs));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch<RecordingsCoverage>(
        `/api/v1/cctv/streams/${streamId}/recordings${suffix}`,
      );
    },
    /** URL da playlist VOD via proxy autenticado do Next — vai DIRETO no
     *  HlsPlayer (o cookie httpOnly viaja; o proxy injeta o Bearer). */
    playlistUrl: (streamId: string, fromMs: number, toMs: number) =>
      `${API_BASE}/api/v1/cctv/streams/${streamId}/recordings/playlist.m3u8?from_ms=${fromMs}&to_ms=${toMs}`,
  },
  recording: {
    /** Estado da gravação contínua (ligado/desligado, cadência, volume 24h). */
    status: (streamId: string) =>
      apiFetch<RecordingStatus>(`/api/v1/cctv/streams/${streamId}/recording`),
    /** Liga (com cadência do dropdown) ou desliga a gravação — idempotente. */
    control: (streamId: string, body: RecordingControlBody) =>
      apiFetch<RecordingStatus>(`/api/v1/cctv/streams/${streamId}/recording`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  gcps: {
    /** Estado de calibração (GCPs + homografia com o erro gravado). */
    get: (streamId: string) =>
      apiFetch<GcpsState>(`/api/v1/cctv/streams/${streamId}/gcps`),
    /** Calibra com 4–8 pares — devolve a homografia + reproj_error_m (422
     *  honesto quando os pontos são degenerados/colineares). */
    put: (streamId: string, gcps: GcpPair[]) =>
      apiFetch<GcpsState>(`/api/v1/cctv/streams/${streamId}/gcps`, {
        method: 'PUT',
        body: JSON.stringify({ gcps }),
      }),
    /** Descalibra (auditado) — detecções futuras voltam ao ponto fixo. */
    remove: (streamId: string) =>
      apiFetch<void>(`/api/v1/cctv/streams/${streamId}/gcps`, { method: 'DELETE' }),
  },
  /** Linha/ROI da contagem — desenho no /cameras (vertical CON). */
  calibracao: {
    get: (streamId: string) =>
      apiFetch<CalibracaoState>(`/api/v1/cctv/streams/${streamId}/calibracao`),
    put: (streamId: string, body: CalibracaoLinhaPut) =>
      apiFetch<CalibracaoState>(`/api/v1/cctv/streams/${streamId}/calibracao`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    remove: (streamId: string) =>
      apiFetch<void>(`/api/v1/cctv/streams/${streamId}/calibracao`, {
        method: 'DELETE',
      }),
  },
  /** Teste de câmera NA ponte (sem GPU — roda na ilha, que está no tailnet). */
  bridge: {
    probe: (host: string, name: string) =>
      apiFetch<BridgeProbeOut>(
        `/api/v1/cctv/bridge/probe?host=${encodeURIComponent(host)}&name=${encodeURIComponent(name)}`,
      ),
  },
  /** Controles de treino da contagem — receitas prontas + cofre + janela. */
  treino: {
    status: () => apiFetch<TreinoStatus>('/api/v1/contagem-treino/status'),
    presets: () =>
      apiFetch<{ presets: TreinoPreset[] }>('/api/v1/contagem-treino/presets'),
    iniciar: (body: TreinoIniciarBody) =>
      apiFetch<TreinoIniciado>(
        '/api/v1/contagem-treino/iniciar',
        { method: 'POST', body: JSON.stringify(body) },
      ),
    pods: () =>
      apiFetch<{ pods: TreinoPod[] }>('/api/v1/contagem-treino/pods'),
    progresso: () =>
      apiFetch<{ progresso: { pod_id: string; fase: string; linha: string; ts: string; atrasado: boolean }[] }>(
        '/api/v1/contagem-treino/progresso',
      ),
    encerrar: (podId: string) =>
      apiFetch<{ encerrado: string }>(
        `/api/v1/contagem-treino/encerrar?pod_id=${encodeURIComponent(podId)}`,
        { method: 'POST' },
      ),
    salvarCredencial: (chave: string) =>
      apiFetch<{ ok: boolean; local: string }>('/api/v1/contagem-treino/credencial', {
        method: 'POST',
        body: JSON.stringify({ chave }),
      }),
    avaliar: (body: AvaliarBody) =>
      apiFetch<AvaliarResultado>('/api/v1/contagem-treino/avaliar', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  /** Warm-up Validated Training — validação de prontidão antes do profundo. */
  aquecimento: {
    prontidao: (params: {
      preset: string;
      camera_id?: string | null;
      workspace?: string | null;
      projeto?: string | null;
      versao?: number | null;
    }) => {
      const qs = new URLSearchParams({ preset: params.preset });
      if (params.camera_id) qs.set('camera_id', params.camera_id);
      if (params.workspace) qs.set('workspace', params.workspace);
      if (params.projeto) qs.set('projeto', params.projeto);
      if (params.versao) qs.set('versao', String(params.versao));
      return apiFetch<ProntidaoData>(
        `/api/v1/contagem-aquecimento/prontidao?${qs.toString()}`,
      );
    },
    iniciar: (body: {
      preset: string;
      camera_id?: string | null;
      workspace?: string | null;
      projeto?: string | null;
      versao?: number | null;
      duracao_captura_s?: number;
    }) =>
      apiFetch<{
        aquecimento_id: string;
        config_id: string;
        pod_id: string;
        gpu: string;
        fonte: { captura_id?: string; avaliacao?: Record<string, unknown> };
        aviso: string;
      }>('/api/v1/contagem-aquecimento', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    lista: () =>
      apiFetch<{ runs: AquecimentoRun[] }>('/api/v1/contagem-aquecimento'),
    detalhe: (id: string) =>
      apiFetch<AquecimentoDetalhe>(`/api/v1/contagem-aquecimento/${id}`),
    nota: (id: string, texto: string) =>
      apiFetch<{ ok: boolean; nota: string }>(
        `/api/v1/contagem-aquecimento/${id}/nota`,
        { method: 'POST', body: JSON.stringify({ texto }) },
      ),
    descartar: (id: string) =>
      apiFetch<{ ok: boolean; estado: string }>(
        `/api/v1/contagem-aquecimento/${id}/descartar`,
        { method: 'POST' },
      ),
    cancelar: (id: string) =>
      apiFetch<{ ok: boolean; estado: string }>(
        `/api/v1/contagem-aquecimento/${id}/cancelar`,
        { method: 'POST' },
      ),
    /** URL do artefato preservado (imagens da galeria; cookie de sessão). */
    artefatoUrl: (id: string, caminho: string) =>
      `/api/v1/contagem-aquecimento/${id}/artifacts/${caminho
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
  },
  bookmarks: {
    list: (
      streamId: string,
      params?: { from_ms?: number; to_ms?: number; limit?: number },
    ) => {
      const qs = params
        ? new URLSearchParams(
            Object.fromEntries(
              Object.entries(params)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, String(v)]),
            ),
          ).toString()
        : '';
      return apiFetch<CameraBookmark[]>(
        `/api/v1/cctv/streams/${streamId}/bookmarks${qs ? `?${qs}` : ''}`,
      );
    },
    create: (streamId: string, body: CameraBookmarkCreate) =>
      apiFetch<CameraBookmark>(`/api/v1/cctv/streams/${streamId}/bookmarks`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    /** DELETE real (nó + arestas) — bookmark é triagem, não evidência. */
    remove: (nodeId: string) =>
      apiFetch<void>(`/api/v1/cctv/bookmarks/${nodeId}`, { method: 'DELETE' }),
  },
  /**
   * Tarefa A — TODAS as classes válidas do detector ativo, como DADO
   * (GET /cctv/detector/classes; perm security.cameras.view). Alimenta os
   * chips de "Classes de interesse" do conector camera.stream — o operador
   * nunca decora classe de cabeça.
   */
  detector: {
    classes: () =>
      apiFetch<{ classes: DetectorClass[]; categories?: DetectorCategory[] }>(
        '/api/v1/cctv/detector/classes',
      ),
  },
  /**
   * Onda 4 — catálogo de presets agrupado por concessionária, filtrado pelo
   * allowed_domains do tenant NO BACKEND (perm security.cameras.view, a mesma
   * dos GETs do bridge). Lista vazia = tenant sem presets pro seu domínio →
   * a seção nem aparece no modal.
   */
  presets: () => apiFetch<CameraPresetGroup[]>('/api/v1/cctv/presets'),
  /**
   * Últimas detecções de qualquer stream (agregado).
   * Usado pelo Início (linha do tempo + alertas) e por /cameras
   * (polling de 5s).
   */
  detections: (params?: { limit?: number; kind?: 'lpr' | 'face' | 'object'; since_minutes?: number }) => {
    const qs = params
      ? '?' +
        new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
          ),
        ).toString()
      : '';
    return apiFetch<CCTVDetection[]>(`/api/v1/cctv/detections${qs}`);
  },
  streams: {
    list: (params?: { status?: string; city?: string; detection_enabled?: boolean; limit?: number }) => {
      const qs = params
        ? '?' +
          new URLSearchParams(
            Object.fromEntries(
              Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
            ),
          ).toString()
        : '';
      return apiFetch<CCTVStream[]>(`/api/v1/cctv/streams${qs}`);
    },
    get: (id: string) => apiFetch<CCTVStream>(`/api/v1/cctv/streams/${id}`),
    create: (body: CCTVStreamCreate) =>
      apiFetch<CCTVStream>('/api/v1/cctv/streams', { method: 'POST', body: JSON.stringify(body) }),
    /** `stream_metadata` carrega o TIPO DA ANÁLISE (receita de contagem) —
     * o operador precisa poder corrigir isso DEPOIS do registro (o modal só
     * cria; em câmera existente a API responde `reusado`). */
    update: (id: string, body: Partial<Pick<CCTVStream, 'name' | 'city' | 'latitude' | 'longitude' | 'tags'>> & { detection_enabled?: boolean; stream_metadata?: Record<string, unknown> }) =>
      apiFetch<CCTVStream>(`/api/v1/cctv/streams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    detections: (id: string, limit = 50, offset = 0) =>
      apiFetch<CCTVDetection[]>(`/api/v1/cctv/streams/${id}/detections?limit=${limit}&offset=${offset}`),
    /**
     * 202 imediato — o cold-start da GPU leva minutos; acompanhe com
     * `pollDetectNow(sub)`. 409 = sem provedor RunPod habilitado no tenant.
     */
    detectNow: (id: string, opts?: DetectNowOptions) =>
      apiFetch<DetectNowSubmit>(`/api/v1/cctv/streams/${id}/detect-now`, {
        method: 'POST',
        body: JSON.stringify(opts ?? {}),
      }),
    /**
     * Tarefa D — "Testar stream" do onboarding: valida a URL na GPU ANTES de
     * salvar (job camera_url frames=1, SEM push — o vídeo nunca abre no
     * host). 202 com o mesmo contrato do detect-now; acompanhe com
     * `pollDetectNow(sub)` — COMPLETED traz `frame_size` (WxH); FAILED traz
     * `errors[0]`/`error` honesto. 409 = sem provedor RunPod no tenant.
     */
    test: (url: string) =>
      apiFetch<DetectNowSubmit>('/api/v1/cctv/streams/test', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),
  /**
   * §C C5 — lista GERIDA paginada + buscável (escala a milhares). Ao contrário
   * de `list` (operador, teto 1000, filtro em memória), aqui a busca (`q` sobre
   * nome/cidade/URL/tags), os filtros e a ORDENAÇÃO determinística rodam no
   * SERVIDOR (WHERE sobre JSONB + ORDER BY); devolve {items,total,offset,limit}
   * para o pager. Espelha StreamsPageOut de GET /api/v1/cctv/streams/page.
   */
    page: (params?: {
      offset?: number;
      limit?: number;
      q?: string;
      status?: string;
      city?: string;
      detection_enabled?: boolean;
    }) => {
      const qs = params
        ? '?' +
          new URLSearchParams(
            Object.fromEntries(
              Object.entries(params)
                .filter(([, v]) => v !== undefined && v !== '')
                .map(([k, v]) => [k, String(v)]),
            ),
          ).toString()
        : '';
      return apiFetch<CCTVStreamPage>(`/api/v1/cctv/streams/page${qs}`);
    },
    /** Remove a câmera da UI (soft-delete auditado no backend — o histórico
     *  de detecções continua no banco; a lista deixa de mostrar). */
    remove: (id: string) =>
      apiFetch<void>(`/api/v1/cctv/streams/${id}`, { method: 'DELETE' }),
    /** Quadro ATUAL da câmera para os modais de calibração — SEM GPU:
     *  snapshot do serviço (contagem) ou frame.jpeg do go2rtc (Bridge). */
    frame: (id: string) =>
      apiFetch<{ frame_url: string | null }>(`/api/v1/cctv/streams/${id}/frame`),
  },
  lpr: {
    observations: (plate: string) =>
      apiFetch<CCTVDetection[]>(`/api/v1/cctv/lpr/${encodeURIComponent(plate)}/observations`),
  },
  count: () =>
    apiFetch<{ streams_total: number; streams_online: number; detections_total: number }>(
      '/api/v1/cctv/count',
    ),
  statsByClass: (sinceMinutes = 60) =>
    apiFetch<{
      since_minutes: number;
      total: number;
      by_kind: Record<string, number>;
      by_class: Record<string, Record<string, number>>;
    }>(`/api/v1/cctv/stats/by_class?since_minutes=${sinceMinutes}`),
  entityObservations: (entityId: string, limit = 200) =>
    apiFetch<CCTVDetection[]>(
      `/api/v1/cctv/entities/${entityId}/observations?limit=${limit}`,
    ),
  entityCities: (entityId: string) =>
    apiFetch<
      Array<{
        city_entity_id: string;
        city: string;
        observation_count: number;
        first_seen_at: string | null;
        last_seen_at: string | null;
        stream_ids: string[];
      }>
    >(`/api/v1/cctv/entities/${entityId}/cities`),
  entityUpdate: (entityId: string, body: { display?: string; properties?: Record<string, unknown> }) =>
    apiFetch<{
      id: string;
      kind: string;
      display: string;
      properties: Record<string, unknown>;
    }>(`/api/v1/cctv/entities/${entityId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  cctvEntity: (entityId: string) =>
    apiFetch<{
      id: string;
      name: string;
      entity_type: string;
      properties: Record<string, unknown>;
    }>(`/api/v1/cctv/entities/${entityId}`),
  /**
   * Análise multidomínio hospedada (modelos pré-treinados Roboflow, GPU-free).
   * `domains()` lista os domínios servíveis (perm `security.cameras.view`);
   * `detect()` roda 1 domínio sobre 1 frame e grava os Events governados (perm
   * `security.cameras.cloud_inference` + opt-in `allow_cloud_egress`).
   * SOBERANIA: o frame sai pra nuvem externa — demo/eval, não câmera sensível.
   */
  multidomain: {
    domains: () =>
      apiFetch<{ domains: MultidomainDomain[] }>('/api/v1/multidomain/domains'),
    detect: (body: MultidomainDetectIn) =>
      apiFetch<MultidomainDetectOut>('/api/v1/multidomain/detect', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
};

// O fallback fabricado (streams + detecções sintéticas) foi REMOVIDO em
// 2026-06-11 (Tarefa E): dado fictício renderizava como real. Estado inicial
// agora é vazio; backend fora vira estado de ERRO honesto na UI.
