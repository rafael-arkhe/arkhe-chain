'use client';

/**
 * Painel de Controle · Aprovações
 *
 * Sprint H2 (2026-05-22). 3-pane inbox espelhando
 * `painel-de-controle-research/cp-approvals-inbox.png`:
 * - sub-sidebar esquerdo: Requests to review / My requests / All requests
 *   com subtree Open · Completed · Closed
 * - lista central com itens (ícone + título + status pill + meta)
 * - drawer direito com ações (Approve / Reject / Close)
 */
import * as React from 'react';
import { CheckCircle2, Globe2, Inbox, ListChecks, ShieldAlert, User, X } from 'lucide-react';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { ControlPanel, type CPApproval } from '@/lib/api';
import { cn } from '@/lib/cn';

type Bucket = 'review' | 'mine' | 'all';
type StatusFilter = 'open' | 'completed' | 'closed';

const STATUS_PILL: Record<CPApproval['status'], { label: string; className: string }> = {
  open: { label: 'Aberto', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_progress: { label: 'Em análise', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Aprovado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejeitado', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  closed: { label: 'Fechado', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const STATUS_BUCKETS: Record<StatusFilter, CPApproval['status'][]> = {
  open: ['open', 'in_progress'],
  completed: ['approved', 'rejected'],
  closed: ['closed'],
};

export default function AprovacoesPage() {
  const [bucket, setBucket] = React.useState<Bucket>('all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('open');
  const [all, setAll] = React.useState<CPApproval[]>([]);
  const [selected, setSelected] = React.useState<CPApproval | null>(null);
  const [rationale, setRationale] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await ControlPanel.approvals.list({ bucket });
      setAll(list);
    } finally {
      setLoading(false);
    }
  }, [bucket]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = React.useMemo(
    () => all.filter((a) => STATUS_BUCKETS[statusFilter].includes(a.status)),
    [all, statusFilter],
  );

  const counts = React.useMemo(
    () => ({
      open: all.filter((a) => STATUS_BUCKETS.open.includes(a.status)).length,
      completed: all.filter((a) => STATUS_BUCKETS.completed.includes(a.status)).length,
      closed: all.filter((a) => STATUS_BUCKETS.closed.includes(a.status)).length,
      total: all.length,
    }),
    [all],
  );

  const decide = async (action: 'approve' | 'reject' | 'close') => {
    if (!selected) return;
    const fn = ControlPanel.approvals[action];
    const updated = await fn(selected.id, rationale || undefined);
    setSelected(updated);
    setRationale('');
    await load();
  };

  return (
    <div className="flex flex-col h-full">
      <CpPageHeader title="Aprovações" subtitle="Solicite, aprove e mantenha o histórico de fluxos sensíveis." />

      <div className="flex-1 flex overflow-hidden">
        <aside
          data-testid="cp-aprovacoes-tree"
          className="w-[260px] shrink-0 bg-white border-r border-border-light flex flex-col py-2 overflow-y-auto"
        >
          <BucketRow
            icon={Inbox}
            label="A revisar"
            active={bucket === 'review'}
            count={counts.open}
            onClick={() => setBucket('review')}
            testId="cp-aprovacoes-bucket-review"
          />
          <BucketRow
            icon={User}
            label="Minhas solicitações"
            active={bucket === 'mine'}
            count={counts.total}
            onClick={() => setBucket('mine')}
            testId="cp-aprovacoes-bucket-mine"
          />
          <BucketRow
            icon={ListChecks}
            label="Todas"
            active={bucket === 'all'}
            count={counts.total}
            onClick={() => setBucket('all')}
            testId="cp-aprovacoes-bucket-all"
          />
          <div className="mt-1 pl-7">
            <SubRow label="Abertas" count={counts.open} active={statusFilter === 'open'} onClick={() => setStatusFilter('open')} testId="cp-aprovacoes-status-open" />
            <SubRow label="Concluídas" count={counts.completed} active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} testId="cp-aprovacoes-status-completed" />
            <SubRow label="Fechadas" count={counts.closed} active={statusFilter === 'closed'} onClick={() => setStatusFilter('closed')} testId="cp-aprovacoes-status-closed" />
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-white">
          <header className="px-5 py-3 border-b border-border-light flex items-center gap-3">
            <h2 className="text-[14px] font-semibold text-text-on-light">
              {statusLabel(statusFilter)} ({visible.length})
            </h2>
          </header>
          {loading ? (
            <p className="px-5 py-6 text-[12px] text-muted-on-light italic">Carregando…</p>
          ) : visible.length === 0 ? (
            <EmptyState />
          ) : (
            <ul data-testid="cp-aprovacoes-list">
              {visible.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    'px-5 py-3 border-b border-border-light hover:bg-canvas-light cursor-pointer flex items-start gap-3',
                    selected?.id === a.id && 'bg-primary/5',
                  )}
                  data-testid={`cp-aprovacao-row-${a.id}`}
                  onClick={() => setSelected(a)}
                >
                  <Globe2 className="w-4 h-4 text-muted-on-light mt-0.5 shrink-0" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-primary truncate">{a.title}</p>
                    <p className="text-[11px] text-muted-on-light mt-0.5">
                      Criado por {a.requester_id} em {fmtDate(a.submitted_at)}
                    </p>
                  </div>
                  <span className={cn('px-2 h-5 border text-[10.5px] flex items-center', STATUS_PILL[a.status].className)}>
                    {STATUS_PILL[a.status].label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </main>

        {selected && (
          <aside
            data-testid="cp-aprovacao-drawer"
            className="w-[380px] shrink-0 bg-white border-l border-border-light flex flex-col overflow-y-auto"
          >
            <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-primary" strokeWidth={1.5} />
              <h3 className="flex-1 text-[13px] font-semibold text-text-on-light truncate">
                {selected.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Fechar"
                className="text-muted-on-light hover:text-text-on-light"
                data-testid="cp-aprovacao-drawer-close"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </header>
            <div className="px-4 py-3 text-[12px] space-y-2">
              <Field label="Status">
                <span className={cn('inline-flex px-2 h-5 border text-[10.5px] items-center', STATUS_PILL[selected.status].className)}>
                  {STATUS_PILL[selected.status].label}
                </span>
              </Field>
              <Field label="Tipo de recurso">{selected.resource_kind}</Field>
              {selected.resource_id && (
                <Field label="ID do recurso" mono>
                  {selected.resource_id}
                </Field>
              )}
              <Field label="Ação solicitada">{selected.action}</Field>
              <Field label="Solicitante" mono>
                {selected.requester_id}
              </Field>
              <Field label="Submetido em">{fmtDate(selected.submitted_at)}</Field>
              {selected.decided_at && (
                <Field label="Decidido em">{fmtDate(selected.decided_at)}</Field>
              )}
              {selected.decided_by_id && (
                <Field label="Decidido por" mono>
                  {selected.decided_by_id}
                </Field>
              )}
              {selected.rationale && (
                <Field label="Justificativa">{selected.rationale}</Field>
              )}
            </div>

            {selected.status === 'open' || selected.status === 'in_progress' ? (
              <div className="px-4 py-3 border-t border-border-light space-y-2">
                <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
                  Justificativa (opcional)
                </label>
                <textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  rows={4}
                  data-testid="cp-aprovacao-rationale"
                  className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                  placeholder="Explique o motivo da decisão (será registrado)…"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decide('approve')}
                    data-testid="cp-aprovacao-approve"
                    className="flex-1 h-8 px-3 text-[12px] bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => decide('reject')}
                    data-testid="cp-aprovacao-reject"
                    className="flex-1 h-8 px-3 text-[12px] bg-rose-600 text-white hover:bg-rose-700"
                  >
                    Rejeitar
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => decide('close')}
                  data-testid="cp-aprovacao-close"
                  className="w-full h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
                >
                  Fechar sem decidir
                </button>
              </div>
            ) : null}
          </aside>
        )}
      </div>
    </div>
  );
}

function BucketRow({
  icon: Icon,
  label,
  active,
  count,
  onClick,
  testId,
}: {
  icon: typeof Inbox;
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'w-full h-8 px-3 flex items-center gap-2 text-[12px] transition-colors',
        active ? 'bg-primary/10 text-primary font-medium' : 'text-text-on-light hover:bg-canvas-light',
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
      <span className="flex-1 text-left truncate">{label}</span>
      <span className="text-[10px] text-muted-on-light font-mono">{count}</span>
    </button>
  );
}

function SubRow({
  label,
  count,
  active,
  onClick,
  testId,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'w-full h-7 px-3 flex items-center justify-between text-[11.5px]',
        active ? 'text-primary font-medium' : 'text-muted-on-light hover:text-text-on-light',
      )}
    >
      <span>{label}</span>
      <span className="text-[10px] font-mono">{count}</span>
    </button>
  );
}

function Field({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        {label}
      </p>
      <p className={cn('text-[12px] text-text-on-light mt-0.5', mono && 'font-mono')}>{children}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-5 py-10 text-center" data-testid="cp-aprovacoes-empty">
      <Inbox className="w-8 h-8 text-muted-on-light/40 mx-auto" strokeWidth={1.5} />
      <p className="mt-2 text-[12px] text-muted-on-light">Nenhuma aprovação nesta seleção.</p>
    </div>
  );
}

function statusLabel(s: StatusFilter) {
  return s === 'open' ? 'Solicitações abertas' : s === 'completed' ? 'Concluídas' : 'Fechadas';
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
