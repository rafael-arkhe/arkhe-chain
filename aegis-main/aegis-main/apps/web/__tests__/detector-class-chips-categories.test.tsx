/**
 * Taxonomia OPERACIONAL das classes do detector (2026-06-11).
 *
 * Feedback do operador: "urso de pelúcia denigre a imagem do AEGIS" — o
 * dropdown agrupa por categoria operacional (cabeçalhos na ORDEM do backend);
 * grupos advanced (interiores/alimentos/pelúcia) ficam COLAPSADOS sob
 * "Outros (uso avançado)" e NUNCA aparecem em primeiro plano. A busca
 * continua varrendo TUDO — buscar 'urso' acha o urso de pelúcia.
 *
 * Cobre:
 *  (a) cabeçalhos de categoria renderizam na ordem do backend; grupo advanced
 *      NÃO aparece por padrão;
 *  (b) advanced colapsado por default (pelúcia/rosquinha invisíveis) e
 *      expande no clique do toggle;
 *  (c) busca atravessa grupos: 'urso' acha Urso (animais) E Urso de pelúcia
 *      (advanced, mesmo colapsado);
 *  (d) Enter pega o 1º match VISÍVEL na ordem dos grupos;
 *  (e) submit continua CSV canônico (names em inglês);
 *  (f) backend SEM categories (resposta antiga) → lista plana, zero cabeçalho
 *      e zero toggle (aditivo de verdade).
 *
 * Mock: '@/lib/api/cctv' (o componente é renderizado direto — a integração
 * SchemaForm↔chips já é certificada em schema-form-detector-classes.test).
 */
import * as React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

import { DetectorClassChips } from '@/components/ui/detector-class-chips';

jest.mock('@/lib/api/cctv', () => ({
  Cctv: { detector: { classes: jest.fn() } },
}));

const { Cctv } = jest.requireMock('@/lib/api/cctv') as {
  Cctv: { detector: { classes: jest.Mock } };
};

// Shape ADITIVO real de GET /api/v1/cctv/detector/classes.
const RESPONSE = {
  classes: [
    { name: 'person', label: 'Pessoa', category: 'pessoas' },
    { name: 'car', label: 'Carro', category: 'mobilidade' },
    { name: 'truck', label: 'Caminhão', category: 'mobilidade' },
    { name: 'bear', label: 'Urso', category: 'animais' },
    { name: 'knife', label: 'Faca', category: 'objetos_de_atencao' },
    { name: 'teddy bear', label: 'Urso de pelúcia', category: 'interiores_e_objetos' },
    { name: 'donut', label: 'Rosquinha', category: 'interiores_e_objetos' },
  ],
  categories: [
    { key: 'pessoas', label: 'Pessoas', advanced: false },
    { key: 'mobilidade', label: 'Mobilidade', advanced: false },
    { key: 'animais', label: 'Animais', advanced: false },
    { key: 'objetos_de_atencao', label: 'Objetos de atenção', advanced: false },
    { key: 'interiores_e_objetos', label: 'Interiores e objetos', advanced: true },
  ],
};

const TID = 'chips';

function Harness({ spy, initial = '' }: { spy: jest.Mock; initial?: string }) {
  const [value, setValue] = React.useState(initial);
  return (
    <DetectorClassChips
      value={value}
      onChange={(csv) => {
        setValue(csv);
        spy(csv);
      }}
      testid={TID}
    />
  );
}

async function openSearch() {
  const input = (await screen.findByTestId(`${TID}-search`)) as HTMLInputElement;
  fireEvent.focus(input);
  return input;
}

describe('DetectorClassChips — taxonomia operacional (grupos + advanced colapsado)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Cctv.detector.classes.mockResolvedValue(RESPONSE);
  });

  it('(a) cabeçalhos de categoria na ORDEM do backend; advanced fora do default', async () => {
    render(<Harness spy={jest.fn()} />);
    await waitFor(() => expect(Cctv.detector.classes).toHaveBeenCalled());
    await openSearch();
    const dropdown = await screen.findByTestId(`${TID}-dropdown`);
    const headers = within(dropdown)
      .getAllByTestId(new RegExp(`^${TID}-group-`))
      .map((el) => el.getAttribute('data-testid'));
    // ordem EXATA do backend — e nenhum cabeçalho advanced em primeiro plano
    expect(headers).toEqual([
      `${TID}-group-pessoas`,
      `${TID}-group-mobilidade`,
      `${TID}-group-animais`,
      `${TID}-group-objetos_de_atencao`,
    ]);
    expect(within(dropdown).getByTestId(`${TID}-group-pessoas`)).toHaveTextContent('Pessoas');
    expect(within(dropdown).getByTestId(`${TID}-group-mobilidade`)).toHaveTextContent('Mobilidade');
  });

  it('(b) advanced COLAPSADO por default (pelúcia/rosquinha invisíveis) e expande no clique', async () => {
    render(<Harness spy={jest.fn()} />);
    await openSearch();
    await screen.findByTestId(`${TID}-option-person`);
    // conteúdo doméstico/infantil NUNCA em primeiro plano
    expect(screen.queryByTestId(`${TID}-option-teddy bear`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-option-donut`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-group-interiores_e_objetos`)).toBeNull();
    // toggle "Outros (uso avançado)" presente — expande no clique
    const toggle = screen.getByTestId(`${TID}-advanced-toggle`);
    expect(toggle).toHaveTextContent('Outros (uso avançado)');
    fireEvent.click(toggle);
    expect(await screen.findByTestId(`${TID}-group-interiores_e_objetos`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TID}-option-teddy bear`)).toHaveTextContent('Urso de pelúcia');
    expect(screen.getByTestId(`${TID}-option-donut`)).toBeInTheDocument();
  });

  it("(c) busca atravessa grupos: 'urso' acha Urso (animais) E Urso de pelúcia (advanced colapsado)", async () => {
    render(<Harness spy={jest.fn()} />);
    const input = await openSearch();
    await screen.findByTestId(`${TID}-option-person`);
    fireEvent.change(input, { target: { value: 'urso' } });
    expect(await screen.findByTestId(`${TID}-option-bear`)).toHaveTextContent('Urso');
    expect(screen.getByTestId(`${TID}-option-teddy bear`)).toHaveTextContent('Urso de pelúcia');
    // grupos sem match somem; cabeçalhos dos grupos com match permanecem
    expect(screen.queryByTestId(`${TID}-option-car`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-group-mobilidade`)).toBeNull();
    expect(screen.getByTestId(`${TID}-group-animais`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TID}-group-interiores_e_objetos`)).toBeInTheDocument();
  });

  it('(d) Enter pega o 1º match VISÍVEL na ordem dos grupos', async () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    const input = await openSearch();
    await screen.findByTestId(`${TID}-option-person`);
    fireEvent.change(input, { target: { value: 'urso' } });
    await screen.findByTestId(`${TID}-option-bear`);
    fireEvent.keyDown(input, { key: 'Enter' });
    // 'bear' (animais) vem ANTES de 'teddy bear' (advanced) na ordem dos grupos
    expect(spy).toHaveBeenLastCalledWith('bear');
  });

  it('(e) submit continua CSV canônico (names em inglês, ordem de adição)', async () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    const input = await openSearch();
    fireEvent.click(await screen.findByTestId(`${TID}-option-car`));
    expect(spy).toHaveBeenLastCalledWith('car');
    // adicionar classe advanced via BUSCA (caminho legítimo p/ pelúcia)
    fireEvent.change(input, { target: { value: 'pelúcia' } });
    fireEvent.click(await screen.findByTestId(`${TID}-option-teddy bear`));
    expect(spy).toHaveBeenLastCalledWith('car,teddy bear');
    expect(screen.getByTestId(`${TID}-chip-teddy bear`)).toHaveTextContent('Urso de pelúcia');
  });

  it('(f) resposta ANTIGA (sem categories) → lista plana, zero cabeçalho/toggle', async () => {
    Cctv.detector.classes.mockResolvedValue({
      classes: [
        { name: 'person', label: 'Pessoa' },
        { name: 'car', label: 'Carro' },
      ],
    });
    render(<Harness spy={jest.fn()} />);
    await openSearch();
    expect(await screen.findByTestId(`${TID}-option-person`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TID}-option-car`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${TID}-advanced-toggle`)).toBeNull();
    const dropdown = screen.getByTestId(`${TID}-dropdown`);
    expect(
      within(dropdown).queryAllByTestId(new RegExp(`^${TID}-group-`)),
    ).toHaveLength(0);
  });
});
