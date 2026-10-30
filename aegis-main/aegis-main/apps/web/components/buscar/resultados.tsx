'use client';

/**
 * Painel de resultados agrupados por fonte.
 *
 * Cada grupo é colapsável (default expandido se vier resultados).
 * Cada card mostra: nome, tipo, score, payload-excerpt; e ações:
 *   - "Abrir ficha" (apenas resultados com `entityId` — entidade local)
 *   - "Enriquecer com IG / Notícias / etc" (re-enfileira a query do
 *     resultado em outra fonte; só liberado para entidades locais)
 *   - "Criar entidade" (somente para resultados externos sem entityId)
 *
 * O page.tsx injeta `onEnriquecer` e `onCriar` — esses callbacks
 * traduzem em enfileirar novos FilaItem.
 */
import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { objectKindLabel, objectKindLabelKey } from '@/lib/i18n/kind-labels';
import { DICT } from '@/lib/i18n/dict';
import type { FilaItem, NormalizedResult, SourceDef } from '@/lib/buscar/types';
import { SOURCE_CATALOG } from '@/lib/buscar/types';
import { MediaGallery } from './media-gallery';

type Translate = (key: string) => string;

/**
 * BUG (a): o badge de score é EXCLUSIVO de relevância de embedding (0<score≤1).
 * Fontes de FATO ESCALAR podem mandar um CONTADOR como `score` (ex.: holehe
 * `found_count=4`); renderizá-lo com `.toFixed(2)` produzia "4.00" colado ao
 * subtitle "4 contas" (colisão visual). Contador NUNCA vira badge — a contagem
 * já vive no subtitle/facts. Só relevância real (0,xx) aparece como badge.
 */
export function scoreIsRelevance(score: number | null | undefined): score is number {
  return typeof score === 'number' && score > 0 && score <= 1;
}

/**
 * BUG (b): um kind só pode virar rótulo de TIPO quando é um TIPO de entidade
 * REAL — i.e. tem par curado no dict (`kind.<x>`) OU o resultado é entidade
 * local (entityId presente, kind = entity_type da ontologia). Fontes-lista caem
 * no fallback `sourceKey.split('@')[0]` (ex.: `youtube_search`) que NÃO é um
 * tipo — exibi-lo no rodapé fingia ser nome de fonte ("Youtube search"),
 * indistinguível da fonte real. Esse fallback é suprimido; o rodapé usa a FONTE
 * REAL (source.label).
 */
export function isRealEntityKind(kind: string | undefined, hasEntityId: boolean): boolean {
  if (!kind || !kind.trim()) return false;
  if (hasEntityId) return true; // entidade local: kind = entity_type da ontologia
  return objectKindLabelKey(kind) in DICT; // tipo curado no dict
}

/**
 * CONTEXTO (c): entidade local chega com `subtitle = "${entity_type} · classif.
 * ${classification}"` (string crua montada no worker). Aqui, na CAMADA DE
 * EXIBIÇÃO, viramos isso em facts estruturados — Tipo (via objectKindLabel) e
 * Classificação — sem tocar no worker. Retorna `null` quando não é entidade
 * local OU não há nada estruturável (mantém o subtitle cru nesse caso).
 */
export function localEntityFacts(
  t: Translate,
  result: NormalizedResult,
): NonNullable<NormalizedResult['facts']> | null {
  if (!result.entityId) return null;
  const facts: NonNullable<NormalizedResult['facts']> = [];
  const tipo = objectKindLabel(t, result.kind);
  if (tipo) facts.push({ label: 'buscar.fato.tipo', value: tipo });
  // Classificação: vem embutida no subtitle cru ("… · classif. <nivel>").
  const m = /classif\.\s*(.+)$/i.exec(result.subtitle ?? '');
  const nivel = m?.[1]?.trim();
  if (nivel) {
    facts.push({ label: 'buscar.fato.classificacao', value: nivel.toUpperCase() });
  }
  return facts.length > 0 ? facts : null;
}

type Props = {
  /** Items concluídos com sucesso. */
  items: FilaItem[];
  /** ID do resultado selecionado (mostra detalhe à direita). */
  selectedKey: string | null;
  /** Quando o operador clica num resultado — abre painel direito. */
  onSelect: (result: NormalizedResult, fromSource: SourceDef, originQuery: string) => void;
  /** Quando o operador clica "Enriquecer com X". */
  onEnriquecer: (result: NormalizedResult, targetSource: SourceDef) => void;
  /**
   * Ação CONTEXTUAL que FUNCIONA (não-cega-não-morta): re-enfileira a busca
   * aprofundando. O page-level handler lê `result.action.value` (CPF
   * formatado, número, e-mail) e re-busca. Substitui o "Criar entidade" morto.
   */
  onCriar: (result: NormalizedResult, fromSource: SourceDef) => void;
};

export function Resultados({ items, selectedKey, onSelect, onEnriquecer, onCriar }: Props) {
  const t = useT();
  const done = items.filter((i) => i.status === 'done' && i.results.length > 0);
  if (done.length === 0) {
    return (
      <div
        data-testid="buscar-resultados-vazio"
        className="flex-1 flex items-center justify-center text-[12px] text-muted-on-light p-8"
      >
        {t('buscar.resultados.vazio')}
      </div>
    );
  }

  // Agrupa por source.key (mesma fonte pode ter sido buscada com
  // queries diferentes; juntamos tudo num grupo, marcando a query origem).
  const grupos = new Map<string, { source: SourceDef; items: FilaItem[] }>();
  for (const it of done) {
    const g = grupos.get(it.source.key);
    if (g) g.items.push(it);
    else grupos.set(it.source.key, { source: it.source, items: [it] });
  }

  return (
    <div data-testid="buscar-resultados" className="flex-1 overflow-y-auto p-4 space-y-3">
      {Array.from(grupos.values()).map((g) => (
        <Grupo
          key={g.source.key}
          source={g.source}
          items={g.items}
          selectedKey={selectedKey}
          onSelect={onSelect}
          onEnriquecer={onEnriquecer}
          onCriar={onCriar}
        />
      ))}
    </div>
  );
}

function Grupo({
  source,
  items,
  selectedKey,
  onSelect,
  onEnriquecer,
  onCriar,
}: {
  source: SourceDef;
  items: FilaItem[];
  selectedKey: string | null;
  onSelect: (result: NormalizedResult, fromSource: SourceDef, originQuery: string) => void;
  onEnriquecer: (result: NormalizedResult, targetSource: SourceDef) => void;
  onCriar: (result: NormalizedResult, fromSource: SourceDef) => void;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(true);
  const total = items.reduce((acc, i) => acc + i.results.length, 0);

  return (
    <section
      data-testid={`buscar-grupo-${source.key}`}
      className="bg-white border border-border-light"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-9 px-3 flex items-center gap-2 border-b border-border-light hover:bg-raised-light/40"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
        )}
        {source.icon && (
          <source.icon className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
        )}
        <span className="text-[12px] font-semibold text-text-on-light">
          {source.label}
        </span>
        <span className="text-[11px] text-muted-on-light">
          ({total} {total === 1 ? t('buscar.resultados.contagem.singular') : t('buscar.resultados.contagem.plural')})
        </span>
      </button>

      {open && (
        <ul>
          {items.flatMap((it, itIdx) =>
            it.results.map((r, rIdx) => {
              const key = `${source.key}::${r.externalId}::${itIdx}-${rIdx}`;
              return (
                <ResultadoCard
                  key={key}
                  rowKey={key}
                  selected={selectedKey === key}
                  groupKey={source.key}
                  index={itIdx * 100 + rIdx}
                  result={r}
                  fromSource={source}
                  originQuery={it.query}
                  onSelect={() => onSelect(r, source, it.query)}
                  onEnriquecer={onEnriquecer}
                  onCriar={onCriar}
                />
              );
            }),
          )}
        </ul>
      )}
    </section>
  );
}

/** Adapters de "enriquecimento" oferecidos por padrão para entidade local. */
const ENRIQUECIMENTO_FONTES = [
  'entity_dossier@v1',
  'instaloader_profile@v1',
  'gdelt_doc_search@v1',
  'searx_news_brazil@v1',
  'maigret_username@v1',
];

function ResultadoCard({
  rowKey,
  selected,
  groupKey,
  index,
  result,
  fromSource,
  originQuery,
  onSelect,
  onEnriquecer,
  onCriar,
}: {
  rowKey: string;
  selected: boolean;
  groupKey: string;
  index: number;
  result: NormalizedResult;
  fromSource: SourceDef;
  originQuery: string;
  onSelect: () => void;
  onEnriquecer: (result: NormalizedResult, targetSource: SourceDef) => void;
  onCriar: (result: NormalizedResult, fromSource: SourceDef) => void;
}) {
  const t = useT();
  const isLocal = !!result.entityId;
  const enriquecimentoTargets = SOURCE_CATALOG.filter(
    (s) => s.mcpTool && ENRIQUECIMENTO_FONTES.includes(s.mcpTool) && s.key !== fromSource.key,
  );

  // Se o `name` foi gerado pelo fallback (`${sourceKey}-N`), o adapter
  // não tinha campo de nome reconhecível — mostramos o subtitle/snippet
  // como título substituto pra não exibir "senado_senadores@v1-0".
  const looksLikeFallbackName = /^[a-z0-9_]+@v\d+-\d+$/i.test(result.name);
  const displayName =
    looksLikeFallbackName && (result.subtitle || result.snippet)
      ? (result.subtitle || result.snippet || result.externalId).slice(0, 80)
      : result.name;

  // CONTEXTO (c): entidade local — subtitle cru ("person · classif. restrito")
  // vira facts estruturados (Tipo · Classificação). Quando temos facts próprios,
  // suprimimos o subtitle cru pra não duplicar a informação.
  const ownFacts = result.facts && result.facts.length > 0 ? result.facts : localEntityFacts(t, result);
  const subtitleSuppressed = !!localEntityFacts(t, result);

  // RIQUEZA POR SHAPE (P2 ELO 2): contagem de coleção (substantivo NEUTRO),
  // tira de mídia (até 4) e até 3 fields de destaque. Tudo derivado do dado
  // já enriquecido pelo ELO 1 — zero ramo por nome de fonte.
  const count = result.count ?? 0;
  const showCount = count > 0;
  const countLabel = showCount
    ? t('buscar.resultado.itens').replace('{n}', String(count))
    : '';
  // Subtitle auto-gerado de coleção ("N <substantivo>") é redundante com o badge
  // de contagem — suprimido. Subtitles REAIS (ex.: CNPJ) permanecem.
  const subtitleIsAutoCount =
    showCount && new RegExp(`^${count}\\s+\\S+$`).test((result.subtitle ?? '').trim());
  const highlightFields = (result.fields ?? []).slice(0, 3);
  const stripMedia = result.media ?? [];

  return (
    <li
      data-testid={`buscar-resultado-${groupKey}-${index}`}
      data-row-key={rowKey}
      onClick={onSelect}
      className={
        'px-3 py-2 border-b border-border-light last:border-b-0 cursor-pointer transition-colors ' +
        (selected
          ? 'bg-primary/10 border-l-2 border-l-primary'
          : 'hover:bg-raised-light/30 border-l-2 border-l-transparent')
      }
    >
      <div className="flex items-start gap-2">
        {/* Thumbnail (se houver) */}
        {result.thumbnail && (
          // next/image evitaria download, mas adapters mandam URLs
          // arbitrárias (CDN externa) que não passam pelo allowlist do
          // Next. Usamos <img> nativo + onError pra ocultar se 404.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-12 h-12 object-cover border border-border-light shrink-0 bg-raised-light"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Linha principal: nome + contagem (coleção) + score (badge) */}
          <div className="flex items-baseline gap-2">
            <p className="text-[12px] font-semibold text-text-on-light truncate flex-1">
              {displayName}
            </p>
            {showCount && (
              <span
                data-testid="buscar-resultado-contagem"
                className="px-1 py-0 text-[9px] font-mono text-muted-on-light border border-border-light bg-raised-light/60 shrink-0"
              >
                {countLabel}
              </span>
            )}
            {scoreIsRelevance(result.score) && (
              <span className="px-1 py-0 text-[9px] font-mono text-primary border border-primary/40 bg-primary/10 shrink-0">
                {result.score.toFixed(2)}
              </span>
            )}
          </div>

          {/* Subtitle (suprimido quando viramos a versão crua em facts, ou quando
              é o resumo auto de coleção — já coberto pelo badge de contagem). */}
          {result.subtitle &&
            !looksLikeFallbackName &&
            !subtitleSuppressed &&
            !subtitleIsAutoCount && (
              <p className="text-[11px] text-muted-on-light truncate">
                {result.subtitle}
              </p>
            )}

          {/* Snippet: 2 linhas */}
          {result.snippet && result.snippet !== result.subtitle && (
            <p className="text-[11px] text-muted-on-light leading-snug line-clamp-2 mt-0.5">
              {result.snippet}
            </p>
          )}

          {/* Fatos contextuais (mini key-value) — o QUE foi encontrado. */}
          {ownFacts && ownFacts.length > 0 && <Fatos facts={ownFacts} />}

          {/* Fields de destaque por SHAPE (até 3) — SUPERSET genérico de facts;
              só aparece quando o curado NÃO setou facts (mutuamente exclusivos no
              ELO 1). Valor em JetBrains Mono; href vira link em NOVA ABA. */}
          {highlightFields.length > 0 && <CamposResumo fields={highlightFields} />}

          {/* Tira de mídia (até 4) — galeria compacta reusando o MediaGallery. */}
          {stripMedia.length > 0 && (
            <div className="mt-1.5">
              <MediaGallery media={stripMedia} max={4} />
            </div>
          )}
        </div>

        {result.url && (
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="h-6 px-1.5 text-[10px] text-muted-on-light hover:text-primary flex items-center gap-1 shrink-0"
            title={t('buscar.resultados.abrirNaFonte')}
          >
            <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
          </a>
        )}
      </div>

      {/* Ações + metadados técnicos compactos */}
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {isLocal && (
          <Link
            href={`/ficha/${result.entityId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            data-testid={`buscar-abrir-ficha-${result.entityId}`}
            className="h-6 px-2 text-[10px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
            {t('buscar.resultados.abrirFicha')}
          </Link>
        )}
        {isLocal &&
          enriquecimentoTargets.slice(0, 3).map((target) => (
            <button
              key={target.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEnriquecer(result, target);
              }}
              data-testid={`buscar-enriquecer-${result.entityId}-${target.key}`}
              className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1"
            >
              <Search className="w-3 h-3" strokeWidth={1.5} />
              {target.label}
            </button>
          ))}
        {/* Ação CONTEXTUAL que FUNCIONA: re-busca aprofundando com o valor
            extraído (CPF formatado, número, e-mail). Substitui o "Criar
            entidade" cego/morto. Rótulo do extractor diz o que faz; fallback
            genérico re-busca pelo próprio nome (nunca "sem fluxo"). */}
        {!isLocal && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCriar(result, fromSource);
            }}
            data-testid={`buscar-aprofundar-${groupKey}-${index}`}
            title={result.action?.value ?? result.name}
            className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1"
          >
            <Search className="w-3 h-3" strokeWidth={1.5} />
            {result.action?.label ?? t('buscar.acao.buscarComEsteResultado')}
          </button>
        )}
        {/* BUG (b): rodapé identifica a FONTE REAL (source.label). O kind só
            entra quando é um TIPO de entidade real — nunca o slug-fallback da
            fonte (que fingia ser nome de outra fonte, ex. "Youtube search"). */}
        <span className="ml-auto text-[9px] font-mono text-muted-on-light/70 uppercase truncate">
          {isRealEntityKind(result.kind, isLocal) && (
            <>{objectKindLabel(t, result.kind)} · </>
          )}
          {fromSource.label} · {t('buscar.resultados.origem')} &quot;{originQuery}&quot;
        </span>
      </div>
    </li>
  );
}

/**
 * Fatos contextuais como mini key-value (label MAIÚSCULO pequeno + valor).
 * `tone` colore SÓ o texto do valor — ok=primária (positivo discreto),
 * warn=danger — nunca um ícone colorido. `label` é chave i18n (resolvida via
 * useT()); `value` é dado cru (número, documento, site).
 */
export function Fatos({ facts }: { facts: NonNullable<NormalizedResult['facts']> }) {
  const t = useT();
  return (
    <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {facts.map((f, i) => (
        <div key={`${f.label}-${i}`} className="flex items-baseline gap-1 min-w-0">
          <dt className="text-[9px] uppercase tracking-wide text-muted-on-light/70 font-mono shrink-0">
            {t(f.label)}
          </dt>
          <dd
            className={cn(
              'text-[11px] font-mono truncate min-w-0',
              f.tone === 'ok' && 'text-primary',
              f.tone === 'warn' && 'text-danger',
              (!f.tone || f.tone === 'neutral') && 'text-text-on-light',
            )}
          >
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Fields de destaque (resumo compacto, no card). SUPERSET de `Fatos`: além de
 * `tone` (colore só o texto), suporta `href` — o valor vira link em NOVA ABA
 * (target=_blank rel=noopener). `label` é chave i18n (resolvida via useT(); o
 * fallback Title Case passa pelo t() intacto). Valor sempre em JetBrains Mono.
 */
export function CamposResumo({ fields }: { fields: NonNullable<NormalizedResult['fields']> }) {
  const t = useT();
  return (
    <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {fields.map((f, i) => (
        <div key={`${f.label}-${i}`} className="flex items-baseline gap-1 min-w-0">
          <dt className="text-[9px] uppercase tracking-wide text-muted-on-light/70 font-mono shrink-0">
            {t(f.label)}
          </dt>
          {f.href ? (
            <a
              href={f.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'text-[11px] font-mono truncate min-w-0 hover:underline',
                f.tone === 'warn' ? 'text-danger' : 'text-primary',
              )}
            >
              {f.value}
            </a>
          ) : (
            <dd
              className={cn(
                'text-[11px] font-mono truncate min-w-0',
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
