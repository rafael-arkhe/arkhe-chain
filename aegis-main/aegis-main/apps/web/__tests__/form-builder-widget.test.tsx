/**
 * Onda K.2 — Form Widget (form_builder) render + submit + policy.
 *
 * Verifica: render dos tipos de campo, condicional em tempo real,
 * validação bloqueando submit, write-back via Forms.submit, política
 * requires_auth bloqueando anônimo, e gravação do resultado em variável.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { FormBuilder } from '@/components/workshop/widgets/form-builder';
import { Forms } from '@/lib/api';
import { useAuth } from '@/lib/auth/useAuth';

jest.mock('@/lib/api', () => ({
  Forms: { submit: jest.fn() },
  OntologyNodes: { search: jest.fn().mockResolvedValue([]) },
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

type RP = Parameters<typeof FormBuilder>[0];

function renderForm(
  config: Record<string, unknown>,
  opts: {
    variables?: Record<string, unknown>;
    emit?: jest.Mock;
    setBinding?: jest.Mock;
  } = {},
) {
  const props = {
    config,
    variables: opts.variables ?? {},
    bindings: {},
    appId: 'test-app',
    setBinding: opts.setBinding ?? jest.fn(),
    emit: opts.emit ?? jest.fn(),
  } as unknown as RP;
  return render(<FormBuilder {...props} />);
}

const authed = {
  username: 'agente1',
  permissions: ['forms.submit'],
} as unknown as ReturnType<typeof useAuth>['principal'];

describe('form_builder widget — Onda K.2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ principal: authed });
  });

  it('renders empty state when no fields', () => {
    renderForm({ title: 'Form vazio' });
    expect(screen.getByTestId('form-builder-empty')).toBeInTheDocument();
  });

  it('renders fields of multiple types', () => {
    renderForm({
      form_key: 'f1',
      target_node_type: 'Person',
      fields: [
        { key: 'nome', label: 'Nome', type: 'text', required: true },
        { key: 'ativo', label: 'Ativo', type: 'boolean' },
        { key: 'uf', label: 'UF', type: 'select', options: ['SP', 'RJ'] },
        { key: 'vinc', label: 'Vínculo', type: 'lookup', ref_node_type: 'Person' },
      ],
    });
    expect(screen.getByTestId('form-field-nome')).toBeInTheDocument();
    expect(screen.getByTestId('form-field-ativo')).toBeInTheDocument();
    expect(screen.getByTestId('form-field-uf')).toBeInTheDocument();
    expect(screen.getByTestId('form-lookup-vinc')).toBeInTheDocument();
  });

  it('shows policy badge', () => {
    renderForm({ visibility_policy: 'requires_perm', fields: [] });
    expect(screen.getByTestId('form-builder-policy-badge')).toHaveTextContent(
      'Requer permissão',
    );
  });

  it('blocks anonymous on requires_auth', () => {
    (useAuth as jest.Mock).mockReturnValue({ principal: null });
    renderForm({
      visibility_policy: 'requires_auth',
      fields: [{ key: 'nome', type: 'text' }],
    });
    expect(screen.getByTestId('form-builder-auth-required')).toBeInTheDocument();
  });

  it('blocks submit when required field missing (validation)', async () => {
    const submit = Forms.submit as jest.Mock;
    renderForm({
      form_key: 'f1',
      target_node_type: 'Person',
      fields: [{ key: 'nome', label: 'Nome', type: 'text', required: true }],
    });
    fireEvent.click(screen.getByTestId('form-builder-submit'));
    // error shown, Forms.submit NOT called
    await waitFor(() =>
      expect(screen.getByTestId('form-field-nome').closest('label')).toHaveTextContent(
        'Campo obrigatório.',
      ),
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('conditional field appears only when rule matches', () => {
    renderForm({
      form_key: 'f1',
      target_node_type: 'Person',
      fields: [
        { key: 'tipo', label: 'Tipo', type: 'select', options: ['pf', 'pj'] },
        {
          key: 'cnpj',
          label: 'CNPJ',
          type: 'text',
          rules: [{ when_field: 'tipo', operator: 'eq', value: 'pj', effect: 'show' }],
        },
      ],
    });
    // hidden initially
    expect(screen.queryByTestId('form-field-cnpj')).not.toBeInTheDocument();
    // select pj → appears
    fireEvent.change(screen.getByTestId('form-field-tipo'), {
      target: { value: 'pj' },
    });
    expect(screen.getByTestId('form-field-cnpj')).toBeInTheDocument();
  });

  it('submits via Forms.submit and writes result to variable + emits', async () => {
    const submit = Forms.submit as jest.Mock;
    submit.mockResolvedValueOnce({
      submission_id: 'sub-1',
      status: 'submitted',
      result: { node_id: 'n-1' },
      lineage_event_id: 'le-1',
      validation_errors: [],
      deny_reason: null,
    });
    const setBinding = jest.fn();
    const emit = jest.fn();
    renderForm(
      {
        form_key: 'cadastro',
        target_node_type: 'Person',
        on_success_variable: 'novo_no',
        fields: [{ key: 'nome', label: 'Nome', type: 'text', required: true }],
      },
      { setBinding, emit },
    );
    fireEvent.change(screen.getByTestId('form-field-nome'), {
      target: { value: 'Maria' },
    });
    fireEvent.click(screen.getByTestId('form-builder-submit'));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        form_key: 'cadastro',
        target_node_type: 'Person',
        visibility_policy: 'requires_auth',
        payload: expect.objectContaining({ nome: 'Maria' }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('form-builder-success')).toBeInTheDocument(),
    );
    expect(setBinding).toHaveBeenCalledWith('novo_no', { node_id: 'n-1' });
    expect(emit).toHaveBeenCalledWith(
      'form.submit.success',
      expect.objectContaining({ submission_id: 'sub-1' }),
    );
  });

  it('shows denied banner when backend denies (policy)', async () => {
    const submit = Forms.submit as jest.Mock;
    submit.mockResolvedValueOnce({
      submission_id: 'sub-2',
      status: 'denied',
      result: {},
      lineage_event_id: 'le-2',
      validation_errors: [],
      deny_reason: 'permissão ausente: forms.submit',
    });
    renderForm({
      form_key: 'f1',
      target_node_type: 'Person',
      fields: [{ key: 'nome', label: 'Nome', type: 'text' }],
    });
    fireEvent.click(screen.getByTestId('form-builder-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('form-builder-denied')).toHaveTextContent(
        'permissão ausente',
      ),
    );
  });

  it('disables submit for principal missing required perm', () => {
    (useAuth as jest.Mock).mockReturnValue({
      principal: { username: 'u', permissions: [] },
    });
    renderForm({
      visibility_policy: 'requires_perm',
      required_perm: 'forms.submit',
      target_node_type: 'Person',
      fields: [{ key: 'nome', label: 'Nome', type: 'text' }],
    });
    expect(screen.getByTestId('form-builder-perm-warning')).toBeInTheDocument();
    expect(screen.getByTestId('form-builder-submit')).toBeDisabled();
  });

  it('seeds dynamic default (@user) into the field', () => {
    renderForm({
      form_key: 'f1',
      target_node_type: 'Person',
      fields: [
        { key: 'autor', label: 'Autor', type: 'text', default_source: '@user' },
      ],
    });
    expect(screen.getByTestId('form-field-autor')).toHaveValue('agente1');
  });
});
