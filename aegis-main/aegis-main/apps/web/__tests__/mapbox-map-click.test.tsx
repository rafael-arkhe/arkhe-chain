/**
 * Onda 4 — prop ADITIVA `onMapClick(lat, lng)` no MapboxMap genérico.
 *
 * O picker de localização do modal "Registrar câmera" reusa o componente da
 * casa (components/geo/mapbox-map.tsx). Este teste mocka o `mapbox-gl` (jsdom
 * não tem WebGL) e prova:
 *  1. clique no canvas → callback recebe (lat, lng) na convenção AEGIS;
 *  2. sem a prop → nenhum listener extra quebra (retrocompat /geo e widgets).
 */
import { render, act } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

// FakeMap captura os handlers; clicks de CAMADA ('click' + layerId) ficam em
// chave separada pra não vazarem no disparo do click genérico do canvas.
// (sem anotações TS dentro do factory — o guard de hoist do jest barra
// qualquer identificador fora de escopo, inclusive nomes de parâmetro de tipo)
jest.mock('mapbox-gl', () => {
  const handlers = {} as Record<string, Function[]>;
  class FakeMap {
    on(ev: string, a?: unknown, b?: unknown) {
      const key = typeof a === 'string' ? `${ev}:${a}` : ev;
      const cb = (typeof a === 'string' ? b : a) as Function;
      (handlers[key] ||= []).push(cb);
      return this;
    }
    addControl() {}
    addSource() {}
    addLayer() {}
    getSource() {
      return undefined;
    }
    getCanvas() {
      return { style: {} };
    }
    setFeatureState() {}
    queryRenderedFeatures() {
      return [];
    }
    resize() {}
    easeTo() {}
    remove() {}
  }
  class FakeCtl {}
  class FakeMarker {
    setLngLat() {
      return this;
    }
    setPopup() {
      return this;
    }
    getPopup() {
      return undefined;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  class FakePopup {
    setHTML() {
      return this;
    }
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
  }
  const mod = {
    accessToken: '',
    Map: FakeMap,
    NavigationControl: FakeCtl,
    Marker: FakeMarker,
    Popup: FakePopup,
    __handlers: handlers,
    __fire: (key: string, e?: unknown) => (handlers[key] || []).forEach((cb) => cb(e)),
    __reset: () => Object.keys(handlers).forEach((k) => delete handlers[k]),
  } as Record<string, unknown>;
  return { __esModule: true, default: mod };
});

const { MapboxMap } = require('@/components/geo/mapbox-map');
const { resetarConfigCache } = require('@/lib/config/runtime');
const mapboxgl = require('mapbox-gl').default as {
  accessToken: string;
  __fire: (key: string, e?: unknown) => void;
  __reset: () => void;
  __handlers: Record<string, unknown[]>;
};

// F1.2: o token não é mais lido no load do módulo — chega da config de RUNTIME,
// já depois do primeiro render. Montar o mapa virou assíncrono, então todo teste
// precisa deixar o efeito assentar antes de disparar eventos do mapa.
async function montar(ui: React.ReactElement) {
  const r = render(ui);
  await act(async () => {});
  return r;
}

beforeEach(() => {
  mapboxgl.__reset();
  mapboxgl.accessToken = '';
  resetarConfigCache();
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'tok-teste';
  global.fetch = undefined as unknown as typeof fetch;
});

test('clique no mapa → onMapClick(lat, lng)', async () => {
  const onMapClick = jest.fn();
  await montar(
    <MapboxMap center={{ lat: -15.78, lng: -47.93 }} onMapClick={onMapClick} />,
  );
  act(() => mapboxgl.__fire('load'));
  act(() =>
    mapboxgl.__fire('click', {
      lngLat: { lat: -23.5215, lng: -45.7679 },
      defaultPrevented: false,
    }),
  );
  expect(onMapClick).toHaveBeenCalledWith(-23.5215, -45.7679);
});

test('sem onMapClick → click genérico não explode (retrocompat)', async () => {
  await montar(<MapboxMap center={{ lat: 0, lng: 0 }} />);
  act(() => mapboxgl.__fire('load'));
  // Guarda anti-vácuo: sem isto o teste passaria mesmo com o mapa nunca montado.
  expect(mapboxgl.__handlers.click?.length).toBeGreaterThan(0);
  expect(() =>
    act(() =>
      mapboxgl.__fire('click', { lngLat: { lat: 1, lng: 2 }, defaultPrevented: false }),
    ),
  ).not.toThrow();
});

// ── F1.2: o caminho REAL da imagem de produção ────────────────────────────
// Sem NEXT_PUBLIC_* (que a imagem não tem), o token vem de /api/config.

test('sem env de build, o mapa monta com o token vindo de /api/config', async () => {
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  resetarConfigCache();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ mapboxToken: 'tok-de-runtime', cesiumIonToken: '' }),
  }) as unknown as typeof fetch;

  const onMapClick = jest.fn();
  await montar(<MapboxMap center={{ lat: -15.78, lng: -47.93 }} onMapClick={onMapClick} />);

  expect(mapboxgl.accessToken).toBe('tok-de-runtime');
  act(() => mapboxgl.__fire('load'));
  act(() =>
    mapboxgl.__fire('click', { lngLat: { lat: -1, lng: -2 }, defaultPrevented: false }),
  );
  expect(onMapClick).toHaveBeenCalledWith(-1, -2);
});

test('config sem token → avisa o operador em vez de montar mapa mudo', async () => {
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  resetarConfigCache();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ mapboxToken: '', cesiumIonToken: '' }),
  }) as unknown as typeof fetch;

  const { findByTestId } = await montar(<MapboxMap center={{ lat: 0, lng: 0 }} />);

  // O aviso é montado em pedaços ("<indisponível>: <motivo>") — casa no nó.
  expect(await findByTestId('mapbox-error')).toHaveTextContent('mapbox.tokenMissing');
  expect(mapboxgl.__handlers.click ?? []).toHaveLength(0);
});
