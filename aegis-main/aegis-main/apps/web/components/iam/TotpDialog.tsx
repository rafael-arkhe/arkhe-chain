"use client";

import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useAuth } from "@/lib/auth/useAuth";
import { totpApi } from "@/lib/iam/api";


/** Step machine: idle → enrolling (have secret, awaiting verify) → done. */
type Step = "idle" | "enrolling" | "verifying";


export function TotpDialog({
    open,
    onOpenChange,
    onChanged,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChanged?: () => void;
}) {
    const { principal, refresh } = useAuth();
    const enabled = !!principal?.totp_enabled;
    const [step, setStep] = React.useState<Step>("idle");
    const [secret, setSecret] = React.useState<string | null>(null);
    const [provisioningUri, setProvisioningUri] = React.useState<string | null>(
        null,
    );
    const [code, setCode] = React.useState("");
    const [pw, setPw] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) {
            // Reset on close.
            setStep("idle");
            setSecret(null);
            setProvisioningUri(null);
            setCode("");
            setPw("");
            setError(null);
        }
    }, [open]);

    async function startEnrollment() {
        setBusy(true);
        setError(null);
        try {
            const r = await totpApi.enroll();
            setSecret(r.secret);
            setProvisioningUri(r.provisioning_uri);
            setStep("enrolling");
        } catch (e) {
            setError(e instanceof Error ? e.message : "enroll failed");
        } finally {
            setBusy(false);
        }
    }

    async function commitEnrollment() {
        setBusy(true);
        setError(null);
        try {
            await totpApi.verify(code);
            await refresh();
            onChanged?.();
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "verify failed");
        } finally {
            setBusy(false);
        }
    }

    async function disable() {
        setBusy(true);
        setError(null);
        try {
            await totpApi.disable(pw, code);
            await refresh();
            onChanged?.();
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "disable failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="rounded-none bg-panel-light border-border-light max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-mono text-sm uppercase">
                        Autenticação de dois fatores
                    </DialogTitle>
                </DialogHeader>

                {error && (
                    <Alert
                        variant="destructive"
                        className="rounded-none border-danger bg-danger/20 text-danger"
                    >
                        <AlertDescription className="text-[11px] font-mono">
                            {error}
                        </AlertDescription>
                    </Alert>
                )}

                {enabled ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-[11px] font-mono text-muted-on-light">
                            O 2FA está <span className="text-success">ativado</span>.
                            To disable, enter your current password and a fresh
                            authenticator code.
                        </p>
                        <Field label="Senha atual">
                            <Input
                                type="password"
                                autoComplete="current-password"
                                value={pw}
                                onChange={(e) => setPw(e.target.value)}
                                className="rounded-none bg-panel-light border-border-light font-mono text-sm"
                                data-testid="totp-disable-pw"
                            />
                        </Field>
                        <Field label="Código do autenticador">
                            <Input
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                value={code}
                                onChange={(e) =>
                                    setCode(e.target.value.replace(/\D/g, ""))
                                }
                                className="rounded-none bg-panel-light border-border-light font-mono text-sm tracking-[0.5em]"
                                data-testid="totp-disable-code"
                            />
                        </Field>
                        <Button
                            onClick={() => void disable()}
                            disabled={busy || !pw || code.length !== 6}
                            className="rounded-none font-mono text-[10px] uppercase"
                            variant="destructive"
                            data-testid="totp-disable-submit"
                        >
                            {busy ? "Desativando…" : "Desativar 2FA"}
                        </Button>
                    </div>
                ) : step === "idle" ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-[11px] font-mono text-muted-on-light">
                            Add a second factor to your sign-in. You'll need an
                            authenticator app (1Password, Authy, Google
                            Authenticator).
                        </p>
                        <Button
                            onClick={() => void startEnrollment()}
                            disabled={busy}
                            className="rounded-none font-mono text-[10px] uppercase"
                            data-testid="totp-enroll-start"
                        >
                            {busy ? "Aguarde…" : "Começar configuração"}
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <p className="text-[11px] font-mono text-muted-on-light">
                            Scan or paste the secret into your authenticator app,
                            then enter a current code to confirm.
                        </p>
                        <Field label="Segredo">
                            <Input
                                readOnly
                                value={secret || ""}
                                className="rounded-none bg-panel-light border-border-light font-mono text-xs tracking-wider"
                                data-testid="totp-enroll-secret"
                            />
                        </Field>
                        <Field label="URI de provisionamento">
                            <Input
                                readOnly
                                value={provisioningUri || ""}
                                className="rounded-none bg-panel-light border-border-light font-mono text-[10px]"
                            />
                        </Field>
                        <Field label="Código do autenticador">
                            <Input
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                autoComplete="one-time-code"
                                value={code}
                                onChange={(e) =>
                                    setCode(e.target.value.replace(/\D/g, ""))
                                }
                                className="rounded-none bg-panel-light border-border-light font-mono text-sm tracking-[0.5em]"
                                data-testid="totp-enroll-code"
                            />
                        </Field>
                        <Button
                            onClick={() => void commitEnrollment()}
                            disabled={busy || code.length !== 6}
                            className="rounded-none font-mono text-[10px] uppercase"
                            data-testid="totp-enroll-confirm"
                        >
                            {busy ? "Verificando…" : "Ativar 2FA"}
                        </Button>
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="rounded-none font-mono text-[10px] uppercase"
                        disabled={busy}
                    >
                        Close
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
