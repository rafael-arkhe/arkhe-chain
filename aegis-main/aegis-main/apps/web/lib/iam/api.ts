/**
 * Browser-side IAM client. All calls go through the Next.js proxy at
 * ``/api/*``, which injects the bearer token from the httpOnly cookie.
 */
export interface NavItem {
    label: string;
    href: string;
    icon: string | null;
    badge: string | null;
    perm_key: string | null;
}

export interface NavSection {
    id: string;
    title: string;
    icon: string | null;
    default_open: boolean;
    items: NavItem[];
}

export interface NavTree {
    sections: NavSection[];
}

export interface NavOverride {
    id: string;
    role_id: string | null;
    nav_key: string;
    visible: boolean;
    override_label: string | null;
}

export interface NavConfig {
    default_tree: NavTree;
    overrides: NavOverride[];
}

export interface UserOut {
    id: string;
    tenant_id: string;
    username: string;
    display_name: string;
    email: string | null;
    active: boolean;
    clearances: string[];
    roles: string[];
    must_change_password: boolean;
    totp_enabled: boolean;
    locked_until: string | null;
    last_login_at: string | null;
    created_at: string | null;
}

export interface RoleOut {
    id: string;
    tenant_id: string | null;
    key: string;
    name: string;
    description: string;
    is_system: boolean;
    priority: number;
    permission_keys: string[];
    parent_role_ids: string[];
}

export interface PermissionOut {
    id: string;
    key: string;
    resource: string;
    action: string;
    description: string;
    is_system: boolean;
}

export interface AuditEventOut {
    id: string;
    event_type: string;
    success: boolean;
    user_id: string | null;
    username_attempted: string | null;
    ip_address: string | null;
    user_agent: string | null;
    reason: string | null;
    created_at: string;
}


async function api<T>(
    path: string,
    init: RequestInit = {},
): Promise<T> {
    const res = await fetch(`/api${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
        cache: "no-store",
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(body || `HTTP ${res.status}`);
        (err as Error & { status: number }).status = res.status;
        throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
}

// ---- Nav ----
//
// politicians-app uses the campaign-curated tree at /campaign/nav
// (Phase 9). The tree filters per principal exactly like /iam/nav
// does for AEGIS proper — same ``filter_tree`` machinery on the
// backend — but the static section list is the campaign-only one
// (Campanha 2026 + Governança utilities). The legacy /iam/nav stays
// available for AEGIS web-app consumers that haven't migrated.
export const navApi = {
    tree: (asRoleId?: string) =>
        api<NavTree>(
            asRoleId
                ? `/campaign/nav?as_role_id=${asRoleId}`
                : `/campaign/nav`,
        ),
    config: () => api<NavConfig>(`/iam/nav/config`),
    upsertOverrides: (
        overrides: Array<{
            role_id: string | null;
            nav_key: string;
            visible: boolean;
            override_label: string | null;
        }>,
    ) =>
        api<void>(`/iam/nav/overrides`, {
            method: "PUT",
            body: JSON.stringify({ overrides }),
        }),
    deleteOverride: (id: string) =>
        api<void>(`/iam/nav/overrides/${id}`, { method: "DELETE" }),
};

// ---- Users ----
export const usersApi = {
    list: () => api<UserOut[]>(`/iam/users`),
    get: (id: string) => api<UserOut>(`/iam/users/${id}`),
    create: (body: {
        username: string;
        password: string;
        display_name?: string;
        email?: string;
        clearances?: string[];
        roles?: string[];
    }) =>
        api<UserOut>(`/iam/users`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
    patch: (id: string, body: Record<string, unknown>) =>
        api<UserOut>(`/iam/users/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
        }),
    softDelete: (id: string) =>
        api<void>(`/iam/users/${id}`, { method: "DELETE" }),
    assignRole: (userId: string, roleId: string) =>
        api<void>(`/iam/users/${userId}/roles`, {
            method: "POST",
            body: JSON.stringify({ role_id: roleId }),
        }),
    unassignRole: (userId: string, roleId: string) =>
        api<void>(`/iam/users/${userId}/roles/${roleId}`, {
            method: "DELETE",
        }),
    resetPassword: (
        userId: string,
        newPassword: string,
        mustChange = true,
    ) =>
        api<void>(`/iam/users/${userId}/reset-password`, {
            method: "POST",
            body: JSON.stringify({
                new_password: newPassword,
                must_change_password: mustChange,
            }),
        }),
};

// ---- Roles ----
export const rolesApi = {
    list: () => api<RoleOut[]>(`/iam/roles`),
    get: (id: string) => api<RoleOut>(`/iam/roles/${id}`),
    // W6 — autoria de papel por NOME: ``key`` (slug) é OPCIONAL; quando
    // omitido o backend gera um slug único a partir de ``name`` (sem input
    // técnico manual). Mantido aceitável p/ compat com chamadas antigas.
    create: (body: {
        name: string;
        key?: string;
        description?: string;
        priority?: number;
    }) =>
        api<RoleOut>(`/iam/roles`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
    patch: (id: string, body: Record<string, unknown>) =>
        api<RoleOut>(`/iam/roles/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
        }),
    delete: (id: string) =>
        api<void>(`/iam/roles/${id}`, { method: "DELETE" }),
    replacePermissions: (id: string, keys: string[]) =>
        api<RoleOut>(`/iam/roles/${id}/permissions`, {
            method: "PUT",
            body: JSON.stringify({ permission_keys: keys }),
        }),
    replaceParents: (id: string, parentRoleIds: string[]) =>
        api<RoleOut>(`/iam/roles/${id}/parents`, {
            method: "PUT",
            body: JSON.stringify({ parent_role_ids: parentRoleIds }),
        }),
};

// ---- Permissions ----
export const permissionsApi = {
    list: (filter?: { resource?: string; is_system?: boolean }) => {
        const qs = new URLSearchParams();
        if (filter?.resource) qs.set("resource", filter.resource);
        if (filter?.is_system !== undefined) {
            qs.set("is_system", String(filter.is_system));
        }
        const tail = qs.toString() ? `?${qs.toString()}` : "";
        return api<PermissionOut[]>(`/iam/permissions${tail}`);
    },
    create: (body: { key: string; description?: string }) =>
        api<PermissionOut>(`/iam/permissions`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
    delete: (id: string) =>
        api<void>(`/iam/permissions/${id}`, { method: "DELETE" }),
};

// ---- OSDK applications (governance/tokens) ----
export interface OsdkTokenOut {
    id: string;
    name: string;
    scopes: string[];
    expires_at: string | null;
    last_used_at: string | null;
    revoked: boolean;
    created_at: string | null;
}
export interface OsdkTokenCreateOut extends OsdkTokenOut {
    /** Plaintext token — returned ONCE on create or rotate. Never again. */
    token: string;
}

export const osdkApi = {
    list: () => api<OsdkTokenOut[]>(`/governance/tokens`),
    get: (id: string) => api<OsdkTokenOut>(`/governance/tokens/${id}`),
    create: (body: { name: string; scopes: string[]; expires_at?: string | null }) =>
        api<OsdkTokenCreateOut>(`/governance/tokens`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
    patch: (id: string, body: {
        name: string; scopes: string[]; expires_at?: string | null;
    }) =>
        api<OsdkTokenOut>(`/governance/tokens/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
        }),
    revoke: (id: string) =>
        api<void>(`/governance/tokens/${id}`, { method: "DELETE" }),
    rotate: (id: string) =>
        api<OsdkTokenCreateOut>(`/governance/tokens/${id}/rotate`, {
            method: "POST",
        }),
};


// ---- TOTP (self-service) ----
export const totpApi = {
    enroll: () =>
        fetch("/api/auth/totp/enroll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        }).then(async (r) => {
            if (!r.ok) throw new Error(await r.text());
            return (await r.json()) as { secret: string; provisioning_uri: string };
        }),
    verify: (code: string) =>
        fetch("/api/auth/totp/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
        }).then(async (r) => {
            if (!r.ok) throw new Error(await r.text());
        }),
    disable: (currentPassword: string, code: string) =>
        fetch("/api/auth/totp/disable", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_password: currentPassword, code }),
        }).then(async (r) => {
            if (!r.ok) throw new Error(await r.text());
        }),
};


// ---- Audit ----
export const auditApi = {
    list: (params: {
        event_type?: string;
        user_id?: string;
        success?: boolean;
        limit?: number;
        offset?: number;
        since?: string;
        until?: string;
    } = {}) => {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) qs.set(k, String(v));
        });
        const tail = qs.toString() ? `?${qs.toString()}` : "";
        return api<AuditEventOut[]>(`/iam/audit${tail}`);
    },
};
