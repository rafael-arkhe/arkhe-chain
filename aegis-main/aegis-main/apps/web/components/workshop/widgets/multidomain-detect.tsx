'use client';

/**
 * Multidomain Detect — widget de AÇÃO de detecção multidomínio hospedada
 * (Roboflow serverless, GPU-free) — 2026-06-17.
 *
 * Versão componível do gesto que existe como modal hardcoded na /cameras: roda
 * um modelo PRÉ-TREINADO hospedado sobre um quadro arquivado e escreve Events
 * governados na ontologia. Como widget, é dropável em QUALQUER superfície do
 * Workshop (ficha de câmera, dashboard, /m/{token}) — régua "TUDO é widget
 * genérico". O modal da /cameras permanece (ADD, nunca depreciar).
 *
 * SOBERANIA (régua dura): a inferência hospedada MANDA O QUADRO pra nuvem
 * externa (egress). O opt-in é EXPLÍCITO por execução (checkbox em runtime,
 * NUNCA um default de config) + gated no backend pela perm
 * `security.cameras.cloud_inference`. Uso DEMO/AVALIAÇÃO.
 *
 * Config (Inspetor):
 *   - domain?: string            domínio fixo (vazio = o operador escolhe em runtime)
 *   - camera_stream_ref?: var    variável com o id da Entity cctv_stream (geo-âncora)
 *   - frame_object_ref?: var     variável com o `<sha>.jpg` do quadro a analisar
 *   - label?: string             rótulo do botão
 *   - result_target?: var        grava os ids dos Events criados nesta variável
 *
 * Emite: `multidomain.detect.success` / `multidomain.detect.error`.
 * Honestidade: status/contagem REAIS; 0 detecções (200) é dito; nada fabricado.
 */
import * as React from 'react';
import { Cloud, Loader2 } from 'lucide-react';

import { Cctv, type MultidomainDomain } from '@/lib/api/cctv';
import { useT } from '@/lib/i18n/provider';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  domain?: string;
  camera_stream_ref?: string;
  frame_object_ref?: string;
  label?: string;
  result_target?: string;
};

function resolveRef(ref: string | undefined, variables: Record<string, unknown>): string {
  if (ref && ref in variables) {
    const v = variables[ref];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

export function MultidomainDetect({ config, variables, setBinding, emit }: WidgetRenderProps) {
  const t = useT();
  const cfg = (config ?? {}) as Cfg;
  const vars = variables ?? {};
  const frameObject = resolveRef(cfg.frame_object_ref, vars);
  const cameraStreamId = resolveRef(cfg.camera_stream_ref, vars);

  const [domains, setDomains] = React.useState<MultidomainDomain[] | null>(null);
  const [selected, setSelected] = React.useState<string>(cfg.domain?.trim() ?? '');
  const [optIn, setOptIn] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const domainFixed = !!cfg.domain?.trim();

  React.useEffect(() => {
    let alive = true;
    Cctv.multidomain
      .domains()
      .then((r) => {
        if (!alive) return;
        const ds = r.domains ?? [];
        setDomains(ds);
        if (!domainFixed && ds.length && !selected) setSelected(ds[0].domain);
      })
      .catch(() => alive && setDomains([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = (domains ?? []).find((d) => d.domain === selected) ?? null;
  const canRun = !!frameObject && !!selected && optIn && !busy;

  async function handleRun() {
    if (!frameObject || !selected) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const out = await Cctv.multidomain.detect({
        domain: selected,
        frame_object: frameObject,
        camera_stream_id: cameraStreamId || undefined,
        allow_cloud_egress: true,
      });
      if (!out.ok) {
        const msg = out.error || t('cameras.multidomainError');
        setError(msg);
        emit?.('multidomain.detect.error', { domain: selected, reason: out.error });
        return;
      }
      if (cfg.result_target) setBinding(cfg.result_target, out.events);
      setResult(
        out.predictions > 0
          ? `${out.predictions} → ${out.events.length} ${t('cameras.multidomainDone')}`
          : t('cameras.multidomainEmpty'),
      );
      emit?.('multidomain.detect.success', {
        domain: selected,
        predictions: out.predictions,
        events: out.events,
      });
    } catch {
      setError(t('cameras.multidomainError'));
      emit?.('multidomain.detect.error', { domain: selected });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="border border-border-light bg-white p-3 flex flex-col gap-2"
      data-testid="multidomain-detect-widget"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium">
        <Cloud className="w-3.5 h-3.5 text-foreground" strokeWidth={1.5} />
        {cfg.label || t('cameras.multidomainTitle')}
      </div>

      {!frameObject && (
        <div
          data-testid="multidomain-detect-noframe"
          className="text-[10px] text-muted-on-light border-l-2 border-warning/70 pl-2"
        >
          {t('cameras.multidomainNoFrame')}
        </div>
      )}

      {/* domínio: fixo (config) ou dropdown em runtime */}
      {!domainFixed && (
        domains === null ? (
          <span className="text-[10px] text-muted-on-light">{t('cameras.multidomainLoading')}</span>
        ) : domains.length === 0 ? (
          <span className="text-[10px] text-muted-on-light">{t('cameras.multidomainNoDomains')}</span>
        ) : (
          <select
            data-testid="multidomain-detect-domain"
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
        )
      )}
      {current && (
        <div className="text-[10px] font-mono text-muted-on-light">
          {(current.classes || []).join(', ') || '—'} · {current.recommended_use}
        </div>
      )}

      {/* SOBERANIA: aviso + opt-in explícito por execução */}
      <div className="text-[10px] text-muted-on-light border-l-2 border-warning/70 pl-2">
        {t('cameras.multidomainEgressWarn')}
      </div>
      <label className="flex items-start gap-2 text-[10px] cursor-pointer select-none">
        <input
          data-testid="multidomain-detect-optin"
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          className="mt-0.5"
        />
        <span>{t('cameras.multidomainEgressOptIn')}</span>
      </label>

      {result && (
        <div data-testid="multidomain-detect-result" className="text-[10px] font-mono">
          {result}
        </div>
      )}
      {error && (
        <div data-testid="multidomain-detect-error" className="text-[10px] font-mono text-danger">
          {error}
        </div>
      )}

      <button
        type="button"
        data-testid="multidomain-detect-run"
        onClick={handleRun}
        disabled={!canRun}
        className="h-8 px-3 text-[11px] bg-primary text-white border border-primary flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? (
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
  );
}

registerWidget('multidomain_detect', MultidomainDetect, {
  group: 'data',
  label: 'Análise multidomínio (nuvem externa)',
  description:
    'Roda um modelo pré-treinado hospedado (acidente, EPI, fogo, cheia, arma, aglomeração) sobre um quadro arquivado e escreve Events governados. Egress externo opt-in por execução; uso demo/avaliação.',
  icon: 'cloud',
  defaultColSpan: 4,
  mockConfig: { label: 'Análise multidomínio' },
  mockVariables: { frame_object: 'demo.jpg', camera_stream_id: 'cam-demo' },
  previewWidth: 320,
  previewHeight: 220,
  config_schema: [
    {
      name: 'domain',
      label: 'Domínio (vazio = operador escolhe em runtime)',
      field: 'select',
      options: [
        { value: '', label: 'Operador escolhe em runtime' },
        { value: 'acidente_transito_colisao', label: 'Acidente de trânsito / colisão' },
        { value: 'arma_de_fogo_faca', label: 'Arma de fogo / faca' },
        { value: 'epi_capacete_colete', label: 'EPI / capacete / colete' },
        { value: 'fogo_fumaca', label: 'Fogo / fumaça' },
        { value: 'cheia_alagamento', label: 'Cheia / alagamento' },
        { value: 'aglomeracao_crowd', label: 'Aglomeração' },
      ],
      default: '',
    },
    { name: 'frame_object_ref', label: 'Variável com o quadro (<sha>.jpg)', field: 'variable-ref' },
    { name: 'camera_stream_ref', label: 'Variável com o id da câmera (geo-âncora)', field: 'variable-ref' },
    { name: 'label', label: 'Rótulo', field: 'string', placeholder: 'Análise multidomínio' },
    { name: 'result_target', label: 'Gravar ids dos Events na variável', field: 'variable-ref' },
  ],
});
