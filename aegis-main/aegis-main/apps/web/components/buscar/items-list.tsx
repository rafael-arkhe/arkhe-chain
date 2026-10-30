'use client';

/**
 * <ItemsList /> — lista de sub-resultados (P2 ELO 2).
 *
 * Consome `NormalizedResult['items']` (a COLEÇÃO embutida detectada por SHAPE no
 * ELO 1: sites de um username, posts de um perfil, sócios de um CNPJ, focos de
 * calor…). Cada linha:
 *   - miniatura pequena (se houver) — LAZY + onError oculta a quebrada;
 *   - nome (vira link em NOVA ABA quando há URL);
 *   - subtitle + até 2 fields curtos (rótulo i18n + valor em JetBrains Mono);
 *   - ícone de link externo (NOVA ABA — `target="_blank" rel="noopener noreferrer"`).
 *
 * Caso username-enum (item só com site + url) cai naturalmente numa lista
 * compacta de sites clicáveis. MULTIDOMÍNIO: zero substantivo fixo.
 *
 * Reuso: o DetalheObjeto renderiza a lista completa; o `max` permite recortes.
 */
import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import type { NormalizedResult } from '@/lib/buscar/types';

const HTTP_RE = /^https?:\/\//i;

function toneClass(tone?: 'ok' | 'warn' | 'neutral'): string {
  if (tone === 'ok') return 'text-primary';
  if (tone === 'warn') return 'text-danger';
  return 'text-text-on-light';
}

export function ItemsList({ items, max }: { items: NormalizedResult[]; max?: number }) {
  const shown = typeof max === 'number' ? items.slice(0, max) : items;
  if (shown.length === 0) return null;
  return (
    <ul
      data-testid="buscar-itens"
      className="border border-border-light divide-y divide-border-light"
    >
      {shown.map((it, i) => (
        <ItemRow key={`${it.externalId}-${i}`} item={it} index={i} />
      ))}
    </ul>
  );
}

function ItemRow({ item, index }: { item: NormalizedResult; index: number }) {
  const t = useT();
  const thumb =
    item.thumbnail && HTTP_RE.test(item.thumbnail)
      ? item.thumbnail
      : (item.media?.find((m) => m.thumbnail && HTTP_RE.test(m.thumbnail))?.thumbnail ??
        item.media?.find((m) => m.kind === 'image' && HTTP_RE.test(m.url))?.url);
  const href = item.url && HTTP_RE.test(item.url) ? item.url : undefined;
  const briefFields = (item.fields ?? []).slice(0, 2);

  return (
    <li
      data-testid={`buscar-item-${index}`}
      className="flex items-start gap-2 px-2 py-1.5 bg-white"
    >
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-8 h-8 object-cover border border-border-light shrink-0 bg-raised-light"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}

      <div className="flex-1 min-w-0">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] font-medium text-text-on-light hover:text-primary truncate block"
          >
            {item.name}
          </a>
        ) : (
          <span className="text-[11px] font-medium text-text-on-light truncate block">
            {item.name}
          </span>
        )}

        {item.subtitle && (
          <p className="text-[10px] text-muted-on-light truncate">{item.subtitle}</p>
        )}

        {briefFields.length > 0 && (
          <dl className="flex flex-wrap gap-x-2 gap-y-0 mt-0.5">
            {briefFields.map((f, fi) => (
              <div key={`${f.label}-${fi}`} className="flex items-baseline gap-1 min-w-0">
                <dt className="text-[9px] uppercase tracking-wide text-muted-on-light/70 font-mono shrink-0">
                  {t(f.label)}
                </dt>
                <dd className={cn('text-[10px] font-mono truncate min-w-0', toneClass(f.tone))}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={t('buscar.resultados.abrirNaFonte')}
          className="shrink-0 h-5 px-1 text-muted-on-light hover:text-primary flex items-center"
        >
          <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
        </a>
      )}
    </li>
  );
}
