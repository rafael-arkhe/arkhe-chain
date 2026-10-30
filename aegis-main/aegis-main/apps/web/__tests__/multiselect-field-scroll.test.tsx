/**
 * ELO POPOVERS — MultiselectField (/buscar) rola a lista de sites SEM fechar.
 *
 * Antes: o popover do multiselect ouvia `scroll` (capture) e fechava no scroll
 * INTERNO da própria lista — impossível escolher num catálogo longo. Agora usa
 * o primitivo FloatingPopover: scroll DENTRO mantém aberto; scroll fora apenas
 * reposiciona; ESC/clique-fora fecham.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { MultiselectField } from '@/components/buscar/multiselect-field';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

jest.mock('@/lib/buscar/use-site-catalog', () => ({
  useSiteCatalog: () => ({
    categories: [],
    sites: [
      { id: 'github', label: 'GitHub' },
      { id: 'gitlab', label: 'GitLab' },
      { id: 'bitbucket', label: 'Bitbucket' },
    ],
    loading: false,
    error: null,
  }),
}));

function renderField(value = '') {
  const onChange = jest.fn();
  render(
    <MultiselectField
      name="test"
      label="Sites"
      catalog="maigret"
      value={value}
      onChange={onChange}
    />,
  );
  return { onChange };
}

test('abre o popover e lista as opções', () => {
  renderField();
  expect(screen.queryByTestId('buscar-campo-test-pop')).toBeNull();
  fireEvent.click(screen.getByTestId('buscar-campo-test'));
  expect(screen.getByTestId('buscar-campo-test-pop')).toBeInTheDocument();
  expect(screen.getByTestId('buscar-campo-test-opt-github')).toBeInTheDocument();
});

test('ELO popovers: rolar a lista de sites NÃO fecha o popover', () => {
  renderField();
  fireEvent.click(screen.getByTestId('buscar-campo-test'));
  const options = screen.getByTestId('buscar-campo-test-options');
  // scroll DENTRO da lista (target dentro do popover) → mantém aberto.
  fireEvent.scroll(options);
  expect(screen.getByTestId('buscar-campo-test-pop')).toBeInTheDocument();
  // scroll de ancestral (window) → reposiciona, NÃO fecha.
  fireEvent.scroll(window);
  expect(screen.getByTestId('buscar-campo-test-pop')).toBeInTheDocument();
});

test('o corpo rolável tem overflow + o container tem max-height', () => {
  renderField();
  fireEvent.click(screen.getByTestId('buscar-campo-test'));
  const pop = screen.getByTestId('buscar-campo-test-pop');
  expect(pop.style.maxHeight).toMatch(/vh|px/);
  const options = screen.getByTestId('buscar-campo-test-options');
  expect(options.className).toMatch(/overflow-y-auto/);
});

test('ESC e clique-fora fecham', () => {
  renderField();
  fireEvent.click(screen.getByTestId('buscar-campo-test'));
  expect(screen.getByTestId('buscar-campo-test-pop')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByTestId('buscar-campo-test-pop')).toBeNull();
  // reabre e fecha por clique fora.
  fireEvent.click(screen.getByTestId('buscar-campo-test'));
  expect(screen.getByTestId('buscar-campo-test-pop')).toBeInTheDocument();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByTestId('buscar-campo-test-pop')).toBeNull();
});

test('marcar opção emite o CSV dos ids selecionados', () => {
  const { onChange } = renderField();
  fireEvent.click(screen.getByTestId('buscar-campo-test'));
  fireEvent.click(screen.getByTestId('buscar-campo-test-opt-gitlab'));
  expect(onChange).toHaveBeenCalledWith('gitlab');
});
