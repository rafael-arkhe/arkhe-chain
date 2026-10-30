/**
 * SHELL HONESTO (2026-06-12) — rodapé por DADO, nunca marca de domínio fake.
 *
 * Regras certificadas aqui:
 *  1. Unidade/organização vem do MESMO contexto real do banner
 *     (GET /me/context · project_name ?? organization_name).
 *  2. Sem contexto (offline/401) → NENHUMA unidade fake aparece
 *     (nada de 'PC-SP / 13ª DP', nada de NEXT_PUBLIC_TENANT_LABEL).
 *  3. Identificador de instância fabricado ('srv-…-01') morreu.
 *  4. Versão vem do package.json real (build manifest), não literal solto.
 *  5. Estado de conexão é REAL: 'conectado' só depois do /me/context
 *     responder; falha → 'sem conexão'; nunca verde por default.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { Footer } from '@/components/shell/footer';
import pkg from '../package.json';

const mockGet = jest.fn();
jest.mock('@/lib/api', () => ({
  MeContextApi: { get: (...args: unknown[]) => mockGet(...args) },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCurrentConfig: any;
jest.mock('@/lib/app-shell/preview-provider', () => ({
  useAppShellConfig: () => ({
    config: mockCurrentConfig,
    isPreview: true,
    loading: false,
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseConfig = (): any => ({
  footer: {
    visible: true,
    columns: [],
    status_bar_items: [],
    copyright_text: null,
    version_visible: true,
  },
});

const CTX = {
  organization_id: 'org-1',
  organization_name: 'SSP Demo',
  space_id: null,
  space_name: null,
  project_id: 'prj-1',
  project_name: 'Operação Aurora',
};

describe('Footer · identidade honesta por dado', () => {
  beforeEach(() => {
    mockCurrentConfig = baseConfig();
    mockGet.mockReset();
  });

  it('com contexto real: mostra project_name (mesma fonte do banner) e estado conectado', async () => {
    mockGet.mockResolvedValue(CTX);
    render(<Footer />);
    await waitFor(() =>
      expect(screen.getByTestId('footer-context-label')).toHaveTextContent(
        'Operação Aurora',
      ),
    );
    expect(screen.getByTestId('footer-conn')).toHaveTextContent('conectado');
  });

  it('sem project: cai para organization_name — nunca tenant label de env', async () => {
    mockGet.mockResolvedValue({ ...CTX, project_id: null, project_name: null });
    render(<Footer />);
    await waitFor(() =>
      expect(screen.getByTestId('footer-context-label')).toHaveTextContent(
        'SSP Demo',
      ),
    );
  });

  it('offline: SEM unidade fake, SEM srv fake — estado "sem conexão"', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    render(<Footer />);
    await waitFor(() =>
      expect(screen.getByTestId('footer-conn')).toHaveTextContent('sem conexão'),
    );
    expect(screen.queryByTestId('footer-context-label')).toBeNull();
    expect(screen.queryByText(/PC-SP|13ª DP|PC-DEMO/)).toBeNull();
    expect(screen.queryByText(/srv-/)).toBeNull();
  });

  it('identificador de instância fabricado morreu mesmo online', async () => {
    mockGet.mockResolvedValue(CTX);
    render(<Footer />);
    await waitFor(() => expect(screen.getByTestId('footer-context-label')).toBeInTheDocument());
    expect(screen.queryByText(/srv-/)).toBeNull();
  });

  it('versão exibida = versão real do package.json', async () => {
    mockGet.mockResolvedValue(CTX);
    render(<Footer />);
    expect(screen.getByTestId('footer-version')).toHaveTextContent(
      `v${pkg.version}`,
    );
  });

  it('antes da resposta: não afirma "conectado" (estado verificando)', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<Footer />);
    expect(screen.getByTestId('footer-conn')).not.toHaveTextContent('conectado');
  });
});
