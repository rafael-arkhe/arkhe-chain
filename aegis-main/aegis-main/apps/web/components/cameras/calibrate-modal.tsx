'use client';

/**
 * CalibrateModal — GCP picker "Calibrar posição" da câmera (2026-06-12).
 *
 * Fundação do twin: o operador marca 4–8 pares pixel↔mapa lado-a-lado —
 * frame ATUAL da câmera à esquerda (o frame mais recente JÁ arquivado pelas
 * detecções no MinIO, via `detectionFrameUrl` — o caminho mais barato p/ 1
 * frame: zero chamada nova; sem frame → estado honesto apontando o
 * "Detectar agora") e o mapa Mapbox à direita (REUSO do MapboxMap da casa,
 * prop `onMapClick` — mesmo padrão do RegisterCameraModal).
 *
 * Pixel no viewBox 1280x720 (o MESMO eixo dos bboxes das detecções — o
 * contrato do PUT /streams/{id}/gcps). Salvar → PUT → o backend resolve a
 * homografia (DLT) e devolve o erro médio de reprojeção em metros.
 *
 * RESÍDUO HONESTO: com exatamente 4 pares o DLT é exatamente determinado —
 * a homografia interpola os próprios pontos e o erro é ~0 POR CONSTRUÇÃO
 * (não mede a marcação). Só a partir do 5º par o solve vira mínimos-
 * quadrados e o erro é resíduo REAL (residual_meaningful do backend). Por
 * isso o modal EMPURRA 5+ pontos: com 4 o veredito é NEUTRO ("calibração
 * mínima"), nunca verde; verde <2 m / alerta acima só com 5+. E a
 * homografia assume superfície PLANA — aviso fixo manda escolher pontos
 * NO CHÃO. Descalibrar passa pelo confirmModal (nunca diálogo nativo).
 * Perms: o GESTO é gated na página por `security.cameras.manage` (a perm
 * do PUT/DELETE no backend).
 */
import * as React from 'react';
import dynamic from 'next/dynamic';
import { Crosshair, X } from 'lucide-react';
import { ModalPortal } from '@/components/ui/modal-backdrop';

import {
  Cctv,
  RESIDUAL_MIN_GCPS,
  residualMeaningful,
  type CCTVStream,
  type GcpPair,
  type GcpsHomography,
} from '@/lib/api/cctv';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { useT } from '@/lib/i18n/provider';

// MapboxMap nunca carrega no SSR/jest — mesmo padrão do register-camera-modal.
const MapboxMap = dynamic(
  () => import('@/components/geo/mapbox-map').then((m) => m.MapboxMap),
  { ssr: false },
);

/** ViewBox canônico dos GCPs/bboxes das detecções (contrato do backend). */
const VIEW_W = 1280;
const VIEW_H = 720;
const MIN_PAIRS = 4;
const MAX_PAIRS = 8;
/** Veredito honesto: abaixo disto a calibração é boa (verde). */
const GOOD_ERROR_M = 2;

const BR_CENTER = { lat: -15.78, lng: -47.93 };

export interface CalibrateModalProps {
  stream: CCTVStream;
  /** Frame mais recente arquivado da câmera (detectionFrameUrl) — null =
   *  sem frame ainda (estado honesto + dica do "Detectar agora"). */
  frameUrl: string | null;
  onClose: () => void;
  /** Notifica a página (selo "Posição calibrada") após salvar/descalibrar. */
  onChanged?: () => void;
}

export function CalibrateModal({ stream, frameUrl, onClose, onChanged }: CalibrateModalProps) {
  const t = useT();
  const [pairs, setPairs] = React.useState<GcpPair[]>([]);
  const [pending, setPending] = React.useState<{ px: number; py: number } | null>(null);
  // pending em REF pro callback do mapa (registrado uma vez no MapboxMap):
  // nunca setState dentro de outro updater (double-invoke do modo dev).
  const pendingRef = React.useRef<{ px: number; py: number } | null>(null);
  const [current, setCurrent] = React.useState<GcpsHomography | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<GcpsHomography | null>(null);

  // Estado atual de calibração: pares existentes pré-carregados (revisão/
  // recalibração) + homografia vigente (selo + descalibrar).
  React.useEffect(() => {
    let cancelled = false;
    Cctv.gcps
      .get(stream.id)
      .then((g) => {
        if (cancelled) return;
        setCurrent(g.homography);
        if (g.gcps.length) setPairs(g.gcps);
      })
      .catch(() => {
        // leitura falhou — segue descalibrada na UI (o PUT continua possível)
      });
    return () => {
      cancelled = true;
    };
  }, [stream.id]);

  const onFrameClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pairs.length >= MAX_PAIRS) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = Math.round(((e.clientX - rect.left) / rect.width) * VIEW_W * 10) / 10;
    const py = Math.round(((e.clientY - rect.top) / rect.height) * VIEW_H * 10) / 10;
    const point = {
      px: Math.min(VIEW_W, Math.max(0, px)),
      py: Math.min(VIEW_H, Math.max(0, py)),
    };
    pendingRef.current = point;
    setPending(point);
  };

  const onMapClick = React.useCallback((lat: number, lng: number) => {
    const p = pendingRef.current;
    if (!p) return; // o par começa SEMPRE pelo frame
    pendingRef.current = null;
    setPending(null);
    setPairs((prev) =>
      prev.length >= MAX_PAIRS ? prev : [...prev, { px: p.px, py: p.py, lat, lng }],
    );
  }, []);

  const removePair = (i: number) => {
    setPairs((prev) => prev.filter((_, idx) => idx !== i));
    setResult(null);
  };

  const save = async () => {
    if (pairs.length < MIN_PAIRS || pairs.length > MAX_PAIRS || busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const out = await Cctv.gcps.put(stream.id, pairs);
      setResult(out.homography);
      setCurrent(out.homography);
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const decalibrate = async () => {
    const ok = await confirmModal({
      title: t('cameras.calibrateRemove'),
      description: t('cameras.calibrateRemoveConfirm'),
      tone: 'danger',
      confirmLabel: t('common.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await Cctv.gcps.remove(stream.id);
      setCurrent(null);
      setResult(null);
      setPairs([]);
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const missing = Math.max(0, MIN_PAIRS - pairs.length);
  const canSave = pairs.length >= MIN_PAIRS && pairs.length <= MAX_PAIRS && !busy;
  const saveTitle = canSave
    ? t('cameras.calibrateSave')
    : t('cameras.calibrateNeedPairs').replace('{n}', String(missing));
  const center =
    stream.latitude != null && stream.longitude != null
      ? { lat: stream.latitude, lng: stream.longitude }
      : BR_CENTER;

  return (
    <ModalPortal>
    <div
      data-testid="calibrate-modal"
      className="fixed inset-0 z-50 ds-overlay flex items-center justify-center p-4"
    >
      <div className="bg-white text-text-on-light border border-border-light w-full max-w-[1100px] max-h-[92vh] overflow-y-auto flex flex-col">
        <div className="h-10 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light shrink-0">
          <Crosshair className="w-3.5 h-3.5" strokeWidth={1.5} />
          <p className="text-[11px] uppercase tracking-[0.14em] font-semibold flex-1 truncate">
            {t('cameras.calibrateTitle')} · {stream.name}
          </p>
          <button
            type="button"
            data-testid="calibrate-close"
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-6 h-6 flex items-center justify-center border border-border-light hover:border-primary"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3">
          <p className="text-[11px] text-muted-on-light">{t('cameras.calibrateIntro')}</p>

          {/* Aviso fixo: a homografia assume PLANO — pontos no chão */}
          <p
            data-testid="calibrate-plane-notice"
            className="text-[10px] text-muted-on-light border-l-2 border-warning/70 pl-2"
          >
            {t('cameras.calibratePlaneNotice')}
          </p>

          {current && (
            <div
              data-testid="calibrate-current"
              className="px-2 py-1.5 border border-border-light bg-raised-light flex items-center gap-2 text-[10px] font-mono"
            >
              <span className="flex-1 truncate">
                {t('cameras.calibrateCurrent')
                  .replace('{user}', current.calibrated_by)
                  .replace(
                    '{m}',
                    // 4 pontos = resíduo não mensurável → ±—, nunca ±0.0
                    residualMeaningful(current)
                      ? current.reproj_error_m.toFixed(1)
                      : '—',
                  )}
              </span>
              <button
                type="button"
                data-testid="calibrate-remove"
                onClick={() => void decalibrate()}
                disabled={busy}
                className="h-6 px-2 text-[10px] border border-border-light hover:border-danger hover:text-danger disabled:opacity-50"
              >
                {t('cameras.calibrateRemove')}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Frame ATUAL — pixel no viewBox 1280x720 (eixo dos bboxes) */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">
                {t('cameras.calibrateFramePane')}
              </p>
              {frameUrl ? (
                <div
                  data-testid="calibrate-frame"
                  onClick={onFrameClick}
                  className="relative aspect-video bg-black cursor-crosshair border border-border-light overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={frameUrl}
                    alt={t('cameras.calibrateFramePane')}
                    className="absolute inset-0 w-full h-full object-fill select-none"
                    draggable={false}
                  />
                  <svg
                    viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    {pairs.map((p, i) => (
                      <g key={`p-${i}`}>
                        <circle cx={p.px} cy={p.py} r={10} fill="#2D77BE" stroke="#fff" strokeWidth={2} />
                        <text
                          x={p.px}
                          y={p.py + 4}
                          textAnchor="middle"
                          fontSize={11}
                          fontFamily="JetBrains Mono, monospace"
                          fill="#fff"
                        >
                          {i + 1}
                        </text>
                      </g>
                    ))}
                    {pending && (
                      <circle
                        cx={pending.px}
                        cy={pending.py}
                        r={10}
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth={3}
                      />
                    )}
                  </svg>
                </div>
              ) : (
                <div
                  data-testid="calibrate-no-frame"
                  className="aspect-video border border-border-light bg-raised-light flex items-center justify-center p-4"
                >
                  <p className="text-[11px] text-muted-on-light text-center max-w-[360px]">
                    {t('cameras.calibrateNoFrame')}
                  </p>
                </div>
              )}
            </div>

            {/* Mapa — o MESMO ponto no mundo */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">
                {t('cameras.calibrateMapPane')}
              </p>
              <div className="relative aspect-video border border-border-light overflow-hidden">
                <MapboxMap
                  className="absolute inset-0"
                  center={center}
                  zoom={17}
                  view="satellite"
                  markers={pairs.map((p, i) => ({ id: `gcp-${i}`, lat: p.lat, lng: p.lng }))}
                  onMapClick={onMapClick}
                />
              </div>
            </div>
          </div>

          {/* Passo atual — sempre honesto sobre o que falta */}
          <p data-testid="calibrate-step" className="text-[11px] font-mono text-muted-on-light">
            {pairs.length >= MAX_PAIRS
              ? t('cameras.calibrateMaxPairs')
              : pending
                ? t('cameras.calibrateClickMap')
                : t('cameras.calibrateClickFrame')}
            {' · '}
            {t('cameras.calibratePairs')} {pairs.length}/{MAX_PAIRS}
            {/* empurra o 5º ponto: com 4 o erro não é mensurável */}
            {pairs.length >= MIN_PAIRS && pairs.length < RESIDUAL_MIN_GCPS && (
              <> {' · '}{t('cameras.calibratePushFifth')}</>
            )}
          </p>

          {/* Lista de pares com remoção */}
          {pairs.length > 0 && (
            <div className="flex flex-col gap-1">
              {pairs.map((p, i) => (
                <div
                  key={`${p.px}-${p.py}-${i}`}
                  data-testid={`calibrate-pair-${i}`}
                  className="h-7 px-2 border border-border-light bg-raised-light flex items-center gap-2 text-[10px] font-mono"
                >
                  <span className="w-5 text-muted-on-light shrink-0">#{i + 1}</span>
                  <span className="truncate flex-1">
                    px {p.px.toFixed(0)},{p.py.toFixed(0)} → {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                  </span>
                  <button
                    type="button"
                    data-testid={`calibrate-pair-remove-${i}`}
                    onClick={() => removePair(i)}
                    aria-label={t('common.remove')}
                    className="w-5 h-5 flex items-center justify-center border border-border-light hover:border-danger hover:text-danger shrink-0"
                  >
                    <X className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {err && (
            <p data-testid="calibrate-error" className="text-[11px] text-danger">
              {t('cameras.calibrateError')}: {err}
            </p>
          )}
          {result &&
            (residualMeaningful(result) ? (
              <p
                data-testid="calibrate-verdict"
                className={`text-[11px] font-mono ${
                  result.reproj_error_m < GOOD_ERROR_M ? 'text-success' : 'text-warning'
                }`}
              >
                {t(
                  result.reproj_error_m < GOOD_ERROR_M
                    ? 'cameras.calibrateVerdictGood'
                    : 'cameras.calibrateVerdictBad',
                ).replace('{m}', result.reproj_error_m.toFixed(1))}
              </p>
            ) : (
              // 4 pontos: o erro ~0 é interpolação exata, não qualidade —
              // estado NEUTRO honesto, nunca verde, nunca número.
              <p
                data-testid="calibrate-verdict"
                className="text-[11px] font-mono text-muted-on-light"
              >
                {t('cameras.calibrateVerdictMinimal')}
              </p>
            ))}

          <div className="flex items-center justify-end gap-2 border-t border-border-light pt-3">
            <button
              type="button"
              data-testid="calibrate-cancel"
              onClick={onClose}
              className="h-7 px-3 text-[11px] border border-border-light hover:border-primary"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              data-testid="calibrate-save"
              onClick={() => void save()}
              disabled={!canSave}
              title={saveTitle}
              className="h-7 px-3 text-[11px] bg-primary text-white border border-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('cameras.calibrateSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
