'use client';

/**
 * MultidomainModal — "Análise multidomínio (nuvem externa)" da câmera (2026-06-16).
 *
 * Roda um modelo PRÉ-TREINADO hospedado (Roboflow serverless, GPU-free) sobre o
 * último quadro JÁ arquivado desta câmera (mesmo `frame_object` que a calibração
 * usa — `detectionFrameObject`, zero chamada nova; sem quadro → estado honesto
 * apontando o "Detectar agora"). O backend LÊ os bytes do acervo (MinIO) e faz
 * POST-bytes ao serverless — caminho robusto (o GET por URL externa do Roboflow
 * não fetcha o host do túnel). Cada predição vira um Event governado na ontologia.
 *
 * SOBERANIA (régua dura): a inferência hospedada MANDA O QUADRO pra nuvem externa
 * (egress). É opt-in EXPLÍCITO por request (checkbox; submit travado até marcar)
 * + gated na página pela perm `security.cameras.cloud_inference` (fora do bundle
 * default). É uso DEMO/AVALIAÇÃO — câmera sensível de produção usa o on-prem.
 *
 * Honestidade: status/contagem são os REAIS do backend; 0 detecções (status 200)
 * é dito com todas as letras, nada fabricado. Sem diálogo nativo (toast + modal).
 */
import * as React from 'react';
import { Cloud, Loader2, X } from 'lucide-react';

import { Cctv, type MultidomainDomain } from '@/lib/api/cctv';
import { useT } from '@/lib/i18n/provider';
import { toast } from '@/components/ui/toast';
import { ModalPortal } from '@/components/ui/modal-backdrop';

export interface MultidomainModalProps {
  streamName: string;
  /** id da Entity cctv_stream — o backend resolve o nó Camera e geo-ancora o Event. */
  streamId: string;
  /** `<sha>.jpg` do último quadro arquivado, ou null se não há quadro. */
  frameObject: string | null;
  onClose: () => void;
  /** chamado após uma análise OK (a página pode recarregar as detecções). */
  onDone?: () => void;
}

type RunState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; predictions: number; events: number }
  | { phase: 'error'; message: string };

export function MultidomainModal({ streamName, streamId, frameObject, onClose, onDone }: MultidomainModalProps) {
  const t = useT();
  const [domains, setDomains] = React.useState<MultidomainDomain[] | null>(null);
  const [selected, setSelected] = React.useState<string>('');
  const [optIn, setOptIn] = React.useState(false);
  const [run, setRun] = React.useState<RunState>({ phase: 'idle' });

  React.useEffect(() => {
    let alive = true;
    Cctv.multidomain
      .domains()
      .then((r) => {
        if (!alive) return;
        const ds = r.domains ?? [];
        setDomains(ds);
        if (ds.length) setSelected(ds[0].domain);
      })
      .catch(() => alive && setDomains([]));
    return () => {
      alive = false;
    };
  }, []);

  const current = domains?.find((d) => d.domain === selected) ?? null;
  const canRun = !!frameObject && !!current && optIn && run.phase !== 'running';

  async function handleRun() {
    if (!frameObject || !current) return;
    setRun({ phase: 'running' });
    try {
      const out = await Cctv.multidomain.detect({
        domain: current.domain,
        frame_object: frameObject,
        camera_stream_id: streamId,
        allow_cloud_egress: true,
      });
      if (!out.ok) {
        const msg = out.error || t('cameras.multidomainError');
        setRun({ phase: 'error', message: msg });
        toast.error(msg);
        return;
      }
      setRun({ phase: 'done', predictions: out.predictions, events: out.events.length });
      if (out.predictions > 0) {
        toast.success(`${out.events.length} ${t('cameras.multidomainDone')}`);
        onDone?.();
      } else {
        toast(t('cameras.multidomainEmpty'));
      }
    } catch {
      const msg = t('cameras.multidomainError');
      setRun({ phase: 'error', message: msg });
      toast.error(msg);
    }
  }

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="multidomain-modal"
      className="fixed inset-0 z-50 ds-overlay flex items-center justify-center p-4"
    >
      <div className="bg-white text-text-on-light border border-border-light w-full max-w-[560px] max-h-[92vh] overflow-y-auto flex flex-col">
        {/* header */}
        <div className="h-10 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light shrink-0">
          <Cloud className="w-4 h-4 text-foreground" strokeWidth={1.5} />
          <span className="text-[12px] font-medium flex-1 truncate">
            {t('cameras.multidomainTitle')}
          </span>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center border border-border-light hover:border-primary"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3">
          <p className="text-[11px] text-muted-on-light">{t('cameras.multidomainIntro')}</p>
          <div className="text-[10px] font-mono text-muted-on-light truncate">{streamName}</div>

          {/* sem quadro arquivado → estado honesto */}
          {!frameObject && (
            <div
              data-testid="multidomain-noframe"
              className="text-[11px] text-muted-on-light border-l-2 border-warning/70 pl-2"
            >
              {t('cameras.multidomainNoFrame')}
            </div>
          )}

          {/* domínio */}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-on-light">
              {t('cameras.multidomainDomain')}
            </span>
            {domains === null ? (
              <span className="text-[11px] text-muted-on-light">{t('cameras.multidomainLoading')}</span>
            ) : domains.length === 0 ? (
              <span className="text-[11px] text-muted-on-light">{t('cameras.multidomainNoDomains')}</span>
            ) : (
              <select
                data-testid="multidomain-domain"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="h-8 px-2 text-[12px] border border-border-light bg-white focus:border-primary outline-none"
              >
                {domains.map((d) => (
                  <option key={d.domain} value={d.domain}>
                    {d.domain_label}
                  </option>
                ))}
              </select>
            )}
          </label>

          {/* metadados honestos do domínio selecionado */}
          {current && (
            <div className="text-[10px] font-mono text-muted-on-light flex flex-col gap-0.5 border border-border-light bg-raised-light p-2">
              <div>
                {t('cameras.multidomainClasses')}: {current.classes.join(', ') || '—'}
              </div>
              <div>{current.recommended_use} · {current.license || '—'}</div>
              {current.is_replacement && current.coverage_note && (
                <div className="text-warning">
                  {t('cameras.multidomainCoverage')}: {current.coverage_note}
                </div>
              )}
            </div>
          )}

          {/* SOBERANIA: aviso + opt-in explícito */}
          <div className="text-[11px] text-muted-on-light border-l-2 border-warning/70 pl-2">
            {t('cameras.multidomainEgressWarn')}
          </div>
          <label className="flex items-start gap-2 text-[11px] cursor-pointer select-none">
            <input
              data-testid="multidomain-optin"
              type="checkbox"
              checked={optIn}
              onChange={(e) => setOptIn(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t('cameras.multidomainEgressOptIn')}</span>
          </label>

          {/* resultado honesto */}
          {run.phase === 'done' && (
            <div data-testid="multidomain-result" className="text-[11px] font-mono">
              {run.predictions > 0
                ? `${run.predictions} → ${run.events} ${t('cameras.multidomainDone')}`
                : t('cameras.multidomainEmpty')}
            </div>
          )}
          {run.phase === 'error' && (
            <div data-testid="multidomain-error" className="text-[11px] font-mono text-danger">
              {run.message}
            </div>
          )}

          {/* ações */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-[11px] border border-border-light hover:border-primary"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              data-testid="multidomain-run"
              onClick={handleRun}
              disabled={!canRun}
              className="h-8 px-3 text-[11px] bg-primary text-white border border-primary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {run.phase === 'running' ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                  {t('cameras.multidomainRunning')}
                </>
              ) : (
                <>
                  <Cloud className="w-3 h-3" strokeWidth={1.5} />
                  {t('cameras.multidomainRun')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
