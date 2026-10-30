'use client';

/**
 * Convidados — Painel de Controle (Sprint Foundry-B · 2026-05-22).
 *
 * Lista os Convidados (Foundry guest memberships) da Organização ativa
 * do operador (a "Organização de origem" no contexto Foundry).
 *
 * Cada Convidado é um Usuário cuja Organização de origem é outra, mas
 * recebeu acesso temporário/permanente a esta. Gated por
 * `organization.read` (listar) e `organization.invite_guest` (convidar/
 * revogar).
 *
 * Formulário simples nesta iteração — UI mais rica (search de Usuário,
 * picker de validade, exibição de Organização de origem) vai em
 * iterações subsequentes da Fase B.
 */
import * as React from 'react';
import { UserPlus, X } from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { ACESSO_ORG_TABS } from '@/components/control-panel/hub-tabs';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { useT } from '@/lib/i18n/provider';
import { Organizations, type OrganizationGuest } from '@/lib/api';
import { useAuth } from '@/lib/auth/useAuth';

export default function ConvidadosPage() {
  const askConfirm = useConfirm();
  const t = useT();
  const { principal } = useAuth();
  const orgId = principal?.tenant?.id;

  const [guests, setGuests] = React.useState<OrganizationGuest[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [userId, setUserId] = React.useState('');
  const [expiresAt, setExpiresAt] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [includeRevoked, setIncludeRevoked] = React.useState(false);

  const refresh = React.useCallback(() => {
    if (!orgId) return;
    setErr(null);
    Organizations.guests
      .list(orgId, includeRevoked)
      .then(setGuests)
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar Convidados'));
  }, [orgId, includeRevoked]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !userId.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Organizations.guests.invite(orgId, {
        user_id: userId.trim(),
        expires_at: expiresAt.trim() || undefined,
      });
      setUserId('');
      setExpiresAt('');
      setShowForm(false);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao convidar Usuário');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (uid: string) => {
    if (!orgId) return;
    const ok = await askConfirm({
      title: 'Revogar este Convidado?',
      description:
        'O usuário perde acesso a esta Organização. A revogação é registrada em audit (LineageEvent) e pode ser revertida criando um novo convite.',
      tone: 'warning',
      confirmLabel: 'Revogar',
    });
    if (!ok) return;
    try {
      await Organizations.guests.revoke(orgId, uid);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao revogar');
    }
  };

  return (
    <RequirePerm perm="organization.read">
      <CpPageHeader
        title={t('guests.title')}
        subtitle={t('guests.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            data-testid="convidados-toggle-form"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" strokeWidth={1.5} />
            {showForm ? 'Cancelar' : 'Convidar'}
          </button>
        }
      />
      <CpHubSubnav group="Organizações" tabs={ACESSO_ORG_TABS} />
      <div className="p-6 max-w-3xl space-y-4">
        {showForm && (
          <form
            onSubmit={submit}
            data-testid="convidados-form"
            className="bg-canvas-light border border-border-light p-4 space-y-3"
          >
            <Field label="ID do Usuário (UUID)">
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                data-testid="convidados-user-id"
                placeholder="00000000-0000-0000-0000-000000000000"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
              />
            </Field>
            <Field label="Validade (ISO 8601 · opcional)">
              <input
                type="text"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                data-testid="convidados-expires"
                placeholder="2027-12-31T23:59:59Z (deixe vazio = sem validade)"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
              />
            </Field>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={busy}
                data-testid="convidados-submit"
                className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? 'Convidando…' : 'Convidar'}
              </button>
            </div>
          </form>
        )}

        {err && (
          <CpErrorState
            title={t('guests.errorTitle')}
            description={err}
            retry={refresh}
          />
        )}
        {!guests && !err && <CpSkeleton rows={3} />}
        {guests && (
          <div
            className="flex items-center gap-3"
            data-testid="convidados-toolbar"
          >
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('guests.filterPlaceholder')}
              data-testid="convidados-filter"
              className="flex-1 h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-muted-on-light">
              <input
                type="checkbox"
                checked={includeRevoked}
                onChange={(e) => setIncludeRevoked(e.target.checked)}
                data-testid="convidados-include-revoked"
              />
              {t('guests.includeRevoked')}
            </label>
          </div>
        )}
        {guests && guests.length === 0 && (
          <p
            data-testid="convidados-empty"
            className="text-[11.5px] text-muted-on-light italic"
          >
            {t('guests.empty')}
          </p>
        )}
        {guests && guests.length > 0 && (
          <ul className="space-y-2" data-testid="convidados-list">
            {guests
              .filter((g) => {
                if (!filter.trim()) return true;
                return g.user_id.toLowerCase().includes(filter.trim().toLowerCase());
              })
              .map((g) => (
              <li
                key={g.id}
                data-testid={`convidado-${g.user_id}`}
                className="bg-canvas-light border border-border-light p-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-mono text-text-on-light truncate">
                    {g.user_id}
                  </p>
                  <p className="text-[10.5px] text-muted-on-light mt-0.5">
                    {t('guests.invitedAt')}{' '}
                    {new Date(g.granted_at).toLocaleDateString('pt-BR')}
                    {g.expires_at && (
                      <>
                        {' '}· {t('guests.expiresAtLabel')}{' '}
                        {new Date(g.expires_at).toLocaleDateString('pt-BR')}
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(g.user_id)}
                  data-testid={`convidado-revoke-${g.user_id}`}
                  className="h-7 w-7 flex items-center justify-center border border-border-light hover:border-danger hover:text-danger"
                  aria-label="Revogar Convidado"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </RequirePerm>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        {label}
      </p>
      {children}
    </div>
  );
}
