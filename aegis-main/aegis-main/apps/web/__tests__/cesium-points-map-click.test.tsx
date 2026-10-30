/**
 * Paridade dual-surface — prop ADITIVA `onMapClick(lat, lng)` no CesiumPoints.
 *
 * O picker de localização do modal "Registrar câmera" ganha alternância 2D/3D;
 * a superfície 3D é o CesiumPoints da casa (components/geo/cesium-points.tsx),
 * com o MESMO contrato do MapboxMap.onMapClick. Cesium é WebGL (não roda em
 * jsdom) → mock do módulo `cesium` (mesmo espírito do mock de `mapbox-gl` em
 * mapbox-map-click.test.tsx). Prova:
 *  1. clique em globo vazio → pickEllipsoid → Cartographic → (lat, lng) graus;
 *  2. clique que PEGA uma entity → onPointClick dispara e onMapClick NÃO
 *     (prioridade da entity — contrato documentado na prop);
 *  3. fallback: pickEllipsoid vazio → globe.pick(ray);
 *  4. sem a prop → zero mudança (retrocompat /geo e widgets).
 */
import { render, screen, act, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

// FakeCesium: cobre só o que o init do CesiumPoints toca. Handlers de input
// ficam num registry por tipo de evento (__fire dispara como o canvas faria).
// state.* controla o resultado dos picks por teste.
jest.mock('cesium', () => {
  const handlers = {} as Record<string, Function[]>;
  const state = {
    pickResult: undefined as unknown,        // scene.pick (entity sob o cursor)
    ellipsoidResult: undefined as unknown,   // camera.pickEllipsoid
    globePickResult: undefined as unknown,   // fallback scene.globe.pick(ray)
  };
  class FakeColor {
    withAlpha() { return this; }
  }
  const mkColor = () => new FakeColor();
  class FakeViewer {
    scene = {
      canvas: {},
      pick: () => state.pickResult,
      globe: {
        ellipsoid: {},
        pick: () => state.globePickResult,
        baseColor: undefined as unknown,
        showGroundAtmosphere: false,
        enableLighting: false,
      },
      backgroundColor: undefined as unknown,
      skyAtmosphere: undefined,
      fog: { enabled: false },
      moon: undefined,
      sun: undefined,
      skyBox: undefined,
    };
    camera = {
      pickEllipsoid: () => state.ellipsoidResult,
      getPickRay: () => ({}),
    };
    // `document` cru é barrado pelo guard de hoist do jest.mock — via globalThis ok.
    cesiumWidget = { creditContainer: globalThis.document.createElement('div') };
    entities = { removeAll: () => {}, add: () => ({}) };
    dataSources = { add: () => {}, remove: () => {} };
    flyTo() { return Promise.resolve(true); }
    isDestroyed() { return false; }
    destroy() {}
  }
  class FakeHandler {
    setInputAction(cb: Function, type: string) {
      (handlers[type] ||= []).push(cb);
    }
  }
  class FakeDataSource {
    clustering = {
      enabled: false, pixelRange: 0, minimumClusterSize: 0,
      clusterEvent: { addEventListener: () => {} },
    };
    entities = { removeAll: () => {}, add: () => ({}) };
  }
  return {
    __esModule: true,
    Viewer: FakeViewer,
    ScreenSpaceEventHandler: FakeHandler,
    CustomDataSource: FakeDataSource,
    ScreenSpaceEventType: { LEFT_CLICK: 'LEFT_CLICK' },
    Ion: { defaultAccessToken: '' },
    Color: { fromCssColorString: mkColor, WHITE: new FakeColor() },
    Cartesian2: class {},
    Cartesian3: { fromDegrees: (lng: number, lat: number) => ({ lng, lat }) },
    // Cartographic devolve RADIANOS (como o Cesium real) — o componente tem
    // que converter com Math.toDegrees (conversão real, testada de ponta).
    Cartographic: {
      fromCartesian: (c: { latRad: number; lngRad: number }) => ({
        latitude: c.latRad,
        longitude: c.lngRad,
      }),
    },
    Math: { toDegrees: (rad: number) => (rad * 180) / global.Math.PI },
    HeightReference: { CLAMP_TO_GROUND: 1 },
    HorizontalOrigin: { CENTER: 0 },
    VerticalOrigin: { CENTER: 0 },
    __state: state,
    __handlers: handlers,
    __fire: (type: string, e?: unknown) => (handlers[type] || []).forEach((cb) => cb(e)),
    __reset: () => {
      Object.keys(handlers).forEach((k) => delete handlers[k]);
      state.pickResult = undefined;
      state.ellipsoidResult = undefined;
      state.globePickResult = undefined;
    },
  };
});

import { CesiumPoints } from '@/components/geo/cesium-points';

const cesium = jest.requireMock('cesium') as {
  __state: { pickResult: unknown; ellipsoidResult: unknown; globePickResult: unknown };
  __handlers: Record<string, Function[]>;
  __fire: (type: string, e?: unknown) => void;
  __reset: () => void;
};

const rad = (deg: number) => (deg * Math.PI) / 180;

// init do CesiumPoints é async (await import('cesium')) — espera o handler
// de LEFT_CLICK existir antes de disparar o clique.
async function renderReady(ui: React.ReactElement) {
  render(ui);
  await waitFor(() => expect(cesium.__handlers['LEFT_CLICK']?.length).toBeGreaterThan(0));
}

beforeEach(() => cesium.__reset());

test('clique em globo vazio → onMapClick(lat, lng) em graus', async () => {
  const onMapClick = jest.fn();
  const onPointClick = jest.fn();
  await renderReady(
    <CesiumPoints points={[]} onMapClick={onMapClick} onPointClick={onPointClick} />,
  );

  cesium.__state.ellipsoidResult = { latRad: rad(-23.5215), lngRad: rad(-45.7679) };
  act(() => cesium.__fire('LEFT_CLICK', { position: { x: 10, y: 10 } }));

  expect(onMapClick).toHaveBeenCalledTimes(1);
  const [lat, lng] = onMapClick.mock.calls[0];
  expect(lat).toBeCloseTo(-23.5215, 4);
  expect(lng).toBeCloseTo(-45.7679, 4);
  expect(onPointClick).not.toHaveBeenCalled();
});

test('clique que pega uma ENTITY → onPointClick dispara; onMapClick NÃO (prioridade)', async () => {
  const onMapClick = jest.fn();
  const onPointClick = jest.fn();
  await renderReady(
    <CesiumPoints
      points={[{ id: 'cam-1', lat: -23.5, lng: -45.7 }]}
      onMapClick={onMapClick}
      onPointClick={onPointClick}
    />,
  );

  cesium.__state.pickResult = { id: { id: 'cam-1' } };
  // mesmo com pick de globo disponível, a entity tem prioridade
  cesium.__state.ellipsoidResult = { latRad: rad(-1), lngRad: rad(-2) };
  act(() => cesium.__fire('LEFT_CLICK', { position: { x: 5, y: 5 } }));

  expect(onPointClick).toHaveBeenCalledWith('cam-1');
  expect(onMapClick).not.toHaveBeenCalled();
});

test('fallback: pickEllipsoid vazio → globe.pick(ray) ainda resolve (lat, lng)', async () => {
  const onMapClick = jest.fn();
  await renderReady(<CesiumPoints points={[]} onMapClick={onMapClick} />);

  cesium.__state.ellipsoidResult = undefined;
  cesium.__state.globePickResult = { latRad: rad(10.5), lngRad: rad(20.25) };
  act(() => cesium.__fire('LEFT_CLICK', { position: { x: 1, y: 1 } }));

  expect(onMapClick).toHaveBeenCalledTimes(1);
  const [lat, lng] = onMapClick.mock.calls[0];
  expect(lat).toBeCloseTo(10.5, 4);
  expect(lng).toBeCloseTo(20.25, 4);
});

test('sem onMapClick → clique em globo vazio não explode; entity continua selecionável (retrocompat)', async () => {
  const onPointClick = jest.fn();
  await renderReady(
    <CesiumPoints points={[{ id: 'p1', lat: 1, lng: 2 }]} onPointClick={onPointClick} />,
  );

  cesium.__state.ellipsoidResult = { latRad: rad(3), lngRad: rad(4) };
  expect(() =>
    act(() => cesium.__fire('LEFT_CLICK', { position: { x: 0, y: 0 } })),
  ).not.toThrow();

  cesium.__state.pickResult = { id: { id: 'p1' } };
  act(() => cesium.__fire('LEFT_CLICK', { position: { x: 0, y: 0 } }));
  expect(onPointClick).toHaveBeenCalledWith('p1');

  expect(screen.getByTestId('cesium-points')).toBeInTheDocument();
});
