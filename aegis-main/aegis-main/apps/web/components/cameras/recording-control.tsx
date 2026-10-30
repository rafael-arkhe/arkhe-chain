'use client';

/**
 * RecordingControl — gravação contínua POR CÂMERA no header do player
 * (Sprint 4 · Onda 2). O GESTO é aqui: ligar/desligar gravação nunca manda
 * o operador pra central técnica de conectores.
 *
 * Contrato (cctv_recording_control.py do ontology-module):
 *   GET  /streams/{id}/recording  → estado (perm security.cameras.view)
 *   POST /streams/{id}/recording  {action, cadence?} (perm connectors.manage;
 *        iam.governance também passa — MESMO gate ampliado do backend)
 *
 * Invariantes de UI:
 *   - chip discreto "Gravando · <cadência>" em fonte mono quando ativo;
 *   - iniciar → confirmModal com SELETOR de cadência (dropdown com rótulo
 *     humano, default 2min — nunca input técnico livre);
 *   - parar → confirmModal; cancelar não chama POST;
 *   - sem perm do POST → botão desabilitado com title honesto;
 *   - GET/POST com falha viram estado de erro VISÍVEL (nunca silencioso);
 *   - estado pós-ação vem da RESPOSTA do POST (nunca boolean decorativo).
 */
import { useCallback, useEffect, useState } from 'react';
import { Circle, Loader2, Square } from 'lucide-react';
import {
  Cctv,
  DEFAULT_RECORDING_CADENCE,
  RECORDING_CADENCES,
  type RecordingCadence,
  type RecordingStatus,
} from '@/lib/api/cctv';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/cn';

export function RecordingControl({ streamId }: { streamId: string }) {
  const t = useT();
  // Gate do POST espelha o backend: connectors.manage OU iam.governance.
  const canManage = useCan('connectors.manage');
  const canGovern = useCan('iam.governance');
  const canControl = canManage || canGovern;

  const [status, setStatus] = useState<RecordingStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);

  // Estado real do GET — recarrega na troca de câmera e a cada 30s (o
  // conector pode ser ligado/desligado também pela central).
  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setStatusError(false);
    setActionError(false);
    const load = async () => {
      try {
        const s = await Cctv.recording.status(streamId);
        if (!cancelled) {
          setStatus(s);
          setStatusError(false);
        }
      } catch {
        if (!cancelled) {
          setStatus(null);
          setStatusError(true);
        }
      }
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [streamId]);

  const start = useCallback(async () => {
    // A cadência é capturada por CLOSURE do dropdown dentro do confirmModal —
    // catálogo fechado (Literal no backend), rótulos humanos, default 2min.
    let cadence: RecordingCadence = DEFAULT_RECORDING_CADENCE;
    const ok = await confirmModal({
      title: t('cameras.recording.startTitle'),
      description: (
        <div className="space-y-2">
          <p>{t('cameras.recording.startDesc')}</p>
          <label
            htmlFor="recording-cadence"
            className="block text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold"
          >
            {t('cameras.recording.cadence')}
          </label>
          <select
            id="recording-cadence"
            data-testid="recording-cadence"
            defaultValue={DEFAULT_RECORDING_CADENCE}
            onChange={(e) => {
              cadence = e.target.value as RecordingCadence;
            }}
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          >
            {RECORDING_CADENCES.map((c) => (
              <option key={c} value={c}>
                {t(`cameras.recording.cadence.${c}`)}
              </option>
            ))}
          </select>
        </div>
      ),
      confirmLabel: t('cameras.recording.start'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return null;
    return Cctv.recording.control(streamId, { action: 'start', cadence });
  }, [streamId, t]);

  const stop = useCallback(async () => {
    const ok = await confirmModal({
      title: t('cameras.recording.stopTitle'),
      description: t('cameras.recording.stopDesc'),
      tone: 'warning',
      confirmLabel: t('cameras.recording.stop'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return null;
    return Cctv.recording.control(streamId, { action: 'stop' });
  }, [streamId, t]);

  const toggle = useCallback(async () => {
    if (!canControl || busy || !status) return;
    setActionError(false);
    setBusy(true);
    try {
      const next = await (status.active ? stop() : start());
      // cancelado no modal → null (nada muda)
      if (next) setStatus(next);
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }, [busy, canControl, start, status, stop]);

  const active = status?.active === true;
  const loading = status === null && !statusError;
  const toggleTitle = !canControl
    ? t('cameras.recording.noPerm')
    : loading
      ? t('common.loading')
      : statusError
        ? t('cameras.recording.statusFailed')
        : active
          ? t('cameras.recording.stopTitle')
          : t('cameras.recording.startTitle');

  return (
    <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
      {active && status && (
        <span
          data-testid="recording-chip"
          title={`${t('cameras.recording.last24h')}: ${status.segments_24h} ${t('cameras.recording.segments')}`}
          className="h-7 px-2 flex items-center gap-1.5 bg-deep/85 border border-border-dark text-[10px] font-mono text-white"
        >
          <span className="w-1.5 h-1.5 bg-danger animate-pulse shrink-0" />
          {t('cameras.recording.chip')}
          {status.cadence ? ` · ${status.cadence}` : ''}
        </span>
      )}
      {statusError && (
        <span
          data-testid="recording-state-error"
          className="h-7 px-2 flex items-center bg-deep/85 border border-border-dark text-[10px] font-mono text-danger"
        >
          {t('cameras.recording.statusFailed')}
        </span>
      )}
      {actionError && (
        <span
          data-testid="recording-action-error"
          className="h-7 px-2 flex items-center bg-deep/85 border border-border-dark text-[10px] font-mono text-danger"
        >
          {t('cameras.recording.actionFailed')}
        </span>
      )}
      <button
        type="button"
        data-testid="recording-toggle"
        onClick={() => void toggle()}
        disabled={!canControl || busy || loading || statusError}
        title={toggleTitle}
        className={cn(
          'h-7 px-2 text-[10px] uppercase tracking-[0.14em] border flex items-center gap-1.5',
          'bg-deep/85 border-border-dark text-muted-on-dark hover:text-white',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          active && 'text-white border-danger',
        )}
      >
        {busy || loading ? (
          <Loader2 className="w-3 h-3 animate-spin shrink-0" strokeWidth={1.5} />
        ) : active ? (
          // gravando → a ação é PARAR (quadrado, convenção de stop)
          <Square className="w-2.5 h-2.5 shrink-0 fill-danger text-danger" strokeWidth={1.5} />
        ) : (
          // parado → a ação é GRAVAR (ponto de rec)
          <Circle className="w-2.5 h-2.5 shrink-0" strokeWidth={1.5} />
        )}
        {active ? t('cameras.recording.toggleStop') : t('cameras.recording.toggleStart')}
      </button>
    </div>
  );
}
