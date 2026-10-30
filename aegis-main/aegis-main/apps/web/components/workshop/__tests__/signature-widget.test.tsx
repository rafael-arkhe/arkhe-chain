/**
 * #3 — widget de Assinatura: imagem (quando aplicada) + linha "assinado por /
 * cargo / data". Presentational (sem ontologia).
 */
import { render, screen } from '@testing-library/react';

import '@/components/workshop/widgets';
import { getWidgetComponent } from '@/components/workshop/WorkshopV2Renderer';

function renderWidget(config: Record<string, unknown>) {
  const C = getWidgetComponent('signature')!;
  return render(
    <C appId="document" config={config} variables={{}} bindings={{}} setBinding={() => {}} />,
  );
}

describe('signature widget', () => {
  it('está registrado', () => {
    expect(getWidgetComponent('signature')).toBeTruthy();
  });

  it('mostra assinado por / cargo / data', () => {
    renderWidget({ signed_by: 'A. Ferreira', role: 'Supervisor', show_date: true, date: '29/06/2026' });
    expect(screen.getByText('A. Ferreira')).toBeInTheDocument();
    expect(screen.getByText('Supervisor')).toBeInTheDocument();
    expect(screen.getByText('29/06/2026')).toBeInTheDocument();
  });

  it('esconde a data quando show_date=false', () => {
    renderWidget({ signed_by: 'X', show_date: false, date: '29/06/2026' });
    expect(screen.queryByText('29/06/2026')).not.toBeInTheDocument();
  });

  it('renderiza a imagem da assinatura quando há url', () => {
    renderWidget({ signed_by: 'X', url: '/api/platform/v23/notepad/d1/media?key=k' });
    const img = screen.getByAltText('Assinatura') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toContain('/media?key=');
  });
});
