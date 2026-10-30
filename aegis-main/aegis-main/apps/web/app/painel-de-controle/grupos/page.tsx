'use client';

/**
 * Grupos — Painel de Controle (Onda L.6 · 2026-05-23).
 *
 * IAM Groups (Foundry Groups parity). Um Grupo reúne Usuários para conceder
 * acesso de uma vez — usado em elegibilidade de Marcações e na audiência de
 * Comunicados e Tours, em vez de listar usuários um a um.
 *
 * Gated por `iam.groups.read` (listar) · `iam.groups.write` (criar/renomear/
 * excluir) · `iam.groups.manage_members` (adicionar/remover membros).
 *
 * Membros são adicionados via **dropdown/seletor de usuários** — NUNCA
 * texto-livre de id (memory rule feedback_no_manual_technical_input).
 *
 * Estética Palantir-sharp: zero rounded, zero emoji, ícones lucide-react,
 * focus rings, aria-label. Strings via useT() (pt-BR default + en-US).
 */
import * as React from 'react';
import { Users, X, Plus, Pencil, Trash2, KeyRound } from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { IDENTIDADE_TABS } from '@/components/control-panel/hub-tabs';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/lib/i18n/provider';
import { Groups, Iam, type Group, type GroupMember, type IamUser } from '@/lib/api';
import { rolesApi, type RoleOut } from '@/lib/iam/api';

// W6 — "Grupo concede acesso". Toggles por EXPERIÊNCIA: ligar adiciona o papel
// `acesso_*` ao grupo; desligar remove. Os papéis são semeados no backend
// (DEFAULT_ROLES). A UI nunca digita slug — casa por `key` no catálogo.
const ACCESS_EXPERIENCES = [
  { id: 'aip', roleKey: 'acesso_aip', labelKey: 'groups.accessAip', descKey: 'groups.accessAipDesc' },
  { id: 'agents', roleKey: 'acesso_agents', labelKey: 'groups.accessAgents', descKey: 'groups.accessAgentsDesc' },
  { id: 'solutions', roleKey: 'acesso_solutions', labelKey: 'groups.accessSolutions', descKey: 'groups.accessSolutionsDesc' },
] as const;
const ACCESS_ROLE_KEYS = new Set<string>(ACCESS_EXPERIENCES.map((e) => e.roleKey));

export default function GruposPage() {
  const t = useT();
  const askConfirm = useConfirm();

  const [groups, setGroups] = React.useState<Group[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [managing, setManaging] = React.useState<Group | null>(null);
  const [accessing, setAccessing] = React.useState<Group | null>(null);
  const [editing, setEditing] = React.useState<Group | null>(null);

  const refresh = React.useCallback(() => {
    setErr(null);
    Groups.list()
      .then(setGroups)
      .catch((e) => setErr((e as Error)?.message ?? t('groups.errorTitle')));
  }, [t]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Groups.create({ name: name.trim(), description: description.trim() || undefined });
      setName('');
      setDescription('');
      setShowForm(false);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? t('groups.createError'));
    } finally {
      setBusy(false);
    }
  };

  const del = async (g: Group) => {
    const ok = await askConfirm({
      title: t('groups.confirmDeleteTitle'),
      description: t('groups.confirmDeleteDesc'),
      tone: 'danger',
      confirmLabel: t('groups.confirmDeleteLabel'),
    });
    if (!ok) return;
    try {
      await Groups.delete(g.id);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? t('groups.deleteError'));
    }
  };

  return (
    <RequirePerm perm="iam.groups.read">
      {/* LOTE1 ELO PAGES (#4): a rota /painel-de-controle/grupos virou uma aba do
          hub IAM. Como ela NÃO é servida por app/iam/layout.tsx (só /iam/* são),
          a página monta a MESMA barra (CpHubSubnav) para a navegação por abas
          ficar bidirecional. O highlight casa por pathname (CpHubSubnav usa
          usePathname; ignora ?cp=1). Rota preservada. FIX ELO IAM (#2): group
          conciso "Identidade" (sem duplicar o item de sidenav homônimo). */}
      <CpHubSubnav group="Identidade" tabs={IDENTIDADE_TABS} />
      <CpPageHeader
        title={t('groups.title')}
        subtitle={t('groups.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            data-testid="grupos-toggle-form"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            {showForm ? t('groups.cancel') : t('groups.new')}
          </button>
        }
      />
      <div className="p-6 max-w-3xl space-y-4">
        {showForm && (
          <form
            onSubmit={submit}
            data-testid="grupos-form"
            className="bg-canvas-light border border-border-light p-4 space-y-3"
          >
            <Field label={t('groups.name')}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="grupos-name"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-primary"
              />
            </Field>
            <Field label={t('groups.description')}>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-testid="grupos-description"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-primary"
              />
            </Field>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={busy}
                data-testid="grupos-submit"
                className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {busy ? t('groups.creating') : t('groups.create')}
              </button>
            </div>
          </form>
        )}

        {err && (
          <CpErrorState title={t('groups.errorTitle')} description={err} retry={refresh} />
        )}
        {!groups && !err && <CpSkeleton rows={3} />}
        {groups && groups.length === 0 && (
          <p data-testid="grupos-empty" className="text-[11.5px] text-muted-on-light italic">
            {t('groups.empty')}
          </p>
        )}
        {groups && groups.length > 0 && (
          <ul className="space-y-2" data-testid="grupos-list">
            {groups.map((g) => (
              <li
                key={g.id}
                data-testid={`grupo-${g.id}`}
                className="bg-canvas-light border border-border-light p-3 flex items-start gap-3"
              >
                <span className="inline-flex w-7 h-7 items-center justify-center bg-white border border-border-light shrink-0">
                  <Users className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-text-on-light truncate">{g.name}</p>
                  {g.description && (
                    <p className="text-[11px] text-muted-on-light mt-0.5 truncate">
                      {g.description}
                    </p>
                  )}
                  <p className="text-[10.5px] text-muted-on-light mt-0.5">
                    {g.member_count} {t('groups.memberCount')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAccessing(g)}
                  data-testid={`grupo-roles-open-${g.id}`}
                  className="h-7 px-2 text-[11px] flex items-center gap-1 border border-border-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {t('groups.manageAccess')}
                </button>
                <button
                  type="button"
                  onClick={() => setManaging(g)}
                  data-testid={`grupo-manage-${g.id}`}
                  className="h-7 px-2 text-[11px] flex items-center gap-1 border border-border-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {t('groups.manageMembers')}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(g)}
                  data-testid={`grupo-edit-${g.id}`}
                  className="h-7 w-7 flex items-center justify-center border border-border-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label={t('groups.rename')}
                >
                  <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => del(g)}
                  data-testid={`grupo-delete-${g.id}`}
                  className="h-7 w-7 flex items-center justify-center border border-border-light hover:border-danger hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"
                  aria-label={t('groups.delete')}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {managing && (
        <MembersDialog
          group={managing}
          onClose={() => {
            setManaging(null);
            refresh();
          }}
        />
      )}
      {accessing && (
        <RolesDialog
          group={accessing}
          onClose={() => {
            setAccessing(null);
            refresh();
          }}
        />
      )}
      {editing && (
        <RenameDialog
          group={editing}
          onClose={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
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

/**
 * MembersDialog — gerencia membros via **dropdown de usuários** (nunca id
 * livre). Popula o select de Iam.users.list() menos quem já é membro.
 */
function MembersDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const [members, setMembers] = React.useState<GroupMember[] | null>(null);
  const [allUsers, setAllUsers] = React.useState<IamUser[]>([]);
  const [selected, setSelected] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setErr(null);
    Promise.all([Groups.members.list(group.id), Iam.users.list()])
      .then(([m, u]) => {
        setMembers(m);
        setAllUsers(u);
      })
      .catch((e) => setErr((e as Error)?.message ?? t('groups.membersLoadError')));
  }, [group.id, t]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const memberIds = React.useMemo(
    () => new Set((members ?? []).map((m) => m.user_id)),
    [members],
  );
  const candidates = React.useMemo(
    () => allUsers.filter((u) => !memberIds.has(u.id)),
    [allUsers, memberIds],
  );

  const add = async () => {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      await Groups.members.add(group.id, selected);
      setSelected('');
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? t('groups.memberAddError'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string) => {
    try {
      await Groups.members.remove(group.id, userId);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? t('groups.memberRemoveError'));
    }
  };

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ds-overlay p-4"
      data-testid="grupos-members-dialog"
    >
      <div className="bg-white border border-border-light w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border-light flex items-center gap-3">
          <h2 className="flex-1 text-[14px] font-semibold text-text-on-light truncate">
            {t('groups.membersTitle')} · {group.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="grupos-members-close"
            className="h-7 w-7 flex items-center justify-center border border-border-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={t('groups.close')}
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-end gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label
                htmlFor="grupos-user-select"
                className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold"
              >
                {t('groups.addMember')}
              </label>
              <select
                id="grupos-user-select"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={candidates.length === 0}
                data-testid="grupos-user-select"
                aria-label={t('groups.addMember')}
                className="h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-primary disabled:opacity-50"
              >
                <option value="">
                  {candidates.length === 0
                    ? t('groups.allUsersInGroup')
                    : t('groups.selectUser')}
                </option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name || u.username} ({u.username})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={add}
              disabled={!selected || busy}
              data-testid="grupos-member-add"
              className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
              {t('groups.addMember')}
            </button>
          </div>

          {err && <p className="text-[11.5px] text-danger">{err}</p>}
          {!members && !err && <CpSkeleton rows={2} />}
          {members && members.length === 0 && (
            <p
              data-testid="grupos-members-empty"
              className="text-[11.5px] text-muted-on-light italic"
            >
              {t('groups.membersEmpty')}
            </p>
          )}
          {members && members.length > 0 && (
            <ul className="space-y-1.5" data-testid="grupos-members-list">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  data-testid={`grupo-member-${m.user_id}`}
                  className="bg-canvas-light border border-border-light px-3 py-2 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-text-on-light truncate">
                      {m.display_name || m.username}
                    </p>
                    <p className="text-[10.5px] text-muted-on-light font-mono truncate">
                      {m.username}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(m.user_id)}
                    data-testid={`grupo-member-remove-${m.user_id}`}
                    className="h-7 w-7 flex items-center justify-center border border-border-light hover:border-danger hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"
                    aria-label={t('groups.removeMember')}
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

/**
 * RolesDialog — "Acessos do grupo" (W6 · Grupo concede acesso).
 *
 * Dois eixos, ambos gravando o conjunto inteiro via Groups.roles.replace:
 *  1. Acessos por experiência — Switch por AIP Chat / Agentes / Desenho da
 *     Operação. Ligar adiciona o papel `acesso_*` correspondente ao grupo.
 *  2. Papéis atribuídos — checklist dos demais papéis do catálogo
 *     (rolesApi.list), concedidos por seleção (Switch) — NUNCA slug/ID digitado.
 *
 * Membros do grupo herdam o fecho de permissões dos papéis concedidos (o seed
 * do motor de resolução parte de user_roles ∪ group_roles). O enforcement real
 * é no backend (require_permission "iam.roles.write" no PUT).
 */
function RolesDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const [allRoles, setAllRoles] = React.useState<RoleOut[] | null>(null);
  const [grantedIds, setGrantedIds] = React.useState<Set<string> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setErr(null);
    Promise.all([rolesApi.list(), Groups.roles.list(group.id)])
      .then(([roles, granted]) => {
        setAllRoles(roles);
        setGrantedIds(new Set(granted.map((g) => g.role_id)));
      })
      .catch((e) => setErr((e as Error)?.message ?? t('groups.accessLoadError')));
  }, [group.id, t]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const roleByKey = React.useMemo(() => {
    const m = new Map<string, RoleOut>();
    for (const r of allRoles ?? []) m.set(r.key, r);
    return m;
  }, [allRoles]);

  // Papéis NÃO-experiência viram a checklist; os `acesso_*` viram os toggles.
  const otherRoles = React.useMemo(
    () => (allRoles ?? []).filter((r) => !ACCESS_ROLE_KEYS.has(r.key)),
    [allRoles],
  );

  const replaceWith = React.useCallback(
    async (nextIds: Set<string>) => {
      setBusy(true);
      setErr(null);
      const prev = grantedIds;
      setGrantedIds(nextIds); // otimista
      try {
        const updated = await Groups.roles.replace(group.id, Array.from(nextIds));
        setGrantedIds(new Set((updated ?? []).map((g) => g.role_id)));
      } catch (e) {
        setGrantedIds(prev ?? new Set());
        setErr((e as Error)?.message ?? t('groups.accessSaveError'));
      } finally {
        setBusy(false);
      }
    },
    [group.id, grantedIds, t],
  );

  const toggleRole = React.useCallback(
    (roleId: string) => {
      if (!grantedIds) return;
      const next = new Set(grantedIds);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      void replaceWith(next);
    },
    [grantedIds, replaceWith],
  );

  const loading = !allRoles || !grantedIds;

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ds-overlay p-4"
      data-testid="grupos-roles-dialog"
    >
      <div className="bg-white border border-border-light w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border-light flex items-center gap-3">
          <h2 className="flex-1 text-[14px] font-semibold text-text-on-light truncate">
            {t('groups.accessTitle')} · {group.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="grupos-roles-close"
            className="h-7 w-7 flex items-center justify-center border border-border-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={t('groups.close')}
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {err && <p className="text-[11.5px] text-danger">{err}</p>}
          {loading && !err && <CpSkeleton rows={3} />}

          {!loading && (
            <>
              {/* Acessos por experiência */}
              <section className="space-y-2">
                <div className="flex flex-col gap-0.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                    {t('groups.accessExperiencesLabel')}
                  </p>
                  <p className="text-[11px] text-muted-on-light">
                    {t('groups.accessExperiencesHint')}
                  </p>
                </div>
                <ul className="border border-border-light divide-y divide-border-light">
                  {ACCESS_EXPERIENCES.map((exp) => {
                    const role = roleByKey.get(exp.roleKey);
                    const checked = !!(role && grantedIds?.has(role.id));
                    return (
                      <li
                        key={exp.id}
                        className="px-3 py-2.5 flex items-center gap-3"
                        data-testid={`grupo-access-row-${exp.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-text-on-light">{t(exp.labelKey)}</p>
                          <p className="text-[10.5px] text-muted-on-light">{t(exp.descKey)}</p>
                        </div>
                        <Switch
                          checked={checked}
                          disabled={busy || !role}
                          onCheckedChange={() => role && toggleRole(role.id)}
                          data-testid={`grupo-access-${exp.id}`}
                          aria-label={t(exp.labelKey)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Papéis atribuídos (demais papéis) */}
              <section className="space-y-2">
                <div className="flex flex-col gap-0.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                    {t('groups.rolesLabel')}
                  </p>
                  <p className="text-[11px] text-muted-on-light">{t('groups.rolesHint')}</p>
                </div>
                {otherRoles.length === 0 ? (
                  <p className="text-[11.5px] text-muted-on-light italic">
                    {t('groups.rolesEmpty')}
                  </p>
                ) : (
                  <ul
                    className="border border-border-light divide-y divide-border-light"
                    data-testid="grupo-roles-list"
                  >
                    {otherRoles.map((r) => {
                      const checked = !!grantedIds?.has(r.id);
                      return (
                        <li
                          key={r.id}
                          className="px-3 py-2 flex items-center gap-3"
                          data-testid={`grupo-role-row-${r.key}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-text-on-light truncate flex items-center gap-2">
                              {r.name}
                              {r.is_system && (
                                <span className="text-[9px] font-mono uppercase tracking-wider border border-border-light px-1 py-0.5 text-muted-on-light">
                                  {t('groups.systemRoleBadge')}
                                </span>
                              )}
                            </p>
                            <p className="text-[10.5px] text-muted-on-light font-mono truncate">
                              {r.key}
                            </p>
                          </div>
                          <Switch
                            checked={checked}
                            disabled={busy}
                            onCheckedChange={() => toggleRole(r.id)}
                            data-testid={`grupo-role-${r.key}`}
                            aria-label={r.name}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

function RenameDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const [name, setName] = React.useState(group.name);
  const [description, setDescription] = React.useState(group.description ?? '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Groups.update(group.id, { name: name.trim(), description: description.trim() });
      onClose();
    } catch (e) {
      setErr((e as Error)?.message ?? t('groups.saveError'));
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ds-overlay p-4"
      data-testid="grupos-rename-dialog"
    >
      <form
        onSubmit={save}
        className="bg-white border border-border-light w-full max-w-md p-5 space-y-3"
      >
        <h2 className="text-[14px] font-semibold text-text-on-light">{t('groups.rename')}</h2>
        <Field label={t('groups.name')}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            data-testid="grupos-rename-name"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-primary"
          />
        </Field>
        <Field label={t('groups.description')}>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="grupos-rename-description"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-primary"
          />
        </Field>
        {err && <p className="text-[11.5px] text-danger">{err}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            data-testid="grupos-rename-save"
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {t('groups.save')}
          </button>
          <button
            type="button"
            onClick={onClose}
            data-testid="grupos-rename-cancel"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {t('groups.cancel')}
          </button>
        </div>
      </form>
    </div>
    </ModalPortal>
  );
}
