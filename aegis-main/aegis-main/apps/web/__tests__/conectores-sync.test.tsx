/**
 * P6a (2026-06-05) — Sincronização no painel de Conectores: serializer + preview.
 *
 * Cobre: seletor de formato (json/jsonl/csv/xml); pré-visualização chama
 * Connectors.syncPreview e mostra o schema inferido (chips campo·tipo); registrar
 * envia o serializer; tooltips (InfoTip) presentes nos campos técnicos.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ConectoresWorkspace } from '@/components/dados/conectores-workspace';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
// Tarefa B — a seção AEGIS Edge tem suíte própria (conectores-edge.test);
// aqui fica stubada (a factory de @/lib/api destes testes não mocka Edge).
jest.mock('@/components/dados/edge-section', () => ({ EdgeSection: () => null }));
jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ actions }: any) => <div>{actions}</div>,
}));
// Tarefa H — o workspace agora chama useCan('connectors.manage') p/ exibir o
// botão Configurar; sem o mock, useAuth exigiria <AuthProvider> no render.
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/lib/api', () => ({
  Connectors: { list: jest.fn(), register: jest.fn(), test: jest.fn(), run: jest.fn(), schedulerTick: jest.fn(), syncPreview: jest.fn(), update: jest.fn(), runs: jest.fn(), retryRun: jest.fn() },
  // WP-F — node_type/id_field/markings viraram dropdowns governados; o form
  // agora consulta a ontologia e o catálogo de marcações.
  Ontology: { listNodeTypes: jest.fn(), objectTypeSchema: jest.fn() },
  Markings: { list: jest.fn() },
  Sources: { list: jest.fn() },
  Datasets: { list: jest.fn() },
  Projects: { list: jest.fn() },
}));

const { Connectors, Ontology, Markings } = jest.requireMock('@/lib/api') as {
  Connectors: Record<string, jest.Mock>;
  Ontology: Record<string, jest.Mock>;
  Markings: Record<string, jest.Mock>;
};

beforeEach(() => {
  jest.clearAllMocks();
  Connectors.list.mockResolvedValue([]);
  Ontology.listNodeTypes.mockResolvedValue([{ name: 'endereco', label: 'Endereço', count: 1 }]);
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'endereco', display_name: 'Endereço', title_property: 'name', count: 1,
    properties: [{ key: 'id', label: 'ID', type: 'string' }], links: [], actions: [],
  });
  Markings.list.mockResolvedValue([{ slug: 'OFICIAL', display_name: 'Oficial', active: true }]);
});

async function openForm() {
  render(<ConectoresWorkspace />);
  await waitFor(() => expect(Connectors.list).toHaveBeenCalled());
  fireEvent.click(screen.getByTestId('conectores-novo'));
  await screen.findByTestId('conectores-form');
}

it('mostra o seletor de serializer com os 4 formatos + tooltips nos campos', async () => {
  await openForm();
  const sel = screen.getByTestId('cf-serializer') as HTMLSelectElement;
  expect(Array.from(sel.options).map((o) => o.value)).toEqual(['json', 'jsonl', 'csv', 'xml']);
  // UX calibrada: há tooltips (InfoTip) nos campos técnicos
  expect(screen.getAllByTestId('info-tip').length).toBeGreaterThanOrEqual(3);
});

it('records_path desabilita quando o formato não é JSON', async () => {
  await openForm();
  fireEvent.change(screen.getByTestId('cf-serializer'), { target: { value: 'csv' } });
  const rp = screen.getByPlaceholderText('vazio = resposta é o array') as HTMLInputElement;
  expect(rp.disabled).toBe(true);
});

it('pré-visualizar chama syncPreview e mostra o schema inferido', async () => {
  Connectors.syncPreview.mockResolvedValue({
    format: 'csv', row_count: 2,
    schema: [{ key: 'nome', type: 'text' }, { key: 'idade', type: 'number' }],
    sample_rows: [{ nome: 'Ana', idade: '30' }], fetched_from: null,
  });
  await openForm();
  fireEvent.change(screen.getByTestId('cf-serializer'), { target: { value: 'csv' } });
  fireEvent.change(screen.getByTestId('cf-sample'), { target: { value: 'nome,idade\nAna,30\nBeto,41' } });
  fireEvent.click(screen.getByTestId('conectores-preview'));

  await waitFor(() => expect(Connectors.syncPreview).toHaveBeenCalledWith({ format: 'csv', sample: 'nome,idade\nAna,30\nBeto,41' }));
  const res = await screen.findByTestId('conectores-preview-res');
  expect(res).toHaveTextContent('nome');
  expect(res).toHaveTextContent('number');
  expect(screen.getByTestId('schema-field-idade')).toHaveTextContent('idade');
});

it('registrar envia o serializer escolhido', async () => {
  Connectors.register.mockResolvedValue({ id: 'a1', slug: 'x' });
  await openForm();
  fireEvent.change(screen.getByTestId('cf-slug'), { target: { value: 'cep' } });
  fireEvent.change(screen.getByTestId('cf-base-url'), { target: { value: 'https://api.x' } });
  // node_type agora é dropdown governado — espera as opções da ontologia.
  await screen.findByRole('option', { name: 'Endereço' });
  fireEvent.change(screen.getByTestId('cf-node-type'), { target: { value: 'endereco' } });
  fireEvent.change(screen.getByTestId('cf-serializer'), { target: { value: 'xml' } });
  fireEvent.click(screen.getByTestId('conectores-registrar'));
  await waitFor(() => expect(Connectors.register).toHaveBeenCalled());
  expect(Connectors.register.mock.calls[0][0].serializer).toEqual({ format: 'xml' });
});
