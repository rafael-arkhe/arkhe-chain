"use client";

/**
 * /agentes/catalog — catálogo de templates de agentes.
 *
 * Cada card mostra um template com pré-requisitos. Se atendidos,
 * botão "Instalar" abre modal pedindo os parâmetros e instancia
 * agente novo via `/campaign/agents/catalog/install`.
 *
 * Perm `security.agentes.view` para listar; `security.agentes.edit`
 * para instalar.
 */

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Hash,
  KeyRound,
  Loader2,
  Newspaper,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageShell } from "@/components/shell/page-shell";
import { RequirePerm } from "@/components/auth/require-perm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  ConfirmProvider,
  useConfirm,
} from "@/components/dialog/confirm-dialog";
import { ApiError } from "@/lib/api/client";
import {
  Agentes,
  type AgentTemplateOut,
  type AgentTemplateParam,
} from "@/lib/api/agentes";
import { useCan } from "@/lib/auth/useAuth";
import { useT } from "@/lib/i18n/provider";
import { ModalPortal } from "@/components/ui/modal-backdrop";
import { KeysModal } from "@/components/agentes/KeysModal";

type TemplateParam = AgentTemplateParam;

const ICONS: Record<string, LucideIcon> = {
  Newspaper,
  Building2,
  Hash,
  Camera,
};


function humanise(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return "Sem permissão para esta operação.";
    return e.message || `Erro HTTP ${e.status}`;
  }
  return e instanceof Error ? e.message : "Erro desconhecido.";
}


export default function AgentCatalogPage() {
  // ConfirmProvider local — o dialog sharp de remoção precisa do provider
  // (não é global no shell). Pattern igual ao /painel-de-controle/loja.
  return (
    <ConfirmProvider>
      <AgentCatalogInner />
    </ConfirmProvider>
  );
}


function AgentCatalogInner() {
  const t = useT();
  const confirm = useConfirm();
  const [templates, setTemplates] = React.useState<AgentTemplateOut[] | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [installing, setInstalling] = React.useState<AgentTemplateOut | null>(
    null,
  );
  const [removingSlug, setRemovingSlug] = React.useState<string | null>(null);
  const [keysOpen, setKeysOpen] = React.useState(false);
  const canInstall = useCan("security.agentes.edit");
  // Configurar chaves de conector grava no Vault do tenant — dono = quem
  // gerencia conectores. Sem a permissão, o botão nem aparece.
  const canManageKeys = useCan("connectors.manage");

  const reload = React.useCallback(async () => {
    setError(null);
    try {
      const data = await Agentes.catalog();
      setTemplates(data);
    } catch (e) {
      setError(humanise(e));
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const handleRemove = React.useCallback(
    async (template: AgentTemplateOut) => {
      const ids = template.installed_agent_ids ?? [];
      if (ids.length === 0) return;
      const ok = await confirm({
        title: t("agentes.remove.confirmTitle"),
        description: t("agentes.remove.confirmDescription"),
        tone: "danger",
        confirmLabel: t("agentes.remove.action"),
      });
      if (!ok) return;
      setRemovingSlug(template.slug);
      try {
        // Remove todas as instâncias casadas com o template.
        for (const id of ids) {
          await Agentes.uninstall(id);
        }
        toast.success(t("agentes.remove.success"));
        await reload();
      } catch (e) {
        toast.error(`${t("agentes.remove.error")} ${humanise(e)}`);
      } finally {
        setRemovingSlug(null);
      }
    },
    [confirm, reload, t],
  );

  return (
    <RequirePerm perm="security.agentes.view">
      <PageShell
        title="Catálogo de agentes"
        subtitle="Receitas prontas — instale agentes 24/7 sem precisar de CLI."
        theme="light"
        toolbar={
          <Link
            href="/agentes"
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3 h-3" strokeWidth={1.5} />
            Voltar
          </Link>
        }
      >
        <div className="h-full overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30">
              {error}
            </div>
          )}

          <p className="text-[12px] text-muted-on-light leading-relaxed max-w-2xl">
            Cada card abaixo é uma receita pronta. Os requisitos da tenant
            precisam estar configurados antes de instalar — quando algo
            faltar, o card mostra o que e onde resolver.
          </p>

          {templates === null ? (
            <div className="text-[12px] text-muted-on-light inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              Carregando catálogo…
            </div>
          ) : templates.length === 0 ? (
            <div className="bg-canvas-light border border-border-light p-6 text-center text-[11px] text-muted-on-light">
              Nenhum template disponível.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((tpl) => (
                <TemplateCard
                  key={tpl.slug}
                  template={tpl}
                  canInstall={canInstall}
                  removing={removingSlug === tpl.slug}
                  onInstall={() => setInstalling(tpl)}
                  onRemove={() => handleRemove(tpl)}
                  onConfigureKeys={
                    tpl.slug === "aip-chat" && canManageKeys
                      ? () => setKeysOpen(true)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>

        {installing && (
          <InstallModal
            template={installing}
            onClose={() => setInstalling(null)}
            onInstalled={async () => {
              setInstalling(null);
              toast.success(t("agentes.install.success"));
              await reload();
            }}
            onError={(e) =>
              toast.error(`${t("agentes.install.error")} ${humanise(e)}`)
            }
          />
        )}

        {keysOpen && <KeysModal onClose={() => setKeysOpen(false)} />}
      </PageShell>
    </RequirePerm>
  );
}


function TemplateCard({
  template,
  canInstall,
  removing,
  onInstall,
  onRemove,
  onConfigureKeys,
}: {
  template: AgentTemplateOut;
  canInstall: boolean;
  removing: boolean;
  onInstall: () => void;
  onRemove: () => void;
  onConfigureKeys?: () => void;
}) {
  const t = useT();
  const iconKey = (template as { icon?: string }).icon ?? "";
  const Icon = ICONS[iconKey] ?? Hash;
  const installed = Boolean(template.already_installed);
  const ready = template.can_install && canInstall;
  return (
    <div
      data-testid={`agente-template-${template.slug}`}
      className={
        ready
          ? "border border-border-light bg-canvas-light p-4 space-y-3"
          : "border border-border-light bg-raised-light/40 p-4 space-y-3"
      }
    >
      <div className="flex items-start gap-3">
        <Icon
          className="h-5 w-5 text-muted-on-light mt-0.5 shrink-0"
          strokeWidth={1.5}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold text-text-on-light">
            {template.title}
          </h2>
          {template.description && (
            <p className="text-[11px] text-muted-on-light mt-1 leading-relaxed">
              {template.description}
            </p>
          )}
        </div>
      </div>

      {(template.prereqs ?? []).length > 0 && (
        <div className="border-t border-border-light pt-2 space-y-1">
          {(template.prereqs ?? []).map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 text-[12px]"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {p.ok ? (
                  <CheckCircle2
                    className="h-3.5 w-3.5 text-success shrink-0"
                    strokeWidth={1.5}
                  />
                ) : (
                  <XCircle
                    className="h-3.5 w-3.5 text-danger shrink-0"
                    strokeWidth={1.5}
                  />
                )}
                <span
                  className={
                    p.ok ? "text-muted-on-light" : "text-danger font-medium"
                  }
                >
                  {/* Backend envia `message`; `label` é compat legado.
                      Sem o fallback, o ícone do prereq fica sozinho e
                      desalinhado (texto vazio). */}
                  {p.label ?? p.message ?? ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        {/* AIP Chat: modal p/ configurar as chaves de API dos conectores MCP
            (Tavily, urlscan, Reddit, DataJud, …) que o chat usa como ferramentas. */}
        {template.slug === "aip-chat" && onConfigureKeys && (
          <button
            type="button"
            onClick={onConfigureKeys}
            data-testid="agente-configure-keys"
            className="h-8 px-3 bg-canvas-light border border-border-light hover:border-primary text-[11px] font-mono uppercase tracking-wider flex items-center gap-1"
          >
            <KeyRound className="h-3 w-3" strokeWidth={1.5} />
            {t("connectors.keys.action")}
          </button>
        )}
        {installed ? (
          <>
            {/* Estado instalado: pill "Instalado" com check alinhado +
                botão Remover. Substitui o check solto e desalinhado. */}
            <span
              data-testid={`agente-installed-${template.slug}`}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 border border-success/40 bg-success/10 text-success text-[11px] font-mono uppercase tracking-wider"
            >
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {t("agentes.installed.badge")}
            </span>
            {canInstall && (
              <button
                type="button"
                onClick={onRemove}
                disabled={removing}
                data-testid={`agente-remove-${template.slug}`}
                className="h-8 px-3 bg-canvas-light border border-border-light text-danger hover:border-danger disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-mono uppercase tracking-wider flex items-center gap-1"
              >
                {removing ? (
                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                )}
                {t("agentes.remove.action")}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            disabled={!ready}
            data-testid={`agente-install-${template.slug}`}
            className="ml-auto h-8 px-3 bg-primary text-white border border-primary hover:bg-primary-hover disabled:bg-raised-light disabled:text-muted-on-light disabled:border-border-light disabled:cursor-not-allowed text-[11px] font-mono uppercase tracking-wider flex items-center gap-1"
          >
            <Plus className="h-3 w-3" strokeWidth={1.5} />
            instalar
          </button>
        )}
      </div>
    </div>
  );
}


function InstallModal({
  template,
  onClose,
  onInstalled,
  onError,
}: {
  template: AgentTemplateOut;
  onClose: () => void;
  onInstalled: () => void | Promise<void>;
  onError: (e: unknown) => void;
}) {
  const t = useT();
  const params = template.params as TemplateParam[];

  const [values, setValues] = React.useState<Record<string, string | number>>(
    () => {
      const init: Record<string, string | number> = {};
      for (const p of params) {
        if (p.default !== null && p.default !== undefined) {
          init[p.key] = p.default as string | number;
        } else {
          init[p.key] = "";
        }
      }
      return init;
    },
  );
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const submit = async () => {
    // Validação client-side: nenhum corpo malformado chega ao backend.
    // `required` default é true (igual ao contrato Pydantic).
    const missing = params.filter(
      (p) => p.required !== false && String(values[p.key] ?? "").trim() === "",
    );
    if (missing.length > 0) {
      const labels = missing.map((p) => p.label).join(", ");
      setErr(`${t("agentes.install.requiredMissing")} ${labels}`);
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      await Agentes.install(template.slug, values);
      await onInstalled();
    } catch (e) {
      setErr(humanise(e));
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 ds-overlay z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="agente-install-modal"
    >
      <div
        className="bg-canvas-light border border-border-light max-w-lg w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 className="text-[14px] font-semibold text-text-on-light">
            Instalar — {template.title}
          </h2>
          {template.description && (
            <p className="text-[12px] text-muted-on-light mt-1 leading-relaxed">
              {template.description}
            </p>
          )}
        </header>

        {params.length === 0 ? (
          <p className="text-[12px] text-text-on-light italic">
            Este template não pede nenhum parâmetro. Clique em instalar para
            criar o agente.
          </p>
        ) : (
          <div className="space-y-3">
            {params.map((p) => (
              <ParamField
                key={p.key}
                param={p}
                value={values[p.key]}
                onChange={(v) =>
                  setValues((s) => ({ ...s, [p.key]: v }))
                }
              />
            ))}
          </div>
        )}

        {err && (
          <div className="border border-danger/30 bg-danger/5 px-3 py-2 text-[11px] font-mono text-danger">
            {err}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-light">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 px-3 bg-canvas-light border border-border-light hover:border-primary text-[11px] font-mono uppercase tracking-wider"
          >
            cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            data-testid="agente-install-confirm"
            className="h-8 px-3 bg-primary text-white border border-primary hover:bg-primary-hover text-[11px] font-mono uppercase tracking-wider flex items-center gap-1 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />}
            instalar
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}


function ParamField({
  param,
  value,
  onChange,
}: {
  param: TemplateParam;
  value: string | number;
  onChange: (v: string | number) => void;
}) {
  const v = String(value ?? "");
  return (
    <div className="space-y-1">
      <Label className="text-[12px] text-text-on-light">
        {param.label}
        {param.required && <span className="text-danger ml-0.5">*</span>}
      </Label>
      {param.type === "textarea" ? (
        <textarea
          value={v}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full text-[12px] font-mono bg-white border border-border-light px-2 py-1.5 rounded-none focus:border-primary outline-none"
        />
      ) : param.type === "select" ? (
        <select
          value={v}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full h-8 px-2 text-[12px] border border-border-light bg-white rounded-none"
        >
          {(param.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : param.type === "number" ? (
        <Input
          type="number"
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 text-[12px] bg-white"
        />
      ) : (
        <Input
          type="text"
          value={v}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-[12px] bg-white"
        />
      )}
      {param.help && (
        <p className="text-[10px] text-muted-on-light italic">{param.help}</p>
      )}
    </div>
  );
}
