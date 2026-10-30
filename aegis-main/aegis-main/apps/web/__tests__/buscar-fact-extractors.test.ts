/**
 * FRENTE A (2026-06-26) — fact-extractors do /buscar.
 *
 * PROVA com os 3 SHAPES REAIS (capturados ao vivo) como fixtures que cada
 * extractor de FATO ESCALAR devolve um resultado RICO:
 *   - `name` HUMANO (nunca o fallback `tool@vN`);
 *   - `facts[]` corretos (label = chave i18n, value = dado, tone p/ status);
 *   - `action` contextual com o valor pra re-busca.
 *
 * doc_validar (CPF válido / CPF inválido / CNPJ) · telefone (móvel / fixo) ·
 * holehe (14 contas / 0 conta).
 */
import {
  FACT_EXTRACTORS,
  getFactExtractor,
  type FactT,
} from '@/lib/buscar/fact-extractors';
import {
  scoreIsRelevance,
  isRealEntityKind,
  localEntityFacts,
} from '@/components/buscar/resultados';
import type { NormalizedResult } from '@/lib/buscar/types';

/** Resolver fake — devolve pt-BR previsível p/ as chaves usadas pelos extractores. */
const t: FactT = (key) =>
  ({
    'buscar.fato.situacao': 'Situação',
    'buscar.fato.valido': 'Válido',
    'buscar.fato.invalido': 'INVÁLIDO',
    'buscar.fato.documento': 'Documento',
    'buscar.fato.tipo': 'Tipo',
    'buscar.fato.regiao': 'Região',
    'buscar.fato.operadora': 'Operadora',
    'buscar.fato.e164': 'E.164',
    'buscar.fato.ddd': 'DDD',
    'buscar.fato.conta': 'Conta',
    'buscar.fato.contaEncontrada': 'conta encontrada',
    'buscar.fato.contasEncontradas': 'contas encontradas',
    'buscar.fato.nenhumaConta': 'Nenhuma conta encontrada',
    'buscar.fato.semConfirmar': 'Sem confirmar (rate-limit)',
    'buscar.fato.classificacao': 'Classificação',
    'buscar.acao.buscarComValor': 'Buscar com este valor',
    'buscar.acao.aprofundarEmail': 'Aprofundar e-mail',
  })[key] ?? key;

/** Nenhum `name` pode parecer com o jargão tool@vN. */
const NO_TOOL_VN = /@v\d+/;

describe('getFactExtractor — resolução por BASE do tool (sem @vN)', () => {
  it('doc_validar@v1 / @v2 → mesmo extractor', () => {
    expect(getFactExtractor('doc_validar@v1')).toBe(FACT_EXTRACTORS.doc_validar);
    expect(getFactExtractor('doc_validar@v2')).toBe(FACT_EXTRACTORS.doc_validar);
  });
  it('tool sem extractor → undefined (cai no genericNormalize)', () => {
    expect(getFactExtractor('camara_deputados@v1')).toBeUndefined();
  });
});

describe('doc_validar — CPF válido', () => {
  const raw = {
    status: 'ok',
    data: {
      tipo: 'CPF',
      valido: true,
      formatado: '111.444.777-35',
      digitos: '11144477735',
      name: 'CPF válido: 111.444.777-35',
    },
  };
  const out = FACT_EXTRACTORS.doc_validar(raw, '11144477735', t);

  it('name humano (= data.name), sem tool@vN', () => {
    expect(out.name).toBe('CPF válido: 111.444.777-35');
    expect(out.name).not.toMatch(NO_TOOL_VN);
  });
  it('fact Situação = Válido, tone ok', () => {
    const sit = out.facts?.find((f) => f.label === 'buscar.fato.situacao');
    expect(sit?.value).toBe('Válido');
    expect(sit?.tone).toBe('ok');
  });
  it('fact Documento = formatado, fact Tipo = CPF', () => {
    expect(out.facts?.find((f) => f.label === 'buscar.fato.documento')?.value).toBe(
      '111.444.777-35',
    );
    expect(out.facts?.find((f) => f.label === 'buscar.fato.tipo')?.value).toBe('CPF');
  });
  it('ação re-busca com o documento formatado', () => {
    expect(out.action?.value).toBe('111.444.777-35');
    expect(out.action?.label).toBe('Buscar com este valor');
  });
});

describe('doc_validar — CPF inválido', () => {
  const raw = {
    status: 'ok',
    data: {
      tipo: 'CPF',
      valido: false,
      formatado: '111.111.111-11',
      digitos: '11111111111',
      name: 'CPF inválido: 111.111.111-11',
    },
  };
  const out = FACT_EXTRACTORS.doc_validar(raw, '11111111111', t);

  it('name humano, sem tool@vN', () => {
    expect(out.name).toBe('CPF inválido: 111.111.111-11');
    expect(out.name).not.toMatch(NO_TOOL_VN);
  });
  it('fact Situação = INVÁLIDO, tone warn', () => {
    const sit = out.facts?.find((f) => f.label === 'buscar.fato.situacao');
    expect(sit?.value).toBe('INVÁLIDO');
    expect(sit?.tone).toBe('warn');
  });
});

describe('doc_validar — CNPJ válido', () => {
  const raw = {
    status: 'ok',
    data: {
      tipo: 'CNPJ',
      valido: true,
      formatado: '11.222.333/0001-81',
      digitos: '11222333000181',
      name: 'CNPJ válido: 11.222.333/0001-81',
    },
  };
  const out = FACT_EXTRACTORS.doc_validar(raw, '11222333000181', t);

  it('name humano + Tipo CNPJ', () => {
    expect(out.name).toBe('CNPJ válido: 11.222.333/0001-81');
    expect(out.name).not.toMatch(NO_TOOL_VN);
    expect(out.facts?.find((f) => f.label === 'buscar.fato.tipo')?.value).toBe('CNPJ');
  });
  it('kind derivado do tipo (cnpj)', () => {
    expect(out.kind).toBe('cnpj');
  });
});

describe('telefone_lookup — celular (móvel)', () => {
  const raw = {
    status: 'ok',
    data: {
      nacional: '(11) 99999-8888',
      tipo: 'móvel',
      regiao: 'São Paulo',
      operadora_faixa: 'Vivo',
      e164: '+5511999998888',
      ddd: '11',
      valido: true,
      name: 'Telefone (11) 99999-8888',
    },
  };
  const out = FACT_EXTRACTORS.telefone_lookup(raw, '11999998888', t);

  it('name = nacional, sem tool@vN', () => {
    expect(out.name).toBe('(11) 99999-8888');
    expect(out.name).not.toMatch(NO_TOOL_VN);
  });
  it('subtitle = tipo · regiao', () => {
    expect(out.subtitle).toBe('móvel · São Paulo');
  });
  it('facts Tipo/Região/Operadora/E.164/DDD', () => {
    expect(out.facts?.find((f) => f.label === 'buscar.fato.tipo')?.value).toBe('móvel');
    expect(out.facts?.find((f) => f.label === 'buscar.fato.regiao')?.value).toBe('São Paulo');
    expect(out.facts?.find((f) => f.label === 'buscar.fato.operadora')?.value).toBe('Vivo');
    expect(out.facts?.find((f) => f.label === 'buscar.fato.e164')?.value).toBe('+5511999998888');
    expect(out.facts?.find((f) => f.label === 'buscar.fato.ddd')?.value).toBe('11');
  });
  it('ação re-busca com o nacional', () => {
    expect(out.action?.value).toBe('(11) 99999-8888');
  });
});

describe('telefone_lookup — fixo, operadora vazia', () => {
  const raw = {
    status: 'ok',
    data: {
      nacional: '(11) 3030-4040',
      tipo: 'fixo',
      regiao: 'São Paulo',
      operadora_faixa: '', // vazia → fact omitido
      e164: '+551130304040',
      ddd: '11',
      valido: true,
      name: 'Telefone (11) 3030-4040',
    },
  };
  const out = FACT_EXTRACTORS.telefone_lookup(raw, '1130304040', t);

  it('name = nacional', () => {
    expect(out.name).toBe('(11) 3030-4040');
    expect(out.name).not.toMatch(NO_TOOL_VN);
  });
  it('Operadora omitida quando vazia', () => {
    expect(out.facts?.find((f) => f.label === 'buscar.fato.operadora')).toBeUndefined();
  });
  it('subtitle = fixo · São Paulo', () => {
    expect(out.subtitle).toBe('fixo · São Paulo');
  });
});

describe('holehe_email — 14 contas encontradas', () => {
  // SHAPE REAL (holehe_adapter.py): rate_limited é LISTA DE STRINGS (nomes de
  // módulos onde bateu rate-limit), não objetos {site}.
  const raw = {
    email: 'alvo@example.com',
    found_count: 14,
    found: [
      { site: 'github.com' },
      { site: 'spotify.com' },
      { site: 'twitter.com' },
    ],
    rate_limited: ['instagram.com', 'tiktok.com'],
  };
  const out = FACT_EXTRACTORS.holehe_email(raw, 'alvo@example.com', t);

  it('name = email, sem tool@vN', () => {
    expect(out.name).toBe('alvo@example.com');
    expect(out.name).not.toMatch(NO_TOOL_VN);
  });
  it('subtitle = "14 contas encontradas"', () => {
    expect(out.subtitle).toBe('14 contas encontradas');
  });
  it('facts = found.map(site → Conta), tone ok', () => {
    const contas = out.facts?.filter((f) => f.label === 'buscar.fato.conta') ?? [];
    expect(contas.map((f) => f.value)).toEqual(['github.com', 'spotify.com', 'twitter.com']);
    expect(contas.every((f) => f.tone === 'ok')).toBe(true);
  });
  it('BUG (a): NÃO seta score (found_count é CONTADOR, não relevância 0..1)', () => {
    // Antes setava score=14 → o render fazia 14.toFixed(2)="14.00" colado
    // ao subtitle "14 contas". O badge de score é exclusivo de relevância.
    expect(out.score).toBeUndefined();
  });
  it('CONTEXTO (c): rate_limited vira fact "Sem confirmar" (contagem), tom neutro', () => {
    const rl = out.facts?.find((f) => f.label === 'buscar.fato.semConfirmar');
    expect(rl?.value).toBe('2'); // 2 módulos sem confirmar
    expect(rl?.tone).toBe('neutral');
  });
  it('ação aprofundar e-mail com o email', () => {
    expect(out.action?.label).toBe('Aprofundar e-mail');
    expect(out.action?.value).toBe('alvo@example.com');
  });
});

describe('holehe_email — rate_limited tolera shape de OBJETO {site}', () => {
  // Defesa: se algum dia o envelope vier com objetos em vez de strings,
  // ainda extraímos o site e contamos.
  const raw = {
    email: 'alvo@example.com',
    found_count: 0,
    found: [],
    rate_limited: [{ site: 'instagram.com' }, { site: 'tiktok.com' }, { site: 'x.com' }],
  };
  const out = FACT_EXTRACTORS.holehe_email(raw, 'alvo@example.com', t);
  it('conta os 3 módulos rate-limited', () => {
    expect(out.facts?.find((f) => f.label === 'buscar.fato.semConfirmar')?.value).toBe('3');
  });
});

describe('holehe_email — 0 conta', () => {
  const raw = {
    email: 'ninguem@example.com',
    found_count: 0,
    found: [],
    rate_limited: [],
  };
  const out = FACT_EXTRACTORS.holehe_email(raw, 'ninguem@example.com', t);

  it('name = email', () => {
    expect(out.name).toBe('ninguem@example.com');
    expect(out.name).not.toMatch(NO_TOOL_VN);
  });
  it('subtitle = "Nenhuma conta encontrada"', () => {
    expect(out.subtitle).toBe('Nenhuma conta encontrada');
  });
  it('sem facts (sem conta nem rate-limit), sem score-badge-de-count', () => {
    expect(out.facts?.length ?? 0).toBe(0);
    expect(out.score).toBeUndefined();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * Helpers da CAMADA DE EXIBIÇÃO (resultados.tsx) — gates dos BUGs (a) e (b)
 * e dos facts derivados de entidade local (contexto c).
 * ──────────────────────────────────────────────────────────────────────── */

describe('scoreIsRelevance — BUG (a): badge de score só p/ relevância 0<score≤1', () => {
  it('aceita relevância de embedding (0..1)', () => {
    expect(scoreIsRelevance(0.87)).toBe(true);
    expect(scoreIsRelevance(1)).toBe(true);
    expect(scoreIsRelevance(0.0001)).toBe(true);
  });
  it('rejeita CONTADOR (>1) — holehe found_count nunca vira "4.00"', () => {
    expect(scoreIsRelevance(4)).toBe(false);
    expect(scoreIsRelevance(14)).toBe(false);
  });
  it('rejeita 0, negativo, null e undefined', () => {
    expect(scoreIsRelevance(0)).toBe(false);
    expect(scoreIsRelevance(-1)).toBe(false);
    expect(scoreIsRelevance(null)).toBe(false);
    expect(scoreIsRelevance(undefined)).toBe(false);
  });
});

describe('isRealEntityKind — BUG (b): slug-fonte não é tipo de entidade', () => {
  it('entidade local (entityId) → kind é tipo real, mesmo sem dict', () => {
    expect(isRealEntityKind('person', true)).toBe(true);
    expect(isRealEntityKind('algum_kind_novo', true)).toBe(true);
  });
  it('kind curado no dict → tipo real', () => {
    expect(isRealEntityKind('email', false)).toBe(true);
    expect(isRealEntityKind('cnpj', false)).toBe(true);
  });
  it('slug-fallback da fonte (youtube_search) → NÃO é tipo', () => {
    expect(isRealEntityKind('youtube_search', false)).toBe(false);
    expect(isRealEntityKind('senado_senadores', false)).toBe(false);
  });
  it('kind vazio → false', () => {
    expect(isRealEntityKind('', false)).toBe(false);
    expect(isRealEntityKind(undefined, false)).toBe(false);
  });
});

describe('localEntityFacts — contexto (c): subtitle cru de entidade local vira facts', () => {
  const tt: FactT = (key) =>
    ({
      'kind.person': 'Pessoa',
      'buscar.fato.tipo': 'Tipo',
      'buscar.fato.classificacao': 'Classificação',
    })[key] ?? key;

  it('person · classif. restrito → Tipo=Pessoa, Classificação=RESTRITO', () => {
    const r: NormalizedResult = {
      externalId: 'e1',
      entityId: 'e1',
      name: 'Fulano',
      kind: 'person',
      subtitle: 'person · classif. restrito',
    };
    const facts = localEntityFacts(tt, r);
    expect(facts?.find((f) => f.label === 'buscar.fato.tipo')?.value).toBe('Pessoa');
    expect(facts?.find((f) => f.label === 'buscar.fato.classificacao')?.value).toBe('RESTRITO');
  });

  it('resultado NÃO-local (sem entityId) → null (mantém subtitle cru)', () => {
    const r: NormalizedResult = {
      externalId: 'x',
      name: 'algo',
      kind: 'youtube_search',
      subtitle: 'um vídeo qualquer',
    };
    expect(localEntityFacts(tt, r)).toBeNull();
  });

  it('local sem classificação no subtitle → só Tipo', () => {
    const r: NormalizedResult = {
      externalId: 'e2',
      entityId: 'e2',
      name: 'Sicrano',
      kind: 'person',
      subtitle: undefined,
    };
    const facts = localEntityFacts(tt, r);
    expect(facts?.map((f) => f.label)).toEqual(['buscar.fato.tipo']);
  });
});
