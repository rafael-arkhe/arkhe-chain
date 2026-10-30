/**
 * DynamicRefSelect modo RICO (rich) — combobox com busca + contexto por opção:
 * tipos de objeto mostram nº de instâncias; propriedades mostram o tipo.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { DynamicRefSelect } from '@/components/ui/param-ref-select';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api', () => ({
  Ontology: {
    listNodeTypes: jest.fn().mockResolvedValue([
      { name: 'InstagramPerfil', label: 'Perfil do Instagram', count: 12 },
      { name: 'Hashtag', label: 'Hashtag', count: 0 },
    ]),
    objectTypeSchema: jest.fn().mockResolvedValue({
      properties: [
        { key: 'bio', type: 'string', label: 'Bio', is_title: false },
        { key: 'seguidores', type: 'number', label: 'Seguidores', is_title: false },
      ],
      links: [],
      actions: [],
    }),
  },
  Sources: { list: jest.fn().mockResolvedValue([]) },
  Datasets: { list: jest.fn().mockResolvedValue([]) },
  Markings: { list: jest.fn().mockResolvedValue([]) },
  Projects: { list: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/components/solution-designer/proposed-types-context', () => ({
  useProposedTypes: () => [],
  mergeObjectTypeOptions: (existing: unknown[]) => existing,
}));

// Espera as opções carregarem (botão deixa de estar disabled) e abre o combobox.
const openCombobox = async (testid: string) => {
  const trigger = () => screen.getByTestId(testid).querySelector('button') as HTMLButtonElement;
  await waitFor(() => expect(trigger()).not.toBeDisabled());
  fireEvent.click(trigger());
};

it('object_types rico: opção mostra o nº de instâncias como contexto', async () => {
  render(<DynamicRefSelect source="object_types" value="" onChange={jest.fn()} testid="ref" rich />);
  await openCombobox('ref');
  const opt = await screen.findByTestId('ref-option-InstagramPerfil');
  expect(opt).toHaveTextContent('Perfil do Instagram');
  expect(opt).toHaveTextContent('12'); // contexto: nº de instâncias
});

it('object_types rico: escolher uma opção chama onChange com o value', async () => {
  const onChange = jest.fn();
  render(<DynamicRefSelect source="object_types" value="" onChange={onChange} testid="ref" rich />);
  await openCombobox('ref');
  fireEvent.click(await screen.findByTestId('ref-option-InstagramPerfil'));
  expect(onChange).toHaveBeenCalledWith('InstagramPerfil');
});

it('properties rico: opção mostra o TIPO da propriedade como contexto', async () => {
  render(
    <DynamicRefSelect source="properties" dependsOnValue="InstagramPerfil" value="" onChange={jest.fn()} testid="prop" rich />,
  );
  await openCombobox('prop');
  const opt = await screen.findByTestId('prop-option-bio');
  expect(opt).toHaveTextContent('Bio');
  expect(opt).toHaveTextContent('string'); // contexto: tipo da propriedade
});
