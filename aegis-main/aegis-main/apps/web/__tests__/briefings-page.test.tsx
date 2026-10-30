/**
 * /briefings — APRESENTAÇÃO de Document (T3-D). Unificado com /relatorios sobre o
 * MESMO NotepadDoc: lista documentos, apresenta o selecionado, Modo A/B/C com
 * EFEITO REAL (filtra seções), Transmitir via guest-token, Apresentar full-bleed.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/components/shell/page-shell', () => ({
  PageShell: ({ toolbar, children }: { toolbar?: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <div data-testid="ps-toolbar">{toolbar}</div>
      {children}
    </div>
  ),
}));
jest.mock('@/components/ui/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('@/lib/api', () => ({
  Notepad: { list: jest.fn(), transmit: jest.fn() },
}));

import BriefingsPage from '@/app/briefings/page';

const { Notepad } = jest.requireMock('@/lib/api') as { Notepad: Record<string, jest.Mock> };

const DOC = {
  id: 'd1',
  slug: 'brief-1',
  title: 'Briefing Operacional',
  body_md: '',
  sections: [
    { id: 's1', heading: 'Síntese', kind: 'narrative', generated: { body: 'Resumo da IA aqui.', citations: ['PES-1'] } },
    { id: 's2', heading: 'Notas', kind: 'markdown', body: '# Detalhe\nTexto operacional manual.' },
  ],
  markings: [],
  classification_level: 'confidencial',
  version: 3,
  pinned: false,
  signed: true,
  signed_hash: 'h',
  signed_at: null,
  signed_by: null,
  project_id: null,
  created_at: null,
  updated_at: null,
};

describe('Briefings (apresentação de Document · T3-D)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notepad.list.mockResolvedValue([DOC]);
    Notepad.transmit.mockResolvedValue({
      token: 'guest_x',
      link: 'http://x/m/guest_x',
      expires_at: '2026-07-06T00:00:00Z',
    });
  });

  it('lista documentos e apresenta o selecionado (título + seções)', async () => {
    render(<BriefingsPage />);
    fireEvent.click(await screen.findByTestId('briefings-item-d1'));
    const doc = await screen.findByTestId('briefings-doc');
    expect(doc).toHaveTextContent('Briefing Operacional');
    // modo default = operacional → narrativa + markdown visíveis
    expect(doc).toHaveTextContent('Resumo da IA aqui.');
    expect(doc).toHaveTextContent('Texto operacional manual.');
  });

  it('Modo Resumo mostra só narrativas (efeito REAL, não cosmético)', async () => {
    render(<BriefingsPage />);
    fireEvent.click(await screen.findByTestId('briefings-item-d1'));
    await screen.findByTestId('briefings-doc');
    fireEvent.click(screen.getByTestId('briefings-modo-resumo'));
    await waitFor(() => {
      const doc = screen.getByTestId('briefings-doc');
      expect(doc).toHaveTextContent('Resumo da IA aqui.'); // narrativa fica
      expect(doc).not.toHaveTextContent('Texto operacional manual.'); // markdown some
    });
  });

  it('Transmitir chama Notepad.transmit (guest-token /m)', async () => {
    render(<BriefingsPage />);
    fireEvent.click(await screen.findByTestId('briefings-item-d1'));
    await screen.findByTestId('briefings-doc');
    fireEvent.click(screen.getByTestId('briefings-transmit'));
    await waitFor(() =>
      expect(Notepad.transmit).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ link_base: expect.any(String) }),
      ),
    );
  });

  it('Apresentar abre o full-bleed e Sair fecha', async () => {
    render(<BriefingsPage />);
    fireEvent.click(await screen.findByTestId('briefings-item-d1'));
    await screen.findByTestId('briefings-doc');
    fireEvent.click(screen.getByTestId('briefings-present'));
    expect(await screen.findByTestId('briefings-presentation')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('briefings-present-exit'));
    await waitFor(() =>
      expect(screen.queryByTestId('briefings-presentation')).not.toBeInTheDocument(),
    );
  });
});
