/**
 * P5 ONDA 1 — /ficha GENÉRICA por node_type (multidomínio).
 *
 * Régua "mineração herdaria?": kind DESCONHECIDO/canônico cai na ficha
 * GENÉRICA (identificação type-def + vínculos + AÇÕES do tipo + atividade),
 * NUNCA nos widgets de pessoa (antecedentes/mandados/veículos). Pessoa só
 * quando o kind é explicitamente pessoa/person.
 *
 * Cobertura:
 *  1. pickFichaSeed(kind desconhecido, sem canonical) → seed GENÉRICO (default),
 *     com identificação + relation_list + security.ficha.acoes; SEM widget de pessoa.
 *  2. pickFichaSeed('pessoa'|'person') → seed de pessoa (com antecedentes/mandados).
 *  3. seed canônica = mesma ficha genérica (ident + vínculos navegáveis + ações).
 *  4. orderFichaTabs deriva a ordem do LAYOUT REAL (sem ordem fixa parlamentar),
 *     com "Outros" sempre por último.
 */
import { FICHA_SEEDS, pickFichaSeed } from '@/lib/workshop/seeds/ficha';
import { orderFichaTabs } from '@/components/ficha/ficha-workshop-shell';
import type { LayoutNode } from '@/lib/workshop/types';

const PERSON_ONLY = [
  'security.ficha.antecedentes',
  'security.ficha.mandados',
  'security.ficha.veiculos',
];

function widgetTypes(appId: keyof typeof FICHA_SEEDS): string[] {
  return FICHA_SEEDS[appId].layout.root.map((n) => n.widget.type);
}

describe('pickFichaSeed — genérico por node_type (multidomínio)', () => {
  it('kind DESCONHECIDO (sem canonical) → seed GENÉRICO, não pessoa', () => {
    const seed = pickFichaSeed('carro');
    expect(seed).toBe(FICHA_SEEDS.default);
    const types = seed.layout.root.map((n) => n.widget.type);
    // ficha genérica: identificação + vínculos + ações.
    expect(types).toContain('security.ficha.identificacao');
    expect(types).toContain('relation_list');
    expect(types).toContain('security.ficha.acoes');
    // NUNCA herda widgets de pessoa.
    for (const w of PERSON_ONLY) expect(types).not.toContain(w);
  });

  it('undefined → seed GENÉRICO (default), sem widget de pessoa', () => {
    const types = widgetTypes('default');
    expect(types).toContain('security.ficha.acoes');
    for (const w of PERSON_ONLY) expect(types).not.toContain(w);
  });

  it('pessoa/person → seed de PESSOA (com antecedentes/mandados)', () => {
    expect(pickFichaSeed('pessoa')).toBe(FICHA_SEEDS.person);
    expect(pickFichaSeed('person')).toBe(FICHA_SEEDS.person);
    const types = widgetTypes('person');
    expect(types).toContain('security.ficha.antecedentes');
    expect(types).toContain('security.ficha.mandados');
  });

  it('seed canônica = ficha genérica: identificação + vínculos navegáveis + ações', () => {
    const seed = pickFichaSeed('connector', { canonical: true });
    expect(seed).toBe(FICHA_SEEDS.canonical);
    const root = seed.layout.root;
    const types = root.map((n) => n.widget.type);
    expect(types).toContain('security.ficha.identificacao');
    expect(types).toContain('security.ficha.acoes');
    for (const w of PERSON_ONLY) expect(types).not.toContain(w);
    // relation_list navega pra ficha do outro nó.
    const rel = root.find((n) => n.widget.type === 'relation_list');
    const props = (rel!.widget.props ?? {}) as Record<string, unknown>;
    expect(props.source).toBe('obj');
    expect(props.href_template).toBe('/ficha/{{id}}');
    // a aba "acoes" existe no layout.
    const acoes = root.find((n) => n.widget.type === 'security.ficha.acoes');
    expect(acoes?.layout?.tab).toBe('acoes');
  });
});

describe('orderFichaTabs — ordem do LAYOUT REAL (item 5)', () => {
  const node = (tab: string, i: number): LayoutNode => ({
    id: `n${i}`,
    widget: { type: 'x', props: {} },
    layout: { tab },
  });

  it('deriva a ordem dos nodes (sem ordem fixa parlamentar/antecedentes)', () => {
    // ordem proposital: identidade aparece ANTES de qualquer outra.
    const nodes = [
      node('identidade', 1),
      node('vinculos', 2),
      node('acoes', 3),
      node('identidade', 4), // 2º node da mesma aba não reordena
      node('atividade', 5),
    ];
    expect(orderFichaTabs(nodes).map((t) => t.id)).toEqual([
      'identidade',
      'vinculos',
      'acoes',
      'atividade',
    ]);
  });

  it('respeita a ordem do parlamentar (mandato 1º) sem hardcode global', () => {
    const nodes = [
      node('parlamentar', 1),
      node('midia', 2),
      node('historico', 3),
      node('identidade', 4),
    ];
    expect(orderFichaTabs(nodes).map((t) => t.id)).toEqual([
      'parlamentar',
      'midia',
      'historico',
      'identidade',
    ]);
  });

  it('"Outros" (fallback) sempre por último + conta nodes por aba', () => {
    const nodes = [
      { id: 'a', widget: { type: 'x', props: {} } } as LayoutNode, // sem tab → fallback
      node('identidade', 2),
      node('identidade', 3),
    ];
    const tabs = orderFichaTabs(nodes);
    expect(tabs.map((t) => t.id)).toEqual(['identidade', '__outros__']);
    expect(tabs.find((t) => t.id === 'identidade')!.count).toBe(2);
  });
});
