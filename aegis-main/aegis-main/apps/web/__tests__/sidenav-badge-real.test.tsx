/**
 * Badge REAL de alertas na sidenav (2026-06-12).
 *
 * O '5' hardcoded do FALLBACK_NAV morreu. O useNavTree consome o
 * count_pending do núcleo (Alerts.inbox.countPending — GET
 * /alerts/count_pending) e:
 *  - count > 0  → badge com o número real;
 *  - count = 0  → SEM badge (sem alerta = sem badge);
 *  - erro       → SEM badge (honesto — nunca número inventado);
 *  - count > 99 → '99+' (largura limitada do chip).
 */
import { renderHook, waitFor } from '@testing-library/react';

jest.mock('@/lib/workshop/client', () => ({
  Workshop: { list: jest.fn(async () => []) },
}));
jest.mock('@/lib/api', () => ({
  Alerts: { inbox: { countPending: jest.fn() } },
  // W8 — useNavTree consome Pages.list p/ a seção dinâmica "Aplicações"; sem
  // páginas aqui (foco no badge), degrada em silêncio.
  Pages: { list: jest.fn(async () => []) },
}));

import { useNavTree, overrideAlertBadge } from '@/lib/use-nav-tree';
import { FALLBACK_NAV } from '@/lib/api/fallback';
import { Alerts } from '@/lib/api';
import type { NavSection } from '@/lib/api/types';

const mockCount = (Alerts.inbox.countPending as jest.Mock);

function alertasItem(tree: { sections: { items: { id: string; badge: string | null }[] }[] }) {
  for (const s of tree.sections) {
    const it = s.items.find((i) => i.id === 'alertas');
    if (it) return it;
  }
  return null;
}

describe('badge real de alertas', () => {
  beforeEach(() => jest.clearAllMocks());

  it('FALLBACK_NAV não tem mais badge hardcoded', () => {
    const it = alertasItem(FALLBACK_NAV);
    expect(it).toBeTruthy();
    expect(it!.badge).toBeNull();
  });

  it('count > 0 → badge com o número real', async () => {
    mockCount.mockResolvedValue({ count: 3 });
    const { result } = renderHook(() => useNavTree());
    await waitFor(() => expect(alertasItem(result.current.tree)?.badge).toBe('3'));
  });

  it('count = 0 → sem badge', async () => {
    mockCount.mockResolvedValue({ count: 0 });
    const { result } = renderHook(() => useNavTree());
    await waitFor(() => expect(mockCount).toHaveBeenCalled());
    await waitFor(() => expect(alertasItem(result.current.tree)?.badge).toBeNull());
  });

  it('erro → sem badge (nunca número inventado)', async () => {
    mockCount.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useNavTree());
    await waitFor(() => expect(mockCount).toHaveBeenCalled());
    await waitFor(() => expect(alertasItem(result.current.tree)?.badge).toBeNull());
  });

  it('count > 99 → 99+', async () => {
    mockCount.mockResolvedValue({ count: 240 });
    const { result } = renderHook(() => useNavTree());
    await waitFor(() => expect(alertasItem(result.current.tree)?.badge).toBe('99+'));
  });
});

describe('overrideAlertBadge — groups persistidos nunca fabricam número', () => {
  // Cenário real pego na certificação do Sprint 6 (2026-06-12): o operador
  // tinha sidenav.groups PERSISTIDOS no app-shell config com badge '5'
  // decorativo da era hardcoded; groups substituem o tree e o badge real
  // (count_pending) era bypassado. O item que roteia pra /alertas SEMPRE
  // recebe o badge real — dado persistido nunca vira número inventado.
  const groups: NavSection[] = [
    {
      id: 'grp-conteudo',
      label: 'Conteúdo',
      default_open: true,
      items: [
        {
          id: 'grp-conteudo-alertas',
          label: 'Alertas',
          href: '/alertas',
          icon: 'bell',
          perm_key: null,
          badge: '5', // decorativo persistido — deve ser substituído
        },
        {
          id: 'grp-conteudo-relatorios',
          label: 'Relatórios',
          href: '/relatorios',
          icon: 'file-text',
          perm_key: null,
          badge: '7', // não-alertas: fica como o operador salvou
        },
      ],
    },
  ];

  it('badge persistido em /alertas é substituído pelo real (count=0 → null)', () => {
    const out = overrideAlertBadge(groups, null);
    expect(out[0].items[0].badge).toBeNull();
    expect(out[0].items[1].badge).toBe('7');
  });

  it('badge persistido em /alertas é substituído pelo real (count=3 → "3")', () => {
    const out = overrideAlertBadge(groups, '3');
    expect(out[0].items[0].badge).toBe('3');
  });

  it('casa por id "alertas" também (caminho do tree)', () => {
    const tree: NavSection[] = [
      {
        id: 's',
        label: 's',
        default_open: true,
        items: [
          { id: 'alertas', label: 'Alertas', href: '/alertas?x=1', icon: 'bell', perm_key: null, badge: '99' },
        ],
      },
    ];
    expect(overrideAlertBadge(tree, null)[0].items[0].badge).toBeNull();
  });
});
