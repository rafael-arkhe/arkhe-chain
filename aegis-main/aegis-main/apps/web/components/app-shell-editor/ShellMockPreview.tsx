'use client';

/**
 * ShellMockPreview — mini-shell live-preview Onda I.2 (2026-05-23).
 *
 * Representa de forma compacta o shell do AEGIS (banner + sidenav + navbar
 * + área principal + footer) aplicando, em cada região, as cores e marca
 * passadas por props. Usado em:
 *
 *  - `/painel-de-controle/styles-configurator` aba "Cores por região":
 *    preview rola lado-a-lado mostrando cada chip do preset colorindo
 *    a região correta. (Feedback #6)
 *  - `/painel-de-controle/app-shell` toggle "Editar em tela cheia":
 *    serve como bússola visual quando o composer ocupa toda a tela.
 *    (Feedback #5)
 *  - `/painel-de-controle/styles-configurator` aba Marca: preview do
 *    logo+slogan no banner-mock. (Feedback #7)
 *
 * Memória honrada:
 *  - `feedback_no_rounded_no_sparkles` — zero rounded-*, zero Sparkles.
 *  - `feedback_no_emojis_in_ui`         — ícones lucide-react ou nada.
 *  - `feedback_no_palantir_product_names` — strings UI são neutras
 *    ("Painel", "Operações", "Casos") e não nomeiam slate/foundry.
 */

import * as React from 'react';
import type { RegionColorsOut, BrandOut } from '@/lib/api';

export interface ShellMockPreviewProps {
  /** Cores por região aplicadas. Cada campo é opcional — fallback para tokens shell padrão. */
  regionColors?: Partial<RegionColorsOut>;
  /** Marca (logo + slogan) usada no header do mock. */
  marca?: Partial<BrandOut> | null;
  /** Highlight visual de uma região específica — útil em hover do preset chip. */
  highlightRegion?: keyof RegionColorsOut | null;
  /** Mini ou normal — afeta tamanho/escala (não a estrutura). */
  size?: 'mini' | 'normal';
  className?: string;
  /** Test ID base — sufixos derivam (-banner, -sidenav, …). */
  testId?: string;
}

function pick<T>(obj: T | undefined | null, key: keyof Exclude<T, undefined | null>): string | undefined {
  if (!obj) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function ShellMockPreview({
  regionColors,
  marca,
  highlightRegion,
  size = 'normal',
  className,
  testId = 'shell-mock-preview',
}: ShellMockPreviewProps) {
  const compact = size === 'mini';

  const banner = regionColors?.banner ?? {};
  const sidenav = regionColors?.sidenav ?? {};
  const navbar = regionColors?.navbar ?? {};
  const footer = regionColors?.footer ?? {};
  const comunicados = regionColors?.comunicados ?? {};

  const bannerBg = pick(banner, 'bg') ?? '#0D2C4D';
  const bannerText = pick(banner, 'text') ?? '#FFFFFF';
  const bannerAccent = pick(banner, 'accent') ?? '#FFC107';

  const sidenavBg = pick(sidenav, 'bg') ?? '#FFFFFF';
  const sidenavText = pick(sidenav, 'text') ?? '#1B2533';
  const sidenavActive = pick(sidenav, 'active') ?? '#2D77BE';

  const navbarBg = pick(navbar, 'bg') ?? '#FFFFFF';
  const navbarText = pick(navbar, 'text') ?? '#1B2533';

  const footerBg = pick(footer, 'bg') ?? '#F4F5F7';
  const footerText = pick(footer, 'text') ?? '#6A7280';

  const infoBg = pick(comunicados, 'info') ?? '#2D77BE';

  const slogan = marca?.slogan ?? null;
  const logoUrl = marca?.logo_url ?? null;
  const primaryColor = marca?.primary_color ?? sidenavActive;

  const baseHighlight =
    'outline outline-2 outline-offset-[-2px] outline-primary';
  const ring = (region: keyof RegionColorsOut) =>
    highlightRegion === region ? baseHighlight : '';

  return (
    <div
      data-testid={testId}
      data-size={size}
      className={[
        'border border-border-light bg-white overflow-hidden flex flex-col',
        compact ? 'text-[9px]' : 'text-[11px]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ minHeight: compact ? 180 : 260 }}
    >
      {/* Banner */}
      <div
        data-testid={`${testId}-banner`}
        className={['flex items-center px-2 gap-2 select-none', ring('banner')].join(' ')}
        style={{
          backgroundColor: bannerBg,
          color: bannerText,
          height: compact ? 14 : 18,
        }}
      >
        <span
          aria-hidden
          className="block"
          style={{ width: 6, height: 6, backgroundColor: bannerAccent }}
        />
        <span className="font-mono uppercase tracking-[0.16em]">RESTRITO</span>
        <span className="ml-auto opacity-80">OPERAÇÃO 01</span>
      </div>

      {/* Navbar */}
      <div
        data-testid={`${testId}-navbar`}
        className={['flex items-center px-2 gap-2 border-b border-border-light', ring('navbar')].join(' ')}
        style={{
          backgroundColor: navbarBg,
          color: navbarText,
          height: compact ? 18 : 24,
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="logo"
            data-testid={`${testId}-logo`}
            className="block"
            style={{ height: compact ? 12 : 16, maxWidth: 48, objectFit: 'contain' }}
          />
        ) : (
          <span
            data-testid={`${testId}-logo-text`}
            className="font-semibold"
            style={{ color: primaryColor }}
          >
            AEGIS
          </span>
        )}
        {slogan && !compact && (
          <span data-testid={`${testId}-slogan`} className="text-muted-on-light truncate">
            {slogan}
          </span>
        )}
        <span className="ml-auto opacity-60">Buscar</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex">
        {/* Sidenav */}
        <div
          data-testid={`${testId}-sidenav`}
          className={['border-r border-border-light px-1.5 py-1.5 flex flex-col gap-1', ring('sidenav')].join(' ')}
          style={{
            backgroundColor: sidenavBg,
            color: sidenavText,
            width: compact ? 56 : 80,
          }}
        >
          {['Painel', 'Operações', 'Casos', 'Salas'].map((label, idx) => (
            <div
              key={label}
              style={
                idx === 0
                  ? { backgroundColor: sidenavActive, color: bannerText }
                  : undefined
              }
              className="px-1.5 py-0.5 truncate"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-canvas-light p-2 flex flex-col gap-1">
          <div
            data-testid={`${testId}-comunicados`}
            className={['px-1.5 py-1 text-white inline-block w-fit', ring('comunicados')].join(' ')}
            style={{ backgroundColor: infoBg, fontSize: compact ? 8 : 10 }}
          >
            Comunicado · informativo
          </div>
          <div className="bg-white border border-border-light flex-1 p-2 text-text-on-light">
            <span className="font-semibold">Pré-visualização</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        data-testid={`${testId}-footer`}
        className={['flex items-center px-2 border-t border-border-light', ring('footer')].join(' ')}
        style={{
          backgroundColor: footerBg,
          color: footerText,
          height: compact ? 14 : 18,
        }}
      >
        <span className="font-mono">v23.1</span>
        <span className="ml-auto opacity-70">© Safe-Core</span>
      </div>
    </div>
  );
}
