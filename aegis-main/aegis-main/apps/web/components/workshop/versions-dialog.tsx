'use client';

/**
 * VersionsDialog — Sprint A1 do Parity Audit (2026-05-20).
 *
 * Modal standalone (não tab/sidebar) com lista cronológica decrescente
 * de versões do app. Ground-truth visual extraído de
 * `foundry-shots/versions-dialog.png` + `version-warning-banner.png` +
 * `version-description.png`.
 *
 * Features:
 *   - Lista cronológica com badge "Publicado" singleton (check ✓)
 *   - Kebab menu por versão (Publicar / Restaurar)
 *   - 2 toggles no topo (auto-publish + prompt description)
 *   - Banner amber warning quando viewing non-published (caller controla)
 *   - Modal "Salvar nova versão" com textarea de descrição
 *
 * Liga em `WorkshopAppVersion` endpoints já existentes:
 *   GET  /workshop/apps/{id}/versions
 *   POST /workshop/apps/{id}/versions { semver_tag?, commit_message? }
 *   POST /workshop/apps/{id}/revert/{version_id}
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BadgeCheck,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Workshop } from '@/lib/workshop/client';
import type { WorkshopApp } from '@/lib/workshop/types';
import { formatDataHoraBR } from '@/lib/datetime';
import { confirmModal } from '@/components/dialog/confirm-dialog';

interface VersionRow {
  id: string;
  semver_tag?: string | null;
  commit_message?: string | null;
  created_at: string;
  created_by?: string | null;
  is_published?: boolean;
}

const LS_AUTO_PUBLISH_KEY = (appId: string) => `workshop.auto-publish.${appId}`;
const LS_PROMPT_DESC_KEY = (appId: string) => `workshop.prompt-desc.${appId}`;

export function VersionsDialog({
  app,
  open,
  onClose,
  onAppReloaded,
}: {
  app: WorkshopApp;
  open: boolean;
  onClose: () => void;
  /** Callback chamado quando revert recarrega a app. Editor pai re-sincroniza. */
  onAppReloaded?: (reloaded: WorkshopApp) => void;
}) {
  const [rows, setRows] = React.useState<VersionRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [autoPublish, setAutoPublish] = React.useState(false);
  const [promptDesc, setPromptDesc] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    setAutoPublish(window.localStorage.getItem(LS_AUTO_PUBLISH_KEY(app.id)) === '1');
    setPromptDesc(window.localStorage.getItem(LS_PROMPT_DESC_KEY(app.id)) !== '0');
  }, [open, app.id]);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await Workshop.listVersions(app.id);
      // Backend retorna em ordem desconhecida; ordenar desc por created_at.
      const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
      // O "publicado" é o último com semver_tag não vazio (interpretação que
      // bate com o backend atual — todo POST com semver_tag substitui o anterior).
      const published = sorted.find((v) => v.semver_tag && v.semver_tag.trim());
      setRows(
        sorted.map((v) => ({
          id: v.id,
          semver_tag: v.semver_tag,
          commit_message: v.commit_message,
          created_at: v.created_at,
          created_by: v.created_by,
          is_published: published?.id === v.id,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar versões.');
    } finally {
      setLoading(false);
    }
  }, [app.id]);

  React.useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const setToggle = (key: 'auto' | 'prompt', val: boolean) => {
    if (typeof window === 'undefined') return;
    if (key === 'auto') {
      setAutoPublish(val);
      window.localStorage.setItem(LS_AUTO_PUBLISH_KEY(app.id), val ? '1' : '0');
    } else {
      setPromptDesc(val);
      window.localStorage.setItem(LS_PROMPT_DESC_KEY(app.id), val ? '1' : '0');
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-6"
      data-testid="versions-dialog-root"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 ds-overlay"
      />
      <div
        role="dialog"
        aria-label="Versões"
        className="relative bg-canvas-light border border-border-light shadow-2xl w-[680px] max-h-[88vh] flex flex-col overflow-hidden"
      >
        <header className="h-10 px-3 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1">
            Versões · {rows?.length ?? 0}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            data-testid="versions-dialog-close"
            className="h-7 w-7 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>

        <div className="px-3 py-2.5 border-b border-border-light bg-canvas-light flex flex-col gap-2 shrink-0">
          <ToggleRow
            checked={autoPublish}
            onChange={(v) => setToggle('auto', v)}
            label="Publicar automaticamente ao salvar"
            hint="Cada salvamento cria uma versão pública (substitui a anterior)."
            testId="versions-auto-publish"
          />
          <ToggleRow
            checked={promptDesc}
            onChange={(v) => setToggle('prompt', v)}
            label="Pedir descrição da versão ao salvar"
            hint="Modal pede texto descritivo antes de salvar."
            testId="versions-prompt-desc"
          />
        </div>

        <div className="flex-1 overflow-y-auto" data-testid="versions-list">
          {loading && (
            <div className="px-4 py-8 text-center text-[11px] text-muted-on-light flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              Carregando versões…
            </div>
          )}
          {error && (
            <div className="m-3 px-3 py-2 text-[11px] bg-danger/5 border border-danger/40 text-danger">
              {error}
            </div>
          )}
          {!loading && rows?.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-[12px] text-muted-on-light">
                Nenhuma versão salva ainda.
              </p>
              <p className="text-[10.5px] text-muted-on-light/80 mt-1">
                Use "Salvar rascunho" no topo do editor para criar a primeira.
              </p>
            </div>
          )}
          {rows?.map((v) => (
            <VersionRow
              key={v.id}
              version={v}
              busy={busyId === v.id}
              onRevert={async () => {
                if (!(await confirmModal({ title: `Restaurar a versão ${v.semver_tag || v.id.slice(0, 8)}?`, description: 'Um snapshot do estado atual será criado antes.', confirmLabel: 'Restaurar' }))) return;
                setBusyId(v.id);
                try {
                  const reloaded = await Workshop.revertVersion(app.id, v.id);
                  // Re-load app: caller decide se quer fechar dialog
                  onAppReloaded?.(reloaded as unknown as WorkshopApp);
                  await reload();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Falha ao restaurar.');
                } finally {
                  setBusyId(null);
                }
              }}
            />
          ))}
        </div>

        <footer className="px-3 py-2 border-t border-border-light bg-raised-light/40 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            data-testid="versions-dialog-footer-close"
            className="h-7 px-3 text-[11px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function VersionRow({
  version,
  busy,
  onRevert,
}: {
  version: VersionRow;
  busy: boolean;
  onRevert: () => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const tag = version.semver_tag?.trim();
  const ago = formatDataHoraBR(version.created_at);
  return (
    <article
      data-testid={`versions-row-${version.id}`}
      className="px-3 py-2.5 border-b border-border-light/60 hover:bg-raised-light/20"
    >
      <header className="flex items-center gap-2 flex-wrap">
        <p className="text-[12px] font-mono font-semibold text-text-on-light">
          {tag ? `v${tag.replace(/^v/, '')}` : `rascunho ${version.id.slice(0, 6)}`}
        </p>
        {version.created_by && (
          <span className="text-[11px] text-primary hover:underline cursor-default">
            {version.created_by}
          </span>
        )}
        <span className="text-[10.5px] text-muted-on-light">{ago}</span>
        <div className="flex-1" />
        {version.is_published && (
          <span
            data-testid={`versions-row-published-${version.id}`}
            className="inline-flex items-center gap-1 px-1.5 h-5 text-[10px] uppercase tracking-wider text-primary bg-primary/10 border border-primary/40"
          >
            <BadgeCheck className="w-3 h-3" strokeWidth={1.5} /> Publicada
          </span>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Ações"
            disabled={busy}
            data-testid={`versions-row-menu-${version.id}`}
            className="h-6 w-6 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            ) : (
              <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
          </button>
          {menuOpen && (
            <>
              <div
                aria-hidden="true"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-0"
              />
              <div className="absolute top-full right-0 mt-1 bg-canvas-light border border-border-light shadow-lg z-10 w-[200px] py-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRevert();
                  }}
                  data-testid={`versions-row-revert-${version.id}`}
                  className="w-full px-3 py-1.5 text-[11px] text-left hover:bg-raised-light flex items-center gap-2"
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                  Restaurar este estado
                </button>
              </div>
            </>
          )}
        </div>
      </header>
      {version.commit_message && (
        <p className="mt-2 px-2 py-1.5 text-[11px] text-text-on-light bg-raised-light/40 border-l-2 border-border-light leading-snug">
          {version.commit_message}
        </p>
      )}
    </article>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  hint,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        data-testid={testId}
        className={cn(
          'shrink-0 mt-0.5 h-4 w-7 relative border transition-colors',
          checked
            ? 'bg-primary border-primary'
            : 'bg-canvas-light border-border-light',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 transition-transform',
            checked ? 'translate-x-3 bg-white' : 'translate-x-0.5 bg-muted-on-light',
          )}
        />
      </button>
      <span className="flex-1 -mt-0.5">
        <span className="text-[11px] font-medium text-text-on-light block">{label}</span>
        {hint && (
          <span className="text-[10px] text-muted-on-light leading-snug block mt-0.5">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Banner amber pra non-published — usado pelo /workshop/view/[id] page       */
/* -------------------------------------------------------------------------- */
export function ViewingNonPublishedBanner({
  versionLabel,
  onGoToPublished,
}: {
  versionLabel: string;
  onGoToPublished: () => void;
}) {
  return (
    <div
      data-testid="versions-non-published-banner"
      className="border-y border-warning/60 bg-warning/15 px-3 py-2 flex items-center gap-2"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" strokeWidth={1.5} />
      <p className="text-[11px] text-text-on-light flex-1">
        Você está vendo a versão <strong className="font-semibold">{versionLabel}</strong>, que não é a versão publicada.
      </p>
      <button
        type="button"
        onClick={onGoToPublished}
        className="h-6 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
      >
        Ir para a publicada
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal "Salvar nova versão" — abre quando promptDesc=true                   */
/* -------------------------------------------------------------------------- */
export function SaveVersionModal({
  open,
  initialMessage = '',
  onSave,
  onCancel,
}: {
  open: boolean;
  initialMessage?: string;
  onSave: (message: string, publish: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [message, setMessage] = React.useState(initialMessage);
  const [publishToo, setPublishToo] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMessage(initialMessage);
      setPublishToo(false);
      setSaving(false);
    }
  }, [open, initialMessage]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      data-testid="save-version-modal-root"
    >
      <div
        aria-hidden="true"
        onClick={!saving ? onCancel : undefined}
        className="absolute inset-0 ds-overlay"
      />
      <div
        role="dialog"
        aria-label="Salvar nova versão"
        className="relative bg-canvas-light border border-border-light shadow-2xl w-[520px] flex flex-col overflow-hidden"
      >
        <header className="h-10 px-3 border-b border-border-light bg-raised-light flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1">
            Salvar nova versão
          </p>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Fechar"
            className="h-7 w-7 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>
        <div className="p-3 space-y-3">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold mb-1">
              Descreva as mudanças desta versão
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex.: Adicionei a tabela de alertas e botão Resolver"
              data-testid="save-version-message"
              autoFocus
              className="w-full px-2 py-1.5 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary min-h-[80px] resize-y"
            />
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={publishToo}
              onChange={(e) => setPublishToo(e.target.checked)}
              data-testid="save-version-publish-too"
              className="accent-primary"
            />
            <span className="text-[11px] text-text-on-light">
              Publicar esta versão como a versão visível para todos
            </span>
          </label>
        </div>
        <footer className="px-3 py-2 border-t border-border-light bg-raised-light/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-7 px-3 text-[11px] bg-canvas-light border border-border-light hover:border-danger hover:text-danger disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="save-version-submit"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(message.trim(), publishToo);
              } finally {
                setSaving(false);
              }
            }}
            className="h-7 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            ) : publishToo ? (
              <Send className="w-3 h-3" strokeWidth={1.5} />
            ) : (
              <Plus className="w-3 h-3" strokeWidth={1.5} />
            )}
            {publishToo ? 'Salvar e publicar' : 'Salvar versão'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
