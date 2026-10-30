/**
 * FASE 2 do fan-out ESCALÁVEL (2026-06-26) — consumidor fino do stream SSE.
 *
 * Cobre as DUAS peças puras que viabilizam o stream:
 *
 *   1. `normalizeResult` (lib/buscar/normalize.ts) — extraída do worker e
 *      COMPARTILHADA com o stream. Prova que faz EXATAMENTE o que o worker
 *      fazia depois do Mcp.invoke: 1 item RICO p/ fonte com fact-extractor
 *      (doc_validar) e genericNormalize p/ fonte-lista.
 *
 *   2. `applySourceEvent` (lib/buscar/store.ts) — reducer puro do `event: source`
 *      que atualiza o FilaItem CERTO por tool (com e sem @vN), na ordem de
 *      término, e classifica done/skipped/error.
 */
import { normalizeResult } from '@/lib/buscar/normalize';
import {
  applySourceEvent,
  toolBase,
  toolMatches,
  type SourceEvent,
} from '@/lib/buscar/store';
import type { FilaItem, SourceDef } from '@/lib/buscar/types';

/* ────────────────────────────────────────────────────────────────────────
 * 1) normalizeResult — fonte RICA (fact-extractor) vs fonte-LISTA (genérica)
 * ──────────────────────────────────────────────────────────────────────── */

describe('normalizeResult — fonte com fact-extractor (doc_validar) → 1 item RICO', () => {
  // SHAPE REAL do envelope cru (doc_validar@v1): {status, data:{...}}.
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
  const out = normalizeResult('doc_validar@v1', raw, '11144477735');

  it('devolve exatamente 1 item (escalar, não lista)', () => {
    expect(out).toHaveLength(1);
  });
  it('name humano (= data.name), nunca o fallback tool@vN', () => {
    expect(out[0].name).toBe('CPF válido: 111.444.777-35');
    expect(out[0].name).not.toMatch(/@v\d+/);
  });
  it('preserva facts (Situação=Válido tone ok) e ação contextual', () => {
    const sit = out[0].facts?.find((f) => f.label === 'buscar.fato.situacao');
    expect(sit?.tone).toBe('ok');
    expect(out[0].action?.value).toBe('111.444.777-35');
  });
  it('mantém o envelope cru em raw e externalId estável', () => {
    expect(out[0].raw).toBe(raw);
    expect(out[0].externalId).toBe('doc_validar@v1-11144477735');
  });
  it('resolve o extractor pela BASE do tool (@v2 cai no mesmo)', () => {
    const v2 = normalizeResult('doc_validar@v2', raw, '11144477735');
    expect(v2[0].name).toBe('CPF válido: 111.444.777-35');
  });
});

describe('normalizeResult — fonte-LISTA (sem extractor) → genericNormalize', () => {
  // Envelope típico Câmara/Senado: {status, data:{dados:[...]}}.
  const raw = {
    status: 200,
    data: {
      dados: [
        { id: 100, nome: 'Fulano de Tal', siglaPartido: 'XPTO', siglaUf: 'SP' },
        { id: 101, nome: 'Sicrana Souza', siglaPartido: 'ABC', siglaUf: 'RJ' },
      ],
    },
  };
  const out = normalizeResult('camara_deputados@v1', raw, 'fulano');

  it('extrai os N itens da lista aninhada', () => {
    expect(out).toHaveLength(2);
  });
  it('normaliza nome/subtitle/externalId genéricos', () => {
    expect(out[0].name).toBe('Fulano de Tal');
    expect(out[0].externalId).toBe('100');
    expect(out[0].subtitle).toBe('XPTO');
  });
  it('kind cai na base do tool quando o item não declara', () => {
    expect(out[0].kind).toBe('camara_deputados');
  });
  it('nenhum item ganha facts (lista genérica não tem fato escalar)', () => {
    expect(out.every((r) => r.facts === undefined)).toBe(true);
  });
});

describe('normalizeResult — payload vazio/sem itens', () => {
  it('lista vazia → []', () => {
    expect(normalizeResult('searx_search@v1', { data: { results: [] } }, 'q')).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 2) applySourceEvent — atualiza o FilaItem certo por tool (com/sem @vN)
 * ──────────────────────────────────────────────────────────────────────── */

const NOW = 2_000;

function src(tool: string): SourceDef {
  return { key: tool, label: tool, category: 'osint-pessoa', mcpTool: tool };
}

function runningItem(id: string, tool: string, query = 'alvo'): FilaItem {
  return {
    id,
    query,
    source: src(tool),
    status: 'running',
    results: [],
    queuedAt: 1_000,
    startedAt: 1_000,
  };
}

describe('toolBase / toolMatches', () => {
  it('toolBase tira o sufixo de versão', () => {
    expect(toolBase('camara_deputados@v1')).toBe('camara_deputados');
    expect(toolBase('doc_validar')).toBe('doc_validar');
  });
  it('casa exato e por base (com/sem @vN)', () => {
    expect(toolMatches('camara_deputados@v1', 'camara_deputados@v1')).toBe(true);
    expect(toolMatches('camara_deputados@v1', 'camara_deputados@v2')).toBe(true); // só base
    expect(toolMatches('camara_deputados@v1', 'camara_deputados')).toBe(true);
    expect(toolMatches('senado_senadores@v1', 'camara_deputados@v1')).toBe(false);
    expect(toolMatches(null, 'x@v1')).toBe(false);
  });
});

describe('applySourceEvent — done', () => {
  const fila = [runningItem('a', 'doc_validar@v1', '11144477735'), runningItem('b', 'camara_deputados@v1')];
  const ids = new Set(['a', 'b']);
  const ev: SourceEvent = {
    tool: 'doc_validar@v1',
    status: 'done',
    result: { status: 'ok', data: { tipo: 'CPF', valido: true, formatado: '111.444.777-35', name: 'CPF válido: 111.444.777-35' } },
  };
  const out = applySourceEvent(fila, ev, ids, NOW);

  it('atualiza SÓ o item do tool casado, deixa o outro running', () => {
    expect(out[0].status).toBe('done');
    expect(out[1].status).toBe('running');
  });
  it('normaliza o result cru (item rico via fact-extractor)', () => {
    expect(out[0].results).toHaveLength(1);
    expect(out[0].results[0].name).toBe('CPF válido: 111.444.777-35');
  });
  it('preenche finishedAt + durationMs a partir de startedAt', () => {
    expect(out[0].finishedAt).toBe(NOW);
    expect(out[0].durationMs).toBe(NOW - 1_000);
  });
});

describe('applySourceEvent — casa por BASE quando o evento traz versão diferente', () => {
  const fila = [runningItem('a', 'camara_deputados@v1')];
  const ids = new Set(['a']);
  // Backend emite @v2; o item local é @v1 — deve casar pela base.
  const ev: SourceEvent = {
    tool: 'camara_deputados@v2',
    status: 'done',
    result: { data: { dados: [{ id: 1, nome: 'Beltrano' }] } },
  };
  const out = applySourceEvent(fila, ev, ids, NOW);

  it('atualiza o item @v1 com o evento @v2', () => {
    expect(out[0].status).toBe('done');
    expect(out[0].results[0].name).toBe('Beltrano');
  });
});

describe('applySourceEvent — skipped', () => {
  const fila = [runningItem('a', 'tiktok_video@v2')];
  const ids = new Set(['a']);
  const ev: SourceEvent = {
    tool: 'tiktok_video@v2',
    status: 'skipped',
    reason: 'Esta fonte só aceita URL — cole o endereço.',
  };
  const out = applySourceEvent(fila, ev, ids, NOW);

  it('marca skipped (neutro) com a razão, sem erro', () => {
    expect(out[0].status).toBe('skipped');
    expect(out[0].skipReason).toBe('Esta fonte só aceita URL — cole o endereço.');
    expect(out[0].error).toBeUndefined();
  });
});

describe('applySourceEvent — error humanizado (nunca corpo cru)', () => {
  const fila = [runningItem('a', 'senado_senadores@v1')];
  const ids = new Set(['a']);
  const ev: SourceEvent = {
    tool: 'senado_senadores@v1',
    status: 'error',
    error: 'circuit-open:senado-federal',
  };
  const out = applySourceEvent(fila, ev, ids, NOW);

  it('classifica como error com mensagem amigável', () => {
    expect(out[0].status).toBe('error');
    expect(out[0].error).not.toContain('circuit-open');
  });
});

describe('applySourceEvent — não toca itens fora do lote nem já finalizados', () => {
  it('item de OUTRO lote (id não em batchIds) fica intacto mesmo casando o tool', () => {
    const fila = [runningItem('outro', 'doc_validar@v1')];
    const out = applySourceEvent(fila, { tool: 'doc_validar@v1', status: 'done', result: {} }, new Set(['a']), NOW);
    expect(out[0].status).toBe('running');
    expect(out).toEqual(fila); // fila intacta
  });

  it('atualiza apenas o PRIMEIRO running do tool (ordem de término, 1 frame = 1 fonte)', () => {
    const fila = [
      { ...runningItem('a', 'reddit_search@v1'), status: 'done' as const },
      runningItem('b', 'reddit_search@v1'),
    ];
    const ids = new Set(['a', 'b']);
    const out = applySourceEvent(fila, { tool: 'reddit_search@v1', status: 'done', result: { data: { results: [] } } }, ids, NOW);
    expect(out[0].status).toBe('done'); // já estava done, não rebaixa
    expect(out[1].status).toBe('done'); // o running virou done
  });

  it('frame sem item casando → fila intacta', () => {
    const fila = [runningItem('a', 'doc_validar@v1')];
    const out = applySourceEvent(fila, { tool: 'whois_br@v1', status: 'done', result: {} }, new Set(['a']), NOW);
    expect(out).toEqual(fila);
  });
});
