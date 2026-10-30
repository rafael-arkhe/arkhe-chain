/**
 * LineCalibrateModal — desenho da linha/ROI da contagem no /cameras.
 *
 * Invariantes:
 *  - 2 cliques no frame definem a linha → "Salvar linha" habilita;
 *  - o PUT viaja com coordenadas NORMALIZADAS 0..1 (contrato do serviço
 *    contagem-sacos — viewBox 1280x720 → /1280, /720);
 *  - direção ±1 viaja no body (select A→B / B→A);
 *  - já calibrada → estado atual pré-carregado + Remover via confirmModal;
 *  - sem frame → estado honesto (sem área de clique).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// t devolve a CHAVE — os .replace('{n}'/'{quando}') preenchem sobre ela.
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => `${k} {n} {quando}`,
}));
jest.mock('@/lib/api/cctv', () => ({
  ...jest.requireActual('@/lib/api/cctv'),
  Cctv: {
    calibracao: { get: jest.fn(), put: jest.fn(), remove: jest.fn() },
    streams: {
      frame: jest.fn(),
    },
  },
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(),
}));

import { Cctv } from '@/lib/api/cctv';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { LineCalibrateModal } from '@/components/cameras/line-calibrate-modal';

const mGet = (Cctv as unknown as { calibracao: { get: jest.Mock } }).calibracao.get;
const mPut = (Cctv as unknown as { calibracao: { put: jest.Mock } }).calibracao.put;
const mRemove = (Cctv as unknown as { calibracao: { remove: jest.Mock } }).calibracao.remove;
const mFrame = (Cctv as unknown as { streams: { frame: jest.Mock } }).streams.frame;
const mConfirm = confirmModal as jest.Mock;

const STREAM = {
  id: 's1',
  name: 'Linha Sacária 01',
  latitude: null,
  longitude: null,
} as never;

const UNCALIBRATED = {
  stream_id: 's1',
  calibracao: {
    status: 'uncalibrated', roi: null, linha: null, direcao: null,
    conf_min: null, dist_min_px: null, cooldown_ms: null, versao: null,
    atualizado_em: null,
  },
};
const CALIBRATED = {
  stream_id: 's1',
  calibracao: {
    status: 'calibrated',
    linha: [[0.5, 0.27], [0.5, 0.72]],
    direcao: 1,
    roi: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9]],
    conf_min: 0.5, dist_min_px: null, cooldown_ms: null,
    versao: 3, atualizado_em: '2026-09-11T12:00:00+00:00',
  },
};

let rectSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mGet.mockResolvedValue(UNCALIBRATED);
  mFrame.mockResolvedValue({ frame_url: null });
  rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 720,
    width: 1280, height: 720, toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  rectSpy.mockRestore();
});

function renderModal(frameUrl: string | null = 'http://x/frame.jpg') {
  return render(
    <LineCalibrateModal
      stream={STREAM}
      frameUrl={frameUrl}
      onClose={jest.fn()}
      onChanged={jest.fn()}
    />,
  );
}

test('2 cliques + salvar → PUT com linha normalizada 0..1', async () => {
  mPut.mockResolvedValue(CALIBRATED);
  renderModal();
  await screen.findByTestId('linha-frame');

  expect(screen.getByTestId('linha-save')).toBeDisabled();
  fireEvent.click(screen.getByTestId('linha-frame'), { clientX: 640, clientY: 200 });
  fireEvent.click(screen.getByTestId('linha-frame'), { clientX: 640, clientY: 520 });
  await waitFor(() => expect(screen.getByTestId('linha-save')).not.toBeDisabled());

  fireEvent.click(screen.getByTestId('linha-save'));
  await waitFor(() => expect(mPut).toHaveBeenCalledTimes(1));
  const [id, body] = mPut.mock.calls[0];
  expect(id).toBe('s1');
  expect(body.linha).toEqual([[0.5, 0.278], [0.5, 0.722]]);
  expect(body.direcao).toBe(1);
  expect(body.roi).toBeNull();
  expect(body.conf_min).toBeNull();
});

test('direção B→A e conf_min viajam no PUT', async () => {
  mPut.mockResolvedValue(CALIBRATED);
  renderModal();
  await screen.findByTestId('linha-frame');

  fireEvent.click(screen.getByTestId('linha-frame'), { clientX: 640, clientY: 200 });
  fireEvent.click(screen.getByTestId('linha-frame'), { clientX: 640, clientY: 520 });
  await waitFor(() => expect(screen.getByTestId('linha-save')).not.toBeDisabled());
  fireEvent.change(screen.getByTestId('linha-direcao'), { target: { value: '-1' } });
  fireEvent.change(screen.getByTestId('linha-conf-min'), { target: { value: '0.65' } });
  fireEvent.click(screen.getByTestId('linha-save'));
  await waitFor(() => expect(mPut).toHaveBeenCalledTimes(1));
  const body = mPut.mock.calls[0][1];
  expect(body.direcao).toBe(-1);
  expect(body.conf_min).toBe(0.65);
});

test('já calibrada: linha pré-carregada + Remover passa pelo confirmModal', async () => {
  mGet.mockResolvedValue(CALIBRATED);
  mConfirm.mockResolvedValue(true);
  renderModal();
  await screen.findByTestId('linha-current');
  await waitFor(() => expect(screen.getByTestId('linha-save')).not.toBeDisabled());

  fireEvent.click(screen.getByTestId('linha-remove'));
  await waitFor(() => expect(mConfirm).toHaveBeenCalled());
  await waitFor(() => expect(mRemove).toHaveBeenCalledWith('s1'));
});

test('sem frame: estado honesto, sem área de clique', () => {
  renderModal(null);
  expect(screen.getByTestId('linha-no-frame')).toBeInTheDocument();
  expect(screen.queryByTestId('linha-frame')).not.toBeInTheDocument();
});

test('sem frame arquivado → busca o quadro DA FONTE (sem GPU) e desenha', async () => {
  mFrame.mockResolvedValue({ frame_url: '/api/v1/cctv/frames/abc123.jpg' });
  renderModal(null);
  await waitFor(() => expect(mFrame).toHaveBeenCalledWith('s1'));
  expect(await screen.findByTestId('linha-frame')).toBeInTheDocument();
  // o src passa pela conversão do proxy (/api + path relativo)
  const img = screen.getByTestId('linha-frame').querySelector('img');
  expect(img?.getAttribute('src')).toContain('/api/api/v1/cctv/frames/abc123.jpg');
});

test('desfazer remove o último vértice da área (e volta à linha incompleta)', async () => {
  renderModal();
  await screen.findByTestId('linha-frame');

  // linha completa (2 cliques) → cliques seguintes viram vértices da área
  fireEvent.click(screen.getByTestId('linha-frame'), { clientX: 640, clientY: 200 });
  fireEvent.click(screen.getByTestId('linha-frame'), { clientX: 640, clientY: 520 });
  fireEvent.click(screen.getByTestId('linha-frame'), { clientX: 200, clientY: 200 });
  fireEvent.click(screen.getByTestId('linha-frame'), { clientX: 300, clientY: 200 });
  fireEvent.click(screen.getByTestId('linha-frame'), { clientX: 300, clientY: 400 });
  await waitFor(() => {
    expect(screen.getByTestId('linha-step').textContent).toContain(' 3');
  });

  fireEvent.click(screen.getByTestId('linha-undo'));
  await waitFor(() => {
    expect(screen.getByTestId('linha-step').textContent).toContain(' 2');
  });

  // desfazer além da área: vazio → remove B (ClickB) → remove A (ClickA)
  fireEvent.click(screen.getByTestId('linha-undo'));
  await waitFor(() => {
    expect(screen.getByTestId('linha-step').textContent).toContain(' 1');
  });
  fireEvent.click(screen.getByTestId('linha-undo'));
  await waitFor(() => {
    expect(screen.getByTestId('linha-step').textContent).toContain(' 0');
  });
  fireEvent.click(screen.getByTestId('linha-undo'));
  await waitFor(() => {
    expect(screen.getByTestId('linha-step').textContent).toContain('cameras.linhaClickB');
  });
  fireEvent.click(screen.getByTestId('linha-undo'));
  await waitFor(() => {
    expect(screen.getByTestId('linha-save')).toBeDisabled();
  });
  expect(screen.getByTestId('linha-step').textContent).toContain('cameras.linhaClickA');
});
