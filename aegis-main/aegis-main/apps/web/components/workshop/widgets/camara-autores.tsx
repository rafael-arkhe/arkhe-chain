'use client';

/**
 * camara_autores — "quem mais cobra": cada autor com total de pedidos (barra) + os
 * TEMAS que puxa (categorias que mais aciona, com contagem = VÍNCULO quem→o quê) +
 * nº de frentes. Substitui o texto markdown. Dado do camara.dashboard.
 */
import { User } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Tema = { cat: string; n: number };
type Aut = { nome: string; total: number; foco?: string; temas?: Tema[]; n_categorias?: number };
type Cfg = { title?: string; autores?: Aut[] };

function Autores({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const auts = cfg.autores ?? [];
  const max = Math.max(...auts.map((a) => a.total), 1);
  return (
    <div className="bg-white border border-border-light flex flex-col">
      <div className="min-h-8 px-3 py-1.5 border-b border-border-light bg-raised-light/40 shrink-0">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-on-light">
          {cfg.title ?? 'Quem mais cobra'}
        </span>
      </div>
      {auts.length === 0 ? (
        <div className="p-4 text-[11px] text-muted-on-light italic">Rode Organizar + Montar dashboard.</div>
      ) : (
        <div className="p-2 flex flex-col gap-2">
          {auts.map((a, i) => (
            <div key={i} className="flex flex-col gap-1 border-b border-border-light/60 last:border-b-0 pb-1.5 last:pb-0">
              <div className="flex items-center gap-2">
                <User className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="flex-1 truncate text-[12px] text-text-on-light" title={a.nome}>{a.nome}</span>
                <span className="font-mono text-[13px] text-text-on-light tabular-nums">{a.total}</span>
                <span className="text-[9px] uppercase text-muted-on-light">pedidos</span>
              </div>
              <div className="ml-5 h-1.5 bg-raised-light" title={`${a.total} pedidos`}>
                <div className="h-full bg-primary" style={{ width: `${Math.round((100 * a.total) / max)}%` }} />
              </div>
              {(a.temas ?? []).length > 0 && (
                <div className="ml-5 flex flex-wrap items-center gap-1">
                  {(a.temas ?? []).slice(0, 3).map((tm) => (
                    <span
                      key={tm.cat}
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-[1px] bg-raised-light border border-border-light text-text-on-light"
                    >
                      <span className="truncate max-w-[130px]">{tm.cat}</span>
                      <b className="font-mono text-primary tabular-nums">{tm.n}</b>
                    </span>
                  ))}
                  {a.n_categorias != null && a.n_categorias > 3 && (
                    <span className="text-[9px] text-muted-on-light">+{a.n_categorias - 3} frentes</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

registerWidget('camara_autores', Autores, {
  group: 'content',
  label: 'Quem mais cobra (câmara)',
  description: 'Autores por volume de pedidos + os temas que mais acionam (vínculo quem→o quê).',
  icon: 'users',
  defaultColSpan: 9,
  config_schema: [{ name: 'title', label: 'Título', field: 'string' as const }],
  mockConfig: {
    title: 'Quem mais cobra (autores)',
    autores: [
      { nome: 'Chefe do Poder Executivo', total: 1330, foco: 'Tributos e Finanças', n_categorias: 12,
        temas: [{ cat: 'Tributos e Finanças', n: 353 }, { cat: 'Educação', n: 81 }, { cat: 'Saúde', n: 63 }] },
      { nome: 'Marina Nalesso Mariano', total: 430, foco: 'Saúde', n_categorias: 8,
        temas: [{ cat: 'Saúde', n: 122 }, { cat: 'Educação', n: 54 }, { cat: 'Iluminação', n: 28 }] },
    ],
  },
  mockVariables: {},
});
