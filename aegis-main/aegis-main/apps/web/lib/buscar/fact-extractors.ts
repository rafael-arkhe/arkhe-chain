/**
 * FRENTE A (2026-06-26) — fact-extractors por fonte.
 *
 * PROBLEMA: fontes de FATO ESCALAR (doc_validar, telefone_lookup, holehe_email)
 * devolvem um objeto único `{status, data:{...}}` — não uma LISTA. O
 * `genericNormalize` (feito pra listas) jogava esse objeto em `[obj]` e o título
 * caía no fallback "tool@vN-N", descartando o payload humano que JÁ vinha. O
 * operador via "doc_validar@v1 | Criar entidade" e NUNCA o que foi encontrado.
 *
 * SOLUÇÃO: um mapa keyed pela BASE do tool (sem `@vN`). Cada extractor lê o
 * SHAPE REAL do envelope cru e devolve um `Partial<NormalizedResult>` rico —
 * `name` humano, `subtitle`, `snippet`, `facts[]` (mini key-value) e a `action`
 * contextual que aprofunda. NUNCA produz fallback `tool@vN`.
 *
 * i18n: os `label` dos facts são CHAVES do dict (`buscar.fato.*`), resolvidas
 * pela camada de exibição (resultados/detalhe via `useT()`). Os VALORES de
 * status que precisam de tradução (Válido/Inválido) são resolvidos AQUI pelo
 * resolver `t` injetado — workers rodam fora do React e usam `tDict` (mesmo
 * padrão de searchCameras). Dados puros (número, documento, site) passam crus.
 *
 * MULTI-DOMÍNIO: extractor é por CAPACIDADE do adapter (contrato de payload),
 * não por vertical. Fontes-lista seguem no genericNormalize sem facts.
 */

import type { NormalizedResult } from './types';

/** Resolver de string do dict — injetado para manter os extractores puros. */
export type FactT = (key: string) => string;

/** Assinatura de um extractor: lê o envelope CRU + a query origem → resultado rico. */
export type FactExtractor = (
  rawResult: unknown,
  originQuery: string,
  t: FactT,
) => Partial<NormalizedResult>;

/** Lê uma string não-vazia de um objeto, tolerante a undefined. */
function str(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = obj?.[key];
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return undefined;
}

/** Coage para Record sem estourar. */
function asObj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

/**
 * doc_validar@v1 — `result.data = {tipo, valido, formatado, digitos, name}`.
 * name = data.name ("CPF válido: 111.444.777-35"); facts Situação/Documento/Tipo.
 * Ação: re-buscar com o documento formatado (aprofunda nas fontes que aceitam CPF/CNPJ).
 */
function docValidar(rawResult: unknown, originQuery: string, t: FactT): Partial<NormalizedResult> {
  const data = asObj(asObj(rawResult)?.data) ?? asObj(rawResult) ?? {};
  const tipo = str(data, 'tipo'); // "CPF" | "CNPJ"
  const valido = data.valido === true;
  const formatado = str(data, 'formatado');
  const name = str(data, 'name') ?? (formatado ? `${tipo ?? ''} ${formatado}`.trim() : originQuery);

  const facts: NonNullable<NormalizedResult['facts']> = [
    {
      label: 'buscar.fato.situacao',
      value: valido ? t('buscar.fato.valido') : t('buscar.fato.invalido'),
      tone: valido ? 'ok' : 'warn',
    },
  ];
  if (formatado) facts.push({ label: 'buscar.fato.documento', value: formatado });
  if (tipo) facts.push({ label: 'buscar.fato.tipo', value: tipo });

  return {
    name,
    subtitle: tipo ? `${tipo} · ${valido ? t('buscar.fato.valido') : t('buscar.fato.invalido')}` : undefined,
    facts,
    kind: tipo ? tipo.toLowerCase() : 'documento',
    score: undefined,
    // Aprofundar: re-buscar com o documento formatado (fontes de CPF/CNPJ atendem).
    ...(formatado || tipo
      ? { action: { label: t('buscar.acao.buscarComValor'), value: formatado ?? originQuery } }
      : {}),
  };
}

/**
 * telefone_lookup@v1 — `result.data = {nacional, tipo, regiao, operadora_faixa, e164, ddd, valido, name}`.
 * name = data.nacional; subtitle = `${tipo} · ${regiao}`; facts Tipo/Região/Operadora/E.164/DDD.
 * Operadora omitida quando vazia. Ação: re-buscar com o número nacional.
 */
function telefoneLookup(rawResult: unknown, originQuery: string, t: FactT): Partial<NormalizedResult> {
  const data = asObj(asObj(rawResult)?.data) ?? asObj(rawResult) ?? {};
  const nacional = str(data, 'nacional');
  const tipo = str(data, 'tipo'); // "móvel" | "fixo"
  const regiao = str(data, 'regiao');
  const operadora = str(data, 'operadora_faixa'); // pode vir ""
  const e164 = str(data, 'e164');
  const ddd = str(data, 'ddd');

  const name = nacional ?? str(data, 'name') ?? originQuery;
  const subtitleParts = [tipo, regiao].filter((p): p is string => !!p);

  const facts: NonNullable<NormalizedResult['facts']> = [];
  if (tipo) facts.push({ label: 'buscar.fato.tipo', value: tipo });
  if (regiao) facts.push({ label: 'buscar.fato.regiao', value: regiao });
  if (operadora) facts.push({ label: 'buscar.fato.operadora', value: operadora }); // omite se vazia
  if (e164) facts.push({ label: 'buscar.fato.e164', value: e164 });
  if (ddd) facts.push({ label: 'buscar.fato.ddd', value: ddd });

  return {
    name,
    subtitle: subtitleParts.length ? subtitleParts.join(' · ') : undefined,
    facts,
    kind: 'telefone',
    score: undefined,
    action: { label: t('buscar.acao.buscarComValor'), value: nacional ?? e164 ?? originQuery },
  };
}

/** Lê um "site" tolerante a 2 shapes: string crua OU `{site}` (objeto). */
function siteOf(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return str(asObj(v), 'site');
}

/**
 * holehe_email@v1 — envelope DIFERENTE (campos no TOPO):
 * `result = {email, found_count, found:[{site}], rate_limited:[...strings]}`.
 * name = email; subtitle = "{n} contas encontradas"; facts = found.map(site→Conta).
 *
 * `score` NÃO é mais setado: `found_count` é um CONTADOR (4, 14…), NÃO uma
 * relevância 0..1 — a camada de exibição faz `score.toFixed(2)` e renderizava
 * "4.00" colado ao subtitle "4 contas" (colisão visual). A contagem já vive no
 * subtitle; o badge de score é exclusivo de relevância de embedding (0<score≤1).
 *
 * `rate_limited` (LISTA DE STRINGS — módulos onde o holehe bateu rate-limit e
 * NÃO pôde confirmar) vira UM fato neutro "Sem confirmar (rate-limit): N", em
 * vez de ser descartado. Tom neutro: não é positivo nem alerta, é incerteza.
 */
function holeheEmail(rawResult: unknown, originQuery: string, t: FactT): Partial<NormalizedResult> {
  const r = asObj(rawResult) ?? {};
  const email = str(r, 'email') ?? originQuery;
  const foundRaw = Array.isArray(r.found) ? (r.found as unknown[]) : [];
  const foundCount =
    typeof r.found_count === 'number' ? r.found_count : foundRaw.length;

  const sites = foundRaw
    .map(siteOf)
    .filter((s): s is string => !!s);

  const rateLimited = (Array.isArray(r.rate_limited) ? (r.rate_limited as unknown[]) : [])
    .map(siteOf)
    .filter((s): s is string => !!s);

  const subtitle =
    foundCount > 0
      ? `${foundCount} ${
          foundCount === 1
            ? t('buscar.fato.contaEncontrada')
            : t('buscar.fato.contasEncontradas')
        }`
      : t('buscar.fato.nenhumaConta');

  const facts: NonNullable<NormalizedResult['facts']> = sites.map((site) => ({
    label: 'buscar.fato.conta',
    value: site,
    tone: 'ok' as const,
  }));
  // Sem confirmar (rate-limit): contagem dos módulos que não puderam confirmar.
  if (rateLimited.length > 0) {
    facts.push({
      label: 'buscar.fato.semConfirmar',
      value: String(rateLimited.length),
      tone: 'neutral',
    });
  }

  return {
    name: email,
    subtitle,
    facts,
    kind: 'email',
    // score deliberadamente ausente: contador ≠ relevância (ver docstring).
    score: undefined,
    action: { label: t('buscar.acao.aprofundarEmail'), value: email },
  };
}

/**
 * mr_cnpj / opencnpj_cnpj — CADASTRO de empresa. Shape (em `data` ou no topo):
 * {razao_social, nome_fantasia, descricao_situacao_cadastral|situacao_cadastral|situacao,
 *  data_inicio_atividade|data_abertura, capital_social, natureza_juridica,
 *  cnae_fiscal_descricao|atividade_principal, municipio, uf}.
 * name = razão social; facts = Situação(ok se Ativa)/Abertura/Capital/Natureza/Atividade/Município.
 * Sem isto o card caía no jargão "opencnpj_cnpj@v1-0" (era uma fonte de cadastro, não de lista).
 */
function cnpjCadastro(rawResult: unknown, originQuery: string, t: FactT): Partial<NormalizedResult> {
  const data = asObj(asObj(rawResult)?.data) ?? asObj(rawResult) ?? {};
  const razao = str(data, 'razao_social') ?? str(data, 'nome') ?? str(data, 'nome_empresarial');
  const fantasia = str(data, 'nome_fantasia');
  const situacao =
    str(data, 'descricao_situacao_cadastral') ?? str(data, 'situacao_cadastral') ?? str(data, 'situacao');
  const abertura = str(data, 'data_inicio_atividade') ?? str(data, 'data_abertura');
  const capital = str(data, 'capital_social');
  const natureza = str(data, 'natureza_juridica');
  const atividade = str(data, 'cnae_fiscal_descricao') ?? str(data, 'atividade_principal');
  const municipio = str(data, 'municipio');
  const uf = str(data, 'uf');
  const local = [municipio, uf].filter((p): p is string => !!p).join('/');

  const name = razao ?? fantasia ?? originQuery;
  const ativa = !!situacao && /ativ/i.test(situacao);

  const facts: NonNullable<NormalizedResult['facts']> = [];
  if (situacao) facts.push({ label: 'buscar.fato.situacao', value: situacao, tone: ativa ? 'ok' : 'warn' });
  if (fantasia && fantasia !== razao) facts.push({ label: 'buscar.fato.nomeFantasia', value: fantasia });
  if (atividade) facts.push({ label: 'buscar.fato.atividade', value: atividade });
  if (abertura) facts.push({ label: 'buscar.fato.abertura', value: abertura });
  if (natureza) facts.push({ label: 'buscar.fato.natureza', value: natureza });
  if (capital) facts.push({ label: 'buscar.fato.capital', value: capital });
  if (local) facts.push({ label: 'buscar.fato.municipio', value: local });

  return {
    name,
    subtitle: [situacao, local].filter((p): p is string => !!p).join(' · ') || undefined,
    facts,
    kind: 'empresa',
    score: undefined,
    // Aprofundar: re-buscar pela razão social (notícias/sanções/sócios).
    ...(razao ? { action: { label: t('buscar.acao.buscarComEsteResultado'), value: razao } } : {}),
  };
}

/**
 * Mapa CANÔNICO keyed pela BASE do tool (sem `@vN`). O worker resolve a base
 * com `tool.split('@')[0]` antes de consultar — assim `doc_validar@v1`,
 * `doc_validar@v2`, etc. caem no mesmo extractor.
 */
export const FACT_EXTRACTORS: Record<string, FactExtractor> = {
  doc_validar: docValidar,
  telefone_lookup: telefoneLookup,
  holehe_email: holeheEmail,
  mr_cnpj: cnpjCadastro,
  opencnpj_cnpj: cnpjCadastro,
};

/** Resolve o extractor pela base do tool (`doc_validar@v1` → `doc_validar`). */
export function getFactExtractor(tool: string): FactExtractor | undefined {
  const base = (tool || '').split('@')[0];
  return FACT_EXTRACTORS[base];
}
