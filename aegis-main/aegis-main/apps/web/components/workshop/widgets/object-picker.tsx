'use client';

/**
 * Object Picker (Sprint G1 do Parity Audit, 2026-05-21).
 *
 * Permite ao operador buscar um node da ontologia AEGIS (por `node_type`) e
 * selecioná-lo com 1 click. Ao selecionar, escreve o NODE COMPLETO
 * (id, name, node_type, properties, schema_definition) numa variable de
 * destino. Outros widgets (property_list, object_view, transformations)
 * consomem essa variable e exibem dados reais da ontologia.
 *
 * Fecha o gap apontado pelo operador: templates como "Dossiê de pessoa"
 * antes tinham widgets com `source: "entity_props"` sem variable
 * correspondente — agora o operador escolhe a pessoa via picker e a
 * variable é populada automaticamente.
 *
 * Config:
 *   - `node_type` (string) — tipo da ontologia (ex.: 'parlamentar', 'pessoa')
 *   - `target` (variable-ref) — external_id da variable destino
 *   - `placeholder` (string, opcional)
 *   - `label` (string, opcional) — título acima
 *   - `limit` (number, opcional, default 50)
 *
 * Backend: `GET /ontology/nodes?node_type=X&q=texto&limit=50` com
 * busca case-insensitive em `name` + `properties::text` (Fix2-Backend).
 */
import * as React from 'react';
import { Box, Check, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Ontology } from '@/lib/api';
import type { OntologyNode } from '@/lib/api/types';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  node_type?: string;
  target?: string;
  placeholder?: string;
  label?: string;
  limit?: number;
};

function ObjectPicker({ config, bindings, setBinding, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const nodeType = cfg.node_type ?? '';
  const target = cfg.target ?? '';
  const limit = typeof cfg.limit === 'number' && cfg.limit > 0 ? cfg.limit : 50;

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<OntologyNode[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selected: lemos do binding pra mostrar o chip do escolhido.
  const selected = target ? bindings[target] : undefined;
  const selectedObj =
    selected && typeof selected === 'object' && 'id' in (selected as object)
      ? (selected as OntologyNode)
      : null;

  const runSearch = React.useCallback(
    async (text: string) => {
      if (!nodeType) {
        setError('Configure "Tipo de objeto" no Inspector.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const rows = await Ontology.listNodes({
          node_type: nodeType,
          q: text.trim() || undefined,
          limit,
        });
        setResults(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao buscar.');
      } finally {
        setLoading(false);
      }
    },
    [nodeType, limit],
  );

  // Initial load on open
  React.useEffect(() => {
    if (open && results.length === 0 && !loading) {
      void runSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounce na busca
  const onQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(text), 250);
  };

  const select = (node: OntologyNode) => {
    if (!target) return;
    setBinding(target, node);
    emit?.('select_change', { value: node, target });
    setOpen(false);
    setQuery('');
  };

  const clear = () => {
    if (!target) return;
    setBinding(target, null);
    emit?.('select_change', { value: null, target });
  };

  if (!nodeType || !target) {
    return (
      <div className="bg-white border border-border-light p-2 text-[11px] text-muted-on-light italic">
        Configure <strong>Tipo de objeto</strong> e <strong>Dado destino</strong> no Inspector.
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-light flex flex-col" data-testid="object-picker">
      {cfg.label && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono">
            {cfg.label}
          </p>
        </header>
      )}
      <div className="p-2 flex flex-col gap-1.5">
        {selectedObj ? (
          <div
            className="flex items-center gap-2 px-2 py-1.5 bg-primary/5 border border-primary/30"
            data-testid="object-picker-selected"
          >
            <Box className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium truncate text-text-on-light">
                {selectedObj.name || selectedObj.id}
              </p>
              <p className="text-[10px] text-muted-on-light font-mono truncate">
                {nodeType} · {selectedObj.id}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
              data-testid="object-picker-change"
            >
              Trocar
            </button>
            <button
              type="button"
              onClick={clear}
              aria-label="Limpar seleção"
              className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger"
              data-testid="object-picker-clear"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="object-picker-open"
            className="h-8 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary text-text-on-light flex items-center gap-1.5 justify-center"
          >
            <Search className="w-3 h-3" strokeWidth={1.5} />
            {cfg.placeholder ?? `Buscar ${nodeType}…`}
          </button>
        )}
      </div>

      {open && (
        <Dropdown
          nodeType={nodeType}
          query={query}
          onQueryChange={onQueryChange}
          loading={loading}
          error={error}
          results={results}
          onSelect={select}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function Dropdown({
  nodeType,
  query,
  onQueryChange,
  loading,
  error,
  results,
  onSelect,
  onClose,
}: {
  nodeType: string;
  query: string;
  onQueryChange: (s: string) => void;
  loading: boolean;
  error: string | null;
  results: OntologyNode[];
  onSelect: (n: OntologyNode) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-30"
        data-testid="object-picker-backdrop"
      />
      <div
        className="absolute z-40 mt-1 bg-canvas-light border border-border-light shadow-xl w-full max-w-[480px] flex flex-col overflow-hidden"
        data-testid="object-picker-dropdown"
      >
        <div className="px-2 py-1.5 border-b border-border-light bg-raised-light/30">
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light pointer-events-none"
              strokeWidth={1.5}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={`Buscar ${nodeType}…`}
              autoFocus
              data-testid="object-picker-input"
              className="w-full h-7 pl-7 pr-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {loading && (
            <div className="px-3 py-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-on-light">
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
              Buscando…
            </div>
          )}
          {error && (
            <p className="m-2 px-2 py-1.5 text-[10.5px] text-danger bg-danger/5 border border-danger/40">
              {error}
            </p>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="px-3 py-4 text-center text-[11px] text-muted-on-light italic">
              {query
                ? `Nenhum ${nodeType} casa com "${query}".`
                : `Nenhum objeto do tipo ${nodeType} encontrado.`}
            </p>
          )}
          {results.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node)}
              data-testid={`object-picker-result-${node.id}`}
              className={cn(
                'w-full px-2 py-1.5 text-left flex items-center gap-2 border-b border-border-light/40 last:border-b-0 hover:bg-primary/5',
              )}
            >
              <Box className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-text-on-light truncate">
                  {node.name || node.id}
                </p>
                <p className="text-[10px] text-muted-on-light/70 font-mono truncate">
                  {node.id}
                </p>
              </div>
              <Check className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary" strokeWidth={1.5} />
            </button>
          ))}
        </div>
        <footer className="px-2 py-1 border-t border-border-light/60 text-[10px] text-muted-on-light bg-raised-light/30">
          {results.length} resultado{results.length === 1 ? '' : 's'} · Esc para fechar
        </footer>
      </div>
    </>
  );
}

registerWidget('object_picker', ObjectPicker, {
  group: 'data',
  label: 'Buscar objeto (ontologia)',
  description:
    'Buscador interativo de objetos da ontologia. Operador escolhe um objeto e o widget grava o objeto completo (id, nome, propriedades) num dado destino — outros widgets consomem.',
  icon: 'search',
  defaultColSpan: 12,
  mockConfig: {
    node_type: 'parlamentar',
    target: 'selected',
    label: 'Selecione um parlamentar',
    placeholder: 'Buscar parlamentar…',
    limit: 50,
  },
  mockVariables: {},
  previewWidth: 480,
  previewHeight: 200,
  config_schema: [
    {
      name: 'label',
      label: 'Título (opcional)',
      field: 'string',
      placeholder: 'Selecione um objeto',
    },
    {
      name: 'node_type',
      label: 'Tipo de objeto',
      description: 'Tipo da ontologia que o operador vai poder escolher.',
      field: 'node-type',
    },
    {
      name: 'target',
      label: 'Dado destino',
      description: 'ID do dado onde o objeto escolhido será gravado (com todas as propriedades).',
      field: 'variable-ref',
    },
    {
      name: 'placeholder',
      label: 'Texto do botão de busca',
      field: 'string',
      placeholder: 'Buscar parlamentar…',
    },
    {
      name: 'limit',
      label: 'Limite de resultados',
      description: 'Quantos resultados mostrar no dropdown (default 50).',
      field: 'string',
      placeholder: '50',
    },
  ],
});
