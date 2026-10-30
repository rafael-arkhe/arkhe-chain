/**
 * P5 — toolbar "Ações" da /ficha populada do contrato (type_def.actions).
 *
 * Antes era um botão desabilitado ("em breve"). Agora lista as ações do Object
 * Type e leva o operador à seção "Ações" (aba `acoes`) — decoupled via
 * CustomEvent `ficha:goto-tab`. Genérico/multidomínio.
 *
 * Cobertura:
 *  1. schema com ações → menu lista os nomes; clicar emite goto-tab(acoes).
 *  2. schema sem ações → mensagem vazia honesta.
 *  3. sem schema → busca objectTypeSchema(entity_type) (caminho Entity).
 */
import * as React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  Ontology: { objectTypeSchema: jest.fn() },
}));

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
}));

import { FichaAcoesMenu } from '@/components/ficha/acoes-menu';
import { Ontology } from '@/lib/api';
import { FICHA_GOTO_TAB_EVENT } from '@/lib/ficha/type-actions';

const objectTypeSchema = Ontology.objectTypeSchema as jest.Mock;

beforeEach(() => objectTypeSchema.mockReset());

describe('FichaAcoesMenu — toolbar populada do type_def', () => {
  it('schema com ações → lista nomes; clicar emite goto-tab(acoes)', () => {
    const events: string[] = [];
    const onGoto = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab;
      if (tab) events.push(tab);
    };
    window.addEventListener(FICHA_GOTO_TAB_EVENT, onGoto);

    render(
      <FichaAcoesMenu
        entityType="imovel"
        schema={
          {
            kind: 'imovel',
            display_name: 'Imóvel',
            title_property: 'nome',
            count: 0,
            properties: [],
            links: [],
            actions: [
              { name: 'Arquivar', rule: 'custom', parameters: [] },
              { name: 'Notificar', rule: 'custom', parameters: [] },
            ],
          } as unknown as Parameters<typeof FichaAcoesMenu>[0]['schema']
        }
      />,
    );

    fireEvent.click(screen.getByTestId('ficha-acoes-menu-trigger'));
    const items = screen.getAllByTestId('ficha-acoes-menu-item');
    expect(items).toHaveLength(2);
    expect(screen.getByText('Arquivar')).toBeInTheDocument();
    expect(screen.getByText('Notificar')).toBeInTheDocument();

    // objectTypeSchema NÃO é chamado quando o schema já veio (canônico).
    expect(objectTypeSchema).not.toHaveBeenCalled();

    fireEvent.click(items[0]);
    expect(events).toEqual(['acoes']);
    window.removeEventListener(FICHA_GOTO_TAB_EVENT, onGoto);
  });

  it('schema sem ações → mensagem vazia honesta', () => {
    render(
      <FichaAcoesMenu
        entityType="imovel"
        schema={
          { actions: [] } as unknown as Parameters<typeof FichaAcoesMenu>[0]['schema']
        }
      />,
    );
    fireEvent.click(screen.getByTestId('ficha-acoes-menu-trigger'));
    expect(screen.getByTestId('ficha-acoes-menu-empty')).toBeInTheDocument();
  });

  it('sem schema → busca objectTypeSchema(entity_type) (Entity)', async () => {
    objectTypeSchema.mockResolvedValue({
      actions: [{ name: 'Vistoriar', rule: 'custom', parameters: [] }],
    });
    await act(async () => {
      render(<FichaAcoesMenu entityType="imovel" />);
    });
    expect(objectTypeSchema).toHaveBeenCalledWith('imovel');
    fireEvent.click(screen.getByTestId('ficha-acoes-menu-trigger'));
    expect(await screen.findByText('Vistoriar')).toBeInTheDocument();
  });
});
