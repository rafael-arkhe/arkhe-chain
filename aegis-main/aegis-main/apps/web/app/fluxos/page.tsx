'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Workflow as WorkflowIcon } from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { Flows, type FlowOut } from '@/lib/api/flows';
import { formatDataHoraBR } from '@/lib/datetime';
import { cn } from '@/lib/cn';

/**
 * Lista de fluxos de ingestão/automação.
 *
 * Consome `/campaign/flows` do ontology-module (reusado: a tenant
 * security recebe `campaign.flows.read` por cross-grant na role
 * operator). Sprint 2 vai trazer o editor visual e detail page.
 */

const STATUS_STYLE: Record<string, string> = {
  draft: 'border-border-light text-muted-on-light',
  active: 'border-success text-success bg-success/10',
  archived: 'border-border-light text-muted-on-light bg-raised-light/40',
};

export default function FluxosPage() {
  const router = useRouter();
  const [rows, setRows] = React.useState<FlowOut[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    Flows.list()
      .then((r) => {
        if (!cancelled) {
          setRows(r);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function novoFluxo() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await Flows.create({
        slug: `fluxo-${Date.now().toString(36)}`,
        name: 'Novo fluxo',
        description: '',
        graph: {
          nodes: [
            {
              id: 'trg',
              type: 'trigger.manual',
              label: 'Início manual',
              position: { x: 100, y: 200 },
              config: {},
            },
          ],
          edges: [],
        },
        variables: {},
        trigger: { type: 'manual', config: {} },
      });
      router.push(`/fluxos/${created.id}/editar`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  }

  return (
    <RequirePerm perm="security.fluxos.view">
      <PageShell
        title="Fluxos"
        subtitle={
          loading
            ? 'Carregando…'
            : `${rows.length} fluxo${rows.length === 1 ? '' : 's'} · disparam coleta, enriquecimento e correlação`
        }
        theme="light"
        toolbar={
          <button
            type="button"
            data-testid="fluxos-novo"
            onClick={() => void novoFluxo()}
            disabled={creating}
            className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5 disabled:opacity-60"
          >
            {creating ? (
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            ) : (
              <Plus className="w-3 h-3" strokeWidth={1.5} />
            )}
            {creating ? 'Criando…' : 'Novo fluxo'}
          </button>
        }
      >
        <div className="h-full overflow-y-auto p-4">
          <div className="bg-canvas-light border border-border-light">
            <div className="h-9 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light/40">
              <WorkflowIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
              <p className="text-[10px] uppercase tracking-[0.16em] font-semibold flex-1">
                Fluxos · {rows.length}
              </p>
            </div>

            {error && (
              <div className="px-3 py-2 text-[11px] font-mono text-danger border-b border-border-light">
                {error}
              </div>
            )}

            {!loading && rows.length === 0 && !error && (
              <div className="px-3 py-8 text-center text-[11px] text-muted-on-light">
                Nenhum fluxo nesta tenant. Clique em{' '}
                <strong>Novo fluxo</strong> para criar o primeiro.
              </div>
            )}

            <ul className="divide-y divide-border-light/60">
              {rows.map((f) => (
                <li
                  key={f.id}
                  data-testid={`fluxo-row-${f.id}`}
                  className="px-3 py-2 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[12px] font-medium truncate">{f.name}</p>
                      <span
                        className={cn(
                          'px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border',
                          STATUS_STYLE[f.status] ?? STATUS_STYLE.draft,
                        )}
                      >
                        {f.status}
                      </span>
                      {f.trigger?.type && (
                        <span className="text-[10px] font-mono text-muted-on-light">
                          trigger: {f.trigger.type}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-muted-on-light truncate">
                      {f.slug}
                      {f.updated_at ? ` · ${formatDataHoraBR(f.updated_at)}` : ''}
                      {f.graph?.nodes?.length
                        ? ` · ${f.graph.nodes.length} nós`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      href={`/fluxos/${f.id}`}
                      className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary"
                    >
                      Abrir
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PageShell>
    </RequirePerm>
  );
}
