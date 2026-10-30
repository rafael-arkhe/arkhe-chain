'use client';

/**
 * Parametrização da /solutions — editor de PARÂMETROS (não widgets).
 *
 * A /solutions (Desenho da Operação / AIP Arquiteto) é app_route: o canvas
 * reactflow É a experiência e permanece servido por código; o que se
 * parametriza aqui é COMO o AIP Arquiteto se comporta por padrão —
 * profundidade da proposta (enxuta × completa), escopo do desenho e o
 * MODELO AIP default. Os parâmetros são persistidos em `Page.config.params`
 * via `Pages.putConfig`, PRESERVANDO `mode`/`experience_kind`/`note` (e
 * qualquer outro param já gravado). A /solutions lê esses defaults na hora.
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
import {
  SOLUTIONS_EXPERIENCE_KIND,
  readSolutionsExperienceParams,
  type SolutionsDepth,
  type SolutionsScopeKind,
} from '@/lib/solutions/experience-defaults';
import { coercePageConfig } from './page-config-adapter';
import { PageChromeToggles } from './page-chrome-toggles';

const DEPTHS: readonly SolutionsDepth[] = ['lean', 'full'];
const SCOPES: readonly SolutionsScopeKind[] = ['full', 'module', 'page'];

export function SolutionsExperienceEditor({ page, onSaved }: ExperienceConfigProps) {
  const t = useT();

  const initial = React.useMemo(
    () => readSolutionsExperienceParams(page.config),
    [page.config],
  );

  const [depth, setDepth] = React.useState<SolutionsDepth>(initial.depth);
  const [scope, setScope] = React.useState<SolutionsScopeKind>(initial.scope);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // O modelo é gerido centralmente; aqui só EXIBIMOS o codinome do efetivo.
  const modelLabel = aipModelLabel(initial.model) || initial.model;

  const onDepth = (v: SolutionsDepth) => {
    setSaved(false);
    setDepth(v);
  };
  const onScope = (v: SolutionsScopeKind) => {
    setSaved(false);
    setScope(v);
  };

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      // Preserva o blob app_route (mode/experience_kind/note + params
      // existentes — ex.: model gerido em Dados → Modelos) e só sobrescreve
      // depth/scope. Nunca apaga o que já estava em params.
      const cfg = coercePageConfig(page.config);
      const app = cfg.mode === 'app_route' ? cfg : null;
      const prevParams = app?.params ?? {};
      const nextConfig: Record<string, unknown> = {
        mode: 'app_route',
        experience_kind: app?.experience_kind ?? SOLUTIONS_EXPERIENCE_KIND,
        ...(app?.note ? { note: app.note } : {}),
        params: { ...prevParams, depth, scope },
      };
      await Pages.putConfig(page.slug, nextConfig);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('solutions.experience.save.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="max-w-2xl w-full bg-white border border-border-light"
      data-testid="solutions-experience-editor"
    >
      <div className="h-10 px-3 border-b border-border-light flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
        <span className="text-[12px] font-semibold text-text-on-light">
          {t('solutions.experience.header.title')}
        </span>
        <span className="ml-auto text-[10px] text-muted-on-light">
          {t('solutions.experience.header.widgetsLocked')}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* O que é — contexto pra qualquer um entender sem manual. */}
        <div className="border border-border-light bg-canvas-light p-3">
          <p className="text-[12px] text-text-on-light leading-relaxed">
            <span className="font-semibold">{t('solutions.experience.about.title')}</span>{' '}
            {t('solutions.experience.about.body')}
          </p>
        </div>

        {/* Profundidade default da proposta. */}
        <section className="space-y-1.5">
          <label
            htmlFor="solutions-experience-depth"
            className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold"
          >
            {t('solutions.experience.depth.label')}
          </label>
          <p className="text-[12px] text-muted-on-light leading-relaxed">
            {t('solutions.experience.depth.help')}
          </p>
          <select
            id="solutions-experience-depth"
            value={depth}
            onChange={(e) => onDepth(e.target.value as SolutionsDepth)}
            data-testid="solutions-experience-depth"
            className="w-full max-w-xs h-8 px-2 text-[12px] bg-canvas-light border border-border-light text-text-on-light outline-none focus:border-primary"
          >
            {DEPTHS.map((d) => (
              <option key={d} value={d}>
                {t(`solutions.experience.depth.${d}`)}
              </option>
            ))}
          </select>
        </section>

        {/* Escopo default do desenho. */}
        <section className="space-y-1.5">
          <label
            htmlFor="solutions-experience-scope"
            className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold"
          >
            {t('solutions.experience.scope.label')}
          </label>
          <p className="text-[12px] text-muted-on-light leading-relaxed">
            {t('solutions.experience.scope.help')}
          </p>
          <select
            id="solutions-experience-scope"
            value={scope}
            onChange={(e) => onScope(e.target.value as SolutionsScopeKind)}
            data-testid="solutions-experience-scope"
            className="w-full max-w-xs h-8 px-2 text-[12px] bg-canvas-light border border-border-light text-text-on-light outline-none focus:border-primary"
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {t(`solutions.experience.scope.${s}`)}
              </option>
            ))}
          </select>
        </section>

        {/* Modelo AIP default — gerido centralmente em Dados → Modelos. */}
        <section className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-text-on-light font-semibold">
            {t('solutions.experience.model.label')}
          </p>
          <p className="text-[12px] text-muted-on-light leading-relaxed">
            {t('solutions.experience.model.help')}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 h-7 px-2 bg-canvas-light border border-border-light text-[11px] font-mono text-text-on-light"
              data-testid="solutions-experience-model"
            >
              <Cpu className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
              {modelLabel}
            </span>
            <Link
              href="/painel-de-controle/dados?aba=modelos"
              data-testid="solutions-experience-model-link"
              className="inline-flex items-center gap-1.5 h-7 px-2 text-[11px] text-primary hover:underline underline-offset-2"
            >
              {t('solutions.experience.model.manage')}
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
            data-testid="solutions-experience-salvar"
            className="h-8 px-3 text-[12px] bg-primary text-white hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
            ) : null}
            {saving
              ? t('solutions.experience.save.saving')
              : saved
                ? t('solutions.experience.save.saved')
                : t('solutions.experience.save.cta')}
          </button>
          <span className="text-[11px] text-muted-on-light">
            {saved
              ? t('solutions.experience.save.hint.saved')
              : t('solutions.experience.save.hint.pending')}
          </span>
        </div>
      </div>
    </div>
  );
}

// Auto-registro: importar este módulo torna a experiência `solutions`
// configurável pelo registry genérico (igual ao auto-registro de widgets e
// do registerAppRoute). A lista de Páginas e o editor roteiam pelo
// experience_kind, não pelo slug.
registerExperienceConfig(SOLUTIONS_EXPERIENCE_KIND, {
  ConfigEditor: SolutionsExperienceEditor,
  labelKey: 'pages.configureExperience',
});
