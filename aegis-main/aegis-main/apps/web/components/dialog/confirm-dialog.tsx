'use client';

/**
 * <ConfirmDialog /> — Sprint UX-2.10 (2026-05-22).
 *
 * Substitui `window.confirm()` nativo por um dialog Palantir-sharp com:
 *   - título + descrição rica (string ou JSX)
 *   - tom (default | warning | danger) muda a cor do botão primário
 *   - opcional `requireConfirmText` — operador digita o nome do recurso
 *     para confirmar (anti-tap-mistake em ações irreversíveis)
 *   - opcional `dependencies` — lista de impactos visíveis
 *
 * Uso típico:
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: '...', tone: 'danger', ... });
 *   if (!ok) return;
 *
 * Memória honrada:
 *   - feedback_no_rounded_no_sparkles · sharp Palantir-style
 *   - feedback_no_emojis_in_ui · zero emoji
 */
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, AlertCircle, HelpCircle, KeyRound, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useDialogA11y } from './use-dialog-a11y';

export type ConfirmTone = 'default' | 'warning' | 'danger';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  /** Lista de impactos / dependências mostrada como bullet list. */
  dependencies?: string[];
  /** Operador precisa digitar esse texto exato para habilitar Confirmar. */
  requireConfirmText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface ConfirmContextValue {
  ask: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const ask = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setOpen({ opts, resolve })),
    [],
  );

  const close = (v: boolean) => {
    if (!open) return;
    open.resolve(v);
    setOpen(null);
  };

  return (
    <ConfirmContext.Provider value={{ ask }}>
      {children}
      {open && (
        <ConfirmDialogContent
          opts={open.opts}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * Modal de confirmação IMPERATIVO — renderiza um dialog REAL (Palantir-sharp) em
 * qualquer contexto, COM ou SEM provider montado, montando uma raiz própria via portal.
 * NUNCA cai em `window.confirm` nativo (regra do operador: zero diálogo nativo). É a
 * base do fallback do `useConfirm` e pode ser chamado direto fora de componentes.
 */
export function confirmModal(opts: ConfirmOptions): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: boolean) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(
      <ConfirmDialogContent
        opts={opts}
        onConfirm={() => done(true)}
        onCancel={() => done(false)}
      />,
    );
  });
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  // SEM fallback nativo: sem provider, usa o modal imperativo (dialog real).
  return ctx ? ctx.ask : confirmModal;
}

function ConfirmDialogContent({
  opts,
  onConfirm,
  onCancel,
}: {
  opts: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tone: ConfirmTone = opts.tone ?? 'default';
  const [typed, setTyped] = React.useState('');
  const requireText = opts.requireConfirmText?.trim() ?? '';
  const canConfirm = requireText ? typed === requireText : true;

  const dialogRef = useDialogA11y({ open: true, onClose: onCancel });

  const Icon = tone === 'danger' ? AlertCircle : tone === 'warning' ? AlertTriangle : HelpCircle;
  const accent =
    tone === 'danger'
      ? 'border-danger text-danger'
      : tone === 'warning'
      ? 'border-warning text-warning'
      : 'border-primary text-primary';
  const confirmBtn =
    tone === 'danger'
      ? 'bg-danger text-white border-danger hover:bg-danger/90'
      : tone === 'warning'
      ? 'bg-warning text-white border-warning hover:bg-warning/90'
      : 'bg-primary text-white border-primary hover:bg-primary-hover';

  return (
    <ModalPortal>
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      data-testid="confirm-dialog"
      className="fixed inset-0 z-[60] flex items-start justify-center p-12 ds-overlay"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[480px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <span
            className={cn(
              'inline-flex w-7 h-7 items-center justify-center bg-canvas-light border',
              accent,
            )}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
          </span>
          <h2 id="confirm-dialog-title" className="text-[13px] font-semibold flex-1">
            {opts.title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar"
            data-testid="confirm-close"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-3 text-[12px]">
          {opts.description && (
            <div data-testid="confirm-description" className="text-text-on-light">
              {typeof opts.description === 'string' ? (
                <p>{opts.description}</p>
              ) : (
                opts.description
              )}
            </div>
          )}
          {opts.dependencies && opts.dependencies.length > 0 && (
            <div
              data-testid="confirm-dependencies"
              className="bg-canvas-light border border-border-light px-3 py-2"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
                Impactos
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11.5px]">
                {opts.dependencies.map((dep, i) => (
                  <li key={i}>{dep}</li>
                ))}
              </ul>
            </div>
          )}
          {requireText && (
            <div className="space-y-1">
              <p className="text-[10.5px] text-muted-on-light">
                Digite{' '}
                <code className="text-[11px] font-mono bg-canvas-light border border-border-light px-1">
                  {requireText}
                </code>{' '}
                para confirmar.
              </p>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                data-testid="confirm-text-input"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
              />
            </div>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="confirm-cancel"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
          >
            {opts.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            data-testid="confirm-ok"
            className={cn(
              'h-8 px-3 text-[12px] border disabled:opacity-50 disabled:cursor-not-allowed',
              confirmBtn,
            )}
          >
            {opts.confirmLabel ?? 'Confirmar'}
          </button>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}


// ── PROMPT modal (substitui window.prompt nativo) ──────────────────────────────
export interface PromptOptions {
  title: string;
  description?: React.ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  multiline?: boolean;
  /** Não permite confirmar com valor vazio (após trim). Default true. */
  required?: boolean;
}

function PromptDialogContent({
  opts,
  onSubmit,
  onCancel,
}: {
  opts: PromptOptions;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState(opts.defaultValue ?? '');
  const dialogRef = useDialogA11y({ open: true, onClose: onCancel });
  const required = opts.required !== false;
  const canSubmit = required ? value.trim().length > 0 : true;
  const submit = () => {
    if (canSubmit) onSubmit(value);
  };
  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
      data-testid="prompt-dialog"
      className="fixed inset-0 z-[60] flex items-start justify-center p-12 ds-overlay"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[480px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <span className="inline-flex w-7 h-7 items-center justify-center bg-canvas-light border border-primary text-primary">
            <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
          </span>
          <h2 id="prompt-dialog-title" className="text-[13px] font-semibold flex-1">
            {opts.title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar"
            data-testid="prompt-close"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>
        <div className="p-4 space-y-3 text-[12px]">
          {opts.description && (
            <div className="text-text-on-light">
              {typeof opts.description === 'string' ? <p>{opts.description}</p> : opts.description}
            </div>
          )}
          {opts.multiline ? (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              rows={4}
              placeholder={opts.placeholder}
              data-testid="prompt-input"
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary resize-y"
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              autoFocus
              placeholder={opts.placeholder}
              data-testid="prompt-input"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            />
          )}
        </div>
        <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="prompt-cancel"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
          >
            {opts.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            data-testid="prompt-ok"
            className="h-8 px-3 text-[12px] border bg-primary text-white border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {opts.confirmLabel ?? 'Confirmar'}
          </button>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}

/**
 * Modal de PROMPT imperativo (substitui `window.prompt`). Resolve a string digitada
 * ou ``null`` se cancelado. Renderiza dialog real em qualquer contexto (sem provider).
 */
export function promptModal(opts: PromptOptions): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: string | null) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(
      <PromptDialogContent
        opts={opts}
        onSubmit={(v) => done(v)}
        onCancel={() => done(null)}
      />,
    );
  });
}

// ── GRANTS modal (concessões independentes por checkbox) ───────────────────────
export interface GrantOption {
  key: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  /** Marca visualmente como mais sensível que as demais opções (badge). */
  sensitive?: boolean;
  sensitiveLabel?: string;
}

export interface GrantsOptions {
  title: string;
  description?: React.ReactNode;
  options: GrantOption[];
  /** Chaves pré-marcadas (raro — default é tudo desmarcado, "só leitura"). */
  defaultChecked?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** Rodapé abaixo dos checkboxes — ex.: "nenhum marcado = só leitura". */
  footnote?: React.ReactNode;
}

function GrantsDialogContent({
  opts,
  onConfirm,
  onCancel,
}: {
  opts: GrantsOptions;
  onConfirm: (grants: string[]) => void;
  onCancel: () => void;
}) {
  const [marcados, setMarcados] = React.useState<Set<string>>(
    () => new Set(opts.defaultChecked ?? []),
  );
  const dialogRef = useDialogA11y({ open: true, onClose: onCancel });

  const alternar = (key: string) => {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="grants-dialog-title"
        data-testid="grants-dialog"
        className="fixed inset-0 z-[60] flex items-start justify-center p-12 ds-overlay"
        onClick={onCancel}
      >
        <div
          ref={dialogRef}
          className="w-full max-w-[480px] bg-white border border-border-light shadow-2xl text-text-on-light"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
            <span className="inline-flex w-7 h-7 items-center justify-center bg-canvas-light border border-primary text-primary shrink-0">
              <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} />
            </span>
            <h2 id="grants-dialog-title" className="text-[13px] font-semibold flex-1">
              {opts.title}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancelar"
              data-testid="grants-close"
              className="text-muted-on-light hover:text-text-on-light"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </header>

          <div className="p-4 space-y-3 text-[12px]">
            {opts.description && (
              <div className="text-text-on-light">
                {typeof opts.description === 'string' ? <p>{opts.description}</p> : opts.description}
              </div>
            )}
            <div className="space-y-1.5">
              {opts.options.map((o) => {
                const marcado = marcados.has(o.key);
                const Icon = o.icon;
                return (
                  <label
                    key={o.key}
                    className={cn(
                      'flex items-start gap-2.5 border px-3 py-2.5 cursor-pointer select-none transition-colors',
                      marcado
                        ? 'border-primary bg-primary/5'
                        : 'border-border-light hover:border-primary/40',
                    )}
                    data-testid={`grants-option-${o.key}`}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(o.key)}
                      className="mt-0.5 w-3.5 h-3.5 accent-primary shrink-0"
                    />
                    {Icon && (
                      <Icon
                        className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-on-light"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{o.label}</span>
                        {o.sensitive && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-warning text-warning shrink-0">
                            {o.sensitiveLabel}
                          </span>
                        )}
                      </span>
                      {o.hint && (
                        <span className="block text-[11px] text-muted-on-light mt-0.5">{o.hint}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {opts.footnote && (
              <p className="text-[10.5px] text-muted-on-light">{opts.footnote}</p>
            )}
          </div>

          <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              data-testid="grants-cancel"
              className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
            >
              {opts.cancelLabel ?? 'Cancelar'}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(Array.from(marcados))}
              data-testid="grants-ok"
              className="h-8 px-3 text-[12px] border bg-primary text-white border-primary hover:bg-primary-hover"
            >
              {opts.confirmLabel ?? 'Confirmar'}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * Modal de CONCESSÕES imperativo — checkboxes independentes em vez de
 * sim/não. Resolve a lista de chaves marcadas (`[]` = nada marcado, "só
 * leitura" — não é cancelamento) ou ``null`` se o operador fechou/cancelou
 * sem decidir. Mesma base visual de `confirmModal`/`promptModal`.
 */
export function grantsModal(opts: GrantsOptions): Promise<string[] | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise<string[] | null>((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: string[] | null) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(
      <GrantsDialogContent
        opts={opts}
        onConfirm={(v) => done(v)}
        onCancel={() => done(null)}
      />,
    );
  });
}
