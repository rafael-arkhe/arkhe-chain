'use client';

/**
 * Hotlist de placas procuradas — Onda 2 (2026-06-15), central de Conectores.
 *
 * A hotlist é a lista de placas que disparam um alerta `lpr_hotlist` quando
 * lidas por uma câmera com LPR. É config sensível de PII (a placa é PII por
 * construção) e um primitivo GENÉRICO da plataforma — multidomínio: mineração
 * herda (caminhão por placa no pátio), zero tabela vertical. A lista é DADO da
 * ontologia (WatchedPlate = OntologyNode, markings=['PII']).
 *
 * Aqui o operador:
 *   - vê a lista (placa em fonte mono, motivo, severidade com rótulo humano,
 *     ativa/inativa, quem adicionou, acertos) — GET /cctv/hotlist;
 *   - adiciona uma placa via form com VALIDAÇÃO de formato (Mercosul ABC1D23 /
 *     antigo ABC1234 — erro honesto se inválida) — POST /cctv/hotlist;
 *   - remove uma placa (confirmModal destrutivo, NUNCA diálogo nativo) —
 *     DELETE /cctv/hotlist/{id}.
 *
 * Toda a seção é gated por `security.cameras.hotlist` (ver E gerenciar — a
 * mesma perm que o router exige). i18n via useT() (pt-BR + en-US).
 */
import * as React from 'react';
import {
  AlertCircle, ListChecks, Loader2, Plus, RefreshCw, Trash2,
} from 'lucide-react';

import { confirmModal } from '@/components/dialog/confirm-dialog';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import {
  Cctv,
  isValidPlate,
  normalizePlate,
  type WatchedPlate,
} from '@/lib/api/cctv';

// Severidades expostas no dropdown — subset fechado (Literal do backend; 422
// automático fora do catálogo). 'medium' é o default do produto.
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
type Severity = (typeof SEVERITIES)[number];

// Cor sóbria por severidade (texto) — crítico em vermelho discreto, nunca
// alarmista; mesmo vocabulário do widget de alertas.
const SEVERITY_TEXT: Record<string, string> = {
  critical: 'text-danger',
  high: 'text-warning',
  medium: 'text-muted-on-light',
  low: 'text-muted-on-light',
};

const INP =
  'w-full h-8 px-2 text-[12px] bg-white border border-border-light focus:outline-none focus:border-primary';

export function HotlistSection() {
  const t = useT();
  // Perm ÚNICA (ver E gerenciar) — sem ela a seção inteira não existe, como
  // o router exige (security.cameras.hotlist).
  const canManage = useCan('security.cameras.hotlist');

  const [rows, setRows] = React.useState<WatchedPlate[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  // Form de adicionar — placa é INPUT do operador (validado no formato).
  const [plate, setPlate] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [severity, setSeverity] = React.useState<Severity>('medium');
  const [formErr, setFormErr] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setErr(null);
    try {
      setRows(await Cctv.hotlist.list());
    } catch (e) {
      setErr((e as Error)?.message ?? '');
    }
  }, []);

  React.useEffect(() => {
    if (!canManage) return;
    void refresh();
  }, [canManage, refresh]);

  if (!canManage) return null;

  const add = async () => {
    setFormErr(null);
    // Validação de formato CLIENT-SIDE (Mercosul / antigo) — erro imediato e
    // honesto; o backend continua validando (422) como defesa em profundidade.
    if (!isValidPlate(plate)) {
      setFormErr(t('hotlist.err.invalidPlate'));
      return;
    }
    setBusy('add');
    setErr(null);
    try {
      await Cctv.hotlist.add({
        plate: normalizePlate(plate),
        reason: reason.trim() || undefined,
        severity,
      });
      setPlate('');
      setReason('');
      setSeverity('medium');
      await refresh();
    } catch (e) {
      // 422 do backend (placa/severity recusada) ou falha de rede — mensagem
      // honesta no form, nunca silêncio.
      setFormErr((e as Error)?.message ?? t('hotlist.err.addFailed'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: WatchedPlate) => {
    const ok = await confirmModal({
      title: t('hotlist.confirm.removeTitle'),
      description: t('hotlist.confirm.removeDesc').replace('{plate}', p.plate),
      confirmLabel: t('common.remove'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(`remove-${p.id}`);
    setErr(null);
    try {
      await Cctv.hotlist.remove(p.id);
      await refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? t('hotlist.error'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3" data-testid="hotlist-section">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold text-text-on-light flex items-center gap-1.5">
            <ListChecks className="w-4 h-4" strokeWidth={1.5} /> {t('hotlist.title')}
          </h2>
          <p className="text-[11px] text-muted-on-light mt-0.5">{t('hotlist.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          data-testid="hotlist-refresh"
          aria-label={t('hotlist.refresh')}
          title={t('hotlist.refresh')}
          className="h-8 px-2.5 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Form de adicionar — placa validada no formato BR (sem input técnico
          decorado: severity é dropdown populado). */}
      <div
        className="bg-canvas-light border border-border-light p-3 flex flex-wrap items-end gap-2"
        data-testid="hotlist-form"
      >
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-on-light">{t('hotlist.f.plate')}</span>
          <input
            data-testid="hotlist-plate-input"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder={t('hotlist.f.platePlaceholder')}
            maxLength={16}
            spellCheck={false}
            // mono pra DADO (placa) + sem balão nativo do browser
            className={INP + ' w-[140px] font-mono uppercase tracking-wider'}
          />
        </label>
        <label className="block space-y-1 flex-1 min-w-[160px]">
          <span className="text-[11px] text-muted-on-light">{t('hotlist.f.reason')}</span>
          <input
            data-testid="hotlist-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('hotlist.f.reasonPlaceholder')}
            maxLength={280}
            className={INP}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-on-light">{t('hotlist.f.severity')}</span>
          <select
            data-testid="hotlist-severity-input"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className={INP + ' w-[120px]'}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`alertas.severity.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy === 'add'}
          data-testid="hotlist-add"
          className="h-8 px-3 text-[12px] bg-primary text-white hover:opacity-90 flex items-center gap-1.5 disabled:opacity-60"
        >
          {busy === 'add' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          )}
          {t('hotlist.add')}
        </button>
        {formErr && (
          <p
            className="w-full text-[11px] text-danger flex items-center gap-1.5"
            role="alert"
            data-testid="hotlist-form-error"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} /> {formErr}
          </p>
        )}
      </div>

      {err !== null && (
        <div
          className="flex items-start gap-2 text-danger text-[13px]"
          role="alert"
          data-testid="hotlist-error"
        >
          <AlertCircle className="w-4 h-4 mt-0.5" strokeWidth={1.5} />{' '}
          <span>{err || t('hotlist.error')}</span>
        </div>
      )}

      <div className="border border-border-light" data-testid="hotlist-list">
        {rows === null && !err && (
          <div className="p-3 text-[12px] text-muted-on-light flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> {t('common.loading')}
          </div>
        )}
        {rows && rows.length === 0 && (
          <div
            className="p-3 text-[12px] text-muted-on-light italic"
            data-testid="hotlist-empty"
          >
            {t('hotlist.empty')}
          </div>
        )}
        {rows && rows.length > 0 && (
          <div data-testid="hotlist-rows">
            <div className="grid grid-cols-[140px_1fr_92px_84px_120px_36px] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-on-light border-b border-border-light">
              <span>{t('hotlist.col.plate')}</span>
              <span>{t('hotlist.col.reason')}</span>
              <span>{t('hotlist.col.severity')}</span>
              <span>{t('hotlist.col.state')}</span>
              <span>{t('hotlist.col.addedBy')}</span>
              <span />
            </div>
            {rows.map((p) => (
              <div
                key={p.id}
                data-testid={`hotlist-row-${p.id}`}
                className="grid grid-cols-[140px_1fr_92px_84px_120px_36px] gap-2 px-3 py-2 border-b border-border-light last:border-b-0 items-center text-[12px]"
              >
                <span
                  data-testid={`hotlist-plate-${p.id}`}
                  className="font-mono font-semibold tracking-wider text-text-on-light truncate"
                >
                  {p.plate}
                </span>
                <span className="text-muted-on-light truncate" title={p.reason || undefined}>
                  {p.reason || <span className="italic">{t('hotlist.noReason')}</span>}
                </span>
                <span
                  data-testid={`hotlist-severity-${p.id}`}
                  className={
                    'text-[11px] uppercase tracking-wide ' +
                    (SEVERITY_TEXT[p.severity] ?? 'text-muted-on-light')
                  }
                >
                  {t(`alertas.severity.${p.severity}`)}
                </span>
                <span
                  data-testid={`hotlist-active-${p.id}`}
                  className={
                    'text-[10px] uppercase tracking-wider px-1.5 py-0.5 border w-fit ' +
                    (p.active
                      ? 'border-success text-success'
                      : 'border-border-light text-muted-on-light')
                  }
                >
                  {p.active ? t('hotlist.active') : t('hotlist.inactive')}
                </span>
                <span className="font-mono text-[11px] text-muted-on-light truncate" title={p.added_by || undefined}>
                  {p.added_by || '—'}
                  {p.hits > 0 ? (
                    <span className="ml-1.5 text-muted-on-light/70">
                      · {t('hotlist.hits').replace('{n}', String(p.hits))}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(p)}
                  disabled={busy === `remove-${p.id}`}
                  data-testid={`hotlist-remove-${p.id}`}
                  aria-label={t('common.remove')}
                  title={t('common.remove')}
                  className="h-7 w-7 flex items-center justify-center border border-border-light hover:border-danger hover:text-danger shrink-0"
                >
                  {busy === `remove-${p.id}` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
