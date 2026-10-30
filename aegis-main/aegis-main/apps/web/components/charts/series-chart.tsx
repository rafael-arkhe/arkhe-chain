'use client';

/**
 * SeriesChart — renderizador SVG nativo (barras/linha/pizza) de uma série
 * categórica `{label, value}[]`. Sem lib externa (o codebase não tem
 * recharts/visx); mesmo idioma dos widgets de viz (chart-xy/slate-chart).
 *
 * Extraído do card de Gráfico do Quiver (Onda 19) p/ ser COMPARTILHADO entre
 * o Quiver (distribuição group-by) e o Time Series (contagem por bucket
 * temporal) — uma única fonte p/ bar/line/pie. Pizza não existia no codebase.
 */
import * as React from 'react';

export type SeriesChartType = 'bar' | 'line' | 'pie';
export interface SeriesPoint {
  label: string;
  value: number;
}

// Paleta categórica (sem hierarquia). 1ª cor = primary do tema como HEX literal
// — `var(--primary)` NÃO é custom property (é cor Tailwind/accent-color), então
// em fill/backgroundColor inline não resolveria.
export const CHART_PALETTE = ['#2d77be', '#7e22ce', '#0e7490', '#3D9F58', '#E8B33B', '#C8341F', '#8A93A0', '#4A8FD1'];

export function SeriesChart({ type, series }: { type: SeriesChartType; series: SeriesPoint[] }) {
  return type === 'pie' ? <PieChartSVG series={series} /> : <BarLineSVG type={type} series={series} />;
}

// Rótulos do eixo Y: passos INTEIROS p/ faixas pequenas (contagens — o caso
// comum), evitando duplicatas tipo "2,2" do arredondamento de 5 frações fixas.
function niceTicks(top: number): number[] {
  if (top <= 0) return [0, 1];
  if (top <= 6) return Array.from({ length: top + 1 }, (_, i) => i);
  const step = Math.ceil(top / 4);
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  if (out[out.length - 1] !== top) out.push(top);
  return out;
}

// Resumo textual da série p/ leitores de tela (acessibilidade).
function seriesSummary(kind: string, series: SeriesPoint[]): string {
  const head = series.slice(0, 12).map((s) => `${s.label}: ${s.value.toLocaleString('pt-BR')}`).join(', ');
  return `${kind} — ${head}${series.length > 12 ? ` (+${series.length - 12})` : ''}`;
}

function BarLineSVG({ type, series }: { type: 'bar' | 'line'; series: SeriesPoint[] }) {
  const W = 480, H = 200, padL = 40, padR = 12, padT = 12, padB = 36;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = series.length;
  const maxY = Math.max(...series.map((s) => s.value), 0);
  const top = maxY > 0 ? maxY : 1; // denominador da escala + base dos ticks (evita 5 zeros)
  const scaleY = (v: number) => padT + innerH - (v / top) * innerH;
  const bandW = innerW / Math.max(1, n);
  const xBar = (i: number) => padL + (i + 0.5) * bandW;
  const xLine = (i: number) => padL + (n > 1 ? i * (innerW / (n - 1)) : innerW / 2);
  const xAt = (i: number) => (type === 'bar' ? xBar(i) : xLine(i));
  const barW = Math.max(4, bandW * 0.66);
  const ticks = niceTicks(top);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" data-testid="chart-svg"
      role="img" aria-label={seriesSummary(type === 'bar' ? 'Gráfico de barras' : 'Gráfico de linha', series)}>
      {ticks.map((v, i) => (
        <line key={i} x1={padL} x2={W - padR} y1={scaleY(v)} y2={scaleY(v)}
          stroke="currentColor" strokeWidth={0.5} className="text-border-light" />
      ))}
      {ticks.map((v, i) => (
        <text key={i} x={padL - 6} y={scaleY(v) + 3} textAnchor="end" fontSize={9}
          fontFamily="ui-monospace, monospace" className="fill-muted-on-light">
          {v.toLocaleString('pt-BR')}
        </text>
      ))}
      {type === 'bar' && series.map((s, i) => {
        const y = scaleY(s.value);
        return <rect key={i} x={xBar(i) - barW / 2} y={y} width={barW} height={Math.max(0, innerH - (y - padT))}
          className="fill-primary" data-testid="chart-bar" />;
      })}
      {/* polilinha só com ≥2 pontos (1 ponto vira só o círculo, não uma linha degenerada) */}
      {type === 'line' && n > 1 && (
        <polyline fill="none" stroke="currentColor" strokeWidth={2} className="text-primary"
          points={series.map((s, i) => `${xLine(i)},${scaleY(s.value)}`).join(' ')} />
      )}
      {type === 'line' && series.map((s, i) => (
        <circle key={i} cx={xLine(i)} cy={scaleY(s.value)} r={2.5} className="fill-primary" data-testid="chart-point" />
      ))}
      {series.map((s, i) => (
        <text key={i} x={xAt(i)} y={H - padB + 14} textAnchor="middle" fontSize={9}
          fontFamily="ui-monospace, monospace" className="fill-muted-on-light">
          {s.label.length > 8 ? s.label.slice(0, 7) + '…' : s.label}
        </text>
      ))}
    </svg>
  );
}

function PieChartSVG({ series }: { series: SeriesPoint[] }) {
  const total = series.reduce((a, s) => a + (s.value > 0 ? s.value : 0), 0);
  if (total <= 0) return <span className="text-[11px] text-muted-on-light italic">sem dados positivos para a pizza.</span>;
  const R = 70, cx = 80, cy = 80;
  let acc = 0;
  const arcs = series.map((s, i) => {
    const v = s.value > 0 ? s.value : 0;
    const frac = v / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    // categoria única (frac≈1) → círculo cheio via 2 semicírculos (arco 360° é degenerado).
    const d = frac >= 0.999
      ? `M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy} A ${R} ${R} 0 1 1 ${cx - R} ${cy} Z`
      : `M ${cx} ${cy} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
    return { d, color: CHART_PALETTE[i % CHART_PALETTE.length], label: s.label, value: v, frac };
  });
  return (
    <div className="flex items-center gap-4">
      <svg width={160} height={160} viewBox="0 0 160 160" data-testid="chart-svg" className="shrink-0"
        role="img" aria-label={seriesSummary('Gráfico de pizza', series)}>
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} stroke="currentColor" strokeWidth={1}
            className="text-canvas-light" data-testid="chart-slice" />
        ))}
      </svg>
      <ul className="text-[11px] space-y-1 min-w-0">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 shrink-0" style={{ backgroundColor: a.color }} />
            <span className="truncate">{a.label}</span>
            <span className="ml-auto pl-2 font-mono text-muted-on-light tabular-nums">{a.value.toLocaleString('pt-BR')} · {Math.round(a.frac * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MultiSeriesChart — sobreposição de N séries (linha) ou barras agrupadas,    */
/* compartilhando o eixo X (união ordenada dos rótulos). É a capacidade        */
/* "multi-métrica" do Slate (de-jargonizada): o visor sobrepõe várias          */
/* propriedades timeseries de uma instância no mesmo gráfico. Reusa niceTicks. */
export interface NamedSeries {
  name: string;
  color?: string;
  points: SeriesPoint[];
}

export function MultiSeriesChart({ type, series }: { type: 'line' | 'bar'; series: NamedSeries[] }) {
  const W = 540, H = 220, padL = 44, padR = 12, padT = 12, padB = 40;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  // eixo X = união ordenada dos rótulos (timestamps ISO ordenam cronologicamente).
  const cats = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.label)))).sort();
  const catIdx = new Map(cats.map((c, i) => [c, i]));
  const nc = cats.length;
  const maxY = Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const top = maxY > 0 ? maxY : 1;
  const scaleY = (v: number) => padT + innerH - (v / top) * innerH;
  const ticks = niceTicks(top);
  const xLine = (i: number) => padL + (nc > 1 ? i * (innerW / (nc - 1)) : innerW / 2);
  const bandW = innerW / Math.max(1, nc);
  const ns = series.length;
  const colorOf = (i: number, s: NamedSeries) => s.color || CHART_PALETTE[i % CHART_PALETTE.length];
  const aria = `Gráfico multi-série (${type === 'line' ? 'linhas' : 'barras'}): ` +
    series.map((s) => `${s.name} (${s.points.length} pts)`).join(', ');

  if (nc === 0) return <span className="text-[11px] text-muted-on-light italic">sem pontos.</span>;

  return (
    <div className="flex flex-col gap-2" data-testid="multi-series">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" data-testid="chart-svg" role="img" aria-label={aria}>
        {ticks.map((v, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={scaleY(v)} y2={scaleY(v)} stroke="currentColor" strokeWidth={0.5} className="text-border-light" />
        ))}
        {ticks.map((v, i) => (
          <text key={i} x={padL - 6} y={scaleY(v) + 3} textAnchor="end" fontSize={9} fontFamily="ui-monospace, monospace" className="fill-muted-on-light">{v.toLocaleString('pt-BR')}</text>
        ))}
        {/* séries */}
        {type === 'line' && series.map((s, si) => {
          const pts = s.points.filter((p) => catIdx.has(p.label)).sort((a, b) => a.label.localeCompare(b.label));
          const color = colorOf(si, s);
          return (
            <g key={si}>
              {pts.length > 1 && (
                <polyline fill="none" stroke={color} strokeWidth={2}
                  points={pts.map((p) => `${xLine(catIdx.get(p.label)!)},${scaleY(p.value)}`).join(' ')} />
              )}
              {pts.map((p, j) => <circle key={j} cx={xLine(catIdx.get(p.label)!)} cy={scaleY(p.value)} r={2.2} fill={color} data-testid="ms-point" />)}
            </g>
          );
        })}
        {type === 'bar' && series.map((s, si) => {
          const color = colorOf(si, s);
          const subW = Math.max(2, (bandW * 0.7) / ns);
          return (
            <g key={si}>
              {s.points.filter((p) => catIdx.has(p.label)).map((p, j) => {
                const ci = catIdx.get(p.label)!;
                const x = padL + ci * bandW + bandW * 0.15 + si * subW;
                const y = scaleY(p.value);
                return <rect key={j} x={x} y={y} width={subW} height={Math.max(0, innerH - (y - padT))} fill={color} data-testid="ms-bar" />;
              })}
            </g>
          );
        })}
        {/* rótulos X (no máx ~8 p/ não poluir) */}
        {cats.map((c, i) => {
          const stride = Math.ceil(nc / 8);
          if (i % stride !== 0 && i !== nc - 1) return null;
          return (
            <text key={i} x={xLine(i)} y={H - padB + 14} textAnchor="middle" fontSize={9} fontFamily="ui-monospace, monospace" className="fill-muted-on-light">
              {c.length > 10 ? c.slice(0, 9) + '…' : c}
            </text>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" data-testid="ms-legend">
        {series.map((s, si) => (
          <li key={si} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 shrink-0" style={{ backgroundColor: colorOf(si, s) }} />
            <span className="truncate">{s.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
