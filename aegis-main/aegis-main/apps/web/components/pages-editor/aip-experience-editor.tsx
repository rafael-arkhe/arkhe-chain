'use client';

/**
 * W1 (2026-06-28) — configurador da experiência "Conversas" (AIP Chat).
 *
 * A página `aip-threads` (Conversas) é uma rota `app_route`: o chat 3-pane É a
 * experiência e permanece servido por código. O que se parametriza aqui é COMO o
 * copiloto AIP se comporta por padrão para TODA a unidade — tom, instruções
 * adicionais, temperatura, saudação, sugestões de partida e os defaults de
 * ferramentas/capacidades de novas conversas.
 *
 * DIFERENÇA CRÍTICA vs. solutions/agents: o comportamento do AIP é AUTORITATIVO
 * no SERVIDOR (`build_system_prompt` lê o `Agent.config` do agente kind='aip'
 * slug 'aip-chat%' a CADA turno). Por isso a config NÃO vai em `Page.config.params`
 * (não usamos `Pages.putConfig`) — persiste via endpoint dedicado
 * (`AipExperience.save` → Agent.config). O `page` recebido é ignorado para
 * persistência; a fonte da verdade é o servidor.
 *
 * Segurança de persona (anti prompt-injection): a BASE da persona e os presets de
 * tom são FIXOS no código do backend. Aqui o operador define apenas:
 *   - o TOM DEFAULT da tenant (uma key do catálogo de presets), e
 *   - um OVERLAY de instruções adicionais que COMPLEMENTA a base, nunca a substitui.
 * Precedência de tom: operador (preferências) > tenant (esta config) > base.
 *
 * Modelo: a escolha é CENTRALIZADA em Dados → Modelos
 * (`/painel-de-controle/dados?aba=modelos`); aqui só exibimos o codinome AIP do
 * modelo efetivo da finalidade "Conversas" + link pra lá (NUNCA seletor de vendor
 * nem id cru — codinome via `aipModelLabel`).
 *
 * Gate de escrita: `aip.threads.configure` (sem perm → painel read-only, sem form).
 */
import * as React from 'react';
import Link from 'next/link';
import {
  Loader2,
  Check,
  SlidersHorizontal,
  ExternalLink,
  Cpu,
  Plus,
  Trash2,
  Lock,
  Search as SearchIcon,
} from 'lucide-react';

import {
  AipExperience,
  type AipExperienceConfig,
  type AipToolSpec,
} from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { useCan } from '@/lib/auth/useAuth';
import { aipModelLabel } from '@/lib/aip/modelLabels';
import { registerExperienceConfig } from '@/lib/pages/experience-registry';
import type { ExperienceConfigProps } from '@/lib/pages/experience-registry';
import { PageChromeToggles } from './page-chrome-toggles';

/** ``experience_kind`` da Página "Conversas" (contrato do backend / seed). */
export const AIP_CHAT_EXPERIENCE_KIND = 'aip_chat';

/** Perm de escrita (gate do editor). Leitura é `aip.threads.read`. */
export const AIP_CHAT_CONFIGURE_PERM = 'aip.threads.configure';

/**
 * Capacidades, na ORDEM e com as KEYS do `Composer` (BADGES) e do
 * `store.DEFAULT_CAPS` — espelho fiel dos atalhos do campo de mensagem.
 */
const CAPABILITIES = [
  'web_search',
  'rag_search',
  'code_interpreter',
  'artifacts',
  'memory',
  'mcp',
] as const;
type CapKey = (typeof CAPABILITIES)[number];

/**
 * Ligadas por padrão (espelha `store.DEFAULT_CAPS`). Usado para inicializar os
 * toggles quando a tenant ainda NÃO configurou capacidades (lista vazia).
 */
const DEFAULT_ON: Record<CapKey, boolean> = {
  web_search: true,
  rag_search: true,
  code_interpreter: false,
  artifacts: true,
  memory: true,
  mcp: true,
};

// Limites de tamanho (espelham o backend; o servidor revalida — fail-closed).
const OVERLAY_MAX = 4096;
const GREETING_MAX = 1024;
const LIST_MAX = 24;
const ITEM_MAX = 160;

export function AipExperienceEditor({ page, onSaved }: ExperienceConfigProps) {
  const t = useT();
  const canConfigure = useCan(AIP_CHAT_CONFIGURE_PERM);

  const [cfg, setCfg] = React.useState<AipExperienceConfig | null>(null);
  const [tools, setTools] = React.useState<AipToolSpec[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);

  // Estado editável.
  const [tone, setTone] = React.useState('');
  const [overlay, setOverlay] = React.useState('');
  const [temperature, setTemperature] = React.useState(0.2);
  const [greeting, setGreeting] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [allowedTools, setAllowedTools] = React.useState<string[]>([]);
  const [caps, setCaps] = React.useState<Record<CapKey, boolean>>(DEFAULT_ON);
  const [toolQuery, setToolQuery] = React.useState('');

  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const applyConfig = React.useCallback((c: AipExperienceConfig) => {
    setCfg(c);
    setTone(c.tone_default || '');
    setOverlay(c.persona_overlay || '');
    setTemperature(
      typeof c.temperature === 'number' && c.temperature >= 0 ? c.temperature : 0.2,
    );
    setGreeting(c.greeting || '');
    setSuggestions(Array.isArray(c.suggestions) ? c.suggestions : []);
    setAllowedTools(
      Array.isArray(c.allowed_tools_default) ? c.allowed_tools_default : [],
    );
    const list = Array.isArray(c.capabilities_default) ? c.capabilities_default : [];
    // Lista não-vazia = configurado → reflete; vazia = não configurado → DEFAULT_ON.
    setCaps(
      list.length
        ? (Object.fromEntries(
            CAPABILITIES.map((k) => [k, list.includes(k)]),
          ) as Record<CapKey, boolean>)
        : { ...DEFAULT_ON },
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const c = await AipExperience.get();
        if (!cancelled) applyConfig(c);
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : t('aip.experience.loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Catálogo de tools (best-effort; só alimenta o multiselect — sem digitar).
    void (async () => {
      try {
        const r = await AipExperience.toolsAvailable();
        if (!cancelled) setTools(r.tools || []);
      } catch {
        /* sem catálogo → multiselect vazio; o operador deixa "todas liberadas". */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyConfig, t]);

  const touch = React.useCallback(() => setSaved(false), []);

  // Hooks SEMPRE acima de qualquer early-return (Rules of Hooks): o filtro do
  // multiselect de ferramentas roda independentemente do gate de permissão.
  const filteredTools = React.useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (tl) =>
        tl.name.toLowerCase().includes(q) ||
        (tl.description || '').toLowerCase().includes(q),
    );
  }, [tools, toolQuery]);

  const updateSuggestion = (i: number, v: string) => {
    setSuggestions((arr) => arr.map((s, idx) => (idx === i ? v.slice(0, ITEM_MAX) : s)));
    touch();
  };
  const removeSuggestion = (i: number) => {
    setSuggestions((arr) => arr.filter((_, idx) => idx !== i));
    touch();
  };
  const addSuggestion = () => {
    setSuggestions((arr) => (arr.length >= LIST_MAX ? arr : [...arr, '']));
    touch();
  };

  const toggleTool = (name: string) => {
    setAllowedTools((arr) =>
      arr.includes(name)
        ? arr.filter((x) => x !== name)
        : arr.length >= LIST_MAX
          ? arr
          : [...arr, name],
    );
    touch();
  };

  const toggleCap = (k: CapKey) => {
    setCaps((c) => ({ ...c, [k]: !c[k] }));
    touch();
  };

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const patch = {
        tone_default: tone,
        persona_overlay: overlay.slice(0, OVERLAY_MAX),
        temperature,
        greeting: greeting.slice(0, GREETING_MAX),
        suggestions: suggestions.map((s) => s.trim()).filter(Boolean),
        allowed_tools_default: allowedTools,
        capabilities_default: CAPABILITIES.filter((k) => caps[k]),
      };
      const updated = await AipExperience.save(patch);
      applyConfig(updated);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('aip.experience.save.error'));
    } finally {
      setSaving(false);
    }
  }

  // ── Gate de escrita: sem `aip.threads.configure` → painel read-only, sem form.
  if (!canConfigure) {
    return (
      <div
        className="max-w-2xl w-full bg-white border border-border-light"
        data-testid="aip-experience-locked"
      >
        <div className="h-10 px-3 border-b border-border-light flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
          <span className="text-[12px] font-semibold text-text-on-light">
            {t('aip.experience.header.title')}
          </span>
        </div>
        <div className="p-4 text-[12px] text-muted-on-light leading-relaxed">
          {t('aip.experience.locked')}
        </div>
      </div>
    );
  }

  // GAP G — NUNCA expor o slug cru. aipModelLabel já cobre desconhecidos via
  // FALLBACK_CODENAMES; só retorna vazio p/ serviço interno → placeholder neutro.
  const modelLabel = cfg?.default_model
    ? aipModelLabel(cfg.default_model) || '—'
    : '—';

  return (
    <div
      className="max-w-2xl w-full bg-white border border-border-light"
      data-testid="aip-experience-editor"
    >
      <div className="h-10 px-3 border-b border-border-light flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
        <span className="text-[12px] font-semibold text-text-on-light">
          {t('aip.experience.header.title')}
        </span>
        <span className="ml-auto text-[10px] text-muted-on-light">
          {t('aip.experience.header.serverAuthoritative')}
        </span>
      </div>

      {loading ? (
        <div
          className="p-6 flex items-center gap-2 text-[12px] text-muted-on-light"
          data-testid="aip-experience-loading"
        >
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          {t('aip.experience.loading')}
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* O que é — contexto pra qualquer um entender sem manual. */}
          <div className="border border-border-light bg-canvas-light p-3">
            <p className="text-[12px] text-text-on-light leading-relaxed">
              <span className="font-semibold">{t('aip.experience.about.title')}</span>{' '}
              {t('aip.experience.about.body')}
            </p>
          </div>

          {loadErr && (
            <p className="text-[11px] text-warning" data-testid="aip-experience-load-error">
              {loadErr}
            </p>
          )}

          {/* Tom default da tenant. */}
          <section className="space-y-1.5">
            <label
              htmlFor="aip-experience-tone"
              className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold"
            >
              {t('aip.experience.tone.label')}
            </label>
            <p className="text-[12px] text-muted-on-light leading-relaxed">
              {t('aip.experience.tone.help')}
            </p>
            <select
              id="aip-experience-tone"
              value={tone}
              onChange={(e) => {
                setTone(e.target.value);
                touch();
              }}
              data-testid="aip-experience-tone"
              className="w-full max-w-md h-8 px-2 text-[12px] bg-canvas-light border border-border-light text-text-on-light outline-none focus:border-primary"
            >
              <option value="">{t('aip.experience.tone.house')}</option>
              {(cfg?.tone_presets ?? []).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </section>

          {/* Overlay de instruções adicionais (complementa, não substitui). */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="aip-experience-overlay"
                className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold"
              >
                {t('aip.experience.overlay.label')}
              </label>
              <span className="text-[10px] font-mono text-muted-on-light" aria-live="polite">
                {overlay.length} / {OVERLAY_MAX}
              </span>
            </div>
            <p className="text-[12px] text-muted-on-light leading-relaxed">
              {t('aip.experience.overlay.help')}
            </p>
            <textarea
              id="aip-experience-overlay"
              value={overlay}
              onChange={(e) => {
                setOverlay(e.target.value.slice(0, OVERLAY_MAX));
                touch();
              }}
              rows={5}
              placeholder={t('aip.experience.overlay.placeholder')}
              data-testid="aip-experience-overlay"
              className="w-full min-h-[100px] font-mono text-[11px] bg-canvas-light border border-border-light px-2 py-1.5 outline-none focus:border-primary text-text-on-light"
            />
          </section>

          {/* Temperatura. */}
          <section className="space-y-1.5">
            <label
              htmlFor="aip-experience-temperature"
              className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold"
            >
              {t('aip.experience.temperature.label')}
            </label>
            <p className="text-[12px] text-muted-on-light leading-relaxed">
              {t('aip.experience.temperature.help')}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(e) => {
                  setTemperature(Number(e.target.value));
                  touch();
                }}
                aria-label={t('aip.experience.temperature.label')}
                className="flex-1 max-w-xs accent-primary"
                data-testid="aip-experience-temperature-range"
              />
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTemperature(Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.2);
                  touch();
                }}
                data-testid="aip-experience-temperature"
                className="w-20 h-8 px-2 text-[12px] font-mono bg-canvas-light border border-border-light text-text-on-light outline-none focus:border-primary"
              />
            </div>
          </section>

          {/* Saudação inicial. */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="aip-experience-greeting"
                className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold"
              >
                {t('aip.experience.greeting.label')}
              </label>
              <span className="text-[10px] font-mono text-muted-on-light" aria-live="polite">
                {greeting.length} / {GREETING_MAX}
              </span>
            </div>
            <p className="text-[12px] text-muted-on-light leading-relaxed">
              {t('aip.experience.greeting.help')}
            </p>
            <input
              id="aip-experience-greeting"
              type="text"
              value={greeting}
              onChange={(e) => {
                setGreeting(e.target.value.slice(0, GREETING_MAX));
                touch();
              }}
              placeholder={t('aip.experience.greeting.placeholder')}
              data-testid="aip-experience-greeting"
              className="w-full h-8 px-2 text-[12px] bg-canvas-light border border-border-light text-text-on-light outline-none focus:border-primary"
            />
          </section>

          {/* Sugestões de partida (lista editável). */}
          <section className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold">
              {t('aip.experience.suggestions.label')}
            </label>
            <p className="text-[12px] text-muted-on-light leading-relaxed">
              {t('aip.experience.suggestions.help')}
            </p>
            <div className="space-y-1.5" data-testid="aip-experience-suggestions">
              {suggestions.length === 0 && (
                <p className="text-[11px] text-muted-on-light italic">
                  {t('aip.experience.suggestions.empty')}
                </p>
              )}
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={s}
                    onChange={(e) => updateSuggestion(i, e.target.value)}
                    placeholder={t('aip.experience.suggestions.placeholder')}
                    data-testid={`aip-experience-suggestion-${i}`}
                    className="flex-1 h-8 px-2 text-[12px] bg-canvas-light border border-border-light text-text-on-light outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => removeSuggestion(i)}
                    aria-label={t('common.remove')}
                    data-testid={`aip-experience-suggestion-remove-${i}`}
                    className="w-8 h-8 shrink-0 flex items-center justify-center border border-border-light text-muted-on-light hover:text-danger hover:border-danger/40"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              {suggestions.length < LIST_MAX && (
                <button
                  type="button"
                  onClick={addSuggestion}
                  data-testid="aip-experience-suggestion-add"
                  className="inline-flex items-center gap-1.5 h-7 px-2 text-[11px] bg-white text-text-on-light border border-border-light hover:border-primary"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {t('aip.experience.suggestions.add')}
                </button>
              )}
            </div>
          </section>

          {/* Ferramentas liberadas por padrão (multiselect — sem digitar). */}
          <section className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold">
              {t('aip.experience.tools.label')}
            </label>
            <p className="text-[12px] text-muted-on-light leading-relaxed">
              {t('aip.experience.tools.help')}
            </p>
            {allowedTools.length === 0 && (
              <p className="text-[11px] text-muted-on-light italic">
                {t('aip.experience.tools.all')}
              </p>
            )}
            {tools.length === 0 ? (
              <p className="text-[11px] text-muted-on-light">
                {t('aip.experience.tools.none')}
              </p>
            ) : (
              <div className="border border-border-light bg-canvas-light">
                <div className="relative border-b border-border-light">
                  <SearchIcon
                    className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light"
                    strokeWidth={1.5}
                  />
                  <input
                    type="text"
                    value={toolQuery}
                    onChange={(e) => setToolQuery(e.target.value)}
                    placeholder={t('aip.experience.tools.search')}
                    data-testid="aip-experience-tools-search"
                    className="w-full h-7 pl-7 pr-2 text-[11px] bg-white border-0 text-text-on-light placeholder:text-muted-on-light outline-none"
                  />
                </div>
                <div
                  className="max-h-48 overflow-y-auto"
                  data-testid="aip-experience-tools"
                >
                  {filteredTools.map((tl) => {
                    const on = allowedTools.includes(tl.name);
                    return (
                      <label
                        key={tl.name}
                        className="flex items-start gap-2 px-2 py-1.5 border-b border-border-light/60 text-[11px] text-text-on-light cursor-pointer hover:bg-panel-light"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleTool(tl.name)}
                          data-testid={`aip-experience-tool-${tl.name}`}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block font-mono text-[11px] truncate">
                            {tl.name}
                          </span>
                          {tl.description && (
                            <span className="block text-[10px] text-muted-on-light line-clamp-2">
                              {tl.description}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Capacidades padrão (toggles — espelham os atalhos do composer). */}
          <section className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold">
              {t('aip.experience.capabilities.label')}
            </label>
            <p className="text-[12px] text-muted-on-light leading-relaxed">
              {t('aip.experience.capabilities.help')}
            </p>
            <div
              className="flex flex-wrap items-center gap-1.5"
              data-testid="aip-experience-capabilities"
            >
              {CAPABILITIES.map((k) => {
                const on = caps[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleCap(k)}
                    aria-pressed={on}
                    data-testid={`aip-experience-cap-${k}`}
                    className={
                      'inline-flex items-center gap-1.5 h-7 px-2.5 border text-[11px] font-medium transition-colors ' +
                      (on
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border-light text-muted-on-light hover:text-text-on-light hover:border-primary/40 bg-panel-light')
                    }
                  >
                    {t(`aip.experience.cap.${k}`)}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Modelo AIP default — read-only, gerido em Dados → Modelos. */}
          <section className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wider text-text-on-light font-semibold">
              {t('aip.experience.model.label')}
            </p>
            <p className="text-[12px] text-muted-on-light leading-relaxed">
              {t('aip.experience.model.help')}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 h-7 px-2 bg-canvas-light border border-border-light text-[11px] font-mono text-text-on-light"
                data-testid="aip-experience-model"
              >
                <Cpu className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
                {modelLabel}
              </span>
              <Link
                href="/painel-de-controle/dados?aba=modelos"
                data-testid="aip-experience-model-link"
                className="inline-flex items-center gap-1.5 h-7 px-2 text-[11px] text-primary hover:underline underline-offset-2"
              >
                {t('aip.experience.model.manage')}
                <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
              </Link>
            </div>
          </section>

          {/* LOTE3 — moldura da página (chrome): faixa autônoma com save
              próprio. Diferente do form acima (server-authoritative via
              AipExperience.save), o chrome é um concern de Page.config e
              persiste via Pages.putConfig. */}
          <PageChromeToggles page={page} onSaved={onSaved} />

          {err && <p className="text-[11px] text-danger">{err}</p>}

          <div className="pt-3 border-t border-border-light flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              data-testid="aip-experience-salvar"
              className="h-8 px-3 text-[12px] bg-primary text-white hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              ) : saved ? (
                <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : null}
              {saving
                ? t('aip.experience.save.saving')
                : saved
                  ? t('aip.experience.save.saved')
                  : t('aip.experience.save.cta')}
            </button>
            <span className="text-[11px] text-muted-on-light">
              {saved
                ? t('aip.experience.save.hint.saved')
                : t('aip.experience.save.hint.pending')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Auto-registro: importar este módulo torna a experiência `aip_chat`
// configurável pelo registry genérico (igual ao auto-registro de widgets e do
// registerAppRoute). A lista de Páginas e o editor roteiam pelo experience_kind,
// não pelo slug.
registerExperienceConfig(AIP_CHAT_EXPERIENCE_KIND, {
  ConfigEditor: AipExperienceEditor,
  labelKey: 'pages.configureExperience',
});
