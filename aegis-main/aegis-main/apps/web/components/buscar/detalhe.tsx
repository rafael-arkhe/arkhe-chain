'use client';

/**
 * Painel detalhe do objeto selecionado — coluna direita do /buscar.
 *
 * Quando o operador clica num resultado, este painel mostra:
 *   - Nome + tipo + classificação + score
 *   - Origem (fonte + query)
 *   - URL externa (botão "abrir na fonte")
 *   - Ações primárias (abrir ficha · enriquecer · criar entidade)
 *
 * Estado vazio: dica do que fazer.
 */
import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, Info, MousePointer, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { objectKindLabel } from '@/lib/i18n/kind-labels';
import { SOURCE_CATALOG, type NormalizedResult, type SourceDef } from '@/lib/buscar/types';
import { Fatos, scoreIsRelevance, isRealEntityKind, localEntityFacts } from './resultados';
import { PersonalizarResultadoButton } from './personalizar-resultado-button';
import { MediaGallery } from './media-gallery';
import { ItemsList } from './items-list';
import { BuscarCorrelacao } from './correlacao';
import { MergeOntologia } from './merge-ontologia';

/** Adapters de enriquecimento sugeridos por padrão (entidade local). */
const ENRIQUECIMENTO_FONTES = [
  'entity_dossier@v1',
  'instaloader_profile@v1',
  'gdelt_doc_search@v1',
  'searx_news_brazil@v1',
  'maigret_username@v1',
];

type Props = {
  selecionado: { result: NormalizedResult; source: SourceDef; query: string } | null;
  onEnriquecer: (result: NormalizedResult, target: SourceDef) => void;
  /**
   * Ação CONTEXTUAL que FUNCIONA (não-cega-não-morta): o page-level handler
   * lê `result.action.value` e re-enfileira a busca aprofundando. Substitui o
   * "Criar entidade" morto. Mantém a assinatura `(result, from)` pro resolver.
   */
  onCriar: (result: NormalizedResult, from: SourceDef) => void;
};

export function DetalheObjeto({ selecionado, onEnriquecer, onCriar }: Props) {
  const t = useT();
  if (!selecionado) {
    return (
      <aside
        data-testid="buscar-detalhe-vazio"
        className="w-[320px] shrink-0 border-l border-border-light bg-panel-light flex flex-col"
      >
        <header className="h-9 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light shrink-0">
          <Info className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono">
            {t('buscar.detalhe.titulo')}
          </p>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <MousePointer className="w-6 h-6 text-muted-on-light" strokeWidth={1.5} />
          <p className="text-[11px] text-muted-on-light leading-relaxed">
            {t('buscar.detalhe.vazio')}
          </p>
        </div>
      </aside>
    );
  }

  const { result, source, query } = selecionado;
  const isLocal = !!result.entityId;
  const enriquecimentoTargets = SOURCE_CATALOG.filter(
    (s) => s.mcpTool && ENRIQUECIMENTO_FONTES.includes(s.mcpTool) && s.key !== source.key,
  );

  // CONTEXTO (c): entidade local — subtitle cru ("person · classif. restrito")
  // vira facts estruturados (Tipo · Classificação) na camada de exibição.
  const derivedLocalFacts = localEntityFacts(t, result);
  const ownFacts = result.facts && result.facts.length > 0 ? result.facts : derivedLocalFacts;
  const subtitleSuppressed = !!derivedLocalFacts;

  return (
    <aside
      data-testid="buscar-detalhe"
      className="w-[320px] shrink-0 border-l border-border-light bg-panel-light flex flex-col overflow-hidden"
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light shrink-0">
        <Info className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1">
          {t('buscar.detalhe.titulo')}
        </p>
        <span className="text-[10px] text-muted-on-light truncate max-w-[60%]" title={source.label}>
          {source.label}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Cabeçalho */}
        <section className="p-3 border-b border-border-light bg-canvas-light">
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
          {result.subtitle && !subtitleSuppressed && (
            <p className="text-[11px] text-muted-on-light mt-0.5 leading-relaxed">
              {result.subtitle}
            </p>
          )}
          {result.snippet && result.snippet !== result.subtitle && (
            <p className="text-[11px] text-text-on-light mt-1.5 leading-relaxed line-clamp-6">
              {result.snippet}
            </p>
          )}

          {/* Fatos contextuais — o QUE foi encontrado (mini key-value). */}
          {ownFacts && ownFacts.length > 0 && <Fatos facts={ownFacts} />}

          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {/* BUG (b): badge de TIPO só p/ entidade real — não o slug-fallback
                da fonte (que fingia ser um tipo). A fonte real aparece no header
                e na seção de metadados (Fonte). */}
            {isRealEntityKind(result.kind, isLocal) && (
              <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-border-light bg-raised-light/60 text-muted-on-light">
                {objectKindLabel(t, result.kind)}
              </span>
            )}
            {/* BUG (a): badge de score é EXCLUSIVO de relevância (0<score≤1).
                Contador (ex.: holehe found_count) nunca vira "4.00". */}
            {scoreIsRelevance(result.score) && (
              <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-primary text-primary bg-primary/10">
                {t('buscar.detalhe.score')} {result.score.toFixed(2)}
              </span>
            )}
          </div>
        </section>

        {/* CORRELAÇÃO EM CADEIA (P3 Onda 3) — vínculos imediatos (auto-leve) +
            "Expandir em cadeia" (prévia → salvar). Só aparece quando o resultado
            resolve num seletor/entidade e o operador tem perm correlation.run.
            Domínio-agnóstico (seletor inferido por formato). */}
        <BuscarCorrelacao result={result} />

        {/* RIQUEZA POR SHAPE (P2 ELO 2) — abaixo do cabeçalho/facts, acima do
            payload bruto. Cada seção só renderiza quando há dado. Tudo derivado
            do que o ELO 1 enriqueceu (mídia/itens/campos) — zero ramo por nome
            de fonte. Links sempre em NOVA ABA. */}
        {result.media && result.media.length > 0 && (
          <section className="p-3 border-b border-border-light">
            <SecaoTitulo>{t('buscar.detalhe.galeria')}</SecaoTitulo>
            <MediaGallery media={result.media} />
          </section>
        )}

        {result.items && result.items.length > 0 && (
          <section className="p-3 border-b border-border-light">
            <SecaoTitulo>
              {t('buscar.detalhe.itens')}
              <span className="ml-1 text-muted-on-light/70">({result.items.length})</span>
            </SecaoTitulo>
            <ItemsList items={result.items} />
          </section>
        )}

        {result.fields && result.fields.length > 0 && (
          <section className="p-3 border-b border-border-light">
            <SecaoTitulo>{t('buscar.detalhe.campos')}</SecaoTitulo>
            <CamposTabela fields={result.fields} />
          </section>
        )}

        {/* Metadados (o `tool@vN` técnico vive só no Payload bruto, abaixo). */}
        <section className="p-3 space-y-2 border-b border-border-light">
          <Linha label={t('buscar.detalhe.meta.fonte')} value={source.label} />
          <Linha label={t('buscar.detalhe.meta.queryOrigem')} value={query} />
          <Linha label={t('buscar.detalhe.meta.externalId')} value={result.externalId} mono truncate />
          {result.url && (
            <Linha
              label={t('buscar.detalhe.meta.url')}
              value={
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {t('buscar.detalhe.abrir')}
                  <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                </a>
              }
            />
          )}
        </section>

        {/* Ações */}
        <section className="p-3 space-y-2">
          {isLocal && result.entityId && (
            <Link
              href={`/ficha/${result.entityId}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`buscar-detalhe-abrir-ficha-${result.entityId}`}
              className="w-full h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
              {t('buscar.detalhe.abrirFicha')}
            </Link>
          )}

          {/* Ação CONTEXTUAL que FUNCIONA: re-busca aprofundando com o valor
              extraído (CPF formatado, número, e-mail). Substitui o "Criar
              entidade" cego/morto. Rótulo do extractor diz o que faz; fallback
              genérico re-busca pelo próprio nome (nunca "sem fluxo"). */}
          {!isLocal && (
            <button
              type="button"
              onClick={() => onCriar(result, source)}
              data-testid="buscar-detalhe-aprofundar"
              title={result.action?.value ?? result.name}
              className="w-full h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center justify-center gap-2"
            >
              <Search className="w-3 h-3" strokeWidth={1.5} />
              {result.action?.label ?? t('buscar.acao.buscarComEsteResultado')}
            </button>
          )}

          {/* MERGE GOVERNADO (P4 ELO 2) — projeta ESTE resultado (de qualquer
              conector) num objeto canônico da ontologia. Fluxo PRÉVIA→confirmar
              com auto-sugerir / picker / criar novo + resolução de conflito
              campo-a-campo. Só aparece p/ quem tem perm ontology.merge (gate no
              próprio componente, via RequirePerm). Domínio-agnóstico por SHAPE. */}
          <MergeOntologia result={result} />

          {isLocal && enriquecimentoTargets.length > 0 && (
            <div className="pt-2 border-t border-border-light">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono mb-1.5">
                {t('buscar.detalhe.enriquecerCom')}
              </p>
              <div className="space-y-1">
                {enriquecimentoTargets.map((target) => (
                  <button
                    key={target.key}
                    type="button"
                    onClick={() => onEnriquecer(result, target)}
                    data-testid={`buscar-detalhe-enriquecer-${result.entityId}-${target.key}`}
                    className={cn(
                      'w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light',
                      'hover:border-primary flex items-center gap-2',
                    )}
                  >
                    <Search className="w-3 h-3" strokeWidth={1.5} />
                    <span className="flex-1 text-left truncate">{target.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Payload bruto — pra inspecionar o que veio do adapter */}
        {result.raw !== undefined && (
          <PayloadBruto raw={result.raw} />
        )}

        {/* Botão Personalizar (só visível pra quem tem perm
            security.workshop.publish_global) — cria app workshop
            search_result + target_source = source.key */}
        <section className="px-3 py-2 border-t border-border-light bg-raised-light/20">
          <PersonalizarResultadoButton source={source} />
        </section>
      </div>
    </aside>
  );
}

/** Título de seção (rótulo mono uppercase discreto), reusado nas seções ricas. */
function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono mb-1.5">
      {children}
    </p>
  );
}

/**
 * Tabela key/value de TODOS os fields[] (SHAPE — SUPERSET de facts). `label` é
 * chave i18n (resolvida via useT(); fallback Title Case passa intacto). `tone`
 * colore SÓ o texto do valor (ok=primária, warn=danger discreto). `href` vira
 * link em NOVA ABA (target=_blank rel=noopener). Valor em JetBrains Mono.
 */
function CamposTabela({ fields }: { fields: NonNullable<NormalizedResult['fields']> }) {
  const t = useT();
  return (
    <dl className="space-y-1">
      {fields.map((f, i) => (
        <div key={`${f.label}-${i}`} className="flex items-baseline gap-2">
          <dt className="w-24 shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono">
            {t(f.label)}
          </dt>
          {f.href ? (
            <a
              href={f.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex-1 min-w-0 text-[11px] font-mono break-words hover:underline inline-flex items-center gap-1',
                f.tone === 'warn' ? 'text-danger' : 'text-primary',
              )}
            >
              <span className="truncate">{f.value}</span>
              <ExternalLink className="w-3 h-3 shrink-0" strokeWidth={1.5} />
            </a>
          ) : (
            <dd
              className={cn(
                'flex-1 min-w-0 text-[11px] font-mono break-words',
                f.tone === 'ok' && 'text-primary',
                f.tone === 'warn' && 'text-danger',
                (!f.tone || f.tone === 'neutral') && 'text-text-on-light',
              )}
            >
              {f.value}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function PayloadBruto({ raw }: { raw: unknown }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <section className="border-t border-border-light">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-7 px-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] font-semibold font-mono text-muted-on-light hover:bg-raised-light/40"
      >
        <Info className="w-3 h-3" strokeWidth={1.5} />
        {t('buscar.detalhe.payloadBruto')}
        <span className="ml-auto text-[10px] text-muted-on-light/70">
          {open ? '↑' : '↓'}
        </span>
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto px-3 py-2 text-[10px] font-mono bg-raised-light/40 border-t border-border-light text-text-on-light whitespace-pre-wrap break-all">
          {JSON.stringify(raw, null, 2)}
        </pre>
      )}
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
