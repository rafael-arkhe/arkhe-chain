/**
 * Wave G.3 — PDF Viewer widget tests (2026-05-23).
 */
import { render, screen } from '@testing-library/react';

import { PdfViewer } from '@/components/workshop/widgets/pdf-viewer';

type RP = Parameters<typeof PdfViewer>[0];

function renderPV(
  config: Record<string, unknown>,
  variables: Record<string, unknown> = {},
) {
  const props = {
    config,
    variables,
    bindings: {},
    appId: 'test-app',
    setBinding: jest.fn(),
    emit: jest.fn(),
  } as unknown as RP;
  return render(<PdfViewer {...props} />);
}

describe('pdf_viewer widget — Wave G.3', () => {
  it('mostra placeholder quando source vazio', () => {
    renderPV({});
    expect(screen.getByTestId('pdf-viewer-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer-iframe')).not.toBeInTheDocument();
  });

  it('renderiza iframe quando source é URL direta', () => {
    renderPV({ source: 'https://example.com/doc.pdf' });
    const iframe = screen.getByTestId('pdf-viewer-iframe') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('src')).toMatch(
      /^https:\/\/example\.com\/doc\.pdf#page=1&toolbar=1$/,
    );
  });

  it('resolve source a partir de variable', () => {
    renderPV(
      { source: 'docref', page_default: 3 },
      { docref: 'https://example.com/v.pdf' },
    );
    const iframe = screen.getByTestId('pdf-viewer-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(
      'https://example.com/v.pdf#page=3&toolbar=1',
    );
  });

  it('show_toolbar=false zera o flag toolbar no fragmento', () => {
    renderPV({
      source: 'https://example.com/doc.pdf',
      show_toolbar: false,
    });
    const iframe = screen.getByTestId('pdf-viewer-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(
      'https://example.com/doc.pdf#page=1&toolbar=0',
    );
  });

  it('download_enabled=false esconde botão abrir e força toolbar=0', () => {
    renderPV({
      source: 'https://example.com/doc.pdf',
      title: 'Relatório',
      download_enabled: false,
    });
    expect(screen.queryByTestId('pdf-viewer-open')).not.toBeInTheDocument();
    const iframe = screen.getByTestId('pdf-viewer-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toMatch(/toolbar=0$/);
  });

  it('exibe error state para URL inválida (sem prefixo http/https/data/path)', () => {
    renderPV(
      { source: 'meu_doc' },
      { meu_doc: 'ftp://invalid-protocol/file.pdf' },
    );
    expect(screen.getByTestId('pdf-viewer-error')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer-iframe')).not.toBeInTheDocument();
  });
});
