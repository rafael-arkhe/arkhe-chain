"use client";

/**
 * Loja — Frente C (Loja cross-tenant, blueprint re-materialize).
 *
 * Repointada para /solutions/marketplace: o catálogo mostra soluções publicadas
 * em TODO o deployment; instalar RE-MATERIALIZA a solução no tenant do operador
 * (a solução inteira — tipos, ações, agentes, app, páginas — nasce no tenant
 * dele). Publicar SNAPSHOTA o blueprint de um diagrama da solução.
 *
 * O marketplace v23 (que só gravava bookkeeping e não materializava nada) deixou
 * de alimentar esta tela — sem auto-seed. Convenções AEGIS: cantos retos, ícones
 * neutros, useT (pt-BR/en-US), zero diálogo nativo, JetBrains Mono p/ dados.
 */
import * as React from "react";
import { ShoppingBag, Loader2, Upload, Boxes, Check, Hash } from "lucide-react";

import { RequirePerm } from "@/components/auth/require-perm";
import { CpPageHeader } from "@/components/control-panel/control-panel-shell";
import { CpErrorState } from "@/components/control-panel/cp-skeleton";
import { CpEmptyState } from "@/components/control-panel/cp-empty-state";
import { ConfirmProvider } from "@/components/dialog/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { useCan } from "@/lib/auth/useAuth";
import { useT } from "@/lib/i18n/provider";
import { ModalPortal } from "@/components/ui/modal-backdrop";
import { ApiError } from "@/lib/api/client";
import { Solutions, type SolutionDiagram } from "@/lib/api";
import {
  SolucoesMarketplace,
  type SolutionListing,
  type ListingManifest,
} from "@/lib/api/solucoes-marketplace";

function humanErr(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    try {
      const p = JSON.parse(e.message) as { detail?: unknown };
      if (p && typeof p.detail === "string") return p.detail;
    } catch {
      /* corpo não-JSON */
    }
    return e.message || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

export default function LojaPage() {
  return (
    <RequirePerm perm="workspace.publish">
      <ConfirmProvider>
        <LojaInner />
      </ConfirmProvider>
    </RequirePerm>
  );
}

const MANIFEST_ROWS: { key: keyof ListingManifest; labelKey: string }[] = [
  { key: "ontology_types", labelKey: "loja.manifest.types" },
  { key: "action_types", labelKey: "loja.manifest.actions" },
  { key: "agents", labelKey: "loja.manifest.agents" },
  { key: "flows", labelKey: "loja.manifest.flows" },
  { key: "logic_functions", labelKey: "loja.manifest.functions" },
  { key: "pages", labelKey: "loja.manifest.pages" },
];

function LojaInner() {
  const t = useT();
  const canPublish = useCan("workshop.apps.write");
  const [listings, setListings] = React.useState<SolutionListing[] | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<SolutionListing | null>(null);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [installing, setInstalling] = React.useState<SolutionListing | null>(null);

  const reload = React.useCallback(async () => {
    setLoadErr(null);
    try {
      setListings(await SolucoesMarketplace.listings({ status: "published" }));
    } catch (e) {
      setLoadErr(humanErr(e, t("loja.error.load")));
      setListings([]);
    }
  }, [t]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = React.useMemo(() => {
    const all = listings ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((l) =>
      `${l.title} ${l.description} ${(l.tags || []).join(" ")}`.toLowerCase().includes(needle),
    );
  }, [listings, search]);

  if (loadErr) {
    return (
      <div data-testid="loja-page" className="h-full flex flex-col">
        <CpPageHeader
          title={
            <span className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
              {t("loja.title")}
            </span>
          }
          subtitle={t("loja.error.load")}
        />
        <div className="p-6">
          <CpErrorState title={t("loja.error.title")} description={loadErr} retry={reload} />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="loja-page" className="h-full flex flex-col">
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
            {t("loja.title")}
          </span>
        }
        subtitle={t("loja.subtitle")}
      />

      {/* Toolbar: busca + publicar */}
      <div className="border-b border-border-light bg-raised-light px-3 py-2 flex items-center gap-2 shrink-0">
        <input
          data-testid="loja-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("loja.search")}
          className="h-8 px-2 text-[12px] bg-white border border-border-light focus:border-primary outline-none flex-1 max-w-sm"
        />
        <span className="text-[10px] text-muted-on-light font-mono ml-auto">
          {filtered.length} {t("loja.count")}
        </span>
        {canPublish && (
          <button
            type="button"
            data-testid="loja-publish-button"
            onClick={() => setPublishOpen(true)}
            className="h-8 px-3 bg-primary text-white border border-primary hover:bg-primary-hover text-[11px] font-mono uppercase tracking-wider flex items-center gap-1"
          >
            <Upload className="h-3 w-3" strokeWidth={1.5} />
            {t("loja.publish.action")}
          </button>
        )}
      </div>

      {/* Catálogo + detalhe */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-auto p-4">
          {listings === null ? (
            <div className="text-[12px] text-muted-on-light inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              {t("common.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <CpEmptyState
              icon={ShoppingBag}
              title={t("loja.empty.title")}
              description={t("loja.empty.desc")}
            />
          ) : (
            <div data-testid="loja-card-grid" className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  selected={selected?.id === l.id}
                  onSelect={() => setSelected(l)}
                  onInstall={() => setInstalling(l)}
                />
              ))}
            </div>
          )}
        </div>

        {selected && (
          <aside
            data-testid="loja-detail"
            className="w-80 shrink-0 border-l border-border-light overflow-auto p-4 space-y-4 bg-canvas-light"
          >
            <DetailPane listing={selected} onInstall={() => setInstalling(selected)} />
          </aside>
        )}
      </div>

      {installing && (
        <InstallModal
          listing={installing}
          onClose={() => setInstalling(null)}
          onInstalled={async () => {
            setInstalling(null);
            await reload();
          }}
        />
      )}
      {publishOpen && (
        <PublishModal
          onClose={() => setPublishOpen(false)}
          onPublished={async () => {
            setPublishOpen(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function ManifestSummary({ manifest }: { manifest: ListingManifest }) {
  const t = useT();
  const rows = MANIFEST_ROWS.filter((r) => (manifest[r.key] ?? 0) > 0);
  if (rows.length === 0) {
    return <p className="text-[11px] text-muted-on-light italic">{t("loja.manifest.empty")}</p>;
  }
  return (
    <ul data-testid="loja-manifest" className="grid grid-cols-2 gap-1">
      {rows.map((r) => (
        <li key={r.key} className="text-[11px] text-text-on-light flex items-center gap-1.5">
          <span className="font-mono text-primary">{manifest[r.key]}</span>
          <span className="text-muted-on-light">{t(r.labelKey)}</span>
        </li>
      ))}
    </ul>
  );
}

function ListingCard({
  listing,
  selected,
  onSelect,
  onInstall,
}: {
  listing: SolutionListing;
  selected: boolean;
  onSelect: () => void;
  onInstall: () => void;
}) {
  const t = useT();
  return (
    <div
      data-testid={`loja-card-${listing.slug}`}
      onClick={onSelect}
      className={
        (selected ? "border-primary " : "border-border-light ") +
        "border bg-canvas-light p-4 space-y-3 cursor-pointer hover:border-primary"
      }
    >
      <div className="flex items-start gap-3">
        <Boxes className="h-5 w-5 text-muted-on-light mt-0.5 shrink-0" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold text-text-on-light truncate">{listing.title}</h2>
          {listing.oem && (
            <span data-testid="loja-oem-badge" className="inline-block mt-1 text-[9px] font-mono uppercase tracking-wider text-primary border border-primary/40 px-1 py-0.5">{t("loja.oem.badge")}</span>
          )}
          {listing.description && (
            <p className="text-[11px] text-muted-on-light mt-1 leading-relaxed line-clamp-2">
              {listing.description}
            </p>
          )}
        </div>
      </div>
      <ManifestSummary manifest={listing.manifest} />
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[10px] text-muted-on-light font-mono">
          {listing.install_count} {t("loja.installs")}
        </span>
        <button
          type="button"
          data-testid={`loja-install-button-${listing.slug}`}
          onClick={(e) => {
            e.stopPropagation();
            onInstall();
          }}
          className="h-8 px-3 bg-primary text-white border border-primary hover:bg-primary-hover text-[11px] font-mono uppercase tracking-wider flex items-center gap-1"
        >
          {t("loja.install.action")}
        </button>
      </div>
    </div>
  );
}

function DetailPane({ listing, onInstall }: { listing: SolutionListing; onInstall: () => void }) {
  const t = useT();
  return (
    <>
      <div>
        <h2 className="text-[14px] font-semibold text-text-on-light">{listing.title}</h2>
        {listing.category && (
          <span className="text-[10px] text-muted-on-light font-mono uppercase">{listing.category}</span>
        )}
      </div>
      {listing.description && (
        <p className="text-[12px] text-muted-on-light leading-relaxed">{listing.description}</p>
      )}
      {listing.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {listing.tags.map((tag) => (
            <span key={tag} className="text-[10px] font-mono text-text-on-light border border-border-light px-1.5 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}
      <section className="border-t border-border-light pt-3">
        <p className="text-[11px] font-semibold text-text-on-light mb-1.5">{t("loja.manifest.title")}</p>
        <ManifestSummary manifest={listing.manifest} />
      </section>
      {listing.display && <RichSections d={listing.display} />}
      <button
        type="button"
        data-testid="loja-install-button"
        onClick={onInstall}
        className="h-9 w-full bg-primary text-white border border-primary hover:bg-primary-hover text-[11px] font-mono uppercase tracking-wider flex items-center justify-center gap-1"
      >
        {t("loja.install.action")}
      </button>
    </>
  );
}

function RichSections({ d }: { d: NonNullable<SolutionListing["display"]> }) {
  const t = useT();
  const tipos = d.usa_ontologia_tipos ?? [];
  const srcs = d.usa_datasources ?? [];
  const outs = d.outputs ?? [];
  return (
    <div data-testid="loja-rich" className="space-y-4">
      {(tipos.length > 0 || srcs.length > 0) && (
        <section className="border-t border-border-light pt-3 space-y-2">
          <p className="text-[11px] font-semibold text-text-on-light">{t("loja.rich.ontologia")}</p>
          {tipos.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tipos.map((x) => (
                <span key={x.node_type} title={x.descricao_uso} className="text-[10px] font-mono text-primary border border-primary/40 px-1.5 py-0.5">{x.node_type}</span>
              ))}
            </div>
          )}
          {srcs.length > 0 && (
            <ul className="space-y-1">
              {srcs.map((s) => (
                <li key={s.nome} className="text-[11px] text-text-on-light flex items-start gap-1.5">
                  <span className="text-muted-on-light font-mono text-[9px] uppercase mt-0.5">{s.obrigatorio ? t("loja.rich.obrigatorio") : t("loja.rich.opcional")}</span>
                  <span><span className="font-semibold">{s.nome}</span>{s.observacoes ? <span className="text-muted-on-light"> — {s.observacoes}</span> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {outs.length > 0 && (
        <section className="border-t border-border-light pt-3 space-y-1">
          <p className="text-[11px] font-semibold text-text-on-light">{t("loja.rich.outputs")}</p>
          <ul className="space-y-0.5">
            {outs.map((o) => (
              <li key={o.tipo} className="text-[11px] text-text-on-light"><span className="font-mono text-primary">›</span> <span className="font-semibold">{o.tipo}</span>{o.descricao ? <span className="text-muted-on-light"> — {o.descricao}</span> : null}</li>
            ))}
          </ul>
        </section>
      )}
      {d.interacao_descricao && (
        <section className="border-t border-border-light pt-3 space-y-1">
          <p className="text-[11px] font-semibold text-text-on-light">{t("loja.rich.interacao")}</p>
          <p className="text-[11px] text-muted-on-light leading-relaxed">{d.interacao_descricao}</p>
        </section>
      )}
    </div>
  );
}

function ModalShell({ children, onClose, testid }: { children: React.ReactNode; onClose: () => void; testid: string }) {
  return (
    <ModalPortal>
    <div
      className="fixed inset-0 ds-overlay z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid={testid}
    >
      <div
        className="bg-canvas-light border border-border-light max-w-lg w-full max-h-[85vh] overflow-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
    </ModalPortal>
  );
}

function InstallModal({
  listing,
  onClose,
  onInstalled,
}: {
  listing: SolutionListing;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [vendorPw, setVendorPw] = React.useState("");

  const doInstall = async () => {
    if (listing.oem && !vendorPw.trim()) {
      setErr(t("loja.oem.required"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await SolucoesMarketplace.install(listing.id, listing.oem ? vendorPw : undefined);
      const fails = (res.failures || []).length;
      if (fails > 0) {
        toast(t("loja.install.partial"));
      } else {
        toast.success(t("loja.install.success"));
      }
      onInstalled();
    } catch (e) {
      setErr(humanErr(e, t("loja.install.error")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} testid="loja-install-modal">
      <header className="flex items-start gap-2">
        <Boxes className="h-4 w-4 text-foreground shrink-0 mt-0.5" strokeWidth={1.5} />
        <div>
          <h2 className="text-[14px] font-semibold text-text-on-light">
            {t("loja.install.title")}
          </h2>
          <p className="text-[12px] text-muted-on-light mt-1 leading-relaxed">{listing.title}</p>
        </div>
      </header>
      <div className="border border-border-light p-3 space-y-2">
        <p className="text-[11px] text-muted-on-light leading-relaxed">{t("loja.install.hint")}</p>
        <ManifestSummary manifest={listing.manifest} />
      </div>
      {listing.oem && (
        <div className="border border-primary/40 bg-primary/5 p-3 space-y-2">
          <p className="text-[11px] text-text-on-light leading-relaxed">{t("loja.oem.hint")}</p>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-on-light">{t("loja.oem.password")}</label>
          <input
            type="password"
            data-testid="loja-oem-password"
            value={vendorPw}
            onChange={(e) => setVendorPw(e.target.value)}
            autoComplete="off"
            className="h-8 w-full px-2 text-[12px] bg-white border border-border-light focus:border-primary outline-none"
          />
        </div>
      )}
      {err && (
        <div className="border border-danger/30 bg-danger/5 px-3 py-2 text-[11px] font-mono text-danger">{err}</div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-light">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="h-8 px-3 bg-canvas-light border border-border-light hover:border-primary text-[11px] font-mono uppercase tracking-wider"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          data-testid="loja-install-confirm"
          onClick={doInstall}
          disabled={busy}
          className="h-8 px-3 bg-primary text-white border border-primary hover:bg-primary-hover text-[11px] font-mono uppercase tracking-wider flex items-center gap-1 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />}
          {t("loja.install.confirm")}
        </button>
      </div>
    </ModalShell>
  );
}

function PublishModal({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const t = useT();
  const [diagrams, setDiagrams] = React.useState<SolutionDiagram[] | null>(null);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    Solutions.listDiagrams()
      .then((d) => setDiagrams(d))
      .catch((e) => {
        setErr(humanErr(e, t("loja.publish.loadError")));
        setDiagrams([]);
      });
  }, [t]);

  const doPublish = async () => {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      await SolucoesMarketplace.publish({ diagram_id: picked });
      toast.success(t("loja.publish.success"));
      onPublished();
    } catch (e) {
      setErr(humanErr(e, t("loja.publish.error")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} testid="loja-publish-modal">
      <header className="flex items-start gap-2">
        <Upload className="h-4 w-4 text-foreground shrink-0 mt-0.5" strokeWidth={1.5} />
        <div>
          <h2 className="text-[14px] font-semibold text-text-on-light">{t("loja.publish.title")}</h2>
          <p className="text-[12px] text-muted-on-light mt-1 leading-relaxed">{t("loja.publish.hint")}</p>
        </div>
      </header>

      {diagrams === null ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-on-light py-4">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
          {t("common.loading")}
        </div>
      ) : diagrams.length === 0 ? (
        <p className="text-[12px] text-text-on-light italic">{t("loja.publish.noDiagrams")}</p>
      ) : (
        <ul className="space-y-1.5 max-h-72 overflow-auto">
          {diagrams.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                data-testid={`loja-publish-diagram-${d.id}`}
                onClick={() => setPicked(d.id ?? null)}
                className={
                  (picked === d.id ? "border-primary " : "border-border-light ") +
                  "w-full text-left border px-3 py-2 hover:border-primary flex items-center gap-2"
                }
              >
                {picked === d.id ? (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" strokeWidth={2} />
                ) : (
                  <Hash className="h-3.5 w-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
                )}
                <span className="text-[12px] text-text-on-light truncate">{d.title || d.slug || d.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {err && (
        <div className="border border-danger/30 bg-danger/5 px-3 py-2 text-[11px] font-mono text-danger">{err}</div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-light">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="h-8 px-3 bg-canvas-light border border-border-light hover:border-primary text-[11px] font-mono uppercase tracking-wider"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          data-testid="loja-publish-confirm"
          onClick={doPublish}
          disabled={busy || !picked}
          className="h-8 px-3 bg-primary text-white border border-primary hover:bg-primary-hover text-[11px] font-mono uppercase tracking-wider flex items-center gap-1 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />}
          {t("loja.publish.confirm")}
        </button>
      </div>
    </ModalShell>
  );
}
