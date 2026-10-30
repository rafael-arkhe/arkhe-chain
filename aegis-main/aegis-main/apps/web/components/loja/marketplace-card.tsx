'use client';

/**
 * Onda I.3 — MarketplaceCard: o card rico do catálogo da Loja.
 *
 * Operador feedback #9: "os cards ainda não estão 100% claros! Usa o quê?
 * quais da ontologia, que datasource, que projeto, que base precisa". Este
 * card resolve isso mostrando, sem precisar abrir o detalhe:
 *
 *   thumbnail + título + versão
 *   autor · rating · downloads
 *   chips de tipos da ontologia (3 + «+N»)
 *   chips de datasources (2 + «+N»)
 *   badge "Requer Operação" quando requer_projeto/espaço
 *   rodapé: categoria + estado (instalado / ver detalhes)
 *
 * Composição pura sobre OntologyContextChips + DataSourceList (mesma fonte
 * de verdade do detail pane). Sem rounded, sem Sparkles, sem emoji, sem
 * nome de produto interno (`feedback_no_rounded_no_sparkles`,
 * `feedback_no_emojis_in_ui`, `feedback_no_palantir_product_names`).
 */
import * as React from 'react';
import {
  CheckCircle2,
  Download,
  FolderTree,
  Image as ImageIcon,
  Star,
} from 'lucide-react';
import type { MarketplaceProductRich } from '@/lib/api';
import { cn } from '@/lib/cn';
import { OntologyContextChips } from './ontology-context-chips';
import { DataSourceList } from './datasource-list';

const CATEGORY_LABEL: Record<string, string> = {
  app: 'Apps',
  dashboard: 'Dashboards',
  pipeline: 'Pipelines',
  ontology: 'Ontologia',
};

export interface MarketplaceCardProps {
  product: MarketplaceProductRich;
  selected: boolean;
  installed: boolean;
  onClick: () => void;
}

export function MarketplaceCard({
  product,
  selected,
  installed,
  onClick,
}: MarketplaceCardProps): React.ReactElement {
  const requerOperacao = product.requer_projeto || product.requer_espaco;
  return (
    // h-full faz cada <li> esticar à altura da linha; o card define uma
    // altura fixa única (h-[304px]) para que NENHUM card varie por nível de
    // metadado renderizado — as zonas de chips/badge têm slot reservado e o
    // rodapé é fixado ao fundo via mt-auto.
    <li className="h-full">
      <button
        type="button"
        data-testid={`loja-card-${product.slug}`}
        onClick={onClick}
        aria-pressed={selected}
        aria-label={`Ver detalhes de ${product.display_name}`}
        className={cn(
          // Altura fixa única (h-[304px]) + overflow-hidden garante que
          // NENHUM card cresça por volume de metadado: as zonas variáveis
          // (chips/badge) têm slot reservado e qualquer excesso é recortado,
          // então a grade fica perfeitamente uniforme entre todos os cards.
          'w-full h-[304px] overflow-hidden text-left bg-white border border-border-light p-3 flex flex-col gap-2',
          'hover:border-primary/60 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1',
          selected && 'border-primary ring-1 ring-primary/40',
        )}
      >
        {/* Thumbnail */}
        <div className="h-24 w-full shrink-0 border border-border-light bg-canvas-light flex items-center justify-center overflow-hidden">
          {product.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.thumbnail_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon
              className="w-6 h-6 text-muted-on-light"
              strokeWidth={1.5}
              aria-hidden
            />
          )}
        </div>

        {/* Title + version */}
        <div className="flex items-start justify-between gap-2 shrink-0">
          <span className="text-[13px] font-semibold text-text-on-light truncate">
            {product.display_name}
          </span>
          <span className="text-[10px] font-mono text-muted-on-light shrink-0">
            v{product.version}
          </span>
        </div>

        {/* Author + rating + downloads */}
        <div className="flex items-center gap-3 text-[10.5px] text-muted-on-light shrink-0">
          {product.author && (
            <span
              className="truncate"
              data-testid={`loja-card-author-${product.slug}`}
            >
              {product.author}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <RatingStars value={product.rating} />
            <span className="ml-1">{product.rating.toFixed(1)}</span>
          </span>
          <span
            className="flex items-center gap-1"
            data-testid={`loja-card-downloads-${product.slug}`}
          >
            <Download className="w-3 h-3" strokeWidth={1.5} aria-hidden />
            {product.downloads_count}
          </span>
        </div>

        {/* Ontologia — chips compactos (slot de 1 linha reservado, recorta
            o excesso para a altura nunca crescer) */}
        <div
          data-testid={`loja-card-ontology-${product.slug}`}
          className="h-5 shrink-0 overflow-hidden"
        >
          <OntologyContextChips
            tipos={product.usa_ontologia_tipos}
            variant="compact"
            maxVisible={3}
            testIdPrefix={`loja-card-ontology-${product.slug}`}
          />
        </div>

        {/* Datasources — chips compactos (slot de 1 linha reservado) */}
        <div
          data-testid={`loja-card-datasource-${product.slug}`}
          className="h-5 shrink-0 overflow-hidden"
        >
          <DataSourceList
            datasources={product.usa_datasources}
            variant="compact"
            maxVisible={2}
            testIdPrefix={`loja-card-datasource-${product.slug}`}
          />
        </div>

        {/* Badge Requer Operação — slot de altura fixa sempre reservado,
            mantendo o rodapé alinhado mesmo quando o produto não requer. */}
        <div className="h-5 shrink-0">
          {requerOperacao && (
            <span
              data-testid={`loja-card-requer-operacao-${product.slug}`}
              className="h-5 self-start px-1.5 text-[10px] inline-flex items-center gap-1 border bg-warning text-text-on-light border-warning"
              title="Requer uma Operação (e/ou Espaço) próprio para funcionar"
            >
              <FolderTree className="w-2.5 h-2.5" strokeWidth={1.5} aria-hidden />
              Requer Operação
            </span>
          )}
        </div>

        {/* Footer — fixado ao fundo do card */}
        <div className="mt-auto flex items-center justify-between pt-1 border-t border-border-light shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
            {(product.category && CATEGORY_LABEL[product.category]) ||
              product.category ||
              '—'}
          </span>
          {installed ? (
            <span
              data-testid={`loja-card-installed-${product.slug}`}
              className="text-[10.5px] text-success flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} aria-hidden />
              Instalado
            </span>
          ) : (
            <span className="text-[10.5px] text-primary font-medium">
              Ver detalhes
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function RatingStars({ value }: { value: number }) {
  const n = Math.round(value);
  return (
    <span
      className="inline-flex items-center"
      aria-label={`Avaliação ${value} de 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          className={cn('w-3 h-3', i < n ? 'text-warning' : 'text-border-light')}
          fill={i < n ? 'currentColor' : 'none'}
          strokeWidth={1.5}
          aria-hidden
        />
      ))}
    </span>
  );
}
