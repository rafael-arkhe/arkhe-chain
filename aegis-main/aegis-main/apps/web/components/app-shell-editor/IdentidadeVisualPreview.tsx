'use client';

/**
 * IdentidadeVisualPreview — Onda K.3 (2026-05-23), Feedback #6.
 *
 * UM ÚNICO preview vivo do shell completo que reflete, ao mesmo tempo:
 *   - Marca   → logo + slogan no chrome (banner/navbar).
 *   - Cores   → banner + sidenav + navbar + footer + comunicados.
 *
 * Substitui o par confuso de previews separados que mostravam DOIS shells
 * mock diferentes (um pra marca, outro pras cores). Agora o operador edita
 * logo/slogan/cor/preset e vê o MESMO shell inteiro atualizar — sem dividir
 * a atenção entre dois cartões.
 *
 * Reuso de `ShellMockPreview` sem alterar sua assinatura (compartilhado
 * com `/painel-de-controle/app-shell`, Onda K.4). Passamos `marca` +
 * `regionColors` simultaneamente — o ShellMock já aceita os dois.
 *
 * Memória honrada:
 *  - `feedback_no_rounded_no_sparkles` — zero rounded-*, zero Sparkles.
 *  - `feedback_no_emojis_in_ui`         — ícones lucide-react ou nada.
 *  - `feedback_no_palantir_product_names` — strings neutras pt-BR.
 */

import * as React from 'react';
import { Check, Eye } from 'lucide-react';
import type { BrandOut, RegionColorsOut } from '@/lib/api';
import { PRESETS_COLOR_AEGIS, type RegionColorPreset } from '@/lib/app-shell/defaults';
import { ShellMockPreview } from './ShellMockPreview';

export interface IdentidadeVisualPreviewProps {
  /** Marca atual editada — logo + slogan refletem no chrome do mock. */
  brand: Partial<BrandOut>;
  /** Cores por região atuais — refletem em cada faixa do mock. */
  regionColors: Partial<RegionColorsOut>;
  /** Presets clicáveis de paleta (backend pode sobrescrever o fallback). */
  presets?: RegionColorPreset[];
  /** Aplica um preset inteiro de cores (substitui todas as 6 regiões). */
  onApplyPreset?: (preset: RegionColorPreset) => void;
  /** Restaura cores ao padrão (zera as regiões). */
  onResetColors?: () => void;
  className?: string;
  /** Test ID base — sufixos derivam (-canvas, -preset-*, …). */
  testId?: string;
}

/**
 * Preview unificado de identidade visual: marca + cores num único shell.
 */
export function IdentidadeVisualPreview({
  brand,
  regionColors,
  presets = PRESETS_COLOR_AEGIS,
  onApplyPreset,
  onResetColors,
  className,
  testId = 'identidade-visual-preview',
}: IdentidadeVisualPreviewProps) {
  const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);

  // Hover em um chip mostra TEMPORARIAMENTE como ficaria com aquele preset,
  // preservando a marca atual. Ao sair, volta pro estado real editado.
  const hovered = presets.find((p) => p.key === hoveredKey);
  const effectiveColors: Partial<RegionColorsOut> = hovered?.colors ?? regionColors;

  return (
    <div
      data-testid={testId}
      className={[
        'bg-white border border-border-light p-4 space-y-3',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="flex items-center gap-2 pb-1.5 border-b border-border-light">
        <Eye className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} aria-hidden />
        <h3 className="text-[12px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
          Pré-visualização ao vivo
        </h3>
        {onResetColors && (
          <button
            type="button"
            data-testid={`${testId}-reset`}
            onClick={onResetColors}
            className="ml-auto text-[10.5px] text-muted-on-light hover:text-primary border border-border-light h-6 px-2"
          >
            Restaurar cores
          </button>
        )}
      </header>

      <p className="text-[10.5px] text-muted-on-light italic">
        Tudo o que você edita à esquerda — logo, slogan e cores — aparece
        aqui no mesmo shell de exemplo.
      </p>

      {/* Presets de paleta — clique aplica em todas as regiões de uma vez. */}
      {presets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            Presets de cor
          </p>
          <ul data-testid={`${testId}-presets`} className="flex flex-wrap gap-1.5">
            {presets.map((p) => {
              const active = isPresetActive(regionColors, p);
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    data-testid={`${testId}-preset-${p.key}`}
                    aria-pressed={active}
                    onMouseEnter={() => setHoveredKey(p.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onFocus={() => setHoveredKey(p.key)}
                    onBlur={() => setHoveredKey(null)}
                    onClick={() => onApplyPreset?.(p)}
                    title={p.description}
                    className={[
                      'h-8 px-2.5 text-[11px] border flex items-center gap-1.5 transition-colors',
                      active
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white border-border-light text-text-on-light hover:border-primary',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden
                      className="block w-3 h-3 border border-border-light"
                      style={{ backgroundColor: p.colors.banner.bg ?? '#0D2C4D' }}
                    />
                    <span
                      aria-hidden
                      className="block w-3 h-3 border border-border-light"
                      style={{ backgroundColor: p.colors.sidenav.active ?? '#2D77BE' }}
                    />
                    <span className="font-semibold">{p.label}</span>
                    {active && <Check className="w-3 h-3" strokeWidth={2} aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p
            data-testid={`${testId}-preset-description`}
            className="text-[10.5px] text-muted-on-light italic min-h-[14px]"
          >
            {hovered?.description ??
              activePreset(regionColors, presets)?.description ??
              'Passe o cursor por um preset para visualizar a paleta no shell.'}
          </p>
        </div>
      )}

      {/* O único shell mock — reflete marca E cores simultaneamente. */}
      <ShellMockPreview
        marca={brand}
        regionColors={effectiveColors}
        size="normal"
        testId={`${testId}-canvas`}
      />
    </div>
  );
}

function isPresetActive(
  current: Partial<RegionColorsOut>,
  preset: RegionColorPreset,
): boolean {
  // Match raso: banner.bg + sidenav.active batem exatamente com o preset.
  // Heurística leve — operador edita campos depois e perde o "ativo".
  return (
    (current.banner?.bg ?? '').toLowerCase() ===
      (preset.colors.banner.bg ?? '').toLowerCase() &&
    (current.sidenav?.active ?? '').toLowerCase() ===
      (preset.colors.sidenav.active ?? '').toLowerCase()
  );
}

function activePreset(
  current: Partial<RegionColorsOut>,
  presets: RegionColorPreset[],
): RegionColorPreset | undefined {
  return presets.find((p) => isPresetActive(current, p));
}
