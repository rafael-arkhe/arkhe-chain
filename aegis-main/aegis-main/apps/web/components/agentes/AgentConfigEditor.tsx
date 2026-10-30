"use client";

/**
 * AgentConfigEditor — modal/sheet para editar config seguro do agente
 * sem precisar de CLI. Acionado pelo botão "Editar fontes" em cards de
 * coleta no kanban /agentes.
 *
 * Mostra campos diferentes por slug:
 *   - worker-news       → feeds (textarea, um por linha) + keywords (csv) + hours + max_per_run
 *   - worker-*-x        → handle + count
 *   - worker-*-ig       → handle (ig) + count
 *
 * O endpoint backend (`PATCH /campaign/agents/{id}/config`) aceita
 * apenas chaves whitelistadas e emite LineageEvent.
 */

import * as React from "react";
import { Settings, Save, X, Loader2, Cpu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { Agentes, type AgentOut } from "@/lib/api/agentes";
import { aipModelLabel } from "@/lib/aip/modelLabels";
import { ModalPortal } from "@/components/ui/modal-backdrop";


interface Props {
  agent: AgentOut;
  onClose: () => void;
  onSaved: (next: AgentOut) => void;
}


type ConfigPatch = Record<string, unknown>;


function humanise(e: unknown): string {
  if (e instanceof ApiError) {
    return e.message || `Erro HTTP ${e.status}`;
  }
  return e instanceof Error ? e.message : String(e);
}


function isNewsAgent(slug: string): boolean {
  return slug === "worker-news" || slug.endsWith("-news");
}
function isLegislativoAgent(slug: string): boolean {
  return slug === "worker-legislativo" || slug.endsWith("-legislativo");
}
function isXAgent(slug: string): boolean {
  return slug.endsWith("-x");
}
function isIgAgent(slug: string): boolean {
  return slug.endsWith("-ig");
}


const LEGIS_KINDS = [
  { value: "proposicao", label: "Proposições novas (PL/PEC/MPV)" },
  { value: "votacao", label: "Votações da Câmara" },
  { value: "evento", label: "Audiências e sessões" },
  { value: "materia", label: "Matérias do Senado" },
];


export function AgentConfigEditor({ agent, onClose, onSaved }: Props) {
  const cfg = (agent.config ?? {}) as Record<string, unknown>;
  // W7 (GAP F) — modelo do agente SEMPRE por codinome AIP (nunca o slug cru
  // que o backend expõe em config.model). Interno/desconhecido → placeholder.
  const rawModel = typeof cfg.model === "string" ? cfg.model : null;
  const modelLabel = rawModel ? aipModelLabel(rawModel) || "—" : null;
  const [feeds, setFeeds] = React.useState<string>(
    Array.isArray(cfg.feeds) ? (cfg.feeds as string[]).join("\n") : "",
  );
  const [keywords, setKeywords] = React.useState<string>(
    Array.isArray(cfg.keywords) ? (cfg.keywords as string[]).join(", ") : "",
  );
  const [hours, setHours] = React.useState<number>(
    typeof cfg.hours === "number" ? cfg.hours : 24,
  );
  const [maxPerRun, setMaxPerRun] = React.useState<number>(
    typeof cfg.max_per_run === "number" ? cfg.max_per_run : 20,
  );
  const [handle, setHandle] = React.useState<string>(
    (typeof cfg.handle === "string" && cfg.handle) ||
      (typeof cfg.ig_handle === "string" && cfg.ig_handle) ||
      "",
  );
  const [count, setCount] = React.useState<number>(
    typeof cfg.count === "number" ? cfg.count : 20,
  );
  const [legSource, setLegSource] = React.useState<"camara" | "senado" | "both">(
    (typeof cfg.source === "string" ? (cfg.source as "camara" | "senado" | "both") : "both"),
  );
  const [legKinds, setLegKinds] = React.useState<string[]>(
    Array.isArray(cfg.kinds)
      ? (cfg.kinds as string[])
      : ["proposicao", "votacao", "evento", "materia"],
  );
  // Sprint L1.8 — system prompt editável universalmente.
  const initialSystemPrompt =
    typeof cfg.system_prompt === "string" ? cfg.system_prompt : "";
  const [systemPrompt, setSystemPrompt] = React.useState<string>(initialSystemPrompt);
  const [systemPromptDirty, setSystemPromptDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isNews = isNewsAgent(agent.slug);
  const isLegis = isLegislativoAgent(agent.slug);
  const isX = isXAgent(agent.slug);
  const isIg = isIgAgent(agent.slug);

  function toggleKind(k: string) {
    setLegKinds((arr) =>
      arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const patch: ConfigPatch = {};
      if (isNews) {
        const feedList = feeds
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const kwList = keywords
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        patch.feeds = feedList;
        patch.keywords = kwList;
        patch.hours = hours;
        patch.max_per_run = maxPerRun;
      } else if (isLegis) {
        const kwList = keywords
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        patch.source = legSource;
        patch.kinds = legKinds.length > 0 ? legKinds : undefined;
        patch.keywords = kwList;
        patch.hours = hours;
        patch.max_per_run = maxPerRun;
      } else if (isX) {
        patch.handle = handle.trim().replace(/^@/, "@");
        patch.count = count;
      } else if (isIg) {
        patch.ig_handle = handle.trim().replace(/^@/, "@");
        patch.count = count;
      }
      // Sprint L1.8 — Inclui system_prompt no patch SE foi editado.
      if (systemPromptDirty) {
        patch.system_prompt = systemPrompt.trim();
      }
      const next = await Agentes.patchConfig(agent.id, patch);
      onSaved(next);
      onClose();
    } catch (e) {
      setError(humanise(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 ds-overlay flex justify-end"
      onClick={onClose}
      data-testid="agent-config-editor"
    >
      <div
        className="w-full max-w-[480px] h-full bg-canvas-light border-l border-border-light overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-light p-4 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-on-light flex items-center gap-2">
              <Settings className="h-4 w-4" strokeWidth={1.5} />
              Editar fontes do agente
            </h2>
            <p className="text-[10px] text-muted-on-light mt-0.5 font-mono">
              {agent.slug}
            </p>
            {modelLabel && (
              <p
                className="text-[10px] text-muted-on-light mt-0.5 font-mono flex items-center gap-1"
                data-testid="agent-config-model"
              >
                <Cpu className="h-3 w-3" strokeWidth={1.5} />
                {modelLabel}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30">
              {error}
            </div>
          )}

          {isNews && (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  Feeds RSS / Atom (um por linha)
                </Label>
                <textarea
                  value={feeds}
                  onChange={(e) => setFeeds(e.target.value)}
                  rows={6}
                  placeholder={
                    "https://g1.globo.com/rss/g1/politica/\n" +
                    "https://feeds.folha.uol.com.br/poder/rss091.xml\n" +
                    "https://www.estadao.com.br/arc/outboundfeeds/rss/?outputType=xml&size=25"
                  }
                  className="w-full min-h-[140px] font-mono text-[11px] bg-white border border-border-light px-2 py-1.5 rounded-none focus:border-primary outline-none"
                  data-testid="agent-feeds-input"
                />
                <p className="text-[10px] text-muted-on-light mt-1 leading-relaxed">
                  Uma URL de RSS por linha. Vazio = usa o catálogo
                  padrão (18 fontes BR validadas: G1, Folha, Estadão,
                  UOL, Poder360, JOTA, Metrópoles, CNN, Veja, etc.).
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  Palavras-chave (separadas por vírgula)
                </Label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="ocorrência, operação, BPM"
                  className="bg-white"
                  data-testid="agent-keywords-input"
                />
                <p className="text-[10px] text-muted-on-light mt-1">
                  O coletor só ingere artigos que contêm pelo menos
                  uma destas palavras no título ou no resumo.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Janela (horas)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Máx por execução
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={maxPerRun}
                    onChange={(e) => setMaxPerRun(Number(e.target.value))}
                    className="bg-white"
                  />
                </div>
              </div>
            </>
          )}

          {isLegis && (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  Fonte
                </Label>
                <select
                  value={legSource}
                  onChange={(e) =>
                    setLegSource(e.target.value as "camara" | "senado" | "both")
                  }
                  className="w-full bg-white border border-border-light px-2 py-1.5 text-[12px]"
                >
                  <option value="both">Câmara + Senado</option>
                  <option value="camara">Apenas Câmara</option>
                  <option value="senado">Apenas Senado</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  O que coletar
                </Label>
                <div className="space-y-1">
                  {LEGIS_KINDS.map((k) => (
                    <label
                      key={k.value}
                      className="flex items-center gap-2 text-[12px] text-text-on-light"
                    >
                      <input
                        type="checkbox"
                        checked={legKinds.includes(k.value)}
                        onChange={() => toggleKind(k.value)}
                      />
                      {k.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  Palavras-chave (vazio = ingere tudo da janela)
                </Label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="LGPD, segurança, defesa civil"
                  className="bg-white"
                />
                <p className="text-[10px] text-muted-on-light mt-1">
                  Filtra ementa + descrição. Deixe vazio para acompanhar
                  todas as votações e PLs novos do dia.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Janela (horas)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Máx por execução
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={maxPerRun}
                    onChange={(e) => setMaxPerRun(Number(e.target.value))}
                    className="bg-white"
                  />
                </div>
              </div>
            </>
          )}

          {(isX || isIg) && (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  {isX ? "Handle no X" : "Handle no Instagram"}
                </Label>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@conta-alvo"
                  className="bg-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  Quantidade por execução
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="bg-white"
                />
              </div>
            </>
          )}

          {!isNews && !isLegis && !isX && !isIg && (
            <p className="text-[12px] text-muted-on-light">
              Esse tipo de agente ainda não tem campos específicos editáveis pela
              UI. Configure pelo wizard de primeiro setup ou peça
              ajuda ao time de produto.
            </p>
          )}

          {/* Sprint L1.8 — System Prompt sempre disponível (governance audit). */}
          <div className="space-y-1 pt-4 border-t border-border-light">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="agent-system-prompt"
                className="text-[10px] uppercase tracking-wider text-muted-on-light"
              >
                Prompt do sistema
              </Label>
              <span
                className="text-[10px] font-mono text-muted-on-light"
                aria-live="polite"
              >
                {systemPrompt.length} / 8192
              </span>
            </div>
            <textarea
              id="agent-system-prompt"
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value.slice(0, 8192));
                setSystemPromptDirty(true);
              }}
              rows={6}
              placeholder={
                "Você é um agente operacional do AEGIS. Sua missão é…\n" +
                "Mantenha tom factual e estruture saídas em JSON quando possível."
              }
              className="w-full min-h-[140px] font-mono text-[11px] bg-white border border-border-light px-2 py-1.5 rounded-none focus:border-primary outline-none"
              data-testid="agent-system-prompt-input"
            />
            <p className="text-[10px] text-muted-on-light leading-relaxed">
              Reescreve o prompt-base do agente. Toda alteração é
              auditada em Lineage (event_type=
              <span className="font-mono">campaign.agents.config_patch</span>).
              Deixe vazio para usar o prompt-padrão do tipo de agente.
            </p>
          </div>
        </div>

        <div className="border-t border-border-light p-4 flex justify-end gap-2 sticky bottom-0 bg-canvas-light">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-primary hover:bg-primary-hover text-white"
            data-testid="agent-config-save"
          >
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Salvando…
              </>
            ) : (
              <>
                <Save className="h-3 w-3 mr-1" /> Salvar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
