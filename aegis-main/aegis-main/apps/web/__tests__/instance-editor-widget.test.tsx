/**
 * Widget instance_editor (V2 visão→georref→mapa).
 *
 * Invariantes:
 *  - sem item selecionado → empty state (não grava nada);
 *  - edita lat/lng (PUT escreve em properties, geopoint canônico) + metadata;
 *  - remover é em DOIS passos (confirm) → DELETE governado;
 *  - sucesso emite value_change (o app declara refresh_all + close_overlay);
 *  - findGeoKey é genérico (acha qualquer campo {lat,lng}).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api', () => ({
  Ontology: { updateNode: jest.fn(), deleteNode: jest.fn() },
}));

import { Ontology } from '@/lib/api';
import { getWidgetComponent, getWidgetMeta } from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets/instance-editor';
import { findGeoKey } from '@/components/workshop/widgets/instance-editor';

const mockOnt = Ontology as jest.Mocked<typeof Ontology>;

const INSTANCE = {
  id: 'n1', name: 'estrutura 3',
  properties: { localizacao: { lat: -23.5533, lng: -46.6374 }, observacao: 'telhado duplo' },
};

function renderEditor(selected: unknown, emit = jest.fn()) {
  const Comp = getWidgetComponent('instance_editor')!;
  render(
    <Comp appId="app-1" config={{ source: 'selecionado', geo_property: 'localizacao' }}
      variables={{ selecionado: selected }} bindings={{}} setBinding={() => {}} emit={emit} />,
  );
  return emit;
}

describe('instance_editor (V2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnt.updateNode.mockResolvedValue({} as never);
    mockOnt.deleteNode.mockResolvedValue({ status: 'deleted' } as never);
  });

  it('findGeoKey acha o campo geopoint (preferido ou qualquer {lat,lng})', () => {
    expect(findGeoKey({ localizacao: { lat: 1, lng: 2 } }, 'localizacao')).toBe('localizacao');
    expect(findGeoKey({ posicao: { lat: 1, lng: 2 } }, 'localizacao')).toBe('localizacao'); // preferido ausente → cria
    expect(findGeoKey({ outra: { lat: 1, lng: 2 } })).toBe('outra'); // sem preferido → 1ª geo
  });

  it('é proposable e declara mockConfig (regra da paleta)', () => {
    const meta = getWidgetMeta('instance_editor')!;
    expect(meta.mockConfig).toBeTruthy();
  });

  it('sem item selecionado mostra empty state', () => {
    renderEditor(undefined);
    expect(screen.getByTestId('instance-editor')).toHaveTextContent('instanceEditor.empty');
    expect(screen.queryByTestId('ie-save')).toBeNull();
  });

  it('pré-preenche lat/lng + metadata da instância', () => {
    renderEditor(INSTANCE);
    expect((screen.getByTestId('ie-lat') as HTMLInputElement).value).toBe('-23.5533');
    expect((screen.getByTestId('ie-lng') as HTMLInputElement).value).toBe('-46.6374');
    expect((screen.getByTestId('ie-meta-observacao') as HTMLInputElement).value).toBe('telhado duplo');
  });

  it('salvar faz PUT com geopoint canônico em properties + emite value_change', async () => {
    const emit = renderEditor(INSTANCE);
    fireEvent.change(screen.getByTestId('ie-lat'), { target: { value: '-23.6000' } });
    fireEvent.change(screen.getByTestId('ie-meta-observacao'), { target: { value: 'revisado' } });
    fireEvent.click(screen.getByTestId('ie-save'));
    await waitFor(() => expect(mockOnt.updateNode).toHaveBeenCalled());
    const [id, patch] = mockOnt.updateNode.mock.calls[0];
    expect(id).toBe('n1');
    expect(patch.properties!.localizacao).toEqual({ lat: -23.6, lng: -46.6374 });
    expect(patch.properties!.observacao).toBe('revisado');
    expect(emit).toHaveBeenCalledWith('value_change', { saved_id: 'n1', action: 'update' });
  });

  it('remover exige confirmação (2 passos) e então faz DELETE + emite value_change', async () => {
    const emit = renderEditor(INSTANCE);
    fireEvent.click(screen.getByTestId('ie-remove'));
    // confirmModal monta um dialog real (portal compartilhado), não confirm inline
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog).toBeInTheDocument();
    expect(mockOnt.deleteNode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirm-ok'));
    await waitFor(() => expect(mockOnt.deleteNode).toHaveBeenCalledWith('n1'));
    expect(emit).toHaveBeenCalledWith('value_change', { saved_id: 'n1', action: 'delete' });
  });

  it('lat/lng inválido bloqueia o salvar (não chama PUT)', async () => {
    renderEditor(INSTANCE);
    fireEvent.change(screen.getByTestId('ie-lat'), { target: { value: '' } });
    expect(screen.getByTestId('ie-save')).toBeDisabled();
  });
});
