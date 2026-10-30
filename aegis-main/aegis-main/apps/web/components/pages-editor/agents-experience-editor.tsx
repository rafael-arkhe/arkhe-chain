'use client';

/**
 * Parametrização da /agentes — editor de PARÂMETROS (não widgets).
 *
 * A /agentes (frota 24/7 — kanban + execução em tempo real) é app_route: o
 * kanban É a experiência e permanece servido por código; o que se parametriza
 * aqui é COMO A FROTA se comporta por padrão — a cadência (cron) default
 * oferecida a agentes ainda sem agenda própria, o prompt-base default para
 * novos agentes e o MODELO AIP default. Os parâmetros são persistidos em
 * `Page.config.params` via `Pages.putConfig`, PRESERVANDO
 * `mode`/`experience_kind`/`note` (e qualquer outro param já gravado). O board
 * da /agentes lê esses defaults na hora.
 *
 * Modelo: a escolha do modelo é CENTRALIZADA em Dados → Modelos
 * (`/painel-de-controle/dados?aba=modelos`); aqui só exibimos o codinome AIP
 * do modelo efetivo + link pra lá (NUNCA um seletor de vendor — codinome via
 * `aipModelLabel`, sem nome de terceiros).
 */
import * as React from 'react';
import Link from 'next/link';
import {
  Loader2,
  Check,
  SlidersHorizontal,
  ExternalLink,
  Cpu,
} from 'lucide-react';

import { Pages } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { aipModelLabel } from '@/lib/aip/modelLabels';
import { registerExperienceConfig } from '@/lib/pages/experience-registry';
import type { ExperienceConfigProps } from '@/lib/pages/experience-registry';
import type { CronPreset } from '@/lib/api/agentes';
import {
  AGENTES_CRON_PRESETS,
  AGENTES_EXPERIENCE_KIND,
  readAgentsExperienceParams,
} from '@/lib/agentes/experience-defaults';
import { coercePageConfig } from './page-config-adapter';
import { PageChromeToggles } from './page-chrome-toggles';

const SYSTEM_PROMPT_MAX = 8192;

export function AgentsExperienceEditor({ page, onSaved }: ExperienceConfigProps) {
  const t = useT();

  const initial = React.useMemo(
    () => readAgentsExperienceParams(page.config),
    [page.config],
  );

  const [defaultCron, setDefaultCron] = React.useState<CronPreset>(
    initial.defaultCron,
  );
  const [systemPrompt, setSystemPrompt] = React.useState<string>(
    initial.systemPrompt,
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // O modelo é gerido centralmente; aqui só EXIBIMOS o codinome do efetivo.
  // GAP G — NUNCA o slug cru: aipModelLabel cobre desconhecidos; vazio (serviço
  // interno) cai num placeholder neutro, jamais o slug de vendor.
  const modelLabel = aipModelLabel(initial.model) || '—';

  const onCron = (v: CronPreset) => {
    setSaved(false);
    setDefaultCron(v);
  };
  const onPrompt = (v: string) => {
    setSaved(false);
    setSystemPrompt(v.slice(0, SYSTEM_PROMPT_MAX));
  };

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      // Preserva o blob app_route (mode/experience_kind/note + params
      // existentes — ex.: model gerido em Dados → Modelos) e só sobrescreve
      // default_cron/system_prompt. Nunca apaga o que já estava em params.
      const cfg = coercePageConfig(page.config);
      const app = cfg.mode === 'app_route' ? cfg : null;
      const prevParams = app?.params ?? {};
      const nextConfig: Record<string, unknown> = {
        mode: 'app_route',
        experience_kind: app?.experience_kind ?? AGENTES_EXPERIENCE_KIND,
        ...(app?.note ? { note: app.note } : {}),
        params: {
          ...prevParams,
          default_cron: defaultCron,
          system_prompt: systemPrompt.trim(),
        },
      };
      await Pages.putConfig(page.slug, nextConfig);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('agents.experience.save.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="max-w-2xl w-full bg-white border border-border-light"
      data-testid="agents-experience-editor"
    >
      <div className="h-10 px-3 border-b border-border-light flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
        <span className="text-[12px] font-semibold text-text-on-light">
          {t('agents.experience.header.title')}
        </span>
        <span className="ml-auto text-[10px] text-muted-on-light">
          {t('agents.experience.header.widgetsLocked')}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* O que é — contexto pra qualquer um entender sem manual. */}
        <div className="border border-border-light bg-canvas-light p-3">
          <p className="text-[12px] text-text-on-light leading-relaxed">
            <span className="font-semibold">{t('agents.experience.about.title')}</span>{' '}
            {t('agents.experience.about.body')}
          </p>
        </div>

        {/* Cadência default da frota. */}
        <section className="space-y-1.5">
          <label
            htmlFor="agents-experience-default-cron"
            className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold"
          >
            {t('agents.experience.cron.label')}
          </label>
          <p className="text-[12px] text-muted-on-light leading-relaxed">
            {t('agents.experience.cron.help')}
          </p>
          <select
            id="agents-experience-default-cron"
            value={defaultCron}
            onChange={(e) => onCron(e.target.value as CronPreset)}
            data-testid="agents-experience-default-cron"
            className="w-full max-w-xs h-8 px-2 text-[12px] bg-canvas-light border border-border-light text-text-on-light outline-none focus:border-primary"
          >
            {AGENTES_CRON_PRESETS.map((c) => (
              <option key={c} value={c}>
                {t(`agents.experience.cron.preset.${c}`)}
              </option>
            ))}
          </select>
        </section>

        {/* Prompt-base default p/ novos agentes. */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="agents-experience-system-prompt"
              className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold"
            >
              {t('agents.experience.prompt.label')}
            </label>
            <span
              className="text-[10px] font-mono text-muted-on-light"
              aria-live="polite"
            >
              {systemPrompt.length} / {SYSTEM_PROMPT_MAX}
            </span>
          </div>
          <p className="text-[12px] text-muted-on-light leading-relaxed">
            {t('agents.experience.prompt.help')}
          </p>
          <textarea
            id="agents-experience-system-prompt"
            value={systemPrompt}
            onChange={(e) => onPrompt(e.target.value)}
            rows={6}
            placeholder={t('agents.experience.prompt.placeholder')}
            data-testid="agents-experience-system-prompt"
            className="w-full min-h-[120px] font-mono text-[11px] bg-canvas-light border border-border-light px-2 py-1.5 outline-none focus:border-primary text-text-on-light"
          />
        </section>

        {/* Modelo AIP default — gerido centralmente em Dados → Modelos. */}
        <section className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-text-on-light font-semibold">
            {t('agents.experience.model.label')}
          </p>
          <p className="text-[12px] text-muted-on-light leading-relaxed">
            {t('agents.experience.model.help')}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 h-7 px-2 bg-canvas-light border border-border-light text-[11px] font-mono text-text-on-light"
              data-testid="agents-experience-model"
            >
              <Cpu className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
              {modelLabel}
            </span>
            <Link
              href="/painel-de-controle/dados?aba=modelos"
              data-testid="agents-experience-model-link"
              className="inline-flex items-center gap-1.5 h-7 px-2 text-[11px] text-primary hover:underline underline-offset-2"
            >
              {t('agents.experience.model.manage')}
              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
            </Link>
          </div>
        </section>

        {/* LOTE3 — moldura da página (chrome): faixa autônoma com save próprio. */}
        <PageChromeToggles page={page} onSaved={onSaved} />

        {err && <p className="text-[11px] text-danger">{err}</p>}

        <div className="pt-3 border-t border-border-light flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            data-testid="agents-experience-salvar"
            className="h-8 px-3 text-[12px] bg-primary text-white hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
            ) : null}
            {saving
              ? t('agents.experience.save.saving')
              : saved
                ? t('agents.experience.save.saved')
                : t('agents.experience.save.cta')}
          </button>
          <span className="text-[11px] text-muted-on-light">
            {saved
              ? t('agents.experience.save.hint.saved')
              : t('agents.experience.save.hint.pending')}
          </span>
        </div>
      </div>
    </div>
  );
}

// Auto-registro: importar este módulo torna a experiência `agents`
// configurável pelo registry genérico (igual ao auto-registro de widgets e
// do registerAppRoute). A lista de Páginas e o editor roteiam pelo
// experience_kind, não pelo slug.
registerExperienceConfig(AGENTES_EXPERIENCE_KIND, {
  ConfigEditor: AgentsExperienceEditor,
  labelKey: 'pages.configureExperience',
});
