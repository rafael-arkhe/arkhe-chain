'use client';

/**
 * RedeInspector — painel direito do /rede.
 *
 * Renderiza o nó selecionado com formatação rica por tipo de
 * property:
 *   - text (LLM)   → markdown-ish (negrito + parágrafos)
 *   - media        → grid de thumbs clicáveis
 *   - citations    → lista de links externos com badge da fonte
 *   - documents    → tabela compacta (CEAP)
 *   - correlations → tabela com tool/count
 *   - resto (head, dict, scalar) → ValueRender recursivo
 *
 * Sem `[object Object]` em nenhum lugar.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Quote,
} from 'lucide-react';
import { Entities } from '@/lib/api';
import { OBJECT_ICONS, OBJECT_LABELS } from '@/lib/object-icons';
import {
  CLASSIFICATION_BG,
  CLASSIFICATION_LABEL,
  type ClassificationLevel,
} from '@/lib/classification';
import type { Entity } from '@/lib/api/types';
import type { ObjectType } from '@/lib/mock-data';
import { cn } from '@/lib/cn';

type EvidenceItem = Record<string, unknown>;

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

/* -------------------------------------------------------------------------- */
/* Renderers por tipo de property                                             */
/* -------------------------------------------------------------------------- */

function MediaGrid({ media }: { media: MediaItem[] }) {
  if (media.length === 0) {
    return <p className="text-[11px] text-muted-on-light italic">Sem mídia.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {media.slice(0, 8).map((m, i) => {
        if (!m.url) return null;
        return (
          <a
            key={i}
            href={m.page || m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block border border-border-light bg-raised-light/30 hover:border-primary"
            title={m.title || ''}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.url}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full aspect-video object-cover"
              onError={(e) =>
                ((e.currentTarget as HTMLImageElement).style.opacity = '0.2')
              }
            />
            {m.title && (
              <p className="px-1 py-0.5 text-[9px] text-text-on-light leading-tight line-clamp-1 group-hover:text-primary">
                {m.title}
              </p>
            )}
          </a>
        );
      })}
      {media.length > 8 && (
        <div className="col-span-2 text-[10px] text-muted-on-light italic">
          … e mais {media.length - 8}
        </div>
      )}
    </div>
  );
}

function CitationsList({ items }: { items: CitationItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-[11px] text-muted-on-light italic">Sem citações.</p>
    );
  }
  return (
    <ul className="space-y-1">
      {items.slice(0, 10).map((c, i) => (
        <li key={i} className="flex items-baseline gap-1.5 text-[10px]">
          <Quote className="w-2.5 h-2.5 text-muted-on-light shrink-0 mt-0.5" />
          {c.src && (
            <span className="px-1 py-0 text-[9px] font-mono uppercase tracking-wide border border-border-light text-muted-on-light bg-raised-light/40 shrink-0">
              {c.src}
            </span>
          )}
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
      {items.length > 10 && (
        <li className="text-[9px] text-muted-on-light italic pt-1 border-t border-border-light">
          … e mais {items.length - 10}
        </li>
      )}
    </ul>
  );
}

function DocumentsList({ items }: { items: DocumentItem[] }) {
  if (items.length === 0) return null;
  const total = items.reduce((acc, d) => {
    const v =
      typeof d.valor === 'string'
        ? parseFloat(d.valor.replace(/\./g, '').replace(',', '.'))
        : d.valor || 0;
    return acc + (Number.isFinite(v as number) ? (v as number) : 0);
  }, 0);
  return (
    <div>
      <p className="text-[10px] font-mono text-muted-on-light mb-1">
        Total R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </p>
      <ul className="space-y-1">
        {items.slice(0, 8).map((d, i) => (
          <li
            key={i}
            className="border border-border-light bg-canvas-light px-1.5 py-1 text-[10px] flex items-center gap-1.5"
          >
            <FileText
              className="w-3 h-3 text-muted-on-light shrink-0"
              strokeWidth={1.5}
            />
            <div className="flex-1 min-w-0">
              <p className="truncate" title={d.fornecedor}>
                {d.fornecedor || d.title || '—'}
              </p>
              <p className="font-mono text-[9px] text-muted-on-light truncate">
                {(d.data || '').slice(0, 10)} · R$ {d.valor}
              </p>
            </div>
            {d.url && (
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-on-light hover:text-primary"
                title="Abrir documento"
              >
                <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
              </a>
            )}
          </li>
        ))}
        {items.length > 8 && (
          <li className="text-[9px] text-muted-on-light italic">
            … e mais {items.length - 8}
          </li>
        )}
      </ul>
    </div>
  );
}

function CorrelationsTable({ correlations }: { correlations: Record<string, Correlation> }) {
  const entries = Object.entries(correlations);
  if (entries.length === 0) return null;
  const withHits = entries.filter(([, c]) => (c.count ?? 0) > 0).length;
  return (
    <div>
      <p className="text-[10px] font-mono text-muted-on-light mb-1">
        {entries.length} fontes · {withHits} com hits
      </p>
      <table className="w-full text-[10px]">
        <tbody>
          {entries
            .sort(([, a], [, b]) => (b.count ?? 0) - (a.count ?? 0))
            .map(([nid, c]) => {
              const hits = c.count ?? 0;
              return (
                <tr key={nid} className="border-b border-border-light/40">
                  <td className="py-0.5 pr-1 font-mono truncate max-w-[110px]" title={nid}>
                    {nid}
                  </td>
                  <td className="py-0.5 text-right">
                    {hits > 0 ? (
                      <span className="px-1 py-0 text-[9px] font-mono text-success border border-success/40 bg-success/10">
                        {hits}
                      </span>
                    ) : (
                      <span className="text-muted-on-light">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

/** Renderiza texto LLM com formatação markdown leve (negrito + parágrafos). */
function MarkdownText({ text }: { text: string }) {
  // Divide em parágrafos por \n\n
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return (
    <div className="space-y-1.5 text-[11px] text-text-on-light leading-relaxed">
      {paragraphs.map((p, i) => {
        // **bold** → <strong>
        const parts = p.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i}>
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={j} className="text-text-on-light font-semibold">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                <span key={j}>{part}</span>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

/** Renderer recursivo de valores arbitrários (resto, fallback). */
function ValueRender({ v }: { v: unknown }): React.ReactElement {
  if (v == null) return <span className="text-muted-on-light">—</span>;
  if (typeof v === 'boolean') return <>{v ? 'sim' : 'não'}</>;
  if (typeof v === 'number') return <>{v.toLocaleString('pt-BR')}</>;
  if (typeof v === 'string') {
    if (/^https?:\/\//i.test(v)) {
      return (
        <a
          href={v}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
        >
          {v}
        </a>
      );
    }
    return <>{v}</>;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-on-light">—</span>;
    return (
      <ul className="space-y-0.5">
        {v.slice(0, 8).map((item, i) => (
          <li key={i} className="text-[10px]">
            <ValueRender v={item} />
          </li>
        ))}
        {v.length > 8 && (
          <li className="text-[9px] text-muted-on-light italic">
            … e mais {v.length - 8}
          </li>
        )}
      </ul>
    );
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-on-light">{'{}'}</span>;
    return (
      <table className="w-full text-[10px] border border-border-light bg-raised-light/30">
        <tbody>
          {entries.slice(0, 16).map(([k, val]) => (
            <tr key={k} className="border-b border-border-light/40 last:border-b-0">
              <td className="px-1.5 py-0.5 text-[9px] text-muted-on-light font-mono w-1/3 align-top">
                {k}
              </td>
              <td className="px-1.5 py-0.5 align-top break-words">
                <ValueRender v={val} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <>{String(v)}</>;
}

/* -------------------------------------------------------------------------- */
/* Seção colapsável                                                            */
/* -------------------------------------------------------------------------- */
function Secao({
  label,
  count,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  label: string;
  count?: number | string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border-light">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-8 px-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold font-mono text-muted-on-light hover:bg-raised-light/40"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
        )}
        {Icon && <Icon className="w-3 h-3" strokeWidth={1.5} />}
        <span className="flex-1 text-left">{label}</span>
        {count != null && <span className="font-mono normal-case">{count}</span>}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Inspector principal                                                         */
/* -------------------------------------------------------------------------- */
function evidenceTitle(e: EvidenceItem, idx: number): string {
  const t = e.title ?? e.label ?? e.name ?? e.text ?? e.snippet;
  if (typeof t === 'string' && t.trim()) return t;
  if (typeof e.id === 'string') return e.id;
  return `Evidência #${idx + 1}`;
}
function evidenceSubtitle(e: EvidenceItem): string | null {
  const parts: string[] = [];
  if (typeof e.kind === 'string') parts.push(e.kind);
  if (typeof e.source === 'string') parts.push(e.source);
  if (typeof e.at === 'string') parts.push(e.at);
  if (typeof e.created_at === 'string') parts.push(e.created_at);
  return parts.length ? parts.join(' · ') : null;
}

type Props = {
  selected: Entity | null;
  error: string | null;
};

export function RedeInspector({ selected, error }: Props) {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loadingEv, setLoadingEv] = useState(false);

  useEffect(() => {
    // Evidência é endpoint de Entity; nós do store CANÔNICO (OntologyNode,
    // _origin='node') não têm essa rota → daria 401/404 no console. Só busca
    // para nós de origem entidade (ou legado sem _origin). (Onda 2 — débito)
    if (!selected || selected._origin === 'node') {
      setEvidence([]);
      setLoadingEv(false);
      return;
    }
    let cancelled = false;
    setLoadingEv(true);
    // _rawId: o id no /rede unify é namespaced (e:/n:); evidência usa o uuid cru.
    Entities.evidence(selected._rawId ?? selected.id)
      .then((data) => {
        if (!cancelled) {
          setEvidence(Array.isArray(data) ? (data as EvidenceItem[]) : []);
        }
      })
      .catch(() => {
        if (!cancelled) setEvidence([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingEv(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (error) {
    return (
      <aside
        data-testid="rede-inspector"
        className="w-[340px] bg-panel-light border-l border-border-light flex flex-col shrink-0 overflow-hidden"
      >
        <div className="p-3 m-3 border border-cls-sigiloso bg-canvas-light">
          <p className="text-[10px] font-mono uppercase tracking-wider text-cls-sigiloso mb-1">
            Falha ao carregar grafo
          </p>
          <p className="text-[11px] text-text-on-light break-words">{error}</p>
        </div>
      </aside>
    );
  }

  if (!selected) {
    return (
      <aside
        data-testid="rede-inspector"
        className="w-[340px] bg-panel-light border-l border-border-light flex flex-col shrink-0 overflow-hidden"
      >
        <div className="p-4 flex-1 flex items-center justify-center">
          <p className="text-[11px] text-muted-on-light text-center leading-relaxed">
            Selecione um nó pra ver
            <br />
            correlações e evidências.
          </p>
        </div>
      </aside>
    );
  }

  const tipo = selected.entity_type as ObjectType;
  const Icon = OBJECT_ICONS[tipo] || OBJECT_ICONS.pessoa;
  const cls = selected.classification as ClassificationLevel;
  // uuid cru (sem o namespace e:/n: do /rede unify) p/ ficha e exibição.
  const rawId = selected._rawId ?? selected.id;

  // Particiona properties em chaves "ricas" + scalar
  const props = (selected.properties || {}) as Record<string, unknown>;
  const text = typeof props.text === 'string' ? props.text : null;
  const media = Array.isArray(props.media) ? (props.media as MediaItem[]) : [];
  const citations = Array.isArray(props.citations)
    ? (props.citations as CitationItem[])
    : [];
  const documents = Array.isArray(props.documents)
    ? (props.documents as DocumentItem[])
    : [];
  const correlations =
    props.correlations && typeof props.correlations === 'object' && !Array.isArray(props.correlations)
      ? (props.correlations as Record<string, Correlation>)
      : {};

  // Head canônico de Câmara (partido + UF + email + foto) — quando existe.
  const camaraHead =
    correlations.lookup_camara?.head ??
    correlations.camara?.head ??
    null;

  // Properties scalar (texto curto, datas, totais) — exclui as já renderizadas.
  const EXCLUDED = new Set([
    'text',
    'media',
    'citations',
    'documents',
    'correlations',
    'tokens_input',
    'tokens_output',
    'inference_log_id',
    'summarized_items',
  ]);
  const scalarProps = Object.entries(props).filter(
    ([k, v]) => !EXCLUDED.has(k) && v != null && typeof v !== 'object',
  );

  // URL canônica (entities aux como video/fornecedor/notícia)
  const url = typeof props.url === 'string' ? props.url : null;
  const thumbnail = typeof props.thumbnail === 'string' ? props.thumbnail : null;

  return (
    <aside
      data-testid="rede-inspector"
      className="w-[340px] bg-panel-light border-l border-border-light flex flex-col shrink-0 overflow-hidden"
    >
      {/* ─── Cabeçalho fixo ──────────────────────────── */}
      <div className="px-3 py-3 border-b border-border-light bg-canvas-light">
        <div className="flex items-start gap-2">
          {/* Avatar (head Câmara) ou ícone */}
          {camaraHead && typeof (camaraHead as Record<string, unknown>).thumbnail === 'string' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={String((camaraHead as Record<string, unknown>).thumbnail)}
              alt=""
              className="w-12 h-16 object-cover border border-border-light bg-raised-light shrink-0"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt=""
              className="w-12 h-12 object-cover border border-border-light bg-raised-light shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Icon
              className="w-4 h-4 text-muted-on-light shrink-0 mt-0.5"
              strokeWidth={1.5}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
              {OBJECT_LABELS[tipo] || tipo}
            </p>
            <p
              data-testid="rede-inspector-name"
              className="text-[13px] font-semibold leading-tight mt-0.5 break-words text-text-on-light"
            >
              {selected.name}
            </p>
            <p className="text-[10px] font-mono text-muted-on-light/70 mt-0.5 truncate" title={rawId}>
              {rawId.slice(0, 8)}…
            </p>
          </div>
        </div>

        {/* Chips: classificação, versão, partido (se for parlamentar), UF, email */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {cls && (
            <span
              className={cn(
                'px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase',
                CLASSIFICATION_BG[cls],
                cls === 'restrito' ? 'text-black' : 'text-white',
              )}
            >
              {CLASSIFICATION_LABEL[cls]}
            </span>
          )}
          <span className="text-[10px] font-mono text-muted-on-light">
            v{selected.version}
          </span>
          {camaraHead && (
            <>
              {typeof (camaraHead as Record<string, unknown>).siglaPartido === 'string' && (
                <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-primary text-primary bg-primary/10">
                  {String((camaraHead as Record<string, unknown>).siglaPartido)}
                </span>
              )}
              {typeof (camaraHead as Record<string, unknown>).siglaUf === 'string' && (
                <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-border-light text-muted-on-light bg-raised-light/60">
                  {String((camaraHead as Record<string, unknown>).siglaUf)}
                </span>
              )}
            </>
          )}
        </div>

        {/* Botões ação */}
        <div className="mt-3 flex items-center gap-1.5">
          <Link
            href={`/ficha/${rawId}`}
            data-testid="rede-abrir-ficha"
            className="flex-1 h-7 px-2.5 text-[11px] bg-primary text-white hover:bg-primary-hover flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" strokeWidth={1.5} /> Abrir ficha
          </Link>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
              title="Abrir URL externa"
            >
              <LinkIcon className="w-3 h-3" strokeWidth={1.5} />
            </a>
          )}
        </div>
      </div>

      {/* ─── Conteúdo scrollável ─────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {text && (
          <Secao label="Resumo executivo" defaultOpen={false}>
            <MarkdownText text={text} />
          </Secao>
        )}

        {media.length > 0 && (
          <Secao label="Mídia" count={media.length} icon={ImageIcon}>
            <MediaGrid media={media} />
          </Secao>
        )}

        {documents.length > 0 && (
          <Secao label="Documentos (CEAP)" count={documents.length} icon={FileText}>
            <DocumentsList items={documents} />
          </Secao>
        )}

        {Object.keys(correlations).length > 0 && (
          <Secao
            label="Correlações"
            count={`${Object.keys(correlations).length} fontes`}
            defaultOpen={false}
          >
            <CorrelationsTable correlations={correlations} />
          </Secao>
        )}

        {citations.length > 0 && (
          <Secao label="Citações" count={citations.length} icon={Quote} defaultOpen={false}>
            <CitationsList items={citations} />
          </Secao>
        )}

        {scalarProps.length > 0 && (
          <Secao label="Propriedades" count={scalarProps.length} defaultOpen={false}>
            <dl className="space-y-1.5">
              {scalarProps.map(([k, v]) => (
                <div key={k} className="flex flex-col">
                  <dt className="text-[9px] uppercase tracking-[0.14em] text-muted-on-light font-mono">
                    {k}
                  </dt>
                  <dd className="text-[11px] font-mono break-words text-text-on-light">
                    <ValueRender v={v} />
                  </dd>
                </div>
              ))}
            </dl>
          </Secao>
        )}

        <Secao label="Evidências" count={loadingEv ? '…' : evidence.length} defaultOpen={false}>
          {loadingEv ? (
            <p className="text-[11px] font-mono text-muted-on-light">Carregando…</p>
          ) : evidence.length === 0 ? (
            <p className="text-[11px] text-muted-on-light italic">
              Sem evidências indexadas pra este nó.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {evidence.slice(0, 10).map((e, i) => {
                const sub = evidenceSubtitle(e);
                return (
                  <li
                    key={typeof e.id === 'string' ? e.id : `ev-${i}`}
                    className="border border-border-light bg-canvas-light px-2 py-1.5"
                  >
                    <p className="text-[11px] text-text-on-light break-words">
                      {evidenceTitle(e, i)}
                    </p>
                    {sub && (
                      <p className="text-[9px] font-mono text-muted-on-light mt-0.5 truncate">
                        {sub}
                      </p>
                    )}
                  </li>
                );
              })}
              {evidence.length > 10 && (
                <li className="text-[9px] text-muted-on-light italic">
                  … e mais {evidence.length - 10}
                </li>
              )}
            </ul>
          )}
        </Secao>
      </div>
    </aside>
  );
}
