/**
 * §C C2-C4 (/cameras) — helpers PUROS de filtro/busca para listas escaláveis.
 *
 * Sem I/O: a UI só renderiza o resultado. Cobrem a BUSCA livre client-side
 * dos streams, a derivação de cidades para o dropdown e o filtro por kind +
 * busca dos grupos de detecção IA. Contrato em __tests__/camera-filters.test.ts.
 */

/**
 * Busca livre sobre streams: casa a query (trim + lowercase) contra
 * [name, city, source_type, ...tags] concatenados e lowercased.
 * Query vazia/em branco → retorna tudo.
 */
export function filterStreams<
  T extends {
    name: string;
    city?: string | null;
    tags?: string[] | null;
    source_type?: string | null;
  },
>(streams: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return streams;
  return streams.filter((s) => {
    const haystack = [s.name, s.city, s.source_type, ...(s.tags ?? [])]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Cidades únicas, trimadas, não-vazias, ordenadas ascendentemente — para o
 * dropdown de filtro por cidade.
 */
export function deriveCities<T extends { city?: string | null }>(
  streams: T[],
): string[] {
  const seen = new Set<string>();
  for (const s of streams) {
    const city = (s.city ?? '').trim();
    if (city) seen.add(city);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

/**
 * Filtro dos grupos de detecção IA por kind e/ou busca livre (combinam com AND):
 * - kind definido e !== "all" → mantém grupos cujo sample.kind === kind;
 * - query não-branca → mantém grupos cujo [sample.label, entity_id] concatenados
 *   e lowercased contêm a query.
 */
export function filterDetectionGroups<
  T extends {
    entity_id?: string | null;
    sample: { kind: string; label?: string | null };
  },
>(groups: T[], opts: { query?: string; kind?: string }): T[] {
  const kind = opts.kind;
  const q = (opts.query ?? '').trim().toLowerCase();
  return groups.filter((g) => {
    if (kind && kind !== 'all' && g.sample.kind !== kind) return false;
    if (q) {
      const haystack = [g.sample.label, g.entity_id]
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
