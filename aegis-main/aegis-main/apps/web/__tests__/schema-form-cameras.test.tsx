/**
 * Tarefa B — dynamic_source='cameras' no form dirigido por param_schema.
 *
 * Regra do produto: operador NUNCA digita identificador — sempre seletor
 * populado. O param 'camera' do camera.stream declara dynamic_source='cameras'
 * e o DynamicRefSelect popula o dropdown via Cctv.streams.list() (label = nome
 * da câmera; value = id do stream).
 *
 * Cobre:
 *  - select populado com as câmeras mockadas; escolher envia o ID (não o nome);
 *  - fallback HONESTO quando o backend de câmeras está fora: input livre com
 *    hint (o valor digitado continua fluindo pro onChange);
 *  - fonte desconhecida (forward-compat) não explode: select vazio.
 *
 * Mocks: '@/lib/api' (módulos do param-ref-select) + '@/lib/api/cctv' (Cctv).
 */
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
  Cctv: { streams: { list: jest.fn() } },
}));

const { Cctv } = jest.requireMock('@/lib/api/cctv') as {
  Cctv: { streams: { list: jest.Mock } };
};

const CAMERA_PARAM: SkillParam[] = [
  {
    key: 'camera',
    label: 'Câmera',
    param_type: 'string',
    required: true,
    placeholder: 'id, URL ou nome da câmera',
    dynamic_source: 'cameras',
  },
];

const STREAMS = [
  { id: 'cam-1', name: 'Portaria Norte', url: 'rtsp://a/1', status: 'online' },
  { id: 'cam-2', name: 'Garagem', url: 'rtsp://a/2', status: 'offline' },
];

describe('SchemaForm — dynamic_source=cameras (Tarefa B)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('popula o select via Cctv.streams.list (label = nome; value = id)', async () => {
    Cctv.streams.list.mockResolvedValueOnce(STREAMS);
    render(
      <SchemaForm params={CAMERA_PARAM} values={{}} onChange={jest.fn()} testidPrefix="t" />,
    );
    await waitFor(() => {
      const sel = screen.getByTestId('t-field-camera') as HTMLSelectElement;
      expect(sel.tagName).toBe('SELECT');
      expect(sel.disabled).toBe(false);
    });
    const sel = screen.getByTestId('t-field-camera') as HTMLSelectElement;
    const byText = Array.from(sel.options).map((o) => o.text);
    const byValue = Array.from(sel.options).map((o) => o.value);
    expect(byText).toContain('Portaria Norte');
    expect(byText).toContain('Garagem');
    expect(byValue).toContain('cam-1');
    expect(byValue).toContain('cam-2');
  });

  it('escolher uma câmera envia o ID do stream (nunca o nome)', async () => {
    Cctv.streams.list.mockResolvedValueOnce(STREAMS);
    const onChange = jest.fn();
    render(
      <SchemaForm params={CAMERA_PARAM} values={{}} onChange={onChange} testidPrefix="t" />,
    );
    await waitFor(() => {
      expect((screen.getByTestId('t-field-camera') as HTMLSelectElement).disabled).toBe(false);
    });
    fireEvent.change(screen.getByTestId('t-field-camera'), { target: { value: 'cam-1' } });
    expect(onChange).toHaveBeenCalledWith('camera', 'cam-1');
  });

  it('backend de câmeras fora → fallback honesto: input livre com hint', async () => {
    Cctv.streams.list.mockRejectedValueOnce(new Error('503'));
    const onChange = jest.fn();
    render(
      <SchemaForm params={CAMERA_PARAM} values={{}} onChange={onChange} testidPrefix="t" />,
    );
    const input = await waitFor(() => {
      const el = screen.getByTestId('t-field-camera');
      expect(el.tagName).toBe('INPUT');
      return el as HTMLInputElement;
    });
    // hint honesto visível (não finge lista vazia)
    expect(screen.getByTestId('t-field-camera-hint')).toBeInTheDocument();
    // o valor digitado continua fluindo (id/URL/nome resolvem na skill)
    fireEvent.change(input, { target: { value: 'rtsp://cam/3' } });
    expect(onChange).toHaveBeenCalledWith('camera', 'rtsp://cam/3');
  });

  it('fonte dinâmica desconhecida (forward-compat) não explode: select vazio', async () => {
    const params: SkillParam[] = [
      {
        key: 'ref',
        label: 'Ref',
        param_type: 'string',
        required: false,
        dynamic_source: 'fonte_futura' as never,
      },
    ];
    render(<SchemaForm params={params} values={{}} onChange={jest.fn()} testidPrefix="t" />);
    await waitFor(() => {
      const sel = screen.getByTestId('t-field-ref') as HTMLSelectElement;
      expect(sel.tagName).toBe('SELECT');
      expect(sel.disabled).toBe(false);
    });
    const sel = screen.getByTestId('t-field-ref') as HTMLSelectElement;
    expect(Array.from(sel.options).some((o) => o.disabled)).toBe(true); // "nenhum encontrado"
  });
});
