/**
 * §C C1 — Mosaicos NOMEADOS: contrato de UI (hook + toolbar + editor).
 * A resolução pura (resolveMosaic/pointInPolygon/...) tem contrato próprio em
 * __tests__/mosaic.test.ts. Aqui cobrimos: persistência otimista do hook (PUT
 * /me/context camera_mosaics), o dropdown da toolbar (trocar/criar) e o editor
 * (build de mosaico por filtro + validação de nome).
 */
import * as React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MosaicToolbar } from '@/components/cameras/mosaic-toolbar';
import { MosaicEditorModal } from '@/components/cameras/mosaic-editor-modal';
import { useCameraMosaics } from '@/lib/cameras/use-camera-mosaics';
import type { Mosaic } from '@/lib/cameras/mosaic';
import type { CCTVStream } from '@/lib/api/cctv';

// Store compartilhado de /me/context — controlado por teste (prefixo `mock`
// obrigatório na factory do jest.mock).
const mockCtx: { data: unknown; ready: boolean } = { data: null, ready: false };
jest.mock('@/lib/data/me-context-store', () => ({
  useMeContext: () => mockCtx,
}));

function stream(p: Partial<CCTVStream> & { id: string; name: string }): CCTVStream {
  return {
    url: `http://x/${p.id}.m3u8`,
    latitude: null,
    longitude: null,
    country: null,
    city: null,
    status: 'online',
    source_type: null,
    detection_enabled: false,
    stream_metadata: {},
    tags: [],
    thumbnail_url: null,
    ...p,
  } as CCTVStream;
}

const STREAMS: CCTVStream[] = [
  stream({ id: 's1', name: 'Portaria 1', city: 'São Paulo', tags: ['perimetro'] }),
  stream({ id: 's2', name: 'Av. Central', city: 'São Paulo', status: 'offline' }),
  stream({ id: 's3', name: 'Rótula Norte', city: 'Campinas', tags: ['entrada'] }),
];

const M1: Mosaic = {
  id: 'm1',
  name: 'Zona Norte',
  selection: { mode: 'filter', filter: { city: 'São Paulo' } },
  layout: { cols: 'auto' },
};

describe('useCameraMosaics', () => {
  beforeEach(() => {
    mockCtx.data = null;
    mockCtx.ready = false;
    (global.fetch as unknown) = jest.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({}) }),
    );
  });

  function Harness() {
    const { mosaics, upsert, remove } = useCameraMosaics();
    return (
      <div>
        <span data-testid="count">{mosaics.length}</span>
        {mosaics.map((m) => (
          <span key={m.id} data-testid={`h-${m.id}`}>
            {m.name}
          </span>
        ))}
        <button
          data-testid="do-upsert"
          onClick={() =>
            upsert({
              id: 'm2',
              name: 'Rodovias',
              selection: { mode: 'manual', streamIds: ['s3'] },
              layout: { cols: 2 },
            })
          }
        />
        <button data-testid="do-remove" onClick={() => remove('m1')} />
      </div>
    );
  }

  it('semeia do /me/context e persiste upsert/remove via PUT', () => {
    mockCtx.data = { camera_mosaics: [M1] };
    mockCtx.ready = true;
    render(<Harness />);
    // seeded
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('h-m1')).toBeTruthy();

    // upsert → otimista + PUT camera_mosaics com 2 itens
    act(() => {
      fireEvent.click(screen.getByTestId('do-upsert'));
    });
    expect(screen.getByTestId('count').textContent).toBe('2');
    const call = (global.fetch as jest.Mock).mock.calls.at(-1);
    expect(call[0]).toBe('/api/me/context');
    expect(call[1].method).toBe('PUT');
    const body = JSON.parse(call[1].body);
    expect(body.camera_mosaics).toHaveLength(2);
    expect(body.camera_mosaics[1].id).toBe('m2');

    // remove → PUT com o item filtrado
    act(() => {
      fireEvent.click(screen.getByTestId('do-remove'));
    });
    const body2 = JSON.parse((global.fetch as jest.Mock).mock.calls.at(-1)[1].body);
    expect(body2.camera_mosaics.map((m: Mosaic) => m.id)).toEqual(['m2']);
  });
});

describe('MosaicToolbar', () => {
  it('mostra "Mosaico" sem ativo, abre o dropdown e carrega/cria', () => {
    const onSelect = jest.fn();
    const onNew = jest.fn();
    render(
      <MosaicToolbar
        mosaics={[M1]}
        activeId={null}
        streams={STREAMS}
        zones={[]}
        onSelect={onSelect}
        onNew={onNew}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );
    const trigger = screen.getByTestId('mosaic-trigger');
    expect(trigger.textContent).toContain('Mosaico');

    fireEvent.click(trigger);
    // item aparece com a contagem resolvida (São Paulo → 2 câmeras)
    const load = screen.getByTestId('mosaic-load-m1');
    expect(load.textContent).toContain('Zona Norte');
    expect(load.textContent).toContain('2');

    fireEvent.click(load);
    expect(onSelect).toHaveBeenCalledWith('m1');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('mosaic-new'));
    expect(onNew).toHaveBeenCalled();
  });

  it('com ativo, o gatilho mostra o nome e oferece "Câmera única"', () => {
    const onSelect = jest.fn();
    render(
      <MosaicToolbar
        mosaics={[M1]}
        activeId="m1"
        streams={STREAMS}
        zones={[]}
        onSelect={onSelect}
        onNew={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );
    expect(screen.getByTestId('mosaic-trigger').textContent).toContain('Zona Norte');
    fireEvent.click(screen.getByTestId('mosaic-trigger'));
    fireEvent.click(screen.getByTestId('mosaic-single'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe('MosaicEditorModal', () => {
  it('constrói um mosaico por FILTRO com contagem viva e salva', () => {
    const onSave = jest.fn();
    render(
      <MosaicEditorModal
        initial={null}
        streams={STREAMS}
        zones={[]}
        existing={[M1]}
        onSave={onSave}
        onClose={jest.fn()}
      />,
    );
    // modo padrão = filtro; filtro vazio → todas as 3 câmeras
    expect(screen.getByTestId('mosaic-count').textContent).toContain('3');

    fireEvent.change(screen.getByTestId('mosaic-name-input'), {
      target: { value: 'Zona Sul' },
    });
    // cidade São Paulo → 2 câmeras
    fireEvent.change(screen.getByTestId('mosaic-filter-city'), {
      target: { value: 'São Paulo' },
    });
    expect(screen.getByTestId('mosaic-count').textContent).toContain('2');

    fireEvent.click(screen.getByTestId('mosaic-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as Mosaic;
    expect(saved.name).toBe('Zona Sul');
    expect(saved.id).toBe('m2'); // newMosaicId sobre [m1]
    expect(saved.selection).toEqual({ mode: 'filter', filter: { city: 'São Paulo' } });
  });

  it('exige nome (não salva vazio)', () => {
    const onSave = jest.fn();
    render(
      <MosaicEditorModal
        initial={null}
        streams={STREAMS}
        zones={[]}
        existing={[]}
        onSave={onSave}
        onClose={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('mosaic-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('mosaic-name-error')).toBeTruthy();
  });
});
