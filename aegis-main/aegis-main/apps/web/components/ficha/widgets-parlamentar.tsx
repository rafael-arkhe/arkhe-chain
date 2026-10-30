'use client';

/**
 * Widgets dedicados à ficha de PARLAMENTAR (kind="parlamentar").
 *
 * Cada widget lê uma chave específica de `properties` (gerada pelo
 * flow `security.parlamentar-360` no backend):
 *
 *   - WidgetMandato         ← properties.correlations.lookup_camara.head
 *   - WidgetResumo360        ← properties.text (LLM)
 *   - WidgetMidia            ← properties.media[]
 *   - WidgetDocumentosCEAP   ← properties.documents[]  (cota parlamentar)
 *   - WidgetCitacoes         ← properties.citations[]
 *   - WidgetCorrelacoes      ← properties.correlations (todos adapters)
 *
 * Cada widget é registrado em `widgets-parlamentar-register.tsx` que é
 * importado pelo barrel `components/workshop/widgets`.
 */
import * as React from 'react';
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  ListChecks,
  Mail,
  Quote,
  User as UserIcon,
} from 'lucide-react';

import { Widget } from './widget';
import { ModalPortal } from '@/components/ui/modal-backdrop';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */
type Properties = Record<string, unknown> | null | undefined;

type MediaItem = {
  src?: string;
  url?: string;
  page?: string;
  title?: string;
};

type CitationItem = {
  src?: string;
  url?: string;
  title?: string;
};

type DocumentItem = {
  src?: string;
  url?: string;
  title?: string;
  valor?: string | number;
  fornecedor?: string;
  data?: string;
};

type Correlation = {
  tool?: string;
  count?: number;
  head?: Record<string, unknown> | null;
};

type Correlations = Record<string, Correlation>;

function readArray<T>(p: Properties, key: string): T[] {
  if (!p || typeof p !== 'object') return [];
  const v = (p as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function readDict<T>(p: Properties, key: string): Record<string, T> {
  if (!p || typeof p !== 'object') return {};
  const v = (p as Record<string, unknown>)[key];
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, T>)
    : {};
}

function readString(p: Properties, key: string): string | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const v = (p as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

/* -------------------------------------------------------------------------- */
/* Widget · Mandato (cabeçalho do parlamentar)                                */
/* -------------------------------------------------------------------------- */
export function WidgetMandato({ properties }: { properties?: Properties }) {
  const correlations = readDict<Correlation>(properties, 'correlations');
  const head = correlations.lookup_camara?.head as Record<string, unknown> | undefined;

  if (!head) {
    return (
      <Widget title="Mandato" description="Câmara dos Deputados">
        <p className="text-[11px] text-muted-on-light italic">
          Sem registro na Câmara — rode o fluxo Parlamentar 360 ou ative
          o `security.parlamentar-360` antes de buscar este nome.
        </p>
      </Widget>
    );
  }

  const foto = typeof head.thumbnail === 'string' ? head.thumbnail : undefined;
  const nome = String(head.nome ?? head.name ?? '—');
  const partido = String(head.siglaPartido ?? '');
  const uf = String(head.siglaUf ?? '');
  const email = String(head.email ?? '');
  const id = head.id;
  const status = String(head.ultimoStatus ?? head.situacao ?? '—');
  const ufNasc = String(head.ufNascimento ?? '');
  const dataNasc = String(head.dataNascimento ?? '');

  return (
    <Widget title="Mandato" description="Câmara dos Deputados">
      <div className="flex gap-3">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto}
            alt={nome}
            className="w-20 h-24 object-cover border border-border-light bg-raised-light shrink-0"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-20 h-24 border border-border-light bg-raised-light flex items-center justify-center shrink-0">
            <UserIcon className="w-6 h-6 text-muted-on-light" strokeWidth={1.5} />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-[13px] font-semibold text-text-on-light truncate">{nome}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {partido && (
              <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-primary text-primary bg-primary/10">
                {partido}
              </span>
            )}
            {uf && (
              <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-border-light text-muted-on-light bg-raised-light/60">
                {uf}
              </span>
            )}
          </div>
          {email && (
            <a
              href={`mailto:${email}`}
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
            >
              <Mail className="w-3 h-3" strokeWidth={1.5} />
              {email}
            </a>
          )}
          <dl className="grid grid-cols-2 gap-y-0.5 text-[11px] mt-2">
            <dt className="text-muted-on-light font-mono uppercase tracking-wide text-[9px]">ID Câmara</dt>
            <dd className="font-mono">{String(id ?? '—')}</dd>
            {dataNasc && (
              <>
                <dt className="text-muted-on-light font-mono uppercase tracking-wide text-[9px]">Nascimento</dt>
                <dd className="font-mono">
                  {dataNasc.slice(0, 10)}
                  {ufNasc && ` · ${ufNasc}`}
                </dd>
              </>
            )}
            <dt className="text-muted-on-light font-mono uppercase tracking-wide text-[9px]">Situação</dt>
            <dd className="text-[11px]">{status}</dd>
          </dl>
        </div>
      </div>
    </Widget>
  );
}

/* -------------------------------------------------------------------------- */
/* Widget · Resumo executivo 360°                                             */
/* -------------------------------------------------------------------------- */
export function WidgetResumo360({ properties }: { properties?: Properties }) {
  const text = readString(properties, 'text');
  const tokensIn = readString(properties, 'tokens_input');
  const tokensOut = readString(properties, 'tokens_output');
  const inferenceLog = readString(properties, 'inference_log_id');
  if (!text) {
    return (
      <Widget title="Resumo executivo 360°" description="Análise gerada por IA">
        <p className="text-[11px] text-muted-on-light italic">
          Sem resumo gerado ainda.
        </p>
      </Widget>
    );
  }
  return (
    <Widget title="Resumo executivo 360°" description="Análise gerada por IA">
      <div className="space-y-2">
        <p className="text-[12px] text-text-on-light leading-relaxed whitespace-pre-wrap">
          {text}
        </p>
        <div className="pt-2 border-t border-border-light flex items-center gap-3 text-[9px] font-mono uppercase tracking-wide text-muted-on-light">
          <span>IA · inference {String(inferenceLog || '—').slice(0, 8)}</span>
          {tokensIn && <span>· in {tokensIn}</span>}
          {tokensOut && <span>· out {tokensOut}</span>}
        </div>
      </div>
    </Widget>
  );
}

/* -------------------------------------------------------------------------- */
/* Widget · Mídia (grid de imagens dos vídeos/notícias)                       */
/* -------------------------------------------------------------------------- */
export function WidgetMidia({ properties }: { properties?: Properties }) {
  const media = readArray<MediaItem>(properties, 'media');
  if (media.length === 0) {
    return (
      <Widget title="Mídia" description="Imagens, thumbnails e capas">
        <p className="text-[11px] text-muted-on-light italic">
          Sem mídia coletada ainda. Os coletores de YouTube · Imagens BR ·
          notícias preenchem este grid.
        </p>
      </Widget>
    );
  }
  return (
    <Widget title={`Mídia · ${media.length}`} description="Thumbnails e fotos das fontes externas">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {media.map((m, i) => {
          if (!m.url) return null;
          return (
            <a
              key={`${m.url}-${i}`}
              href={m.page || m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block border border-border-light bg-raised-light/30 hover:border-primary"
              title={m.title || m.url}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.url}
                alt={m.title || ''}
                className="w-full aspect-video object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = '0.2';
                }}
              />
              <div className="px-1.5 py-1 flex items-center gap-1">
                <ImageIcon className="w-2.5 h-2.5 text-muted-on-light shrink-0" />
                <span className="text-[10px] font-mono uppercase text-muted-on-light truncate">
                  {m.src || 'fonte'}
                </span>
              </div>
              {m.title && (
                <p className="px-1.5 pb-1.5 text-[11px] text-text-on-light leading-tight line-clamp-2 group-hover:text-primary">
                  {m.title}
                </p>
              )}
            </a>
          );
        })}
      </div>
    </Widget>
  );
}

/* -------------------------------------------------------------------------- */
/* Widget · Cota CEAP (despesas com documentos PDF)                            */
/* -------------------------------------------------------------------------- */
export function WidgetDocumentosCEAP({ properties }: { properties?: Properties }) {
  const docs = readArray<DocumentItem>(properties, 'documents');
  if (docs.length === 0) {
    return (
      <Widget title="Cota parlamentar" description="Notas fiscais e recibos (CEAP)">
        <p className="text-[11px] text-muted-on-light italic">
          Sem despesas coletadas. O coletor `camara_deputado_despesas` popula
          esta lista quando o deputado tem ID Câmara resolvido.
        </p>
      </Widget>
    );
  }
  // Total
  const total = docs.reduce((acc, d) => {
    const v = typeof d.valor === 'string'
      ? parseFloat(d.valor.replace(/\./g, '').replace(',', '.'))
      : (d.valor || 0);
    return acc + (Number.isFinite(v as number) ? (v as number) : 0);
  }, 0);
  return (
    <Widget
      title={`Cota parlamentar · ${docs.length} docs`}
      description={`Total R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
    >
      <table className="w-full text-[11px]">
        <thead className="text-muted-on-light text-[9px] uppercase tracking-wider font-mono">
          <tr className="border-b border-border-light">
            <th className="text-left py-1.5 px-1">Data</th>
            <th className="text-left py-1.5 px-1">Tipo</th>
            <th className="text-left py-1.5 px-1">Fornecedor</th>
            <th className="text-right py-1.5 px-1">Valor</th>
            <th className="py-1.5 px-1 w-6"></th>
          </tr>
        </thead>
        <tbody>
          {docs.slice(0, 30).map((d, i) => (
            <tr key={i} className="border-b border-border-light/40 hover:bg-raised-light/30">
              <td className="py-1 px-1 font-mono text-[10px] text-muted-on-light whitespace-nowrap">
                {(d.data || '').slice(0, 10)}
              </td>
              <td className="py-1 px-1 truncate max-w-[120px]" title={d.title}>
                {d.title || '—'}
              </td>
              <td className="py-1 px-1 truncate max-w-[180px]" title={d.fornecedor}>
                {d.fornecedor || '—'}
              </td>
              <td className="py-1 px-1 text-right font-mono text-[11px] whitespace-nowrap">
                R$ {d.valor || '—'}
              </td>
              <td className="py-1 px-1 text-right">
                {d.url && (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir documento PDF"
                    className="text-muted-on-light hover:text-primary"
                  >
                    <FileText className="w-3 h-3 inline" strokeWidth={1.5} />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {docs.length > 30 && (
        <p className="text-[10px] text-muted-on-light italic mt-2">
          … e mais {docs.length - 30} documentos.
        </p>
      )}
    </Widget>
  );
}

/* -------------------------------------------------------------------------- */
/* Widget · Citações (links externos)                                          */
/* -------------------------------------------------------------------------- */
export function WidgetCitacoes({ properties }: { properties?: Properties }) {
  const citations = readArray<CitationItem>(properties, 'citations');
  if (citations.length === 0) {
    return (
      <Widget title="Citações" description="Menções nas fontes externas">
        <p className="text-[11px] text-muted-on-light italic">
          Sem citações ainda. GDELT, Tavily, Bluesky, Reddit e Câmara
          populam estes links.
        </p>
      </Widget>
    );
  }
  return (
    <Widget title={`Citações · ${citations.length}`} description="Links externos pra cada fonte">
      <ul className="space-y-1.5">
        {citations.slice(0, 25).map((c, i) => (
          <li key={i} className="flex items-baseline gap-2 text-[11px]">
            <Quote className="w-2.5 h-2.5 text-muted-on-light shrink-0 mt-0.5" />
            <span className="px-1 py-0 text-[9px] font-mono uppercase tracking-wide border border-border-light text-muted-on-light bg-raised-light/40 shrink-0">
              {c.src}
            </span>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-text-on-light hover:text-primary truncate inline-flex items-center gap-1"
              title={c.url}
            >
              <span className="truncate">{c.title || c.url}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" strokeWidth={1.5} />
            </a>
          </li>
        ))}
        {citations.length > 25 && (
          <li className="text-[10px] text-muted-on-light italic pt-1 border-t border-border-light">
            … e mais {citations.length - 25} citações.
          </li>
        )}
      </ul>
    </Widget>
  );
}

/* -------------------------------------------------------------------------- */
/* Widget · Correlações (todos os adapters MCP rodados)                       */
/* -------------------------------------------------------------------------- */
export function WidgetCorrelacoes({ properties }: { properties?: Properties }) {
  const correlations = readDict<Correlation>(properties, 'correlations');
  const entries = Object.entries(correlations);
  if (entries.length === 0) {
    return (
      <Widget title="Correlações" description="Coletores que cruzaram este nome">
        <p className="text-[11px] text-muted-on-light italic">
          Nenhum coletor rodou ainda.
        </p>
      </Widget>
    );
  }
  const withHits = entries.filter(([, c]) => (c.count ?? 0) > 0);
  const empty = entries.filter(([, c]) => !c.count);
  return (
    <Widget
      title={`Correlações · ${entries.length} fontes`}
      description={`${withHits.length} com resultados · ${empty.length} sem`}
    >
      <table className="w-full text-[11px]">
        <thead className="text-muted-on-light text-[9px] uppercase tracking-wider font-mono">
          <tr className="border-b border-border-light">
            <th className="text-left py-1.5 px-1">Fonte</th>
            <th className="text-left py-1.5 px-1">Tool</th>
            <th className="text-right py-1.5 px-1">Hits</th>
          </tr>
        </thead>
        <tbody>
          {entries
            .sort(([, a], [, b]) => (b.count ?? 0) - (a.count ?? 0))
            .map(([nid, c]) => {
              const hits = c.count ?? 0;
              return (
                <tr key={nid} className="border-b border-border-light/40">
                  <td className="py-1 px-1 font-mono text-[11px]">{nid}</td>
                  <td className="py-1 px-1 font-mono text-[10px] text-muted-on-light truncate max-w-[180px]">
                    {c.tool || '—'}
                  </td>
                  <td className="py-1 px-1 text-right">
                    {hits > 0 ? (
                      <span className="px-1.5 py-0 text-[10px] font-mono text-success border border-success/40 bg-success/10">
                        {hits}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-muted-on-light">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </Widget>
  );
}

/* -------------------------------------------------------------------------- */
/* Widget · Histórico legislativo                                              */
/* -------------------------------------------------------------------------- */
export function WidgetHistoricoLegislativo({ properties }: { properties?: Properties }) {
  const correlations = readDict<Correlation>(properties, 'correlations');
  const proposicoes = correlations.proposicoes;
  const votacoes = correlations.votacoes;
  const eventos = correlations.eventos;
  const despesas = correlations.despesas;
  const stats = [
    { label: 'Proposições autorais', value: proposicoes?.count ?? 0, tool: 'camara_proposicoes' },
    { label: 'Votações registradas', value: votacoes?.count ?? 0, tool: 'camara_votacoes' },
    { label: 'Eventos / agenda', value: eventos?.count ?? 0, tool: 'camara_eventos' },
    { label: 'Despesas CEAP', value: despesas?.count ?? 0, tool: 'camara_despesas' },
  ];
  return (
    <Widget title="Atividade legislativa" description="Câmara dos Deputados">
      <dl className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="border border-border-light bg-raised-light/30 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono">
              {s.label}
            </dt>
            <dd className="text-[18px] font-semibold text-text-on-light leading-tight mt-0.5">
              {s.value.toLocaleString('pt-BR')}
            </dd>
            <p className="text-[9px] font-mono text-muted-on-light mt-0.5">{s.tool}</p>
          </div>
        ))}
      </dl>
    </Widget>
  );
}

/* -------------------------------------------------------------------------- */
/* Widget · Redes sociais                                                      */
/* -------------------------------------------------------------------------- */
export function WidgetRedesSociais({ properties }: { properties?: Properties }) {
  const correlations = readDict<Correlation>(properties, 'correlations');
  const rows: { label: string; tool: string; count: number; head?: Record<string, unknown> | null }[] = [
    { label: 'YouTube', tool: 'youtube_search@v1', count: correlations.youtube?.count ?? 0, head: correlations.youtube?.head },
    { label: 'Bluesky', tool: 'bluesky_search_posts@v1', count: correlations.bluesky?.count ?? 0, head: correlations.bluesky?.head },
    { label: 'Reddit', tool: 'reddit_search@v1', count: correlations.reddit?.count ?? 0, head: correlations.reddit?.head },
  ];
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <Widget title="Redes sociais" description={`${total} menções agregadas`}>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center gap-2 text-[11px] border-l-2 border-l-primary/60 pl-2 py-1"
          >
            <LinkIcon className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
            <span className="font-medium w-20 shrink-0">{r.label}</span>
            <span className="font-mono text-[10px] text-muted-on-light flex-1 truncate">
              {(r.head?.title as string) || (r.head?.handle as string) || (r.head?.channel as string) || r.tool}
            </span>
            <span
              className={
                r.count > 0
                  ? 'px-1.5 py-0 text-[10px] font-mono text-success border border-success/40 bg-success/10'
                  : 'px-1.5 py-0 text-[10px] font-mono text-muted-on-light border border-border-light bg-raised-light/40'
              }
            >
              {r.count}
            </span>
          </li>
        ))}
      </ul>
    </Widget>
  );
}

/* -------------------------------------------------------------------------- */
/* Widget · Cronologia integrada                                              */
/* -------------------------------------------------------------------------- */
/**
 * Mescla datas de várias fontes em uma timeline única — eventos da
 * Câmara, despesas CEAP, posts Bluesky, notícias. Cada entrada vira um
 * card cronológico com badge da fonte + link externo quando disponível.
 */
export function WidgetCronologiaIntegrada({ properties }: { properties?: Properties }) {
  type Evt = {
    date: string;       // ISO ou yyyy-mm-dd
    src: string;
    title: string;
    body?: string;
    url?: string;
    valor?: string | number;
  };
  const correlations = readDict<Correlation>(properties, 'correlations');
  const docs = readArray<DocumentItem>(properties, 'documents');
  const events: Evt[] = [];

  // Despesas → entry por documento
  for (const d of docs) {
    if (!d.data) continue;
    events.push({
      date: d.data,
      src: 'CEAP',
      title: `${d.title || 'Despesa'} · ${d.fornecedor || ''}`,
      valor: d.valor,
      url: d.url,
    });
  }
  // Eventos da Câmara (head só tem 1; tira do correlations)
  const ev = correlations.eventos?.head;
  if (ev && typeof ev === 'object') {
    const r = ev as Record<string, unknown>;
    const date = (r.dataHoraInicio || r.data) as string | undefined;
    if (date) {
      events.push({
        date,
        src: 'Câmara',
        title: String(r.descricao || r.name || 'Evento Câmara'),
        url: (r.uri || r.url) as string | undefined,
      });
    }
  }
  // Bluesky head
  const bs = correlations.bluesky?.head;
  if (bs && typeof bs === 'object') {
    const r = bs as Record<string, unknown>;
    const date = r.createdAt as string | undefined;
    if (date) {
      events.push({
        date,
        src: 'Bluesky',
        title: `Post de @${r.handle ?? r.displayName ?? '—'}`,
        body: r.displayName as string | undefined,
      });
    }
  }
  // Ordena desc
  events.sort((a, b) => (b.date.slice(0, 10).localeCompare(a.date.slice(0, 10))));

  if (events.length === 0) {
    return (
      <Widget title="Cronologia integrada" description="Eventos + CEAP + redes mescladas">
        <p className="text-[11px] text-muted-on-light italic">
          Sem datas pra cronologia.
        </p>
      </Widget>
    );
  }
  return (
    <Widget
      title={`Cronologia integrada · ${events.length}`}
      description="Eventos, despesas e posts ordenados por data"
    >
      <ul className="space-y-1.5">
        {events.slice(0, 30).map((e, i) => (
          <li
            key={i}
            className="flex items-start gap-3 text-[11px] border-l-2 border-l-primary pl-3 py-1"
          >
            <span className="font-mono text-[10px] text-muted-on-light w-20 shrink-0">
              {e.date.slice(0, 10)}
            </span>
            <span className="px-1.5 py-0 text-[9px] font-mono uppercase tracking-wide border border-border-light bg-raised-light/40 text-muted-on-light shrink-0">
              {e.src}
            </span>
            <span className="flex-1 min-w-0">
              {e.url ? (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-on-light hover:text-primary truncate inline-flex items-center gap-1"
                >
                  <span className="truncate">{e.title}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" strokeWidth={1.5} />
                </a>
              ) : (
                <span className="text-text-on-light">{e.title}</span>
              )}
              {e.valor && (
                <span className="ml-1.5 px-1 py-0 text-[9px] font-mono text-danger border border-danger/40 bg-danger/10">
                  R$ {e.valor}
                </span>
              )}
            </span>
          </li>
        ))}
        {events.length > 30 && (
          <li className="text-[10px] text-muted-on-light italic pl-3 border-t border-border-light pt-1">
            … e mais {events.length - 30} eventos.
          </li>
        )}
      </ul>
    </Widget>
  );
}


/* -------------------------------------------------------------------------- */
/* Widget · Top fornecedores CEAP                                              */
/* -------------------------------------------------------------------------- */
/**
 * Agrega despesas por `fornecedor` e mostra ranking visual com barra
 * proporcional. Útil pra detectar concentração suspeita (ex: 80% das
 * despesas em 1 só CNPJ).
 */
export function WidgetTopFornecedores({ properties }: { properties?: Properties }) {
  const docs = readArray<DocumentItem>(properties, 'documents');
  const totals = new Map<string, { total: number; count: number }>();
  for (const d of docs) {
    const f = (d.fornecedor || '').trim();
    if (!f) continue;
    const v = typeof d.valor === 'string'
      ? parseFloat(d.valor.replace(/\./g, '').replace(',', '.'))
      : (d.valor || 0);
    const cur = totals.get(f) ?? { total: 0, count: 0 };
    cur.total += Number.isFinite(v as number) ? (v as number) : 0;
    cur.count += 1;
    totals.set(f, cur);
  }
  const ranking = Array.from(totals.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8);
  const max = Math.max(1, ...ranking.map(([, t]) => t.total));
  const totalGeral = Array.from(totals.values()).reduce((a, t) => a + t.total, 0);

  if (ranking.length === 0) {
    return (
      <Widget title="Top fornecedores (CEAP)" description="Concentração de despesas">
        <p className="text-[11px] text-muted-on-light italic">
          Sem despesas pra agregar.
        </p>
      </Widget>
    );
  }
  return (
    <Widget
      title={`Top fornecedores · ${totals.size}`}
      description={`Total R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
    >
      <ul className="space-y-1.5">
        {ranking.map(([forn, t]) => {
          const pct = (t.total / max) * 100;
          const pctTotal = totalGeral > 0 ? (t.total / totalGeral) * 100 : 0;
          return (
            <li key={forn} className="text-[11px]">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 truncate text-text-on-light" title={forn}>
                  {forn}
                </span>
                <span className="font-mono text-[10px] text-muted-on-light">
                  {t.count} doc{t.count > 1 ? 's' : ''}
                </span>
                <span className="font-mono font-semibold text-text-on-light w-24 text-right">
                  R$ {t.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="mt-0.5 h-2 bg-raised-light relative">
                <div
                  className="absolute inset-y-0 left-0 bg-primary"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute right-1 top-1/2 -translate-y-1/2 font-mono text-[9px] text-muted-on-light">
                  {pctTotal.toFixed(1)}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}


/* -------------------------------------------------------------------------- */
/* Widget · Vídeos YouTube com player embedado (modal)                         */
/* -------------------------------------------------------------------------- */
/**
 * Grid de vídeos com thumbnail; clicar abre player YouTube embedado em
 * modal sem sair da ficha. URL → extrai videoId → embed.
 */
export function WidgetVideosYoutube({ properties }: { properties?: Properties }) {
  const media = readArray<MediaItem>(properties, 'media');
  const ytVideos = media.filter((m) => (m.page || m.url || '').includes('youtube.com/watch'));
  const [playing, setPlaying] = React.useState<MediaItem | null>(null);

  function videoIdOf(m: MediaItem): string | null {
    const url = m.page || m.url || '';
    const match = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  if (ytVideos.length === 0) {
    return (
      <Widget title="Vídeos YouTube" description="Player embedado">
        <p className="text-[11px] text-muted-on-light italic">
          Sem vídeos coletados pelo `youtube_search`.
        </p>
      </Widget>
    );
  }
  return (
    <Widget title={`Vídeos YouTube · ${ytVideos.length}`} description="Clique pra reproduzir">
      <div className="grid grid-cols-2 gap-2">
        {ytVideos.map((v, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPlaying(v)}
            className="text-left border border-border-light bg-raised-light/30 hover:border-primary"
            title={v.title}
          >
            {v.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={v.url}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full aspect-video object-cover"
              />
            )}
            <p className="px-1.5 py-1 text-[11px] text-text-on-light line-clamp-2 leading-tight">
              {v.title || '—'}
            </p>
          </button>
        ))}
      </div>

      {playing && videoIdOf(playing) && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-50 ds-overlay flex items-center justify-center p-6"
          onClick={() => setPlaying(null)}
        >
          <div
            className="relative w-full max-w-3xl aspect-video bg-black border border-border-light"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`https://www.youtube.com/embed/${videoIdOf(playing)}?autoplay=1`}
              title={playing.title || ''}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <button
              type="button"
              onClick={() => setPlaying(null)}
              className="absolute -top-8 right-0 text-white text-[12px] font-mono uppercase hover:underline"
            >
              fechar ✕
            </button>
          </div>
        </div>
        </ModalPortal>
      )}
    </Widget>
  );
}


/* -------------------------------------------------------------------------- */
/* Widget · Antecedentes / sanções / leaks (integridade)                       */
/* -------------------------------------------------------------------------- */
export function WidgetIntegridade({ properties }: { properties?: Properties }) {
  const correlations = readDict<Correlation>(properties, 'correlations');
  const opensanctions = correlations.opensanctions;
  const icij = correlations.icij;
  const factcheck = correlations.factcheck;
  const rows = [
    { label: 'OpenSanctions', tool: 'opensanctions_search@v1', count: opensanctions?.count ?? 0 },
    { label: 'ICIJ Leaks', tool: 'icij_search@v1', count: icij?.count ?? 0 },
    { label: 'Fact-check', tool: 'factcheck_search@v1', count: factcheck?.count ?? 0 },
  ];
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <Widget
      title="Integridade · sanções e leaks"
      description={total > 0 ? `${total} hits — revisar` : 'Sem hits nas bases públicas'}
    >
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const has = r.count > 0;
          return (
            <li
              key={r.label}
              className={
                'flex items-center gap-2 text-[11px] px-2 py-1 border-l-2 ' +
                (has
                  ? 'border-l-danger bg-danger/5'
                  : 'border-l-success bg-success/5')
              }
            >
              <ListChecks
                className={
                  'w-3 h-3 shrink-0 ' +
                  (has ? 'text-danger' : 'text-success')
                }
                strokeWidth={1.5}
              />
              <span className="font-medium w-32 shrink-0">{r.label}</span>
              <span className="font-mono text-[10px] text-muted-on-light flex-1 truncate">
                {r.tool}
              </span>
              <span
                className={
                  has
                    ? 'px-1.5 py-0 text-[10px] font-mono text-danger border border-danger/40 bg-danger/10'
                    : 'px-1.5 py-0 text-[10px] font-mono text-success border border-success/40 bg-success/10'
                }
              >
                {has ? `${r.count} hits` : 'limpo'}
              </span>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}
