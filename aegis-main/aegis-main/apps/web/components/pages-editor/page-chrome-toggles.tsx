'use client';

/**
 * LOTE3 (2026-06-28) — "Moldura da página": toggles de CHROME compartilhados
 * pelos três configuradores de experiência (Conversas / Soluções / Agentes).
 *
 * Controla como a VIEW canônica (``/paginas/[slug]/view``) emoldura o app de
 * uma ``app_route``:
 *   - ``hide_page_header``: oculta o cabeçalho do PRÓPRIO app (a barra de
 *     título do ``PageShell`` / a toolbar de título) — máximo de espaço
 *     vertical (ideal p/ chat e canvas);
 *   - ``full_bleed``: o app ocupa toda a largura (default) ou é centralizado
 *     numa coluna ``max-w-[1400px]`` quando desligado.
 *
 * Persiste em ``Page.config.params.chrome`` via ``Pages.putConfig``,
 * PRESERVANDO ``mode``/``experience_kind``/``note`` e os demais ``params``
 * (ex.: model, depth, default_cron). Como é uma faixa AUTÔNOMA com o próprio
 * botão de salvar, não interfere no save principal de cada experiência —
 * inclusive a do AIP, cujo comportamento é server-authoritative
 * (``AipExperience.save`` → Agent.config) e NUNCA passa por ``Pages.putConfig``.
 */
import * as React from 'react';
import { Loader2, Check, PanelTop, Maximize2 } from 'lucide-react';

import { Pages } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import type { RegisteredPage } from '@/lib/api';
import { coercePageConfig, readPageChrome } from './page-config-adapter';

export interface PageChromeTogglesProps {
  /** A Page sendo configurada (registry de Páginas do tenant). */
  page: RegisteredPage;
  /** Callback opcional chamado após um save bem-sucedido. */
  onSaved?: () => void;
}

export function PageChromeToggles({ page, onSaved }: PageChromeTogglesProps) {
  const t = useT();

  const initial = React.useMemo(() => readPageChrome(page.config), [page.config]);

  const [hidePageHeader, setHidePageHeader] = React.useState(initial.hidePageHeader);
  const [fullBleed, setFullBleed] = React.useState(initial.fullBleed);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const onHide = (v: boolean) => {
    setSaved(false);
    setHidePageHeader(v);
  };
  const onFullBleed = (v: boolean) => {
    setSaved(false);
    setFullBleed(v);
  };

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      // Preserva o blob app_route (mode/experience_kind/note + params
      // existentes) e só (re)escreve params.chrome. Nunca apaga o resto.
      const cfg = coercePageConfig(page.config);
      const app = cfg.mode === 'app_route' ? cfg : null;
      const prevParams = app?.params ?? {};
      const nextConfig: Record<string, unknown> = {
        mode: 'app_route',
        ...(app?.experience_kind ? { experience_kind: app.experience_kind } : {}),
        ...(app?.note ? { note: app.note } : {}),
        params: {
          ...prevParams,
          chrome: { hide_page_header: hidePageHeader, full_bleed: fullBleed },
        },
      };
      await Pages.putConfig(page.slug, nextConfig);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('pages.chrome.save.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="border border-border-light bg-canvas-light p-3 space-y-3"
      data-testid="page-chrome-toggles"
    >
      <div className="flex items-center gap-2">
        <PanelTop className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
        <span className="text-[12px] font-semibold text-text-on-light">
          {t('pages.chrome.title')}
        </span>
      </div>
      <p className="text-[12px] text-muted-on-light leading-relaxed">
        {t('pages.chrome.help')}
      </p>

      {/* Ocultar cabeçalho da página. */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={hidePageHeader}
          onChange={(e) => onHide(e.target.checked)}
          data-testid="page-chrome-hide-header"
          className="mt-0.5 accent-primary"
        />
        <span className="min-w-0">
          <span className="block text-[12px] text-text-on-light inline-flex items-center gap-1.5">
            <PanelTop className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
            {t('pages.chrome.hideHeader.label')}
          </span>
          <span className="block text-[11px] text-muted-on-light leading-relaxed">
            {t('pages.chrome.hideHeader.help')}
          </span>
        </span>
      </label>

      {/* Largura total. */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={fullBleed}
          onChange={(e) => onFullBleed(e.target.checked)}
          data-testid="page-chrome-full-bleed"
          className="mt-0.5 accent-primary"
        />
        <span className="min-w-0">
          <span className="block text-[12px] text-text-on-light inline-flex items-center gap-1.5">
            <Maximize2 className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
            {t('pages.chrome.fullBleed.label')}
          </span>
          <span className="block text-[11px] text-muted-on-light leading-relaxed">
            {t('pages.chrome.fullBleed.help')}
          </span>
        </span>
      </label>

      {err && <p className="text-[11px] text-danger">{err}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          data-testid="page-chrome-salvar"
          className="h-8 px-3 text-[12px] bg-primary text-white hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
          ) : saved ? (
            <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : null}
          {saving
            ? t('pages.chrome.save.saving')
            : saved
              ? t('pages.chrome.save.saved')
              : t('pages.chrome.save.cta')}
        </button>
      </div>
    </section>
  );
}
