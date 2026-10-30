'use client';

/**
 * /docs — Central de documentação do security-app (Wave D.3).
 *
 * Consome `GET /docs/tree` + `GET /docs/content?path=…` do
 * ontology-module (router `app/routers/docs.py`). Reflete os 500+
 * markdowns do monorepo no UI (memory rule
 * `feedback_sync_docs_to_ui`).
 *
 * Layout 2-pane: árvore expansível à esquerda · viewer markdown à
 * direita. Sem dependência a parser markdown externo — render
 * básico em `<pre>` preservando o source (parser visual pode subir
 * em fase posterior; o objetivo aqui é fazer aparecer).
 */
import * as React from 'react';
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  Loader2,
  Search,
} from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { Input } from '@/components/ui/input';
import { Docs, type DocsTreeNode, type DocsContentOut } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';


function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}


export default function DocsPage() {
  return (
    <RequirePerm perm="docs.tree.read">
      <DocsInner />
    </RequirePerm>
  );
}


function DocsInner() {
  const [tree, setTree] = React.useState<DocsTreeNode[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [content, setContent] = React.useState<DocsContentOut | null>(null);
  const [contentLoading, setContentLoading] = React.useState(false);
  const [filter, setFilter] = React.useState('');

  React.useEffect(() => {
    Docs.tree()
      .then((out) => setTree(out.tree))
      .catch((e) => setError(humanise(e)))
      .finally(() => setLoading(false));
  }, []);

  const loadContent = React.useCallback(async (path: string) => {
    setSelectedPath(path);
    setContentLoading(true);
    setError(null);
    try {
      const out = await Docs.content(path);
      setContent(out);
    } catch (e) {
      setError(humanise(e));
      setContent(null);
    } finally {
      setContentLoading(false);
    }
  }, []);

  const flatPaths = React.useMemo(() => {
    const out: { path: string; name: string }[] = [];
    function walk(nodes: DocsTreeNode[]) {
      for (const n of nodes) {
        if (n.type === 'file' && n.path) {
          out.push({ path: n.path, name: n.name });
        } else if (n.children) {
          walk(n.children);
        }
      }
    }
    walk(tree);
    return out;
  }, [tree]);

  const filteredFlat = React.useMemo(() => {
    if (!filter.trim()) return [];
    const q = filter.toLowerCase();
    return flatPaths.filter(
      (f) => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q),
    );
  }, [filter, flatPaths]);

  return (
    <div
      data-testid="docs-page"
      className="h-full flex flex-col bg-canvas-light text-text-on-light"
    >
      <header className="flex items-center gap-3 px-6 py-3 border-b border-border-light bg-white">
        <BookOpen className="w-4 h-4 text-primary" strokeWidth={1.5} />
        <h1 className="text-[18px] font-semibold text-text-on-light">
          Documentação
        </h1>
        <span className="text-[11px] font-mono text-muted-on-light">
          {flatPaths.length} documento{flatPaths.length === 1 ? '' : 's'}
        </span>
        <div className="ml-auto relative">
          <Search
            className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light"
            strokeWidth={1.5}
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar documentos…"
            className="h-7 pl-6 w-[280px] text-[12px] rounded-none"
            data-testid="docs-filter"
          />
        </div>
      </header>

      {error && (
        <div
          className="px-6 py-2 text-[12px] text-danger bg-danger/5 border-b border-danger/30"
          data-testid="docs-error"
        >
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-[320px_1fr] overflow-hidden">
        <aside
          className="border-r border-border-light bg-white overflow-y-auto"
          data-testid="docs-tree"
        >
          {loading && (
            <div className="p-3 text-[11px] text-muted-on-light italic flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
              Carregando árvore…
            </div>
          )}
          {!loading && filteredFlat.length > 0 && (
            <ul data-testid="docs-filter-results">
              {filteredFlat.map((f) => (
                <li key={f.path} className="border-b border-border-light">
                  <button
                    type="button"
                    onClick={() => loadContent(f.path)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-[11px] hover:bg-canvas-light',
                      selectedPath === f.path && 'bg-panel-light',
                    )}
                  >
                    <span className="font-mono text-muted-on-light">
                      {f.path}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && filteredFlat.length === 0 && (
            <TreeView
              nodes={tree}
              depth={0}
              selectedPath={selectedPath}
              onSelect={loadContent}
            />
          )}
        </aside>

        <section className="overflow-y-auto" data-testid="docs-viewer">
          {!selectedPath && (
            <div className="p-10 text-center text-[12px] text-muted-on-light italic">
              Selecione um documento na árvore à esquerda para visualizar.
            </div>
          )}
          {contentLoading && (
            <div className="p-10 flex items-center justify-center gap-2 text-[12px] text-muted-on-light">
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
              Carregando documento…
            </div>
          )}
          {content && !contentLoading && (
            <article className="px-6 py-5">
              <header className="mb-3 pb-3 border-b border-border-light">
                <p className="text-[10px] font-mono text-muted-on-light">
                  {content.path}
                </p>
                <p className="text-[10px] font-mono text-muted-on-light">
                  {content.byteSize.toLocaleString('pt-BR')} bytes
                </p>
              </header>
              <pre
                className="text-[12px] font-mono text-text-on-light whitespace-pre-wrap break-words"
                data-testid="docs-content"
              >
                {content.markdown}
              </pre>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}


function TreeView({
  nodes,
  depth,
  selectedPath,
  onSelect,
}: {
  nodes: DocsTreeNode[];
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <ul>
      {nodes.map((n, idx) => (
        <TreeNode
          key={n.path || `${depth}-${idx}-${n.name}`}
          node={n}
          depth={depth}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}


function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: DocsTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = React.useState(depth === 0);
  const isFile = node.type === 'file';
  const indent = { paddingLeft: `${8 + depth * 12}px` };

  if (isFile && node.path) {
    return (
      <li className="border-b border-border-light">
        <button
          type="button"
          style={indent}
          onClick={() => onSelect(node.path!)}
          className={cn(
            'w-full text-left flex items-center gap-2 py-1.5 text-[11px] hover:bg-canvas-light',
            selectedPath === node.path && 'bg-panel-light',
          )}
          data-testid={`docs-file-${node.path}`}
        >
          <FileText
            className="w-3 h-3 text-muted-on-light shrink-0"
            strokeWidth={1.5}
          />
          <span className="text-text-on-light truncate">{node.name}</span>
        </button>
      </li>
    );
  }

  return (
    <li className="border-b border-border-light">
      <button
        type="button"
        style={indent}
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-center gap-1 py-1.5 text-[11px] font-semibold hover:bg-canvas-light"
        data-testid={`docs-folder-${node.name}`}
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        )}
        <Folder className="w-3 h-3 text-primary" strokeWidth={1.5} />
        <span className="text-text-on-light truncate">{node.name}</span>
      </button>
      {open && node.children && (
        <TreeView
          nodes={node.children}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      )}
    </li>
  );
}
