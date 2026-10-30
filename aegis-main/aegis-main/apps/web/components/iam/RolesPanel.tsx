"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import {
    permissionsApi,
    rolesApi,
    type PermissionOut,
    type RoleOut,
} from "@/lib/iam/api";
import { useT } from "@/lib/i18n/provider";


export function RolesPanel() {
    const t = useT();
    const [roles, setRoles] = React.useState<RoleOut[]>([]);
    const [perms, setPerms] = React.useState<PermissionOut[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [editId, setEditId] = React.useState<string | null>(null);

    const refresh = React.useCallback(async () => {
        setError(null);
        try {
            const [r, p] = await Promise.all([
                rolesApi.list(),
                permissionsApi.list(),
            ]);
            setRoles(r);
            setPerms(p);
        } catch (e) {
            setError(e instanceof Error ? e.message : t("iam.common.loadFailed"));
        }
    }, [t]);
    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    return (
        <section className="border border-border-light bg-canvas-light">
            <header className="flex items-center justify-between p-3 border-b border-border-light">
                <h2 className="text-[11px] font-mono uppercase tracking-wider text-text-on-light">
                    {t("iam.roles.title")}
                </h2>
                <CreateRoleDialog onCreated={refresh} />
            </header>

            {error && (
                <div className="px-3 py-2 text-[11px] font-mono text-danger border-b border-border-light">
                    {error}
                </div>
            )}

            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent border-border-light">
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            {t("iam.common.colIdentifier")}
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            {t("iam.roles.colName")}
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            {t("iam.roles.colPermissions")}
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            {t("iam.roles.colInherits")}
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            {t("iam.common.colType")}
                        </TableHead>
                        <TableHead />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {roles.map((r) => (
                        <TableRow
                            key={r.id}
                            className="border-border-light hover:bg-raised-light/70"
                            data-testid={`role-row-${r.key}`}
                        >
                            <TableCell className="font-mono text-[12px] text-text-on-light">
                                {r.key}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-on-light">
                                {r.name}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-on-light">
                                {r.permission_keys.length}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-on-light">
                                {r.parent_role_ids.length}
                            </TableCell>
                            <TableCell>
                                {r.is_system ? (
                                    <Badge
                                        variant="outline"
                                        className="rounded-none border-warning text-warning bg-warning/10 text-[9px] font-mono"
                                    >
                                        {t("iam.common.system")}
                                    </Badge>
                                ) : (
                                    <Badge
                                        variant="outline"
                                        className="rounded-none border-border-light text-muted-on-light text-[9px] font-mono"
                                    >
                                        {t("iam.roles.custom")}
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-right">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditId(r.id)}
                                    className="rounded-none font-mono text-[10px] uppercase"
                                    data-testid={`role-edit-${r.key}`}
                                >
                                    {t("iam.common.edit")}
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {editId && (
                <EditRoleDialog
                    roleId={editId}
                    allRoles={roles}
                    allPerms={perms}
                    onClose={() => setEditId(null)}
                    onChanged={refresh}
                />
            )}
        </section>
    );
}


// W6 — autoria de papel SEM input técnico: pede apenas o NOME. O identificador
// (slug) é gerado no backend a partir do nome (generate_unique_role_slug) —
// o operador nunca digita slug/key.
function CreateRoleDialog({ onCreated }: { onCreated: () => void }) {
    const t = useT();
    const [open, setOpen] = React.useState(false);
    const [name, setName] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    async function submit() {
        if (!name.trim()) return;
        setError(null);
        setBusy(true);
        try {
            // key OMITIDO de propósito — backend gera o slug a partir do nome.
            await rolesApi.create({ name: name.trim() });
            setName("");
            setOpen(false);
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : t("iam.common.failed"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    size="sm"
                    className="rounded-none font-mono text-[10px] uppercase tracking-wider"
                    data-testid="role-create-button"
                >
                    {t("iam.roles.createButton")}
                </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none bg-panel-light border-border-light max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-mono text-sm uppercase">
                        {t("iam.roles.createTitle")}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
                            {t("iam.roles.nameLabel")}
                        </Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="rounded-none bg-panel-light border-border-light font-mono text-sm"
                            data-testid="role-create-name"
                        />
                        <p className="text-[10px] font-mono text-muted-on-light">
                            {t("iam.roles.nameHint")}
                        </p>
                    </div>
                    {error && (
                        <div className="text-[11px] font-mono text-danger">{error}</div>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => setOpen(false)}
                        disabled={busy}
                        className="rounded-none font-mono text-[10px] uppercase"
                    >
                        {t("iam.common.cancel")}
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={busy || !name.trim()}
                        className="rounded-none font-mono text-[10px] uppercase"
                        data-testid="role-create-submit"
                    >
                        {busy ? t("iam.common.creating") : t("iam.common.create")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function EditRoleDialog({
    roleId,
    allRoles,
    allPerms,
    onClose,
    onChanged,
}: {
    roleId: string;
    allRoles: RoleOut[];
    allPerms: PermissionOut[];
    onClose: () => void;
    onChanged: () => void;
}) {
    const t = useT();
    const [role, setRole] = React.useState<RoleOut | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        rolesApi
            .get(roleId)
            .then(setRole)
            .catch((e) => setError(e instanceof Error ? e.message : t("iam.common.loadFailed")));
    }, [roleId, t]);

    async function togglePerm(key: string) {
        if (!role) return;
        setBusy(true);
        setError(null);
        const next = role.permission_keys.includes(key)
            ? role.permission_keys.filter((k) => k !== key)
            : [...role.permission_keys, key];
        try {
            const updated = await rolesApi.replacePermissions(role.id, next);
            setRole(updated);
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : t("iam.common.failed"));
        } finally {
            setBusy(false);
        }
    }

    async function toggleParent(parent: RoleOut) {
        if (!role) return;
        setBusy(true);
        setError(null);
        const next = role.parent_role_ids.includes(parent.id)
            ? role.parent_role_ids.filter((id) => id !== parent.id)
            : [...role.parent_role_ids, parent.id];
        try {
            const updated = await rolesApi.replaceParents(role.id, next);
            setRole(updated);
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : t("iam.common.failed"));
        } finally {
            setBusy(false);
        }
    }

    async function patch(body: Record<string, unknown>) {
        if (!role) return;
        setBusy(true);
        try {
            const updated = await rolesApi.patch(role.id, body);
            setRole(updated);
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : t("iam.common.failed"));
        } finally {
            setBusy(false);
        }
    }

    async function deleteRole() {
        if (!role) return;
        setBusy(true);
        setError(null);
        try {
            await rolesApi.delete(role.id);
            onChanged();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : t("iam.common.failed"));
        } finally {
            setBusy(false);
        }
    }

    // Group perms by resource for the editor.
    const grouped = React.useMemo(() => {
        const map = new Map<string, PermissionOut[]>();
        for (const p of allPerms) {
            if (!map.has(p.resource)) map.set(p.resource, []);
            map.get(p.resource)!.push(p);
        }
        return Array.from(map.entries()).sort();
    }, [allPerms]);

    return (
        <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="rounded-none bg-panel-light border-border-light max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-mono text-sm uppercase">
                        {t("iam.roles.editTitle")} — {role?.key || "…"}
                    </DialogTitle>
                </DialogHeader>
                {!role ? (
                    <div className="text-[11px] font-mono text-muted-on-light">{t("iam.common.loading")}</div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {error && (
                            <div className="text-[11px] font-mono text-danger">
                                {error}
                            </div>
                        )}

                        {role.is_system && (
                            <div className="text-[11px] font-mono text-warning border border-warning bg-warning/10 p-2">
                                {t("iam.roles.systemReadonly")}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
                                {t("iam.roles.displayNameLabel")}
                            </Label>
                            <Input
                                value={role.name}
                                onChange={(e) =>
                                    setRole({ ...role, name: e.target.value })
                                }
                                onBlur={() => void patch({ name: role.name })}
                                disabled={role.is_system || busy}
                                className="rounded-none bg-panel-light border-border-light font-mono text-sm"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
                                {t("iam.roles.permissionsLabel")}
                            </Label>
                            <div className="space-y-3 max-h-[40vh] overflow-y-auto border border-border-light p-3">
                                {grouped.map(([resource, perms]) => (
                                    <div key={resource}>
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light mb-1">
                                            {resource}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {perms.map((p) => {
                                                const has = role.permission_keys.includes(p.key);
                                                return (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => void togglePerm(p.key)}
                                                        disabled={role.is_system || busy}
                                                        className={
                                                            "px-2 py-1 rounded-none border font-mono text-[9px] tracking-wider " +
                                                            (has
                                                                ? "border-success text-success bg-success/10"
                                                                : "border-border-light text-muted-on-light")
                                                        }
                                                        title={p.description}
                                                        data-testid={`role-perm-${p.key}`}
                                                    >
                                                        {p.action}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
                                {t("iam.roles.inheritsFromLabel")}
                            </Label>
                            <div className="flex flex-wrap gap-2">
                                {allRoles
                                    .filter((r) => r.id !== role.id)
                                    .map((parent) => {
                                        const has = role.parent_role_ids.includes(parent.id);
                                        return (
                                            <button
                                                key={parent.id}
                                                type="button"
                                                onClick={() => void toggleParent(parent)}
                                                disabled={busy}
                                                className={
                                                    "px-2 py-1 rounded-none border font-mono text-[10px] uppercase " +
                                                    (has
                                                        ? "border-success text-success bg-success/10"
                                                        : "border-border-light text-muted-on-light")
                                                }
                                                data-testid={`role-parent-${parent.key}`}
                                            >
                                                {parent.key}
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>

                        {!role.is_system && (
                            <div className="border-t border-border-light pt-3">
                                <Button
                                    variant="destructive"
                                    onClick={() => void deleteRole()}
                                    disabled={busy}
                                    className="rounded-none font-mono text-[10px] uppercase"
                                    data-testid="role-delete"
                                >
                                    {t("iam.roles.deleteRole")}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="rounded-none font-mono text-[10px] uppercase"
                    >
                        {t("iam.common.close")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
