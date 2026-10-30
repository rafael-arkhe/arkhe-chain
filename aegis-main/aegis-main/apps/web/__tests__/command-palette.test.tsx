import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommandPalette } from '@/components/shell/command-palette';
import { useCommandPalette } from '@/lib/store';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

// SHELL HONESTO (2026-06-12): a paleta busca objetos REAIS via
// Entities.list — o corpus fabricado MOCK_OBJECTS morreu.
const mockList = jest.fn();
jest.mock('@/lib/api', () => ({
  Entities: { list: (...args: unknown[]) => mockList(...args) },
}));

const ENTITY = {
  id: 'pes-001',
  name: 'CARLOS ROBERTO SILVA',
  entity_type: 'pessoa',
  properties: {},
  classification: 'confidencial',
  signed_hash: null,
  version: 1,
  created_by: 'op',
  created_at: '2026-06-12T00:00:00-03:00',
  updated_at: null,
};

describe('CommandPalette', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockList.mockReset();
    useCommandPalette.setState({ open: false });
  });

  it('abre via atalho de teclado ⌘K', () => {
    render(<CommandPalette />);
    expect(screen.queryByTestId('command-palette')).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
    });
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
  });

  it('busca objetos no backend REAL (Entities.list) quando há termo', async () => {
    mockList.mockResolvedValue([ENTITY]);
    useCommandPalette.setState({ open: true });
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText(/buscar comando/i);
    fireEvent.change(input, { target: { value: 'carlos' } });
    expect(await screen.findByText(/CARLOS ROBERTO SILVA/)).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'carlos' }),
    );
  });

  it('offline: NENHUM objeto fabricado aparece — só rotas', async () => {
    mockList.mockRejectedValue(new Error('offline'));
    useCommandPalette.setState({ open: true });
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText(/buscar comando/i);
    fireEvent.change(input, { target: { value: 'carlos' } });
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.queryByText(/CARLOS ROBERTO SILVA/)).toBeNull();
  });

  it('sem termo: não consulta o backend nem lista objetos', () => {
    useCommandPalette.setState({ open: true });
    render(<CommandPalette />);
    expect(mockList).not.toHaveBeenCalled();
    expect(screen.queryByText(/Abrir ficha/)).toBeNull();
  });

  it('navega ao apertar Enter no item selecionado', () => {
    useCommandPalette.setState({ open: true });
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText(/buscar comando/i);
    fireEvent.change(input, { target: { value: 'geo' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockPush).toHaveBeenCalled();
  });

  it('fecha ao apertar ESC', () => {
    useCommandPalette.setState({ open: true });
    render(<CommandPalette />);
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });
});
