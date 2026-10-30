/**
 * Delta 1 da Onda 0 Safe Tag (2026-07-08) — cp_nav_hidden também esconde os
 * itens do FALLBACK_NAV (ex.: 'buscar').
 *
 * Antes, o useNavTree filtrava só os itens MODULARES (appItems) por
 * cp_nav_hidden; o tree montado do FALLBACK_NAV passava intacto — o vendor não
 * conseguia esconder /buscar de um tenant (vertical condomínio: família OSINT
 * escondida-não-removida, D9). Agora o filtro cobre as duas origens:
 *  - id em cp_nav_hidden → item some do tree;
 *  - seção que ficar vazia → some inteira;
 *  - id desconhecido (ex.: 'browser', que não é item do FALLBACK) → no-op;
 *  - sem ocultos → tree intacta (degrada em silêncio).
 */
import { renderHook, waitFor } from '@testing-library/react';

jest.mock('@/lib/workshop/client', () => ({
  Workshop: { list: jest.fn(async () => []) },
}));
jest.mock('@/lib/api', () => ({
  Alerts: { inbox: { countPending: jest.fn(async () => ({ count: 0 })) } },
  Pages: { list: jest.fn(async () => []) },
}));

import { useNavTree } from '@/lib/use-nav-tree';
import { FALLBACK_NAV } from '@/lib/api/fallback';

function findItem(
  tree: { sections: { items: { id: string }[] }[] },
  id: string,
) {
  for (const s of tree.sections) {
    const it = s.items.find((i) => i.id === id);
    if (it) return it;
  }
  return null;
}

describe('cp_nav_hidden esconde itens do FALLBACK_NAV (delta Onda 0 Safe Tag)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sem ocultos → tree intacta (todos os itens do FALLBACK presentes)', () => {
    const { result } = renderHook(() => useNavTree());
    for (const s of FALLBACK_NAV.sections) {
      for (const it of s.items) {
        expect(findItem(result.current.tree, it.id)).toBeTruthy();
      }
    }
  });

  it("['buscar'] → item 'buscar' some; resto fica", () => {
    const { result } = renderHook(() => useNavTree(['buscar']));
    expect(findItem(result.current.tree, 'buscar')).toBeNull();
    expect(findItem(result.current.tree, 'geo')).toBeTruthy();
    expect(findItem(result.current.tree, 'alertas')).toBeTruthy();
  });

  it('id que não é item do FALLBACK (ex.: browser) → no-op, sem quebrar', () => {
    const { result } = renderHook(() => useNavTree(['browser']));
    for (const s of FALLBACK_NAV.sections) {
      for (const it of s.items) {
        expect(findItem(result.current.tree, it.id)).toBeTruthy();
      }
    }
  });

  it('seção que ficar 100% oculta some inteira do tree', () => {
    const conteudo = FALLBACK_NAV.sections.find((s) => s.id === 'conteudo')!;
    const ids = conteudo.items.map((i) => i.id);
    const { result } = renderHook(() => useNavTree(ids));
    expect(
      result.current.tree.sections.find((s) => s.id === 'conteudo'),
    ).toBeUndefined();
    // as demais seções seguem
    expect(findItem(result.current.tree, 'buscar')).toBeTruthy();
  });

  it('badge real de alertas segue funcionando com o filtro ativo', async () => {
    const { Alerts } = jest.requireMock('@/lib/api');
    (Alerts.inbox.countPending as jest.Mock).mockResolvedValue({ count: 4 });
    const { result } = renderHook(() => useNavTree(['buscar']));
    await waitFor(() =>
      expect(findItem(result.current.tree, 'alertas')).toMatchObject({
        badge: '4',
      }),
    );
    expect(findItem(result.current.tree, 'buscar')).toBeNull();
  });
});
