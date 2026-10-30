'use client';

/**
 * UserViewsToolbar — Refactor Fase A do parity roadmap (2026-05-20).
 *
 * Async via endpoints `WorkshopUserState` no ontology-module. Operador
 * salva snapshot dos `?var.*` da URL como view nomeada; persiste no
 * backend (per-user, multi-device).
 *
 * Substitui o MVP localStorage do Sprint 4 — regra
 * [[feedback_no_localstorage_for_persistence]] obriga backend.
 */
import * as React from 'react';
import { Bookmark, Check, Link2, Loader2, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { UserViews, type UserView } from '@/lib/workshop/user-views';
import { confirmModal } from '@/components/dialog/confirm-dialog';

type Props = {
  appId: string;
  /**
   * PF3 (2026-05-20): terminologia customizada definida em
   * `app.state_saving_config`. Quando undefined, cai no default
   * "Estado salvo / Estados salvos". O parent (view page) lê `app`
   * após o GET e passa os 2 campos.
   */
  appNameSingular?: string;
  appNamePlural?: string;
};

const DEFAULT_NAME_SINGULAR = 'Estado salvo';
const DEFAULT_NAME_PLURAL = 'Estados salvos';

/**
 * Concordância "salvo/salva" — leitura do gênero da palavra plural:
 * última letra `a` → feminino ("salvas"); senão masculino ("salvos").
 * Heurística cobre PT-BR genérico (estados, investigações, listas, ...).
 */
function genderSuffix(plural: string): 'as' | 'os' {
  const cleaned = plural.trim().toLowerCase();
  if (!cleaned) return 'os';
  return cleaned.endsWith('a') || cleaned.endsWith('as') ? 'as' : 'os';
}

function readVarsFromURL(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, unknown> = {};
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of params) {
    if (!k.startsWith('var.')) continue;
    try {
      out[k.slice(4)] = JSON.parse(v);
    } catch {
      out[k.slice(4)] = v;
    }
  }
  return out;
}

function applyVarsToURL(vars: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  for (const k of Array.from(params.keys())) {
    if (k.startsWith('var.')) params.delete(k);
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v == null || v === '') continue;
    params.set(`var.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  }
  window.location.assign(`${window.location.pathname}?${params.toString()}`);
}

export function UserViewsToolbar({
  appId,
  appNameSingular,
  appNamePlural,
}: Props) {
  const nameSingular = (appNameSingular ?? '').trim() || DEFAULT_NAME_SINGULAR;
  const namePlural = (appNamePlural ?? '').trim() || DEFAULT_NAME_PLURAL;
  const suffix = genderSuffix(namePlural);
  const nameSingularLower = nameSingular.toLocaleLowerCase('pt-BR');
  const [views, setViews] = React.useState<UserView[]>([]);
  const [open, setOpen] = React.useState(false);
  const [savingName, setSavingName] = React.useState('');
  const [showSaveForm, setShowSaveForm] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Sprint A3 (Parity Audit): "Copiar link" — operador compartilha view ativa
  // (`?var.*` da URL atual) com colega via mensagem/Slack/etc.
  const [copyOk, setCopyOk] = React.useState(false);
  const shareLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch {
      setError('Não foi possível copiar automaticamente. Copie da barra de endereço.');
    }
  };

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await UserViews.list(appId);
      setViews(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const vars = readVarsFromURL();
      const v = await UserViews.upsert(appId, savingName, vars);
      // Upsert por nome — se já existia, substitui na lista; senão prepend.
      setViews((prev) => {
        const without = prev.filter((p) => p.id !== v.id);
        return [v, ...without];
      });
      setSavingName('');
      setShowSaveForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const load = (v: UserView) => {
    applyVarsToURL(v.bindings);
    setOpen(false);
  };

  const remove = async (id: string) => {
    if (!(await confirmModal({ title: `Remover ${suffix === 'as' ? 'esta' : 'este'} ${nameSingularLower}?`, tone: 'danger', confirmLabel: 'Remover' }))) return;
    setBusy(true);
    setError(null);
    try {
      await UserViews.remove(appId, id);
      setViews((prev) => prev.filter((v) => v.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="h-9 px-3 border-b border-border-light bg-panel-light flex items-center gap-2 shrink-0"
      data-testid="user-views-toolbar"
    >
      <Bookmark className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
      <p className="text-[10px] uppercase tracking-[0.14em] font-mono text-muted-on-light font-semibold">
        {namePlural}
      </p>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          data-testid="user-views-dropdown-toggle"
          disabled={loading}
          className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
          ) : views.length === 0 ? (
            suffix === 'as' ? 'nenhuma' : 'nenhum'
          ) : views.length === 1 ? (
            `1 ${nameSingularLower}`
          ) : (
            `${views.length} ${namePlural.toLocaleLowerCase('pt-BR')}`
          )}
        </button>
        {open && views.length > 0 && (
          <div className="absolute top-full left-0 mt-1 bg-canvas-light border border-border-light min-w-[280px] z-30">
            <ul className="divide-y divide-border-light/60 max-h-64 overflow-y-auto">
              {views.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-raised-light/40"
                >
                  <button
                    type="button"
                    onClick={() => load(v)}
                    data-testid={`user-view-load-${v.id}`}
                    className="flex-1 text-left text-[11px] truncate"
                    title={`Carregar ${nameSingularLower} — ${Object.keys(v.bindings).length} bindings · salvo ${new Date(v.saved_at).toLocaleString('pt-BR')}`}
                  >
                    {v.name}
                    <span className="block text-[9px] text-muted-on-light/70 font-mono">
                      {new Date(v.saved_at).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                      {' · '}
                      {Object.keys(v.bindings).length} bindings
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(v.id)}
                    disabled={busy}
                    aria-label={`Remover ${nameSingularLower}`}
                    className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {!showSaveForm ? (
        <>
          <button
            type="button"
            onClick={shareLink}
            data-testid="user-views-share"
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
            title="Copia o link com filtros atuais — colega abre e vê o mesmo que você"
          >
            {copyOk ? (
              <Check className="w-3 h-3 text-success" strokeWidth={1.5} />
            ) : (
              <Link2 className="w-3 h-3" strokeWidth={1.5} />
            )}
            {copyOk ? 'Copiado!' : 'Copiar link'}
          </button>
          <button
            type="button"
            onClick={() => setShowSaveForm(true)}
            data-testid="user-views-save-toggle"
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
            title={`Salva os filtros/seleções atuais como ${suffix === 'as' ? 'uma' : 'um'} ${nameSingularLower} nomead${suffix.charAt(0)}`}
          >
            <Save className="w-3 h-3" strokeWidth={1.5} /> Salvar {nameSingularLower}
          </button>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={savingName}
            onChange={(e) => setSavingName(e.target.value)}
            placeholder={`Nome d${suffix === 'as' ? 'a' : 'o'} ${nameSingularLower}`}
            data-testid="user-views-name-input"
            className="h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary w-40"
            autoFocus
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') setShowSaveForm(false);
            }}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            data-testid="user-views-save-confirm"
            className="h-7 px-2 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-60 flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : null}
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setShowSaveForm(false)}
            className="h-7 px-2 text-[11px] bg-canvas-light text-muted-on-light border border-border-light hover:border-danger hover:text-danger"
          >
            Cancelar
          </button>
        </div>
      )}
      {error ? (
        <span className="ml-auto text-[10px] font-mono text-danger truncate max-w-[280px]" title={error}>
          {error}
        </span>
      ) : (
        <span
          className={cn(
            'ml-auto text-[10px] font-mono text-muted-on-light/70',
            views.length === 0 && 'italic',
          )}
        >
          {views.length === 0
            ? `Use filtros, salve ${suffix === 'as' ? 'sua' : 'seu'} ${nameSingularLower} e volte com 1 clique.`
            : 'Sincronizado com o servidor.'}
        </span>
      )}
    </div>
  );
}
