/**
 * Tarefa A — "Classes de interesse" vira CHIPS multi-select populado com TODAS
 * as classes válidas do detector (dynamic_source='detector_classes' + multi).
 *
 * Regra do operador: "operador jamais vai saber essas classes de cabeça" —
 * campo com busca/autocomplete sobre GET /cctv/detector/classes (label pt-BR
 * visível; NAME canônico no valor), chip adiciona/remove, valor submetido =
 * CSV canônico (contrato do handler GPU intacto). Entrada custom permitida
 * como complemento (modelos fine-tuned) com aviso discreto.
 *
 * Cobre:
 *  (a) carrega as classes do backend e lista TODAS nas sugestões;
 *  (b) busca 'cami' acha Caminhão (label pt-BR; diacrítico-insensível);
 *  (c) adicionar por clique e por Enter → chips com LABEL humano; o valor
 *      que viaja é o CSV canônico 'car,truck';
 *  (d) remover chip pelo X atualiza o CSV;
 *  (e) valor pré-existente (modal Configurar) renderiza os chips — mesmo
 *      SchemaForm, vem de graça;
 *  (f) entrada custom vira chip com o valor cru + aviso discreto;
 *  (g) backend fora → fallback honesto: hint + custom continua fluindo.
 *
 * Mocks: '@/lib/api' (módulos do param-ref-select) + '@/lib/api/cctv'.
 */
import * as React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import { SchemaForm } from '@/components/ui/schema-form';
import type { SkillParam } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  Ontology: { listNodeTypes: jest.fn(), objectTypeSchema: jest.fn() },
  Sources: { list: jest.fn() },
  Datasets: { list: jest.fn() },
  Markings: { list: jest.fn() },
  Projects: { list: jest.fn() },
}));
jest.mock('@/lib/api/cctv', () => ({
  Cctv: { streams: { list: jest.fn() }, detector: { classes: jest.fn() } },
}));

const { Cctv } = jest.requireMock('@/lib/api/cctv') as {
  Cctv: { detector: { classes: jest.Mock } };
};

const CLASSES_PARAM: SkillParam[] = [
  {
    key: 'classes',
    label: 'Classes de interesse',
    param_type: 'string',
    required: false,
    default: '',
    placeholder: 'car,truck,person',
    dynamic_source: 'detector_classes',
    multi: true,
  },
];

// Shape REAL de GET /api/v1/cctv/detector/classes (name canônico + label pt-BR).
const CLASSES = {
  classes: [
    { name: 'person', label: 'Pessoa' },
    { name: 'car', label: 'Carro' },
    { name: 'truck', label: 'Caminhão' },
    { name: 'bus', label: 'Ônibus' },
  ],
};

/** Harness controlado: o SchemaForm é controlado por `values`; aqui o estado
 *  fecha o ciclo (como no form real da central) e o spy grava cada CSV. */
function Harness({
  spy,
  initial = {},
}: {
  spy: jest.Mock;
  initial?: Record<string, unknown>;
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>(initial);
  return (
    <SchemaForm
      params={CLASSES_PARAM}
      values={values}
      onChange={(k, v) => {
        setValues((s) => ({ ...s, [k]: v }));
        spy(k, v);
      }}
      testidPrefix="t"
    />
  );
}

const TID = 't-field-classes';

async function openSearch() {
  const input = (await screen.findByTestId(`${TID}-search`)) as HTMLInputElement;
  fireEvent.focus(input);
  return input;
}

describe('SchemaForm — chips de classes do detector (Tarefa A)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Cctv.detector.classes.mockResolvedValue(CLASSES);
  });

  it('(a) carrega TODAS as classes válidas do backend nas sugestões', async () => {
    render(<Harness spy={jest.fn()} />);
    await waitFor(() => expect(Cctv.detector.classes).toHaveBeenCalled());
    await openSearch();
    for (const c of CLASSES.classes) {
      expect(await screen.findByTestId(`${TID}-option-${c.name}`)).toBeInTheDocument();
    }
  });

  it("(b) busca 'cami' acha Caminhão (label humano; só o match aparece)", async () => {
    render(<Harness spy={jest.fn()} />);
    const input = await openSearch();
    await screen.findByTestId(`${TID}-option-person`);
    fireEvent.change(input, { target: { value: 'cami' } });
    const opt = await screen.findByTestId(`${TID}-option-truck`);
    expect(opt).toHaveTextContent('Caminhão');
    expect(screen.queryByTestId(`${TID}-option-car`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-option-person`)).toBeNull();
  });

  it("(c) clique e Enter adicionam chips com LABEL humano; valor = CSV canônico 'car,truck'", async () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    const input = await openSearch();
    // clique adiciona 'car'
    fireEvent.click(await screen.findByTestId(`${TID}-option-car`));
    expect(spy).toHaveBeenLastCalledWith('classes', 'car');
    const chipCar = await screen.findByTestId(`${TID}-chip-car`);
    expect(chipCar).toHaveTextContent('Carro');
    // Enter adiciona o 1º match da busca ('cami' → truck)
    fireEvent.change(input, { target: { value: 'cami' } });
    await screen.findByTestId(`${TID}-option-truck`);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).toHaveBeenLastCalledWith('classes', 'car,truck');
    expect(await screen.findByTestId(`${TID}-chip-truck`)).toHaveTextContent('Caminhão');
  });

  it('(d) X remove o chip e o CSV encolhe', async () => {
    const spy = jest.fn();
    render(<Harness spy={spy} initial={{ classes: 'car,truck' }} />);
    await screen.findByTestId(`${TID}-chip-car`);
    fireEvent.click(screen.getByTestId(`${TID}-chip-truck-remove`));
    expect(spy).toHaveBeenLastCalledWith('classes', 'car');
    await waitFor(() =>
      expect(screen.queryByTestId(`${TID}-chip-truck`)).toBeNull(),
    );
  });

  it('(e) valor pré-existente (modal Configurar) renderiza os chips com label humano', async () => {
    render(<Harness spy={jest.fn()} initial={{ classes: 'car,bus' }} />);
    expect(await screen.findByTestId(`${TID}-chip-car`)).toHaveTextContent('Carro');
    expect(await screen.findByTestId(`${TID}-chip-bus`)).toHaveTextContent('Ônibus');
  });

  it('(f) entrada custom vira chip com o valor CRU + aviso discreto (fine-tuned)', async () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    const input = await openSearch();
    await screen.findByTestId(`${TID}-option-person`);
    fireEvent.change(input, { target: { value: 'capacete-obra' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).toHaveBeenLastCalledWith('classes', 'capacete-obra');
    expect(await screen.findByTestId(`${TID}-chip-capacete-obra`)).toHaveTextContent(
      'capacete-obra',
    );
    // aviso discreto: classe fora do catálogo do detector
    expect(screen.getByTestId(`${TID}-custom-hint`)).toBeInTheDocument();
  });

  it('(g) backend fora → fallback honesto: hint + custom continua fluindo', async () => {
    Cctv.detector.classes.mockRejectedValue(new Error('503'));
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    expect(await screen.findByTestId(`${TID}-hint`)).toBeInTheDocument();
    const input = screen.getByTestId(`${TID}-search`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'car' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).toHaveBeenLastCalledWith('classes', 'car');
    expect(await screen.findByTestId(`${TID}-chip-car`)).toBeInTheDocument();
  });
});
