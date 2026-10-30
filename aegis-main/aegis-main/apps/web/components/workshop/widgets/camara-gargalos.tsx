'use client';

/**
 * camara_gargalos — GARGALOS da câmara em CARDS, ancorados em evidência + ATIVAÇÃO.
 *
 * Cada gargalo é um CARD escaneável: nº da demanda (mono) + TENDÊNCIA (X% vs ano
 * anterior, subindo/caindo) + barra de atendimento (oferta×demanda) + sparkline de
 * recorrência (com o pico marcado) + VÍNCULOS (quem mais cobra, bairros afetados) +
 * consequência + EVIDÊNCIA clicável (requerimentos → SISCAM). A tendência responde
 * "está piorando ou melhorando?"; os vínculos, "quem, onde, ligando a quê".
 *
 * DESIGN: cantos retos (0px), azul-aço único acento, JetBrains Mono nos números, sem
 * emoji (lucide), cor semântica (subindo=âmbar/piora, caindo=verde/melhora) separada
 * do acento. Grid responsivo (auto-fill). Dado 100% do config (camara.dashboard assa).
 */
import * as React from 'react';
import {
  MapPin, User, ExternalLink, TrendingUp, TrendingDown, Minus,
  Bell, Network, Cctv, Workflow, Plug, LayoutDashboard, Radar, Bot, type LucideIcon,
} from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Autor = { nome: string; n: number };
type Ev = { label: string; url: string };
type Tend = { pct: number; de: string; para: string; lv?: number; pv?: number };
type Sugestao = { label: string; detail?: string; icon?: string };
type Gargalo = {
  problema: string;
  categoria: string;
  demanda: number;
  atendido_pct: number;
  pendentes_pct?: number;
  span?: string;
  recorrente?: boolean;
  consequencia?: string;
  tendencia?: Tend | null;
  tendencias?: Record<string, Tend>;
  pico?: { ano: string; n: number } | null;
  anos?: Record<string, number>;
  autores?: Autor[];
  bairros?: string[];
  evidencias?: Ev[];
  sugestoes?: Sugestao[];
};

/** Seletor de janela temporal (mês/trimestre/ano) — default MÊS. Compartilhado
 *  pelos widgets de KPI da câmara. Cantos retos, azul-aço no ativo. */
export const TF_WINDOWS = [['mes', 'Mês'], ['trimestre', 'Trim.'], ['ano', 'Ano']] as const;
export type TFWin = 'mes' | 'trimestre' | 'ano';
export function TimeFrameToggle({ win, setWin }: { win: TFWin; setWin: (w: TFWin) => void }) {
  return (
    <div className="flex border border-border-light shrink-0" role="group" aria-label="Período">
      {TF_WINDOWS.map(([k, lbl]) => (
        <button
          key={k}
          type="button"
          onClick={() => setWin(k)}
          aria-pressed={win === k}
          className={`px-2 h-6 text-[10px] uppercase tracking-wide leading-none border-r border-border-light last:border-r-0 ${
            win === k ? 'bg-primary text-white' : 'bg-canvas-light text-muted-on-light hover:bg-raised-light'
          }`}
        >
          {lbl}
        </button>
      ))}
    </div>
  );
}

/** Ícones das SOLUÇÕES AEGIS (peças da stack) — cada tipo de solução, seu ícone. */
const SUG_ICONS: Record<string, LucideIcon> = {
  cctv: Cctv, workflow: Workflow, plug: Plug, map: MapPin,
  dashboard: LayoutDashboard, radar: Radar, bot: Bot, bell: Bell, network: Network,
};
type Cfg = { title?: string; panorama?: string; gargalos?: Gargalo[] };

/** Sparkline por ano, com a barra do PICO destacada (azul-aço cheio). */
function Sparkline({ anos, pico }: { anos?: Record<string, number>; pico?: { ano: string } | null }) {
  const entries = Object.entries(anos ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length < 2) return null;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="flex items-end gap-[2px] h-8" title="Requerimentos por ano">
      {entries.map(([y, v]) => (
        <div
          key={y}
          title={`${y}: ${v}`}
          className={pico?.ano === y ? 'w-[4px] bg-primary' : 'w-[4px] bg-primary/40'}
          style={{ height: `${Math.max(8, Math.round((100 * v) / max))}%` }}
        />
      ))}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-[1px] bg-raised-light border border-border-light text-text-on-light max-w-full">
      {children}
    </span>
  );
}

/** Tendência: a DIREÇÃO vem do ícone; a COR fica NEUTRA na alta e verde só na
 *  melhora. A severidade (chip no topo) é quem carrega vermelho/laranja — assim a
 *  cor tem significado e a home não vira um mar de vermelho (feedback do dono). */
function Trend({ t }: { t?: Tend | null }) {
  if (!t) return null;
  const up = t.pct > 3;
  const down = t.pct < -3;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const cls = down ? 'text-success' : 'text-muted-on-light';
  const word = up ? 'subindo' : down ? 'caindo' : 'estável';
  return (
    <div className={`flex flex-col items-end ${cls}`} title={`${t.de} → ${t.para}: ${t.pv} → ${t.lv}`}>
      <span className="flex items-center gap-1 font-mono text-[15px] font-semibold tabular-nums leading-none">
        <Icon className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
        {t.pct > 0 ? '+' : ''}{t.pct}%
      </span>
      <span className="text-[9px] uppercase tracking-wide">{word} · {t.de}→{t.para}</span>
    </div>
  );
}

/** Severidade DERIVADA dos valores (atendimento + tendência + peso do volume) — a
 *  cor serve à leitura: vermelho = a cidade NÃO dá conta (oportunidade de solução),
 *  laranja = pressão crescente, verde = sob controle. UMA cor forte por card. */
type Sev = { label: string; color: string };
const _SEV_CRIT: Sev = { label: 'Crítico', color: '#C8341F' };
const _SEV_WATCH: Sev = { label: 'Atenção', color: '#B5610E' };
const _SEV_OK: Sev = { label: 'Sob controle', color: '#2E7D46' };
function severity(g: Gargalo, maxDemanda: number): Sev {
  const att = g.atendido_pct ?? 100;
  const tr = g.tendencia?.pct ?? 0;
  const share = maxDemanda > 0 ? g.demanda / maxDemanda : 0;
  // Crítico = a oportunidade mais clara p/ a prefeitura: crescimento explosivo (a
  // capacidade não acompanha) OU baixo atendimento (a cidade não dá conta hoje).
  if (tr > 150 || att < 55) return _SEV_CRIT;
  let score = 0;
  if (att < 78) score += 1;
  if (tr > 60) score += 2;
  else if (tr > 20) score += 1;
  if (share > 0.5) score += 1;
  if (score >= 3) return _SEV_CRIT;
  if (score >= 1) return _SEV_WATCH;
  return _SEV_OK;
}

function SevChip({ sev }: { sev: Sev }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-[2px] border shrink-0"
      style={{ color: sev.color, borderColor: `${sev.color}55`, background: `${sev.color}12` }}
    >
      <span className="w-1.5 h-1.5 shrink-0" style={{ background: sev.color }} aria-hidden />
      {sev.label}
    </span>
  );
}

function GargaloCard({ g, maxDemanda, win }: { g: Gargalo; maxDemanda: number; win: TFWin }) {
  const pct = Math.max(0, Math.min(100, Math.round(g.atendido_pct)));
  const sev = severity(g, maxDemanda);
  // Tendência da JANELA selecionada; sem dado no período, cai na anual (o rótulo de→para
  // sempre diz o período real). A severidade fica na anual (estrutural, estável).
  const tend = (g.tendencias && g.tendencias[win]) || g.tendencia || null;
  // Barra de atendimento colorida pelo VALOR: bem atendido=verde, parcial=laranja,
  // pouco atendido=vermelho. A cor reforça "a cidade responde ou não?".
  const barColor = pct >= 78 ? '#2E7D46' : pct >= 55 ? '#B5610E' : '#C8341F';
  return (
    <div className="bg-white border border-border-light p-3 flex flex-col gap-2">
      {/* cabeçalho: problema + categoria + SEVERIDADE (única cor forte do card).
          Sem ícone repetido no título — a severidade e a categoria já orientam. */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-on-light leading-tight line-clamp-2">{g.problema}</p>
          <p className="text-[10px] text-muted-on-light mt-0.5">
            {g.categoria}
            {g.recorrente && <span className="text-primary"> · recorrente</span>}
            {g.span && <span> · {g.span}</span>}
          </p>
        </div>
        <SevChip sev={sev} />
      </div>

      {/* ATIVAÇÃO: demanda + tendência ano-a-ano */}
      <div className="flex items-end justify-between gap-2 border-t border-border-light pt-2">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-[26px] leading-none text-text-on-light tabular-nums">{g.demanda}</span>
          <span className="text-[9px] uppercase text-muted-on-light">pedidos</span>
        </div>
        <Trend t={tend} />
      </div>

      {/* oferta × demanda + recorrência (sparkline com pico) */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <div className="h-1.5 bg-raised-light" title={`${pct}% atendidos`}>
            <div className="h-full" style={{ width: `${pct}%`, background: barColor }} />
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[9px] font-mono text-muted-on-light tabular-nums">{pct}% atendidos</span>
            {g.pendentes_pct != null && (
              <span className="text-[9px] font-mono text-muted-on-light tabular-nums">{g.pendentes_pct}% pend./neg.</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <Sparkline anos={g.anos} pico={g.pico} />
          {g.pico && (
            <span className="text-[9px] font-mono text-muted-on-light tabular-nums">pico {g.pico.ano}·{g.pico.n}</span>
          )}
        </div>
      </div>

      {/* VÍNCULOS: quem mais cobra + bairros */}
      {((g.autores ?? []).length > 0 || (g.bairros ?? []).length > 0) && (
        <div className="border-t border-border-light pt-2 flex flex-col gap-1.5">
          {(g.autores ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[9px] uppercase tracking-wide text-muted-on-light mr-0.5">cobra</span>
              {(g.autores ?? []).slice(0, 3).map((a) => (
                <Chip key={a.nome}>
                  <User className="w-2.5 h-2.5 text-muted-on-light shrink-0" aria-hidden />
                  <span className="truncate max-w-[110px]">{a.nome}</span>
                  <b className="font-mono text-primary tabular-nums">{a.n}</b>
                </Chip>
              ))}
            </div>
          )}
          {(g.bairros ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[9px] uppercase tracking-wide text-muted-on-light mr-0.5">onde</span>
              {(g.bairros ?? []).slice(0, 4).map((b) => (
                <Chip key={b}>
                  <MapPin className="w-2.5 h-2.5 text-muted-on-light shrink-0" aria-hidden />
                  <span className="truncate max-w-[110px]">{b}</span>
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {g.consequencia && (
        <p className="text-[11px] text-muted-on-light leading-snug line-clamp-2">{g.consequencia}</p>
      )}

      {/* ATIVAÇÃO — como usar o AEGIS neste gargalo (o pitch de solução p/ a prefeitura).
          Sugestões DERIVADAS do perfil do gargalo pelo skill; ícones variados. */}
      {(g.sugestoes ?? []).length > 0 && (
        <div className="border-t border-border-light pt-2 flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-wide text-primary font-semibold">Resolver com o AEGIS</span>
          {(g.sugestoes ?? []).slice(0, 3).map((s, i) => {
            const Ico = SUG_ICONS[s.icon ?? ''] ?? Network;
            return (
              <div key={i} className="flex items-start gap-1.5" title={s.detail}>
                <Ico className="w-3 h-3 text-primary shrink-0 mt-[1px]" strokeWidth={1.75} aria-hidden />
                <span className="text-[10px] text-text-on-light leading-snug">{s.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {(g.evidencias ?? []).length > 0 && (
        <div className="border-t border-border-light pt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="text-[9px] uppercase tracking-wide text-muted-on-light">fonte</span>
          {(g.evidencias ?? []).slice(0, 3).map((e) => (
            <a
              key={e.url}
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              {e.label}
              <ExternalLink className="w-2.5 h-2.5" aria-hidden />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function GargalosPanel({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const gargs = cfg.gargalos ?? [];
  const [win, setWin] = React.useState<TFWin>('mes');
  const maxDemanda = Math.max(...gargs.map((g) => g.demanda), 1);
  return (
    <div className="bg-panel-light border border-border-light flex flex-col">
      <div className="min-h-8 px-3 py-1.5 border-b border-border-light flex items-center justify-between gap-3 bg-raised-light/40 shrink-0">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-on-light">
          {cfg.title ?? 'Gargalos'}
        </span>
        <div className="flex items-center gap-3">
          {cfg.panorama && (
            <span className="text-[10px] font-mono text-muted-on-light tabular-nums text-right hidden sm:inline">{cfg.panorama}</span>
          )}
          <TimeFrameToggle win={win} setWin={setWin} />
        </div>
      </div>
      {gargs.length === 0 ? (
        <div className="p-4 text-[11px] text-muted-on-light italic">
          Rode <span className="text-primary">Montar dashboard</span> para a IA apontar os gargalos.
        </div>
      ) : (
        <div
          className="p-2 grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
        >
          {gargs.map((g, i) => <GargaloCard key={i} g={g} maxDemanda={maxDemanda} win={win} />)}
        </div>
      )}
    </div>
  );
}

// `gargalos` é DADO assado pelo skill camara.dashboard (não editável à mão) — por isso
// só título/panorama entram no Inspetor; o array vive no props e é re-gerado a cada run.
const SCHEMA = [
  { name: 'title', label: 'Título', field: 'string' as const },
  { name: 'panorama', label: 'Panorama (linha-resumo)', field: 'string' as const },
];

registerWidget('camara_gargalos', GargalosPanel, {
  group: 'content',
  label: 'Gargalos (câmara)',
  description: 'Cards de gargalos com ativação: demanda, tendência ano-a-ano, atendimento, recorrência, quem cobra, bairros e evidências.',
  icon: 'target',
  defaultColSpan: 20,
  config_schema: SCHEMA,
  mockConfig: {
    title: 'Gargalos identificados pela IA',
    panorama: '6000 docs · 91% atendidos · 20 categorias',
    gargalos: [{
      problema: 'Lâmpadas queimadas na iluminação pública', categoria: 'Iluminação Pública',
      demanda: 228, atendido_pct: 96, pendentes_pct: 4, span: '2017–2026', recorrente: true,
      consequencia: 'Compromete a segurança noturna e a qualidade de vida.',
      tendencia: { pct: 13, de: '2024', para: '2025', lv: 61, pv: 54 },
      pico: { ano: '2025', n: 61 },
      anos: { '2022': 27, '2023': 54, '2024': 40, '2025': 61, '2026': 29 },
      autores: [{ nome: 'Marina Nalesso', n: 28 }, { nome: 'Catarina Motta', n: 31 }],
      bairros: ['Pescaria', 'Chapadinha', 'Parque Itapê'],
      evidencias: [{ label: 'Req 438/2025', url: '#' }, { label: 'Req 404/2025', url: '#' }],
    }],
  },
  mockVariables: {},
});
