'use client';

/**
 * Onda 2 — Acessos públicos (Painel de Controle).
 *
 * O operador emite/revoga links de acesso para morador/visitante. Cada link é
 * um token vinculado a Ações específicas (ex.: abrir o portão), com expiração
 * obrigatória e usos opcionais. O token (plaintext) aparece uma única vez na
 * emissão — é o que vira o link `/m/<token>`.
 */
import * as React from 'react';
import { KeyRound, Plus, Trash2, X, Copy, Check, Clock } from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { IDENTIDADE_TABS } from '@/components/control-panel/hub-tabs';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  GuestTokens,
  ActionTypes,
  type GuestTokenOut,
  type GuestTokenIssued,
  type ActionTypeOut,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { formatDataHoraBR } from '@/lib/datetime';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

export default function AcessosPublicosPage() {
  return (
    <RequirePerm perm="public.token.read">
      {/* LOTE1 ELO PAGES (#4): /painel-de-controle/acessos-publicos virou aba do
          hub IAM. Como a rota NÃO é servida por app/iam/layout (só /iam/*), a
          página monta a MESMA barra (CpHubSubnav) — navegação por abas
          bidirecional, highlight por pathname (ignora ?cp=1). Rota preservada.
          FIX ELO IAM (#2): group conciso "Identidade" (sem duplicar o sidenav). */}
      <CpHubSubnav group="Identidade" tabs={IDENTIDADE_TABS} />
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const [items, setItems] = React.useState<GuestTokenOut[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const askConfirm = useConfirm();

  const refresh = React.useCallback(() => {
    setErr(null);
    GuestTokens.list().then(setItems).catch((e) => setErr(humanise(e)));
  }, []);
  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function onRevoke(t: GuestTokenOut) {
    const ok = await askConfirm({
      title: 'Revogar acesso',
      description: `O link de "${t.subject || t.label || 'acesso'}" deixará de funcionar imediatamente.`,
      confirmLabel: 'Revogar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await GuestTokens.revoke(t.id);
      refresh();
    } catch (e) {
      setErr(humanise(e));
    }
  }

  return (
    <div data-testid="acessos-publicos-page">
      <CpPageHeader
        title="Acessos públicos"
        subtitle="Links de acesso para morador/visitante — cada link executa só as Ações que você autorizar (ex.: abrir o portão). Expira e pode ser revogado a qualquer momento."
        actions={
          <RequirePerm perm="public.token.issue" fallback={null}>
            <Button onClick={() => setCreating(true)} data-testid="ap-new" className="h-8 text-[12px]">
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
              Emitir acesso
            </Button>
          </RequirePerm>
        }
      />
      <div className="p-6 space-y-4">
        {err && (
          <CpErrorState
            title="Falha ao carregar acessos"
            description={err}
            retry={refresh}
            diagnostic={{ path: '/platform/v23/guest-tokens', message: err }}
          />
        )}
        {!items && !err && <CpSkeleton rows={4} />}
        {items && items.length === 0 && (
          <CpEmptyState
            icon={KeyRound}
            title="Nenhum acesso público emitido"
            description="Emita um link para um morador abrir o portão (ou usar uma Ação específica) sem precisar de login."
          />
        )}
        {items && items.length > 0 && (
          <ul className="space-y-2" data-testid="ap-list">
            {items.map((t) => (
              <li
                key={t.id}
                className="bg-white border border-border-light p-3 flex items-start justify-between gap-3"
                data-testid={`ap-row-${t.id}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-text-on-light">
                      {t.subject || t.label || 'Acesso'}
                    </span>
                    {t.revoked && (
                      <span className="text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 bg-danger/10 text-danger border border-danger/30">
                        revogado
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-on-light mt-1 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" strokeWidth={1.5} />
                      {t.expires_at ? formatDataHoraBR(t.expires_at) : '—'}
                    </span>
                    <span>· {t.allowed_action_ids.length} ação(ões)</span>
                    <span>
                      · {t.use_count} uso(s){t.max_uses ? ` / ${t.max_uses}` : ''}
                    </span>
                  </p>
                </div>
                {!t.revoked && (
                  <RequirePerm perm="public.token.revoke" fallback={null}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-danger hover:bg-danger/10"
                      onClick={() => onRevoke(t)}
                      data-testid={`ap-revoke-${t.id}`}
                      title="Revogar"
                      aria-label={`Revogar ${t.subject || t.label}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </Button>
                  </RequirePerm>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {creating && (
        <IssueDialog onClose={() => setCreating(false)} onIssued={() => { setCreating(false); refresh(); }} />
      )}
    </div>
  );
}

function IssueDialog({ onClose, onIssued }: { onClose: () => void; onIssued: () => void }) {
  const [actions, setActions] = React.useState<ActionTypeOut[] | null>(null);
  const [subject, setSubject] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [ttlHours, setTtlHours] = React.useState(24);
  const [maxUses, setMaxUses] = React.useState('');
  const [issued, setIssued] = React.useState<GuestTokenIssued | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    ActionTypes.list().then(setActions).catch((e) => setErr(humanise(e)));
  }, []);

  function toggle(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const link = issued
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/m/${issued.token}`
    : '';

  async function issue() {
    setErr(null);
    if (selected.size === 0) {
      setErr('Escolha ao menos uma Ação que este acesso pode executar.');
      return;
    }
    setSaving(true);
    try {
      const r = await GuestTokens.issue({
        subject,
        label: subject,
        allowed_action_ids: [...selected],
        ttl_hours: ttlHours,
        max_uses: maxUses.trim() ? Number(maxUses) : null,
      });
      setIssued(r);
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — operator can select the field */
    }
  }

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 ds-overlay flex justify-end"
      onClick={onClose}
      data-testid="ap-issue"
      role="dialog"
      aria-modal="true"
    >
      <aside
        className="w-full max-w-[520px] h-full bg-canvas-light border-l border-border-light overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-light p-4 flex items-start justify-between bg-white">
          <h2 className="text-sm font-semibold text-text-on-light">
            {issued ? 'Acesso emitido' : 'Emitir acesso público'}
          </h2>
          <button onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4 text-muted-on-light hover:text-text-on-light" strokeWidth={1.5} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {err && (
            <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30" role="alert">
              {err}
            </div>
          )}
          {issued ? (
            <div className="space-y-3" data-testid="ap-issued">
              <p className="text-[12px] text-text-on-light">
                Copie o link e envie ao morador/visitante. Ele aparece{' '}
                <strong>uma única vez</strong>.
              </p>
              <div className="flex items-center gap-1">
                <Input
                  readOnly
                  value={link}
                  className="bg-white font-mono text-[11px] h-8"
                  data-testid="ap-issued-link"
                  aria-label="Link do acesso"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button variant="outline" size="sm" className="h-8" onClick={copy} data-testid="ap-copy">
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-success" strokeWidth={1.5} />
                  ) : (
                    <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                  )}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
              <p className="text-[10px] text-muted-on-light">
                Expira em {ttlHours}h{maxUses.trim() ? ` · ${maxUses} uso(s)` : ''}.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  Para quem (identificação)
                </Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex.: Unidade 101 — visitante João"
                  className="bg-white"
                  data-testid="ap-subject"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  Ações permitidas
                </Label>
                {actions === null && <CpSkeleton rows={3} />}
                {actions && actions.length === 0 && (
                  <p className="text-[11px] text-muted-on-light italic">
                    Nenhuma Ação cadastrada. Crie uma em Ações primeiro.
                  </p>
                )}
                {actions &&
                  actions.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 text-[12px] py-0.5 cursor-pointer"
                      data-testid={`ap-action-${a.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggle(a.id)}
                      />
                      <span className="font-semibold text-text-on-light">{a.name}</span>
                      <span className="text-[10px] font-mono text-muted-on-light truncate">
                        {a.code_ref}
                      </span>
                    </label>
                  ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Expira em (horas)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={2160}
                    value={ttlHours}
                    onChange={(e) => setTtlHours(Number(e.target.value))}
                    className="bg-white"
                    data-testid="ap-ttl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Usos máximos (opcional)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    placeholder="ilimitado"
                    className="bg-white"
                    data-testid="ap-maxuses"
                  />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="border-t border-border-light p-4 flex justify-end gap-2 sticky bottom-0 bg-canvas-light">
          {issued ? (
            <Button onClick={onIssued} data-testid="ap-done">
              Concluir
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button
                variant="success"
                onClick={issue}
                disabled={saving || selected.size === 0}
                data-testid="ap-issue-submit"
              >
                {saving ? 'Emitindo…' : 'Emitir link'}
              </Button>
            </>
          )}
        </div>
      </aside>
    </div>
    </ModalPortal>
  );
}
