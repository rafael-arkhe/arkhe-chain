/**
 * Workers per-fonte: cada um recebe (query) e devolve NormalizedResult[].
 *
 * Cada worker isola a forma do payload externo (Câmara, Senado, IG, etc).
 * Erros são propagados — o orchestrator decide marcar `error` no FilaItem.
 */

import { Entities } from '@/lib/api';
import {
  Cctv,
  detectionFrameUrl,
  nonAggregate,
  type CCTVDetection,
  type CCTVStream,
} from '@/lib/api/cctv';
import { Mcp } from '@/lib/api/mcp';
import type { Entity } from '@/lib/api/types';
import { formatDataHoraBR } from '@/lib/datetime';
import { detectionClassLabel, detectionConf, detectionKindLabel } from '@/lib/i18n/detection';
import type { NormalizedResult, SourceDef } from './types';
import {
  inferDossierKind,
  sourceServesKind,
  acceptsLabel,
  QUERY_ACCEPTS,
  fieldValueForAccept,
} from './classify';
// FASE 2 (2026-06-26): normalização extraída p/ normalize.ts e COMPARTILHADA com
// o stream concorrente (store.ts → streamBatch). runWorker continua usando as
// MESMAS funções — é o fallback serial, comportamento idêntico.
import { tDict, normalizeResult } from './normalize';

/**
 * Lançado pelo worker quando a fonte exige um input que a query não casa
 * (hoje: fontes URL-only com query que não é URL). O orchestrator marca o
 * item como `skipped` (neutro), NÃO como `error` (vermelho) — é um pulo
 * legítimo, não uma falha. Carrega a razão amigável pra exibir na Fila.
 */
export class FonteRequerUrlError extends Error {
  constructor(message = 'Esta fonte exige uma URL como busca.') {
    super(message);
    this.name = 'FonteRequerUrlError';
  }
}

/**
 * Lançado quando a fonte exige um INPUT ESPECÍFICO (CNPJ, CPF, e-mail, usuário,
 * telefone…) que nem a query nem os campos da Busca avançada fornecem. Pulo
 * legítimo (status `skipped` neutro), não erro vermelho — evita disparar fonte de
 * username com um nome e receber "não aceita". A razão diz o que preencher.
 */
export class FonteNaoAceitaError extends Error {
  constructor(message = 'Esta fonte não aceita este tipo de busca.') {
    super(message);
    this.name = 'FonteNaoAceitaError';
  }
}

/**
 * Lançado pelo orchestrator quando uma fonte estoura o tempo (não respondeu). Sem
 * isto, a fila é sequencial e uma fonte TRAVADA segura todas as outras (head-of-line)
 * — a busca parece morta. Marca `skipped` neutro com a razão, e a fila CONTINUA.
 */
export class FonteTimeoutError extends Error {
  constructor(message = 'Tempo esgotado — fonte lenta ou indisponível; pulada.') {
    super(message);
    this.name = 'FonteTimeoutError';
  }
}

/** Worker para `/entities` local (built-in). */
async function searchEntities(query: string): Promise<NormalizedResult[]> {
  const params = query.trim() ? { q: query } : undefined;
  const entities: Entity[] = await Entities.list(params);
  return entities.map((e) => ({
    externalId: e.id,
    name: e.name,
    kind: e.entity_type,
    subtitle: `${e.entity_type} · classif. ${e.classification}`,
    entityId: e.id,
  }));
}

/** Máximo de streams consultados por detecções — evita N+1 explosivo. */
const CAMERAS_MAX_STREAMS = 20;
/** Detecções recentes consultadas por stream. */
const CAMERAS_DETECTIONS_LIMIT = 50;

/**
 * Worker para a fonte built-in `cameras` (CCTV via bridge do ontology).
 *
 * Duas pernas, mesma query:
 *   1. Câmeras — `Cctv.streams.list()` filtrado client-side por
 *      nome/cidade/url/tags (mesmo padrão do filtro de /cameras).
 *   2. Detecções recentes — `Cctv.streams.detections()` por stream,
 *      filtrado por label quando a query casa (ex.: placa LPR).
 *      Agregadas de flood-control (`__flow__`) nunca viram resultado.
 *
 * Backend fora → retorna vazio SEM lançar e SEM dado fake (busca não
 * exibe resultado sintético; o fallback fabricado foi removido).
 */
async function searchCameras(query: string): Promise<NormalizedResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  let streams: CCTVStream[];
  try {
    streams = await Cctv.streams.list();
  } catch {
    return [];
  }
  if (!Array.isArray(streams)) return [];

  const matchesStream = (s: CCTVStream) =>
    [s.name, s.city ?? '', s.url, ...(s.tags ?? [])].some((field) =>
      field.toLowerCase().includes(q),
    );

  const cameraResults: NormalizedResult[] = streams.filter(matchesStream).map((s) => ({
    externalId: s.id,
    name: s.name,
    kind: tDict('buscar.cameras.badge.camera'),
    subtitle: [s.city, s.status].filter(Boolean).join(' · '),
    thumbnail: s.thumbnail_url ?? undefined,
    url: `/cameras?focus=${encodeURIComponent(s.id)}`,
    raw: s,
  }));

  // Detecções recentes — falha por stream é tolerada (vira lista vazia).
  const byId = new Map(streams.map((s) => [s.id, s]));
  const perStream = await Promise.all(
    streams
      .slice(0, CAMERAS_MAX_STREAMS)
      .map((s) =>
        Cctv.streams
          .detections(s.id, CAMERAS_DETECTIONS_LIMIT)
          .catch(() => [] as CCTVDetection[]),
      ),
  );
  const detectionResults: NormalizedResult[] = perStream
    .flat()
    .filter(nonAggregate)
    .filter((d) => d.label.toLowerCase().includes(q))
    .sort((a, b) => b.detected_at.localeCompare(a.detected_at))
    .map((d) => {
      const stream = byId.get(d.stream_id);
      return {
        externalId: d.id,
        name: `${detectionClassLabel(tDict, d.label)} @ ${stream?.name ?? d.stream_id}`,
        kind: tDict('buscar.cameras.badge.deteccao'),
        subtitle: `${detectionKindLabel(tDict, d.kind)} · ${detectionConf(tDict, Math.round(d.confidence * 100))} · ${formatDataHoraBR(d.detected_at)}`,
        thumbnail: detectionFrameUrl(d) ?? undefined,
        entityId: d.linked_entity_id ?? undefined,
        url: `/cameras?focus=${encodeURIComponent(d.stream_id)}`,
        score: d.confidence,
        raw: d,
      };
    });

  return [...cameraResults, ...detectionResults];
}

/** Worker genérico para qualquer MCP tool.
 *
 *  Adapters MCP usam nomes de param heterogêneos. Mandamos a query em
 *  TODOS os aliases conhecidos — adapter ignora o que não conhece e usa
 *  o que conhece. Inclui:
 *
 *    texto livre: query, q, nome, name, term, search, text
 *    username (maigret, sherlock, instaloader): username, handle
 *    documento (mr_cnpj, brio_*): cnpj, cpf_cnpj, cpf
 *    rede (urlhaus, urlscan, threatfox): host, ip, ioc, url
 *    email (holehe): email
 *
 *  Pra adapters URL-only (crawl4ai, playwright) só funciona se a query
 *  for de fato uma URL — outras passam com 0 results / erro de validação
 *  que é mostrado direto na Fila.
 */
async function searchMcp(
  tool: string,
  query: string,
  extra?: Record<string, string>,
  accepts?: string[],
): Promise<NormalizedResult[]> {
  const looksLikeUrl = /^https?:\/\//i.test(query);
  const looksLikeEmail = /@.+\./.test(query) && !query.includes(' ');
  const looksLikeIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(query);
  const looksLikeCnpj = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(query);
  const looksLikeCpf = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(query);
  const isPlainUsername = /^[A-Za-z0-9._-]{1,64}$/.test(query);
  // YouTube canal: o adapter `youtube_channel@v1` EXIGE a chave `channel`
  // (handle, ele mesmo já faz `lstrip('@')`). O shotgun nunca a enviava, então
  // a fonte falhava 100% com "'channel' inválido". Normaliza @handle → handle e
  // só envia quando parece handle (sem espaço). Adapters que não conhecem a
  // chave a ignoram.
  const handleCandidate = query.trim().replace(/^@+/, '');
  const looksLikeHandle = /^[A-Za-z0-9._-]{1,64}$/.test(handleCandidate);

  // entity_dossier@v1 has a strict schema (kind + value), not the generic
  // shotgun shape — infer `kind` from the same heuristics and short-circuit.
  if (tool === 'entity_dossier@v1') {
    if (looksLikeUrl || looksLikeIp) {
      throw new Error('Dossiê AEGIS não aceita URL/IP — use uma fonte de threat-intel.');
    }
    const kind = looksLikeCnpj
      ? 'cnpj'
      : looksLikeCpf
        ? 'cpf'
        : looksLikeEmail
          ? 'email'
          : /\s/.test(query.trim())
            ? 'person'
            : isPlainUsername
              ? 'username'
              : 'person';
    const { result } = await Mcp.invoke<unknown>(tool, {
      kind,
      value: query.trim(),
    });
    return normalizeResult(tool, result, query);
  }

  const params: Record<string, unknown> = {
    // texto livre
    query,
    q: query,
    nome: query,
    name: query,
    term: query,
    search: query,
    text: query,
    // username — só passa se a query parecer username (sem espaço, etc)
    ...(isPlainUsername ? { username: query, handle: query } : {}),
    // canal YouTube (handle) — adapter exige a chave `channel`
    ...(looksLikeHandle ? { channel: handleCandidate } : {}),
    // documentos BR
    ...(looksLikeCnpj
      ? { cnpj: query.replace(/\D/g, ''), cpf_cnpj: query.replace(/\D/g, '') }
      : {}),
    ...(looksLikeCpf
      ? { cpf: query.replace(/\D/g, ''), cpf_cnpj: query.replace(/\D/g, '') }
      : {}),
    // rede / threat
    ...(looksLikeUrl ? { url: query } : {}),
    ...(looksLikeIp ? { ip: query, host: query } : {}),
    // ioc é genérico — sempre manda; host só quando não é URL
    ioc: query,
    ...(!looksLikeUrl && !looksLikeIp ? { host: query } : {}),
    // email
    ...(looksLikeEmail ? { email: query } : {}),
  };

  // Busca avançada — ROTEAMENTO POR TIPO (FRENTE A, Fase 3). PER-SOURCE: para CADA
  // accept que ESTA fonte declara, entrega o valor do campo cujo KIND canônico casa
  // (doc/username/email/phone), NA CHAVE que o adapter estrito lê. Assim CPF digitado
  // no campo `cpf` chega como `cpf_cnpj` ao doc_validar e como `cnpj` ao mr_cnpj —
  // sem shotgun de chaves (evita additionalProperties:false rejeitar). Documento e
  // telefone já vêm com dígitos (normalizado em fieldValueForAccept).
  for (const a of accepts ?? []) {
    if (QUERY_ACCEPTS.has(a)) continue;
    const v = fieldValueForAccept(extra, a);
    if (v != null) params[a] = v;
  }
  // Desambiguadores que NÃO são accepts (refines: uf, nome_mae, datanascimento…) e
  // quaisquer chaves remanescentes do campo avançado entram pela própria chave —
  // a fonte que não as conhece ignora. NÃO sobrescreve o que o roteamento já pôs.
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      const val = (v ?? '').trim();
      if (!val) continue;
      if ((accepts ?? []).includes(k)) continue; // já tratado pelo roteamento por tipo
      if (k in params) continue;
      params[k] = val;
    }
  }

  const { result } = await Mcp.invoke<unknown>(tool, params);

  // FATO ESCALAR vs LISTA: a normalização vive em normalize.ts e é COMPARTILHADA
  // com o stream concorrente (store.ts). Se há fact-extractor pra base do tool
  // (doc_validar, telefone_lookup, holehe_email…) devolve 1 item RICO do envelope
  // CRU; senão `genericNormalize(extractItems(result), tool)`. Idêntico ao antes.
  return normalizeResult(tool, result, query);
}

/**
 * Adapters que SÓ funcionam com uma URL como input. Quando a query não é
 * URL, o worker PULA a fonte (lista vazia, sem erro) em vez de deixar o
 * adapter devolver 422 "'url' deve ser URL HTTP(S) válida" — que poluía a
 * Fila (#3b). É um mapa de CAPACIDADE do adapter (contrato de input), não de
 * domínio/vertical — por isso vive na camada de worker.
 */
const URL_ONLY_TOOLS = new Set<string>([
  // osint_extract@v1 NÃO está aqui: aceita URL OU username (fan-out) — tratado
  // em runWorker; só pula se não for URL nem handle.
  'crawl_markdown@v1',
  'crawl_extract@v1',
  'playwright_screenshot@v1',
  'playwright_page_text@v1',
  'partition_url@v1',
  'tavily_extract@v1',
  'urlscan_submit@v1',
  'urlhaus_lookup_url@v1',
  'gallery_dl_extract@v1',
  'threads_post@v1',
  'facebook_page@v1',
  'tiktok_video@v2',
  'youtube_transcript@v1',
]);

/** Executa o worker correto para a fonte. */
export async function runWorker(
  source: SourceDef,
  query: string,
  extra?: Record<string, string>,
  accepts?: string[],
): Promise<NormalizedResult[]> {
  if (source.builtin === 'entities') {
    return searchEntities(query);
  }
  if (source.builtin === 'cameras') {
    return searchCameras(query);
  }
  if (source.mcpTool) {
    const q = query.trim();
    const isUrl = /^https?:\/\//i.test(q);
    // OSINT extrator: aceita URL OU username (fan-out YouTube/TikTok/Reddit/IG).
    // Só pula se a query não for nenhum dos dois (ex.: nome com espaços).
    if (source.mcpTool === 'osint_extract@v1') {
      const isHandle = /^@?[A-Za-z0-9._-]{1,64}$/.test(q);
      if (!isUrl && !isHandle) {
        throw new FonteRequerUrlError(
          'OSINT extrator: informe uma URL ou um username (sem espaços).',
        );
      }
      return searchMcp(source.mcpTool, query, extra, accepts);
    }
    // Demais fontes URL-only com query que não é URL → PULA com sinal explícito.
    // Antes retornava [] em silêncio ("0 resultados · 14ms"), o que confundia o
    // operador. Agora o orchestrator marca como `skipped` com razão amigável.
    if (URL_ONLY_TOOLS.has(source.mcpTool) && !isUrl) {
      throw new FonteRequerUrlError(
        'Esta fonte só aceita URL — cole o endereço da página/perfil.',
      );
    }
    // Gate por accepts (classificador único): se a fonte exige um input ESPECÍFICO
    // (cnpj/cpf/email/username/telefone/placa…) e nem a query nem um campo da Busca
    // avançada fornecem esse tipo, PULA (skipped neutro) em vez de disparar com o
    // texto errado e receber "não aceita". url/ip já são tratados pelo gate acima.
    const specific = (accepts ?? []).filter(
      (a) => !QUERY_ACCEPTS.has(a) && a !== 'url' && a !== 'ip' && a !== 'host',
    );
    if (specific.length) {
      const inferred = inferDossierKind(q).kind;
      const queryServes = sourceServesKind(accepts, inferred);
      // ROTEAMENTO POR TIPO (Fase 2): a fonte é servida se ALGUM accept dela tem um
      // campo cujo KIND canônico casa (validando formato p/ doc). Antes era igualdade
      // literal de chave (extra?.[a]), então CPF no campo `cpf` não satisfazia a fonte
      // `cpf_cnpj` (gate falso=bloqueava maigret/mr_cnpj/doc_validar).
      const fieldProvides = specific.some((a) => fieldValueForAccept(extra, a) != null);
      if (!queryServes && !fieldProvides) {
        throw new FonteNaoAceitaError(
          `Esta fonte requer ${acceptsLabel(accepts)} — preencha em Busca avançada ou refine a busca.`,
        );
      }
    }
    return searchMcp(source.mcpTool, query, extra, accepts);
  }
  throw new Error(`Fonte sem worker registrado: ${source.key}`);
}
