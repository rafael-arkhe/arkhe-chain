/**
 * Missão #7 (2026-05-24) — hover-preview da paleta de widgets do editor de
 * aplicativos (Workshop) é COLISÃO-AWARE no eixo vertical.
 *
 * Bug do operador: ao passar o mouse no ÚLTIMO item da paleta, o popover de
 * preview abria pra baixo, estourava a borda inferior da viewport e só
 * sobrava o cabeçalho — dava pra ler só o título.
 *
 * Correção:
 *   - O popover já é portalado em `document.body` (escapa overflow do
 *     scroller da paleta) — garantimos que continua portalado.
 *   - O `top` é re-clampado após medir a altura real do popover, "virando"
 *     pra cima quando o item está no fundo, de modo que o popover INTEIRO
 *     (thumbnail + título + descrição) caiba na viewport.
 *
 * Cobertura (4):
 *   1. Hover exibe o popover (portal no document.body).
 *   2. Item no FUNDO da viewport → popover fica inteiramente visível
 *      (top >= margem E top+altura <= viewport-margem) — flip pra cima.
 *   3. Item no TOPO da viewport → popover NÃO vira (alinha ao topo do item).
 *   4. Sai do hover → popover some.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkshopEditor } from '@/components/workshop/workshop-editor';

const APP_FIXTURE = {
  id: 'app.test',
  external_id: 'app.test',
  display: 'App de teste',
  schema_version: 2 as const,
  variables: [],
  layout: { columns: 20, root: [] as unknown[] },
};

jest.mock('@/lib/workshop/client', () => ({
  Workshop: {
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createVersion: jest.fn(),
    listComments: jest.fn().mockResolvedValue([]),
  },
  isPersistedAppId: (appId: string | null | undefined) =>
    typeof appId === 'string' &&
    !!appId &&
    appId !== 'editor' &&
    appId !== 'palette-preview' &&
    !appId.startsWith('seed.') &&
    !appId.startsWith('local.app.') &&
    !appId.startsWith('page::'),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: { username: 'admin', roles: ['admin'], user_id: 'u-admin' },
    loading: false,
  }),
  usePrincipal: () => ({
    username: 'admin',
    roles: ['admin'],
    user_id: 'u-admin',
  }),
  useCan: () => true,
}));

import { Workshop } from '@/lib/workshop/client';
const workshopApi = Workshop as jest.Mocked<typeof Workshop>;

const VIEWPORT_H = 800;
const VIEWPORT_W = 1280;
const MARGIN = 8;
// Altura simulada do popover renderizado (jsdom devolve 0 sem stub).
const POPOVER_H = 420;

let offsetHeightSpy: jest.SpyInstance | undefined;

function setViewport() {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: VIEWPORT_W,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: VIEWPORT_H,
  });
}

beforeAll(() => {
  // jsdom não calcula layout: offsetHeight é sempre 0. Para o clamp vertical
  // ter o que medir, fingimos que o popover tem POPOVER_H de altura. Demais
  // elementos ficam 0 (não interferem na lógica testada).
  offsetHeightSpy = jest
    .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
    .mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('data-testid')?.startsWith('palette-preview-')) {
        return POPOVER_H;
      }
      return 0;
    });
});

afterAll(() => {
  offsetHeightSpy?.mockRestore();
});

describe('Missão #7 · paleta hover-preview colisão-aware', () => {
  beforeEach(() => {
    workshopApi.get.mockReset();
    workshopApi.get.mockResolvedValue({ ...APP_FIXTURE } as never);
    window.localStorage.clear();
    setViewport();
  });

  async function mountEditor() {
    render(<WorkshopEditor appId="app.test" />);
    await waitFor(() =>
      expect(screen.getByText('Paleta')).toBeInTheDocument(),
    );
  }

  /** Coloca o `<li>` do item numa posição-alvo e dispara o hover. */
  function hoverItemAt(top: number, bottom: number) {
    const item = screen.getByTestId('palette-item-markdown_v2');
    const li = item.closest('li') as HTMLLIElement;
    // Stub da geometria do item ANTES do debounce de 180ms (o enter lê
    // getBoundingClientRect dentro do setTimeout).
    li.getBoundingClientRect = () =>
      ({
        top,
        bottom,
        left: 0,
        right: 260,
        width: 260,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.mouseEnter(li);
    return li;
  }

  test('1. Hover exibe o popover via portal no document.body', async () => {
    await mountEditor();
    expect(screen.queryByTestId('palette-preview-markdown_v2')).toBeNull();
    hoverItemAt(120, 160);
    const pop = await screen.findByTestId(
      'palette-preview-markdown_v2',
      {},
      { timeout: 3000 },
    );
    // Portalado direto no body (escapa overflow do scroller da paleta).
    expect(pop.parentElement).toBe(document.body);
  });

  test('2. Item no FUNDO → popover inteiro visível (flip pra cima)', async () => {
    await mountEditor();
    // Item colado no fundo: top=760, bottom=790 numa viewport de 800.
    const anchorTop = VIEWPORT_H - 40;
    const anchorBottom = VIEWPORT_H - 10;
    hoverItemAt(anchorTop, anchorBottom);
    const pop = await screen.findByTestId(
      'palette-preview-markdown_v2',
      {},
      { timeout: 3000 },
    );
    await waitFor(() => {
      const top = parseFloat((pop as HTMLElement).style.top);
      // Não escapa o topo…
      expect(top).toBeGreaterThanOrEqual(MARGIN);
      // …nem o fundo: popover INTEIRO cabe (não sobra só o título).
      expect(top + POPOVER_H).toBeLessThanOrEqual(VIEWPORT_H - MARGIN + 0.5);
      // E de fato VIROU pra cima (top bem acima do topo do item no fundo).
      expect(top).toBeLessThan(anchorTop);
    });
  });

  test('3. Item no TOPO → popover alinha ao topo do item (sem flip)', async () => {
    await mountEditor();
    // Item no topo: cabe folgado pra baixo (100 + 420 + 8 <= 800).
    const anchorTop = 100;
    hoverItemAt(anchorTop, 140);
    const pop = await screen.findByTestId(
      'palette-preview-markdown_v2',
      {},
      { timeout: 3000 },
    );
    await waitFor(() => {
      const top = parseFloat((pop as HTMLElement).style.top);
      expect(top).toBeCloseTo(anchorTop, 0);
    });
  });

  test('4. Sai do hover → popover some', async () => {
    await mountEditor();
    const li = hoverItemAt(120, 160);
    await screen.findByTestId(
      'palette-preview-markdown_v2',
      {},
      { timeout: 3000 },
    );
    fireEvent.mouseLeave(li);
    await waitFor(() =>
      expect(screen.queryByTestId('palette-preview-markdown_v2')).toBeNull(),
    );
  });
});
