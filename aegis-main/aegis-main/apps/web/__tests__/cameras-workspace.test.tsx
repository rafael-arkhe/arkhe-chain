/**
 * §C C5 — CamerasWorkspace (seção gestora "Câmeras"): contrato de UI.
 * Cobre a lista GERIDA sobre o endpoint paginado do servidor (Cctv.streams.page):
 * render das linhas + total + range, busca debounced dispara refetch com `q`, e
 * o pager avança o offset no servidor.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CamerasWorkspace } from '@/components/dados/cameras-workspace';

// Seções unificadas e o modal se auto-gerenciam / fazem I/O próprio — mock.
jest.mock('@/components/dados/hotlist-section', () => ({ HotlistSection: () => null }));
jest.mock('@/components/dados/pipeline-section', () => ({ PipelineSection: () => null }));
jest.mock('@/components/cameras/register-camera-modal', () => ({
  RegisterCameraModal: () => <div data-testid="register-camera-modal" />,
}));

const mockPage = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@/lib/api/cctv', () => ({
  Cctv: {
    streams: {
      page: (...a: unknown[]) => mockPage(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));

type Row = { id: string; name: string; city: string | null };
function pageOf(rows: Row[], total: number) {
  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      url: `http://x/${r.id}`,
      latitude: -23.5,
      longitude: -46.6,
      country: 'BR',
      city: r.city,
      status: 'online',
      source_type: 'rtsp',
      detection_enabled: false,
      stream_metadata: {},
      tags: ['perimetro'],
      thumbnail_url: null,
    })),
    total,
    offset: 0,
    limit: 50,
  };
}

beforeEach(() => {
  mockPage.mockReset();
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue({});
  mockPage.mockResolvedValue(
    pageOf(
      [
        { id: 's1', name: 'Portaria Norte', city: 'São Paulo' },
        { id: 's2', name: 'Avenida Central', city: 'São Paulo' },
      ],
      120,
    ),
  );
});

test('renderiza a lista paginada com total, range e pager do servidor', async () => {
  render(<CamerasWorkspace />);
  await screen.findByTestId('cameras-registry-row-s1');
  expect(screen.getByTestId('cameras-registry-row-s2')).toBeInTheDocument();
  // total real do servidor (não o tamanho da página)
  expect(screen.getByTestId('cameras-registry-range').textContent).toContain('120');
  expect(screen.getByTestId('cameras-registry-range').textContent).toContain('1');
  // prev desabilitado na 1ª página, next habilitado (120 > 50)
  expect(screen.getByTestId('cameras-registry-prev')).toBeDisabled();
  expect(screen.getByTestId('cameras-registry-next')).not.toBeDisabled();
});

test('busca dispara refetch com q NO SERVIDOR (debounced)', async () => {
  render(<CamerasWorkspace />);
  await screen.findByTestId('cameras-registry-row-s1');
  fireEvent.change(screen.getByTestId('cameras-registry-search'), {
    target: { value: 'portaria' },
  });
  await waitFor(
    () => {
      const last = mockPage.mock.calls.at(-1)?.[0];
      expect(last).toMatchObject({ q: 'portaria', offset: 0 });
    },
    { timeout: 2000 },
  );
});

test('o pager avança o offset no servidor', async () => {
  render(<CamerasWorkspace />);
  await screen.findByTestId('cameras-registry-row-s1');
  fireEvent.click(screen.getByTestId('cameras-registry-next'));
  await waitFor(() => {
    const last = mockPage.mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({ offset: 50, limit: 50 });
  });
});
