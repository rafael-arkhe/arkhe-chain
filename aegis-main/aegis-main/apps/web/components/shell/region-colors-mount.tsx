'use client';

/**
 * RegionColorsMount — Wave H.4.C (2026-05-23).
 *
 * Componente leve que lê as Cores por região do tenant via
 * `GET /platform/v23/styles/region-colors` e injeta CSS variables
 * (`--banner-bg`, `--sidenav-bg`, etc.) no `<html>`. Cada componente
 * de shell (banner/sidenav/navbar/footer/comunicados/backdrop) pode usar
 * `bg-[var(--banner-bg)]` etc. com fallback aos tokens DS quando não
 * setado.
 *
 * Montado pelo `AuthShell` em todos os ramos autenticados.
 */
import * as React from 'react';

import { Styles, type RegionColorsOut } from '@/lib/api';

const REGION_KEYS: (keyof RegionColorsOut)[] = [
  'banner',
  'sidenav',
  'navbar',
  'footer',
  'comunicados',
  'backdrop',
];

function buildCssVars(blob: RegionColorsOut): string {
  const lines: string[] = [];
  for (const region of REGION_KEYS) {
    const sub = (blob[region] ?? {}) as Record<string, string>;
    for (const [field, value] of Object.entries(sub)) {
      if (!value) continue;
      lines.push(`--${region}-${field}: ${value};`);
    }
  }
  if (lines.length === 0) return '';
  return `:root { ${lines.join(' ')} }`;
}

export function RegionColorsMount() {
  const [css, setCss] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    Styles.getRegionColors()
      .then((out) => {
        if (cancelled) return;
        setCss(buildCssVars(out));
      })
      .catch(() => {
        if (!cancelled) setCss('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!css) return null;
  return (
    <style
      data-testid="aegis-region-colors"
      // CSS construído a partir do payload já validado server-side
      // (hex/opacidade); o conteúdo é controlado, mas mantemos a
      // injeção via dangerouslySetInnerHTML pra preservar formatação.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
