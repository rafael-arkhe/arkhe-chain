'use client';

/**
 * MarkingEligibilityDialog — Onda R.1 (2026-05-23).
 *
 * Gerencia a ELEGIBILIDADE de uma Marcação: quem (Usuários E Grupos) pode
 * ver/aplicar recursos marcados. Reusa os endpoints existentes (Onda L.6):
 *   - Markings.eligibility.list / grant / revoke / revokeGroup
 *   - Iam.users.list() · Groups.list() para popular os seletores.
 *
 * O sujeito (usuário OU grupo) é escolhido por **dropdown/seletor** — NUNCA
 * id em texto livre (memory rule feedback_no_manual_technical_input). Um
 * toggle Usuário/Grupo troca a fonte do select.
 *
 * Estética Palantir-sharp: zero rounded, zero emoji, ícones lucide-react,
 * focus rings, aria-label. Strings via useT() (pt-BR default + en-US peer).
 *
 * Grant/revoke emitem LineageEvent no backend (markings.eligibility.{grant,
 * revoke}) — auditoria garantida no servidor.
 */
import * as React from 'react';
import { ShieldCheck, X, Plus, User, Users } from 'lucide-react';
import { CpSkeleton } from '@/components/control-panel/cp-skeleton';
import { useT } from '@/lib/i18n/provider';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import {
  Markings,
  Iam,
  Groups,
  type Marking,
  type MarkingEligibility,
  type IamUser,
  type Group,
} from '@/lib/api';

type SubjectKind = 'user' | 'group';

export function MarkingEligibilityDialog({
  marking,
  onClose,
}: {
  marking: Marking;
  onClose: () => void;
}) {
  const t = useT();
  const [rows, setRows] = React.useState<MarkingEligibility[] | null>(null);
  const [users, setUsers] = React.useState<IamUser[]>([]);
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  const [kind, setKind] = React.useState<SubjectKind>('user');
  const [selected, setSelected] = React.useState('');
  const [canApply, setCanApply] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(() => {
    setErr(null);
    Promise.all([
      Markings.eligibility.list(marking.id),
      Iam.users.list(),
      Groups.list({ limit: 500 }),
    ])
      .then(([e, u, g]) => {
        setRows(e);
        setUsers(u);
        setGroups(g);
      })
      .catch((e) => setErr((e as Error)?.message ?? t('marcacoes.eligibility.errorLoad')));
  }, [marking.id, t]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // Reset selection whenever the subject kind toggles.
  React.useEffect(() => {
    setSelected('');
  }, [kind]);

  const userRows = React.useMemo(
    () => (rows ?? []).filter((r) => r.user_id),
    [rows],
  );
  const groupRows = React.useMemo(
    () => (rows ?? []).filter((r) => r.group_id),
    [rows],
  );

  const eligibleUserIds = React.useMemo(
    () => new Set(userRows.map((r) => r.user_id as string)),
    [userRows],
  );
  const eligibleGroupIds = React.useMemo(
    () => new Set(groupRows.map((r) => r.group_id as string)),
    [groupRows],
  );

  const userCandidates = React.useMemo(
    () => users.filter((u) => !eligibleUserIds.has(u.id)),
    [users, eligibleUserIds],
  );
  const groupCandidates = React.useMemo(
    () => groups.filter((g) => !eligibleGroupIds.has(g.id)),
    [groups, eligibleGroupIds],
  );

  const userName = React.useCallback(
    (id: string | null) => {
      const u = users.find((x) => x.id === id);
      return u ? u.display_name || u.username : t('marcacoes.eligibility.unknownSubject');
    },
    [users, t],
  );
  const groupName = React.useCallback(
    (id: string | null) => {
      const g = groups.find((x) => x.id === id);
      return g ? g.name : t('marcacoes.eligibility.unknownSubject');
    },
    [groups, t],
  );

  const candidates = kind === 'user' ? userCandidates : groupCandidates;

  const grant = async () => {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      await Markings.eligibility.grant(marking.id, {
        ...(kind === 'user' ? { user_id: selected } : { group_id: selected }),
        can_apply: canApply,
      });
      setSelected('');
      setCanApply(false);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao conceder elegibilidade');
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (userId: string) => {
    setErr(null);
    try {
      await Markings.eligibility.revoke(marking.id, userId);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao remover elegibilidade');
    }
  };

  const removeGroup = async (groupId: string) => {
    setErr(null);
    try {
      await Markings.eligibility.revokeGroup(marking.id, groupId);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao remover elegibilidade');
    }
  };

  const KindButton = ({ value, icon: Icon, label }: { value: SubjectKind; icon: typeof User; label: string }) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      data-testid={`marcacoes-eligibility-kind-${value}`}
      aria-pressed={kind === value}
      className={`h-8 px-3 text-[12px] flex items-center gap-1.5 border focus:outline-none focus:ring-2 focus:ring-primary ${
        kind === value
          ? 'bg-primary text-white border-primary'
          : 'bg-white border-border-light hover:border-primary text-text-on-light'
      }`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      {label}
    </button>
  );

  const isEmpty = rows !== null && userRows.length === 0 && groupRows.length === 0;

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="marcacoes-eligibility-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-white border border-border-light shadow-2xl text-text-on-light max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2 sticky top-0 bg-white z-10">
          <ShieldCheck className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1 truncate">
            {t('marcacoes.eligibility.title').replace('{name}', marking.display_name)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            data-testid="marcacoes-eligibility-close"
            className="text-muted-on-light hover:text-text-on-light focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-4">
          <p className="text-[11.5px] text-muted-on-light">
            {t('marcacoes.eligibility.intro')}
          </p>

          {/* Add row: subject-kind toggle + dropdown (never free-text id) */}
          <div className="bg-canvas-light border border-border-light p-3 space-y-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                {t('marcacoes.eligibility.subjectKind')}
              </span>
              <div className="flex items-center gap-2" data-testid="marcacoes-eligibility-kind">
                <KindButton value="user" icon={User} label={t('marcacoes.eligibility.kindUser')} />
                <KindButton value="group" icon={Users} label={t('marcacoes.eligibility.kindGroup')} />
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 flex flex-col gap-1">
                <label
                  htmlFor="marcacoes-eligibility-select"
                  className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold"
                >
                  {kind === 'user'
                    ? t('marcacoes.eligibility.kindUser')
                    : t('marcacoes.eligibility.kindGroup')}
                </label>
                <select
                  id="marcacoes-eligibility-select"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  disabled={candidates.length === 0}
                  data-testid="marcacoes-eligibility-select"
                  aria-label={
                    kind === 'user'
                      ? t('marcacoes.eligibility.selectUser')
                      : t('marcacoes.eligibility.selectGroup')
                  }
                  className="h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">
                    {candidates.length === 0
                      ? kind === 'user'
                        ? t('marcacoes.eligibility.allUsersEligible')
                        : t('marcacoes.eligibility.allGroupsEligible')
                      : kind === 'user'
                        ? t('marcacoes.eligibility.selectUser')
                        : t('marcacoes.eligibility.selectGroup')}
                  </option>
                  {kind === 'user'
                    ? userCandidates.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name || u.username} ({u.username})
                        </option>
                      ))
                    : groupCandidates.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                </select>
              </div>
              <button
                type="button"
                onClick={grant}
                disabled={!selected || busy}
                data-testid="marcacoes-eligibility-grant"
                className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                {busy ? t('marcacoes.eligibility.granting') : t('marcacoes.eligibility.grant')}
              </button>
            </div>

            <label className="flex items-center gap-1.5 text-[11px] text-muted-on-light">
              <input
                type="checkbox"
                checked={canApply}
                onChange={(e) => setCanApply(e.target.checked)}
                data-testid="marcacoes-eligibility-can-apply"
                className="focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {t('marcacoes.eligibility.canApply')}
            </label>
          </div>

          {err && (
            <p className="text-[11px] text-danger font-mono" data-testid="marcacoes-eligibility-error">
              {err}
            </p>
          )}
          {!rows && !err && <CpSkeleton rows={2} />}
          {isEmpty && (
            <p
              data-testid="marcacoes-eligibility-empty"
              className="text-[11.5px] text-muted-on-light italic"
            >
              {t('marcacoes.eligibility.empty')}
            </p>
          )}

          {userRows.length > 0 && (
            <section data-testid="marcacoes-eligibility-users">
              <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-on-light mb-1.5 flex items-center gap-1.5">
                <User className="w-3 h-3" strokeWidth={1.5} />
                {t('marcacoes.eligibility.usersHeader')}
              </p>
              <ul className="space-y-1">
                {userRows.map((r) => (
                  <li
                    key={r.id}
                    data-testid={`marcacoes-eligibility-user-${r.user_id}`}
                    className="bg-canvas-light border border-border-light px-3 py-2 flex items-center gap-2"
                  >
                    <span className="flex-1 min-w-0 text-[12px] truncate">{userName(r.user_id)}</span>
                    {r.can_apply && (
                      <span className="text-[10px] font-mono border border-primary text-primary px-1.5 h-4 inline-flex items-center">
                        {t('marcacoes.eligibility.canApplyBadge')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeUser(r.user_id as string)}
                      data-testid={`marcacoes-eligibility-user-remove-${r.user_id}`}
                      aria-label={t('marcacoes.eligibility.remove')}
                      className="h-7 w-7 flex items-center justify-center bg-white border border-border-light hover:border-danger hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {groupRows.length > 0 && (
            <section data-testid="marcacoes-eligibility-groups">
              <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-on-light mb-1.5 flex items-center gap-1.5">
                <Users className="w-3 h-3" strokeWidth={1.5} />
                {t('marcacoes.eligibility.groupsHeader')}
              </p>
              <ul className="space-y-1">
                {groupRows.map((r) => (
                  <li
                    key={r.id}
                    data-testid={`marcacoes-eligibility-group-${r.group_id}`}
                    className="bg-canvas-light border border-border-light px-3 py-2 flex items-center gap-2"
                  >
                    <span className="flex-1 min-w-0 text-[12px] truncate">{groupName(r.group_id)}</span>
                    {r.can_apply && (
                      <span className="text-[10px] font-mono border border-primary text-primary px-1.5 h-4 inline-flex items-center">
                        {t('marcacoes.eligibility.canApplyBadge')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeGroup(r.group_id as string)}
                      data-testid={`marcacoes-eligibility-group-remove-${r.group_id}`}
                      aria-label={t('marcacoes.eligibility.remove')}
                      className="h-7 w-7 flex items-center justify-center bg-white border border-border-light hover:border-danger hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
