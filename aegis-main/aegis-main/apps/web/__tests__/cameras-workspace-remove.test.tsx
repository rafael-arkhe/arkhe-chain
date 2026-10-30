/**
 * Remoção de câmera pelo gestor (2026-09-11): botão por linha + confirmModal
 * + DELETE via client. Confirm dialog MOCKADO (resolvidas em TRUE/FALSE) —
 * o que se prova aqui é o gesto de UI, não o diálogo.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
}));
const mockConfirm = jest.fn();
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: (...a: unknown[]) => mockConfirm(...a),
  promptModal: jest.fn(),
}));
jest.mock('@/components/dados/hotlist-section', () => ({ HotlistSection: () => null }));
jest.mock('@/components/dados/pipeline-section', () => ({ PipelineSection: () => null }));
jest.mock('@/components/cameras/register-camera-modal', () => ({
  RegisterCameraModal: () => null,
}));

const mockPage = jest.fn();
const mockRemove = jest.fn();
jest.mock('@/lib/api/cctv', () => ({
  Cctv: {
    streams: {
      page: (...a: unknown[]) => mockPage(...a),
      remove: (...a: unknown[]) => mockRemove(...a),
      update: jest.fn(),
    },
  },
}));

import { CamerasWorkspace } from '@/components/dados/cameras-workspace';

function pageOf(total = 1) {
  return {
    items: [
      {
        id: 's1',
        name: 'Câmera Sobrando',
        url: 'http://x/s1',
        latitude: null,
        longitude: null,
        country: 'BR',
        city: null,
        status: 'offline',
        source_type: null,
        detection_enabled: false,
        stream_metadata: {},
        tags: [],
        thumbnail_url: null,
      },
    ],
    total,
    offset: 0,
    limit: 50,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPage.mockResolvedValue(pageOf());
  mockRemove.mockResolvedValue(undefined);
  mockConfirm.mockResolvedValue(true);
});

test('remover: confirmModal -> DELETE -> linha sai da lista', async () => {
  render(<CamerasWorkspace />);
  await screen.findByTestId('cameras-registry-row-s1');

  fireEvent.click(screen.getByTestId('cameras-registry-remove-s1'));
  await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('s1'));
  await waitFor(() => {
    expect(screen.queryByTestId('cameras-registry-row-s1')).not.toBeInTheDocument();
  });
});

test('cancelar o confirm NAO chama o DELETE', async () => {
  mockConfirm.mockResolvedValue(false);
  render(<CamerasWorkspace />);
  await screen.findByTestId('cameras-registry-row-s1');

  fireEvent.click(screen.getByTestId('cameras-registry-remove-s1'));
  await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
  await waitFor(() => expect(mockRemove).not.toHaveBeenCalled());
  expect(screen.getByTestId('cameras-registry-row-s1')).toBeInTheDocument();
});

test('erro no DELETE volta a carregar a lista (estado servidor e a verdade)', async () => {
  mockRemove.mockRejectedValue(new Error('boom'));
  render(<CamerasWorkspace />);
  await screen.findByTestId('cameras-registry-row-s1');

  fireEvent.click(screen.getByTestId('cameras-registry-remove-s1'));
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('s1'));
  await waitFor(() => expect(mockPage).toHaveBeenCalledTimes(2));
});
