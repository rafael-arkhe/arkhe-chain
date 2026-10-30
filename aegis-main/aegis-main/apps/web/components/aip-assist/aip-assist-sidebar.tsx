'use client';

/**
 * AIP Assist Sidebar — Sprint L4 (2026-05-23).
 *
 * Painel lateral global de assistente, context-pinned por scope:
 *   ontology · workshop · dataset · proposal · global
 *
 * Backend: /platform/v23/aip-assist (já existente):
 *   GET  /platform/v23/aip-assist[?scope=&resource_id=]
 *   POST /platform/v23/aip-assist        (criar/pinar)
 *   DELETE /platform/v23/aip-assist/{id}
 *   POST /platform/v23/aip-assist/suggest
 *
 * Padrão: SheetRight (Carbon-like). Trigger global ficará no shell;
 * por enquanto este componente é montável onde necessário.
 */
import * as React from 'react';
import {
  Wand2,
  Pin,
  PinOff,
  Send,
  Trash2,
  X,
  Loader2,
  Plus,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/cn';

export type AssistScope =
  | 'ontology'
  | 'workshop'
  | 'dataset'
  | 'proposal'
  | 'global';

interface AssistContext {
  id: string;
  scope: AssistScope;
  resource_id: string | null;
  title: string;
  body: string;
  pinned: boolean;
  markings: string[];
  created_at: string | null;
}

interface SuggestResponse {
  scope: string;
  resource_id: string | null;
  question: string;
  context_used: string[];
  answer: string;
}

interface Props {
  scope: AssistScope;
  resourceId?: string;
  onClose: () => void;
}

const SCOPE_LABEL: Record<AssistScope, string> = {
  ontology: 'Ontologia',
  workshop: 'Workshop',
  dataset: 'Datasets',
  proposal: 'Proposta',
  global: 'Global',
};

export function AipAssistSidebar({ scope, resourceId, onClose }: Props) {
  const [contexts, setContexts] = React.useState<AssistContext[] | null>(null);
  const [loadingCtx, setLoadingCtx] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [question, setQuestion] = React.useState('');
  const [asking, setAsking] = React.useState(false);
  const [answer, setAnswer] = React.useState<SuggestResponse | null>(null);

  const [newCtxTitle, setNewCtxTitle] = React.useState('');
  const [newCtxBody, setNewCtxBody] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);

  const refreshContexts = React.useCallback(() => {
    setLoadingCtx(true);
    setError(null);
    const qs = new URLSearchParams({ scope });
    if (resourceId) qs.set('resource_id', resourceId);
    apiFetch<AssistContext[]>(`/platform/v23/aip-assist?${qs}`)
      .then(setContexts)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingCtx(false));
  }, [scope, resourceId]);

  React.useEffect(() => {
    refreshContexts();
  }, [refreshContexts]);

  async function ask() {
    if (!question.trim()) return;
    setAsking(true);
    setError(null);
    try {
      const r = await apiFetch<SuggestResponse>(
        '/platform/v23/aip-assist/suggest',
        {
          method: 'POST',
          body: JSON.stringify({
            scope,
            resource_id: resourceId,
            question,
          }),
        },
      );
      setAnswer(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }

  async function addContext() {
    if (!newCtxTitle.trim() || !newCtxBody.trim()) return;
    setCreating(true);
    try {
      await apiFetch<AssistContext>('/platform/v23/aip-assist', {
        method: 'POST',
        body: JSON.stringify({
          scope,
          resource_id: resourceId,
          title: newCtxTitle,
          body: newCtxBody,
          pinned: true,
          markings: [],
        }),
      });
      setNewCtxTitle('');
      setNewCtxBody('');
      setShowAdd(false);
      refreshContexts();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function deleteContext(id: string) {
    try {
      await apiFetch(`/platform/v23/aip-assist/${id}`, { method: 'DELETE' });
      refreshContexts();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <aside
      className="fixed top-0 right-0 z-40 h-full w-full max-w-[440px] bg-canvas-light border-l border-border-light overflow-y-auto flex flex-col"
      role="complementary"
      aria-label="Assistente AEGIS"
      data-testid="aip-assist-sidebar"
    >
      <div className="border-b border-border-light p-4 flex items-start justify-between bg-white">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <div>
            <h2 className="text-sm font-semibold text-text-on-light">
              Assistente AEGIS
            </h2>
            <p className="text-[10px] font-mono text-muted-on-light">
              escopo: {SCOPE_LABEL[scope]}
              {resourceId ? ` · ${resourceId.slice(0, 8)}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          data-testid="aip-assist-close"
        >
          <X className="h-4 w-4 text-muted-on-light hover:text-text-on-light" strokeWidth={1.5} />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {error && (
          <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30">
            {error}
          </div>
        )}

        {/* Pinned contexts list */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Contextos fixados
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setShowAdd((v) => !v)}
              data-testid="aip-assist-toggle-add"
            >
              <Plus className="w-3 h-3" strokeWidth={1.5} />
              {showAdd ? 'Cancelar' : 'Adicionar'}
            </Button>
          </div>

          {showAdd && (
            <div className="space-y-2 mb-3 p-2 bg-white border border-border-light">
              <Input
                value={newCtxTitle}
                onChange={(e) => setNewCtxTitle(e.target.value)}
                placeholder="Título…"
                className="h-7 text-[12px]"
                data-testid="aip-assist-new-title"
              />
              <textarea
                value={newCtxBody}
                onChange={(e) => setNewCtxBody(e.target.value)}
                rows={3}
                placeholder="Snippet de contexto (instruções, lembretes, regras)…"
                className="w-full text-[11px] font-mono bg-white border border-border-light px-2 py-1.5 rounded-none focus:border-primary outline-none"
                data-testid="aip-assist-new-body"
              />
              <Button
                variant="success"
                size="sm"
                className="h-7 text-[11px]"
                onClick={addContext}
                disabled={creating || !newCtxTitle || !newCtxBody}
                data-testid="aip-assist-new-save"
              >
                {creating ? 'Salvando…' : 'Fixar contexto'}
              </Button>
            </div>
          )}

          {loadingCtx && (
            <p className="text-[11px] text-muted-on-light">Carregando…</p>
          )}
          {contexts && contexts.length === 0 && !loadingCtx && (
            <p className="text-[11px] text-muted-on-light">
              Nenhum contexto fixado. Adicione um pra refinar as respostas
              do assistente nesta tela.
            </p>
          )}
          {contexts && contexts.length > 0 && (
            <ul className="space-y-1.5" data-testid="aip-assist-ctx-list">
              {contexts.map((c) => (
                <li
                  key={c.id}
                  className="bg-white border border-border-light p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 flex-1 min-w-0">
                      {c.pinned ? (
                        <Pin
                          className="w-3 h-3 text-primary shrink-0 mt-0.5"
                          strokeWidth={1.5}
                        />
                      ) : (
                        <PinOff
                          className="w-3 h-3 text-muted-on-light shrink-0 mt-0.5"
                          strokeWidth={1.5}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-text-on-light truncate">
                          {c.title}
                        </p>
                        <p className="text-[10.5px] text-text-on-light mt-0.5 leading-snug whitespace-pre-wrap break-words">
                          {c.body}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteContext(c.id)}
                      aria-label="Remover contexto"
                      className="text-muted-on-light hover:text-danger"
                      data-testid={`aip-assist-del-${c.id}`}
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ask box */}
        <section className="pt-2 border-t border-border-light">
          <h3 className="text-[10px] uppercase tracking-wider text-muted-on-light mb-2">
            Pergunte
          </h3>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="Pergunte algo sobre esta tela…"
            className="w-full text-[12px] bg-white border border-border-light px-2 py-1.5 rounded-none focus:border-primary outline-none"
            data-testid="aip-assist-question"
          />
          <div className="flex justify-end mt-2">
            <Button
              onClick={ask}
              disabled={asking || !question.trim()}
              className="h-7 text-[11px]"
              data-testid="aip-assist-ask"
            >
              {asking ? (
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
              ) : (
                <Send className="w-3 h-3" strokeWidth={1.5} />
              )}
              Perguntar
            </Button>
          </div>

          {answer && (
            <div
              className={cn(
                'mt-3 p-3 bg-white border border-border-light',
              )}
              data-testid="aip-assist-answer"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
                Resposta
              </p>
              <pre className="text-[11px] font-mono text-text-on-light whitespace-pre-wrap break-words">
                {answer.answer}
              </pre>
              {answer.context_used.length > 0 && (
                <p className="text-[10px] font-mono text-muted-on-light mt-2">
                  contextos usados: {answer.context_used.length}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
