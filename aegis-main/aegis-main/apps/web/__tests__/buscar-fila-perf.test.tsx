/**
 * FE-B — a Fila renderiza o feedback de desempenho:
 *   - running → DECORRIDO ao vivo (m:ss) + ETA estimada;
 *   - done    → COBERTURA do envelope (varreu X sites em Ys, N contas).
 *
 * `coverageText` é provada como pura (sem precisar montar o componente todo);
 * o render confirma os data-testids de decorrido/eta/cobertura aparecem.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { Fila, coverageText, etaSecondsForItem } from '@/components/buscar/fila';
import type { FilaItem, SourceDef } from '@/lib/buscar/types';

// i18n: devolve a própria chave (com interpolação resolvida pelo .replace da UI).
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => {
    const M: Record<string, string> = {
      'buscar.perf.cobertura': 'varreu {sites} sites em {tempo}s, {contas} contas',
      'buscar.perf.coberturaSimples': '{contas} contas em {tempo}s',
      'buscar.perf.decorrido': 'decorrido',
      'buscar.perf.estimado': 'estimado ~{tempo}s',
    };
    return M[k] ?? k;
  },
}));

// store: a Fila lê advanced.fields p/ a ETA — devolvemos um timeout escolhido.
jest.mock('@/lib/buscar/store', () => {
  const actual = jest.requireActual('@/lib/buscar/store');
  return {
    ...actual,
    useBuscarStore: (sel: (s: unknown) => unknown) =>
      sel({ advanced: { fields: { maigret_username__timeout: '20', maigret_username__sites: 'GitHub,GitLab' } } }),
  };
});

function src(tool: string): SourceDef {
  return { key: tool, label: 'Maigret · username', category: 'username', mcpTool: tool };
}

function item(partial: Partial<FilaItem>): FilaItem {
  return {
    id: 'a',
    query: 'alvo',
    source: src('maigret_username@v1'),
    status: 'running',
    results: [],
    queuedAt: 0,
    startedAt: 0,
    ...partial,
  };
}

describe('coverageText — pura', () => {
  const t = (k: string) =>
    ({
      'buscar.perf.cobertura': 'varreu {sites} sites em {tempo}s, {contas} contas',
      'buscar.perf.coberturaSimples': '{contas} contas em {tempo}s',
    }[k] ?? k);

  it('wmn → "varreu 680 sites em 8.4s, 12 contas"', () => {
    const it = item({
      status: 'done',
      results: [{ externalId: 'r', name: 'r', kind: 'k', raw: { data: { checked: 680, found_count: 12, duration_ms: 8400 } } }],
      durationMs: 8400,
    });
    expect(coverageText(t, it)).toBe('varreu 680 sites em 8.4s, 12 contas');
  });

  it('maigret (sem checked) → "4 contas em 5.0s" (<10s usa 1 casa)', () => {
    const it = item({
      status: 'done',
      results: [{ externalId: 'r', name: 'r', kind: 'k', raw: { data: { found_count: 4 } } }],
      durationMs: 5000,
    });
    expect(coverageText(t, it)).toBe('4 contas em 5.0s');
  });

  it('sem campos de cobertura → null', () => {
    const it = item({ status: 'done', results: [{ externalId: 'r', name: 'r', kind: 'k', raw: {} }] });
    expect(coverageText(t, it)).toBeNull();
  });
});

describe('etaSecondsForItem — usa timeout + sites do estado por-fonte', () => {
  it('2 sites selecionados × 20s = 20s (1 onda)', () => {
    const eta = etaSecondsForItem(item({}), {
      maigret_username__timeout: '20',
      maigret_username__sites: 'GitHub,GitLab',
    });
    expect(eta).toBe(20);
  });
  it('sem timeout e sem sites → null (não estima)', () => {
    expect(etaSecondsForItem(item({}), {})).toBeNull();
  });
});

describe('Fila — render do feedback ao vivo', () => {
  it('running mostra DECORRIDO e ETA', () => {
    render(
      <Fila items={[item({ startedAt: Date.now() - 8000 })]} onCancelAll={() => {}} onClear={() => {}} />,
    );
    // a fila começa recolhida — abre pra ver os itens.
    fireEvent.click(screen.getByTestId('buscar-fila-toggle'));
    expect(screen.getByTestId('buscar-fila-decorrido-a')).toBeInTheDocument();
    expect(screen.getByTestId('buscar-fila-eta-a')).toBeInTheDocument();
  });

  it('done mostra COBERTURA', () => {
    render(
      <Fila
        items={[
          item({
            status: 'done',
            results: [{ externalId: 'r', name: 'r', kind: 'k', raw: { data: { checked: 680, found_count: 12, duration_ms: 8400 } } }],
            durationMs: 8400,
          }),
        ]}
        onCancelAll={() => {}}
        onClear={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('buscar-fila-toggle'));
    expect(screen.getByTestId('buscar-fila-cobertura-a')).toHaveTextContent(
      'varreu 680 sites em 8.4s, 12 contas',
    );
  });
});
