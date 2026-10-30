/**
 * T3-F — widgets-base de editor de documento (callout/divider/quote).
 * Renderiza cada um pelo registry com seu mockConfig (mesmo caminho do
 * MiniWidgetPreview) e confere o conteúdo.
 */
import { render, screen } from '@testing-library/react';

import '@/components/workshop/widgets'; // side-effect: registra todos
import {
  getWidgetComponent,
  getWidgetMeta,
} from '@/components/workshop/WorkshopV2Renderer';

function renderWidget(type: string) {
  const Component = getWidgetComponent(type);
  const meta = getWidgetMeta(type);
  if (!Component) throw new Error(`widget não registrado: ${type}`);
  return render(
    <Component
      appId="test"
      config={(meta?.mockConfig as Record<string, unknown>) ?? {}}
      variables={(meta?.mockVariables as Record<string, unknown>) ?? {}}
      bindings={{}}
      setBinding={() => {}}
    />,
  );
}

describe('widgets-base de documento (T3-F)', () => {
  it('callout: renderiza tom + título + texto', () => {
    renderWidget('callout');
    const el = screen.getByTestId('callout-widget');
    expect(el).toHaveAttribute('data-tone', 'warning');
    expect(el).toHaveTextContent('Atenção');
    expect(el).toHaveTextContent('Informação relevante');
  });

  it('divider: renderiza com rótulo', () => {
    renderWidget('divider');
    expect(screen.getByTestId('divider-widget')).toHaveTextContent('Anexos');
  });

  it('quote: renderiza citação + fonte', () => {
    renderWidget('quote');
    const el = screen.getByTestId('quote-widget');
    expect(el).toHaveTextContent('Clareza para decisões complexas.');
    expect(el).toHaveTextContent('Doutrina operacional');
  });

  it('checklist: renderiza itens com estado (concluído/pendente)', () => {
    renderWidget('checklist');
    const el = screen.getByTestId('checklist-widget');
    expect(el).toHaveTextContent('Coletar fontes');
    expect(el).toHaveTextContent('Validar vínculos');
  });

  it('code_block: renderiza código + rótulo de linguagem', () => {
    renderWidget('code_block');
    const el = screen.getByTestId('code-block-widget');
    expect(el).toHaveTextContent('"status": "ok"');
    expect(el).toHaveTextContent('json');
  });

  it('page_break: renderiza marcador de quebra', () => {
    renderWidget('page_break');
    expect(screen.getByTestId('page-break-widget')).toHaveTextContent('Quebra de página');
  });

  it('figure: renderiza legenda (sem url → placeholder)', () => {
    renderWidget('figure');
    expect(screen.getByTestId('figure-widget')).toHaveTextContent('Figura 1');
  });

  it('os blocos-base têm meta.label e aparecem na palette', () => {
    for (const type of [
      'callout',
      'divider',
      'quote',
      'checklist',
      'code_block',
      'page_break',
      'figure',
    ]) {
      const meta = getWidgetMeta(type);
      expect(meta?.label).toBeTruthy();
    }
  });
});
