/**
 * layer_builder — Construtor de Camadas de Referência.
 *
 * Cobre o que é aferível sem WebGL: contrato do registro (paleta/catálogo),
 * árvore de camadas/feições, criação de camada, salvar e o guarda de desenho
 * não salvo. O desenho em si (mapbox-gl-draw) é certificado ao vivo.
 */
import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import '@/components/workshop/widgets/layer-builder';
import { getRegisteredWidgets } from '@/components/workshop/WorkshopV2Renderer';
import {
  anelDaFeicao,
  aplicarEstiloNaCategoria,
  aplicarEstiloNaFeicao,
  LayerBuilder,
} from '@/components/workshop/widgets/layer-builder';
import { GeoLayers } from '@/lib/api/geo-layers';

// O mapa real precisa de WebGL/token — o teste afere a UI ao redor dele.
jest.mock('@/components/geo/builder-map', () => ({
  BuilderMap: (props: { features: unknown[] }) => (
    <div data-testid="builder-map-mock" data-features={props.features.length} />
  ),
}));
jest.mock('@/lib/api/geo-layers', () => ({
  GeoLayers: {
    list: jest.fn(),
    create: jest.fn(),
    features: jest.fn(),
    saveFeatures: jest.fn(),
    publish: jest.fn(),
    patch: jest.fn(),
    remove: jest.fn(),
  },
}));
// flag mutável em vez de resetModules+re-import: recarregar o módulo cria uma
// SEGUNDA cópia do React e o contexto do i18n vira null
let mockCanManage = true;
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => mockCanManage }));
// prefixo `mock` é o que o babel-jest permite referenciar na factory hoisteada
const mockPrompt = jest.fn();
const mockConfirm = jest.fn();
jest.mock('@/components/dialog/confirm-dialog', () => ({
  promptModal: (...args: unknown[]) => mockPrompt(...args),
  confirmModal: (...args: unknown[]) => mockConfirm(...args),
}));
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
jest.mock('@/components/ui/toast', () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));
const mockFenceCreate = jest.fn();
jest.mock('@/lib/api', () => ({
  Alerts: { geofences: { create: (...a: unknown[]) => mockFenceCreate(...a) } },
}));

const api = GeoLayers as jest.Mocked<typeof GeoLayers>;

const layer = {
  id: 'board-1', slug: 'camada-zonas-camada', nome: 'Zonas Quentes',
  descricao: '', node_type: 'zonas_quentes', dataset: 'camada-zonas_quentes',
  mapa: { slug: 'centro', label: 'Centro' },
  feature_count: 2, materialized_count: 2, dataset_version: 2,
  last_run_status: null, last_run_at: null,
};

const rows = [
  { id: 'f-0001', nome: 'Boca do Beco X', categoria: 'Tráfico',
    geometry: { type: 'Polygon' as const, coordinates: [[[-46.6, -23.5], [-46.5, -23.5], [-46.5, -23.4], [-46.6, -23.5]]] },
    geo_style: { color: '#E97D2A' } },
  { id: 'f-0002', nome: 'Via crítica', categoria: 'Cruzamentos',
    geometry: { type: 'LineString' as const, coordinates: [[-46.6, -23.5], [-46.5, -23.4]] } },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockCanManage = true;
  api.list.mockResolvedValue({ maps: [{ slug: 'centro', label: 'Centro', layers: [layer] }], avulsas: [] });
  api.features.mockResolvedValue({ rows, version: 2, node_type: 'zonas_quentes' });
});

describe('registro do widget (contrato dos 3 níveis)', () => {
  it('está na paleta com meta utilizável e mock que renderiza sem dado vivo', () => {
    const entry = getRegisteredWidgets().find((w) => w.type === 'layer_builder');
    expect(entry).toBeTruthy();
    const meta = entry!.meta;
    expect(meta.label).toBe('Construtor de camadas');
    expect(meta.mockConfig).toBeTruthy();
    const campos = (meta.config_schema || []).map((c) => c.name);
    expect(campos).toEqual(
      expect.arrayContaining(['title', 'height', 'view', 'map_tag', 'zoom']),
    );
  });
});

describe('árvore de camadas e feições', () => {
  it('lista o grupo, a camada e as feições agrupadas por categoria', async () => {
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('Zonas Quentes')).toBeInTheDocument();
    await waitFor(() => expect(api.features).toHaveBeenCalledWith('board-1'));
    expect(await screen.findByText('Boca do Beco X')).toBeInTheDocument();
    expect(screen.getByText('Via crítica')).toBeInTheDocument();
    expect(screen.getByText('Tráfico')).toBeInTheDocument();
    expect(screen.getByText('Cruzamentos')).toBeInTheDocument();
  });

  it('sem camadas mostra o estado vazio que ensina o gesto', async () => {
    api.list.mockResolvedValue({ maps: [], avulsas: [] });
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    expect(await screen.findByText(/Nenhuma camada ainda/i)).toBeInTheDocument();
  });

  it('erro de carga não deixa a tela muda', async () => {
    api.list.mockRejectedValue(new Error('boom'));
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    expect(await screen.findByText(/Não foi possível carregar as camadas/i)).toBeInTheDocument();
  });
});

describe('criar camada', () => {
  it('pede o nome em modal (nunca prompt nativo) e cria', async () => {
    mockPrompt.mockResolvedValue('Tráfico de Drogas');
    api.create.mockResolvedValue({ ...layer, id: 'board-2', nome: 'Tráfico de Drogas' });
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Zonas Quentes');

    fireEvent.click(screen.getByTestId('builder-nova-camada'));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({
      nome: 'Tráfico de Drogas', mapa: undefined,
    }));
  });

  it('cancelar o modal não chama a API', async () => {
    mockPrompt.mockResolvedValue(null);
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Zonas Quentes');
    fireEvent.click(screen.getByTestId('builder-nova-camada'));
    await waitFor(() => expect(mockPrompt).toHaveBeenCalled());
    expect(api.create).not.toHaveBeenCalled();
  });

  it('config map_tag entra como grupo da camada nova', async () => {
    mockPrompt.mockResolvedValue('Nova');
    api.create.mockResolvedValue({ ...layer, id: 'board-3' });
    render(<LayerBuilder appId="a" config={{ map_tag: 'centro' }} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Zonas Quentes');
    fireEvent.click(screen.getByTestId('builder-nova-camada'));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ nome: 'Nova', mapa: 'centro' }));
  });
});

describe('desenho não salvo', () => {
  it('Salvar só habilita com alteração pendente', async () => {
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');
    expect(screen.getByTestId('builder-salvar')).toBeDisabled();
    expect(screen.queryByTestId('builder-dirty')).not.toBeInTheDocument();
  });

  it('remover feição marca pendência, e salvar manda as linhas restantes', async () => {
    api.saveFeatures.mockResolvedValue({ rows: [rows[1]], version: 3, node_type: 'zonas_quentes' });
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');

    fireEvent.click(screen.getByTestId('builder-remover-f-0001'));
    expect(await screen.findByTestId('builder-dirty')).toBeInTheDocument();
    expect(screen.queryByText('Boca do Beco X')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('builder-salvar'));
    await waitFor(() => expect(api.saveFeatures).toHaveBeenCalledWith('board-1', [rows[1]]));
    await waitFor(() => expect(screen.queryByTestId('builder-dirty')).not.toBeInTheDocument());
  });
});

describe('estilo (a cor carrega significado, não decoração)', () => {
  it('estilo de categoria propaga a TODAS as feições dela', () => {
    const out = aplicarEstiloNaCategoria(rows, 'Tráfico', { color: '#C8341F' });
    expect(out[0].geo_style?.color).toBe('#C8341F');
    expect(out[1].geo_style?.color).toBeUndefined(); // outra categoria, intacta
  });

  it('override por feição vence e preserva o resto do estilo', () => {
    const base = aplicarEstiloNaCategoria(rows, 'Tráfico', { color: '#C8341F', alpha: 0.35 });
    const out = aplicarEstiloNaFeicao(base, 'f-0001', { color: '#2D77BE' });
    expect(out[0].geo_style).toEqual({ color: '#2D77BE', alpha: 0.35 });
  });

  it('aplicar cor pela paleta marca pendência e altera a feição', async () => {
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');

    fireEvent.click(screen.getByTestId('builder-estilo-f-0001'));
    fireEvent.click(await screen.findByTestId('builder-paleta-f-0001-C8341F'));
    expect(await screen.findByTestId('builder-dirty')).toBeInTheDocument();

    api.saveFeatures.mockResolvedValue({ rows, version: 3, node_type: 'zonas_quentes' });
    fireEvent.click(screen.getByTestId('builder-salvar'));
    await waitFor(() => {
      const enviadas = api.saveFeatures.mock.calls[0][1];
      expect(enviadas[0].geo_style?.color).toBe('#C8341F');
    });
  });
});

describe('anelDaFeicao (contrato da cerca)', () => {
  it('devolve o anel ABERTO em [lng,lat] (a cerca não repete o fechamento)', () => {
    const fechado = rows[0].geometry.coordinates[0];
    expect(anelDaFeicao(rows[0])).toEqual(fechado.slice(0, -1));
    expect(anelDaFeicao({
      id: 'x',
      geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] },
    })).toEqual([[0, 0], [1, 0], [1, 1]]);
  });

  it('multipolígono de VÁRIOS blocos não vira cerca (cobriria só um deles)', () => {
    expect(anelDaFeicao({
      id: 'multi',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 0]]],
          [[[5, 5], [6, 5], [6, 6], [5, 5]]],
        ],
      },
    })).toBeNull();
  });

  it('linha e ponto não viram cerca', () => {
    expect(anelDaFeicao(rows[1])).toBeNull();
    expect(anelDaFeicao({ id: 'p', geometry: { type: 'Point', coordinates: [0, 0] } })).toBeNull();
  });
});

describe('publicar', () => {
  it('salva o pendente ANTES de publicar (senão o mapa contaria outra história)', async () => {
    api.saveFeatures.mockResolvedValue({ rows: [rows[1]], version: 3, node_type: 'zonas_quentes' });
    api.publish.mockResolvedValue({
      status: 'OK', run_id: 'r1', error: null, rows: 1,
      materialized: 1, removed: 1, duration_ms: 120, node_type: 'zonas_quentes',
    });
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');

    fireEvent.click(screen.getByTestId('builder-remover-f-0001'));
    await screen.findByTestId('builder-dirty');
    fireEvent.click(screen.getByTestId('builder-publicar'));

    await waitFor(() => expect(api.publish).toHaveBeenCalledWith('board-1'));
    // ordem real das chamadas (jest registra a sequência de invocação)
    const ordemSave = (api.saveFeatures as jest.Mock).mock.invocationCallOrder[0];
    const ordemPublish = (api.publish as jest.Mock).mock.invocationCallOrder[0];
    expect(ordemSave).toBeLessThan(ordemPublish);
    // o resultado é honesto: quantas feições ficaram no mapa e quantas saíram
    expect(await screen.findByTestId('builder-publicado')).toHaveTextContent('1');
  });

  it('publicar sem pendência não regrava o dataset', async () => {
    api.publish.mockResolvedValue({
      status: 'OK', run_id: 'r1', error: null, rows: 2,
      materialized: 2, removed: 0, duration_ms: 90, node_type: 'zonas_quentes',
    });
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');
    fireEvent.click(screen.getByTestId('builder-publicar'));
    await waitFor(() => expect(api.publish).toHaveBeenCalled());
    expect(api.saveFeatures).not.toHaveBeenCalled();
  });

  it('falha do run vira erro visível, não silêncio', async () => {
    api.publish.mockResolvedValue({
      status: 'FAILED', run_id: null, error: 'fonte vazia', rows: 0,
      materialized: 0, removed: 0, duration_ms: 10, node_type: null,
    });
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');
    fireEvent.click(screen.getByTestId('builder-publicar'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('fonte vazia'));
    expect(screen.queryByTestId('builder-publicado')).not.toBeInTheDocument();
  });
});

describe('import / export', () => {
  it('import ADICIONA as feições do arquivo à camada ativa', async () => {
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');

    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { nome: 'Importada', categoria: 'Tráfico' },
          geometry: { type: 'Point', coordinates: [-46.6, -23.5] } },
      ],
    };
    const file = new File([JSON.stringify(fc)], 'mymaps.geojson', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(JSON.stringify(fc)) });

    fireEvent.change(screen.getByTestId('builder-import-input'), { target: { files: [file] } });
    expect(await screen.findByText('Importada')).toBeInTheDocument();
    expect(screen.getByText('Boca do Beco X')).toBeInTheDocument(); // não substituiu
    expect(await screen.findByTestId('builder-dirty')).toBeInTheDocument();
  });

  it('promover a cerca manda o anel na convenção do avaliador', async () => {
    mockConfirm.mockResolvedValue(true);
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');

    fireEvent.click(screen.getByTestId('builder-cerca-f-0001'));
    await waitFor(() => expect(mockFenceCreate).toHaveBeenCalledWith({
      name: 'Boca do Beco X',
      shape: 'polygon',
      coordinates: rows[0].geometry.coordinates[0].slice(0, -1),
      severity: 'medium',
    }));
  });

  it('cancelar a confirmação não cria cerca', async () => {
    mockConfirm.mockResolvedValue(false);
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');
    fireEvent.click(screen.getByTestId('builder-cerca-f-0001'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockFenceCreate).not.toHaveBeenCalled();
  });

  it('linha não oferece o gesto de cerca', async () => {
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Via crítica');
    expect(screen.queryByTestId('builder-cerca-f-0002')).not.toBeInTheDocument();
  });
});

describe('regressões da revisão adversarial', () => {
  it('criar camada com desenho pendente PEDE confirmação (senão o desenho some)', async () => {
    mockConfirm.mockResolvedValue(false);
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');
    fireEvent.click(screen.getByTestId('builder-remover-f-0001'));
    await screen.findByTestId('builder-dirty');

    fireEvent.click(screen.getByTestId('builder-nova-camada'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockPrompt).not.toHaveBeenCalled();   // recusou = nada acontece
    expect(api.create).not.toHaveBeenCalled();
  });

  it('estilo por categoria casa mesmo com espaço sobrando (KML traz "Tráfico ")', () => {
    const comEspaco = [{ ...rows[0], categoria: 'Tráfico ' }];
    const out = aplicarEstiloNaCategoria(comEspaco, 'Tráfico', { color: '#C8341F' });
    expect(out[0].geo_style?.color).toBe('#C8341F');
  });

  it('erro do backend chega ao operador com o motivo, não um genérico', async () => {
    api.saveFeatures.mockRejectedValue({ detail: 'camada com 2400 feições excede o teto de 2000' });
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');
    fireEvent.click(screen.getByTestId('builder-remover-f-0001'));
    await screen.findByTestId('builder-dirty');
    fireEvent.click(screen.getByTestId('builder-salvar'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(
      'camada com 2400 feições excede o teto de 2000',
    ));
  });

  it('reimportar arquivo editado ATUALIZA a feição em vez de descartar', async () => {
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');

    // mesmo id, nome editado fora (QGIS)
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { id: 'f-0001', nome: 'Beco X (revisado)' },
        geometry: rows[0].geometry,
      }],
    };
    const file = new File([JSON.stringify(fc)], 'editado.geojson', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(JSON.stringify(fc)) });
    fireEvent.change(screen.getByTestId('builder-import-input'), { target: { files: [file] } });

    expect(await screen.findByText('Beco X (revisado)')).toBeInTheDocument();
    expect(screen.queryByText('Boca do Beco X')).not.toBeInTheDocument();
    expect(screen.getByText('Via crítica')).toBeInTheDocument();   // as outras ficam
  });
});

describe('salvar NÃO é publicar (o furo que deixou o mapa vazio)', () => {
  it('camada com desenho salvo mas não publicado avisa "não publicado"', async () => {
    // 3 feições no dataset, 0 materializadas = trabalho esperando publicação
    api.list.mockResolvedValue({
      maps: [{ slug: 'centro', label: 'Centro', layers: [
        { ...layer, feature_count: 3, materialized_count: 0 },
      ] }],
      avulsas: [],
    });
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');
    expect(await screen.findByTestId('builder-pendente')).toBeInTheDocument();
    // e a árvore mostra desenhadas/no-mapa em vez de um número que mente
    expect(screen.getByText('3/0')).toBeInTheDocument();
  });

  it('camada publicada e sincronizada não fica pedindo publicação', async () => {
    api.list.mockResolvedValue({
      maps: [{ slug: 'centro', label: 'Centro', layers: [
        { ...layer, feature_count: 2, materialized_count: 2 },
      ] }],
      avulsas: [],
    });
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');
    expect(screen.queryByTestId('builder-pendente')).not.toBeInTheDocument();
  });

  it('o toast do salvar diz que falta publicar', async () => {
    api.saveFeatures.mockResolvedValue({ rows: [rows[1]], version: 3, node_type: 'zonas_quentes' });
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Boca do Beco X');
    fireEvent.click(screen.getByTestId('builder-remover-f-0001'));
    await screen.findByTestId('builder-dirty');
    fireEvent.click(screen.getByTestId('builder-salvar'));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/Publique para o desenho aparecer no Mapa/i),
    ));
  });
});

describe('sem permissão de gestão', () => {
  it('vira visualizador: sem criar, sem salvar, sem ferramentas', async () => {
    mockCanManage = false;
    render(<LayerBuilder appId="a" config={{}} variables={{}} bindings={{}} setBinding={jest.fn()} />);
    await screen.findByText('Zonas Quentes');
    expect(screen.queryByTestId('builder-nova-camada')).not.toBeInTheDocument();
    expect(screen.queryByTestId('builder-salvar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('builder-tool-draw_polygon')).not.toBeInTheDocument();
  });
});
