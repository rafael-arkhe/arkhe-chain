"use client";

/**
 * KeysModal — "Configurar chaves" (Sprint 9). Modal genérico de credenciais do
 * Vault: lista packs (1 por conector/serviço, cada um com seus campos de chave)
 * e grava cada campo preenchido via Vault.setSecret (upsert idempotente). Campo
 * já cadastrado mostra ✓; senão um input para colar o valor.
 *
 * Por padrão lista as CHAVES DE API DOS CONECTORES MCP (Vault.connectorKeys —
 * Tavily, urlscan, Reddit, DataJud, …), que é o que o operador quer configurar
 * pela UI. As credenciais sociais (X/Instagram/YouTube) são gerenciadas pelo
 * fluxo do browser, não aqui. A fonte e os textos são parametrizáveis via props
 * para o mesmo componente servir outros contextos. Convenções AEGIS: cantos
 * retos, ícone neutro, useT, zero JSON cru.
 */
import * as React from "react";
import { Loader2, KeyRound, Check } from "lucide-react";
import { Vault, type VaultWizardPack, type VaultWizardField } from "@/lib/api/vault";
import { ApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";
import { ModalPortal } from "@/components/ui/modal-backdrop";

/** Erro do backend → frase limpa (nunca JSON cru na UI). */
function humanizeErr(e: unknown, t: (k: string) => string): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return t("aipChat.keys.denied");
    try {
      const parsed = JSON.parse(e.message) as { detail?: unknown };
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      /* corpo não-JSON — usa a mensagem como veio */
    }
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export function KeysModal({
  onClose,
  loadPacks = Vault.connectorKeys,
  titleKey = "connectors.keys.title",
  hintKey = "connectors.keys.hint",
  emptyKey = "connectors.keys.empty",
}: {
  onClose: () => void;
  /** Fonte dos packs (default: chaves de conector MCP). */
  loadPacks?: () => Promise<VaultWizardPack[]>;
  titleKey?: string;
  hintKey?: string;
  emptyKey?: string;
}) {
  const t = useT();
  const [packs, setPacks] = React.useState<VaultWizardPack[] | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(0);

  const fieldId = (f: VaultWizardField) => `${f.namespace}/${f.slug}`;

  const load = React.useCallback(async () => {
    setErr(null);
    try {
      setPacks(await loadPacks());
    } catch (e) {
      setErr(humanizeErr(e, t));
      setPacks([]);
    }
  }, [t, loadPacks]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const entries = Object.entries(values).filter(([, v]) => v.trim() !== "");
    if (entries.length === 0) {
      setErr(t("aipChat.keys.nothing"));
      return;
    }
    setBusy(true);
    setErr(null);
    let ok = 0;
    try {
      for (const pack of packs ?? []) {
        for (const f of pack.fields) {
          const v = values[fieldId(f)];
          if (!v || !v.trim()) continue;
          await Vault.setSecret({
            namespace: f.namespace,
            slug: f.slug,
            display_name: f.display_name,
            description: f.description,
            value: v.trim(),
            scope_skill_key: f.scope_skill_key ?? null,
          });
          ok += 1;
        }
      }
      setSaved(ok);
      setValues({});
      await load(); // re-fetch → status cadastrado atualiza
    } catch (e) {
      setErr(humanizeErr(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 ds-overlay z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="aip-keys-modal"
    >
      <div
        className="bg-canvas-light border border-border-light max-w-lg w-full max-h-[85vh] overflow-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-2">
          <KeyRound className="h-4 w-4 text-foreground shrink-0 mt-0.5" strokeWidth={1.5} />
          <div>
            <h2 className="text-[14px] font-semibold text-text-on-light">
              {t(titleKey)}
            </h2>
            <p className="text-[12px] text-muted-on-light mt-1 leading-relaxed">
              {t(hintKey)}
            </p>
          </div>
        </header>

        {packs === null ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-on-light py-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
            {t("common.loading")}
          </div>
        ) : packs.length === 0 ? (
          <p className="text-[12px] text-text-on-light italic">{t(emptyKey)}</p>
        ) : (
          <div className="space-y-4">
            {packs.map((pack) => (
              <section key={pack.pack_id} className="border border-border-light" data-testid={`aip-keys-pack-${pack.pack_id}`}>
                <header className="h-8 px-3 border-b border-border-light flex items-center bg-raised-light/40">
                  <p className="text-[11px] font-semibold text-text-on-light">{pack.titulo}</p>
                </header>
                <div className="p-3 space-y-2.5">
                  <p className="text-[10px] text-muted-on-light leading-relaxed">{pack.descricao_curta}</p>
                  {pack.fields.map((f) => (
                    <div key={fieldId(f)}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-medium text-text-on-light">{f.display_name}</span>
                        {f.cadastrado && (
                          <span className="text-[10px] font-mono text-success flex items-center gap-0.5">
                            <Check className="h-3 w-3" strokeWidth={2} /> {t("aipChat.keys.set")}
                          </span>
                        )}
                      </div>
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder={f.cadastrado ? t("aipChat.keys.replace") : f.description || f.slug}
                        value={values[fieldId(f)] ?? ""}
                        onChange={(e) => setValues((s) => ({ ...s, [fieldId(f)]: e.target.value }))}
                        data-testid={`aip-keys-input-${f.slug}`}
                        className="w-full h-8 px-2 text-[12px] bg-white border border-border-light focus:border-primary outline-none font-mono"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {err && (
          <div className="border border-danger/30 bg-danger/5 px-3 py-2 text-[11px] font-mono text-danger">{err}</div>
        )}
        {saved > 0 && !err && (
          <div className="border border-success/30 bg-success/5 px-3 py-2 text-[11px] font-mono text-success">
            {t("aipChat.keys.saved")} ({saved})
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-light">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 px-3 bg-canvas-light border border-border-light hover:border-primary text-[11px] font-mono uppercase tracking-wider"
          >
            {t("common.close")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || packs === null || packs.length === 0}
            data-testid="aip-keys-save"
            className="h-8 px-3 bg-primary text-white border border-primary hover:bg-primary-hover text-[11px] font-mono uppercase tracking-wider flex items-center gap-1 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />}
            {t("aipChat.keys.save")}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
