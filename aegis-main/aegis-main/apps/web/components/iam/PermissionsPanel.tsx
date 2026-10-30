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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import { permissionsApi, type PermissionOut } from "@/lib/iam/api";
import { confirmModal } from "@/components/dialog/confirm-dialog";
import { useT } from "@/lib/i18n/provider";

// W6 — vocabulário canônico de ações (deriva do catálogo: o backend faz
// ``resource, action = key.rsplit(".", 1)``). A composição é por dropdowns —
// o operador nunca digita o identificador técnico.
const STANDARD_ACTIONS = [
    "read",
    "view",
    "create",
    "write",
    "edit",
    "update",
    "delete",
    "run",
    "execute",
    "manage",
    "configure",
    "publish",
    "export",
    "approve",
] as const;


export function PermissionsPanel() {
    const t = useT();
    const [perms, setPerms] = React.useState<PermissionOut[]>([]);
    const [filter, setFilter] = React.useState<string>("all");
    const [error, setError] = React.useState<string | null>(null);

    const refresh = React.useCallback(async () => {
        setError(null);
        try {
            setPerms(await permissionsApi.list());
        } catch (e) {
            setError(e instanceof Error ? e.message : t("iam.common.loadFailed"));
        }
    }, [t]);
    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    const resources = React.useMemo(
        () => Array.from(new Set(perms.map((p) => p.resource))).sort(),
        [perms],
    );
    const filtered =
        filter === "all" ? perms : perms.filter((p) => p.resource === filter);

    async function deletePerm(p: PermissionOut) {
        if (!(await confirmModal({ title: `${t("iam.perms.confirmDelete")} ${p.key}?`, tone: "danger", confirmLabel: t("iam.common.delete") }))) return;
        try {
            await permissionsApi.delete(p.id);
            refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : t("iam.common.failed"));
        }
    }

    return (
        <section className="border border-border-light bg-canvas-light">
            <header className="flex items-center justify-between p-3 border-b border-border-light gap-2">
                <h2 className="text-[11px] font-mono uppercase tracking-wider text-text-on-light">
                    {t("iam.perms.title")} ({filtered.length})
                </h2>
                <div className="flex items-center gap-2">
                    <Select value={filter} onValueChange={setFilter}>
                        <SelectTrigger className="rounded-none bg-panel-light border-border-light font-mono text-[11px] h-8 w-[180px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none bg-panel-light border-border-light">
                            <SelectItem value="all" className="font-mono text-[11px]">
                                {t("iam.perms.allResources")}
                            </SelectItem>
                            {resources.map((r) => (
                                <SelectItem
                                    key={r}
                                    value={r}
                                    className="font-mono text-[11px]"
                                >
                                    {r}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <CreatePermDialog onCreated={refresh} resources={resources} />
                </div>
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
                            {t("iam.perms.resourceLabel")}
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            {t("iam.perms.actionLabel")}
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            {t("iam.perms.descriptionLabel")}
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            {t("iam.common.colType")}
                        </TableHead>
                        <TableHead />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filtered.map((p) => (
                        <TableRow
                            key={p.id}
                            className="border-border-light hover:bg-raised-light/70"
                            data-testid={`perm-row-${p.key}`}
                        >
                            <TableCell className="font-mono text-[11px] text-text-on-light">
                                {p.key}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-on-light">
                                {p.resource}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-on-light">
                                {p.action}
                            </TableCell>
                            <TableCell className="font-mono text-[10px] text-muted-on-light max-w-md truncate">
                                {p.description}
                            </TableCell>
                            <TableCell>
                                {p.is_system ? (
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
                                        {t("iam.perms.custom")}
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-right">
                                {!p.is_system && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => void deletePerm(p)}
                                        className="rounded-none font-mono text-[10px] uppercase text-danger hover:text-danger"
                                        data-testid={`perm-delete-${p.key}`}
                                    >
                                        {t("iam.common.delete")}
                                    </Button>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </section>
    );
}


// W6 — autoria de permissão SEM input técnico: o identificador (recurso.ação)
// é COMPOSTO por dois dropdowns (recurso do catálogo + ação padrão), nunca
// digitado. O backend faz ``resource, action = key.rsplit(".", 1)``, então a
// chave composta ``recurso.ação`` é válida sem mudança no backend.
function CreatePermDialog({
    onCreated,
    resources,
}: {
    onCreated: () => void;
    resources: string[];
}) {
    const t = useT();
    const [open, setOpen] = React.useState(false);
    const [resource, setResource] = React.useState("");
    const [action, setAction] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const composedKey = resource && action ? `${resource}.${action}` : "";

    async function submit() {
        if (!composedKey) return;
        setError(null);
        setBusy(true);
        try {
            await permissionsApi.create({ key: composedKey, description });
            setResource("");
            setAction("");
            setDescription("");
            setOpen(false);
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : t("iam.common.failed"));
        } finally {
            setBusy(false);
        }
    }

    const fieldCls =
        "rounded-none bg-panel-light border border-border-light font-mono text-sm h-9 px-2 text-text-on-light focus:outline-none focus:ring-2 focus:ring-primary";

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    size="sm"
                    variant="outline"
                    className="rounded-none font-mono text-[10px] uppercase tracking-wider"
                    data-testid="perm-create-button"
                >
                    {t("iam.perms.createButton")}
                </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none bg-panel-light border-border-light max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-mono text-sm uppercase">
                        {t("iam.perms.createTitle")}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
                                {t("iam.perms.resourceLabel")}
                            </Label>
                            <select
                                value={resource}
                                onChange={(e) => setResource(e.target.value)}
                                className={fieldCls}
                                data-testid="perm-create-resource"
                                aria-label={t("iam.perms.resourceLabel")}
                            >
                                <option value="">{t("iam.perms.selectResource")}</option>
                                {resources.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
                                {t("iam.perms.actionLabel")}
                            </Label>
                            <select
                                value={action}
                                onChange={(e) => setAction(e.target.value)}
                                className={fieldCls}
                                data-testid="perm-create-action"
                                aria-label={t("iam.perms.actionLabel")}
                            >
                                <option value="">{t("iam.perms.selectAction")}</option>
                                {STANDARD_ACTIONS.map((a) => (
                                    <option key={a} value={a}>
                                        {a}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
                            {t("iam.perms.keyPreview")}
                        </Label>
                        <div
                            className="rounded-none bg-canvas-light border border-border-light font-mono text-sm h-9 px-2 flex items-center text-text-on-light"
                            data-testid="perm-create-key-preview"
                        >
                            {composedKey || (
                                <span className="text-muted-on-light">
                                    {t("iam.perms.keyPreviewEmpty")}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
                            {t("iam.perms.descriptionLabel")}
                        </Label>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="rounded-none bg-panel-light border-border-light font-mono text-sm"
                            data-testid="perm-create-description"
                        />
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
                        disabled={busy || !composedKey}
                        className="rounded-none font-mono text-[10px] uppercase"
                        data-testid="perm-create-submit"
                    >
                        {busy ? t("iam.common.creating") : t("iam.common.create")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
