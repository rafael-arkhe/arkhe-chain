'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Plus, ScanSearch, Video, X } from 'lucide-react';
import {
  Cctv,
  pollDetectNow,
  type CameraPreset,
  type CameraPresetGroup,
  type CCTVStream,
  type CCTVStreamCreate,
} from '@/lib/api/cctv';
import { Edge, type EdgeDiscoveredCamera, type EdgeDiscoveredGroup } from '@/lib/api';
import { carregarConfig } from '@/lib/config/runtime';
import { formatDataBR, formatHoraBR } from '@/lib/datetime';
import { useT } from '@/lib/i18n/provider';
import { ModalPortal } from '@/components/ui/modal-backdrop';

type Props = {
  onClose: () => void;
  onCreated: (stream: CCTVStream) => void;
};

/**
 * Onda 2.1 — Registrar câmera pela UI (preenche o gap: não havia tela de
 * cadastro; a alternativa era curl, que viola "operador nunca roda shell").
 * POST /api/v1/cctv/streams (perm security.cameras.manage). Ao registrar, a
 * página /cameras sai do modo demo e passa a mostrar a câmera real.
 *
 * Onda 4 (2026-06-12) — onboarding completo, single-scroll:
 *  1. presets DINÂMICOS de GET /api/v1/cctv/presets (dropdown agrupado por
 *     concessionária; o filtro multidomínio por allowed_domains é do BACKEND
 *     — zero preset hardcodado aqui);
 *  2. "Descobertas na rede local" de GET /api/v1/edge/discovered — clicar
 *     pré-preenche url=suggested_url + nome sugerido "Câmera <ip>";
 *  3. picker de localização (MapboxMap da casa via next/dynamic ssr:false):
 *     clique seta lat/lng + reverse geocoding BEST-EFFORT da cidade (falha
 *     silenciosa mantém o campo manual).
 */

// MapboxMap nunca carrega no SSR/jest — mesmo padrão de map-live.tsx.
const MapboxMap = dynamic(
  () => import('@/components/geo/mapbox-map').then((m) => m.MapboxMap),
  { ssr: false },
);

// Par 3D do picker (paridade dual-surface): CesiumPoints da casa, MESMO
// contrato onMapClick(lat, lng). Também client-only (WebGL) → ssr:false.
const CesiumPoints = dynamic(
  () => import('@/components/geo/cesium-points').then((m) => m.CesiumPoints),
  { ssr: false },
);

// Centro neutro (Brasil) quando o form ainda não tem lat/lng — mesmo fallback
// de deriveCenter do widget map-live (multidomínio: nada de cidade default).
const BR_CENTER = { lat: -15.78, lng: -47.93 };

/**
 * Reverse geocoding BEST-EFFORT (Mapbox Geocoding API; token de runtime).
 * Qualquer falha (sem token, rede, resposta vazia) → null, SILENCIOSO — o
 * campo cidade continua manual. Formato "Cidade/UF" quando a região vem com
 * short_code (BR-SP), senão só o nome do lugar.
 */
export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  const { mapboxToken: token } = await carregarConfig();
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place&limit=1&language=pt-BR&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { text?: string; context?: { id?: string; short_code?: string }[] }[];
    };
    const f = data?.features?.[0];
    if (!f?.text) return null;
    const region = Array.isArray(f.context)
      ? f.context.find((c) => typeof c?.id === 'string' && c.id.startsWith('region'))
      : undefined;
    const uf =
      typeof region?.short_code === 'string' && region.short_code.includes('-')
        ? region.short_code.split('-')[1].toUpperCase()
        : null;
    return uf ? `${f.text}/${uf}` : f.text;
  } catch {
    return null;
  }
}

// Tarefa D — "Testar stream": estado do probe assíncrono (job GPU camera_url
// frames=1, sem push; mesmo padrão de poll/boot do "Detectar agora").
type StreamTestState =
  | { phase: 'submitting'; startedAt: number }
  | { phase: 'booting' | 'running'; startedAt: number; noCapacity: boolean }
  | { phase: 'ok'; startedAt: number; size: string | null }
  | { phase: 'error'; startedAt: number; msg: string };

export function RegisterCameraModal({ onClose, onCreated }: Props) {
  const t = useT();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [city, setCity] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [tags, setTags] = useState('');
  const [detectionEnabled, setDetectionEnabled] = useState(true);
  // Tipo de ANÁLISE da câmera — define as tags que o /cameras usa para
  // equilibrar a toolbar (CON não caça placa; OCR não desenha linha etc.).
  const [tipo, setTipo] = useState<'lpr' | 'ocr' | 'con' | 'con-demo' | ''>('');
  // Fonte do vídeo: câmera IP/catálogo (default) ou AEGIS Bridge (GUI/.exe
  // no PC do cliente — go2rtc publica rtsp://<ip-tailnet>:8554/<nome>).
  const [fonte, setFonte] = useState<'ip' | 'bridge'>('ip');
  const [bridgeHost, setBridgeHost] = useState('');
  const [bridgeName, setBridgeName] = useState('');
  // Herdados do preset (sem campo visível): viajam no POST enquanto a URL for
  // a do preset; editar a URL manualmente descarta (coerência — outra câmera).
  const [country, setCountry] = useState('');
  const [streamMetadata, setStreamMetadata] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // A URL JÁ estava registrada (upsert por canonical) — NUNCA fecha o modal
  // fingindo sucesso: mostra a câmera existente e deixa o operador decidir.
  const [reusado, setReusado] = useState<CCTVStream | null>(null);
  // Câmera que JÁ existia e teve o TIPO DA ANÁLISE reaplicado por este modal.
  const [tipoReaplicado, setTipoReaplicado] = useState<string | null>(null);

  // Onda 4 — catálogo dinâmico (null = carregando; [] = vazio/erro → seção some).
  const [presetGroups, setPresetGroups] = useState<CameraPresetGroup[] | null>(null);
  const [presetKey, setPresetKey] = useState('');
  // Onda 4 — descobertas do edge (null = carregando).
  const [discovered, setDiscovered] = useState<EdgeDiscoveredGroup[] | null>(null);
  const [discoveredErr, setDiscoveredErr] = useState(false);

  useEffect(() => {
    let alive = true;
    Cctv.presets()
      .then((g) => { if (alive) setPresetGroups(g); })
      .catch(() => { if (alive) setPresetGroups([]); });
    Edge.discovered()
      .then((g) => { if (alive) setDiscovered(g); })
      .catch(() => {
        if (alive) { setDiscovered([]); setDiscoveredErr(true); }
      });
    return () => { alive = false; };
  }, []);

  // "Testar stream" — o operador valida a URL ANTES de salvar. O teste RODA
  // NA GPU (regra: vídeo nunca abre no host): POST /streams/test → 202 →
  // polla o job mostrando o boot (cold-start leva minutos; sem timeout curto).
  const [streamTest, setStreamTest] = useState<StreamTestState | null>(null);
  const testRef = useRef(false);
  const testBusy =
    streamTest !== null &&
    ['submitting', 'booting', 'running'].includes(streamTest.phase);

  // "Testar na ponte" (fonte AEGIS Bridge): a GPU NUNCA alcança o 100.x do
  // tailnet — quem prova a câmera é a ILHA, contra o go2rtc da ponte (:1984).
  const [ponteTest, setPonteTest] = useState<
    { status: 'busy' } | { status: 'ok' | 'erro'; detalhe: string } | null
  >(null);
  const runPonteTest = async () => {
    if (!bridgeHost.trim() || !bridgeName.trim() || ponteTest?.status === 'busy') return;
    setPonteTest({ status: 'busy' });
    try {
      const out = await Cctv.bridge.probe(bridgeHost.trim(), bridgeName.trim());
      setPonteTest(
        out.ok
          ? { status: 'ok', detalhe: out.detalhe }
          : { status: 'erro', detalhe: out.detalhe },
      );
    } catch (e) {
      setPonteTest({
        status: 'erro',
        detalhe: (e as Error)?.message || String(e),
      });
    }
  };
  const runStreamTest = async () => {
    if (!url.trim() || testRef.current) return;
    testRef.current = true;
    const t0 = Date.now();
    setStreamTest({ phase: 'submitting', startedAt: t0 });
    try {
      const sub = await Cctv.streams.test(url.trim());
      setStreamTest({ phase: 'booting', startedAt: t0, noCapacity: false });
      // cap de segurança ~25min (375 × 4s) — igual ao detect-now de /cameras
      for (let i = 0; i < 375; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await pollDetectNow(sub);
        if (st.status === 'COMPLETED') {
          const fs = st.frame_size;
          const size =
            Array.isArray(fs) && fs.length === 2 ? `${fs[0]}×${fs[1]}` : null;
          setStreamTest({ phase: 'ok', startedAt: t0, size });
          return;
        }
        if (st.status === 'EXPIRED' || st.status === 'PROVIDER_ERROR') {
          const base =
            st.status === 'EXPIRED'
              ? t('cameras.detectExpired')
              : t('cameras.detectProviderError');
          setStreamTest({
            phase: 'error',
            startedAt: t0,
            msg: st.error ? `${base} (${st.error})` : base,
          });
          return;
        }
        if (st.status === 'FAILED' || st.status === 'CANCELLED' || st.status === 'TIMED_OUT') {
          // erro honesto do job: errors[0] do handler > error do vendor > status
          setStreamTest({
            phase: 'error',
            startedAt: t0,
            msg: st.errors?.[0] || st.error || st.status,
          });
          return;
        }
        const w = st.workers;
        const noCapacity =
          st.status === 'IN_QUEUE' &&
          !!w &&
          (w.throttled ?? 0) > 0 &&
          (w.ready ?? 0) + (w.initializing ?? 0) + (w.running ?? 0) === 0;
        setStreamTest({
          phase: st.status === 'IN_PROGRESS' ? 'running' : 'booting',
          startedAt: t0,
          noCapacity,
        });
      }
      setStreamTest({ phase: 'error', startedAt: t0, msg: '25min' });
    } catch (e) {
      setStreamTest({
        phase: 'error',
        startedAt: t0,
        msg: (e as Error)?.message || t('cameras.streamTestFailed'),
      });
    } finally {
      testRef.current = false;
    }
  };

  // Elapsed em WALL-CLOCK (mesmo padrão do detect-now): o ticker só força
  // re-render; o valor exibido é sempre Date.now() - startedAt.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!testBusy) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [testBusy]);
  const testElapsed = streamTest
    ? Math.max(0, Math.round((nowTick - streamTest.startedAt) / 1000))
    : 0;

  const applyPreset = (p: CameraPreset) => {
    setName(p.name); setUrl(p.url);
    setCity(p.city ?? ''); setLat(String(p.latitude ?? '')); setLng(String(p.longitude ?? ''));
    setSourceType(p.source_type ?? ''); setTags((p.tags ?? []).join(', '));
    setDetectionEnabled(p.detection_enabled ?? true);
    setCountry(p.country ?? '');
    setStreamMetadata(
      p.stream_metadata && Object.keys(p.stream_metadata).length ? p.stream_metadata : null,
    );
    // preset do catálogo = fonte IP; limpa escolha de tipo/bridge anterior
    setTipo('');
    setFonte('ip');
    setBridgeHost('');
    setBridgeName('');
  };

  const onPresetChange = (key: string) => {
    setPresetKey(key);
    const p = (presetGroups ?? [])
      .flatMap((g) => g.presets)
      .find((x) => x.key === key);
    if (p) applyPreset(p);
  };

  // URL digitada à mão = OUTRA câmera → descarta herdados do preset.
  const onUrlEdit = (value: string) => {
    setUrl(value);
    setPresetKey('');
    setCountry('');
    setStreamMetadata(null);
  };

  // Tag canônica de cada tipo de análise (o MESMO vocabulário que o badge
  // do /cameras e o filtro da toolbar leem). `con-demo` = contagem de
  // objetos/aleatórios para TESTES DEMONSTRATIVOS: mesmas tags do CON
  // (atrás do CON não há dado publicado — o serviço lê `contagem-sacos`).
  const TAG_POR_TIPO: Record<string, string> = {
    lpr: 'lpr-ready',
    ocr: 'ocr',
    con: 'bc-ready',
    'con-demo': 'bc-ready',
  };

  const onTipoChange = (next: 'lpr' | 'ocr' | 'con' | 'con-demo' | '') => {
    setTipo(next);
    setTags((prev) => {
      const anteriores = prev
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter(
          (tg) =>
            !Object.values(TAG_POR_TIPO).includes(tg) &&
            tg !== 'contagem-sacos',
        );
      if (!next) return anteriores.join(', ');
      return [
        ...anteriores,
        TAG_POR_TIPO[next],
        ...(next.startsWith('con') ? ['contagem-sacos'] : []),
      ].join(', ');
    });
    if (next.startsWith('con') && !sourceType.trim()) setSourceType('contagem-sacos');
  };

  // Fonte = AEGIS Bridge: a URL é MONTADA (rtsp://<ip>:8554/<nome>) e os
  // herdados (source_type/metadata/tag) são da ponte — o operador só informa
  // o IP do nó no tailnet e o nome dado à câmera na Bridge.
  const aplicaBridge = (h: string, n: string) => {
    setBridgeHost(h);
    setBridgeName(n);
    if (h.trim()) {
      setUrl(`rtsp://${h.trim()}:8554/${encodeURIComponent(n.trim().replace(/\s+/g, '_'))}`);
    }
    setSourceType('aegis-bridge');
    setStreamMetadata({ source: 'aegis-bridge' });
    setTags((prev) => {
      const anteriores = prev
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((tg) => tg !== 'aegis-bridge');
      return [...anteriores, 'aegis-bridge'].join(', ');
    });
  };

  const applyDiscovered = (cam: EdgeDiscoveredCamera) => {
    setUrl(cam.suggested_url);
    setName(`${t('cameras.discoveredName')} ${cam.ip}`);
    // descoberta = câmera própria da rede, nunca herda extras de preset
    setPresetKey('');
    setCountry('');
    setStreamMetadata(null);
  };

  // Picker de mapa: clique seta lat/lng; cidade via geocoding best-effort.
  // MESMO handler nas duas superfícies (2D Mapbox e 3D Cesium) — o contrato
  // onMapClick(lat, lng) é idêntico por design (paridade dual-surface).
  const onMapClick = (la: number, ln: number) => {
    setLat(String(Number(la.toFixed(5))));
    setLng(String(Number(ln.toFixed(5))));
    void reverseGeocodeCity(la, ln).then((c) => { if (c) setCity(c); });
  };

  // Alternância discreta 2D (analítico, default) ↔ 3D (globo Cesium).
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d');

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const hasCoords =
    lat.trim() !== '' && lng.trim() !== '' &&
    Number.isFinite(latNum) && Number.isFinite(lngNum);

  const submit = async () => {
    if (!name.trim() || !url.trim()) return;
    setBusy(true); setErr(null); setReusado(null);
    try {
      // CON: a receita do COMPUTE viaja no stream_metadata.contagem — o
      // provisionador da ilha lê e sobe a instância sozinho (registrar =
      // contar; sem edição manual de compose). `con` usa o modelo de sacos;
      // `con-demo` o modelinho COCO leve (garrafa/copo/celular/pessoa).
      const contagemReceita =
        tipo === 'con-demo'
          ? { modelo: 'coco', classes: [0, 39, 40, 41, 45, 46, 47, 67],
              rotulo: 'OBJETOS', conf_min: 0.25 }
          : tipo === 'con'
            ? { modelo: 'sacos' }
            : null;
      const meta = { ...(streamMetadata ?? {}) };
      if (contagemReceita) {
        meta.contagem = { ...((meta as Record<string, unknown>).contagem as object ?? {}), ...contagemReceita };
      }
      const body: CCTVStreamCreate = {
        name: name.trim(), url: url.trim(),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(lat.trim() ? { latitude: Number(lat) } : {}),
        ...(lng.trim() ? { longitude: Number(lng) } : {}),
        ...(country.trim() ? { country: country.trim() } : {}),
        ...(sourceType.trim() ? { source_type: sourceType.trim() } : {}),
        ...(Object.keys(meta).length ? { stream_metadata: meta } : {}),
        detection_enabled: detectionEnabled,
        tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const created = await Cctv.streams.create(body);
      if (created.reusado) {
        // 🔴 Câmera JÁ registrada: o POST é upsert e devolve a linha antiga.
        // A escolha do TIPO DA ANÁLISE tem que valer AQUI TAMBÉM — antes o
        // operador escolhia o tipo no modal, o registro existente era reusado
        // e a receita antiga ficava para sempre, sem nenhum caminho de UI
        // para corrigir (medido 12/09/2026: câmera registrada sem receita e
        // operador sem como mudar). Agora a escolha é aplicada no registro
        // existente e o worker recria sozinho em ≤30 s.
        // A PATCH vale para QUALQUER tipo escolhido (LPR/OCR/CON) — as tags
        // canônicas já são derivadas do tipo no `onTipoChange`, então reenviar
        // a lista é o que faz a escolha pegar em câmera que já existia.
        const listaTags = tags.split(',').map((s) => s.trim()).filter(Boolean);
        const patch: Parameters<typeof Cctv.streams.update>[1] = {
          ...(listaTags.length ? { tags: listaTags } : {}),
          ...(Object.keys(meta).length ? { stream_metadata: meta } : {}),
        };
        if (Object.keys(patch).length) {
          const vivo = await Cctv.streams.update(created.id, patch);
          setReusado(vivo);
          setTipoReaplicado(tipo);
          return;
        }
        setReusado(created);
        return;
      }
      onCreated(created);
    } catch (e) {
      setErr((e as Error)?.message ?? 'falha');
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">{label}</span>
      {node}
    </label>
  );
  const heading = (label: string) => (
    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1.5">{label}</p>
  );
  const inputCls = 'mt-1 w-full h-8 px-2 text-[12px] font-mono bg-canvas-light border border-border-light focus:border-primary outline-none';

  const discoveredFlat = (discovered ?? []).flatMap((g) =>
    g.cameras.map((cam) => ({ edge: g, cam })),
  );

  return (
    <ModalPortal>
    <div
      data-testid="register-camera-modal"
      className="fixed inset-0 z-50 flex items-center justify-center ds-overlay p-6"
      onClick={onClose}
    >
      <div className="[color-scheme:light] bg-canvas-light text-text-on-light border border-border-light w-full max-w-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="h-10 px-3 border-b border-border-light flex items-center gap-3 bg-panel-light">
          <Video className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider flex-1">{t('cameras.registerTitle')}</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center hover:bg-raised-light" aria-label={t('common.close')}>
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto scrollbar-hide">
          {/* Onda 4 — catálogo dinâmico agrupado por concessionária. Vazio
              (tenant sem presets pro domínio) ou erro → seção nem aparece. */}
          {presetGroups !== null && presetGroups.some((g) => g.presets.length > 0) && (
            <div>
              {heading(t('cameras.presets'))}
              <select
                data-testid="preset-select"
                className={inputCls}
                value={presetKey}
                onChange={(e) => onPresetChange(e.target.value)}
              >
                <option value="">{t('cameras.presetPlaceholder')}</option>
                {presetGroups.map((g) => (
                  <optgroup key={g.key} label={g.group}>
                    {g.presets.map((p) => (
                      <option key={p.key} value={p.key}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {/* Onda 4 — câmeras descobertas pelo AEGIS Edge na rede local.
              Só renderiza com itens; erro vira aviso honesto (uma linha). */}
          {discoveredErr && (
            <p className="text-[11px] text-danger" data-testid="discovered-error">
              {t('cameras.discoveredError')}
            </p>
          )}
          {discoveredFlat.length > 0 && (
            <div data-testid="discovered-section">
              {heading(t('cameras.discoveredTitle'))}
              <div className="flex flex-col gap-1">
                {discoveredFlat.map(({ edge, cam }) => (
                  <button
                    key={`${edge.edge_id}-${cam.ip}-${cam.port}`}
                    type="button"
                    data-testid={`discovered-${cam.ip}-${cam.port}`}
                    onClick={() => applyDiscovered(cam)}
                    className="h-7 px-2 text-[11px] text-left border border-border-light hover:border-primary text-text-on-light flex items-center gap-2 min-w-0"
                  >
                    <span className="font-mono shrink-0">{cam.ip}:{cam.port}</span>
                    <span className="shrink-0 text-muted-on-light">
                      {cam.source === 'onvif' ? t('cameras.sourceOnvif') : t('cameras.sourceRtspPort')}
                    </span>
                    {edge.edge_name && (
                      <span className="truncate text-muted-on-light">{edge.edge_name}</span>
                    )}
                    {cam.last_seen && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-on-light font-mono">
                        {t('cameras.discoveredSeen')} {formatDataBR(cam.last_seen)} {formatHoraBR(cam.last_seen)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {field(t('cameras.fieldName'), <input data-testid="reg-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="SP-123 · Tamoios · KM 26" />)}

          {/* Tipo de análise — a tag que a UI usa para equilibrar a toolbar
              (hotlist só em LPR, linha de contagem só em CON etc.). */}
          <div className="grid grid-cols-2 gap-2">
            {field(t('cameras.tipoTitle'), (
              <select
                data-testid="reg-tipo"
                className={inputCls}
                value={tipo}
                onChange={(e) =>
                  onTipoChange(
                    e.target.value as 'lpr' | 'ocr' | 'con' | 'con-demo' | '',
                  )
                }
              >
                <option value="">{t('cameras.tipoFree')}</option>
                <option value="lpr">{t('cameras.tipoLpr')}</option>
                <option value="ocr">{t('cameras.tipoOcr')}</option>
                <option value="con">{t('cameras.tipoCon')}</option>
                <option value="con-demo">{t('cameras.tipoConDemo')}</option>
              </select>
            ))}
            {field(t('cameras.fonteTitle'), (
              <select
                data-testid="reg-fonte"
                className={inputCls}
                value={fonte}
                onChange={(e) => {
                  const next = e.target.value as 'ip' | 'bridge';
                  setFonte(next);
                  if (next === 'bridge') aplicaBridge(bridgeHost, bridgeName);
                }}
              >
                <option value="ip">{t('cameras.fonteIp')}</option>
                <option value="bridge">{t('cameras.fonteBridge')}</option>
              </select>
            ))}
          </div>
          {tipo.startsWith('con') && (
            <p className="text-[10px] text-muted-on-light -mt-1">{t('cameras.tipoConHint')}</p>
          )}
          {tipo === 'con-demo' && (
            <p className="text-[10px] text-warning -mt-1">{t('cameras.tipoConDemoHint')}</p>
          )}
          {tipo === 'ocr' && (
            <p className="text-[10px] text-muted-on-light -mt-1">{t('cameras.tipoOcrHint')}</p>
          )}
          <div className="flex items-end gap-1.5">
            <div className="flex-1 min-w-0">
              {field(t('cameras.fieldUrl'), <input data-testid="reg-url" className={inputCls} value={url} onChange={(e) => onUrlEdit(e.target.value)} placeholder="https://…/stream.m3u8  ·  rtsp://…" />)}
            </div>
            <button
              type="button"
              data-testid="testar-stream"
              onClick={runStreamTest}
              disabled={!url.trim() || testBusy}
              title={t('provedores.testBootHint')}
              className="h-8 px-2.5 text-[11px] border border-border-light hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0 whitespace-nowrap"
            >
              {testBusy ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : <ScanSearch className="w-3 h-3" strokeWidth={1.5} />}
              {t('cameras.testStream')}
            </button>
          </div>
          <p className="text-[10px] text-muted-on-light -mt-1">{t('cameras.urlHint')}</p>

          {fonte === 'bridge' ? (
            <div
              data-testid="reg-bridge-box"
              className="border border-border-light bg-raised-light/40 p-2.5 space-y-2"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">
                {t('cameras.bridgeTitle')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {field(t('cameras.bridgeHost'), <input data-testid="reg-bridge-host" className={inputCls} value={bridgeHost} onChange={(e) => aplicaBridge(e.target.value, bridgeName)} placeholder="100.67.168.26" />)}
                {field(t('cameras.bridgeName'), <input data-testid="reg-bridge-name" className={inputCls} value={bridgeName} onChange={(e) => aplicaBridge(bridgeHost, e.target.value)} placeholder="Linha 1" />)}
              </div>
              <p className="text-[10px] text-muted-on-light">{t('cameras.bridgeHint')}</p>
              <button
                type="button"
                data-testid="testar-ponte"
                onClick={() => void runPonteTest()}
                disabled={!bridgeHost.trim() || !bridgeName.trim() || ponteTest?.status === 'busy'}
                title={t('cameras.bridgeTestTitle')}
                className="h-7 px-2.5 text-[11px] border border-border-light hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {ponteTest?.status === 'busy'
                  ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                  : <ScanSearch className="w-3 h-3" strokeWidth={1.5} />}
                {t('cameras.bridgeTest')}
              </button>
              {ponteTest && ponteTest.status === 'ok' && (
                <p
                  data-testid="ponte-test-ok"
                  className="text-[11px] font-mono text-success"
                >
                  {t('cameras.bridgeTestOk')} · {ponteTest.detalhe}
                </p>
              )}
              {ponteTest && ponteTest.status === 'erro' && (
                <p
                  data-testid="ponte-test-erro"
                  className="text-[11px] text-danger"
                >
                  {t('cameras.bridgeTestFail')} · {ponteTest.detalhe}
                </p>
              )}
            </div>
          ) : null}

          {streamTest && (
            <div
              data-testid="stream-test-status"
              className="px-2 py-1.5 border border-border-light bg-raised-light flex items-center gap-2 text-[11px] font-mono"
            >
              <ScanSearch className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
              {streamTest.phase === 'submitting' && (
                <span>{t('cameras.streamTestSubmitting')}</span>
              )}
              {streamTest.phase === 'booting' && streamTest.noCapacity && (
                <span className="text-warning truncate" title={t('provedores.testBootHint')}>
                  {t('cameras.gpuSemCapacidade')} · {testElapsed}s
                </span>
              )}
              {streamTest.phase === 'booting' && !streamTest.noCapacity && (
                <span title={t('provedores.testBootHint')}>
                  {t('provedores.testBooting')} · {testElapsed}s
                </span>
              )}
              {streamTest.phase === 'running' && (
                <span>
                  {t('provedores.testRunning')} · {testElapsed}s
                </span>
              )}
              {streamTest.phase === 'ok' && (
                <span className="text-success truncate" data-testid="stream-test-ok">
                  {t('cameras.streamOk')}
                  {streamTest.size ? ` · ${streamTest.size}` : ''}
                </span>
              )}
              {streamTest.phase === 'error' && (
                <span className="text-danger truncate" data-testid="stream-test-error">
                  {t('cameras.streamTestFailed')} · {streamTest.msg}
                </span>
              )}
            </div>
          )}

          {/* Onda 4 — picker de localização (superfícies da casa; cantos retos,
              altura contida no scroll). Clique → lat/lng + cidade best-effort;
              editar lat/lng nos inputs move o ponto (estado é a fonte).
              Paridade dual-surface: 2D (MapboxMap, default analítico) ↔ 3D
              (CesiumPoints) — MESMO contrato onMapClick nas duas. */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">
                {t('cameras.mapTitle')}
              </p>
              <div className="flex">
                {([
                  ['2d', t('cameras.map2d')],
                  ['3d', t('cameras.map3d')],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`map-mode-${mode}`}
                    onClick={() => setMapMode(mode)}
                    className={`h-6 px-2 text-[10px] uppercase tracking-wider border ${
                      mapMode === mode
                        ? 'bg-primary text-white border-primary'
                        : 'border-border-light text-muted-on-light hover:border-primary'
                    } ${mode === '3d' ? 'border-l-0' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[280px] border border-border-light" data-testid="map-picker">
              {mapMode === '3d' ? (
                <CesiumPoints
                  points={hasCoords ? [{ id: 'camera', lat: latNum, lng: lngNum, color: '#2D77BE' }] : []}
                  onMapClick={onMapClick}
                  className="w-full h-full"
                />
              ) : (
                <MapboxMap
                  center={hasCoords ? { lat: latNum, lng: lngNum } : BR_CENTER}
                  zoom={hasCoords ? 12 : 3.2}
                  markers={hasCoords ? [{ id: 'camera', lat: latNum, lng: lngNum, color: '#2D77BE' }] : []}
                  onMapClick={onMapClick}
                  className="w-full h-full"
                />
              )}
            </div>
            <p className="text-[10px] text-muted-on-light mt-1">{t('cameras.mapHint')}</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {field(t('cameras.fieldCity'), <input data-testid="reg-city" className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />)}
            {field(t('cameras.fieldLat'), <input data-testid="reg-lat" className={inputCls} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />)}
            {field(t('cameras.fieldLng'), <input data-testid="reg-lng" className={inputCls} value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {field(t('cameras.fieldSource'), <input data-testid="reg-source" className={inputCls} value={sourceType} onChange={(e) => setSourceType(e.target.value)} placeholder="rodovia-sp" />)}
            {field(t('cameras.fieldTags'), <input data-testid="reg-tags" className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="rodovia, lpr-ready" />)}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-text-on-light">
            <input type="checkbox" checked={detectionEnabled} onChange={(e) => setDetectionEnabled(e.target.checked)} />
            {t('cameras.detectionEnabled')}
          </label>

          {reusado && tipoReaplicado && (
            <div
              data-testid="reg-tipo-aplicado"
              className="px-2 py-1.5 border border-success bg-success/10 text-[11px] text-success"
            >
              {t('cameras.tipoReaplicado')
                .replace('{n}', reusado.name)
                .replace('{t}', t(tipoReaplicado === 'con-demo' ? 'cameras.tipoConDemo' : tipoReaplicado === 'con' ? 'cameras.tipoCon' : tipoReaplicado === 'ocr' ? 'cameras.tipoOcr' : 'cameras.tipoLpr'))}
            </div>
          )}

          {reusado && !tipoReaplicado && (
            <div
              data-testid="reg-reusado"
              className="px-2 py-1.5 border border-warning bg-warning/10 text-[11px] text-warning"
            >
              {t('cameras.reusadoMsg').replace('{n}', reusado.name)}
            </div>
          )}

          {err && <p className="text-[11px] text-danger" data-testid="reg-error">{err}</p>}
        </div>

        <footer className="h-12 px-3 border-t border-border-light flex items-center justify-end gap-2 bg-panel-light">
          <button type="button" onClick={onClose} className="h-7 px-3 text-[11px] border border-border-light hover:border-primary">{t('common.cancel')}</button>
          {reusado ? (
            <button
              type="button"
              onClick={onClose}
              data-testid="reg-fechar-reusado"
              className="h-7 px-3 text-[11px] bg-primary text-white border border-primary hover:opacity-90 flex items-center gap-1.5"
            >
              {t('common.close')}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={busy || !name.trim() || !url.trim()}
              data-testid="reg-submit"
              className="h-7 px-3 text-[11px] bg-primary text-white border border-primary disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : <Plus className="w-3 h-3" strokeWidth={1.5} />}
              {t('cameras.register')}
            </button>
          )}
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}
