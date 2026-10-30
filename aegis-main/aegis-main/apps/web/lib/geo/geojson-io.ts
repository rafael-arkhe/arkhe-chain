/**
 * Import/export GeoJSON do Construtor de Camadas — funções PURAS (sem DOM,
 * sem rede), o que deixa o round-trip testável e o widget burro.
 *
 * Contrato da linha do dataset (o backend valida o mesmo em
 * `app/services/geo_layers.py`): `{id, nome, categoria, descricao, geometry
 * GeoJSON [lng,lat], geo_style}`. O `id` é estável — republicar faz upsert por
 * ele, então importar duas vezes não duplica a feição.
 */

/** Estilo por feição — viaja verbatim até `properties.geo_style` do nó e é o
 *  que o Cesium do /geo lê pra desenhar cor/opacidade/extrusão. */
export interface FeatureStyle {
  color?: string;
  alpha?: number;
  extruded_height?: number;
  base_height?: number;
  outline_color?: string;
  outline_width?: number;
}

export interface FeatureRow {
  id: string;
  nome?: string;
  categoria?: string;
  descricao?: string;
  geometry: GeoJSON.Geometry;
  geo_style?: FeatureStyle;
}

/** Tipos que o pipeline sabe posicionar (o resto é descartado no import). */
const SUPPORTED = new Set([
  'Point',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
]);

/** Propriedades comuns de export do My Maps/QGIS pro nome da feição. */
const NAME_KEYS = ['nome', 'name', 'Name', 'title', 'titulo', 'label'];
const CATEGORY_KEYS = ['categoria', 'category', 'layer', 'camada', 'tipo', 'type'];
const DESC_KEYS = ['descricao', 'description', 'Description', 'desc', 'obs'];

function pick(props: Record<string, unknown> | null | undefined, keys: string[]): string | undefined {
  if (!props) return undefined;
  for (const k of keys) {
    const v = props[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

function isPosition(p: unknown): p is [number, number] {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
  );
}

/** Geometria utilizável? (o mesmo crivo do backend, para o operador ver o
 *  descarte na hora do import em vez de tomar 422 ao salvar). */
export function isUsableGeometry(geom: unknown): geom is GeoJSON.Geometry {
  const g = geom as GeoJSON.Geometry | null;
  if (!g || typeof g !== 'object' || !SUPPORTED.has(g.type)) return false;
  const c = (g as { coordinates?: unknown }).coordinates;
  if (g.type === 'Point') return isPosition(c);
  if (g.type === 'LineString') return Array.isArray(c) && c.length >= 2 && c.every(isPosition);
  if (g.type === 'MultiLineString') {
    return Array.isArray(c) && c.length > 0
      && c.every((l) => Array.isArray(l) && l.length >= 2 && l.every(isPosition));
  }
  if (g.type === 'Polygon') {
    return Array.isArray(c) && c.length > 0
      && c.every((r) => Array.isArray(r) && r.length >= 3 && r.every(isPosition));
  }
  // MultiPolygon
  return Array.isArray(c) && c.length > 0
    && c.every((p) => Array.isArray(p) && p.length > 0
      && p.every((r) => Array.isArray(r) && r.length >= 3 && r.every(isPosition)));
}

/** Formato de id que o backend aceita (`app/routers/geo_layers.py`:FeatureRowIn). */
const BACKEND_ID = /^[A-Za-z0-9_\-:.]{1,64}$/;

/** id curto e estável de feição (`f-` + 8 hex). Determinístico só no formato —
 *  a identidade vem daqui e acompanha a feição por toda a vida dela. */
export function newFeatureId(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `f-${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export interface ImportResult {
  rows: FeatureRow[];
  /** Feições descartadas por geometria não suportada/degenerada — a UI mostra
   *  o número em vez de sumir com o dado em silêncio. */
  skipped: number;
}

/**
 * FeatureCollection (export do My Maps, QGIS, KML convertido…) → linhas da
 * camada. `defaultCategoria` entra quando a feição não traz categoria própria
 * — é como o operador separa "Tráfico de Drogas" de "Cruzamentos" na mesma
 * importação. Ids existentes (`properties.id` no formato `f-…`) são
 * PRESERVADOS para o republish atualizar em vez de duplicar.
 */
export function featureCollectionToRows(
  fc: unknown,
  opts: { defaultCategoria?: string; style?: FeatureStyle } = {},
): ImportResult {
  // Aceita FeatureCollection, uma Feature avulsa (saída rotineira de
  // QGIS/ogr2ogr quando se exporta uma forma só) ou uma geometria nua — o
  // operador não deveria ver "nenhuma feição utilizável" num arquivo válido.
  const raw = fc as GeoJSON.FeatureCollection | GeoJSON.Feature | GeoJSON.Geometry | null;
  let feats: GeoJSON.Feature[] = [];
  if (raw && typeof raw === 'object') {
    if (raw.type === 'FeatureCollection' && Array.isArray(raw.features)) {
      feats = raw.features;
    } else if (raw.type === 'Feature') {
      feats = [raw as GeoJSON.Feature];
    } else if (isUsableGeometry(raw)) {
      feats = [{ type: 'Feature', properties: {}, geometry: raw as GeoJSON.Geometry }];
    }
  }
  const rows: FeatureRow[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (const feat of feats) {
    const geom = (feat as GeoJSON.Feature)?.geometry;
    if (!isUsableGeometry(geom)) {
      skipped += 1;
      continue;
    }
    const props = ((feat as GeoJSON.Feature)?.properties || {}) as Record<string, unknown>;
    // Preserva QUALQUER id que o backend aceite (não só os `f-`+8hex que este
    // módulo gera): camada criada pelo SDK ou por seed usa outros formatos, e
    // descartá-los faria o round-trip export→import duplicar cada feição.
    const existing = typeof props.id === 'string' && BACKEND_ID.test(props.id)
      ? props.id
      : undefined;
    let id = existing && !seen.has(existing) ? existing : newFeatureId();
    while (seen.has(id)) id = newFeatureId();
    seen.add(id);

    const style = (props.geo_style && typeof props.geo_style === 'object'
      ? (props.geo_style as FeatureStyle)
      : opts.style);
    const row: FeatureRow = { id, geometry: geom };
    const nome = pick(props, NAME_KEYS);
    const categoria = pick(props, CATEGORY_KEYS) || opts.defaultCategoria;
    const descricao = pick(props, DESC_KEYS);
    if (nome) row.nome = nome;
    if (categoria) row.categoria = categoria;
    if (descricao) row.descricao = descricao;
    if (style && Object.keys(style).length > 0) row.geo_style = { ...style };
    rows.push(row);
  }
  return { rows, skipped };
}

/** Linhas → FeatureCollection (export/backup/round-trip). Leva `id` e
 *  `geo_style` nas properties, então reimportar preserva identidade e estilo. */
export function rowsToFeatureCollection(rows: FeatureRow[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => {
      const properties: Record<string, unknown> = { id: r.id };
      if (r.nome) properties.nome = r.nome;
      if (r.categoria) properties.categoria = r.categoria;
      if (r.descricao) properties.descricao = r.descricao;
      if (r.geo_style) properties.geo_style = r.geo_style;
      return { type: 'Feature', properties, geometry: r.geometry } as GeoJSON.Feature;
    }),
  };
}

// Marcas de acento combinantes (U+0300–U+036F). Construído por `new RegExp`
// com escape em string: o literal cru no fonte quebra se o arquivo trafegar em
// codificação diferente (gotcha conhecido neste ambiente Windows).
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Nome de arquivo seguro pro download do export. */
export function exportFileName(layerName: string): string {
  const slug = layerName
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || 'camada'}.geojson`;
}

/** Agrupa por categoria preservando a ordem de aparição (a árvore do painel
 *  esquerdo é isso: My Maps mostra as feições sob o grupo delas). */
export function groupByCategoria(rows: FeatureRow[]): { categoria: string; rows: FeatureRow[] }[] {
  const order: string[] = [];
  const buckets = new Map<string, FeatureRow[]>();
  for (const r of rows) {
    const key = (r.categoria || '').trim() || '';
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(r);
  }
  return order.map((categoria) => ({ categoria, rows: buckets.get(categoria)! }));
}
