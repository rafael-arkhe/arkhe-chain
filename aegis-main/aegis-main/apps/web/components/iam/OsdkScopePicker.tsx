"use client";

/**
 * OsdkScopePicker — seletor DENSO de escopos (permissões) para tokens OSDK.
 *
 * Agrupa o catálogo IAM por ``resource`` (o prefixo pontuado). Cada grupo tem
 * master-checkbox tri-state + contador ``k/n`` e colapsa por padrão; cada folha
 * é uma permission key.
 *
 * Ferramentas de uso em massa (o operador seleciona dezenas de escopos por vez):
 *   - busca/filtro em tempo real (resource · key · action · description)
 *   - "Selecionar tudo" / "Limpar" sobre o conjunto VISÍVEL (= tudo, sem filtro)
 *   - preset "Somente leitura" (aplicação GLOBAL — ver READ_ACTIONS abaixo)
 *   - expandir/colapsar tudo
 *
 * Régua: cantos retos, #2D77BE único acento, Inter p/ rótulo e JetBrains Mono
 * só p/ DADO (key, contadores), ícones lucide 1.5, strings via useT().
 */
import * as React from "react";
import { ChevronDown, ChevronRight, Eye, Search, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { permissionsApi, type PermissionOut } from "@/lib/iam/api";
import { useT } from "@/lib/i18n/provider";

type Group = { resource: string; perms: PermissionOut[] };

/**
 * Heurística do preset "Somente leitura".
 *
 * Casa a ÚLTIMA parte da key (``action``) por igualdade exata — NUNCA por
 * substring. No catálogo real existem `review` (contém "view") e `hotlist`
 * (contém "list"), ambos ações de ESCRITA: um `includes()` os selecionaria e o
 * preset deixaria de ser somente-leitura. Prefixos com `_` cobrem futuras
 * variações (`read_all`, `list_own`) sem reabrir o falso-positivo.
 */
const READ_ACTIONS = new Set(["read", "view", "list", "get"]);
const READ_PREFIXES = ["read_", "view_", "list_", "get_"];

export function isReadOnlyAction(action: string): boolean {
    const a = (action || "").toLowerCase();
    return READ_ACTIONS.has(a) || READ_PREFIXES.some((p) => a.startsWith(p));
}

/**
 * Normaliza p/ busca: minúsculas + sem acento (o catálogo mistura pt-BR e en).
 * A classe de combining marks é montada via `new RegExp` de propósito — literal
 * no fonte, esses code points são invisíveis e sobrevivem mal a reescrita.
 */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

function norm(s: string): string {
    return (s || "").toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

const BULK_BTN =
    "h-7 px-2 text-[11px] flex items-center gap-1.5 whitespace-nowrap border " +
    "border-border-light bg-canvas-light text-text-on-light transition-colors " +
    "hover:border-primary hover:text-primary " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 " +
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border-light disabled:hover:text-text-on-light";

export function OsdkScopePicker({
    value,
    onChange,
    disabled,
}: {
    value: string[];
    onChange: (next: string[]) => void;
    disabled?: boolean;
}) {
    const t = useT();
    const uid = React.useId();
    const [groups, setGroups] = React.useState<Group[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [query, setQuery] = React.useState("");
    const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

    React.useEffect(() => {
        let alive = true;
        permissionsApi
            .list()
            .then((rows) => {
                if (!alive) return;
                // Skip nav.* — those gate UI, not API surface.
                const filtered = rows.filter((r) => !r.key.startsWith("nav."));
                const map = new Map<string, PermissionOut[]>();
                for (const p of filtered) {
                    if (!map.has(p.resource)) map.set(p.resource, []);
                    map.get(p.resource)!.push(p);
                }
                setGroups(
                    Array.from(map.entries())
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([resource, perms]) => ({ resource, perms })),
                );
            })
            .catch((e) => {
                if (!alive) return;
                setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, []);

    const selected = React.useMemo(() => new Set(value), [value]);

    const allKeys = React.useMemo(
        () => groups.flatMap((g) => g.perms.map((p) => p.key)),
        [groups],
    );
    const selectedCount = React.useMemo(
        () => allKeys.reduce((n, k) => (selected.has(k) ? n + 1 : n), 0),
        [allKeys, selected],
    );

    const needle = norm(query.trim());
    const filtering = needle.length > 0;

    const visible = React.useMemo<Group[]>(() => {
        if (!needle) return groups;
        const out: Group[] = [];
        for (const g of groups) {
            if (norm(g.resource).includes(needle)) {
                out.push(g);
                continue;
            }
            const perms = g.perms.filter(
                (p) =>
                    norm(p.key).includes(needle) ||
                    norm(p.action).includes(needle) ||
                    norm(p.description).includes(needle),
            );
            if (perms.length) out.push({ resource: g.resource, perms });
        }
        return out;
    }, [groups, needle]);

    const visibleKeys = React.useMemo(
        () => visible.flatMap((g) => g.perms.map((p) => p.key)),
        [visible],
    );

    // Digitar no filtro abre os grupos que casaram — resultado de busca escondido
    // atrás de um chevron não é resultado. Colapsar manualmente ainda funciona.
    const prevNeedle = React.useRef("");
    React.useEffect(() => {
        if (needle && needle !== prevNeedle.current) {
            setExpanded(new Set(visible.map((g) => g.resource)));
        }
        prevNeedle.current = needle;
    }, [needle, visible]);

    const anyOpen = visible.some((g) => expanded.has(g.resource));

    function setKeys(keys: string[], on: boolean) {
        if (disabled) return;
        const next = new Set(selected);
        for (const k of keys) {
            if (on) next.add(k);
            else next.delete(k);
        }
        onChange(Array.from(next).sort());
    }

    function applyReadOnly() {
        if (disabled) return;
        // GLOBAL de propósito: o preset promete um token somente-leitura, então
        // precisa zerar também o que está fora do filtro. Limpa a busca junto
        // p/ o operador ver o resultado que acabou de aplicar.
        const next = groups
            .flatMap((g) => g.perms)
            .filter((p) => isReadOnlyAction(p.action))
            .map((p) => p.key)
            .sort();
        setQuery("");
        onChange(next);
    }

    function toggleGroupOpen(resource: string) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(resource)) next.delete(resource);
            else next.add(resource);
            return next;
        });
    }

    if (loading) {
        return (
            <div
                className="border border-border-light bg-canvas-light px-3 py-4 text-[11px] text-muted-on-light"
                data-testid="scope-loading"
            >
                {t("osdk.scope.loading")}
            </div>
        );
    }
    if (error) {
        return (
            <div
                className="border border-danger bg-danger/10 px-3 py-3 text-[11px] text-danger"
                role="alert"
                data-testid="scope-error"
            >
                <span className="block font-medium">{t("osdk.scope.load_error")}</span>
                <span className="block font-mono text-[10px] break-words opacity-80">
                    {error}
                </span>
            </div>
        );
    }

    return (
        <div
            className="border border-border-light bg-canvas-light"
            data-testid="scope-picker"
        >
            {/* ── Barra de ferramentas: busca + ações de massa + contador ── */}
            <div className="flex flex-col gap-2 border-b border-border-light bg-panel-light p-2">
                <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Search
                            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-on-light"
                            strokeWidth={1.5}
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            disabled={disabled}
                            placeholder={t("osdk.scope.search_placeholder")}
                            aria-label={t("osdk.scope.search_label")}
                            data-testid="scope-search"
                            className="h-7 w-full rounded-none border border-border-light bg-canvas-light pl-7 pr-7 text-[11px] text-text-on-light placeholder:text-muted-on-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 disabled:opacity-50"
                        />
                        {filtering && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                aria-label={t("osdk.scope.clear_filter")}
                                title={t("osdk.scope.clear_filter")}
                                data-testid="scope-search-clear"
                                className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-muted-on-light transition-colors hover:text-text-on-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                                <X className="h-3 w-3" strokeWidth={1.5} />
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            setExpanded(
                                anyOpen ? new Set() : new Set(groups.map((g) => g.resource)),
                            )
                        }
                        data-testid="scope-expand-all"
                        className={BULK_BTN}
                    >
                        {anyOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                        )}
                        {anyOpen ? t("osdk.scope.collapse_all") : t("osdk.scope.expand_all")}
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setKeys(visibleKeys, true)}
                        disabled={disabled || visibleKeys.length === 0}
                        data-testid="scope-select-all"
                        className={BULK_BTN}
                    >
                        {t("osdk.scope.select_all")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setKeys(visibleKeys, false)}
                        disabled={disabled || visibleKeys.length === 0}
                        data-testid="scope-clear-all"
                        className={BULK_BTN}
                    >
                        {t("osdk.scope.clear_all")}
                    </button>
                    <button
                        type="button"
                        onClick={applyReadOnly}
                        disabled={disabled || allKeys.length === 0}
                        title={t("osdk.scope.preset_readonly_hint")}
                        data-testid="scope-preset-readonly"
                        className={BULK_BTN}
                    >
                        <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {t("osdk.scope.preset_readonly")}
                    </button>

                    <span
                        className="ml-auto whitespace-nowrap text-[11px] text-muted-on-light"
                        data-testid="scope-count"
                        aria-live="polite"
                    >
                        <span
                            className={
                                selectedCount > 0
                                    ? "font-mono font-semibold text-primary"
                                    : "font-mono text-muted-on-light"
                            }
                        >
                            {selectedCount}/{allKeys.length}
                        </span>{" "}
                        {t("osdk.scope.selected_suffix")}
                    </span>
                </div>

                {filtering && (
                    <p className="text-[10px] text-muted-on-light" data-testid="scope-filter-note">
                        {t("osdk.scope.bulk_filtered_note")}
                    </p>
                )}
            </div>

            {/* ── Árvore ── */}
            <div className="max-h-[46vh] space-y-1.5 overflow-y-auto p-2">
                {groups.length === 0 && (
                    <p className="px-1 py-3 text-[11px] text-muted-on-light" data-testid="scope-empty">
                        {t("osdk.scope.empty")}
                    </p>
                )}
                {groups.length > 0 && visible.length === 0 && (
                    <div className="px-1 py-3" data-testid="scope-no-match">
                        <p className="text-[11px] text-muted-on-light">
                            {t("osdk.scope.no_match")}
                        </p>
                        <button
                            type="button"
                            onClick={() => setQuery("")}
                            className="mt-1 text-[11px] text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            {t("osdk.scope.clear_filter")}
                        </button>
                    </div>
                )}

                {visible.map((g) => {
                    const hit = g.perms.filter((p) => selected.has(p.key)).length;
                    const groupSelected = hit === g.perms.length && hit > 0;
                    const groupPartial = !groupSelected && hit > 0;
                    const open = expanded.has(g.resource);
                    const panelId = `${uid}-${g.resource}`;
                    return (
                        <div key={g.resource} className="border border-border-light">
                            <div
                                className={`flex h-8 items-center gap-2 bg-panel-light px-2 ${open ? "border-b border-border-light" : ""}`}
                            >
                                <label
                                    className="flex shrink-0 cursor-pointer items-center"
                                    data-testid={`scope-group-${g.resource}`}
                                >
                                    <Checkbox
                                        checked={
                                            groupSelected
                                                ? true
                                                : groupPartial
                                                  ? "indeterminate"
                                                  : false
                                        }
                                        onCheckedChange={(c) =>
                                            setKeys(
                                                g.perms.map((p) => p.key),
                                                !!c,
                                            )
                                        }
                                        disabled={disabled}
                                        aria-label={`${t("osdk.scope.select_group")}: ${g.resource}`}
                                        className="data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary/40"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => toggleGroupOpen(g.resource)}
                                    aria-expanded={open}
                                    aria-controls={panelId}
                                    data-testid={`scope-group-toggle-${g.resource}`}
                                    className="flex min-w-0 flex-1 items-center gap-1 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                >
                                    {open ? (
                                        <ChevronDown
                                            className="h-3.5 w-3.5 shrink-0 text-muted-on-light"
                                            strokeWidth={1.5}
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <ChevronRight
                                            className="h-3.5 w-3.5 shrink-0 text-muted-on-light"
                                            strokeWidth={1.5}
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span className="truncate font-mono text-[11px] text-text-on-light">
                                        {g.resource}
                                    </span>
                                </button>
                                <span
                                    className="ml-auto shrink-0 font-mono text-[10px] text-muted-on-light"
                                    data-testid={`scope-group-count-${g.resource}`}
                                >
                                    <span className={hit > 0 ? "text-primary" : undefined}>
                                        {hit}
                                    </span>
                                    /{g.perms.length}
                                </span>
                            </div>

                            {open && (
                                <div id={panelId} className="space-y-0.5 p-1.5">
                                    {g.perms.map((p) => (
                                        <label
                                            key={p.id}
                                            className="flex cursor-pointer items-start gap-2 px-1 py-1 hover:bg-panel-light"
                                            data-testid={`scope-item-${p.key}`}
                                        >
                                            <Checkbox
                                                checked={selected.has(p.key)}
                                                onCheckedChange={(c) => setKeys([p.key], !!c)}
                                                disabled={disabled}
                                                aria-label={p.description || p.key}
                                                className="mt-px shrink-0"
                                            />
                                            <span className="min-w-0">
                                                <span
                                                    className={`block text-[11px] leading-tight text-text-on-light ${p.description ? "" : "font-mono"}`}
                                                >
                                                    {p.description || p.action}
                                                </span>
                                                <span className="block truncate font-mono text-[10px] text-muted-on-light">
                                                    {p.key}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
