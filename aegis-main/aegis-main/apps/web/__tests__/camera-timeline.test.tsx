/**
 * CameraTimeline — barra temporal REAL de /cameras.
 *
 * Invariantes:
 *  - marcadores de detecção posicionados por detected_at REAL (escala
 *    linear de tempo — left % = posPct), nunca índice pseudo-aleatório;
 *  - janelas de coverage da gravação sombreadas por tempo;
 *  - bookmarks são marcadores DISTINTOS, clicáveis;
 *  - clique na faixa → onSeek com o instante wall-clock do ponto clicado;
 *  - cursor de posição atual posicionado por tempo;
 *  - timestamps em fonte mono (JetBrains Mono), cantos retos.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { CameraTimeline } from '@/components/cameras/camera-timeline';

const FROM = 1_000_000;
const TO = 2_000_000;

const DETS = [
  { id: 'd1', atMs: 1_250_000, label: 'ABC1D23', confidence: 0.9, entityId: null },
  { id: 'd2', atMs: 1_750_000, label: 'Pessoa #4', confidence: 0.7, entityId: 'ent-4' },
];
const BMS = [{ id: 'b1', atMs: 1_500_000, label: 'portão' }];
const COVERAGE = [{ t_start_ms: 1_100_000, t_end_ms: 1_600_000 }];

function setup(over: Partial<React.ComponentProps<typeof CameraTimeline>> = {}) {
  const onSeek = jest.fn();
  const onDetectionClick = jest.fn();
  const onBookmarkClick = jest.fn();
  const utils = render(
    <CameraTimeline
      fromMs={FROM}
      toMs={TO}
      coverage={COVERAGE}
      detections={DETS}
      bookmarks={BMS}
      cursorMs={1_400_000}
      onSeek={onSeek}
      onDetectionClick={onDetectionClick}
      onBookmarkClick={onBookmarkClick}
      {...over}
    />,
  );
  return { onSeek, onDetectionClick, onBookmarkClick, ...utils };
}

test('detecções posicionadas por detected_at real (left = % da janela)', () => {
  setup();
  expect(screen.getByTestId('timeline-detection-d1').style.left).toBe('25%');
  expect(screen.getByTestId('timeline-detection-d2').style.left).toBe('75%');
});

test('bookmark é marcador distinto posicionado por tempo', () => {
  setup();
  const bm = screen.getByTestId('timeline-bookmark-b1');
  expect(bm.style.left).toBe('50%');
});

test('coverage sombreada por tempo (left/width %)', () => {
  setup();
  const cov = screen.getByTestId('timeline-coverage-0');
  expect(cov.style.left).toBe('10%');
  expect(cov.style.width).toBe('50%');
});

test('cursor de posição atual posicionado por tempo', () => {
  setup();
  expect(screen.getByTestId('timeline-cursor').style.left).toBe('40%');
});

test('clique na faixa → onSeek com o instante clicado', () => {
  const { onSeek } = setup();
  const track = screen.getByTestId('timeline-track');
  track.getBoundingClientRect = () =>
    ({ left: 0, width: 200, top: 0, height: 24, right: 200, bottom: 24, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  fireEvent.click(track, { clientX: 100 });
  expect(onSeek).toHaveBeenCalledWith(1_500_000);
});

test('sem onSeek a faixa não é clicável (ao vivo) mas marcadores seguem clicáveis', () => {
  const { onDetectionClick, onBookmarkClick } = setup({ onSeek: undefined });
  fireEvent.click(screen.getByTestId('timeline-detection-d2'));
  expect(onDetectionClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'd2' }));
  fireEvent.click(screen.getByTestId('timeline-bookmark-b1'));
  expect(onBookmarkClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
});

test('timestamps da janela em fonte mono, sem cantos arredondados', () => {
  const { container } = setup();
  const root = screen.getByTestId('camera-timeline');
  expect(root.querySelectorAll('.font-mono').length).toBeGreaterThan(0);
  expect(container.innerHTML).not.toMatch(/rounded/);
});
