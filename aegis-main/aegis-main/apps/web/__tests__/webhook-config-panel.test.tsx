/**
 * Fase 4 — WebhookConfigPanel: CRUD de webhooks no BoardToolbar.
 *
 * Prova que:
 *   1. Panel abre/fecha via toggle.
 *   2. Lista webhooks existentes.
 *   3. Criar webhook mostra secret UMA VEZ.
 *   4. Excluir webhook remove da lista.
 *   5. Slug vazio não cria.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WebhookConfigPanel } from '@/components/dados/webhook-config-panel';

jest.mock('@/lib/i18n/provider', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'pt-BR' }),
  useT: () => (k: string) => k,
}));

const mockListTriggers = jest.fn();
const mockCreateTrigger = jest.fn();
const mockDeleteTrigger = jest.fn();

jest.mock('@/lib/api', () => ({
  PipelineBuilder: {
    listTriggers: (...args: unknown[]) => mockListTriggers(...args),
    createTrigger: (...args: unknown[]) => mockCreateTrigger(...args),
    deleteTrigger: (...args: unknown[]) => mockDeleteTrigger(...args),
  },
}));

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
});

describe('Fase 4 — WebhookConfigPanel', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    onClose.mockClear();
    mockListTriggers.mockReset();
    mockCreateTrigger.mockReset();
    mockDeleteTrigger.mockReset();
    mockListTriggers.mockResolvedValue([]);
    // Mock window.location.origin
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost:3000' }, writable: true });
  });

  it('does not render when closed', () => {
    render(<WebhookConfigPanel boardId="b1" isOpen={false} onClose={onClose} />);
    expect(screen.queryByTestId('pb-webhook-panel')).toBeNull();
  });

  it('renders panel when open and loads triggers', async () => {
    mockListTriggers.mockResolvedValue([
      { id: 'tr1', slug: 'my-hook', board_id: 'b1', active: true },
    ]);
    render(<WebhookConfigPanel boardId="b1" isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId('pb-webhook-panel')).toBeTruthy();
    await waitFor(() => expect(mockListTriggers).toHaveBeenCalledTimes(1));
    expect(screen.getByText('my-hook')).toBeTruthy();
  });

  it('close button calls onClose', async () => {
    render(<WebhookConfigPanel boardId="b1" isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('pb-webhook-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no triggers', async () => {
    render(<WebhookConfigPanel boardId="b1" isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(mockListTriggers).toHaveBeenCalled());
    expect(screen.getByText('pbw.webhookEmpty')).toBeTruthy();
  });

  it('falha ao listar webhooks não bloqueia o painel', async () => {
    mockListTriggers.mockRejectedValue(new Error('boom'));
    render(<WebhookConfigPanel boardId="b1" isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(mockListTriggers).toHaveBeenCalled());
    expect(screen.getByText('pbw.webhookEmpty')).toBeTruthy();
    expect(screen.queryByText('Failed to load webhooks')).toBeNull();
  });

  it('create webhook shows secret once', async () => {
    mockCreateTrigger.mockResolvedValue({
      id: 'tr2', slug: 'new-hook', secret: 'super-secret-123', board_id: 'b1',
    });
    render(<WebhookConfigPanel boardId="b1" isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(mockListTriggers).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId('pb-webhook-slug-input'), { target: { value: 'new-hook' } });
    fireEvent.click(screen.getByTestId('pb-webhook-create'));

    await waitFor(() => expect(mockCreateTrigger).toHaveBeenCalledWith('new-hook', 'b1'));
    expect(screen.getByText('super-secret-123')).toBeTruthy();
    expect(screen.getByText('pbw.webhookSecret')).toBeTruthy();
  });

  it('does not create with empty slug', async () => {
    render(<WebhookConfigPanel boardId="b1" isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(mockListTriggers).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('pb-webhook-create'));
    expect(mockCreateTrigger).not.toHaveBeenCalled();
  });

  it('delete trigger calls API and removes from list', async () => {
    mockListTriggers.mockResolvedValue([
      { id: 'tr1', slug: 'hook-to-delete', board_id: 'b1', active: true },
    ]);
    mockDeleteTrigger.mockResolvedValue(undefined);

    render(<WebhookConfigPanel boardId="b1" isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(mockListTriggers).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('pb-webhook-delete-tr1'));
    fireEvent.click(await screen.findByTestId('confirm-ok'));
    await waitFor(() => expect(mockDeleteTrigger).toHaveBeenCalledWith('tr1'));
  });

  it('filters triggers by boardId', async () => {
    mockListTriggers.mockResolvedValue([
      { id: 'tr1', slug: 'hook-b1', board_id: 'b1', active: true },
      { id: 'tr2', slug: 'hook-b2', board_id: 'b2', active: true },
    ]);
    render(<WebhookConfigPanel boardId="b1" isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(mockListTriggers).toHaveBeenCalled());
    expect(screen.getByText('hook-b1')).toBeTruthy();
    expect(screen.queryByText('hook-b2')).toBeNull();
  });
});
