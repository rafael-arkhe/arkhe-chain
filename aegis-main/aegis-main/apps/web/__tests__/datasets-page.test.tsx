/**
 * Datasets e Branches (Rev 6/7 UI). Browse datasets → branches + transações;
 * autoria de transação (begin+commit); merge 3-way com resolução de conflito
 * por caminho (o backend devolve 409→cliente normaliza p/ {status:'conflict'}).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// I1b: /datasets virou redirect → o host renderiza o WORKSPACE direto (mesmo
// componente que a Tela de Dados embute na seção Datasets).
import { DatasetsWorkspace as DatasetsPage } from '@/components/dados/datasets-workspace';

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/api', () => ({
  Datasets: {
    list: jest.fn(), get: jest.fn(), sample: jest.fn(), listBranches: jest.fn(), createBranch: jest.fn(),
    deactivateBranch: jest.fn(), listTransactions: jest.fn(), beginTransaction: jest.fn(),
    commitTransaction: jest.fn(), abortTransaction: jest.fn(), mergeFastForward: jest.fn(),
    mergeThreeWay: jest.fn(), getClassification: jest.fn(), setClassification: jest.fn(),
    listMarkings: jest.fn(), applyMarking: jest.fn(), removeMarking: jest.fn(),
    usage: jest.fn().mockResolvedValue({ dataset: 'x', produced_by: null, used_by_boards: [], searchable_in: null }),
  },
  Markings: { list: jest.fn() },
}));
const { Datasets, Markings } = jest.requireMock('@/lib/api') as {
  Datasets: Record<string, jest.Mock>; Markings: Record<string, jest.Mock>;
};
// Marcações remove passa por confirmModal (NUNCA window.confirm) — mockado p/ resolver true.
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn().mockResolvedValue(true),
}));
const { confirmModal } = jest.requireMock('@/components/dialog/confirm-dialog') as { confirmModal: jest.Mock };

const BRANCHES = [
  { id: 'b-main', dataset_name: 'estoque', name: 'main', parent_branch_id: null, branch_point_asset_id: null, head_asset_id: 'a1', head_version: 3, active: true, description: null, created_at: '2026-05-30T10:00:00Z' },
  { id: 'b-feat', dataset_name: 'estoque', name: 'feature', parent_branch_id: 'b-main', branch_point_asset_id: 'a1', head_asset_id: 'a4', head_version: 4, active: true, description: null, created_at: '2026-05-30T11:00:00Z' },
];
const TXS = [
  { id: 't1', branch_id: 'b-main', kind: 'SNAPSHOT', status: 'COMMITTED', parent_asset_id: null, resulting_asset_id: 'a1', input_payload: {}, actor: 'op', error: null, started_at: '2026-05-30T10:00:00Z', finalized_at: '2026-05-30T10:00:01Z' },
];

describe('Datasets e Branches (UI)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Datasets.list.mockResolvedValue([
      { name: 'estoque', asset_count: 4, head_version: 3, head_asset_id: 'a1', branches: BRANCHES, classification_level: 'confidencial', file_classification: 'restrito', marking_count: 1 },
    ]);
    Datasets.listBranches.mockResolvedValue(BRANCHES);
    Datasets.listTransactions.mockResolvedValue(TXS);
    Datasets.createBranch.mockResolvedValue(BRANCHES[1]);
    Datasets.get.mockResolvedValue({ name: 'estoque', head: { id: 'a1', version: 3, signed_hash: 'h', markings: [], payload_keys: ['sku', 'qtd'] }, branches: BRANCHES });
    Datasets.sample.mockResolvedValue({ name: 'estoque', rows: [{ sku: 'A1', qtd: 5 }], row_count: 4 });
    Datasets.beginTransaction.mockResolvedValue({ id: 'tx-new', kind: 'APPEND', status: 'OPEN', branch_id: 'b-main', parent_asset_id: 'a1', resulting_asset_id: null, input_payload: {}, actor: 'op', error: null, started_at: '2026-05-31T00:00:00Z', finalized_at: null });
    Datasets.commitTransaction.mockResolvedValue({ id: 'tx-new', kind: 'APPEND', status: 'COMMITTED', branch_id: 'b-main', parent_asset_id: 'a1', resulting_asset_id: 'a5', input_payload: {}, actor: 'op', error: null, started_at: '2026-05-31T00:00:00Z', finalized_at: '2026-05-31T00:00:01Z' });
    Datasets.getClassification.mockResolvedValue({ data_classification: 'confidencial', file_classification: 'restrito' });
    Datasets.setClassification.mockResolvedValue({ data_classification: 'sigiloso', file_classification: 'restrito' });
    Datasets.listMarkings.mockResolvedValue([
      { id: 'rm1', marking_id: 'mk-pii', marking_slug: 'pii', marking_display_name: 'PII', applied_at: '2026-06-30T00:00:00Z' },
    ]);
    Datasets.applyMarking.mockResolvedValue({ id: 'rm2', marking_id: 'mk-caso', marking_slug: 'caso-aurora', marking_display_name: 'Caso Aurora', applied_at: '2026-06-30T01:00:00Z' });
    Datasets.removeMarking.mockResolvedValue(undefined);
    Markings.list.mockResolvedValue([
      { id: 'mk-pii', tenant_id: 't', slug: 'pii', display_name: 'PII', description: null, category_id: null, active: true, created_at: '' },
      { id: 'mk-caso', tenant_id: 't', slug: 'caso-aurora', display_name: 'Caso Aurora', description: null, category_id: null, active: true, created_at: '' },
    ]);
    confirmModal.mockResolvedValue(true);
  });

  it('lista datasets e abre um (mostra branches + transações)', async () => {
    render(<DatasetsPage />);
    fireEvent.click(await screen.findByTestId('ds-item-estoque'));
    expect(await screen.findByTestId('ds-detail')).toBeInTheDocument();
    expect(screen.getByTestId('ds-branch-main')).toBeInTheDocument();
    expect(screen.getByTestId('ds-branch-feature')).toBeInTheDocument();
    expect(screen.getByTestId('ds-tx-list')).toHaveTextContent('SNAPSHOT');
  });

  it('SF3 — row-builder (APPEND): campos vêm de payload_keys; commit gera {rows} sem JSON cru', async () => {
    render(<DatasetsPage />);
    fireEvent.click(await screen.findByTestId('ds-item-estoque'));
    fireEvent.click(await screen.findByTestId('ds-new-tx'));
    fireEvent.change(await screen.findByTestId('ds-tx-kind'), { target: { value: 'APPEND' } });
    // sem <textarea> JSON no caminho de inserir dado
    expect(screen.queryByTestId('ds-tx-payload')).not.toBeInTheDocument();
    // os campos do row-builder vêm das colunas do HEAD (payload_keys)
    const cell = await screen.findByTestId('ds-rb-cell-0-sku');
    expect(screen.getByTestId('ds-rb-cell-0-qtd')).toBeInTheDocument();
    fireEvent.change(cell, { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('ds-tx-commit'));
    await waitFor(() => expect(Datasets.beginTransaction).toHaveBeenCalledWith('estoque', 'APPEND', 'main'));
    // célula qtd vazia é omitida → linha limpa {sku:'X'}
    await waitFor(() => expect(Datasets.commitTransaction).toHaveBeenCalledWith('estoque', 'tx-new', { rows: [{ sku: 'X' }] }));
  });

  it('SF3 — SNAPSHOT embrulha as linhas em {payload:{rows}}', async () => {
    render(<DatasetsPage />);
    fireEvent.click(await screen.findByTestId('ds-item-estoque'));
    fireEvent.click(await screen.findByTestId('ds-new-tx'));
    // SNAPSHOT é o kind default
    fireEvent.change(await screen.findByTestId('ds-rb-cell-0-sku'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('ds-rb-cell-0-qtd'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('ds-tx-commit'));
    await waitFor(() => expect(Datasets.commitTransaction).toHaveBeenCalledWith('estoque', 'tx-new', { payload: { rows: [{ sku: 'A', qtd: '10' }] } }));
  });

  it('SF3 — UPDATE/DELETE seguem no editor JSON avançado e validam JSON inválido', async () => {
    render(<DatasetsPage />);
    fireEvent.click(await screen.findByTestId('ds-item-estoque'));
    fireEvent.click(await screen.findByTestId('ds-new-tx'));
    fireEvent.change(await screen.findByTestId('ds-tx-kind'), { target: { value: 'UPDATE' } });
    const ta = await screen.findByTestId('ds-tx-payload'); // JSON volta no caminho avançado
    fireEvent.change(ta, { target: { value: '{ not json' } });
    fireEvent.click(screen.getByTestId('ds-tx-commit'));
    await screen.findByText(/JSON inválido/i);
    expect(Datasets.beginTransaction).not.toHaveBeenCalled();
  });

  it('SF4 — inspetor mostra grade (sample) + schema (payload_keys) em ≤2 cliques, sem DAG', async () => {
    render(<DatasetsPage />);
    fireEvent.click(await screen.findByTestId('ds-item-estoque')); // 1 clique → grade visível
    const grid = await screen.findByTestId('ds-content-grid');
    await waitFor(() => expect(grid).toHaveTextContent('A1')); // valor real de linha da amostra
    expect(grid).toHaveTextContent('5');
    const schema = screen.getByTestId('ds-content-schema');
    expect(schema).toHaveTextContent('sku');
    expect(schema).toHaveTextContent('qtd');
  });

  it('classificação: mostra níveis do head e aplica novo nível (invariante client-side)', async () => {
    render(<DatasetsPage />);
    fireEvent.click(await screen.findByTestId('ds-item-estoque'));
    await screen.findByTestId('ds-classification');
    // espera o head classificado popular os selects (cls resolveu)
    await waitFor(() => expect(screen.getByTestId('ds-cls-data')).toHaveValue('confidencial'));
    expect(screen.getByTestId('ds-cls-file')).toHaveValue('restrito');
    // data=publico < file=restrito → invariante bloqueia o Aplicar
    fireEvent.change(screen.getByTestId('ds-cls-data'), { target: { value: 'publico' } });
    expect(await screen.findByTestId('ds-cls-invariant')).toBeInTheDocument();
    expect(screen.getByTestId('ds-cls-apply')).toBeDisabled();
    // data=sigiloso ≥ file=restrito → válido → aplica
    fireEvent.change(screen.getByTestId('ds-cls-data'), { target: { value: 'sigiloso' } });
    fireEvent.click(screen.getByTestId('ds-cls-apply'));
    await waitFor(() => expect(Datasets.setClassification).toHaveBeenCalledWith('estoque', { data_classification: 'sigiloso', file_classification: 'restrito' }));
  });

  it('Acervo (b): badge de classificação + contagem de marcações por linha', async () => {
    render(<DatasetsPage />);
    const badge = await screen.findByTestId('ds-item-cls-estoque');
    expect(badge).toHaveTextContent(/confidencial/i); // rótulo humano, nunca slug cru
    expect(screen.getByTestId('ds-item-marks-estoque')).toHaveTextContent('1');
  });

  it('Acervo (b): chip de governança filtra a lista por nível de verdade', async () => {
    Datasets.list.mockResolvedValue([
      { name: 'estoque', asset_count: 4, head_version: 3, head_asset_id: 'a1', branches: BRANCHES, classification_level: 'confidencial', file_classification: 'restrito', marking_count: 1 },
      { name: 'aberto', asset_count: 1, head_version: 1, head_asset_id: 'a9', branches: [], classification_level: 'publico', file_classification: 'publico', marking_count: 0 },
    ]);
    render(<DatasetsPage />);
    await screen.findByTestId('ds-item-estoque');
    expect(screen.getByTestId('ds-item-aberto')).toBeInTheDocument();
    // filtra por 'confidencial' → 'aberto' (publico) some
    fireEvent.click(screen.getByTestId('ds-gov-chip-confidencial'));
    await waitFor(() => expect(screen.queryByTestId('ds-item-aberto')).not.toBeInTheDocument());
    expect(screen.getByTestId('ds-item-estoque')).toBeInTheDocument();
    // re-clicar limpa o filtro → 'aberto' volta
    fireEvent.click(screen.getByTestId('ds-gov-chip-confidencial'));
    expect(await screen.findByTestId('ds-item-aberto')).toBeInTheDocument();
  });

  it('marcações: lista aplicadas + aplica via dropdown (sem texto livre) → applyMarking', async () => {
    render(<DatasetsPage />);
    fireEvent.click(await screen.findByTestId('ds-item-estoque'));
    // aplicada (pii) renderiza como pill
    expect(await screen.findByTestId('ds-marcacoes-list')).toBeInTheDocument();
    expect(screen.getByTestId('property-marking-pii')).toBeInTheDocument();
    // aplicar é por dropdown (nunca slug digitado); pii já aplicada some das opções
    const pick = screen.getByTestId('ds-marcacoes-pick') as HTMLSelectElement;
    expect([...pick.options].some((o) => o.value === 'mk-pii')).toBe(false);
    fireEvent.change(pick, { target: { value: 'mk-caso' } });
    fireEvent.click(screen.getByTestId('ds-marcacoes-apply'));
    await waitFor(() => expect(Datasets.applyMarking).toHaveBeenCalledWith('estoque', 'mk-caso'));
  });

  it('marcações: remover passa por confirmModal (não nativo) → removeMarking', async () => {
    render(<DatasetsPage />);
    fireEvent.click(await screen.findByTestId('ds-item-estoque'));
    fireEvent.click(await screen.findByTestId('ds-marcacoes-remove-pii'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    expect(confirmModal.mock.calls[0][0]).toMatchObject({ tone: 'danger' });
    await waitFor(() => expect(Datasets.removeMarking).toHaveBeenCalledWith('estoque', 'mk-pii'));
  });

  it('merge 3-way: conflito → escolhe versão por caminho → resolve', async () => {
    Datasets.mergeThreeWay
      .mockResolvedValueOnce({
        status: 'conflict',
        conflicts: [{ path: 'rows/0/qtd', base: 10, source: { op: 'replace', from: 10, to: 20 }, target: { op: 'replace', from: 10, to: 30 } }],
        base_asset_id: 'a1', source_head_id: 'a4', target_head_id: 'a3',
      })
      .mockResolvedValueOnce({ status: 'merged', target_head: 'a6', resolved: ['rows/0/qtd'] });
    render(<DatasetsPage />);
    fireEvent.click(await screen.findByTestId('ds-item-estoque'));
    fireEvent.click(await screen.findByTestId('ds-merge-open'));
    fireEvent.change(await screen.findByTestId('ds-merge-source'), { target: { value: 'feature' } });
    fireEvent.click(screen.getByTestId('ds-merge-run'));
    // 1ª tentativa → conflito renderizado
    expect(await screen.findByTestId('ds-conflict-0')).toBeInTheDocument();
    await waitFor(() => expect(Datasets.mergeThreeWay).toHaveBeenNthCalledWith(1, 'estoque', 'feature', 'main', {}));
    // escolhe a versão de origem e resolve
    fireEvent.click(screen.getByTestId('ds-conflict-0-source'));
    fireEvent.click(screen.getByTestId('ds-merge-resolve'));
    await waitFor(() =>
      expect(Datasets.mergeThreeWay).toHaveBeenNthCalledWith(2, 'estoque', 'feature', 'main', { 'rows/0/qtd': 'source' }),
    );
  });
});
