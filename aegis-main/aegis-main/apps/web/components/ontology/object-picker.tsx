'use client';

/**
 * <ObjectPicker> STANDALONE (P4 ELO 2, 2026-06-27).
 *
 * Buscador reusável de objetos canônicos da ontologia (OntologyNode) por
 * `node_type` + texto, com debounce. Pré-popula a busca com um `seed` (ex.: o
 * valor extraído de um resultado do /buscar) e devolve o NODE COMPLETO ao
 * `onPick`. Opcionalmente oferece "Criar novo objeto" (`allowCreate`).
 *
 * Extraído do padrão de components/workshop/widgets/object-picker.tsx, mas
 * SEM o acoplamento ao WorkshopV2Renderer (bindings/setBinding/emit) — é um
 * painel inline puro, consumível por qualquer fluxo (merge, ficha, vínculos).
 * ADD-alongside: o widget do Workshop segue intacto.
 *
 * DOMÍNIO-AGNÓSTICO: opera sobre `node_type` (DADO), nunca um vertical fixo.
 *
 * data-testids: object-picker, object-picker-input, object-picker-result-<id>,
 *   object-picker-create, object-picker-empty, object-picker-loading,
 *   object-picker-error.
 */
import * as React from 'react';
import { Box, Loader2, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { Ontology } from '@/lib/api';
import type { OntologyNode } from '@/lib/api/types';

export interface ObjectPickerProps {
  /** Tipo de objeto da ontologia em que a busca é escopada. Sem ele, lista o
   *  universo (o backend ainda filtra por marking/tenant). */
  node_type?: string;
  /** Busca pré-populada (ex.: nome/seletor vindo de um resultado). */
  seed?: { kind?: string; value: string };
  /** Chamado com o objeto escolhido. */
  onPick: (node: OntologyNode) => void;
  /** Quando `allowCreate`, chamado ao clicar "Criar novo objeto". */
  onCreateNew?: () => void;
  /** Mostra a opção "Criar novo objeto" no rodapé da lista. */
  allowCreate?: boolean;
  /** Placeholder do input (chave i18n já resolvida tem precedência). */
  placeholder?: string;
  /** Quantos resultados pedir (default 25). */
  limit?: number;
  /** Foca o input ao montar. */
  autoFocus?: boolean;
}

export function ObjectPicker({
  node_type,
  seed,
  onPick,
  onCreateNew,
  allowCreate = false,
  placeholder,
  limit = 25,
  autoFocus = true,
}: ObjectPickerProps) {
  const t = useT();
  const [query, setQuery] = React.useState(seed?.value ?? '');
  const [results, setResults] = React.useState<OntologyNode[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = React.useCallback(
    async (text: string) => {
      setLoading(true);
      setError(null);
      try {
        const rows = await Ontology.listNodes({
          node_type: node_type || undefined,
          q: text.trim() || undefined,
          limit,
        });
        setResults(rows);
      } catch {
        setError(t('buscar.merge.picker.erro'));
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [node_type, limit, t],
  );

  // Busca inicial (pré-populada pelo seed) + re-busca quando o tipo muda.
  React.useEffect(() => {
    void runSearch(seed?.value ?? '');
    // seed.value é a semente estável da pré-busca; runSearch carrega node_type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node_type, seed?.value]);

  const onQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(text), 250);
  };

  return (
    <div className="bg-white border border-border-light flex flex-col" data-testid="object-picker">
      <div className="p-2 border-b border-border-light bg-raised-light/30">
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light pointer-events-none"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder ?? t('buscar.merge.picker.placeholder')}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={autoFocus}
            data-testid="object-picker-input"
            className="w-full h-8 pl-7 pr-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="max-h-[280px] overflow-y-auto scrollbar-hide">
        {loading && (
          <div
            data-testid="object-picker-loading"
            className="px-3 py-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-on-light"
          >
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            {t('buscar.merge.picker.buscando')}
          </div>
        )}
        {!loading && error && (
          <p
            data-testid="object-picker-error"
            className="m-2 px-2 py-1.5 text-[10.5px] text-danger bg-danger/5 border border-danger/40"
          >
            {error}
          </p>
        )}
        {!loading && !error && results.length === 0 && (
          <p
            data-testid="object-picker-empty"
            className="px-3 py-4 text-center text-[11px] text-muted-on-light"
          >
            {t('buscar.merge.picker.vazio')}
          </p>
        )}
        {!loading &&
          !error &&
          results.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onPick(node)}
              data-testid={`object-picker-result-${node.id}`}
              className={cn(
                'w-full px-2 py-1.5 text-left flex items-center gap-2',
                'border-b border-border-light/40 last:border-b-0 hover:bg-primary/5',
              )}
            >
              <Box className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-text-on-light truncate">{node.name || node.id}</p>
                <p className="text-[10px] text-muted-on-light/70 font-mono truncate">{node.id}</p>
              </div>
            </button>
          ))}
      </div>

      {allowCreate && (
        <button
          type="button"
          onClick={() => onCreateNew?.()}
          data-testid="object-picker-create"
          className="h-8 px-3 border-t border-border-light text-[11px] text-primary bg-canvas-light hover:bg-primary/5 flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t('buscar.merge.picker.criarNovo')}
        </button>
      )}
    </div>
  );
}
