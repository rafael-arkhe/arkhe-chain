/**
 * B4 (MAPA /geo) — gerador de marcador "moldura mil-spec" (design APROVADO):
 *
 *   - a FORMA da moldura codifica a CATEGORIA:
 *       ◇ event  = losango (quadrado girado, cantos retos)
 *       □ asset  = quadrado (cantos retos, NUNCA arredondado)
 *       ○ sensor = círculo
 *   - o preenchimento da forma é a `color` (identidade da camada);
 *   - a borda é aço #2D77BE (estrutural), com fio INTERNO de tinta (INK) 1px
 *     p/ contraste sobre o globo escuro;
 *   - a severidade entra como a ÚNICA cor de ESTADO saturada, numa barra-base
 *     fina embaixo;
 *   - selecionado ganha um ANEL externo de aço (fill none) — selecionado
 *     difere de não-selecionado;
 *   - cantos retos; SEM glow (nunca feGaussianBlur/halo/drop-shadow).
 *
 * Helpers PUROS — devolvem SVG (string) / data-URI (Cesium-safe). Sem Cesium,
 * sem I/O.
 */
import { SEVERITY_COLOR, type MarkerCategory } from './geo-utils';

export type { MarkerCategory };

const STEEL = '#2D77BE'; // azul-aço estrutural (borda)
const INK = '#0a0e14'; // tinta do globo escuro (glifo sobre preenchimento claro)

/** Forma central (~22px) que codifica a categoria — fill=color, borda aço 2px. */
function shapeFor(category: MarkerCategory, color: string): string {
  const attrs = ` fill="${color}" stroke="${STEEL}" stroke-width="2"`;
  if (category === 'event') {
    return `<polygon points="16,5 27,16 16,27 5,16"${attrs} />`;
  }
  if (category === 'asset') {
    return `<rect x="5" y="5" width="22" height="22"${attrs} />`;
  }
  return `<circle cx="16" cy="16" r="11"${attrs} />`;
}

/** Luminância relativa (sRGB) do preenchimento → cor do glifo com contraste:
 *  fio claro (INK) sobre forma clara, branco sobre forma escura. */
function glyphColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? INK : '#ffffff';
}

/** Glifo MONOLINHA que dá a leitura de "mapa de comando" (o tipo dentro da
 *  moldura): reticula p/ evento, bloco p/ ativo, anel de emissor p/ sensor. */
function glyphFor(category: MarkerCategory, fill: string): string {
  const g = glyphColorFor(fill);
  if (category === 'event') {
    return `<path d="M16 11.5 V20.5 M11.5 16 H20.5" fill="none" stroke="${g}" stroke-width="1.7" stroke-linecap="round" />`;
  }
  if (category === 'asset') {
    return `<rect x="12.5" y="12.5" width="7" height="7" fill="${g}" />`;
  }
  return `<circle cx="16" cy="16" r="4.2" fill="none" stroke="${g}" stroke-width="1.7" /><circle cx="16" cy="16" r="1" fill="${g}" />`;
}

/** Anel externo de seleção (aço, fill none) ~3px além da forma. */
function selectionRing(category: MarkerCategory): string {
  const attrs = ` fill="none" stroke="${STEEL}" stroke-width="2"`;
  if (category === 'event') {
    return `<polygon points="16,1 31,16 16,31 1,16"${attrs} />`;
  }
  if (category === 'asset') {
    return `<rect x="2" y="2" width="28" height="28"${attrs} />`;
  }
  return `<circle cx="16" cy="16" r="14"${attrs} />`;
}

/**
 * SVG do marcador: forma por categoria + fio interno + (opcional) barra de
 * estado + (opcional) anel de seleção. viewBox 32×32, cantos retos, SEM glow.
 */
export function markerSvg({
  category,
  color,
  severity,
  selected,
}: {
  category: MarkerCategory;
  color: string;
  severity?: string | null;
  selected?: boolean;
}): string {
  const parts: string[] = [];

  // Anel externo de seleção (por baixo da forma) — selecionado != normal.
  if (selected) parts.push(selectionRing(category));

  // Forma central (a SHAPE codifica a categoria) + glifo monolinha (o TIPO).
  parts.push(shapeFor(category, color));
  parts.push(glyphFor(category, color));

  // Barra-base de ESTADO — a única cor saturada (severidade).
  if (severity) {
    const stateColor = SEVERITY_COLOR[severity] ?? color;
    parts.push(`<rect x="7" y="26" width="18" height="4" fill="${stateColor}" />`);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">` +
    parts.join('') +
    `</svg>`
  );
}

/** Data-URI SVG do marcador — pronto pro billboard do Cesium. */
export function markerImage(opts: {
  category: MarkerCategory;
  color: string;
  severity?: string | null;
  selected?: boolean;
}): string {
  return 'data:image/svg+xml,' + encodeURIComponent(markerSvg(opts));
}

/**
 * Badge de cluster: quadrado de cantos retos (aço 2px, fundo grafite) com a
 * contagem centrada em JetBrains Mono. A caixa cresce com a contagem
 * (22 / 26 / 30px para <20 / <100 / >=100). SEM glow.
 */
export function clusterSvg(count: number): string {
  const size = count >= 100 ? 30 : count >= 20 ? 26 : 22;
  const half = size / 2;
  const x = 16 - half;
  const y = 16 - half;
  const fontSize = count >= 100 ? 11 : 13;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">` +
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#14181E" stroke="${STEEL}" stroke-width="2" />` +
    `<text x="16" y="16" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="JetBrains Mono, monospace" font-size="${fontSize}" font-weight="bold" fill="#ffffff">${count}</text>` +
    `</svg>`
  );
}

/** Data-URI SVG do badge de cluster. */
export function clusterImage(count: number): string {
  return 'data:image/svg+xml,' + encodeURIComponent(clusterSvg(count));
}
