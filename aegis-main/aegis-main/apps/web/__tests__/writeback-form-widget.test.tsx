/**
 * Wave D.4 — Writeback Form widget tests (2026-05-23).
 *
 * 2026-06-05 — fix do 422 "node_type pattern mismatch": o write direto agora
 * usa o caminho CANÔNICO de instância (criar = Ontology.bulkCreate →
 * /ontology/nodes/bulk; atualizar = Ontology.updateNode → PUT {properties}),
 * nunca mais POST /ontology/nodes (meta-modelo, regex rejeita kinds). E o
 * payload técnico fica ESCONDIDO do form — só um botão discreto que copia.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { WritebackForm } from '@/components/workshop/widgets/writeback-form';
import { WorkshopSurfaceContext } from '@/lib/workshop/surface';

jest.mock('@/lib/api', () => ({
  Ontology: {
    bulkCreate: jest.fn(),
    updateNode: jest.fn(),
  },
  // Wave G.1 — OSDK writeback callback. Mock co-locado pra que os tests
  // novos consigam validar o branch alternativo do submit handler.
  OsdkActions: {
    invoke: jest.fn(),
  },
}));

const { Ontology, OsdkActions } = jest.requireMock('@/lib/api') as {
  Ontology: { bulkCreate: jest.Mock; updateNode: jest.Mock };
  OsdkActions: { invoke: jest.Mock };
};

type RP = Parameters<typeof WritebackForm>[0];

function renderWB(
  config: Record<string, unknown>,
  variables: Record<string, unknown> = {},
  setBinding: jest.Mock = jest.fn(),
) {
  const props = {
    config,
    variables,
    bindings: {},
    appId: 'test-app',
    setBinding,
    emit: jest.fn(),
  } as unknown as RP;
  return { setBinding, ...render(<WritebackForm {...props} />) };
}

describe('writeback_form widget — Wave D.4', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exibe mensagem amigável quando fields está vazio', () => {
    renderWB({});
    expect(screen.getByTestId('writeback-form-widget')).toBeInTheDocument();
    expect(screen.getByTestId('writeback-form-empty')).toBeInTheDocument();
  });

  it('renderiza inputs para cada field declarado', () => {
    renderWB({
      target_kind: 'Person',
      fields: [
        { key: 'nome', label: 'Nome', type: 'string', required: true },
        { key: 'idade', label: 'Idade', type: 'number' },
        { key: 'ativo', label: 'Ativo', type: 'boolean' },
        { key: 'obs', label: 'Observação', type: 'text' },
      ],
    });
    expect(screen.getByTestId('form-field-nome')).toBeInTheDocument();
    expect(screen.getByTestId('form-field-idade')).toBeInTheDocument();
    expect(screen.getByTestId('form-field-ativo')).toBeInTheDocument();
    expect(screen.getByTestId('form-field-obs')).toBeInTheDocument();
  });

  it('exige confirmação antes de gravar (criar = caminho canônico bulkCreate)', async () => {
    Ontology.bulkCreate.mockResolvedValue({ created: 1, object_ids: ['node-1'], kind: 'Person' });
    renderWB({
      target_kind: 'Person',
      fields: [{ key: 'nome', label: 'Nome', type: 'string', required: true }],
    });
    fireEvent.change(screen.getByTestId('form-field-nome'), {
      target: { value: 'Maria' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-submit'));
    expect(screen.getByTestId('writeback-form-confirm')).toBeInTheDocument();
    expect(Ontology.bulkCreate).not.toHaveBeenCalled();
    // Wave F.2 — requireConfirmText: operador precisa digitar "gravar".
    fireEvent.change(screen.getByTestId('writeback-form-confirm-text'), {
      target: { value: 'gravar' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-confirm-yes'));
    await waitFor(() => expect(Ontology.bulkCreate).toHaveBeenCalledTimes(1));
    // REGRESSÃO do 422: o kind vai como argumento do caminho de INSTÂNCIA —
    // nunca mais um body {node_type: <kind>} pro meta-modelo.
    expect(Ontology.bulkCreate).toHaveBeenCalledWith('Person', [
      expect.objectContaining({ nome: 'Maria' }),
    ]);
    await screen.findByTestId('writeback-form-success');
  });

  it('superfície pública (/m): usa surface.writeback (Action token-scoped), NÃO o create autenticado', async () => {
    const writeback = jest.fn().mockResolvedValue({ id: 'guest-obj-1' });
    const props = {
      config: {
        target_kind: 'Ocorrencia',
        fields: [{ key: 'nome', label: 'Título', type: 'string', required: true }],
      },
      variables: {},
      bindings: {},
      appId: 'page::pag-morador',
      setBinding: jest.fn(),
      emit: jest.fn(),
    } as unknown as Parameters<typeof WritebackForm>[0];
    render(
      <WorkshopSurfaceContext.Provider value={{ writeback }}>
        <WritebackForm {...props} />
      </WorkshopSurfaceContext.Provider>,
    );
    fireEvent.change(screen.getByTestId('form-field-nome'), {
      target: { value: 'Vazamento no 3º andar' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-submit'));
    fireEvent.change(screen.getByTestId('writeback-form-confirm-text'), {
      target: { value: 'gravar' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-confirm-yes'));
    await waitFor(() => expect(writeback).toHaveBeenCalledTimes(1));
    expect(writeback).toHaveBeenCalledWith(
      expect.objectContaining({
        target_kind: 'Ocorrencia',
        fields: expect.objectContaining({ nome: 'Vazamento no 3º andar' }),
      }),
    );
    // caminho autenticado NÃO é usado na superfície pública
    expect(Ontology.bulkCreate).not.toHaveBeenCalled();
    await screen.findByTestId('writeback-form-success');
  });

  it('bloqueia submit quando required está vazio', () => {
    renderWB({
      target_kind: 'Person',
      fields: [{ key: 'nome', label: 'Nome', type: 'string', required: true }],
    });
    fireEvent.click(screen.getByTestId('writeback-form-submit'));
    // Não chama API e mostra missing
    expect(Ontology.bulkCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId('writeback-form-missing')).toBeInTheDocument();
  });

  it('passa por update (PUT properties — caminho do instance_editor) quando node_id está presente', async () => {
    Ontology.updateNode.mockResolvedValue({ id: 'a1b2c3d4-e5f6-4789-8abc-def012345678', properties: { nome: 'João' } });
    renderWB(
      {
        target_kind: 'Person',
        node_id: 'a1b2c3d4-e5f6-4789-8abc-def012345678',
        fields: [{ key: 'nome', label: 'Nome', type: 'string', required: true }],
      },
      {},
    );
    fireEvent.change(screen.getByTestId('form-field-nome'), {
      target: { value: 'João' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-submit'));
    fireEvent.change(screen.getByTestId('writeback-form-confirm-text'), {
      target: { value: 'gravar' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-confirm-yes'));
    await waitFor(() => expect(Ontology.updateNode).toHaveBeenCalledTimes(1));
    expect(Ontology.updateNode).toHaveBeenCalledWith('a1b2c3d4-e5f6-4789-8abc-def012345678', {
      properties: expect.objectContaining({ nome: 'João' }),
    });
    expect(Ontology.bulkCreate).not.toHaveBeenCalled();
  });

  /* ── 2026-06-05 — payload ESCONDIDO + botão discreto de copiar ────────── */

  it('NÃO expõe o payload no form; o botão do cabeçalho copia o JSON canônico', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWB({
      target_kind: 'FotoEntrada',
      fields: [{ key: 'nome_arquivo', label: 'Arquivo', type: 'string', required: true }],
    });
    // o bloco de preview não existe mais
    expect(screen.queryByTestId('writeback-form-preview-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('writeback-form-preview-payload')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('form-field-nome_arquivo'), {
      target: { value: 'teste' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-copy-payload'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = JSON.parse(writeText.mock.calls[0][0]);
    // shape CANÔNICO (o que realmente será enviado), não o legado node_type
    expect(copied).toEqual({ kind: 'FotoEntrada', items: [{ nome_arquivo: 'teste' }] });
  });

  it('bloqueia confirmar enquanto operador não digita "gravar"', async () => {
    Ontology.bulkCreate.mockResolvedValue({ created: 1, object_ids: ['x'], kind: 'Person' });
    renderWB({
      target_kind: 'Person',
      fields: [{ key: 'nome', label: 'Nome', type: 'string', required: true }],
    });
    fireEvent.change(screen.getByTestId('form-field-nome'), {
      target: { value: 'Pedro' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-submit'));
    const yes = screen.getByTestId(
      'writeback-form-confirm-yes',
    ) as HTMLButtonElement;
    expect(yes.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('writeback-form-confirm-text'), {
      target: { value: 'gra' },
    });
    expect(yes.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('writeback-form-confirm-text'), {
      target: { value: 'gravar' },
    });
    expect(yes.disabled).toBe(false);
  });

  it('atualiza on_success_variable após sucesso', async () => {
    Ontology.bulkCreate.mockResolvedValue({ created: 1, object_ids: ['novo-1'], kind: 'Person' });
    const { setBinding } = renderWB({
      target_kind: 'Person',
      on_success_variable: 'ultima_pessoa',
      fields: [{ key: 'nome', label: 'Nome', type: 'string', required: true }],
    });
    fireEvent.change(screen.getByTestId('form-field-nome'), {
      target: { value: 'Ana' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-submit'));
    fireEvent.change(screen.getByTestId('writeback-form-confirm-text'), {
      target: { value: 'gravar' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-confirm-yes'));
    await waitFor(() =>
      expect(setBinding).toHaveBeenCalledWith(
        'ultima_pessoa',
        expect.objectContaining({ id: 'novo-1', nome: 'Ana' }),
      ),
    );
  });

  /* ── Wave G.1 (2026-05-23) — OSDK writeback callback ─────────────── */

  it('quando osdk_action_key vazio, segue path direto canônico (bulkCreate)', async () => {
    Ontology.bulkCreate.mockResolvedValue({ created: 1, object_ids: ['direct-1'], kind: 'Person' });
    renderWB({
      target_kind: 'Person',
      fields: [{ key: 'nome', label: 'Nome', type: 'string', required: true }],
    });
    fireEvent.change(screen.getByTestId('form-field-nome'), {
      target: { value: 'Maria' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-submit'));
    fireEvent.change(screen.getByTestId('writeback-form-confirm-text'), {
      target: { value: 'gravar' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-confirm-yes'));
    await waitFor(() => expect(Ontology.bulkCreate).toHaveBeenCalledTimes(1));
    // OsdkActions.invoke NÃO deve ser chamado no path direto.
    expect(OsdkActions.invoke).not.toHaveBeenCalled();
  });

  it('quando osdk_action_key setado, chama OsdkActions.invoke em vez do write direto', async () => {
    OsdkActions.invoke.mockResolvedValue({
      ok: true,
      action_key: 'security.criar_caso',
      result: { echo: { id: 'caso-99', nome: 'Maria' } },
      lineage_event_id: 'le-1',
      dry_run: false,
    });
    renderWB({
      target_kind: 'Person',
      osdk_action_key: 'security.criar_caso',
      fields: [{ key: 'nome', label: 'Nome', type: 'string', required: true }],
    });
    fireEvent.change(screen.getByTestId('form-field-nome'), {
      target: { value: 'Maria' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-submit'));
    fireEvent.change(screen.getByTestId('writeback-form-confirm-text'), {
      target: { value: 'gravar' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-confirm-yes'));
    await waitFor(() => expect(OsdkActions.invoke).toHaveBeenCalledTimes(1));
    // write direto NÃO deve ser chamado no path OSDK.
    expect(Ontology.bulkCreate).not.toHaveBeenCalled();
    // Action key e payload-shape conferidos.
    expect(OsdkActions.invoke).toHaveBeenCalledWith(
      'security.criar_caso',
      expect.objectContaining({
        target_kind: 'Person',
        fields: expect.objectContaining({ nome: 'Maria' }),
      }),
    );
    await screen.findByTestId('writeback-form-success');
  });

  it('atualiza on_success_variable com echo do OSDK no path action', async () => {
    OsdkActions.invoke.mockResolvedValue({
      ok: true,
      action_key: 'security.criar_caso',
      result: { echo: { id: 'caso-1', nome: 'Carla' } },
      lineage_event_id: 'le-2',
      dry_run: false,
    });
    const { setBinding } = renderWB({
      target_kind: 'Person',
      osdk_action_key: 'security.criar_caso',
      on_success_variable: 'ultimo_caso',
      fields: [{ key: 'nome', label: 'Nome', type: 'string', required: true }],
    });
    fireEvent.change(screen.getByTestId('form-field-nome'), {
      target: { value: 'Carla' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-submit'));
    fireEvent.change(screen.getByTestId('writeback-form-confirm-text'), {
      target: { value: 'gravar' },
    });
    fireEvent.click(screen.getByTestId('writeback-form-confirm-yes'));
    await waitFor(() =>
      expect(setBinding).toHaveBeenCalledWith(
        'ultimo_caso',
        expect.objectContaining({ id: 'caso-1', nome: 'Carla' }),
      ),
    );
  });
});
