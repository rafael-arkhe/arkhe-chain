/**
 * Onda 1 — o drain da fila classifica o desfecho de cada fonte:
 *   - sucesso        → status 'done'
 *   - FonteRequerUrl → status 'skipped' (neutro) + skipReason
 *   - ApiError 503   → status 'error' com mensagem AMIGÁVEL (sem corpo cru)
 *
 * Garante que o operador nunca vê "{detail:circuit-open}" e que pular uma
 * fonte URL-only não conta como erro.
 */
import { waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/client';

// Criamos o mock DENTRO da factory (evita TDZ do hoisting) e o importamos de
// volta — assim instanceof FonteRequerUrlError no store bate com a mesma classe.
jest.mock('@/lib/buscar/workers', () => ({
  runWorker: jest.fn(),
  FonteRequerUrlError: class FonteRequerUrlError extends Error {
    constructor(m?: string) {
      super(m);
      this.name = 'FonteRequerUrlError';
    }
  },
}));

import { useBuscarStore } from '@/lib/buscar/store';
import { runWorker, FonteRequerUrlError } from '@/lib/buscar/workers';
import type { SourceDef } from '@/lib/buscar/types';

const mockRunWorker = runWorker as jest.Mock;
const MockFonteRequerUrlError = FonteRequerUrlError as unknown as new (m?: string) => Error;

const source: SourceDef = {
  key: 'osint_extract@v1',
  label: 'OSINT · extrator',
  category: 'osint-pessoa',
  mcpTool: 'osint_extract@v1',
};

beforeEach(() => {
  jest.clearAllMocks();
  useBuscarStore.getState().clearAll();
  useBuscarStore.setState({ fila: [] });
});

it('sucesso → done', async () => {
  mockRunWorker.mockResolvedValueOnce([{ externalId: 'a', name: 'A', kind: 'x' }]);
  useBuscarStore.getState().enqueue('foo', [source]);
  await waitFor(() => expect(useBuscarStore.getState().fila[0]?.status).toBe('done'));
  expect(useBuscarStore.getState().fila[0].results).toHaveLength(1);
});

it('FonteRequerUrlError → skipped (neutro) com razão', async () => {
  mockRunWorker.mockRejectedValueOnce(new MockFonteRequerUrlError('Esta fonte só aceita URL.'));
  useBuscarStore.getState().enqueue('foo', [source]);
  await waitFor(() => expect(useBuscarStore.getState().fila[0]?.status).toBe('skipped'));
  expect(useBuscarStore.getState().fila[0].skipReason).toBe('Esta fonte só aceita URL.');
  expect(useBuscarStore.getState().fila[0].error).toBeUndefined();
});

it('ApiError 503 circuit-open → error AMIGÁVEL, sem corpo cru', async () => {
  mockRunWorker.mockRejectedValueOnce(new ApiError(503, '{"detail":"circuit-open:senado-federal"}'));
  useBuscarStore.getState().enqueue('foo', [source]);
  await waitFor(() => expect(useBuscarStore.getState().fila[0]?.status).toBe('error'));
  const item = useBuscarStore.getState().fila[0];
  expect(item.error).toBe('Fonte temporariamente indisponível. Tente de novo em instantes.');
  expect(item.error).not.toContain('circuit-open');
});
