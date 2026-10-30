/**
 * #2 — busca + filtros da lista de Documentos (compartilhada /relatorios +
 * /briefings). Categorização DERIVADA do que já existe (classificação + marcações),
 * sem campo novo no backend. Núcleo puro/testável.
 */
import type { NotepadDoc } from '@/lib/api';

export type DocStateFilter = '' | 'signed' | 'draft';

export interface DocFilter {
  /** Busca textual: título, slug, marcações, classificação. */
  query?: string;
  /** Filtra por um nível de classificação ('' = todos). */
  classification?: string;
  /** Filtra por estado: selado / rascunho ('' = todos). */
  state?: DocStateFilter;
}

/** Aplica busca + filtros (categorização derivada). */
export function filterDocs(docs: NotepadDoc[], f: DocFilter): NotepadDoc[] {
  const q = (f.query || '').trim().toLowerCase();
  return docs.filter((d) => {
    if (f.classification && d.classification_level !== f.classification) return false;
    if (f.state === 'signed' && !d.signed) return false;
    if (f.state === 'draft' && d.signed) return false;
    if (q) {
      const hay = [d.title, d.slug, ...(d.markings || []), d.classification_level || '']
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Ordem canônica: fixados primeiro, depois alfabético. */
export function orderDocs(docs: NotepadDoc[]): NotepadDoc[] {
  return [...docs].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title),
  );
}

/** Há algum filtro ativo? (decide o estado vazio: "nenhum doc" vs "nada bate"). */
export function hasActiveFilter(f: DocFilter): boolean {
  return !!((f.query && f.query.trim()) || f.classification || f.state);
}
