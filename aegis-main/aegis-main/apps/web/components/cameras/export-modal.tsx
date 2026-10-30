'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileVideo, Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/provider';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { formatHoraSegBR } from '@/lib/datetime';
import {
  downloadUrl,
  exportClip,
  pollExport,
  type CCTVStream,
  type ClipExportJob,
} from '@/lib/api/cctv';

type Props = {
  stream: CCTVStream;
  onClose: () => void;
  /** Modo GRAVAÇÃO: início do trecho (wall-clock ms, posição atual do
   *  player). O POST vai com from_ms/to_ms e o backend monta o clipe
   *  COPIANDO os segmentos já gravados. Ausente = export ao vivo (hoje). */
  recordingStartMs?: number | null;
};

// faixa do backend: 5..60s (ClipExportIn)
const DURATIONS = [5, 15, 30, 60];
const POLL_MS = 1500;

/**
 * Export de clipe SERVER-SIDE (Tarefa X, 2026-06-11).
 *
 * O modal antigo gerava um comando de terminal pro operador copiar e rodar
 * local — violação direta da regra "operador nunca roda shell". Agora o
 * backend remuxa o HLS via PyAV (stream copy), arquiva o mp4 no MinIO e
 * devolve o SHA-256 do clipe (cadeia de custódia). Fluxo: escolher duração →
 * Exportar → processando → Baixar clipe.
 */
export function ExportModal({ stream, onClose, recordingStartMs }: Props) {
  const t = useT();
  const [duration, setDuration] = useState(15);
  const [job, setJob] = useState<ClipExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const start = async () => {
    setBusy(true);
    setError(null);
    setJob(null);
    try {
      const range =
        recordingStartMs != null
          ? {
              from_ms: Math.round(recordingStartMs),
              to_ms: Math.round(recordingStartMs) + duration * 1000,
            }
          : undefined;
      const created = range
        ? await exportClip(stream.id, duration, range)
        : await exportClip(stream.id, duration);
      if (cancelled.current) return;
      setJob(created);
      let cur = created;
      while (cur.status === 'queued' || cur.status === 'running') {
        cur = await pollExport(created.id);
        if (cancelled.current) return;
        setJob(cur);
        if (cur.status === 'queued' || cur.status === 'running') {
          await new Promise((r) => setTimeout(r, POLL_MS));
          if (cancelled.current) return;
        }
      }
      if (cur.status === 'failed') {
        setError(cur.error || t('cameras.export.failed'));
      }
    } catch (e) {
      if (!cancelled.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (!cancelled.current) setBusy(false);
    }
  };

  const done = job?.status === 'done';
  const href = job && done ? downloadUrl(job) : null;

  return (
    <ModalPortal>
    <div
      data-testid="export-modal"
      className="fixed inset-0 z-50 flex items-center justify-center ds-overlay p-6"
      onClick={onClose}
    >
      <div
        className="bg-canvas-light text-text-on-light border border-border-light w-full max-w-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="h-10 px-3 border-b border-border-light flex items-center gap-3 bg-panel-light">
          <FileVideo className="w-3.5 h-3.5" strokeWidth={1.5} />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider flex-1">
            {t('cameras.export.title')} · {stream.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center hover:bg-raised-light"
            aria-label={t('common.close')}
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-2">
              {t('cameras.export.duration')}
            </p>
            <div className="flex gap-1">
              {DURATIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`export-dur-${s}`}
                  onClick={() => setDuration(s)}
                  disabled={busy}
                  className={
                    'h-7 px-3 text-[11px] font-mono border disabled:opacity-50 ' +
                    (duration === s
                      ? 'bg-primary text-white border-primary'
                      : 'border-border-light hover:border-primary')
                  }
                >
                  {s} s
                </button>
              ))}
            </div>
          </div>

          {recordingStartMs != null && (
            <div data-testid="export-range">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1">
                {t('cameras.export.range')}
              </p>
              <p className="text-[11px] font-mono">
                {formatHoraSegBR(new Date(recordingStartMs))} →{' '}
                {formatHoraSegBR(new Date(recordingStartMs + duration * 1000))}
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted-on-light leading-tight">
            {recordingStartMs != null
              ? t('cameras.export.hintRange')
              : t('cameras.export.hint')}
          </p>

          <button
            type="button"
            data-testid="export-start"
            onClick={start}
            disabled={busy}
            className="h-8 px-4 text-[11px] font-semibold uppercase tracking-wider bg-primary text-white hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
            {t('cameras.export.start')}
          </button>

          {busy && (
            <div
              data-testid="export-processing"
              className="flex items-center gap-2 text-[12px] text-muted-on-light"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              {t('cameras.export.processing')}
            </div>
          )}

          {error && (
            <div
              data-testid="export-error"
              className="border border-border-light bg-panel-light px-3 py-2 text-[12px] text-red-700"
            >
              {t('cameras.export.failed')}: {error}
            </div>
          )}

          {done && href && (
            <div className="border border-border-light bg-panel-light p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">
                {t('cameras.export.ready')}
              </p>
              <a
                data-testid="export-download"
                href={href}
                download
                className="inline-flex items-center gap-2 h-8 px-4 text-[11px] font-semibold uppercase tracking-wider bg-primary text-white hover:bg-primary-hover"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                {t('cameras.export.download')}
              </a>
              {job?.sha256 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1">
                    {t('cameras.export.sha')}
                  </p>
                  <p
                    data-testid="export-sha"
                    className="text-[11px] font-mono break-all select-all"
                  >
                    {job.sha256}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
