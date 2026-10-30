/**
 * merge-ontologia.test.tsx — MERGE governado /buscar → ontologia (P4 ELO 2).
 *
 * Prova os gestos do operador (jsdom):
 *   1. PRÉVIA      · abrir mostra a tabela campo-a-campo com 1 CONFLITO + a
 *                    resolução (manter/substituir/anexar); erro-de-formato
 *                    bloquearia o aplicar.
 *   2. APLICAR     · resolver o conflito e aplicar chama /merge/apply com as
 *                    field_resolutions + result_payload; sucesso → link /ficha.
 *   3. CRIAR NOVO  · escolher "Criar novo" re-prevê com target.create e aplica.
 *   4. VÍNCULO     · escolher relação (do schema) + objeto (ObjectPicker) e
 *                    criar chama /merge/apply com link (confirmModal, nunca nativo).
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Operador COM a perm ontology.merge (RequirePerm usa useAuth/useCan).
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: () => true,
  useAuth: () => ({ principal: { roles: ['admin'], permissions: [] }, loading: false }),
}));

// confirmModal: aprova sem diálogo nativo.
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(() => Promise.resolve(true)),
}));

// Ontology (tipos de objeto + schema de links + busca do picker).
const mockListNodeTypes = jest.fn();
const mockObjectTypeSchema = jest.fn();
const mockListNodes = jest.fn();
jest.mock('@/lib/api', () => ({
  Ontology: {
    listNodeTypes: (...a: unknown[]) => mockListNodeTypes(...a),
    objectTypeSchema: (...a: unknown[]) => mockObjectTypeSchema(...a),
    listNodes: (...a: unknown[]) => mockListNodes(...a),
  },
}));

// Merge SDK — preview/apply do pipeline governado.
const mockPreview = jest.fn();
const mockApply = jest.fn();
jest.mock('@/lib/api/merge', () => ({
  Merge: {
    preview: (...a: unknown[]) => mockPreview(...a),
    apply: (...a: unknown[]) => mockApply(...a),
  },
}));

import { MergeOntologia } from '@/components/buscar/merge-ontologia';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import type { NormalizedResult } from '@/lib/buscar/types';

function pessoaResult(): NormalizedResult {
  return {
    externalId: 'r1',
    name: 'João da Silva',
    kind: 'pessoa',
    raw: { nome: 'João da Silva', cpf: '12345678909' },
  };
}

/* Prévia contra um objeto EXISTENTE: cpf conflita (existente≠novo). */
const EXISTING_PREVIEW = {
  resolved_target: 'existing',
  node_type: 'pessoa',
  target_suggestion: {
    object_id: 'obj-1',
    node_type: 'pessoa',
    name: 'João da Silva',
    canonical: 'joao da silva',
    score: 0.95,
  },
  target_alternatives: [],
  projected_properties: { nome: 'João da Silva', cpf: '12345678909' },
  creates: null,
  updates: { object_id: 'obj-1', name: 'João da Silva', changed_fields: ['cpf'] },
  conflicts: [{ field: 'cpf', old: '00000000000', new: '12345678909' }],
  format_errors: [],
};

/* Prévia de CRIAÇÃO: tudo novo, sem conflito. */
const CREATE_PREVIEW = {
  resolved_target: 'create',
  node_type: 'pessoa',
  target_suggestion: null,
  target_alternatives: [],
  projected_properties: { nome: 'João da Silva', cpf: '12345678909' },
  creates: { node_type: 'pessoa', name: 'João da Silva', properties: { nome: 'João da Silva', cpf: '12345678909' } },
  updates: null,
  conflicts: [],
  format_errors: [],
};

beforeEach(() => {
  mockListNodeTypes.mockReset().mockResolvedValue([{ name: 'pessoa', label: 'Pessoa', count: 3 }]);
  mockObjectTypeSchema.mockReset().mockResolvedValue({
    kind: 'pessoa',
    display_name: 'Pessoa',
    title_property: 'nome',
    count: 3,
    properties: [],
    links: [
      { relation: 'socio_de', target_kind: 'empresa', target_label: 'Empresa', cardinality: 'many_to_many', direction: 'outgoing' },
    ],
    actions: [],
  });
  mockListNodes.mockReset().mockResolvedValue([
    { id: 'emp-1', name: 'ACME LTDA', node_type: 'empresa', properties: {}, schema_definition: {} },
  ]);
  mockPreview.mockReset().mockImplementation((body: { target?: { create?: string } }) =>
    Promise.resolve(body?.target?.create ? CREATE_PREVIEW : EXISTING_PREVIEW),
  );
  mockApply.mockReset().mockResolvedValue({
    object_id: 'obj-1',
    created: false,
    applied_fields: ['cpf'],
    created_edges: [],
    execution_ids: ['e1'],
    lineage_event_ids: ['l1'],
  });
  (confirmModal as jest.Mock).mockClear().mockResolvedValue(true);
});

async function openModal() {
  render(<MergeOntologia result={pessoaResult()} />);
  fireEvent.click(screen.getByTestId('buscar-merge-abrir'));
  await screen.findByTestId('buscar-merge-diff');
}

describe('PRÉVIA — tabela campo-a-campo com conflito e resolução', () => {
  it('abre, prevê (auto) e mostra o conflito com os 3 botões de resolução', async () => {
    await openModal();

    await waitFor(() => expect(mockPreview).toHaveBeenCalled());
    const diff = screen.getByTestId('buscar-merge-diff');
    // valores atual→novo do conflito visíveis.
    expect(within(diff).getByText('00000000000')).toBeInTheDocument();
    expect(within(diff).getAllByText('12345678909').length).toBeGreaterThan(0);

    const conflito = screen.getByTestId('buscar-merge-conflito-cpf');
    expect(within(conflito).getByTestId('buscar-merge-conflito-cpf-keep')).toBeInTheDocument();
    expect(within(conflito).getByTestId('buscar-merge-conflito-cpf-replace')).toBeInTheDocument();
    expect(within(conflito).getByTestId('buscar-merge-conflito-cpf-append')).toBeInTheDocument();
  });
});

describe('APLICAR — resolve o conflito e grava pelo pipeline governado', () => {
  it('clicar substituir + aplicar chama /merge/apply com as resolutions e abre a /ficha', async () => {
    await openModal();

    fireEvent.click(screen.getByTestId('buscar-merge-conflito-cpf-replace'));
    fireEvent.click(screen.getByTestId('buscar-merge-aplicar'));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    const [body] = mockApply.mock.calls[0];
    expect(body).toMatchObject({
      result_payload: { nome: 'João da Silva', cpf: '12345678909' },
      target: { node_type: 'pessoa', canonical: 'João da Silva' },
      field_resolutions: { cpf: 'replace' },
    });

    // sucesso → link pra /ficha do objeto (nova aba).
    const ficha = await screen.findByTestId('buscar-merge-verficha');
    expect(ficha).toHaveAttribute('href', '/ficha/obj-1');
    expect(ficha).toHaveAttribute('target', '_blank');
    expect(ficha).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

describe('CRIAR NOVO — re-prevê com target.create e aplica', () => {
  it('escolher "Criar novo" aplica com target.create', async () => {
    await openModal();

    fireEvent.click(screen.getByTestId('buscar-merge-criar-novo'));
    // re-prevê com target.create (resposta de criação, sem conflito).
    await waitFor(() =>
      expect(mockPreview.mock.calls.some(([b]) => b?.target?.create === 'pessoa')).toBe(true),
    );

    fireEvent.click(await screen.findByTestId('buscar-merge-aplicar'));
    await waitFor(() => expect(mockApply).toHaveBeenCalled());
    expect(mockApply.mock.calls[mockApply.mock.calls.length - 1][0]).toMatchObject({
      target: { create: 'pessoa' },
    });
  });
});

describe('VÍNCULO — relação do schema + objeto + confirmModal → /merge/apply com link', () => {
  it('cria o vínculo chamando apply com link e confirmando (nunca nativo)', async () => {
    await openModal();

    // abre a seção de vínculo → carrega o schema de relações.
    fireEvent.click(screen.getByTestId('buscar-merge-vinculo'));
    // relação é um SelectField (combobox sólido, não <select> nativo): abre o
    // popover no gatilho e escolhe a opção (mesmo gesto do operador).
    fireEvent.click(await screen.findByTestId('buscar-merge-vinculo-relacao'));
    fireEvent.click(
      await screen.findByTestId('buscar-merge-vinculo-relacao-opt-socio_de'),
    );

    // abre o ObjectPicker do alvo e escolhe a empresa.
    fireEvent.click(await screen.findByTestId('buscar-merge-vinculo-buscar'));
    fireEvent.click(await screen.findByTestId('object-picker-result-emp-1'));

    // cria o vínculo.
    fireEvent.click(screen.getByTestId('buscar-merge-vinculo-criar'));

    await waitFor(() => expect(confirmModal).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockApply).toHaveBeenCalled());
    const lastBody = mockApply.mock.calls[mockApply.mock.calls.length - 1][0];
    expect(lastBody).toMatchObject({
      link: { target_object_id: 'emp-1', relation_type: 'socio_de' },
    });
  });
});
