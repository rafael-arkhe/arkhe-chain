/**
 * Normalização de payloads de fonte → NormalizedResult[].
 *
 * FASE 2 do fan-out ESCALÁVEL (2026-06-26): extraído de `workers.ts` para que
 * DUAS camadas reusem EXATAMENTE a mesma lógica de normalização:
 *
 *   1. `runWorker` (workers.ts) — caminho SERIAL de fallback (cliente roda a
 *      fonte via Mcp.invoke e normaliza o `result`);
 *   2. `streamBatch` (store.ts) — caminho CONCORRENTE (o backend roda TODAS as
 *      fontes e transmite cada `result` cru via SSE; o front só normaliza).
 *
 * P2 ELO 1 (2026-06-27) — NÚCLEO RICO POR SHAPE. A normalização deixou de ser
 * rasa: ela ENRIQUECE por FORMA do dado, NUNCA pelo nome da fonte (zero
 * `if tool === 'x'`). Detecta MÍDIA (imagens/vídeos), CAMPOS escalares
 * humanizados e COLEÇÕES (sub-items) varrendo o shape do raw. ADD-alongside: os
 * fact-extractors curados (fact-extractors.ts) CONTINUAM ganhando; o que mudou é
 * o DEFAULT deixar de ser raso — e até fontes curadas (CNPJ) ganharem a lista de
 * sócios e galeria quando o raw traz.
 *
 * MULTIDOMÍNIO: rótulos e substantivos NEUTROS; nada de "pessoa/empresa" fixo.
 *
 * Não há duplicação: workers.ts importa daqui.
 */

import { DEFAULT_LOCALE, DICT } from '@/lib/i18n/dict';
import type { NormalizedResult } from './types';
import { getFactExtractor } from './fact-extractors';

type MediaItem = NonNullable<NormalizedResult['media']>[number];
type FieldEntry = NonNullable<NormalizedResult['fields']>[number];
type Rec = Record<string, unknown>;

/**
 * Resolve string do dict fora de React — normalização não roda em componentes,
 * então não há `useT()`. Mesmo fallback do `useT()` fora do provider: locale
 * default (pt-BR). Strings continuam centralizadas no dict.ts.
 */
export function tDict(key: string): string {
  return DICT[key]?.[DEFAULT_LOCALE] ?? key;
}

/* -------------------------------------------------------------------------- */
/* Tabelas de chaves (DADO, não código) — derivam o papel de cada chave do raw */
/* -------------------------------------------------------------------------- */

/** Chaves de TÍTULO (substantivo neutro primeiro; identidade/handle por último). */
const NAME_KEYS = [
  'nome', 'name', 'razao_social', 'razaoSocial', 'nome_empresarial', 'full_name',
  'display_name', 'displayName', 'title', 'titulo', 'headline', 'nome_socio',
  'nome_completo', 'razao', 'channel_name', 'channelTitle', 'site', 'display',
  'handle', 'username',
];

/** Linha secundária (uma linha só). */
const SUBTITLE_KEYS = [
  'subtitle', 'subtitulo', 'partido', 'siglaPartido', 'siglaUf', 'party', 'uf',
  'state', 'channel', 'channel_name', 'channelTitle', 'author', 'autor', 'domain',
  'uploader', 'qualificacao_socio', 'situacao', 'published_at', 'publishedAt',
  'date', 'data',
];

/** Snippet/descrição multi-linha. */
const SNIPPET_KEYS = [
  'description', 'descricao', 'snippet', 'summary', 'sumario', 'selftext', 'body',
  'content', 'text', 'abstract', 'caption', 'biography', 'bio', 'about',
];

/** URL canônica externa (post/perfil/documento). Ordem = preferência. */
const URL_KEYS = [
  'url', 'post_url', 'permalink', 'link', 'uri', 'href', 'webpage_url',
  'source_url', 'profile_url', 'external_url',
];

/** Identificador estável (best-effort). */
const ID_KEYS = [
  'id', '_id', 'video_id', 'videoId', 'shortcode', 'post_id', 'pk', 'guid', 'fid',
  'uri', 'url', 'permalink',
];

/**
 * Chaves de array que carregam uma COLEÇÃO/LISTA (primárias de envelope OU
 * sub-coleções de um registro). O discriminador LISTA-vs-REGISTRO NÃO é a chave
 * e sim a presença de uma identidade no topo (`hasRecordName`).
 */
const LIST_KEYS = [
  'items', 'results', 'dados', 'data', 'hits', 'matches', 'rows', 'entries',
  'posts', 'found', 'statuses', 'children', 'submitted', 'extracted', 'articles',
  'features', 'focos', 'overpasses', 'timeline', 'curriculos', 'operadoras',
  'qsa', 'accounts', 'sites', 'photos', 'videos', 'images', 'channels',
  'comments', 'messages', 'response',
];

/**
 * Identidade no TOPO ⇒ o payload é um REGISTRO (perfil/empresa) que pode embutir
 * sub-coleções — não um envelope-de-lista. Envelopes de lista (searx/gdelt/
 * câmara/reddit) NÃO carregam estas chaves no topo, então o discriminador é
 * seguro. Mantido enxuto de propósito.
 */
const RECORD_NAME_KEYS = [
  'username', 'full_name', 'razao_social', 'razaoSocial', 'nome_empresarial',
  'handle', 'page', 'display_name', 'email',
];

/** Chaves de imagem (capa/avatar/foto). */
const IMG_URL_KEYS = [
  'display_url', 'image', 'image_url', 'img', 'img_src', 'picture', 'photo',
  'socialimage', 'cover', 'cover_url', 'profile_pic_url', 'profile_image_url',
  'avatar', 'avatar_url', 'preview', 'preview_url', 'screenshot', 'screenshot_url',
  'thumbnail', 'thumbnail_url', 'thumb', 'urlFoto', 'urlFotoParlamentar',
];

/** Chaves de vídeo. */
const VID_URL_KEYS = ['video_url', 'video', 'media_url', 'play_url', 'playUrl'];

/** Wrappers de 1 nível desembrulhados antes de extrair (merge raso). */
const WRAP_KEYS = ['_source', 'source', 'properties', 'account', 'Event', 'Attribute', 'task', 'node'];

const IMG_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg|avif|jfif)(\?|#|$)/i;
const VID_EXT_RE = /\.(mp4|webm|mov|m4v|avi|mkv|m3u8|mpd)(\?|#|$)/i;
const HTTP_RE = /^https?:\/\//i;

/** Chaves já consumidas por name/subtitle/url/thumb/id/snippet — não viram field. */
const CONSUMED_FIELD_KEYS = new Set<string>(
  [
    ...NAME_KEYS, ...SNIPPET_KEYS, ...URL_KEYS, ...ID_KEYS, ...IMG_URL_KEYS,
    ...VID_URL_KEYS, 'kind', 'score', 'raw', 'geometry', 'thumbnails',
    'profile_image_url',
  ].map((k) => k.toLowerCase()),
);

/* -------------------------------------------------------------------------- */
/* Utilitários de leitura tolerantes a shape                                   */
/* -------------------------------------------------------------------------- */

function asObj(v: unknown): Rec | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : undefined;
}

function lc(v: unknown): string {
  return typeof v === 'string' ? v.toLowerCase() : '';
}

/** String não-vazia de UMA chave (não coage número — para URLs/mídia). */
function getStr(o: Rec, k: string): string | undefined {
  const v = o[k];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Primeira string não-vazia percorrendo paths (coage número → string). */
function pickStr(r: Rec, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/** Procura uma URL de imagem em vários paths comuns (capa única / thumbnail). */
export function pickThumbnail(r: Rec): string | undefined {
  // 1ª: campos diretos
  const direct = pickStr(r, [
    'thumbnail', 'thumbnail_url', 'thumb', 'image', 'image_url', 'picture',
    'avatar', 'avatar_url', 'profile_pic_url', 'profile_image_url', 'cover',
    'cover_url', 'preview', 'preview_url', 'display_url', 'video_url',
    'socialimage', 'img_src', 'screenshot', 'screenshot_url', 'urlFoto',
    'urlFotoParlamentar',
  ]);
  if (direct && HTTP_RE.test(direct)) return direct;
  // 2ª: estruturas aninhadas comuns
  // YouTube: thumbnails (array) ou snippet.thumbnails.default/high.url
  const tns = (r.thumbnails as unknown) ?? (asObj(r.snippet)?.thumbnails);
  if (Array.isArray(tns) && tns.length > 0) {
    const last = asObj(tns[tns.length - 1]);
    const u = last && pickStr(last, ['url', 'src']);
    if (u && HTTP_RE.test(u)) return u;
  }
  const tnsObj = asObj(tns);
  if (tnsObj) {
    for (const k of ['maxres', 'high', 'medium', 'default']) {
      const x = asObj(tnsObj[k]);
      const u = x && pickStr(x, ['url', 'src']);
      if (u && HTTP_RE.test(u)) return u;
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Desembrulho de wrappers (reddit Thing, GeoJSON, mastodon account, ES, MISP) */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza UM elemento cru num REGISTRO plano antes da extração:
 *   - string solta (ex.: `found:['github', …]`) → `{ name: string }`;
 *   - reddit Thing `{kind, data:{…}}` → desce pro `data` (descarta o `kind=t3`);
 *   - merge raso de wrappers conhecidos (`_source`/`account`/`properties`/…) sem
 *     sobrescrever chaves já presentes no topo;
 *   - GeoJSON `geometry.coordinates [lon,lat]` → injeta `lat`/`lon` escalares.
 */
function unwrapItem(el: unknown): Rec | null {
  if (typeof el === 'string') {
    const s = el.trim();
    return s ? { name: s } : null;
  }
  let r = asObj(el);
  if (!r) return null;

  // reddit Thing: {kind, data:{…}} → registro interno.
  if (typeof r.kind === 'string' && asObj(r.data)) r = asObj(r.data) as Rec;

  const merged: Rec = { ...r };
  for (const w of WRAP_KEYS) {
    const wv = asObj(r[w]);
    if (!wv) continue;
    for (const [k, v] of Object.entries(wv)) if (!(k in merged)) merged[k] = v;
  }

  // GeoJSON geometry → lat/lon escalares.
  const geom = asObj(merged.geometry);
  const coords = geom && Array.isArray(geom.coordinates) ? (geom.coordinates as unknown[]) : undefined;
  if (coords && coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    if (merged.lon == null && merged.longitude == null && merged.lng == null) merged.lon = coords[0];
    if (merged.lat == null && merged.latitude == null) merged.lat = coords[1];
  }
  return merged;
}

/**
 * Desembrulha 1–2 níveis de ENVELOPE (`{status, data:{…}}`) até achar ou o
 * registro identificável ou o nível que carrega a lista. Câmara/Senado/searx/
 * gdelt aninham a lista em `data`; perfis/empresas podem vir em `data` também.
 */
function unwrapEnvelope(obj: Rec): Rec {
  let cur = obj;
  for (let i = 0; i < 3; i += 1) {
    if (hasRecordName(cur)) return cur;
    const next = asObj(cur.data) ?? asObj(cur.response) ?? asObj(cur.result);
    if (next && !findItemsArray(cur)) {
      cur = next;
      continue;
    }
    // Se o nível atual já carrega a lista (ex.: {dados:[…]}), para aqui.
    if (findItemsArray(cur)) return cur;
    if (next) {
      cur = next;
      continue;
    }
    break;
  }
  return cur;
}

function hasRecordName(r: Rec): boolean {
  return RECORD_NAME_KEYS.some((k) => {
    const v = r[k];
    return (typeof v === 'string' && v.trim().length > 0) || (typeof v === 'number' && Number.isFinite(v));
  });
}

/* -------------------------------------------------------------------------- */
/* Extração de array de itens                                                  */
/* -------------------------------------------------------------------------- */

/** Acha o PRIMEIRO array (de objetos OU de strings) varrendo os valores de `c`. */
function firstArrayIn(c: Rec): unknown[] | null {
  for (const v of Object.values(c)) {
    if (Array.isArray(v) && v.length > 0) {
      const sample = v[0];
      if (typeof sample === 'string' || (sample && typeof sample === 'object')) return v;
    }
  }
  return null;
}

/**
 * Acha o array de itens dentro do payload. `null` quando NÃO há array algum
 * (registro escalar). Trata reddit (`data.data.children`) e GeoJSON (`features`)
 * pelas KEYS; cai num fallback GENÉRICO (1º array não-vazio em `obj`, `obj.data`,
 * `obj.data.data`) só se nenhuma chave conhecida casar.
 */
function findItemsArray(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  const obj = asObj(payload);
  if (!obj) return null;

  // 1ª: array direto na chave conhecida.
  for (const key of LIST_KEYS) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  // 2ª: 1 nível de aninhamento (data/response/result/data.data → children).
  for (const key of LIST_KEYS) {
    const inner = asObj(obj[key]);
    if (!inner) continue;
    for (const k2 of LIST_KEYS) {
      if (Array.isArray(inner[k2])) return inner[k2] as unknown[];
    }
  }
  // 3ª: fallback GENÉRICO — 1º array não-vazio (objetos/strings).
  for (const c of [obj, asObj(obj.data), asObj(asObj(obj.data)?.data)]) {
    if (!c) continue;
    const found = firstArrayIn(c);
    if (found) return found;
  }
  return null;
}

/**
 * Público (compat): array de itens do envelope, com fallback p/ `[obj]` quando
 * é um registro escalar (mantém o contrato antigo de quem consome).
 */
export function extractItems(payload: unknown): unknown[] {
  const arr = findItemsArray(payload);
  if (arr !== null) return arr;
  const obj = asObj(payload);
  return obj ? [obj] : [];
}

/* -------------------------------------------------------------------------- */
/* Humanização de chave → rótulo + tom                                         */
/* -------------------------------------------------------------------------- */

/** Title Case GENÉRICO de uma chave técnica (camelCase/snake/kebab). */
export function prettifyKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return key;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Rótulo i18n de uma chave: devolve a CHAVE do dict (`buscar.campo.k.<chave>`)
 * quando existe (a UI resolve via useT()), senão o Title Case (que passa pelo
 * t() intacto). Tenta a chave e sua versão lowercase (cobre camelCase).
 */
function fieldLabel(key: string): string {
  for (const cand of [`buscar.campo.k.${key}`, `buscar.campo.k.${key.toLowerCase()}`]) {
    if (DICT[cand]) return cand;
  }
  return prettifyKey(key);
}

/** Heurística de tom por chave/valor (risco→warn, positivo→ok, resto neutro). */
function toneFor(key: string, value: unknown): FieldEntry['tone'] {
  const k = key.toLowerCase();
  const v = lc(value);
  const isTrue = value === true || v === 'true' || v === 'sim' || v === 'yes' || value === 1 || v === '1';

  if (/(threat|malware|blacklist|black_list|sanc|sanction|inidone|inabilit|irregular|fraud|risco|risk|banido|banned|spam|abuse|denied|deny|revogad|suspend|comprometid)/.test(k)) {
    if (isTrue || (typeof value === 'string' && v && !['false', 'no', 'nao', 'none', '0', ''].includes(v))) {
      return 'warn';
    }
  }
  if (/(situac|status|estado)/.test(k) && typeof value === 'string' && v) {
    return /(ativ|valid|regular|\bok\b|habilitad)/.test(v) ? 'ok' : 'warn';
  }
  if (/(verificad|verified|valid|ativ|active|confirmad|confirmed)/.test(k) && isTrue) return 'ok';
  if (/(private|privado|locked|protected)/.test(k) && isTrue) return 'warn';
  return undefined;
}

/**
 * Converte os ESCALARES de um registro em fields[] humanizados.
 *   - pula chaves já consumidas (name/subtitle/url/thumb/id/snippet/mídia);
 *   - pula valores já presentes em `consumedValues` (não duplica facts/name/…);
 *   - bool → "Sim/Não" (com tom); número → valor cru; string-URL → field com href;
 *   - descarta blobs (>160 chars) e URLs de mídia (vão pra media[]);
 *   - cap de ~10 para evitar ruído.
 */
export function recordToFields(r: Rec, consumedValues?: Set<string>): FieldEntry[] {
  const out: FieldEntry[] = [];
  const seenVals = consumedValues ?? new Set<string>();
  for (const [key, value] of Object.entries(r)) {
    if (out.length >= 10) break;
    if (CONSUMED_FIELD_KEYS.has(key.toLowerCase())) continue;
    if (value == null || typeof value === 'object') continue;
    if (typeof value === 'string') {
      const s = value.trim();
      if (!s || s.length > 160) continue;
      if (IMG_EXT_RE.test(s) || VID_EXT_RE.test(s)) continue; // mídia, não field
      if (seenVals.has(s)) continue;
      const href = HTTP_RE.test(s) ? s : undefined;
      seenVals.add(s);
      out.push({ label: fieldLabel(key), value: s, ...(toneFor(key, value) ? { tone: toneFor(key, value) } : {}), ...(href ? { href } : {}) });
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue;
      const s = String(value);
      if (seenVals.has(s)) continue;
      seenVals.add(s);
      out.push({ label: fieldLabel(key), value: s, ...(toneFor(key, value) ? { tone: toneFor(key, value) } : {}) });
      continue;
    }
    if (typeof value === 'boolean') {
      const s = tDict(value ? 'buscar.campo.sim' : 'buscar.campo.nao');
      const tone = toneFor(key, value);
      out.push({ label: fieldLabel(key), value: s, ...(tone ? { tone } : {}) });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Mídia por shape                                                             */
/* -------------------------------------------------------------------------- */

function asMediaItem(url: unknown, kind: MediaItem['kind'], thumb?: string, caption?: string): MediaItem | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!HTTP_RE.test(u)) return null; // só http(s) absoluto — nunca vaza host de túnel/relativo
  const t = thumb && HTTP_RE.test(thumb) ? thumb : undefined;
  return { url: u, kind, ...(t ? { thumbnail: t } : {}), ...(caption ? { caption } : {}) };
}

/**
 * Coleta MÍDIA de um registro por SHAPE: chaves de img/vídeo conhecidas + URLs
 * com extensão de imagem/vídeo + arrays de URL-string (gallery-dl `extracted`) +
 * arrays de objetos de anexo (mastodon `media_attachments`). Classifica
 * image|video por extensão / flag `is_video` / `type`. Dedup por URL.
 */
function collectMedia(r: Rec): MediaItem[] {
  const out: MediaItem[] = [];
  const seen = new Set<string>();
  const usedAsThumb = new Set<string>();
  const push = (m: MediaItem | null) => {
    if (m && !seen.has(m.url)) {
      seen.add(m.url);
      out.push(m);
    }
  };

  const caption = getStr(r, 'caption') ?? getStr(r, 'title');
  const isVid = r.is_video === true || lc(r.type) === 'video';
  const vUrl = pickStr(r, VID_URL_KEYS);
  const iUrl = pickStr(r, IMG_URL_KEYS);

  // Post com mídia primária: vídeo (capa = imagem) tem precedência.
  if (vUrl) {
    if (iUrl) usedAsThumb.add(iUrl);
    push(asMediaItem(vUrl, 'video', iUrl, caption));
  } else if (iUrl && isVid) {
    push(asMediaItem(iUrl, 'image', undefined, caption));
  }

  // TODAS as URLs de chave de imagem (img_src, socialimage, display_url…).
  for (const k of IMG_URL_KEYS) {
    const u = getStr(r, k);
    if (u && !usedAsThumb.has(u)) push(asMediaItem(u, 'image', undefined, caption));
  }
  // TODAS as URLs de chave de vídeo.
  for (const k of VID_URL_KEYS) {
    const u = getStr(r, k);
    if (u) push(asMediaItem(u, 'video', undefined, caption));
  }

  // Varredura: strings com extensão de mídia + arrays (strings / anexos).
  for (const [, v] of Object.entries(r)) {
    if (typeof v === 'string' && HTTP_RE.test(v) && !usedAsThumb.has(v)) {
      if (VID_EXT_RE.test(v)) push(asMediaItem(v, 'video'));
      else if (IMG_EXT_RE.test(v)) push(asMediaItem(v, 'image'));
    } else if (Array.isArray(v)) {
      for (const el of v) {
        if (typeof el === 'string') {
          if (HTTP_RE.test(el)) push(asMediaItem(el, VID_EXT_RE.test(el) ? 'video' : 'image'));
          continue;
        }
        const o = asObj(el);
        if (!o) continue;
        const isMediaObj = 'preview_url' in o || ['image', 'video', 'gifv', 'audio'].includes(lc(o.type));
        if (!isMediaObj) continue;
        const eu = pickStr(o, ['url', 'src', 'media_url', 'remote_url', 'image', 'video']);
        const prev = pickStr(o, ['preview_url', 'thumbnail', 'preview']);
        const isV = lc(o.type) === 'video' || lc(o.type) === 'gifv' || o.is_video === true || (eu ? VID_EXT_RE.test(eu) : false);
        if (eu) push(asMediaItem(eu, isV ? 'video' : 'image', prev, getStr(o, 'description') ?? getStr(o, 'caption')));
      }
    }
  }
  return out.slice(0, 12);
}

/* -------------------------------------------------------------------------- */
/* Construção + enriquecimento                                                 */
/* -------------------------------------------------------------------------- */

/** Detecta coordenada num registro (lat/lon escalares ou geometria). */
function hasGeo(r: Rec): boolean {
  const lat = r.lat ?? r.latitude;
  const lon = r.lon ?? r.lng ?? r.longitude;
  if (typeof lat === 'number' && typeof lon === 'number') return true;
  const geom = asObj(r.geometry);
  return !!(geom && Array.isArray(geom.coordinates));
}

/** Infere a forma do resultado para orientar a renderização (advisory). */
function inferShape(r: NormalizedResult, rec: Rec): NonNullable<NormalizedResult['shape']> {
  if (hasGeo(rec)) return 'geo';
  if (
    ('followers' in rec || 'followees' in rec || 'following' in rec || 'subscriber_count' in rec)
    && !(r.items && r.items.length)
  ) {
    return 'profile';
  }
  if (r.items && r.items.length) return 'collection';
  const content = rec.content ?? rec.text ?? rec.body;
  if (typeof content === 'string' && /<[a-z][\s\S]*>/i.test(content)) return 'html';
  if (r.media && r.media.length && !r.snippet) return 'image';
  if (r.url) return 'web';
  return 'record';
}

/** Monta o NormalizedResult base de um registro JÁ desembrulhado. */
function buildBase(rec: Rec, sourceKey: string, idx: number, fallbackName?: string): NormalizedResult {
  const externalId =
    pickStr(rec, ID_KEYS) ?? (fallbackName ? `${sourceKey}-${fallbackName}` : `${sourceKey}-${idx}`);
  const name = pickStr(rec, NAME_KEYS) ?? fallbackName ?? externalId;
  const subtitle = pickStr(rec, SUBTITLE_KEYS);
  const snippet = pickStr(rec, SNIPPET_KEYS);
  const thumbnail = pickThumbnail(rec);
  const urlField = pickStr(rec, URL_KEYS);
  const url = urlField && HTTP_RE.test(urlField) ? urlField : undefined;
  const score = typeof rec.score === 'number' ? rec.score : undefined;
  const kind = typeof rec.kind === 'string' ? rec.kind : sourceKey.split('@')[0];
  return { externalId, name, kind, subtitle, snippet, thumbnail, score, url };
}

/**
 * Aplica o pass de SHAPE a UM resultado já montado (mídia + fields + items),
 * recursivo nos sub-items até `depth` 1. ADITIVO: nunca sobrescreve campos já
 * setados (name/facts/action/etc preservados). Quando há `facts` (fonte curada),
 * NÃO gera `fields` (os facts já são os campos curados) — mas ainda soma mídia e
 * a coleção (CNPJ ganha sócios; perfil curado ganha galeria).
 */
function enrichByShape(r: NormalizedResult, rec: Rec, depth: number, sourceKey: string): NormalizedResult {
  const hasFacts = !!(r.facts && r.facts.length);

  // (a) MÍDIA
  if (!r.media) {
    const media = collectMedia(rec);
    if (media.length) r.media = media;
  }

  // (c) COLEÇÃO (só profundidade 0 — sub-items não recursam coleção)
  if (depth === 0 && !r.items) {
    const arr = findItemsArray(rec);
    if (arr && arr.length) {
      let items = arr
        .map((el, i) => normalizeOne(el, sourceKey, i, depth + 1))
        .filter((x): x is NormalizedResult => x !== null);
      // Fonte curada: só some items que AGREGAM (têm link/mídia/fields/sub-coleção),
      // p/ não duplicar o que os facts já mostram (ex.: holehe `found` = só nome).
      if (hasFacts) {
        items = items.filter((it) => it.url || it.media?.length || it.fields?.length || it.items?.length);
      }
      if (items.length) {
        r.items = items;
        r.count = items.length;
        if (!r.subtitle) r.subtitle = `${items.length} ${tDict('buscar.shape.itens')}`;
      }
    }
  }

  // (b) FIELDS (só quando o curado não setou facts — evita duplicar)
  if (!r.fields && !hasFacts) {
    const consumed = new Set<string>();
    for (const v of [r.name, r.subtitle, r.snippet, r.url, r.thumbnail]) if (v) consumed.add(v);
    const fields = recordToFields(rec, consumed);
    if (fields.length) r.fields = fields;
  }

  if (!r.shape) r.shape = inferShape(r, rec);
  return r;
}

/** Normaliza UM elemento cru → resultado enriquecido (ou null se inútil). */
function normalizeOne(
  rawEl: unknown,
  sourceKey: string,
  idx: number,
  depth: number,
  fallbackName?: string,
): NormalizedResult | null {
  const rec = unwrapItem(rawEl);
  if (!rec) return null;
  const base = buildBase(rec, sourceKey, idx, fallbackName);
  base.raw = rawEl;
  return enrichByShape(base, rec, depth, sourceKey);
}

/**
 * Normaliza payload genérico de array do MCP em NormalizedResult[] (LISTA →
 * cards FLAT, 1 por elemento). Cada card é enriquecido por shape
 * (mídia + fields). Resiliente a shapes heterogêneos.
 */
export function genericNormalize(items: unknown[], sourceKey: string): NormalizedResult[] {
  return items
    .map((el, i) => normalizeOne(el, sourceKey, i, 1))
    .filter((x): x is NormalizedResult => x !== null);
}

/* -------------------------------------------------------------------------- */
/* API pública                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza o `result` CRU de uma fonte MCP em NormalizedResult[].
 *
 *   - FONTE CURADA: se há fact-extractor pra base do tool, aplica no ENVELOPE
 *     CRU e devolve 1 item RICO (name humano, facts[], ação). DEPOIS roda o pass
 *     de shape p/ SOMAR mídia + coleção (CNPJ ganha sócios) sem mexer nos facts;
 *   - LISTA (envelope sem identidade no topo): `genericNormalize` → N cards;
 *   - REGISTRO (identidade no topo, p.ex. perfil/empresa/username): 1 resultado
 *     RICO, com sub-coleções viradas em `items[]`.
 *
 * Usado por DUAS camadas: o caminho serial (workers.ts) e o stream concorrente
 * (store.ts → streamBatch). `query` alimenta o externalId e o name de fallback.
 */
export function normalizeResult(tool: string, rawResult: unknown, query: string): NormalizedResult[] {
  const extractor = getFactExtractor(tool);
  if (extractor) {
    const rich = extractor(rawResult, query, tDict);
    const base: NormalizedResult = {
      externalId: `${tool}-${query.trim()}`,
      name: rich.name ?? query.trim(),
      kind: rich.kind ?? tool.split('@')[0],
      subtitle: rich.subtitle,
      snippet: rich.snippet,
      facts: rich.facts,
      action: rich.action,
      score: rich.score,
      url: rich.url,
      raw: rawResult,
    };
    const recF = unwrapItem(unwrapEnvelope(asObj(rawResult) ?? {})) ?? {};
    enrichByShape(base, recF, 0, tool);
    return [base];
  }

  // Top-level array = LISTA direta.
  if (Array.isArray(rawResult)) return genericNormalize(rawResult, tool);

  const rootObj = asObj(rawResult);
  if (!rootObj) return [];

  const rec = unwrapEnvelope(rootObj);
  const arr = findItemsArray(rec);

  // LISTA: envelope cuja identidade NÃO está no topo → N cards flat.
  if (arr !== null && !hasRecordName(rec)) {
    return genericNormalize(arr, tool);
  }

  // REGISTRO: 1 resultado rico (sub-coleções viram items[]).
  const recU = unwrapItem(rec) ?? rec;
  const base = buildBase(recU, tool, 0, query.trim());
  base.raw = rawResult;
  enrichByShape(base, recU, 0, tool);
  return [base];
}
