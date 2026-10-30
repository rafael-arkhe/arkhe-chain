'use client';

/**
 * Comments — Refactor Fase B do parity roadmap (2026-05-20).
 *
 * Thread persistida no `workshop_comments` table do ontology-module.
 * Endpoint:
 *   - GET    /workshop/apps/{id}/comments?scope=<key>
 *   - POST   /workshop/apps/{id}/comments  {scope_key, content}
 *   - DELETE /workshop/apps/{id}/comments/{comment_id}
 *
 * Author é resolvido server-side via principal cookie. Cliente passa
 * só (scope, content). Substitui o MVP localStorage do Sprint 5 —
 * regra [[feedback_no_localstorage_for_persistence]] obriga backend.
 *
 * `scope` no cfg pode ser variable-ref (lê de `variables[scope]`)
 * OU string literal — útil pra apps com entidades dinâmicas.
 */
import * as React from 'react';
import { MessageSquare, Send, Trash2, Loader2 } from 'lucide-react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { Workshop, type BackendComment } from '@/lib/workshop/client';
import { confirmModal } from '@/components/dialog/confirm-dialog';

type Cfg = {
  scope?: string;
  placeholder?: string;
  title?: string;
};

function Comments({ config, variables, appId }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const scopeRaw = cfg.scope ?? '';
  const scope =
    typeof variables[scopeRaw] === 'string'
      ? (variables[scopeRaw] as string)
      : scopeRaw;
  const [items, setItems] = React.useState<BackendComment[]>([]);
  const [draft, setDraft] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Editor preview e seeds locais não têm UUID válido — skip fetch.
  const isLive =
    !!scope &&
    !!appId &&
    appId !== 'editor' &&
    appId !== 'palette-preview' &&
    !appId.startsWith('seed.') &&
    !appId.startsWith('local.app.');

  const refresh = React.useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await Workshop.listComments(appId, scope);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [appId, scope, isLive]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async () => {
    if (!draft.trim() || !isLive || busy) return;
    setBusy(true);
    setError(null);
    try {
      const c = await Workshop.createComment(appId, {
        scope_key: scope,
        content: draft.trim(),
      });
      setItems((prev) => [c, ...prev]);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirmModal({ title: 'Remover comentário?', tone: 'danger', confirmLabel: 'Remover' }))) return;
    setBusy(true);
    setError(null);
    try {
      await Workshop.removeComment(appId, id);
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!scope) {
    return (
      <div className="bg-white border border-border-light p-2 text-[11px] text-muted-on-light italic">
        Configure `scope` no Inspetor (variable-ref ou string literal).
      </div>
    );
  }

  if (!isLive) {
    // Preview no editor / palette / seed local — mostra estado read-only mock
    return (
      <div className="bg-white border border-border-light flex flex-col" data-testid="comments-preview">
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2 shrink-0">
          <MessageSquare className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1">
            {cfg.title ?? 'Comentários'}
          </p>
          <span className="text-[10px] font-mono text-muted-on-light italic">preview</span>
        </header>
        <p className="px-3 py-4 text-[11px] text-muted-on-light italic text-center">
          Comentários ficam ativos quando esta app for renderizada em `/workshop/view/&lt;uuid&gt;`.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-light flex flex-col" data-testid="comments">
      <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2 shrink-0">
        <MessageSquare className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1">
          {cfg.title ?? 'Comentários'}
        </p>
        <span className="text-[10px] font-mono text-muted-on-light">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : items.length}
        </span>
      </header>
      <div className="p-2 flex flex-col gap-1.5 border-b border-border-light/60">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={cfg.placeholder ?? 'Escreva um comentário…'}
          rows={2}
          disabled={busy}
          data-testid="comments-draft"
          className="w-full text-[11px] px-2 py-1 bg-canvas-light border border-border-light outline-none focus:border-primary resize-none disabled:opacity-60"
        />
        <div className="flex items-center justify-end gap-1.5">
          {error && (
            <span className="text-[10px] text-danger font-mono mr-auto truncate max-w-[220px]" title={error}>
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!draft.trim() || busy}
            data-testid="comments-submit"
            className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : <Send className="w-3 h-3" strokeWidth={1.5} />}
            Enviar
          </button>
        </div>
      </div>
      <ul className="divide-y divide-border-light/60 max-h-72 overflow-y-auto">
        {items.length === 0 && !loading && (
          <li className="px-3 py-4 text-[11px] text-muted-on-light italic text-center">
            Sem comentários ainda.
          </li>
        )}
        {items.map((c) => (
          <li key={c.id} className="px-2.5 py-1.5 flex items-start gap-2 hover:bg-raised-light/40">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <p className="text-[11px] font-semibold text-text-on-light truncate">
                  {c.author_display ?? '(autor removido)'}
                </p>
                <span className="text-[9px] font-mono text-muted-on-light/70">
                  {new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <p className="text-[11px] text-text-on-light whitespace-pre-wrap break-words">
                {c.content}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void remove(c.id)}
              disabled={busy}
              aria-label="Remover comentário"
              className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger shrink-0 disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

registerWidget('comments', Comments, {
  group: 'data',
  label: 'Comentários',
  description:
    'Thread de comentários por escopo (entidade, app, etc) gravada no servidor. Autor e data são preenchidos automaticamente.',
  icon: 'message-square',
  defaultColSpan: 5,
  mockConfig: {
    title: 'Notas operacionais',
    scope: 'demo-scope',
    placeholder: 'Adicione contexto, hipótese, follow-up…',
  },
  mockVariables: {},
  previewWidth: 340,
  previewHeight: 280,
  config_schema: [
    { name: 'title', label: 'Título', field: 'string', placeholder: 'Notas operacionais' },
    { name: 'scope', label: 'Escopo', field: 'string', placeholder: 'entity_id' },
    { name: 'placeholder', label: 'Texto de exemplo do campo', field: 'string', placeholder: 'Adicione contexto, hipótese, follow-up…' },
  ],
});
