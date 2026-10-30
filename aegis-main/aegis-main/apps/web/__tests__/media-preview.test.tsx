/**
 * MediaPreview — painel de preview inline de item de MediaSet.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MediaPreview } from '@/components/dados/media-preview';

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
}));
jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/api', () => ({
  MediaSets: {
    contentUrl: (id: string, opts?: { download?: boolean }) =>
      `/api/platform/v23/media/items/${id}/content${opts?.download ? '?download=1' : ''}`,
    itemUsage: jest.fn().mockResolvedValue([]),
  },
}));
const { MediaSets } = jest.requireMock('@/lib/api') as { MediaSets: { itemUsage: jest.Mock } };

const ITEM = { id: 'i1', media_set_id: 's1', filename: 'foto.jpg', content_type: 'image/jpeg', size_bytes: 2048, uri: 's3://bucket/foto.jpg', folder_path: '/casos/2026', meta: {}, created_at: '2026-06-30T12:00:00Z' };
const DOC_ITEM = { id: 'i2', media_set_id: 's1', filename: 'laudo.pdf', content_type: 'application/pdf', size_bytes: 4096, uri: '', folder_path: '/', meta: {}, created_at: '2026-06-30T12:00:00Z' };

describe('MediaPreview', () => {
  it('renderiza header com nome do arquivo', () => {
    render(<MediaPreview item={ITEM} />);
    expect(screen.getByTestId('md-preview')).toHaveTextContent('foto.jpg');
  });

  it('mostra metadados do item (inclui a PASTA do Drive)', () => {
    render(<MediaPreview item={ITEM} />);
    expect(screen.getAllByText('foto.jpg').length).toBeGreaterThan(0);
    expect(screen.getByText('image/jpeg')).toBeInTheDocument();
    expect(screen.getByText('/casos/2026')).toBeInTheDocument();
    // o browser NUNCA ve a uri interna s3:// — o link abre o endpoint de conteudo
    expect(screen.getByTestId('md-preview-uri')).toHaveAttribute('href', '/api/platform/v23/media/items/i1/content');
  });

  it('renderiza ícone para arquivo sem preview', () => {
    render(<MediaPreview item={DOC_ITEM} />);
    expect(screen.getByTestId('md-preview-area')).toBeInTheDocument();
    expect(screen.getAllByText('laudo.pdf').length).toBeGreaterThan(0);
  });

  it('mostra área de ações', () => {
    render(<MediaPreview item={ITEM} />);
    expect(screen.getByTestId('md-preview-actions')).toHaveTextContent('media.actions');
  });

  it('frente 4: lista os boards que USAM o arquivo com deep-link pro canvas', async () => {
    MediaSets.itemUsage.mockResolvedValue([
      { id: 'b1', slug: 'ingest', display_name: 'Ingestão diária', last_run_status: 'OK', roles: ['reads'] },
      { id: 'b2', slug: 'export', display_name: 'Exporta CSV', last_run_status: null, roles: ['writes'] },
    ]);
    render(<MediaPreview item={ITEM} />);
    await waitFor(() => expect(MediaSets.itemUsage).toHaveBeenCalledWith('i1'));
    const b1 = await screen.findByTestId('md-usage-b1');
    expect(b1).toHaveTextContent('Ingestão diária');
    expect(b1).toHaveAttribute('href', '/painel-de-controle/dados?aba=pipelines&board=b1');
    expect(screen.getByTestId('md-usage-b2')).toHaveTextContent('media.drive.roleWrites');
  });

  it('frente 4: sem uso mostra estado vazio', async () => {
    MediaSets.itemUsage.mockResolvedValue([]);
    render(<MediaPreview item={ITEM} />);
    expect(await screen.findByTestId('md-usage-none')).toBeInTheDocument();
  });
});
