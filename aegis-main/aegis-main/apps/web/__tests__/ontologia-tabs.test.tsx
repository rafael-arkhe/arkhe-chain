/**
 * OntologiaTabs — barra de abas compartilhada do explorador de Ontologia
 * (Fase 3 da consolidação de IA). Une Tipos · Instâncias · Grafo · Vizinhança +
 * Editar (Avançado) numa superfície coesa; cada aba ROTEIA (Link) mantendo ?cp=1.
 * O highlight ativo vem do usePathname.
 */
import { render, screen } from '@testing-library/react';
import { OntologiaTabs } from '@/components/ontologia/ontologia-tabs';

let mockPath = '/ontologia/tipos';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe('OntologiaTabs (Fase 3 IA — explorador único)', () => {
  it('renderiza as 5 abas do explorador, roteando com ?cp=1 (Editar = avançado)', () => {
    mockPath = '/ontologia/tipos';
    render(<OntologiaTabs />);
    const bar = screen.getByTestId('ontologia-tabs');
    expect(bar).toBeInTheDocument();

    const tipos = screen.getByTestId('ont-tab-tipos');
    const instancias = screen.getByTestId('ont-tab-instancias');
    const grafo = screen.getByTestId('ont-tab-grafo');
    const vizinhanca = screen.getByTestId('ont-tab-vizinhanca');
    const editar = screen.getByTestId('ont-tab-tipos-editor');

    expect(tipos).toHaveAttribute('href', '/ontologia/tipos?cp=1');
    expect(instancias).toHaveAttribute('href', '/ontologia/instancias?cp=1');
    expect(grafo).toHaveAttribute('href', '/ontologia/grafo?cp=1');
    expect(vizinhanca).toHaveAttribute('href', '/ontologia/vizinhanca?cp=1');
    // Editar (Ontology Manager) é o modo Avançado — vive no /painel-de-controle.
    expect(editar).toHaveAttribute('href', '/painel-de-controle/tipos-editor');
    expect(editar).toHaveTextContent('avançado');
  });

  it('marca a aba ativa via pathname (aria-current="page")', () => {
    mockPath = '/ontologia/grafo';
    render(<OntologiaTabs />);
    expect(screen.getByTestId('ont-tab-grafo')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('ont-tab-tipos')).not.toHaveAttribute('aria-current');
  });

  it('a aba Editar acende no editor avançado', () => {
    mockPath = '/painel-de-controle/tipos-editor';
    render(<OntologiaTabs />);
    expect(screen.getByTestId('ont-tab-tipos-editor')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('ont-tab-tipos')).not.toHaveAttribute('aria-current');
  });
});
