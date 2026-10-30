"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

import { auditApi, type AuditEventOut } from "@/lib/iam/api";


const EVENT_TYPES = [
    "all",
    "login.success",
    "login.failure",
    "login.locked",
    "refresh.rotated",
    "refresh.reuse_detected",
    "logout",
    "logout_all",
    "password.changed",
    "password.reset",
    "totp.enabled",
    "totp.disabled",
    "account.created",
    "account.disabled",
] as const;


export function AuditPanel() {
    const [events, setEvents] = React.useState<AuditEventOut[]>([]);
    const [eventType, setEventType] = React.useState<string>("all");
    const [success, setSuccess] = React.useState<string>("any");
    const [username, setUsername] = React.useState<string>("");
    const [limit, setLimit] = React.useState<number>(100);
    const [offset, setOffset] = React.useState<number>(0);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Parameters<typeof auditApi.list>[0] = {
                limit,
                offset,
            };
            if (eventType !== "all") params.event_type = eventType;
            if (success !== "any") params.success = success === "true";
            const rows = await auditApi.list(params);
            const filtered = username
                ? rows.filter((r) =>
                      (r.username_attempted || "")
                          .toLowerCase()
                          .includes(username.toLowerCase()),
                  )
                : rows;
            setEvents(filtered);
        } catch (e) {
            setError(e instanceof Error ? e.message : "load failed");
        } finally {
            setLoading(false);
        }
    }, [eventType, success, username, limit, offset]);

    React.useEffect(() => {
        void load();
    }, [load]);

    return (
        <section className="border border-border-light bg-canvas-light">
            <header className="p-3 border-b border-border-light">
                <h2 className="text-[11px] font-mono uppercase tracking-wider text-text-on-light mb-3">
                    Histórico de auditoria
                </h2>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                        <Label className="text-[9px] font-mono uppercase tracking-wider text-muted-on-light">
                            Tipo de evento
                        </Label>
                        <Select value={eventType} onValueChange={setEventType}>
                            <SelectTrigger
                                className="rounded-none bg-panel-light border-border-light font-mono text-[11px] h-8 w-[200px]"
                                data-testid="audit-event-type"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none bg-panel-light border-border-light">
                                {EVENT_TYPES.map((t) => (
                                    <SelectItem
                                        key={t}
                                        value={t}
                                        className="font-mono text-[11px]"
                                    >
                                        {t}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <Label className="text-[9px] font-mono uppercase tracking-wider text-muted-on-light">
                            Resultado
                        </Label>
                        <Select value={success} onValueChange={setSuccess}>
                            <SelectTrigger className="rounded-none bg-panel-light border-border-light font-mono text-[11px] h-8 w-[140px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none bg-panel-light border-border-light">
                                <SelectItem value="any" className="font-mono text-[11px]">
                                    qualquer
                                </SelectItem>
                                <SelectItem value="true" className="font-mono text-[11px]">
                                    sucesso
                                </SelectItem>
                                <SelectItem value="false" className="font-mono text-[11px]">
                                    falha
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                        <Label className="text-[9px] font-mono uppercase tracking-wider text-muted-on-light">
                            Usuário contém
                        </Label>
                        <Input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="rounded-none bg-panel-light border-border-light font-mono text-[11px] h-8"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <Label className="text-[9px] font-mono uppercase tracking-wider text-muted-on-light">
                            Limite
                        </Label>
                        <Input
                            type="number"
                            min={1}
                            max={1000}
                            value={limit}
                            onChange={(e) => setLimit(Number(e.target.value) || 100)}
                            className="rounded-none bg-panel-light border-border-light font-mono text-[11px] h-8 w-[80px]"
                        />
                    </div>

                    <Button
                        onClick={() => void load()}
                        size="sm"
                        disabled={loading}
                        className="rounded-none font-mono text-[10px] uppercase tracking-wider"
                        data-testid="audit-refresh"
                    >
                        {loading ? "Carregando…" : "Atualizar"}
                    </Button>
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
                            Quando (UTC)
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            Evento
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            Usuário
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            IP
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            Motivo
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                            Resultado
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {events.length === 0 && !loading ? (
                        <TableRow className="border-border-light">
                            <TableCell
                                colSpan={6}
                                className="text-center text-[11px] font-mono text-muted-on-light"
                            >
                                Nenhum evento bate com este filtro.
                            </TableCell>
                        </TableRow>
                    ) : (
                        events.map((e) => (
                            <TableRow
                                key={e.id}
                                className="border-border-light hover:bg-raised-light/70"
                                data-testid={`audit-row-${e.id}`}
                            >
                                <TableCell className="font-mono text-[10px] text-muted-on-light whitespace-nowrap">
                                    {new Date(e.created_at).toLocaleString()}
                                </TableCell>
                                <TableCell className="font-mono text-[11px] text-text-on-light whitespace-nowrap">
                                    {e.event_type}
                                </TableCell>
                                <TableCell className="font-mono text-[10px] text-muted-on-light">
                                    {e.username_attempted || "—"}
                                </TableCell>
                                <TableCell className="font-mono text-[10px] text-muted-on-light">
                                    {e.ip_address || "—"}
                                </TableCell>
                                <TableCell className="font-mono text-[10px] text-muted-on-light max-w-md truncate">
                                    {e.reason || "—"}
                                </TableCell>
                                <TableCell>
                                    {e.success ? (
                                        <Badge
                                            variant="outline"
                                            className="rounded-none border-success text-success bg-success/10 text-[9px] font-mono"
                                        >
                                            sucesso
                                        </Badge>
                                    ) : (
                                        <Badge
                                            variant="outline"
                                            className="rounded-none border-danger text-danger bg-danger/10 text-[9px] font-mono"
                                        >
                                            falha
                                        </Badge>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <div className="flex items-center justify-between p-3 border-t border-border-light">
                <div className="text-[10px] font-mono text-muted-on-light">
                    {events.length} eventos · a partir do {offset}
                </div>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOffset((o) => Math.max(0, o - limit))}
                        disabled={offset === 0 || loading}
                        className="rounded-none font-mono text-[10px] uppercase"
                    >
                        Anterior
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOffset((o) => o + limit)}
                        disabled={loading || events.length < limit}
                        className="rounded-none font-mono text-[10px] uppercase"
                    >
                        Próxima
                    </Button>
                </div>
            </div>
        </section>
    );
}
