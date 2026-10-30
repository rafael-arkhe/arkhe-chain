'use client';

/**
 * Onda 3b (Safe Tag + AEGIS · 2026-07-09) — editor de PARÂMETROS da
 * experiência ``embed``.
 *
 * Uma Página ``experience_kind:'embed'`` embute uma SPA operacional same-origin
 * em tela cheia (portaria: Mapa Vivo / Alertas ao Vivo). O único parâmetro é
 * QUAL SPA — escolhida de um DROPDOWN CURADO (``EMBED_APPS``), NUNCA digitada
 * (``feedback_no_manual_technical_input``); o valor cru seria um vetor de
 * iframe. Persistido em ``Page.config.params.embed_src`` via ``Pages.putConfig``,
 * PRESERVANDO ``mode``/``experience_kind``/``note`` e demais params. Escolher a
 * SPA também grava o ``nav_icon`` sugerido (Mapa Vivo → map-pin, Alertas →
 * bell-ring), lido pela hidratação do nav.
 */
import * as React from 'react';
import { Loader2, Check, MonitorPlay } from 'lucide-react';

import { Pages } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import {
  registerExperienceConfig,
  type ExperienceConfigProps,
} from '@/lib/pages/experience-registry';
import {
  EMBED_APPS,
  EMBED_EXPERIENCE_KIND,
  readEmbedSrc,
} from '@/lib/pages/embed-defaults';
import { coercePageConfig } from './page-config-adapter';

export function EmbedExperienceEditor({ page, onSaved }: ExperienceConfigProps) {
  const t = useT();

  const initialSrc = React.useMemo(
    () => readEmbedSrc(page.config) ?? EMBED_APPS[0]?.src ?? '',
    [page.config],
  );
  const [src, setSrc] = React.useState<string>(initialSrc);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function onPick(next: string) {
    setSrc(next);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      // Preserva o blob app_route (mode/experience_kind/note + params já
      // gravados) e só (re)escreve embed_src + nav_icon da SPA escolhida.
      const cfg = coercePageConfig(page.config);
      const app = cfg.mode === 'app_route' ? cfg : null;
      const prevParams = app?.params ?? {};
      const chosen = EMBED_APPS.find((a) => a.src === src);
      const nextConfig: Record<string, unknown> = {
        mode: 'app_route',
        experience_kind: app?.experience_kind ?? EMBED_EXPERIENCE_KIND,
        ...(app?.note ? { note: app.note } : {}),
        params: {
          ...prevParams,
          embed_src: src,
          ...(chosen ? { nav_icon: chosen.navIcon } : {}),
        },
      };
      await Pages.putConfig(page.slug, nextConfig);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('embed.experience.save.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="max-w-2xl w-full bg-white border border-border-light"
      data-testid="embed-experience-editor"
    >
      <div className="h-10 px-3 border-b border-border-light flex items-center gap-2">
        <MonitorPlay className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
        <span className="text-[12px] font-semibold text-text-on-light">
          {t('embed.experience.header.title')}
        </span>
        <span className="ml-auto text-[10px] text-muted-on-light">
          {t('embed.experience.header.sameorigin')}
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div className="border border-border-light bg-canvas-light p-3">
          <p className="text-[12px] text-text-on-light leading-relaxed">
            <span className="font-semibold">{t('embed.experience.about.title')}</span>{' '}
            {t('embed.experience.about.body')}
          </p>
        </div>

        <section className="space-y-1.5">
          <label
            htmlFor="embed-experience-src"
            className="block text-[11px] uppercase tracking-wider text-text-on-light font-semibold"
          >
            {t('embed.experience.app.label')}
          </label>
          <p className="text-[12px] text-muted-on-light leading-relaxed">
            {t('embed.experience.app.help')}
          </p>
          <select
            id="embed-experience-src"
            value={src}
            onChange={(e) => onPick(e.target.value)}
            data-testid="embed-experience-src"
            className="w-full max-w-sm h-8 px-2 text-[12px] bg-canvas-light border border-border-light text-text-on-light outline-none focus:border-primary"
          >
            {EMBED_APPS.map((a) => (
              <option key={a.id} value={a.src}>
                {t(a.labelKey)}
              </option>
            ))}
          </select>
          <p
            className="text-[11px] font-mono text-muted-on-light break-all"
            data-testid="embed-experience-src-preview"
          >
            {src}
          </p>
        </section>

        {err && <p className="text-[11px] text-danger" data-testid="embed-experience-error">{err}</p>}

        <div className="pt-3 border-t border-border-light flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            data-testid="embed-experience-salvar"
            className="h-8 px-3 text-[12px] bg-primary text-white hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
            ) : null}
            {saving
              ? t('embed.experience.save.saving')
              : saved
                ? t('embed.experience.save.saved')
                : t('embed.experience.save.cta')}
          </button>
          <span className="text-[11px] text-muted-on-light">
            {saved
              ? t('embed.experience.save.hint.saved')
              : t('embed.experience.save.hint.pending')}
          </span>
        </div>
      </div>
    </div>
  );
}

// Auto-registro: importar este módulo torna a experiência `embed` configurável
// pelo registry genérico (igual aos outros experience-editors). A lista de
// Páginas e o editor roteiam pelo experience_kind, não pelo slug.
registerExperienceConfig(EMBED_EXPERIENCE_KIND, {
  ConfigEditor: EmbedExperienceEditor,
  labelKey: 'pages.configureExperience',
});
