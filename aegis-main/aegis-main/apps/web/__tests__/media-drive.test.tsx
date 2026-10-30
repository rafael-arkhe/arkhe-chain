/**
 * MediaDrive — o contrato "Google Drive" da aba Arquivos (frente 2):
 * pastas (tiles + navegação + breadcrumb) · + Novo (nova pasta / enviar) ·
 * upload IMEDIATO com tray · renomear/mover/excluir via menu "..." ·
 * grade/lista + ordenação · busca tenant-wide · lightbox (preview grande).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MediaWorkspace } from '@/components/dados/media-workspace';

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => jest.fn().mockResolvedValue(true),
  promptModal: jest.fn(),
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
    search: jest.fn(), update: jest.fn(), itemUsage: jest.fn(),
    contentUrl: jest.fn((id: string) => `/api/platform/v23/media/items/${id}/content`),
  },
}));
const { MediaSets } = jest.requireMock('@/lib/api') as { MediaSets: Record<string, jest.Mock> };
const { promptModal } = jest.requireMock('@/components/dialog/confirm-dialog') as { promptModal: jest.Mock };

const SET1 = {
  id: 's1', slug: 'provas', display_name: 'Provas', media_type: 'mixed', bucket: null,
  item_count: 3, total_bytes: 7168, markings: [], folders: ['/operacoes', '/operacoes/2026'],
  project_id: null, created_at: '2026-05-31T00:00:00Z',
};
const SET2 = {
  id: 's2', slug: 'arquivo-morto', display_name: 'Arquivo morto', media_type: 'mixed', bucket: null,
  item_count: 0, total_bytes: 0, markings: [], folders: ['/antigos'],
  project_id: null, created_at: '2026-05-31T00:00:00Z',
};
const I_RAIZ = { id: 'i1', media_set_id: 's1', filename: 'boletim.txt', content_type: 'text/plain', size_bytes: 1024, uri: 's3://x/1', folder_path: '/', meta: { uploaded_by: 'admin' }, created_at: '2026-06-01T00:00:00Z' };
const I_RAIZ2 = { id: 'i2', media_set_id: 's1', filename: 'ata.txt', content_type: 'text/plain', size_bytes: 4096, uri: 's3://x/2', folder_path: '/', meta: {}, created_at: '2026-06-02T00:00:00Z' };
const I_PASTA = { id: 'i3', media_set_id: 's1', filename: 'laudo-interno.pdf', content_type: 'application/pdf', size_bytes: 2048, uri: 's3://x/3', folder_path: '/operacoes', meta: {}, created_at: '2026-06-03T00:00:00Z' };

async function openSet() {
  render(<MediaWorkspace />);
  fireEvent.click(await screen.findByTestId('md-item-provas'));
  await screen.findByTestId('md-toolbar');
  await screen.findByTestId('md-grid');
}

describe('MediaDrive (aba Arquivos = Drive)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MediaSets.list.mockResolvedValue([SET1, SET2]);
    MediaSets.listItems.mockResolvedValue([I_RAIZ, I_RAIZ2, I_PASTA]);
    MediaSets.createFolder.mockResolvedValue({ ...SET1, folders: [...SET1.folders, '/nova'] });
    MediaSets.renameFolder.mockResolvedValue(SET1);
    MediaSets.removeFolder.mockResolvedValue({ status: 'deleted', removed_items: 1 });
    MediaSets.updateItem.mockResolvedValue(I_RAIZ);
    MediaSets.removeItem.mockResolvedValue({ status: 'deleted' });
    MediaSets.uploadItem.mockResolvedValue(I_RAIZ);
    MediaSets.search.mockResolvedValue([]);
    MediaSets.itemUsage.mockResolvedValue([]);
    promptModal.mockResolvedValue(null);
  });

  it('raiz mostra pastas de 1º nível + só os arquivos da raiz', async () => {
    await openSet();
    // pasta declarada de 1º nível vira tile; a subpasta NÃO aparece na raiz
    expect(screen.getByTestId('md-folder-operacoes')).toBeInTheDocument();
    expect(screen.queryByTestId('md-folder-2026')).not.toBeInTheDocument();
    // arquivos: só folder_path === '/'
    expect(screen.getByTestId('md-card-i1')).toBeInTheDocument();
    expect(screen.queryByTestId('md-card-i3')).not.toBeInTheDocument();
  });

  it('duplo-clique entra na pasta (breadcrumb + filtro); crumb raiz volta', async () => {
    await openSet();
    fireEvent.doubleClick(screen.getByTestId('md-folder-operacoes'));
    expect(screen.getByTestId('md-crumb-0')).toHaveTextContent('operacoes');
    expect(screen.getByTestId('md-folder-2026')).toBeInTheDocument();
    expect(screen.getByTestId('md-card-i3')).toBeInTheDocument();
    expect(screen.queryByTestId('md-card-i1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('md-crumb-root'));
    expect(screen.queryByTestId('md-crumb-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('md-card-i1')).toBeInTheDocument();
  });

  it('+ Novo → Nova pasta cria NA pasta atual via promptModal', async () => {
    promptModal.mockResolvedValue('DNA');
    await openSet();
    fireEvent.doubleClick(screen.getByTestId('md-folder-operacoes'));
    fireEvent.click(screen.getByTestId('md-new'));
    fireEvent.click(await screen.findByTestId('md-new-folder'));
    await waitFor(() => expect(MediaSets.createFolder).toHaveBeenCalledWith('s1', '/operacoes/DNA'));
  });

  it('+ Novo → Enviar arquivos: upload IMEDIATO na pasta atual + tray', async () => {
    await openSet();
    fireEvent.doubleClick(screen.getByTestId('md-folder-operacoes'));
    const input = screen.getByTestId('md-upload-input') as HTMLInputElement;
    const file = new File(['dados'], 'novo.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    await waitFor(() =>
      expect(MediaSets.uploadItem).toHaveBeenCalledWith('s1', file, { folder: '/operacoes' }),
    );
    expect(screen.getByTestId('md-upload-tray')).toBeInTheDocument();
    expect(screen.getByTestId('md-upload-tray')).toHaveTextContent('novo.txt');
  });

  it('menu "..." renomeia item via promptModal', async () => {
    promptModal.mockResolvedValue('boletim-final.txt');
    await openSet();
    fireEvent.click(screen.getByTestId('md-menu-i1'));
    fireEvent.click(await screen.findByTestId('md-menu-rename'));
    await waitFor(() =>
      expect(MediaSets.updateItem).toHaveBeenCalledWith('i1', { filename: 'boletim-final.txt' }),
    );
  });

  it('menu "..." → Mover abre diálogo com dropdowns reais e move', async () => {
    await openSet();
    fireEvent.click(screen.getByTestId('md-menu-i1'));
    fireEvent.click(await screen.findByTestId('md-menu-move'));
    const dlg = await screen.findByTestId('md-move-dialog');
    fireEvent.change(within(dlg).getByTestId('md-move-set'), { target: { value: 's2' } });
    fireEvent.change(within(dlg).getByTestId('md-move-folder'), { target: { value: '/antigos' } });
    fireEvent.click(within(dlg).getByTestId('md-move-ok'));
    await waitFor(() =>
      expect(MediaSets.updateItem).toHaveBeenCalledWith('i1', { media_set_id: 's2', folder_path: '/antigos' }),
    );
  });

  it('menu "..." exclui item após confirmação', async () => {
    await openSet();
    fireEvent.click(screen.getByTestId('md-menu-i1'));
    fireEvent.click(await screen.findByTestId('md-menu-delete'));
    await waitFor(() => expect(MediaSets.removeItem).toHaveBeenCalledWith('i1'));
  });

  it('menu da pasta renomeia (cascata no backend) e exclui', async () => {
    promptModal.mockResolvedValue('missoes');
    await openSet();
    fireEvent.click(screen.getByTestId('md-fmenu-operacoes'));
    fireEvent.click(await screen.findByTestId('md-fmenu-rename'));
    await waitFor(() =>
      expect(MediaSets.renameFolder).toHaveBeenCalledWith('s1', '/operacoes', '/missoes'),
    );
    fireEvent.click(screen.getByTestId('md-fmenu-operacoes'));
    fireEvent.click(await screen.findByTestId('md-fmenu-delete'));
    await waitFor(() => expect(MediaSets.removeFolder).toHaveBeenCalledWith('s1', '/operacoes'));
  });

  it('lista: colunas + ordenação por nome invertível', async () => {
    await openSet();
    fireEvent.click(screen.getByTestId('md-view-list'));
    const rows = () => screen.getAllByTestId(/^md-row-/).map((el) => el.getAttribute('data-testid'));
    // nome asc: ata.txt (i2) antes de boletim.txt (i1)
    expect(rows()).toEqual(['md-row-i2', 'md-row-i1']);
    fireEvent.click(screen.getByTestId('md-sort-name'));
    expect(rows()).toEqual(['md-row-i1', 'md-row-i2']);
    fireEvent.click(screen.getByTestId('md-sort-size'));
    expect(rows()).toEqual(['md-row-i1', 'md-row-i2']); // 1024 < 4096 asc
  });

  it('busca tenant-wide → resultados navegam até a pasta do item', async () => {
    MediaSets.search.mockResolvedValue([
      { ...I_PASTA, set_slug: 'provas', set_name: 'Provas' },
    ]);
    await openSet();
    fireEvent.change(screen.getByTestId('md-search'), { target: { value: 'laudo' } });
    await waitFor(() => expect(MediaSets.search).toHaveBeenCalledWith('laudo'), { timeout: 2000 });
    const hit = await screen.findByTestId('md-hit-i3');
    expect(hit).toHaveTextContent('laudo-interno.pdf');
    expect(hit).toHaveTextContent('Provas');
    fireEvent.click(hit);
    // navegou: breadcrumb na pasta do item, busca limpa
    expect(screen.getByTestId('md-crumb-0')).toHaveTextContent('operacoes');
    expect((screen.getByTestId('md-search') as HTMLInputElement).value).toBe('');
  });

  it('duplo-clique no arquivo abre o lightbox; ESC fecha; → navega', async () => {
    await openSet();
    fireEvent.doubleClick(screen.getByTestId('md-card-i2'));
    expect(screen.getByTestId('md-lightbox')).toBeInTheDocument();
    expect(screen.getByTestId('md-lb-name')).toHaveTextContent('ata.txt');
    // ordem por nome asc: ata(i2) → boletim(i1); ArrowRight navega
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByTestId('md-lb-name')).toHaveTextContent('boletim.txt');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('md-lightbox')).not.toBeInTheDocument();
  });

  it('pasta vazia mostra estado vazio com orientação', async () => {
    MediaSets.listItems.mockResolvedValue([]);
    MediaSets.list.mockResolvedValue([{ ...SET1, folders: [] }, SET2]);
    await new Promise((r) => setTimeout(r, 0));
    render(<MediaWorkspace />);
    fireEvent.click(await screen.findByTestId('md-item-provas'));
    await screen.findByTestId('md-toolbar');
    expect(await screen.findByTestId('md-grid-empty')).toHaveTextContent('Pasta vazia');
  });
});
