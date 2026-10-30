/**
 * Onda M1.d (2026-05-23) — melhorias internas do editor de aplicativos
 * (Workshop) pra paridade com o editor de apps do Foundry:
 *
 *   1. Busca global do editor via Ctrl/Cmd+K (widgets por label · dados ·
 *      ações dos painéis). Precedência sobre a paleta de comandos global
 *      (capture-phase + stopImmediatePropagation).
 *   2. Seletor de tamanho de tela no topo do canvas (Full/Desktop/Tablet/
 *      Mobile) que restringe a largura do canvas pra simular responsivo.
 *
 * Cobertura (13):
 *
 *   3-pane (não regredir):
 *    1. Paleta lateral monta default-aberta com busca.
 *    2. Canvas monta com a grade (data-testid workshop-canvas-grid).
 *    3. Inspetor monta default-FECHADO (só o botão "Mostrar inspetor").
 *
 *   Ctrl+K / busca global:
 *    4. Ctrl+K abre a paleta de comandos do editor.
 *    5. Ctrl+K de novo fecha (toggle).
 *    6. Botão "Buscar" do canvas também abre.
 *    7. Busca casa widget por meta.label (nunca pelo type cru).
 *    8. O `type` técnico do widget NÃO aparece na lista de resultados.
 *    9. Selecionar widget adiciona ao canvas e fecha a paleta.
 *   10. Ctrl+K é capturado (stopImmediatePropagation) — listener global
 *       em bubble-phase NÃO dispara.
 *   11. Variável do app aparece na busca pelo label.
 *
 *   Tamanho de tela:
 *   12. Default = tela cheia (sem maxWidth; data-screen-size=full).
 *   13. Escolher "Celular · 375" restringe a largura do canvas a 375px.
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { WorkshopEditor } from '@/components/workshop/workshop-editor';

// ── Mocks ───────────────────────────────────────────────────────────────────

const APP_FIXTURE = {
  id: 'app.test',
  external_id: 'app.test',
  display: 'App de teste',
  schema_version: 2 as const,
  variables: [
    {
      id: 'var-1',
      external_id: 'selecao_alvo',
      label: 'Seleção de alvo',
      type: 'object' as const,
      kind: 'state' as const,
      recompute_mode: 'eager' as const,
    },
  ],
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
  // `CommentsDrawer` (montado pelo editor) importa `isPersistedAppId` deste
  // módulo; o mock precisa reexportar a função, senão vira `undefined` e o
  // mount lança `isPersistedAppId is not a function`.
  isPersistedAppId: (appId: string | null | undefined) =>
    typeof appId === 'string' &&
    !!appId &&
    appId !== 'editor' &&
    appId !== 'palette-preview' &&
    !appId.startsWith('seed.') &&
    !appId.startsWith('local.app.') &&
    !appId.startsWith('page::'),
}));

// O `CommentsDrawer` (montado pelo editor, mesmo fechado) chama
// `usePrincipal()` → `useAuth()` no topo, antes do early-return `!open`.
// Sem um <AuthProvider> em volta, esse hook lança e a árvore inteira
// desmonta no commit do layout-effect — o mount "pendura" e o
// `waitFor('Paleta')` estoura por timeout. Mockamos o auth (mesmo padrão
// de `paginas-edit-workshop.test.tsx`) pra dar contexto ao editor.
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

describe('Onda M1.d · WorkshopEditor — Ctrl+K + screen size', () => {
  beforeEach(() => {
    workshopApi.get.mockReset();
    workshopApi.get.mockResolvedValue({ ...APP_FIXTURE } as never);
    window.localStorage.clear();
  });

  async function mountEditor() {
    render(<WorkshopEditor appId="app.test" />);
    // Espera o app carregar (paleta lateral aparece).
    await waitFor(() =>
      expect(screen.getByText('Paleta')).toBeInTheDocument(),
    );
  }

  // ── 3-pane (não regredir) ──────────────────────────────────────────────

  test('1. Paleta lateral monta default-aberta com busca', async () => {
    await mountEditor();
    expect(
      screen.getByPlaceholderText('Buscar widget…'),
    ).toBeInTheDocument();
  });

  test('2. Canvas monta com a grade', async () => {
    await mountEditor();
    expect(screen.getByTestId('workshop-canvas-grid')).toBeInTheDocument();
  });

  test('3. Inspetor monta default-FECHADO', async () => {
    await mountEditor();
    // Aside do inspetor não está presente; só o botão de mostrar.
    expect(screen.queryByTestId('inspector-aside')).toBeNull();
    expect(screen.getByLabelText('Mostrar inspetor')).toBeInTheDocument();
  });

  // ── Ctrl+K / busca global ───────────────────────────────────────────────

  test('4. Ctrl+K abre a paleta de comandos do editor', async () => {
    await mountEditor();
    expect(screen.queryByTestId('workshop-command-palette')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(
      screen.getByTestId('workshop-command-palette'),
    ).toBeInTheDocument();
  });

  test('5. Ctrl+K de novo fecha (toggle)', async () => {
    await mountEditor();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(
      screen.getByTestId('workshop-command-palette'),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByTestId('workshop-command-palette')).toBeNull();
  });

  test('6. Botão "Buscar" do canvas também abre a paleta', async () => {
    await mountEditor();
    fireEvent.click(screen.getByTestId('workshop-open-command-palette'));
    expect(
      screen.getByTestId('workshop-command-palette'),
    ).toBeInTheDocument();
  });

  test('7. Busca casa widget por meta.label', async () => {
    await mountEditor();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByTestId('workshop-command-palette-input');
    // "Texto Markdown" é o label de markdown_v2 (visto nos testes de páginas).
    fireEvent.change(input, { target: { value: 'Markdown' } });
    const list = screen.getByTestId('workshop-command-palette-list');
    expect(within(list).getByText('Texto Markdown')).toBeInTheDocument();
  });

  test('8. O type técnico do widget NÃO aparece nos resultados', async () => {
    await mountEditor();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByTestId('workshop-command-palette-input');
    fireEvent.change(input, { target: { value: 'Markdown' } });
    const list = screen.getByTestId('workshop-command-palette-list');
    expect(within(list).queryByText('markdown_v2')).toBeNull();
  });

  test('9. Selecionar widget adiciona ao canvas e fecha a paleta', async () => {
    await mountEditor();
    const grid = screen.getByTestId('workshop-canvas-grid');
    // O canvas renderiza cada bloco como `editor-node-<id>` (NodeBlock).
    const before = within(grid).queryAllByTestId(/^editor-node-/).length;
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByTestId('workshop-command-palette-input');
    fireEvent.change(input, { target: { value: 'Markdown' } });
    const list = screen.getByTestId('workshop-command-palette-list');
    fireEvent.click(within(list).getByText('Texto Markdown'));
    // Paleta fecha.
    await waitFor(() =>
      expect(screen.queryByTestId('workshop-command-palette')).toBeNull(),
    );
    // Canvas ganhou um node.
    const after = within(
      screen.getByTestId('workshop-canvas-grid'),
    ).queryAllByTestId(/^editor-node-/).length;
    expect(after).toBe(before + 1);
  });

  test('10. Ctrl+K é capturado — listener global em bubble-phase NÃO dispara', async () => {
    await mountEditor();
    const bubbleSpy = jest.fn();
    // Listener global imita a paleta de comandos do AuthShell (bubble-phase).
    window.addEventListener('keydown', bubbleSpy);
    try {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      // A paleta do editor abriu…
      expect(
        screen.getByTestId('workshop-command-palette'),
      ).toBeInTheDocument();
      // …e o handler bubble global nunca recebeu o evento.
      expect(bubbleSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', bubbleSpy);
    }
  });

  test('11. Variável do app aparece na busca global pelo label', async () => {
    await mountEditor();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByTestId('workshop-command-palette-input');
    fireEvent.change(input, { target: { value: 'alvo' } });
    const list = screen.getByTestId('workshop-command-palette-list');
    expect(within(list).getByText('Seleção de alvo')).toBeInTheDocument();
  });

  // ── Tamanho de tela ──────────────────────────────────────────────────────

  test('12. Default = tela cheia (sem maxWidth)', async () => {
    await mountEditor();
    const grid = screen.getByTestId('workshop-canvas-grid');
    expect(grid.getAttribute('data-screen-size')).toBe('full');
    expect((grid as HTMLElement).style.maxWidth).toBe('');
  });

  test('13. Escolher "Celular · 375" restringe a largura do canvas', async () => {
    await mountEditor();
    fireEvent.click(screen.getByTestId('workshop-screen-size'));
    fireEvent.click(screen.getByTestId('workshop-screen-size-option-mobile'));
    const grid = screen.getByTestId('workshop-canvas-grid');
    expect(grid.getAttribute('data-screen-size')).toBe('mobile');
    expect((grid as HTMLElement).style.maxWidth).toBe('375px');
  });
});
