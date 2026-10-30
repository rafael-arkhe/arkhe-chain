'use client';

/**
 * ConfigureDialog — configuração POR SCHEMA de uma capacidade (skill).
 *
 * Extraído de conectores-workspace.tsx para ser COMPARTILHADO pelas duas
 * superfícies que configuram pelo `param_schema` declarado:
 *   - "Configurar" do CONECTOR (central de Conexões);
 *   - "Configurar" do DISPOSITIVO (Dispositivos — estação de mensageria,
 *     ponte AutoSync), que traz o mesmo trilho governado.
 *
 * Apresentacional puro: quem chama carrega o schema (catálogo de skills), a
 * config atual (binding do agente) e faz o submit pela ACTION GOVERNADA
 * (aegis.connector.configure) — clamp + re-espelho + auditoria de graça.
 *
 * Régua: dialog REAL (ModalPortal + useDialogA11y; NUNCA diálogo nativo),
 * cantos retos, sombra só porque FLUTUA, #2D77BE único acento, useT() no
 * chamador.
 */
import * as React from 'react';
import { AlertCircle, AlertTriangle, Loader2, SlidersHorizontal, X } from 'lucide-react';

import { useDialogA11y } from '@/components/dialog/use-dialog-a11y';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { SchemaForm } from '@/components/ui/schema-form';
import type { SkillParam } from '@/lib/api';

export function ConfigureDialog({
  t, name, skillName, schema, values, loading, busy, error, warnings,
  onChange, onCancel, onSubmit,
  // Os testids do conector são contrato de teste desde a Tarefa H — ficam de
  // default; o dispositivo passa o seu próprio prefixo.
  testidPrefix = 'conector-configurar',
  formTestidPrefix = 'cf-cfg',
  title,
}: {
  t: (k: string) => string;
  name: string;
  skillName: string;
  schema: SkillParam[];
  values: Record<string, unknown>;
  loading: boolean;
  busy: boolean;
  error: string | null;
  warnings: string[];
  onChange: (key: string, value: unknown) => void;
  onCancel: () => void;
  onSubmit: () => void;
  testidPrefix?: string;
  formTestidPrefix?: string;
  title?: string;
}) {
  const dialogRef = useDialogA11y({ open: true, onClose: onCancel });
  const titleId = `${testidPrefix}-title`;
  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={`${testidPrefix}-modal`}
      className="fixed inset-0 z-[60] flex items-start justify-center p-12 ds-overlay"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[520px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <span className="inline-flex w-7 h-7 items-center justify-center bg-canvas-light border border-primary text-primary">
            <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
          </span>
          <h2 id={titleId} className="text-[13px] font-semibold flex-1 truncate">
            {title ?? t('conectores.configure.title')} · {name}
          </h2>
          <button type="button" onClick={onCancel} aria-label={t('common.cancel')}
            data-testid={`${testidPrefix}-close`}
            className="text-muted-on-light hover:text-text-on-light">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-3 text-[12px] max-h-[60vh] overflow-y-auto scrollbar-hide">
          <p className="text-[11px] text-muted-on-light">
            {skillName} — {t('conectores.configure.desc')}
          </p>
          {loading ? (
            <p className="text-[11px] text-muted-on-light flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> {t('common.loading')}
            </p>
          ) : schema.length === 0 ? (
            <p className="text-[11px] text-muted-on-light italic" data-testid={`${testidPrefix}-vazio`}>
              {t('conectores.configure.no_schema')}
            </p>
          ) : (
            <SchemaForm
              params={schema}
              values={values}
              onChange={onChange}
              testidPrefix={formTestidPrefix}
            />
          )}
          {warnings.length > 0 && (
            <div className="border border-warning bg-canvas-light px-3 py-2 space-y-1"
              data-testid={`${testidPrefix}-clamps`}>
              <p className="text-[11px] text-warning font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
                {t('conectores.configure.clamped')}
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-text-on-light">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          {error && (
            <p className="text-[11px] text-danger flex items-start gap-1.5" role="alert"
              data-testid={`${testidPrefix}-err`}>
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} /> {error}
            </p>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} data-testid={`${testidPrefix}-cancel`}
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={onSubmit} disabled={busy || loading}
            data-testid={`${testidPrefix}-submit`}
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:opacity-90 flex items-center gap-1.5 disabled:opacity-60">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />}
            {t('conectores.configure.submit')}
          </button>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}
