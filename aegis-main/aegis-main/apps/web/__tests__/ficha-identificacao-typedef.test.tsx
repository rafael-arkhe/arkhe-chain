/**
 * #6/#10 — WidgetIdentificacao dirigido pelo type-def (engine genérica).
 * Princípio: declarado no contrato = NEGÓCIO (rótulo+formato); fora do contrato
 * = TÉCNICO (colapsado em <details>, nunca escondido). Sem type-def → fallback
 * heurístico. 100% ontológico/multidomínio — zero vertical hardcoded.
 */
import { render, screen, within } from '@testing-library/react';
import { WidgetIdentificacao } from '@/components/ficha/widgets-prontos';
import type { ObjectTypeSchema } from '@/lib/api';

const SCHEMA: ObjectTypeSchema = {
  kind: 'object_det',
  display_name: 'Detecção',
  title_property: 'classe',
  count: 0,
  properties: [
    { key: 'classe', type: 'string', label: 'Classe', is_title: true },
    { key: 'confianca', type: 'number', label: 'Confiança', is_title: false },
    { key: 'visto_em', type: 'datetime', label: 'Visto em', is_title: false },
  ],
  links: [],
  actions: [],
};

// props REAIS de um object_det: negócio declarado + técnico que hoje vazava cru.
const PROPS = {
  classe: 'car',
  confianca: 0.96,
  visto_em: '2026-06-20T23:55:37Z',
  device: 'cuda:NVIDIA RTX A4500',
  frame_index: 3,
  source: 'runpod_rfdetr',
  node_type: 'object_det',
};

describe('WidgetIdentificacao — type-def dirige negócio vs técnico', () => {
  it('com type-def: negócio rotulado; técnico colapsado em <details>', () => {
    render(<WidgetIdentificacao properties={PROPS} typeDef={SCHEMA} />);
    // rótulos de NEGÓCIO do contrato aparecem (não a chave crua)
    expect(screen.getByText('Classe')).toBeInTheDocument();
    expect(screen.getByText('Confiança')).toBeInTheDocument();
    expect(screen.getByText('Visto em')).toBeInTheDocument();
    // TÉCNICO (device/frame_index/source) fica DENTRO do <details>, não no dl principal
    const tecnico = screen.getByTestId('ficha-tecnico');
    expect(within(tecnico).getByText('Device')).toBeInTheDocument();
    expect(within(tecnico).getByText('Frame Index')).toBeInTheDocument();
    expect(within(tecnico).getByText('Source')).toBeInTheDocument();
    // os valores técnicos NÃO somem (dado preservado, só colapsado)
    expect(within(tecnico).getByText(/runpod_rfdetr/)).toBeInTheDocument();
  });

  it('sem type-def: fallback heurístico ainda colapsa técnico óbvio', () => {
    render(<WidgetIdentificacao properties={PROPS} />);
    const tecnico = screen.getByTestId('ficha-tecnico');
    // device/frame_index/source/node_type caem no técnico pela heurística
    expect(within(tecnico).getByText('Device')).toBeInTheDocument();
    expect(within(tecnico).getByText('Source')).toBeInTheDocument();
    // "classe" (não-técnica) fica no negócio (fora do details)
    expect(screen.getByText('Classe')).toBeInTheDocument();
  });

  it('nunca esconde dado: técnico mostra a contagem real', () => {
    render(<WidgetIdentificacao properties={PROPS} typeDef={SCHEMA} />);
    // 4 chaves fora do contrato (device, frame_index, source, node_type)
    expect(screen.getByText(/Ver detalhes técnicos|technical details/i).textContent).toMatch(/\(4\)/);
  });
});
