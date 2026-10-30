'use client';

/**
 * CommentsDrawer — Sprint F1 do Parity Audit (2026-05-21).
 *
 * Drawer-right (mesmo padrão do `VariablesPanel`, 420px) com a thread
 * de comentários de UM escopo do app. O backend já expõe os endpoints
 * `GET /workshop/apps/{id}/comments?scope=…`, `POST … /comments` e
 * `DELETE … /comments/{id}` — este componente consome direto via
 * `Workshop.listComments / createComment / removeComment`.
 *
 * Decisões UX:
 *   - Thread em ordem cronológica ASC (oldest first). Backend retorna
 *     DESC; revertemos no client.
 *   - Footer com textarea + Comentar. Enter = nova linha; Shift+Enter
 *     envia (padrão IM moderno; toolbar avisa no placeholder).
 *   - Botão remover só aparece pro autor (matcheia `principal.user_id`
 *     vs `comment.author_id`). Supervisores também podem (backend
 *     valida — mas o botão visível só pro autor pra manter a UI
 *     previsível).
 *   - scope_key default = "app" (catálogo geral). Operador pode trocar
 *     digitando outro escopo no input — útil pra discussões por widget
 *     no futuro.
 *
 * Não polling: refresh on mount + após POST/DELETE. Polling agressivo
 * polui métricas por nada — operador pode reabrir o drawer.
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2,
  MessageSquare,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Workshop, isPersistedAppId, type BackendComment } from '@/lib/workshop/client';
import type { WorkshopApp } from '@/lib/workshop/types';
import { usePrincipal } from '@/lib/auth/useAuth';
import { formatDataHoraBR } from '@/lib/datetime';
import { confirmModal } from '@/components/dialog/confirm-dialog';

const DEFAULT_SCOPE = 'app';

export function CommentsDrawer({
  app,
  open,
  onClose,
  initialScope,
}: {
  app: WorkshopApp;
  open: boolean;
  onClose: () => void;
  /** Sobrescreve o `scope_key` inicial. Default: 'app'. */
  initialScope?: string;
}) {
  const principal = usePrincipal();
  const [scope, setScope] = React.useState<string>(initialScope || DEFAULT_SCOPE);
  const [rows, setRows] = React.useState<BackendComment[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [posting, setPosting] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const isPersisted = isPersistedAppId(app.id);

  const reload = React.useCallback(async () => {
    if (!isPersisted) {
      // Comments só funcionam em apps persistidos no backend (UUID real).
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await Workshop.listComments(app.id, scope);
      // Backend retorna DESC; queremos ASC pra UI tipo chat.
      const asc = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
      setRows(asc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar comentários.');
    } finally {
      setLoading(false);
    }
  }, [app.id, scope, isPersisted]);

  React.useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const handleSubmit = React.useCallback(async () => {
    const content = draft.trim();
    if (!content || posting || !isPersisted) return;
    setPosting(true);
    setError(null);
    try {
      await Workshop.createComment(app.id, { scope_key: scope, content });
      setDraft('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar comentário.');
    } finally {
      setPosting(false);
    }
  }, [app.id, scope, draft, posting, isPersisted, reload]);

  const handleRemove = React.useCallback(
    async (commentId: string) => {
      if (!(await confirmModal({ title: 'Remover este comentário?', tone: 'danger', confirmLabel: 'Remover' }))) return;
      setRemovingId(commentId);
      setError(null);
      try {
        await Workshop.removeComment(app.id, commentId);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao remover.');
      } finally {
        setRemovingId(null);
      }
    },
    [app.id, reload],
  );

  if (!open || typeof document === 'undefined') return null;

  const total = rows?.length ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-[90]" data-testid="comments-drawer-root">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 ds-overlay"
      />
      <div
        role="dialog"
        aria-label="Comentários"
        className="absolute top-0 bottom-0 right-0 w-[420px] surface-light bg-canvas-light border-l border-border-light shadow-2xl flex flex-col overflow-hidden"
      >
        <header className="h-10 px-3 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1">
            Comentários · {total}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            data-testid="comments-drawer-close"
            className="h-7 w-7 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>

        <div className="px-3 py-2 border-b border-border-light bg-canvas-light shrink-0">
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
            Escopo
          </label>
          <input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value.trim() || DEFAULT_SCOPE)}
            placeholder="app"
            data-testid="comments-scope-input"
            className="w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary font-mono"
          />
          <p className="mt-1 text-[10px] text-muted-on-light leading-snug">
            Discussões diferentes por escopo (ex.: id da entidade, da página).
          </p>
        </div>

        {error && (
          <div className="m-3 px-3 py-2 text-[11px] bg-danger/5 border border-danger/40 text-danger">
            {error}
          </div>
        )}

        {!isPersisted && (
          <div className="m-3 px-3 py-2 text-[11px] bg-warning/10 border border-warning/40 text-text-on-light">
            Comentários só ficam disponíveis depois que o painel é salvo no servidor.
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-[11px] text-muted-on-light flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              Carregando…
            </div>
          )}
          {!loading && isPersisted && rows && rows.length === 0 && (
            <p className="p-4 text-[11px] text-muted-on-light italic text-center">
              Nenhum comentário neste escopo ainda. Escreva o primeiro abaixo.
            </p>
          )}
          {!loading && rows && rows.length > 0 && (
            <ul className="divide-y divide-border-light/60">
              {rows.map((c) => {
                const isAuthor =
                  !!principal && !!c.author_id && c.author_id === principal.user_id;
                return (
                  <li
                    key={c.id}
                    data-testid={`comments-row-${c.id}`}
                    className="px-3 py-2.5 flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-[11px] text-primary font-medium hover:underline truncate"
                        title={c.author_id ?? ''}
                      >
                        {c.author_display || (c.author_id ? 'Operador' : 'Desconhecido')}
                      </button>
                      <span className="text-[10px] text-muted-on-light font-mono">
                        {c.created_at ? formatDataHoraBR(c.created_at) : ''}
                      </span>
                      <span className="flex-1" />
                      {isAuthor && (
                        <button
                          type="button"
                          onClick={() => handleRemove(c.id)}
                          disabled={removingId === c.id}
                          data-testid={`comments-remove-${c.id}`}
                          aria-label="Remover comentário"
                          title="Remover comentário"
                          className={cn(
                            'h-5 w-5 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger/40',
                            removingId === c.id && 'opacity-50 pointer-events-none',
                          )}
                        >
                          {removingId === c.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                          ) : (
                            <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-[11.5px] text-text-on-light whitespace-pre-wrap leading-snug">
                      {c.content}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-border-light bg-raised-light/40 shrink-0 px-3 py-2 flex flex-col gap-1.5">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escreva um comentário…"
            rows={3}
            disabled={!isPersisted || posting}
            data-testid="comments-input"
            onKeyDown={(e) => {
              // Shift+Enter envia; Enter sozinho insere quebra de linha.
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            className="w-full px-2 py-1.5 text-[11.5px] bg-white border border-border-light outline-none focus:border-primary leading-snug resize-none disabled:bg-canvas-light disabled:text-muted-on-light"
          />
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-muted-on-light flex-1">
              Shift+Enter envia · Enter nova linha
            </p>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!isPersisted || posting || !draft.trim()}
              data-testid="comments-submit"
              className={cn(
                'h-7 px-2.5 text-[11px] border flex items-center gap-1.5',
                !isPersisted || posting || !draft.trim()
                  ? 'bg-canvas-light border-border-light text-muted-on-light cursor-not-allowed'
                  : 'bg-primary text-white border-primary hover:bg-primary-hover',
              )}
            >
              {posting ? (
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
              ) : (
                <Send className="w-3 h-3" strokeWidth={1.5} />
              )}
              Comentar
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
