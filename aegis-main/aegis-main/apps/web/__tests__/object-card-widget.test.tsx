/**
 * Sprint L7 — Object Card widget (testes diretos do componente).
 */
import { render, screen } from '@testing-library/react';

import { ObjectCard } from '@/components/workshop/widgets/object-card';

const personObj = {
  id: 'ON-2026-00042',
  urn: 'aegis://node/Person/ON-2026-00042',
  kind: 'Person',
  display_name: 'João da Silva',
  cpf: '123.456.789-09',
  cidade: 'São Paulo',
};

// Mock minimal WidgetRenderProps shape.
type RP = Parameters<typeof ObjectCard>[0];
function renderCard(config: Record<string, unknown>, variables: Record<string, unknown>) {
  const props = { config, variables, app: null, widget: null } as unknown as RP;
  return render(<ObjectCard {...props} />);
}

describe('object_card widget — Sprint L7', () => {
  it('renders empty state when source is not configured', () => {
    renderCard({}, {});
    expect(screen.getByTestId('object-card-empty')).toBeInTheDocument();
  });

  it('renders card with display_name + kind + props', () => {
    renderCard({ source: 'alvo', show_link: true }, { alvo: personObj });
    expect(screen.getByTestId('object-card')).toBeInTheDocument();
    expect(screen.getByText('João da Silva')).toBeInTheDocument();
    expect(screen.getByText(/Person · aegis:\/\/node\/Person/)).toBeInTheDocument();
    expect(screen.getByText('cpf')).toBeInTheDocument();
    expect(screen.getByText('123.456.789-09')).toBeInTheDocument();
  });

  it('resolves link template with object props', () => {
    renderCard(
      {
        source: 'alvo',
        show_link: true,
        link_template: '/ficha/{{id}}',
        link_label: 'Ver ficha',
      },
      { alvo: personObj },
    );
    const link = screen.getByTestId('object-card-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/ficha/ON-2026-00042');
    expect(link).toHaveTextContent('Ver ficha');
  });

  it('hides link when show_link=false', () => {
    renderCard(
      { source: 'alvo', show_link: false },
      { alvo: personObj },
    );
    expect(screen.queryByTestId('object-card-link')).not.toBeInTheDocument();
  });

  it('respects explicit props array to constrain visible fields', () => {
    const big: Record<string, unknown> = { ...personObj };
    for (let i = 0; i < 20; i++) big[`extra_${i}`] = `v${i}`;
    renderCard(
      { source: 'big', props: ['extra_0', 'extra_1', 'extra_2'] },
      { big },
    );
    const dts = screen.getAllByText(/^extra_/);
    expect(dts.length).toBe(3);
  });

  // Regressão (review Onda 4): o campo `props` era 'string' antes da migração p/
  // FieldKind 'property'. Apps salvos podem ter `props` como string CSV — não pode
  // estourar `.filter` no render; deve normalizar p/ lista.
  it('normaliza props legado salvo como string CSV sem quebrar o render', () => {
    expect(() =>
      renderCard({ source: 'alvo', props: 'cpf, cidade' }, { alvo: personObj }),
    ).not.toThrow();
    expect(screen.getByTestId('object-card')).toBeInTheDocument();
    expect(screen.getByText('cpf')).toBeInTheDocument();
    expect(screen.getByText('cidade')).toBeInTheDocument();
  });
});
