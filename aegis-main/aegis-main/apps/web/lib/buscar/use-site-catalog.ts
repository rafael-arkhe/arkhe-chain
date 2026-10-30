'use client';

/**
 * useSiteCatalog — carrega o CATÁLOGO de sites/categorias de uma fonte de fan-out
 * (FRENTE FE-A). Alimenta o multiselect-field: categorias agrupam as opções e os
 * templates (1 por category) são DERIVADOS daqui — zero hardcode de vertical.
 *
 * Contrato backend (verificado ao vivo):
 *   GET /api/search/fanout/sites?catalog=<NOME>[&include_nsfw=true]
 *     200 { categories:[{key,label}], sites:[{id,label,category,nsfw}], total }
 *   NOME = ui_fields[propKey].catalog ('maigret'|'maigret_paises'|'wmn'|'sherlock').
 *   PROVADO: maigret 65 cats/3129 sites · maigret_paises 73 · wmn 19/680 ·
 *   sherlock categories=[] / 413 sites (lista plana, sem agrupamento).
 *
 * Cache EM MEMÓRIA (module-level Map por `catalog|nsfw`) — NUNCA localStorage
 * (memória feedback_no_localstorage_for_persistence). includeNsfw=true é uma
 * chave de cache distinta (refetch). `catalog` vazio → no-op {categories:[],sites:[]}.
 * Fail-soft: erro vira {error} e listas vazias, nunca derruba a UI.
 */
import * as React from 'react';
import { apiFetch } from '@/lib/api/client';

export interface SiteCatalogCategory {
  key: string;
  label: string;
}
export interface SiteCatalogSite {
  id: string;
  label: string;
  category?: string;
  nsfw?: boolean;
}
export interface SiteCatalog {
  categories: SiteCatalogCategory[];
  sites: SiteCatalogSite[];
  total?: number;
}

export interface UseSiteCatalog {
  categories: SiteCatalogCategory[];
  sites: SiteCatalogSite[];
  loading: boolean;
  error: string | null;
}

const EMPTY: SiteCatalog = { categories: [], sites: [], total: 0 };

/** Cache module-level (vive enquanto o módulo está carregado). Chave: catalog|nsfw. */
const CACHE = new Map<string, Promise<SiteCatalog>>();

function cacheKey(catalog: string, includeNsfw: boolean): string {
  return `${catalog}|${includeNsfw ? '1' : '0'}`;
}

/** Busca (com cache) o catálogo de uma fonte. Exportado p/ teste do cache. */
export function fetchSiteCatalog(
  catalog: string,
  includeNsfw = false,
): Promise<SiteCatalog> {
  const key = cacheKey(catalog, includeNsfw);
  const hit = CACHE.get(key);
  if (hit) return hit;
  const qs = new URLSearchParams({ catalog });
  if (includeNsfw) qs.set('include_nsfw', 'true');
  const p = apiFetch<SiteCatalog>(`/search/fanout/sites?${qs.toString()}`)
    .then((r) => ({
      categories: r?.categories ?? [],
      sites: r?.sites ?? [],
      total: r?.total,
    }))
    .catch((e) => {
      // Não cacheia falha (permite retry numa próxima montagem).
      CACHE.delete(key);
      throw e;
    });
  CACHE.set(key, p);
  return p;
}

/** Limpa o cache em memória (test helper; nunca usado em produção). */
export function __clearSiteCatalogCache(): void {
  CACHE.clear();
}

export function useSiteCatalog(
  catalog: string | undefined,
  opts?: { includeNsfw?: boolean },
): UseSiteCatalog {
  const includeNsfw = !!opts?.includeNsfw;
  const [state, setState] = React.useState<UseSiteCatalog>({
    categories: [],
    sites: [],
    loading: !!catalog,
    error: null,
  });

  React.useEffect(() => {
    // catalog vazio → no-op (campo sem catálogo declarado).
    if (!catalog) {
      setState({ categories: [], sites: [], loading: false, error: null });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchSiteCatalog(catalog, includeNsfw)
      .then((c) => {
        if (!alive) return;
        setState({
          categories: c.categories,
          sites: c.sites,
          loading: false,
          error: null,
        });
      })
      .catch((e) => {
        if (!alive) return;
        setState({
          categories: [],
          sites: [],
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    return () => {
      alive = false;
    };
  }, [catalog, includeNsfw]);

  return state;
}

export const __EMPTY_CATALOG = EMPTY;
