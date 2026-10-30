/**
 * Media Sets (UI) — casca da aba Arquivos pós-frente 2 (Drive). Lista
 * conjuntos → abre (Drive: toolbar+breadcrumb+grade) · cria conjunto (slug
 * derivado + media_type) · remove · estado sem seleção.
 * Espelha /platform/v23/media. O contrato do Drive em si vive em
 * media-drive.test.tsx.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaWorkspace as MediaPage } from '@/components/dados/media-workspace';

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => jest.fn().mockResolvedValue(true),
  promptModal: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: () => true,
}));
jest.mock('@/lib/api', () => ({
  MEDIA_TYPES: ['image', 'video', 'audio', 'document', 'mixed'],
  MediaSets: {
    list: jest.fn(), create: jest.fn(), remove: jest.fn(), listItems: jest.fn(),
    uploadItem: jest.fn(), updateItem: jest.fn(), removeItem: jest.fn(),
    createFolder: jest.fn(), renameFolder: jest.fn(), removeFolder: jest.fn(),
    search: jest.fn(), update: jest.fn(), itemUsage: jest.fn().mockResolvedValue([]),
    contentUrl: jest.fn((id: string) => `/api/platform/v23/media/items/${id}/content`),
  },
}));
const { MediaSets } = jest.requireMock('@/lib/api') as { MediaSets: Record<string, jest.Mock> };

const SET = { id: 's1', slug: 'provas', display_name: 'Provas periciais', media_type: 'document', bucket: null, item_count: 1, total_bytes: 2048, markings: [], folders: [], project_id: null, created_at: '2026-05-31T00:00:00Z' };
const ITEM = { id: 'i1', media_set_id: 's1', filename: 'laudo-001.pdf', content_type: 'application/pdf', size_bytes: 2048, uri: 's3://x', folder_path: '/', meta: {}, created_at: '2026-05-31T00:00:00Z' };

describe('Media Sets (UI)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MediaSets.list.mockResolvedValue([SET]);
    MediaSets.listItems.mockResolvedValue([ITEM]);
    MediaSets.create.mockResolvedValue(SET);
  });

  it('sem conjunto selecionado orienta a seleção', async () => {
    render(<MediaPage />);
    await screen.findByTestId('md-item-provas');
    expect(screen.getByText(/Selecione um conjunto/)).toBeInTheDocument();
  });

  it('lista conjuntos e abre um (Drive: toolbar + breadcrumb + grade)', async () => {
    render(<MediaPage />);
    fireEvent.click(await screen.findByTestId('md-item-provas'));
    await waitFor(() => expect(MediaSets.listItems).toHaveBeenCalledWith('s1'));
    expect(screen.getByTestId('md-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('md-crumb-root')).toHaveTextContent('Provas periciais');
    expect(await screen.findByTestId('md-grid')).toBeInTheDocument();
    expect(screen.getByTestId('md-card-i1')).toHaveTextContent('laudo-001.pdf');
  });

  it('cria conjunto via toggle (slug derivado do nome + media_type)', async () => {
    render(<MediaPage />);
    fireEvent.click(await screen.findByTestId('md-create-toggle'));
    fireEvent.change(await screen.findByTestId('md-name'), { target: { value: 'Provas periciais' } });
    fireEvent.change(screen.getByTestId('md-type'), { target: { value: 'document' } });
    fireEvent.click(screen.getByTestId('md-create-btn'));
    await waitFor(() =>
      expect(MediaSets.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'provas-periciais', display_name: 'Provas periciais', media_type: 'document' }),
      ),
    );
  });

  it('remove conjunto', async () => {
    render(<MediaPage />);
    fireEvent.click(await screen.findByTestId('md-item-provas'));
    fireEvent.click(await screen.findByTestId('md-del-provas'));
    await waitFor(() => expect(MediaSets.remove).toHaveBeenCalledWith('s1'));
  });
});
