/**
 * GCP picker — "Calibrar posição" da câmera (fundação do twin, 2026-06-12).
 *
 * Modal lado-a-lado: frame ATUAL da câmera (frame mais recente JÁ arquivado
 * pelas detecções — o caminho mais barato p/ 1 frame; sem frame → estado
 * honesto apontando o "Detectar agora") + mapa Mapbox. O operador clica PAR
 * a PAR (pixel no frame em viewBox 1280x720 → ponto no mapa), mínimo 4 /
 * máximo 8, "Salvar calibração" → PUT /streams/{id}/gcps → erro de
 * reprojeção devolvido (m) com veredito honesto (verde <2 m, alerta acima).
 * Descalibrar via confirmModal (nunca diálogo nativo).
 *
 * Invariantes cobertos:
 *  - <4 pares → salvar DESABILITADO com title honesto;
 *  - 4 pares → PUT válido mas veredito NEUTRO (com 4 GCPs a homografia
 *    interpola exato e o reproj_error_m é ~0 por construção — verde com 4
 *    pontos seria mentira) + hint empurrando o 5º ponto;
 *  - 5 pares → veredito com o resíduo REAL (verde <2 m, alerta acima);
 *  - aviso fixo: a calibração assume superfície PLANA (pontos no chão);
 *  - erro do PUT (422 degenerado) exibido;
 *  - remover par da lista;
 *  - já calibrada → estado atual + descalibrar via confirmModal; com 4
 *    pontos o erro atual vira ±— (nunca número fingido);
 *  - sem frame → estado honesto (sem área de clique).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// t devolve a CHAVE + placeholders — os .replace('{m}'/'{n}'/'{user}') do
// componente preenchem os valores e o teste enxerga chave E valor.
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => `${k} {m} {n} {user}`,
}));
jest.mock('@/lib/api/cctv', () => ({
  ...jest.requireActual('@/lib/api/cctv'),
  Cctv: { gcps: { get: jest.fn(), put: jest.fn(), remove: jest.fn() } },
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(),
}));
// MapboxMap entra via next/dynamic(ssr:false) — stub com botão que dispara
// onMapClick (mesmo padrão do register-camera-modal.test.tsx).
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return function MockMapboxMap(props: {
      onMapClick?: (lat: number, lng: number) => void;
      markers?: { id: string }[];
    }) {
      return React.createElement(
        'div',
        { 'data-testid': 'mapbox-map', 'data-markers': JSON.stringify(props.markers ?? []) },
        React.createElement('button', {
          'data-testid': 'mock-map-click',
          onClick: () => props.onMapClick?.(-23.55, -46.64),
        }),
      );
    };
  },
}));

import { Cctv } from '@/lib/api/cctv';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { CalibrateModal } from '@/components/cameras/calibrate-modal';

const mGet = (Cctv as unknown as { gcps: { get: jest.Mock } }).gcps.get;
const mPut = (Cctv as unknown as { gcps: { put: jest.Mock } }).gcps.put;
const mRemove = (Cctv as unknown as { gcps: { remove: jest.Mock } }).gcps.remove;
const mConfirm = confirmModal as jest.Mock;

const STREAM = {
  id: 's1',
  name: 'Portaria Norte',
  latitude: -23.55,
  longitude: -46.64,
} as never;

const UNCALIBRATED = { stream_id: 's1', gcps: [], homography: null };
const PAIRS4 = [
  { px: 0, py: 0, lat: -23.55, lng: -46.64 },
  { px: 1280, py: 0, lat: -23.55, lng: -46.6362 },
  { px: 1280, py: 720, lat: -23.5514, lng: -46.6362 },
  { px: 0, py: 720, lat: -23.5514, lng: -46.64 },
];
/** Calibração MÍNIMA (4 pontos): resíduo NÃO mensurável — erro vira ±—. */
const CALIBRATED4 = {
  stream_id: 's1',
  gcps: PAIRS4,
  homography: {
    matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    reproj_error_m: 0,
    n_gcps: 4,
    residual_meaningful: false,
    calibrated_at: '2026-06-12T10:00:00+00:00',
    calibrated_by: 'ferreira',
  },
};
/** Calibração com 5 pontos: o erro devolvido é resíduo REAL. */
const CALIBRATED5 = {
  stream_id: 's1',
  gcps: [...PAIRS4, { px: 640, py: 360, lat: -23.5507, lng: -46.6381 }],
  homography: {
    matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    reproj_error_m: 1.5,
    n_gcps: 5,
    residual_meaningful: true,
    calibrated_at: '2026-06-12T10:00:00+00:00',
    calibrated_by: 'ferreira',
  },
};

let rectSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mGet.mockResolvedValue(UNCALIBRATED);
  // mapeamento clique→viewBox determinístico: box 1280x720 em (0,0)
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
    <CalibrateModal
      stream={STREAM}
      frameUrl={frameUrl}
      onClose={jest.fn()}
      onChanged={jest.fn()}
    />,
  );
}

/** Adiciona N pares: clique no frame (px crescente) + clique no mapa. */
async function addPairs(n: number) {
  for (let i = 0; i < n; i++) {
    fireEvent.click(screen.getByTestId('calibrate-frame'), {
      clientX: 100 + i * 200,
      clientY: 100 + i * 100,
    });
    fireEvent.click(screen.getByTestId('mock-map-click'));
    await waitFor(() =>
      expect(screen.getAllByTestId(/^calibrate-pair-\d+$/)).toHaveLength(i + 1),
    );
  }
}

test('<4 pares: salvar desabilitado com title honesto', async () => {
  renderModal();
  await waitFor(() => expect(mGet).toHaveBeenCalledWith('s1'));
  await addPairs(3);
  const save = screen.getByTestId('calibrate-save');
  expect(save).toBeDisabled();
  expect(save.getAttribute('title')).toContain('cameras.calibrateNeedPairs');
  expect(mPut).not.toHaveBeenCalled();
});

test('4 pares: PUT válido mas veredito NEUTRO — nunca verde (resíduo ~0 por construção)', async () => {
  mPut.mockResolvedValue(CALIBRATED4);
  renderModal();
  await waitFor(() => expect(mGet).toHaveBeenCalled());
  await addPairs(4);
  // hint empurrando o 5º ponto enquanto só há 4 pares
  expect(screen.getByTestId('calibrate-step').textContent).toContain(
    'cameras.calibratePushFifth',
  );
  const save = screen.getByTestId('calibrate-save');
  expect(save).not.toBeDisabled(); // 4 é o mínimo matemático — PUT continua válido
  fireEvent.click(save);
  await waitFor(() => expect(mPut).toHaveBeenCalledTimes(1));
  const [sid, pairs] = mPut.mock.calls[0];
  expect(sid).toBe('s1');
  expect(pairs).toHaveLength(4);
  // pixel no viewBox 1280x720 (1º clique: 100,100) + ponto do mapa stub
  expect(pairs[0]).toMatchObject({ px: 100, py: 100, lat: -23.55, lng: -46.64 });
  const verdict = await screen.findByTestId('calibrate-verdict');
  expect(verdict.textContent).toContain('cameras.calibrateVerdictMinimal');
  expect(verdict.textContent).not.toContain('cameras.calibrateVerdictGood');
  expect(verdict.textContent).not.toContain('0.0'); // nunca número fingido
  expect(verdict.className).not.toContain('text-success');
});

test('5 pares: PUT com os 5 e veredito verde com o resíduo REAL <2m', async () => {
  mPut.mockResolvedValue({
    ...CALIBRATED5,
    homography: { ...CALIBRATED5.homography, reproj_error_m: 1.2 },
  });
  renderModal();
  await waitFor(() => expect(mGet).toHaveBeenCalled());
  await addPairs(5);
  fireEvent.click(screen.getByTestId('calibrate-save'));
  await waitFor(() => expect(mPut).toHaveBeenCalledTimes(1));
  expect(mPut.mock.calls[0][1]).toHaveLength(5);
  const verdict = await screen.findByTestId('calibrate-verdict');
  expect(verdict.textContent).toContain('cameras.calibrateVerdictGood');
  expect(verdict.textContent).toContain('1.2');
});

test('erro alto (>=2m) com 5 pares → veredito de alerta honesto', async () => {
  mPut.mockResolvedValue({
    ...CALIBRATED5,
    homography: { ...CALIBRATED5.homography, reproj_error_m: 7.3 },
  });
  renderModal();
  await waitFor(() => expect(mGet).toHaveBeenCalled());
  await addPairs(5);
  fireEvent.click(screen.getByTestId('calibrate-save'));
  const verdict = await screen.findByTestId('calibrate-verdict');
  expect(verdict.textContent).toContain('cameras.calibrateVerdictBad');
  expect(verdict.textContent).toContain('7.3');
});

test('aviso fixo de PLANO presente — pontos no chão', async () => {
  renderModal();
  await waitFor(() => expect(mGet).toHaveBeenCalled());
  expect(screen.getByTestId('calibrate-plane-notice').textContent).toContain(
    'cameras.calibratePlaneNotice',
  );
});

test('falha do PUT (422 degenerado) → erro exibido', async () => {
  mPut.mockRejectedValue(new Error('GCPs colineares — espalhe os pontos'));
  renderModal();
  await waitFor(() => expect(mGet).toHaveBeenCalled());
  await addPairs(4);
  fireEvent.click(screen.getByTestId('calibrate-save'));
  const err = await screen.findByTestId('calibrate-error');
  expect(err.textContent).toContain('GCPs colineares');
});

test('remover par tira da lista e desabilita salvar de novo', async () => {
  renderModal();
  await waitFor(() => expect(mGet).toHaveBeenCalled());
  await addPairs(4);
  expect(screen.getByTestId('calibrate-save')).not.toBeDisabled();
  fireEvent.click(screen.getByTestId('calibrate-pair-remove-0'));
  await waitFor(() =>
    expect(screen.getAllByTestId(/^calibrate-pair-\d+$/)).toHaveLength(3),
  );
  expect(screen.getByTestId('calibrate-save')).toBeDisabled();
});

test('já calibrada (5 pontos): estado atual com o resíduo real + descalibrar via confirmModal', async () => {
  mGet.mockResolvedValue(CALIBRATED5);
  mConfirm.mockResolvedValue(true);
  mRemove.mockResolvedValue(undefined);
  renderModal();
  // pares existentes pré-carregados (revisão/recalibração)
  await waitFor(() =>
    expect(screen.getAllByTestId(/^calibrate-pair-\d+$/)).toHaveLength(5),
  );
  expect(screen.getByTestId('calibrate-current').textContent).toContain('1.5');
  fireEvent.click(screen.getByTestId('calibrate-remove'));
  await waitFor(() => expect(mConfirm).toHaveBeenCalled());
  await waitFor(() => expect(mRemove).toHaveBeenCalledWith('s1'));
});

test('já calibrada com 4 pontos: erro atual vira ±— (nunca ±0.0 fingido)', async () => {
  mGet.mockResolvedValue(CALIBRATED4);
  renderModal();
  await waitFor(() =>
    expect(screen.getAllByTestId(/^calibrate-pair-\d+$/)).toHaveLength(4),
  );
  const current = screen.getByTestId('calibrate-current');
  expect(current.textContent).toContain('—');
  expect(current.textContent).not.toContain('0.0');
});

test('descalibrar cancelado no confirmModal NÃO chama o DELETE', async () => {
  mGet.mockResolvedValue(CALIBRATED5);
  mConfirm.mockResolvedValue(false);
  renderModal();
  await screen.findByTestId('calibrate-remove');
  fireEvent.click(screen.getByTestId('calibrate-remove'));
  await waitFor(() => expect(mConfirm).toHaveBeenCalled());
  expect(mRemove).not.toHaveBeenCalled();
});

test('sem frame arquivado: estado honesto, sem área de clique', async () => {
  renderModal(null);
  await waitFor(() => expect(mGet).toHaveBeenCalled());
  expect(screen.getByTestId('calibrate-no-frame')).toBeTruthy();
  expect(screen.queryByTestId('calibrate-frame')).toBeNull();
});
