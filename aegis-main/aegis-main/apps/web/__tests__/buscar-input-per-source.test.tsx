/**
 * FE-B — a Busca avançada renderiza os PARÂMETROS DA FONTE agrupados por fonte
 * e o gate NSFW liga/desliga o catálogo do multiselect.
 *
 * O multiselect chama useSiteCatalog(catalog, {includeNsfw}); mockamos o hook
 * pra CAPTURAR o includeNsfw e provar que ele vem do toggle nsfw IRMÃO da mesma
 * fonte (só liga quando o toggle está '1').
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { BuscarInput } from '@/components/buscar/buscar-input';
import type { PerSourceGroup } from '@/lib/buscar/per-source-fields';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

// Captura as chamadas do hook do multiselect (catalog + includeNsfw).
const catalogCalls: { catalog: string | undefined; includeNsfw: boolean }[] = [];
jest.mock('@/lib/buscar/use-site-catalog', () => ({
  useSiteCatalog: (catalog: string | undefined, opts?: { includeNsfw?: boolean }) => {
    catalogCalls.push({ catalog, includeNsfw: !!opts?.includeNsfw });
    return { categories: [], sites: [], loading: false, error: null };
  },
}));

const GROUPS: PerSourceGroup[] = [
  {
    sourceKey: 'maigret_username@v1',
    sourceLabel: 'Maigret · username',
    toolBase: 'maigret_username',
    fields: [
      {
        key: 'maigret_username__sites',
        tool: 'maigret_username@v1',
        toolBase: 'maigret_username',
        propKey: 'sites',
        ui: { kind: 'multiselect', catalog: 'maigret', labelKey: 'buscar.maigret.sites' },
        catalog: 'maigret',
      },
      {
        key: 'maigret_username__timeout',
        tool: 'maigret_username@v1',
        toolBase: 'maigret_username',
        propKey: 'timeout',
        ui: { kind: 'duration', min: 5, max: 240, unitKey: 'unit.seconds' },
      },
      {
        key: 'maigret_username__nsfw',
        tool: 'maigret_username@v1',
        toolBase: 'maigret_username',
        propKey: 'nsfw',
        ui: { kind: 'toggle', nsfwGated: true },
      },
    ],
  },
];

function renderInput(fields: Record<string, string>, setAdvanced = jest.fn()) {
  render(
    <BuscarInput
      query="alvo"
      setQuery={() => {}}
      totalSelecionado={1}
      onSubmit={() => {}}
      advanced={{ fields, purpose: '', caseId: '' }}
      setAdvanced={setAdvanced}
      refiners={[]}
      perSourceFields={GROUPS}
      purposes={[]}
    />,
  );
  // A Busca avançada abre sozinha quando há campo preenchido (filled>0); só
  // clicamos pra abrir quando ainda está recolhida — assim o teste não fecha
  // uma seção já aberta.
  if (!screen.queryByTestId('buscar-fonte-params')) {
    fireEvent.click(screen.getByTestId('buscar-avancada-toggle'));
  }
  // Progressive disclosure (novo UX): cada fonte começa COLAPSADA — os campos só
  // renderizam após expandir o grupo. Expandimos a maigret para os testes verem
  // multiselect/duration/toggle.
  fireEvent.click(screen.getByTestId('buscar-fonte-toggle-maigret_username@v1'));
  return setAdvanced;
}

beforeEach(() => {
  catalogCalls.length = 0;
});

describe('BuscarInput — seção Parâmetros da fonte', () => {
  it('renderiza a seção agrupada por fonte (título amigável, não tool cru)', () => {
    renderInput({});
    expect(screen.getByTestId('buscar-fonte-params')).toBeInTheDocument();
    const grupo = screen.getByTestId('buscar-fonte-grupo-maigret_username@v1');
    expect(grupo).toHaveTextContent('Maigret · username');
    expect(grupo).not.toHaveTextContent('@v1');
  });

  it('escolhe o componente por ui.kind (multiselect/duration/toggle) com testids namespaced', () => {
    renderInput({});
    expect(screen.getByTestId('buscar-campo-maigret_username__sites')).toBeInTheDocument();
    expect(screen.getByTestId('buscar-campo-maigret_username__timeout')).toBeInTheDocument();
    expect(screen.getByTestId('buscar-campo-maigret_username__nsfw')).toBeInTheDocument();
  });

  it('NSFW desligado → multiselect pede catálogo SEM nsfw', () => {
    renderInput({}); // nsfw ausente = desligado
    const maigret = catalogCalls.filter((c) => c.catalog === 'maigret');
    expect(maigret.length).toBeGreaterThan(0);
    expect(maigret.every((c) => c.includeNsfw === false)).toBe(true);
  });

  it('NSFW ligado (toggle irmão = "1") → multiselect pede catálogo COM nsfw', () => {
    renderInput({ maigret_username__nsfw: '1' });
    const maigret = catalogCalls.filter((c) => c.catalog === 'maigret');
    expect(maigret.some((c) => c.includeNsfw === true)).toBe(true);
  });

  it('toggle nsfw escreve a chave namespaced no estado (setField)', () => {
    const setAdvanced = renderInput({});
    fireEvent.click(screen.getByTestId('buscar-campo-maigret_username__nsfw'));
    expect(setAdvanced).toHaveBeenCalledWith({
      fields: { maigret_username__nsfw: '1' },
    });
  });
});
