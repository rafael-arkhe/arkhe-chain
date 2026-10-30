"use client";

/**
 * OsdkCreateDialog — emissão de uma aplicação OSDK (token de API com escopos).
 *
 * Dois passos:
 *   1. nome + escopos (seletor denso) → cria
 *   2. segredo revelado UMA vez (o servidor guarda só o hash) → copiar
 *
 * Régua: cantos retos, Inter em rótulo/ação e JetBrains Mono só em DADO
 * (token, id, contadores), azul-aço apenas na ação primária, borda > sombra,
 * ícones lucide 1.5, toda string via useT().
 */
import * as React from "react";
import { AlertCircle, AlertTriangle, Check, Copy, Loader2, Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { OsdkScopePicker } from "@/components/iam/OsdkScopePicker";
import { osdkApi, type OsdkTokenCreateOut } from "@/lib/iam/api";
import { useT } from "@/lib/i18n/provider";

const NAME_MIN = 3;

export function OsdkCreateDialog({ onCreated }: { onCreated: () => void }) {
    const t = useT();
    const [open, setOpen] = React.useState(false);
    const [name, setName] = React.useState("");
    const [nameTouched, setNameTouched] = React.useState(false);
    const [scopes, setScopes] = React.useState<string[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [created, setCreated] = React.useState<OsdkTokenCreateOut | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [copyFailed, setCopyFailed] = React.useState(false);

    const trimmed = name.trim();
    const nameValid = trimmed.length >= NAME_MIN;
    const showNameError = nameTouched && !nameValid;
    const canSubmit = !busy && nameValid && scopes.length > 0;

    function reset() {
        setName("");
        setNameTouched(false);
        setScopes([]);
        setError(null);
        setCreated(null);
        setCopied(false);
        setCopyFailed(false);
    }

    async function submit() {
        if (!canSubmit) return;
        setError(null);
        setBusy(true);
        try {
            const r = await osdkApi.create({ name: trimmed, scopes });
            setCreated(r);
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }

    async function copy() {
        if (!created) return;
        try {
            await navigator.clipboard.writeText(created.token);
            setCopied(true);
            setCopyFailed(false);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard API indisponível (http, permissão negada) — instruímos
            // o operador a selecionar e copiar à mão em vez de falhar em silêncio.
            setCopyFailed(true);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) reset();
                setOpen(o);
            }}
        >
            <DialogTrigger asChild>
                <Button size="sm" className="rounded-none" data-testid="osdk-create-button">
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {t("osdk.create.trigger")}
                </Button>
            </DialogTrigger>

            <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-none border-border-light bg-panel-light p-0">
                <DialogHeader className="space-y-1 border-b border-border-light px-4 py-3 text-left">
                    <DialogTitle className="pr-8 text-[13px] font-semibold text-text-on-light">
                        {created ? t("osdk.secret.title") : t("osdk.create.title")}
                    </DialogTitle>
                    <DialogDescription className="text-[11px] text-muted-on-light">
                        {created ? t("osdk.secret.subtitle") : t("osdk.create.subtitle")}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
                    {created ? (
                        <>
                            <Alert
                                className="rounded-none border-warning bg-warning/10 p-3 text-text-on-light"
                                data-testid="osdk-secret-warning"
                            >
                                <AlertDescription className="flex items-start gap-2 text-[11px]">
                                    <AlertTriangle
                                        className="mt-px h-4 w-4 shrink-0 text-warning"
                                        strokeWidth={1.5}
                                        aria-hidden="true"
                                    />
                                    <span className="min-w-0">{t("osdk.secret.warning")}</span>
                                </AlertDescription>
                            </Alert>

                            <div className="flex flex-col gap-1.5">
                                <Label
                                    htmlFor="osdk-token-field"
                                    className="text-[11px] font-medium text-text-on-light"
                                >
                                    {t("osdk.secret.token_label")}
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="osdk-token-field"
                                        readOnly
                                        value={created.token}
                                        onFocus={(e) => e.currentTarget.select()}
                                        data-testid="osdk-token-output"
                                        className="h-9 rounded-none border-border-light bg-canvas-light font-mono text-[11px] text-text-on-light"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => void copy()}
                                        data-testid="osdk-token-copy"
                                        className="shrink-0 rounded-none"
                                    >
                                        {copied ? (
                                            <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                                        ) : (
                                            <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                                        )}
                                        {copied ? t("osdk.secret.copied") : t("osdk.secret.copy")}
                                    </Button>
                                </div>
                                {copyFailed && (
                                    <p
                                        className="text-[11px] text-danger"
                                        role="alert"
                                        data-testid="osdk-copy-failed"
                                    >
                                        {t("osdk.secret.copy_failed")}
                                    </p>
                                )}
                            </div>

                            <dl
                                className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border border-border-light bg-canvas-light px-3 py-2"
                                data-testid="osdk-secret-meta"
                            >
                                <div className="flex min-w-0 items-baseline gap-2">
                                    <dt className="text-[11px] text-muted-on-light">
                                        {t("osdk.secret.id_label")}
                                    </dt>
                                    <dd className="truncate font-mono text-[11px] text-text-on-light">
                                        {created.id}
                                    </dd>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <dt className="text-[11px] text-muted-on-light">
                                        {t("osdk.secret.scopes_label")}
                                    </dt>
                                    <dd className="font-mono text-[11px] text-text-on-light">
                                        {created.scopes.length}
                                    </dd>
                                </div>
                            </dl>
                        </>
                    ) : (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label
                                    htmlFor="osdk-create-name-field"
                                    className="text-[11px] font-medium text-text-on-light"
                                >
                                    {t("osdk.create.name_label")}
                                </Label>
                                <Input
                                    id="osdk-create-name-field"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    onBlur={() => setNameTouched(true)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && canSubmit) {
                                            e.preventDefault();
                                            void submit();
                                        }
                                    }}
                                    disabled={busy}
                                    maxLength={64}
                                    placeholder={t("osdk.create.name_placeholder")}
                                    aria-invalid={showNameError || undefined}
                                    aria-describedby="osdk-create-name-hint"
                                    data-testid="osdk-create-name"
                                    className={`h-9 rounded-none bg-canvas-light text-[12px] text-text-on-light ${
                                        showNameError ? "border-danger" : "border-border-light"
                                    }`}
                                />
                                <p
                                    id="osdk-create-name-hint"
                                    className={`text-[11px] ${showNameError ? "text-danger" : "text-muted-on-light"}`}
                                    data-testid="osdk-create-name-hint"
                                >
                                    {showNameError
                                        ? t("osdk.create.name_invalid")
                                        : t("osdk.create.name_hint")}
                                </p>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label className="text-[11px] font-medium text-text-on-light">
                                    {t("osdk.create.scopes_label")}
                                </Label>
                                <p className="text-[11px] text-muted-on-light">
                                    {t("osdk.create.scopes_hint")}
                                </p>
                                <OsdkScopePicker
                                    value={scopes}
                                    onChange={setScopes}
                                    disabled={busy}
                                />
                            </div>

                            {error && (
                                <Alert
                                    variant="destructive"
                                    className="rounded-none border-danger bg-danger/10 p-3 text-danger"
                                    data-testid="osdk-create-error"
                                >
                                    <AlertDescription className="flex items-start gap-2 text-[11px]">
                                        <AlertCircle
                                            className="mt-px h-4 w-4 shrink-0"
                                            strokeWidth={1.5}
                                            aria-hidden="true"
                                        />
                                        <span className="min-w-0">
                                            <span className="block font-medium">
                                                {t("osdk.create.error")}
                                            </span>
                                            <span className="block break-words font-mono text-[10px] opacity-80">
                                                {error}
                                            </span>
                                        </span>
                                    </AlertDescription>
                                </Alert>
                            )}
                        </>
                    )}
                </div>

                <DialogFooter className="flex-row items-center gap-2 border-t border-border-light px-4 py-3 sm:justify-between">
                    {created ? (
                        <>
                            <span className="text-[11px] text-muted-on-light">
                                {t("osdk.secret.footer_hint")}
                            </span>
                            <Button
                                size="sm"
                                onClick={() => setOpen(false)}
                                data-testid="osdk-create-done"
                                className="rounded-none"
                            >
                                {t("osdk.secret.done")}
                            </Button>
                        </>
                    ) : (
                        <>
                            <span
                                className="text-[11px] text-muted-on-light"
                                data-testid="osdk-create-summary"
                            >
                                <span
                                    className={
                                        scopes.length > 0
                                            ? "font-mono font-semibold text-primary"
                                            : "font-mono text-muted-on-light"
                                    }
                                >
                                    {scopes.length}
                                </span>{" "}
                                {t("osdk.scope.selected_suffix")}
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setOpen(false)}
                                    disabled={busy}
                                    className="rounded-none"
                                >
                                    {t("common.cancel")}
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => void submit()}
                                    disabled={!canSubmit}
                                    data-testid="osdk-create-submit"
                                    className="rounded-none"
                                >
                                    {busy && (
                                        <Loader2
                                            className="h-3.5 w-3.5 animate-spin"
                                            strokeWidth={1.5}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {busy ? t("common.creating") : t("osdk.create.submit")}
                                </Button>
                            </div>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
