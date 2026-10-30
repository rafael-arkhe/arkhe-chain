/**
 * W7 (GAP H) — ModelSelect é o seletor OPERADOR (usado por ModelDefaultsCard).
 * TODO modelo aparece por CODINOME AIP — abertos (soberanos) E proprietários
 * ocidentais. O nome de vendor cru (display_name) e o slug NUNCA chegam à tela.
 *
 * Decisão documentada: a marca real só permanece no CATÁLOGO ADMIN
 * (components/dados/modelos-workspace), que NÃO usa este componente. Por isso
 * este teste cobre só o seletor operador.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { ModelSelect } from '@/components/aip/model-select';
import type { AipCatalogModel } from '@/lib/api';

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
  useI18n: () => ({ locale: 'pt-BR', setLocale: jest.fn(), t: (k: string) => k }),
}));

// SearchableSelect (combobox rico) → lista simples dos rótulos das opções,
// para inspecionar exatamente o que o operador veria como NOME de cada modelo.
jest.mock('@/components/ui/searchable-select', () => ({
  SearchableSelect: ({ options, placeholder }: any) => (
    <div data-testid="select-mock">
      <span data-testid="select-placeholder">{placeholder}</span>
      <ul>
        {options.map((o: any) => (
          <li key={o.value} data-testid="select-option-label">
            {o.label}
          </li>
        ))}
      </ul>
    </div>
  ),
}));

const PROPRIETARY: AipCatalogModel = {
  id: 'openai/gpt-4o',
  label: 'GPT-4o',
  display_name: 'OpenAI: GPT-4o',
  provider: 'openai',
  capabilities: ['tool_use'],
  context_window: 128000,
  source: 'preset',
  description: null,
  model_slug: 'openai/gpt-4o',
  pricing: null,
};

const SOVEREIGN: AipCatalogModel = {
  id: 'deepseek/deepseek-r1',
  label: 'DeepSeek R1',
  display_name: 'DeepSeek R1',
  provider: 'openrouter',
  capabilities: ['reasoning'],
  context_window: 65536,
  source: 'preset',
  description: null,
  model_slug: 'deepseek/deepseek-r1',
  pricing: null,
};

describe('GAP H — seletor operador exibe TODO modelo por codinome AIP', () => {
  it('proprietário ocidental → codinome, nunca o nome de vendor nem o slug', () => {
    const { container } = render(
      <ModelSelect models={[PROPRIETARY]} value="" onPick={jest.fn()} testId="sel" />,
    );
    expect(screen.getByText('AIP-Diplomata-4')).toBeInTheDocument();
    expect(screen.queryByText('GPT-4o')).not.toBeInTheDocument();
    expect(screen.queryByText('OpenAI: GPT-4o')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('gpt-4o');
    expect(container.textContent?.toLowerCase()).not.toContain('openai');
  });

  it('soberano (AIP Cloud) também por codinome', () => {
    render(<ModelSelect models={[SOVEREIGN]} value="" onPick={jest.fn()} testId="sel" />);
    expect(screen.getByText('AIP-Lume-Reflexao')).toBeInTheDocument();
    expect(screen.queryByText('DeepSeek R1')).not.toBeInTheDocument();
  });
});
