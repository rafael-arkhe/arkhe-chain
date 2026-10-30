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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { rolesApi, usersApi, type RoleOut, type UserOut } from "@/lib/iam/api";


interface CreateForm {
    username: string;
    password: string;
    display_name: string;
    email: string;
    roles: string[];
}


export function UsersPanel() {
    const [users, setUsers] = React.useState<UserOut[]>([]);
    const [roles, setRoles] = React.useState<RoleOut[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [editingId, setEditingId] = React.useState<string | null>(null);

    const refresh = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [u, r] = await Promise.all([usersApi.list(), rolesApi.list()]);
            setUsers(u);
            setRoles(r);
        } catch (e) {
            setError(e instanceof Error ? e.message : "load failed");
        } finally {
            setLoading(false);
        }
    }, []);
    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    return (
        <section className="border border-border-light bg-canvas-light">
            <header className="flex items-center justify-between p-3 border-b border-border-light">
                <h2 className="text-[11px] font-mono uppercase tracking-wider text-text-on-light">
                    Equipe
                </h2>
                <CreateUserDialog roles={roles} onCreated={refresh} />
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
                            Usuário
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            Nome
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            Papéis
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            Situação
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            Último acesso
                        </TableHead>
                        <TableHead />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading && users.length === 0 ? (
                        <TableRow className="border-border-light">
                            <TableCell colSpan={6} className="text-center text-[11px] font-mono text-muted-on-light">
                                Carregando…
                            </TableCell>
                        </TableRow>
                    ) : (
                        users.map((u) => (
                            <TableRow
                                key={u.id}
                                className="border-border-light hover:bg-raised-light/70"
                                data-testid={`user-row-${u.username}`}
                            >
                                <TableCell className="font-mono text-[12px] text-text-on-light">
                                    {u.username}
                                </TableCell>
                                <TableCell className="font-mono text-[11px] text-muted-on-light">
                                    {u.display_name || "—"}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {u.roles.map((r) => (
                                            <Badge
                                                key={r}
                                                variant="outline"
                                                className="rounded-none border-border-light text-[9px] font-mono"
                                            >
                                                {r}
                                            </Badge>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell className="font-mono text-[10px]">
                                    {u.locked_until ? (
                                        <span className="text-warning">bloqueado</span>
                                    ) : u.active ? (
                                        <span className="text-success">ativo</span>
                                    ) : (
                                        <span className="text-muted-on-light">desativado</span>
                                    )}
                                    {u.must_change_password && (
                                        <span className="ml-2 text-danger">trocar senha</span>
                                    )}
                                </TableCell>
                                <TableCell className="font-mono text-[10px] text-muted-on-light">
                                    {u.last_login_at
                                        ? new Date(u.last_login_at).toLocaleString()
                                        : "nunca"}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="rounded-none font-mono text-[10px] uppercase"
                                        onClick={() => setEditingId(u.id)}
                                        data-testid={`user-edit-${u.username}`}
                                    >
                                        Editar
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            {editingId && (
                <EditUserDialog
                    userId={editingId}
                    roles={roles}
                    onClose={() => setEditingId(null)}
                    onChanged={refresh}
                />
            )}
        </section>
    );
}


// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------
function CreateUserDialog({
    roles,
    onCreated,
}: {
    roles: RoleOut[];
    onCreated: () => void;
}) {
    const [open, setOpen] = React.useState(false);
    const [form, setForm] = React.useState<CreateForm>({
        username: "",
        password: "",
        display_name: "",
        email: "",
        roles: [],
    });
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function submit() {
        setError(null);
        setBusy(true);
        try {
            await usersApi.create({
                username: form.username,
                password: form.password,
                display_name: form.display_name || undefined,
                email: form.email || undefined,
                roles: form.roles,
            });
            setOpen(false);
            setForm({
                username: "",
                password: "",
                display_name: "",
                email: "",
                roles: [],
            });
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : "falhou");
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
                    data-testid="user-create-button"
                >
                    Novo membro
                </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none bg-panel-light border-border-light max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-mono text-sm uppercase">
                        Adicionar membro
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <Field label="Usuário">
                        <Input
                            value={form.username}
                            onChange={(e) =>
                                setForm((s) => ({ ...s, username: e.target.value }))
                            }
                            autoComplete="off"
                            className="rounded-none bg-panel-light border-border-light font-mono text-sm"
                            data-testid="user-create-username"
                        />
                    </Field>
                    <Field label="Senha inicial">
                        <Input
                            type="password"
                            value={form.password}
                            onChange={(e) =>
                                setForm((s) => ({ ...s, password: e.target.value }))
                            }
                            autoComplete="new-password"
                            className="rounded-none bg-panel-light border-border-light font-mono text-sm"
                            data-testid="user-create-password"
                        />
                    </Field>
                    <Field label="Nome de exibição (opcional)">
                        <Input
                            value={form.display_name}
                            onChange={(e) =>
                                setForm((s) => ({ ...s, display_name: e.target.value }))
                            }
                            className="rounded-none bg-panel-light border-border-light font-mono text-sm"
                        />
                    </Field>
                    <Field label="E-mail (opcional)">
                        <Input
                            type="email"
                            value={form.email}
                            onChange={(e) =>
                                setForm((s) => ({ ...s, email: e.target.value }))
                            }
                            className="rounded-none bg-panel-light border-border-light font-mono text-sm"
                        />
                    </Field>
                    <Field label="Papéis">
                        <div className="flex flex-wrap gap-2">
                            {roles.map((r) => {
                                const checked = form.roles.includes(r.key);
                                return (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() =>
                                            setForm((s) => ({
                                                ...s,
                                                roles: checked
                                                    ? s.roles.filter((k) => k !== r.key)
                                                    : [...s.roles, r.key],
                                            }))
                                        }
                                        className={
                                            "px-2 py-1 rounded-none border font-mono text-[10px] uppercase tracking-wider " +
                                            (checked
                                                ? "border-success text-success bg-success/10"
                                                : "border-border-light text-muted-on-light")
                                        }
                                    >
                                        {r.key}
                                    </button>
                                );
                            })}
                        </div>
                    </Field>
                    {error && (
                        <div className="text-[11px] font-mono text-danger">
                            {error}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => setOpen(false)}
                        className="rounded-none font-mono text-[10px] uppercase"
                        disabled={busy}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={busy || !form.username || !form.password}
                        className="rounded-none font-mono text-[10px] uppercase"
                        data-testid="user-create-submit"
                    >
                        {busy ? "Adicionando…" : "Adicionar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


// ---------------------------------------------------------------------------
// Edit dialog (display, lockout, disable, reset, role assignments)
// ---------------------------------------------------------------------------
function EditUserDialog({
    userId,
    roles,
    onClose,
    onChanged,
}: {
    userId: string;
    roles: RoleOut[];
    onClose: () => void;
    onChanged: () => void;
}) {
    const [user, setUser] = React.useState<UserOut | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [resetPw, setResetPw] = React.useState("");

    React.useEffect(() => {
        usersApi
            .get(userId)
            .then(setUser)
            .catch((e) => setError(e instanceof Error ? e.message : "load failed"));
    }, [userId]);

    async function patch(body: Record<string, unknown>) {
        if (!user) return;
        setBusy(true);
        setError(null);
        try {
            const next = await usersApi.patch(user.id, body);
            setUser(next);
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : "falhou");
        } finally {
            setBusy(false);
        }
    }

    async function toggleRole(role: RoleOut, hasIt: boolean) {
        if (!user) return;
        setBusy(true);
        setError(null);
        try {
            if (hasIt) {
                await usersApi.unassignRole(user.id, role.id);
            } else {
                await usersApi.assignRole(user.id, role.id);
            }
            setUser(await usersApi.get(user.id));
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : "falhou");
        } finally {
            setBusy(false);
        }
    }

    async function reset() {
        if (!user || !resetPw) return;
        setBusy(true);
        setError(null);
        try {
            await usersApi.resetPassword(user.id, resetPw, true);
            setResetPw("");
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : "falhou");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="rounded-none bg-panel-light border-border-light max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-mono text-sm uppercase">
                        Editar membro — {user?.username || "…"}
                    </DialogTitle>
                </DialogHeader>
                {!user ? (
                    <div className="text-[11px] font-mono text-muted-on-light">Carregando…</div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {error && (
                            <div className="text-[11px] font-mono text-danger">
                                {error}
                            </div>
                        )}

                        <Field label="Nome de exibição">
                            <Input
                                value={user.display_name || ""}
                                onChange={(e) =>
                                    setUser({ ...user, display_name: e.target.value })
                                }
                                onBlur={() =>
                                    void patch({ display_name: user.display_name })
                                }
                                className="rounded-none bg-panel-light border-border-light font-mono text-sm"
                            />
                        </Field>

                        <Field label="Situação">
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant={user.active ? "default" : "ghost"}
                                    onClick={() => void patch({ active: true })}
                                    disabled={busy || user.active}
                                    className="rounded-none font-mono text-[10px] uppercase"
                                >
                                    Ativo
                                </Button>
                                <Button
                                    size="sm"
                                    variant={!user.active ? "default" : "ghost"}
                                    onClick={() => void patch({ active: false })}
                                    disabled={busy || !user.active}
                                    className="rounded-none font-mono text-[10px] uppercase"
                                    data-testid="user-disable"
                                >
                                    Desativar
                                </Button>
                            </div>
                        </Field>

                        {user.locked_until && (
                            <Field label={`Bloqueado até ${user.locked_until}`}>
                                <Button
                                    size="sm"
                                    onClick={() => void patch({ locked_until: null })}
                                    disabled={busy}
                                    className="rounded-none font-mono text-[10px] uppercase"
                                    data-testid="user-clear-lock"
                                >
                                    Desbloquear
                                </Button>
                            </Field>
                        )}

                        <Field label="Papéis">
                            <div className="flex flex-wrap gap-2">
                                {roles.map((r) => {
                                    const has = user.roles.includes(r.key);
                                    return (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => void toggleRole(r, has)}
                                            disabled={busy}
                                            className={
                                                "px-2 py-1 rounded-none border font-mono text-[10px] uppercase tracking-wider " +
                                                (has
                                                    ? "border-success text-success bg-success/10"
                                                    : "border-border-light text-muted-on-light")
                                            }
                                            data-testid={`user-role-toggle-${r.key}`}
                                        >
                                            {r.key}
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>

                        <Field label="Redefinir senha">
                            <div className="flex gap-2">
                                <Input
                                    type="password"
                                    value={resetPw}
                                    onChange={(e) => setResetPw(e.target.value)}
                                    placeholder="Nova senha (mínimo 12 caracteres)"
                                    className="rounded-none bg-panel-light border-border-light font-mono text-sm flex-1"
                                />
                                <Button
                                    size="sm"
                                    onClick={() => void reset()}
                                    disabled={busy || !resetPw}
                                    className="rounded-none font-mono text-[10px] uppercase"
                                    data-testid="user-reset-pw"
                                >
                                    Redefinir
                                </Button>
                            </div>
                        </Field>
                    </div>
                )}
                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="rounded-none font-mono text-[10px] uppercase"
                    >
                        Fechar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
                {label}
            </Label>
            {children}
        </div>
    );
}
