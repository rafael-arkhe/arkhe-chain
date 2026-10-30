/**
 * Cliente do intel-module (segurança pública usa o módulo CCTV/LPR).
 * Os caminhos refletem 1:1 src/api/cctv.py no intel-module.
 * Mount: app.include_router(cctv.router, prefix="/api/v1/cctv", ...)
 *
 * Variável de ambiente:
 *   NEXT_PUBLIC_INTEL_API_URL=http://intel.tenant:8002
 *
 * Quando o módulo está em outro host (PC com GPU rodando compose.gpu.yaml),
 * basta apontar essa env para esse host.
 */

const INTEL_BASE =
  process.env.NEXT_PUBLIC_INTEL_API_URL || 'http://localhost:8002';

async function intelFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${INTEL_BASE}/api/v1/cctv${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
    ...init,
  });
  if (!res.ok) throw new Error(`intel ${res.status}: ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface CCTVStream {
  id: number;
  name: string;
  url: string;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  city: string | null;
  status: 'online' | 'offline' | string;
  source_type: string | null;
  detection_enabled: boolean;
  stream_metadata: Record<string, unknown> | null;
  tags: string[] | null;
  thumbnail_url: string | null;
}

export interface CCTVDetection {
  id: number;
  stream_id: number;
  detected_at: string;
  kind: string;
  label: string;
  confidence: number;
  bbox: [number, number, number, number] | null;
  metadata: Record<string, unknown> | null;
}

export interface CCTVStreamCreate {
  name: string;
  url: string;
  latitude: number;
  longitude: number;
  country?: string;
  city?: string;
  source_type?: string;
  detection_enabled?: boolean;
  stream_metadata?: Record<string, unknown>;
  tags?: string[];
}

export const Intel = {
  cctv: {
    streams: (params?: { status?: string; country?: string; city?: string; detection_enabled?: boolean }) => {
      const qs = params
        ? '?' +
          new URLSearchParams(
            Object.fromEntries(
              Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
            ),
          ).toString()
        : '';
      return intelFetch<CCTVStream[]>(`/streams${qs}`);
    },
    stream: (id: number) => intelFetch<CCTVStream>(`/streams/${id}`),
    create: (body: CCTVStreamCreate) =>
      intelFetch<CCTVStream>('/streams', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: { detection_enabled?: boolean; name?: string; city?: string }) =>
      intelFetch<CCTVStream | null>(`/streams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: number) => intelFetch<void>(`/streams/${id}`, { method: 'DELETE' }),
    detections: (id: number, limit = 50) =>
      intelFetch<CCTVDetection[]>(`/streams/${id}/detections?limit=${limit}`),
    count: () => intelFetch<{ total: number; online: number }>('/count'),
  },
};

/**
 * Fallback offline usado quando o intel-module não está respondendo.
 * As 2 câmeras são reais e estão ao vivo no host
 * `https://34.104.32.249.nip.io/SP{XXX}-KM{XXX}{A|B}/stream.m3u8`
 * (HLS público validado em 2026-05-17).
 *
 * - id=1 — SP-055 · Rodovia Rio-Santos · KM 110 · Sentido A (Bertioga/SP)
 * - id=2 — SP-123 · Rodovia dos Tamoios · KM 26 · Sentido B (Caraguatatuba/SP)
 *
 * Operador adiciona outras câmeras no padrão SP-XXX-KMXXX{A|B} pelo
 * Custom no StreamSwitcher ou inicia webcam USB local via
 * `POST /api/v1/cctv/webcam`.
 */
export const FALLBACK_INTEL_STREAMS: CCTVStream[] = [
  {
    id: 1,
    name: 'SP-055 · Rio-Santos · KM 110 · Sentido A (Bertioga)',
    url: 'https://34.104.32.249.nip.io/SP055-KM110A/stream.m3u8',
    latitude: -23.8525,
    longitude: -45.9885,
    country: 'BR',
    city: 'Bertioga/SP',
    status: 'online',
    source_type: 'rodovia-sp',
    detection_enabled: true,
    stream_metadata: { rodovia: 'SP-055', nome: 'Padre Manoel da Nóbrega (Rio-Santos)', km: 110, sentido: 'A' },
    tags: ['rodovia', 'sp-055', 'rio-santos', 'lpr-ready', 'litoral'],
    thumbnail_url: null,
  },
  {
    id: 2,
    name: 'SP-123 · Tamoios · KM 26 · Sentido B (Litoral → Capital)',
    url: 'https://34.104.32.249.nip.io/SP123-KM026B/stream.m3u8',
    latitude: -23.5215,
    longitude: -45.7679,
    country: 'BR',
    city: 'Caraguatatuba/SP',
    status: 'online',
    source_type: 'concessionaria-tamoios',
    detection_enabled: true,
    stream_metadata: { rodovia: 'SP-123', concessionaria: 'Tamoios', km: 26, sentido: 'B' },
    tags: ['rodovia', 'sp-123', 'tamoios', 'lpr-ready'],
    thumbnail_url: null,
  },
];

