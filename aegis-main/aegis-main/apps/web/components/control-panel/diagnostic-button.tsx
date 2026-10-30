'use client';

/**
 * <DiagnosticButton /> — Sprint L1.10 (2026-05-23).
 *
 * "Diagnosticar com AEGIS" — botão que aparece em estados de erro/falha
 * e abre um painel lateral com diagnóstico estruturado vindo do
 * ontology-module (`POST /platform/v23/aip-diagnostic/explain`).
 *
 * Foundry baseline: "Fix with AIP" — usuário em erro recebe sugestão
 * acionável sem precisar reportar manualmente.
 *
 * Uso:
 *   <DiagnosticButton status={500} method="POST" path="/foo" message="..." />
 */
import * as React from 'react';
import { Wand2, X, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { ModalPortal } from '@/components/ui/modal-backdrop';

interface DiagnosticContext {
  status?: number;
  method?: string;
  path?: string;
  message?: string;
  context?: string;
}

interface DiagnosticResponse {
  resumo: string;
  causa_provavel: string;
  acoes_sugeridas: string[];
  referencias: { label: string; href: string }[];
}

interface Props extends DiagnosticContext {
  className?: string;
  label?: string;
}

export function DiagnosticButton({
  className,
  label = 'Diagnosticar',
  ...ctx
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<DiagnosticResponse | null>(null);

  async function start() {
    setOpen(true);
    if (data) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<DiagnosticResponse>(
        '/platform/v23/aip-diagnostic/explain',
        {
          method: 'POST',
          body: JSON.stringify(ctx),
        },
      );
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        data-testid="diagnostic-button"
        className={cn(
          'h-7 px-2.5 text-[11px] inline-flex items-center gap-1.5 bg-white border border-border-light hover:border-primary text-text-on-light',
          className,
        )}
      >
        <Wand2 className="w-3 h-3" strokeWidth={1.5} />
        {label}
      </button>

      {open && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-50 ds-overlay flex justify-end"
          onClick={() => setOpen(false)}
          data-testid="diagnostic-panel"
        >
          <aside
            role="dialog"
            aria-label="Diagnóstico AEGIS"
            className="w-full max-w-[440px] h-full bg-canvas-light border-l border-border-light overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border-light p-4 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text-on-light flex items-center gap-2">
                  <Wand2 className="h-4 w-4" strokeWidth={1.5} />
                  Diagnóstico AEGIS
                </h2>
                <p className="text-[10px] text-muted-on-light mt-0.5 font-mono">
                  {ctx.method || 'GET'} {ctx.path || '—'}
                  {ctx.status ? ` · ${ctx.status}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="text-muted-on-light hover:text-text-on-light"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {loading && (
                <div
                  className="flex items-center gap-2 text-[12px] text-muted-on-light"
                  data-testid="diagnostic-loading"
                >
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  Analisando o erro…
                </div>
              )}

              {error && (
                <div
                  className="bg-canvas-light border border-danger/40 p-3 flex items-start gap-2"
                  data-testid="diagnostic-error"
                >
                  <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" strokeWidth={1.5} />
                  <p className="text-[12px] text-danger break-all">{error}</p>
                </div>
              )}

              {data && (
                <div className="space-y-4" data-testid="diagnostic-content">
                  <section>
                    <h3 className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
                      Resumo
                    </h3>
                    <p className="text-[13px] font-semibold text-text-on-light">
                      {data.resumo}
                    </p>
                  </section>

                  <section>
                    <h3 className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
                      Causa provável
                    </h3>
                    <p className="text-[12px] text-text-on-light leading-relaxed">
                      {data.causa_provavel}
                    </p>
                  </section>

                  {data.acoes_sugeridas.length > 0 && (
                    <section>
                      <h3 className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
                        Ações sugeridas
                      </h3>
                      <ul className="space-y-1.5">
                        {data.acoes_sugeridas.map((a, i) => (
                          <li
                            key={i}
                            className="text-[12px] text-text-on-light flex items-start gap-2"
                          >
                            <ChevronRight className="w-3 h-3 mt-0.5 text-primary shrink-0" strokeWidth={2} />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {data.referencias.length > 0 && (
                    <section>
                      <h3 className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
                        Atalhos
                      </h3>
                      <ul className="space-y-1.5">
                        {data.referencias.map((r) => (
                          <li key={r.href}>
                            <Link
                              href={r.href}
                              className="text-[12px] text-primary hover:underline inline-flex items-center gap-1"
                              data-testid="diagnostic-link"
                            >
                              <ChevronRight className="w-3 h-3" strokeWidth={2} />
                              {r.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
