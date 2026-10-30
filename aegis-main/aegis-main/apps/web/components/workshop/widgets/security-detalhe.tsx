'use client';

/**
 * Widgets atômicos do "Detalhe da busca" — refletem o DetalheObjeto
 * default em 4 blocos editáveis. Operador adiciona/remove/reordena no
 * editor; o DetalheResolver passa `variables.result/source/query` em
 * runtime quando o app é renderizado dentro do /buscar.
 *
 *   security.detalhe.cabecalho — thumb + nome + snippet + kind/score
 *   security.detalhe.meta      — fonte/tool/query/externalId/url
 *   security.detalhe.acoes     — abrir ficha · criar · enriquecer
 *   security.detalhe.payload   — collapsible JSON do raw
 *
 * Sem `variables.result` (preview no editor) cada widget mostra estado
 * placeholder com explicação.
 */
import * as React from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  FilePlus,
  Info,
  MousePointer,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { SOURCE_CATALOG, type NormalizedResult, type SourceDef } from '@/lib/buscar/types';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

const ENRIQUECIMENTO_FONTES = [
  'entity_dossier@v1',
  'instaloader_profile@v1',
  'gdelt_doc_search@v1',
  'searx_news_brazil@v1',
  'maigret_username@v1',
];

function pickResult(v: WidgetRenderProps['variables']): NormalizedResult | null {
  const r = v.result;
  return r && typeof r === 'object' ? (r as NormalizedResult) : null;
}
function pickSource(v: WidgetRenderProps['variables']): SourceDef | null {
  const s = v.source;
  return s && typeof s === 'object' ? (s as SourceDef) : null;
}
function pickQuery(v: WidgetRenderProps['variables']): string {
  return typeof v.query === 'string' ? v.query : '';
}

type Callbacks = {
  onCriar?: (result: NormalizedResult, from: SourceDef) => void;
  onEnriquecer?: (result: NormalizedResult, target: SourceDef) => void;
};
function pickCallbacks(v: WidgetRenderProps['variables']): Callbacks {
  return {
    onCriar:
      typeof v.onCriar === 'function'
        ? (v.onCriar as Callbacks['onCriar'])
        : undefined,
    onEnriquecer:
      typeof v.onEnriquecer === 'function'
        ? (v.onEnriquecer as Callbacks['onEnriquecer'])
        : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Cabeçalho                                                                  */
/* -------------------------------------------------------------------------- */
function Cabecalho({ variables }: WidgetRenderProps) {
  const result = pickResult(variables);
  if (!result) return <Placeholder titulo="Cabeçalho do resultado" />;
  return (
    <section
      data-testid="detalhe-widget-cabecalho"
      className="p-3 border border-border-light bg-canvas-light"
    >
      {result.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.thumbnail}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full max-h-40 object-cover border border-border-light mb-2 bg-raised-light"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <p className="text-[13px] font-semibold text-text-on-light leading-tight">
        {result.name}
      </p>
      {result.subtitle && (
        <p className="text-[11px] text-muted-on-light mt-0.5 leading-relaxed">
          {result.subtitle}
        </p>
      )}
      {result.snippet && result.snippet !== result.subtitle && (
        <p className="text-[11px] text-text-on-light mt-1.5 leading-relaxed line-clamp-6">
          {result.snippet}
        </p>
      )}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-border-light bg-raised-light/60 text-muted-on-light">
          {result.kind}
        </span>
        {result.score != null && (
          <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-primary text-primary bg-primary/10">
            score {result.score.toFixed(2)}
          </span>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Metadados                                                                  */
/* -------------------------------------------------------------------------- */
function Meta({ variables }: WidgetRenderProps) {
  const result = pickResult(variables);
  const source = pickSource(variables);
  const query = pickQuery(variables);
  if (!result || !source) return <Placeholder titulo="Metadados (fonte · tool · query · url)" />;
  return (
    <section
      data-testid="detalhe-widget-meta"
      className="p-3 space-y-2 border border-border-light"
    >
      <Linha label="Fonte" value={source.label} />
      <Linha label="Tool" value={source.mcpTool || '—'} mono />
      <Linha label="Query origem" value={query || '—'} />
      <Linha label="External ID" value={result.externalId} mono truncate />
      {result.url && (
        <Linha
          label="URL"
          value={
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              abrir
              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
            </a>
          }
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Ações                                                                      */
/* -------------------------------------------------------------------------- */
function Acoes({ variables }: WidgetRenderProps) {
  const result = pickResult(variables);
  const source = pickSource(variables);
  const cb = pickCallbacks(variables);
  if (!result || !source) return <Placeholder titulo="Ações (abrir ficha · criar entidade · enriquecer)" />;

  const isLocal = !!result.entityId;
  const enriquecimentoTargets = SOURCE_CATALOG.filter(
    (s) => s.mcpTool && ENRIQUECIMENTO_FONTES.includes(s.mcpTool) && s.key !== source.key,
  );

  return (
    <section
      data-testid="detalhe-widget-acoes"
      className="p-3 space-y-2 border border-border-light"
    >
      {isLocal && result.entityId && (
        <Link
          href={`/ficha/${result.entityId}`}
          data-testid={`detalhe-widget-abrir-ficha-${result.entityId}`}
          className="w-full h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center justify-center gap-2"
        >
          <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
          Abrir ficha
        </Link>
      )}
      {!isLocal && cb.onCriar && (
        <button
          type="button"
          onClick={() => cb.onCriar?.(result, source)}
          data-testid="detalhe-widget-criar"
          className="w-full h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center justify-center gap-2"
        >
          <FilePlus className="w-3 h-3" strokeWidth={1.5} />
          Criar entidade local
        </button>
      )}
      {isLocal && cb.onEnriquecer && enriquecimentoTargets.length > 0 && (
        <div className="pt-2 border-t border-border-light">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono mb-1.5">
            Enriquecer com
          </p>
          <div className="space-y-1">
            {enriquecimentoTargets.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => cb.onEnriquecer?.(result, t)}
                data-testid={`detalhe-widget-enriquecer-${result.entityId}-${t.key}`}
                className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-2"
              >
                <Search className="w-3 h-3" strokeWidth={1.5} />
                <span className="flex-1 text-left truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Payload bruto                                                              */
/* -------------------------------------------------------------------------- */
function Payload({ variables }: WidgetRenderProps) {
  const result = pickResult(variables);
  const [open, setOpen] = React.useState(false);
  if (!result) return <Placeholder titulo="Payload bruto (JSON do adapter)" />;
  if (result.raw === undefined) {
    return (
      <section
        data-testid="detalhe-widget-payload"
        className="border border-border-light"
      >
        <p className="px-3 py-2 text-[10px] italic text-muted-on-light">
          Sem payload bruto pra essa fonte.
        </p>
      </section>
    );
  }
  return (
    <section
      data-testid="detalhe-widget-payload"
      className="border border-border-light"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-7 px-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] font-semibold font-mono text-muted-on-light hover:bg-raised-light/40"
      >
        <Info className="w-3 h-3" strokeWidth={1.5} />
        Payload bruto
        <span className="ml-auto text-[10px] text-muted-on-light/70">
          {open ? '↑' : '↓'}
        </span>
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto px-3 py-2 text-[10px] font-mono bg-raised-light/40 border-t border-border-light text-text-on-light whitespace-pre-wrap break-all">
          {JSON.stringify(result.raw, null, 2)}
        </pre>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
function Placeholder({ titulo }: { titulo: string }) {
  return (
    <section className="p-3 border border-dashed border-border-light bg-raised-light/30 flex flex-col items-center gap-1 text-center">
      <MousePointer className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
      <p className="text-[11px] text-muted-on-light leading-relaxed">
        <span className="font-semibold text-text-on-light">{titulo}</span>
      </p>
      <p className="text-[10px] text-muted-on-light italic">
        Aparece quando o operador clica num resultado.
      </p>
    </section>
  );
}

function Linha({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono">
        {label}
      </span>
      <span
        className={cn(
          'flex-1 text-[11px] text-text-on-light min-w-0',
          mono && 'font-mono',
          truncate && 'truncate',
        )}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mock variables (preview no editor / paleta)                                */
/* -------------------------------------------------------------------------- */
const MOCK_RESULT: NormalizedResult = {
  externalId: 'yt:abc123XYZ',
  name: 'Sessão da CPI da Vacina · 14/08',
  kind: 'video',
  subtitle: 'YouTube · TV Senado · há 2 dias',
  snippet:
    'Depoimento aborda contratos com a Pfizer, atrasos na entrega e questionamentos da bancada da oposição sobre prazos de imunização.',
  thumbnail: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="%23e5e7eb"/><rect x="120" y="60" width="80" height="60" fill="%23cbd5e1"/><polygon points="148,80 148,100 168,90" fill="%23ffffff"/></svg>`,
  ),
  score: 0.87,
  url: 'https://www.youtube.com/watch?v=abc123XYZ',
  raw: { provider: 'youtube', id: 'abc123XYZ', duration: 4521, views: 12830 },
};

const MOCK_SOURCE: SourceDef = {
  key: 'youtube_search@v1',
  label: 'YouTube',
  category: 'noticias',
  mcpTool: 'youtube_search@v1',
};

const MOCK_VARS = {
  result: MOCK_RESULT,
  source: MOCK_SOURCE,
  query: 'cpi vacina',
};

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */
registerWidget('security.detalhe.cabecalho', Cabecalho, {
  group: 'detalhe',
  label: 'Detalhe · cabeçalho',
  description: 'Thumbnail, nome, subtítulo, snippet e badges (tipo + score) do resultado selecionado.',
  icon: 'image',
  defaultColSpan: 20,
  mockVariables: MOCK_VARS,
});

registerWidget('security.detalhe.meta', Meta, {
  group: 'detalhe',
  label: 'Detalhe · metadados',
  description: 'Bloco com fonte, tool MCP, query de origem, external ID e link pra URL externa.',
  icon: 'info',
  defaultColSpan: 20,
  mockVariables: MOCK_VARS,
});

registerWidget('security.detalhe.acoes', Acoes, {
  group: 'detalhe',
  label: 'Detalhe · ações',
  description: 'Botões pra abrir ficha existente, criar entidade local ou enriquecer com outras fontes MCP.',
  icon: 'mouse-pointer',
  defaultColSpan: 20,
  mockVariables: { ...MOCK_VARS, result: { ...MOCK_RESULT, entityId: '00000000-0000-4000-8000-000000000042' } },
});

registerWidget('security.detalhe.payload', Payload, {
  group: 'detalhe',
  label: 'Detalhe · payload bruto',
  description: 'JSON cru retornado pelo adapter, expansível em accordion pra inspeção técnica.',
  icon: 'file-json',
  defaultColSpan: 20,
  mockVariables: MOCK_VARS,
});
