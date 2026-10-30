"use client";

/**
 * OsdkTokensPanel — gestão GENÉRICA de tokens OSDK (aplicações de integração).
 * Primitiva horizontal, domínio-neutro: lista + cria (com scope picker) + revoga.
 * Reusável em qualquer superfície (Conectores, IAM). NÃO conhece SafeTag/AutoSync.
 * Régua: cantos retos, #2D77BE único acento, JetBrains Mono p/ dados, useT().
 */
import * as React from "react";
import { KeyRound, Ban, Loader2, AlertCircle, RefreshCw } from "lucide-react";

import { OsdkCreateDialog } from "@/components/iam/OsdkCreateDialog";
import { osdkApi, type OsdkTokenOut } from "@/lib/iam/api";
import { useT } from "@/lib/i18n/provider";

function fmt(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16).replace("T", " ") : "—";
}

export function OsdkTokensPanel() {
  const t = useT();
  const [tokens, setTokens] = React.useState<OsdkTokenOut[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setErr(null);
    osdkApi
      .list()
      .then(setTokens)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function revoke(id: string) {
    setBusy(id);
    try { await osdkApi.revoke(id); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  return (
    <section className="mt-6" data-testid="osdk-tokens-panel">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <KeyRound className="w-4 h-4 text-muted-on-light shrink-0" strokeWidth={1.5} />
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-text-on-light">{t("osdk.title")}</h2>
            <p className="text-[11px] text-muted-on-light">{t("osdk.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={load}
            aria-label={t("common.refresh")}
            title={t("common.refresh")}
            data-testid="osdk-refresh"
            className="h-8 w-8 border border-border-light hover:border-primary flex items-center justify-center"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <OsdkCreateDialog onCreated={load} />
        </div>
      </div>

      {err && (
        <div className="flex items-start gap-2 text-danger text-[12px] mb-2" role="alert" data-testid="osdk-error">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
          <span className="min-w-0 break-words">{err}</span>
        </div>
      )}

      <div className="border border-border-light" data-testid="osdk-list">
        {tokens === null && !err && (
          <p className="px-3 py-2 text-[11px] text-muted-on-light flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> {t("common.loading")}
          </p>
        )}
        {Array.isArray(tokens) && tokens.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-muted-on-light italic">{t("osdk.empty")}</p>
        )}
        {Array.isArray(tokens) && tokens.map((tk) => (
          <div
            key={tk.id}
            data-testid={`osdk-row-${tk.id}`}
            className="flex items-center gap-2 px-3 py-2 text-[12px] border-b border-border-light last:border-b-0"
          >
            <span className="font-mono truncate text-text-on-light">{tk.name}</span>
            {tk.revoked && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-danger text-danger shrink-0">
                {t("osdk.revoked")}
              </span>
            )}
            <span className="ml-auto text-[10px] font-mono text-muted-on-light shrink-0">
              {tk.scopes.length} scopes · {fmt(tk.created_at)}
            </span>
            {!tk.revoked && (
              <button
                type="button"
                onClick={() => void revoke(tk.id)}
                disabled={busy === tk.id}
                data-testid={`osdk-revoke-${tk.id}`}
                className="h-7 px-2 text-[11px] border border-border-light hover:border-danger hover:text-danger flex items-center gap-1 shrink-0"
              >
                {busy === tk.id
                  ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                  : <Ban className="w-3 h-3" strokeWidth={1.5} />}
                {t("osdk.revoke")}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
