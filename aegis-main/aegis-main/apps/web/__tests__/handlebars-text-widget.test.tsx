/**
 * Sprint L7 — Handlebars Text widget.
 */
import { render, screen } from '@testing-library/react';

import { HandlebarsText } from '@/components/workshop/widgets/handlebars-text';

type RP = Parameters<typeof HandlebarsText>[0];

function renderHb(
  config: Record<string, unknown>,
  variables: Record<string, unknown> = {},
  bindings: Record<string, unknown> = {},
) {
  const props = {
    config,
    variables,
    bindings,
    appId: 'test-app',
    setBinding: jest.fn(),
    emit: jest.fn(),
  } as unknown as RP;
  return render(<HandlebarsText {...props} />);
}

describe('handlebars_text widget — Sprint L7', () => {
  it('renders empty state when template is missing', () => {
    renderHb({});
    expect(screen.getByTestId('handlebars-text-empty')).toBeInTheDocument();
  });

  it('interpolates a simple variable', () => {
    renderHb({ template: 'Olá, {{name}}!' }, { name: 'Maria' });
    expect(screen.getByTestId('handlebars-text')).toHaveTextContent(
      'Olá, Maria!',
    );
  });

  it('resolves nested paths from variables', () => {
    renderHb(
      { template: 'Cidade: {{user.cidade}}' },
      { user: { cidade: 'Recife' } },
    );
    expect(screen.getByTestId('handlebars-text')).toHaveTextContent(
      'Cidade: Recife',
    );
  });

  it('renders conditionals via {{#if}}', () => {
    renderHb(
      { template: '{{#if ativo}}Ativo{{else}}Inativo{{/if}}' },
      { ativo: false },
    );
    expect(screen.getByTestId('handlebars-text')).toHaveTextContent('Inativo');
  });

  it('iterates with {{#each}}', () => {
    renderHb(
      { template: '{{#each items}}{{this}};{{/each}}' },
      { items: ['a', 'b', 'c'] },
    );
    expect(screen.getByTestId('handlebars-text')).toHaveTextContent('a;b;c;');
  });

  it('merges variables + bindings (binding wins)', () => {
    renderHb(
      { template: 'X={{x}}' },
      { x: 'from-vars' },
      { x: 'from-bind' },
    );
    expect(screen.getByTestId('handlebars-text')).toHaveTextContent(
      'X=from-bind',
    );
  });

  it('uses configured tag element', () => {
    const { container } = renderHb(
      { template: 'Cabeçalho', tag: 'h3' },
      {},
    );
    expect(container.querySelector('h3')).not.toBeNull();
  });
});
