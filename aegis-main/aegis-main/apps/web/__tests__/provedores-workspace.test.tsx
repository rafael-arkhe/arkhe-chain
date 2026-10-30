/**
 * Provedores de Computação — workspace BYOM (V1 visão→georref→mapa §5).
 *
 * Invariantes da UI:
 *  - vendor é DROPDOWN populado do catálogo (nunca texto livre);
 *  - selecionar o vendor pré-preenche jurisdições e mostra certificações
 *    HONESTAS (notes/cert_metadata do preset);
 *  - api_key só aparece quando o vendor exige; é input type=password e o
 *    valor nunca reaparece na lista (has_credential + status, sem a chave);
 *  - Testar conexão exibe ok/falha por provider;
 *  - lista mostra jurisdição (compliance visível) + kind traduzido.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockCatalog = {
  vendors: [
    {
      vendor: 'wavespeed', label: 'WaveSpeed (nuvem gerenciada)',
      provider_kind: 'cloud_inference', country: 'SG', jurisdictions: ['SG'],
      capabilities: ['detect', 'count'],
      cert_metadata: { sla: 'sem SLA contratual publicado' },
      pricing_hint: '≈ US$ 0,001 por detecção (~2 s)',
      requires_api_key: true, requires_base_url: false,
      notes: 'Empresa sediada em Singapura; residência fora de SG não garantida.',
    },
    {
      vendor: 'edge_cctv', label: 'Edge Safe Core (no cliente)',
      provider_kind: 'edge', country: null, jurisdictions: ['*'],
      capabilities: [], cert_metadata: {}, pricing_hint: null,
      requires_api_key: false, requires_base_url: false,
      notes: 'Inferência local; rota soberana p/ jurisdições restritas.',
    },
  ],
  capabilities: ['detect', 'count', 'segment', 'describe', 'custom_pipeline'],
};

const mockRow = {
  id: 'p1', slug: 'ws-prod', display_name: 'WS Produção', vendor: 'wavespeed',
  provider_kind: 'cloud_inference', base_url: null, country: 'SG',
  jurisdictions: ['SG'], capabilities: ['detect'],
  cert_metadata: { sla: 'sem SLA contratual publicado' },
  pricing_hint: '≈ US$ 0,001 por detecção (~2 s)', enabled: true,
  has_credential: true, validation_status: 'unvalidated', created_at: '2026-06-04T12:00:00Z',
};

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
// Factory PURA (hoisted) — sem referência a consts do módulo (TDZ); os
// resolved values entram no beforeEach.
jest.mock('@/lib/api', () => ({
  Compute: {
    list: jest.fn(),
    catalog: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    test: jest.fn(),
  },
}));

import { Compute } from '@/lib/api';
import { ProvedoresWorkspace } from '@/components/dados/provedores-workspace';

const mockCompute = Compute as jest.Mocked<typeof Compute>;

describe('ProvedoresWorkspace (BYOM V1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCompute.list.mockResolvedValue([mockRow] as never);
    mockCompute.catalog.mockResolvedValue(mockCatalog as never);
    mockCompute.create.mockResolvedValue(mockRow as never);
    mockCompute.update.mockResolvedValue({ ...mockRow, enabled: false } as never);
    mockCompute.remove.mockResolvedValue({ deleted: true } as never);
    mockCompute.test.mockResolvedValue({ ok: true, message: 'conexão ok (HTTP 400)' } as never);
  });

  it('lista providers com jurisdição visível e status da credencial (sem a chave)', async () => {
    render(<ProvedoresWorkspace />);
    const card = await screen.findByTestId('provedor-card-ws-prod');
    expect(card).toHaveTextContent('WS Produção');
    expect(card).toHaveTextContent('SG'); // jurisdição = compliance visível
    expect(card).toHaveTextContent('provedores.credential');
    expect(card).toHaveTextContent('unvalidated');
  });

  it('vendor é dropdown do catálogo; selecionar pré-preenche jurisdições e mostra certificações honestas', async () => {
    render(<ProvedoresWorkspace />);
    fireEvent.click(await screen.findByTestId('provedores-novo'));
    const sel = await screen.findByTestId('pf-vendor');
    expect(sel.tagName).toBe('SELECT'); // nunca texto livre
    fireEvent.change(sel, { target: { value: 'wavespeed' } });
    expect((screen.getByTestId('pf-jurisdictions') as HTMLInputElement).value).toBe('SG');
    const notes = screen.getByTestId('pf-preset-notes');
    expect(notes).toHaveTextContent('Singapura');
    expect(notes).toHaveTextContent('sem SLA contratual publicado');
  });

  it('api_key só aparece quando o vendor exige, é password, e o create envia ao Vault', async () => {
    render(<ProvedoresWorkspace />);
    fireEvent.click(await screen.findByTestId('provedores-novo'));
    const sel = await screen.findByTestId('pf-vendor');

    // edge não exige chave → campo ausente
    fireEvent.change(sel, { target: { value: 'edge_cctv' } });
    expect(screen.queryByTestId('pf-api-key')).toBeNull();

    // wavespeed exige → campo password
    fireEvent.change(sel, { target: { value: 'wavespeed' } });
    const key = await screen.findByTestId('pf-api-key');
    expect((key as HTMLInputElement).type).toBe('password');

    fireEvent.change(screen.getByTestId('pf-name'), { target: { value: 'WS Produção' } });
    fireEvent.change(key, { target: { value: 'sk-secreta' } });
    fireEvent.click(screen.getByTestId('provedores-cadastrar'));
    await waitFor(() => expect(mockCompute.create).toHaveBeenCalled());
    expect(mockCompute.create.mock.calls[0][0]).toMatchObject({
      vendor: 'wavespeed', display_name: 'WS Produção', api_key: 'sk-secreta',
      jurisdictions: ['SG'],
    });
  });

  it('Testar conexão exibe o resultado por provider', async () => {
    render(<ProvedoresWorkspace />);
    fireEvent.click(await screen.findByTestId('provedor-test-ws-prod'));
    const res = await screen.findByTestId('provedor-res-ws-prod');
    expect(res).toHaveTextContent('conexão ok');
    expect(mockCompute.test).toHaveBeenCalledWith('p1');
  });

  it('habilitar/desabilitar e remover chamam a API', async () => {
    render(<ProvedoresWorkspace />);
    fireEvent.click(await screen.findByTestId('provedor-toggle-ws-prod'));
    await waitFor(() =>
      expect(mockCompute.update).toHaveBeenCalledWith('p1', { enabled: false }));
    fireEvent.click(await screen.findByTestId('provedor-del-ws-prod'));
    await waitFor(() => expect(mockCompute.remove).toHaveBeenCalledWith('p1'));
  });
});
