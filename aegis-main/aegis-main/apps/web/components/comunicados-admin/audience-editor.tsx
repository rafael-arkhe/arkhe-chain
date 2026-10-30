'use client';

/**
 * Onda I.5 (2026-05-23) — AudienceEditor.
 *
 * Multi-select compacto de roles (Iam.roles.list) + perms
 * (Iam.permissions.list). null/[] = visível para todos.
 *
 * UX:
 *  - Busca dentro de cada lista (filtra por substring case-insensitive).
 *  - Chips com X para remover.
 *  - Toggle "Todos os operadores" — força null nos dois arrays.
 *
 * Memórias honradas:
 *  - feedback_no_rounded_no_sparkles · zero rounded-*.
 *  - feedback_no_localstorage_for_persistence · não persiste nada local;
 *    estado vive no parent form (que faz o POST/PATCH).
 */
import * as React from 'react';
import { Search, X, Users, KeyRound } from 'lucide-react';
import {
  Groups,
  Iam,
  type Group,
  type IamRole,
  type IamPermission,
} from '@/lib/api';
import { cn } from '@/lib/cn';

export interface AudienceEditorValue {
  audience_roles: string[] | null;
  audience_iam_perms: string[] | null;
  // Onda L.6 (2026-05-23): audiência por Grupo (IAM Groups).
  audience_groups: string[] | null;
}

export function AudienceEditor({
  value,
  onChange,
}: {
  value: AudienceEditorValue;
  onChange: (v: AudienceEditorValue) => void;
}) {
  const [roles, setRoles] = React.useState<IamRole[]>([]);
  const [perms, setPerms] = React.useState<IamPermission[]>([]);
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [loadingRoles, setLoadingRoles] = React.useState(true);
  const [loadingPerms, setLoadingPerms] = React.useState(true);
  const [loadingGroups, setLoadingGroups] = React.useState(true);
  const [errRoles, setErrRoles] = React.useState<string | null>(null);
  const [errPerms, setErrPerms] = React.useState<string | null>(null);
  const [errGroups, setErrGroups] = React.useState<string | null>(null);
  const [roleSearch, setRoleSearch] = React.useState('');
  const [permSearch, setPermSearch] = React.useState('');
  const [groupSearch, setGroupSearch] = React.useState('');

  React.useEffect(() => {
    let cancel = false;
    Iam.roles
      .list()
      .then((rs) => {
        if (!cancel) setRoles(rs);
      })
      .catch((e) => {
        if (!cancel) setErrRoles((e as Error)?.message ?? 'Falha ao listar papéis');
      })
      .finally(() => {
        if (!cancel) setLoadingRoles(false);
      });
    Iam.permissions
      .list()
      .then((ps) => {
        if (!cancel) setPerms(ps);
      })
      .catch((e) => {
        if (!cancel) setErrPerms((e as Error)?.message ?? 'Falha ao listar permissões');
      })
      .finally(() => {
        if (!cancel) setLoadingPerms(false);
      });
    Groups.list()
      .then((gs) => {
        if (!cancel) setGroups(gs);
      })
      .catch((e) => {
        if (!cancel) setErrGroups((e as Error)?.message ?? 'Falha ao listar grupos');
      })
      .finally(() => {
        if (!cancel) setLoadingGroups(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const selRoles = value.audience_roles ?? [];
  const selPerms = value.audience_iam_perms ?? [];
  const selGroups = value.audience_groups ?? [];
  // Broadcast = todos os três filtros são null (nunca configurados). Arrays
  // vazios significam "modo filtrado ativo, nada selecionado ainda" — assim
  // o toggle "Visível para todos" desliga e revela as listas (roles/perms/
  // grupos). Backend trata [] e null igual (= audiência total), então salvar
  // sem nada selecionado permanece equivalente a broadcast.
  const broadcast =
    value.audience_roles == null &&
    value.audience_iam_perms == null &&
    value.audience_groups == null;

  const setBroadcast = (b: boolean) => {
    if (b) {
      onChange({
        audience_roles: null,
        audience_iam_perms: null,
        audience_groups: null,
      });
    } else {
      onChange({
        audience_roles: [],
        audience_iam_perms: [],
        audience_groups: [],
      });
    }
  };

  const toggleGroup = (id: string) => {
    const cur = selGroups;
    const next = cur.includes(id) ? cur.filter((g) => g !== id) : [...cur, id];
    onChange({
      ...value,
      audience_groups: next.length === 0 ? null : next,
    });
  };

  const filterGroups = (q: string) => {
    if (!q.trim()) return groups;
    const needle = q.trim().toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(needle));
  };

  const groupName = (id: string) =>
    groups.find((g) => g.id === id)?.name ?? id;

  const toggleRole = (name: string) => {
    const cur = selRoles;
    const next = cur.includes(name)
      ? cur.filter((r) => r !== name)
      : [...cur, name];
    onChange({
      ...value,
      audience_roles: next.length === 0 ? null : next,
    });
  };

  const togglePerm = (key: string) => {
    const cur = selPerms;
    const next = cur.includes(key)
      ? cur.filter((p) => p !== key)
      : [...cur, key];
    onChange({
      ...value,
      audience_iam_perms: next.length === 0 ? null : next,
    });
  };

  const filterRoles = (q: string) => {
    if (!q.trim()) return roles;
    const needle = q.trim().toLowerCase();
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.description ?? '').toLowerCase().includes(needle),
    );
  };

  const filterPerms = (q: string) => {
    if (!q.trim()) return perms;
    const needle = q.trim().toLowerCase();
    return perms.filter(
      (p) =>
        p.key.toLowerCase().includes(needle) ||
        (p.description ?? '').toLowerCase().includes(needle),
    );
  };

  return (
    <div className="space-y-3" data-testid="comunicado-audience-editor">
      <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
        <input
          type="checkbox"
          checked={broadcast}
          onChange={(e) => setBroadcast(e.target.checked)}
          data-testid="audience-broadcast-toggle"
          className="w-4 h-4"
        />
        <span>Visível para todos os operadores</span>
      </label>

      {!broadcast && (
        <>
          {/* Roles */}
          <section className="space-y-1.5">
            <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-on-light font-semibold flex items-center gap-1">
              <Users className="w-3 h-3" aria-hidden strokeWidth={1.5} />
              Papéis ({selRoles.length})
            </p>
            <div className="flex flex-wrap gap-1" data-testid="audience-role-chips">
              {selRoles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRole(r)}
                  data-testid={`audience-role-chip-${r}`}
                  className="inline-flex items-center gap-1 h-6 px-2 text-[11px] bg-primary/10 border border-primary text-primary"
                >
                  <span>{r}</span>
                  <X className="w-2.5 h-2.5" aria-hidden strokeWidth={1.5} />
                </button>
              ))}
              {selRoles.length === 0 && (
                <span className="text-[11px] text-muted-on-light italic">
                  Nenhum papel selecionado.
                </span>
              )}
            </div>
            <div className="relative">
              <Search
                className="w-3 h-3 absolute left-2 top-2.5 text-muted-on-light"
                aria-hidden
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                placeholder="Buscar papel…"
                data-testid="audience-role-search"
                aria-label="Buscar papel"
                className="w-full h-8 pl-7 pr-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-focus"
              />
            </div>
            {errRoles && (
              <p
                data-testid="audience-roles-error"
                className="text-[11px] text-danger font-mono"
              >
                {errRoles}
              </p>
            )}
            <ul
              data-testid="audience-role-list"
              className="max-h-32 overflow-y-auto border border-border-light bg-white divide-y divide-border-light"
            >
              {loadingRoles && (
                <li
                  data-testid="audience-roles-loading"
                  className="px-2 py-1 text-[11px] text-muted-on-light italic"
                >
                  Carregando…
                </li>
              )}
              {!loadingRoles && roles.length === 0 && (
                <li className="px-2 py-1 text-[11px] text-muted-on-light italic">
                  Nenhum papel disponível.
                </li>
              )}
              {filterRoles(roleSearch).map((r) => {
                const on = selRoles.includes(r.name);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => toggleRole(r.name)}
                      data-testid={`audience-role-${r.name}`}
                      aria-pressed={on}
                      className={cn(
                        'w-full px-2 py-1 text-left text-[11.5px] flex items-center gap-2',
                        on
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-canvas-light',
                      )}
                    >
                      <span className="w-3 h-3 border border-border-light shrink-0 flex items-center justify-center">
                        {on && <span className="w-1.5 h-1.5 bg-primary" />}
                      </span>
                      <span className="flex-1 truncate">{r.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Perms */}
          <section className="space-y-1.5">
            <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-on-light font-semibold flex items-center gap-1">
              <KeyRound className="w-3 h-3" aria-hidden strokeWidth={1.5} />
              Permissões IAM ({selPerms.length})
            </p>
            <div className="flex flex-wrap gap-1" data-testid="audience-perm-chips">
              {selPerms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePerm(p)}
                  data-testid={`audience-perm-chip-${p}`}
                  className="inline-flex items-center gap-1 h-6 px-2 text-[11px] bg-primary/10 border border-primary text-primary font-mono"
                >
                  <span>{p}</span>
                  <X className="w-2.5 h-2.5" aria-hidden strokeWidth={1.5} />
                </button>
              ))}
              {selPerms.length === 0 && (
                <span className="text-[11px] text-muted-on-light italic">
                  Nenhuma permissão selecionada.
                </span>
              )}
            </div>
            <div className="relative">
              <Search
                className="w-3 h-3 absolute left-2 top-2.5 text-muted-on-light"
                aria-hidden
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                placeholder="Buscar permissão…"
                data-testid="audience-perm-search"
                aria-label="Buscar permissão"
                className="w-full h-8 pl-7 pr-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-focus"
              />
            </div>
            {errPerms && (
              <p
                data-testid="audience-perms-error"
                className="text-[11px] text-danger font-mono"
              >
                {errPerms}
              </p>
            )}
            <ul
              data-testid="audience-perm-list"
              className="max-h-32 overflow-y-auto border border-border-light bg-white divide-y divide-border-light"
            >
              {loadingPerms && (
                <li
                  data-testid="audience-perms-loading"
                  className="px-2 py-1 text-[11px] text-muted-on-light italic"
                >
                  Carregando…
                </li>
              )}
              {!loadingPerms && perms.length === 0 && (
                <li className="px-2 py-1 text-[11px] text-muted-on-light italic">
                  Nenhuma permissão disponível.
                </li>
              )}
              {filterPerms(permSearch).map((p) => {
                const on = selPerms.includes(p.key);
                return (
                  <li key={p.key}>
                    <button
                      type="button"
                      onClick={() => togglePerm(p.key)}
                      data-testid={`audience-perm-${p.key}`}
                      aria-pressed={on}
                      className={cn(
                        'w-full px-2 py-1 text-left text-[11px] font-mono flex items-center gap-2',
                        on
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-canvas-light',
                      )}
                    >
                      <span className="w-3 h-3 border border-border-light shrink-0 flex items-center justify-center">
                        {on && <span className="w-1.5 h-1.5 bg-primary" />}
                      </span>
                      <span className="flex-1 truncate">{p.key}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Groups (Onda L.6) — seletor por checkbox-list, nunca id livre. */}
          <section className="space-y-1.5">
            <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-on-light font-semibold flex items-center gap-1">
              <Users className="w-3 h-3" aria-hidden strokeWidth={1.5} />
              Grupos ({selGroups.length})
            </p>
            <div className="flex flex-wrap gap-1" data-testid="audience-group-chips">
              {selGroups.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleGroup(id)}
                  data-testid={`audience-group-chip-${id}`}
                  className="inline-flex items-center gap-1 h-6 px-2 text-[11px] bg-primary/10 border border-primary text-primary"
                >
                  <span>{groupName(id)}</span>
                  <X className="w-2.5 h-2.5" aria-hidden strokeWidth={1.5} />
                </button>
              ))}
              {selGroups.length === 0 && (
                <span className="text-[11px] text-muted-on-light italic">
                  Nenhum grupo selecionado.
                </span>
              )}
            </div>
            <div className="relative">
              <Search
                className="w-3 h-3 absolute left-2 top-2.5 text-muted-on-light"
                aria-hidden
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Buscar grupo…"
                data-testid="audience-group-search"
                aria-label="Buscar grupo"
                className="w-full h-8 pl-7 pr-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-focus"
              />
            </div>
            {errGroups && (
              <p
                data-testid="audience-groups-error"
                className="text-[11px] text-danger font-mono"
              >
                {errGroups}
              </p>
            )}
            <ul
              data-testid="audience-group-list"
              className="max-h-32 overflow-y-auto border border-border-light bg-white divide-y divide-border-light"
            >
              {loadingGroups && (
                <li
                  data-testid="audience-groups-loading"
                  className="px-2 py-1 text-[11px] text-muted-on-light italic"
                >
                  Carregando…
                </li>
              )}
              {!loadingGroups && groups.length === 0 && (
                <li
                  data-testid="audience-groups-empty"
                  className="px-2 py-1 text-[11px] text-muted-on-light italic"
                >
                  Nenhum grupo disponível. Crie em Grupos.
                </li>
              )}
              {filterGroups(groupSearch).map((g) => {
                const on = selGroups.includes(g.id);
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      data-testid={`audience-group-${g.id}`}
                      aria-pressed={on}
                      className={cn(
                        'w-full px-2 py-1 text-left text-[11.5px] flex items-center gap-2',
                        on
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-canvas-light',
                      )}
                    >
                      <span className="w-3 h-3 border border-border-light shrink-0 flex items-center justify-center">
                        {on && <span className="w-1.5 h-1.5 bg-primary" />}
                      </span>
                      <span className="flex-1 truncate">{g.name}</span>
                      <span className="text-[10px] text-muted-on-light">
                        {g.member_count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
