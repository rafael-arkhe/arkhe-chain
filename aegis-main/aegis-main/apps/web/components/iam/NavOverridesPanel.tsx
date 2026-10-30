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
import { Switch } from "@/components/ui/switch";

import {
    navApi,
    rolesApi,
    type NavConfig,
    type NavTree,
    type RoleOut,
} from "@/lib/iam/api";


type Draft = Record<
    string,
    { visible: boolean; override_label: string | null }
>;


export function NavOverridesPanel() {
    const [config, setConfig] = React.useState<NavConfig | null>(null);
    const [roles, setRoles] = React.useState<RoleOut[]>([]);
    const [scope, setScope] = React.useState<string>("__tenant__");
    const [draft, setDraft] = React.useState<Draft>({});
    const [preview, setPreview] = React.useState<NavTree | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const refresh = React.useCallback(async () => {
        setError(null);
        try {
            const [c, r] = await Promise.all([
                navApi.config(),
                rolesApi.list(),
            ]);
            setConfig(c);
            setRoles(r);
        } catch (e) {
            setError(e instanceof Error ? e.message : "load failed");
        }
    }, []);
    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    // Reset draft when scope or config change.
    React.useEffect(() => {
        if (!config) return;
        const targetRoleId = scope === "__tenant__" ? null : scope;
        const next: Draft = {};
        // Hydrate with current overrides for the chosen scope.
        for (const ov of config.overrides) {
            if ((ov.role_id ?? null) === targetRoleId) {
                next[ov.nav_key] = {
                    visible: ov.visible,
                    override_label: ov.override_label,
                };
            }
        }
        setDraft(next);
    }, [config, scope]);

    // Preview: when scope is a role, show /iam/nav?as_role_id=…; else show
    // the principal's own filtered tree.
    React.useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const t =
                    scope === "__tenant__"
                        ? await navApi.tree()
                        : await navApi.tree(scope);
                if (alive) setPreview(t);
            } catch {
                if (alive) setPreview(null);
            }
        };
        void load();
        return () => {
            alive = false;
        };
    }, [scope, config]);

    function setItemDraft(navKey: string, patch: Partial<Draft[string]>) {
        setDraft((d) => ({
            ...d,
            [navKey]: {
                visible: d[navKey]?.visible ?? true,
                override_label: d[navKey]?.override_label ?? null,
                ...patch,
            },
        }));
    }

    async function save() {
        if (!config) return;
        setBusy(true);
        setError(null);
        try {
            const targetRoleId = scope === "__tenant__" ? null : scope;
            const overrides = Object.entries(draft).map(([navKey, v]) => ({
                role_id: targetRoleId,
                nav_key: navKey,
                visible: v.visible,
                override_label: v.override_label || null,
            }));
            await navApi.upsertOverrides(overrides);
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "save failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="border border-border-light bg-canvas-light">
            <header className="flex items-center justify-between p-3 border-b border-border-light gap-2">
                <h2 className="text-[11px] font-mono uppercase tracking-wider text-text-on-light">
                    Nav Visibility
                </h2>
                <div className="flex items-center gap-2">
                    <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
                        Scope
                    </Label>
                    <Select value={scope} onValueChange={setScope}>
                        <SelectTrigger
                            className="rounded-none bg-panel-light border-border-light font-mono text-[11px] h-8 w-[200px]"
                            data-testid="nav-scope"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none bg-panel-light border-border-light">
                            <SelectItem
                                value="__tenant__"
                                className="font-mono text-[11px]"
                            >
                                Tenant-wide
                            </SelectItem>
                            {roles.map((r) => (
                                <SelectItem
                                    key={r.id}
                                    value={r.id}
                                    className="font-mono text-[11px]"
                                >
                                    Role: {r.key}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        onClick={() => void save()}
                        disabled={busy}
                        className="rounded-none font-mono text-[10px] uppercase"
                        data-testid="nav-save"
                    >
                        {busy ? "Salvando…" : "Salvar"}
                    </Button>
                </div>
            </header>

            {error && (
                <div className="px-3 py-2 text-[11px] font-mono text-danger border-b border-border-light">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 gap-0 divide-x divide-border-light">
                {/* Editor */}
                <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
                    {!config ? (
                        <div className="text-[11px] font-mono text-muted-on-light">
                            Loading…
                        </div>
                    ) : (
                        config.default_tree.sections.map((section) => (
                            <div
                                key={section.id}
                                className="border border-border-light p-2"
                            >
                                <NavRow
                                    navKey={`nav.section.${section.id}`}
                                    label={section.title}
                                    isSection
                                    draft={draft}
                                    setItemDraft={setItemDraft}
                                />
                                <div className="pl-3 mt-2 space-y-1 border-l border-border-light">
                                    {section.items.map((item) => (
                                        <NavRow
                                            key={item.perm_key || item.href}
                                            navKey={item.perm_key || item.href}
                                            label={item.label}
                                            draft={draft}
                                            setItemDraft={setItemDraft}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Preview */}
                <div className="p-3">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light mb-2">
                        Preview ({scope === "__tenant__" ? "you" : "selected role"})
                    </div>
                    {preview ? (
                        <div className="space-y-2">
                            {preview.sections.map((s) => (
                                <div key={s.id} className="border border-border-light p-2">
                                    <div className="text-[11px] font-mono text-text-on-light uppercase tracking-wider">
                                        {s.title}
                                    </div>
                                    <div className="pl-3 mt-1 flex flex-col gap-0.5">
                                        {s.items.map((i) => (
                                            <div
                                                key={i.href}
                                                className="text-[11px] font-mono text-muted-on-light"
                                            >
                                                · {i.label}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {preview.sections.length === 0 && (
                                <div className="text-[11px] font-mono text-muted-on-light">
                                    Nothing visible.
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-[11px] font-mono text-muted-on-light">
                            Loading preview…
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}


function NavRow({
    navKey,
    label,
    isSection,
    draft,
    setItemDraft,
}: {
    navKey: string;
    label: string;
    isSection?: boolean;
    draft: Draft;
    setItemDraft: (key: string, patch: Partial<Draft[string]>) => void;
}) {
    const v = draft[navKey];
    const visible = v?.visible ?? true;
    const labelOverride = v?.override_label ?? "";
    return (
        <div
            className={`flex items-center gap-2 ${isSection ? "" : "pl-2"}`}
            data-testid={`nav-row-${navKey}`}
        >
            <Switch
                checked={visible}
                onCheckedChange={(c) => setItemDraft(navKey, { visible: !!c })}
                data-testid={`nav-toggle-${navKey}`}
            />
            <span
                className={
                    "font-mono text-[11px] " +
                    (isSection
                        ? "text-text-on-light uppercase tracking-wider"
                        : "text-muted-on-light")
                }
            >
                {label}
            </span>
            <Input
                value={labelOverride}
                onChange={(e) =>
                    setItemDraft(navKey, {
                        override_label: e.target.value || null,
                    })
                }
                placeholder="renomear…"
                className="ml-auto rounded-none bg-panel-light border-border-light font-mono text-[10px] h-6 w-[120px]"
            />
            {v && (
                <Badge
                    variant="outline"
                    className="rounded-none border-success text-success text-[9px] font-mono"
                >
                    draft
                </Badge>
            )}
        </div>
    );
}
