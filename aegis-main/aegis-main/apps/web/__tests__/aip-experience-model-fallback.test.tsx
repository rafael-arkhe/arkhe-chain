/**
 * W7 (GAP G) — o editor de experiência do AIP exibe o modelo efetivo por
 * codinome AIP e, quando aipModelLabel() vier vazio (serviço interno), cai num
 * placeholder NEUTRO ('—'). NUNCA o slug cru de vendor.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { AipExperienceEditor } from '@/components/pages-editor/aip-experience-editor';
import type { AipExperienceConfig } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    AipExperience: {
      get: jest.fn(),
      save: jest.fn(),
      toolsAvailable: jest.fn(),
    },
  };
});
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
  useI18n: () => ({ locale: 'pt-BR', setLocale: jest.fn(), t: (k: string) => k }),
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: () => true,
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
}));

const { AipExperience } = jest.requireMock('@/lib/api') as {
  AipExperience: { get: jest.Mock; save: jest.Mock; toolsAvailable: jest.Mock };
};

function cfg(default_model: string | null): AipExperienceConfig {
  return {
    tone_default: '',
    persona_overlay: '',
    temperature: 0.2,
    greeting: '',
    suggestions: [],
    allowed_tools_default: [],
    capabilities_default: [],
    default_model,
    default_model_provider: null,
    default_model_source: null,
    tone_presets: [],
    configured: false,
  };
}

const page = {} as never;

describe('GAP G — modelo do AIP nunca exibe slug cru', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AipExperience.toolsAvailable.mockResolvedValue({ count: 0, tools: [] });
  });

  it('serviço interno (aipModelLabel vazio) → placeholder neutro, nunca o slug', async () => {
    AipExperience.get.mockResolvedValue(cfg('rag.federation.v1'));
    render(<AipExperienceEditor page={page} />);
    const chip = await screen.findByTestId('aip-experience-model');
    expect(chip).toHaveTextContent('—');
    expect(chip.textContent).not.toContain('rag.federation');
    expect(chip.textContent).not.toContain('rag.');
  });

  it('modelo proprietário ocidental → codinome AIP, nunca o slug/vendor', async () => {
    AipExperience.get.mockResolvedValue(cfg('openai/gpt-4o'));
    render(<AipExperienceEditor page={page} />);
    const chip = await screen.findByTestId('aip-experience-model');
    expect(chip).toHaveTextContent('AIP-Diplomata-4');
    expect(chip.textContent).not.toContain('gpt-4o');
    expect(chip.textContent).not.toContain('openai');
  });
});
