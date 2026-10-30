/**
 * FRENTE A — relation_list AUTOEXPLICATIVO + node_type pt-BR + perfil navegável.
 *
 * O card de cada vínculo deve ser legível pra um operador sem jargão:
 *   • LINHA 1 = NATUREZA do vínculo ("Sócio de — Diretor" · "Perfil possível
 *     no Instagram: @felipeneto") — relation_type humanizado, NÃO cru.
 *   • LINHA 2 = tipo do objeto em pt-BR ("Pessoa" · "Câmera"), NÃO "person"/"Camera".
 *   • NAVEGAÇÃO: perfil (properties.url) → <a> externo nova aba ("Abrir perfil ↗");
 *     vínculo de ficha → <Link> pra /ficha/<other-id> ("Ver ficha →").
 *   A decisão perfil-vs-ficha é do WIDGET (relation_type/properties.url), não do seed.
 *
 * Cobertura:
 *  1. href_template + vínculos de ontologia → <Link> pra ficha, kind em pt-BR.
 *  2. sem href_template → botão emit intacto (regressão overlays).
 *  3. sem arestas → estado honesto.
 *  4. socio_de qualificado → "Sócio de — Diretor" + "Pessoa" + Confiança%.
 *  5. identity_decision com url+rede → <a> externo + "Perfil possível no Instagram:".
 */
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  Links: { neighbors: jest.fn() },
  Entities: { graph: jest.fn() },
}));

// i18n: o dict real é mergeado centralmente; aqui mockamos useT() com as MESMAS
// chaves devolvidas em dict_entries (ficha.rel.* + ficha.vinc.* + kind.*) p/ provar
// o componente (wiring) sem depender do merge nem editar lib/i18n/dict.ts.
jest.mock('@/lib/i18n/provider', () => {
  const D: Record<string, string> = {
    'ficha.rel.socio_de': 'Sócio de',
    'ficha.rel.identity_decision': 'Identidade',
    'ficha.rel.monitora': 'Monitora',
    'ficha.rel.pertence_a': 'Pertence a',
    'ficha.vinc.titulo': 'Vínculos',
    'ficha.vinc.vazio': 'Sem vínculos para este registro.',
    'ficha.vinc.status.possivel': 'possível',
    'ficha.vinc.status.confirmada': 'confirmada',
    'ficha.vinc.confianca': 'Confiança',
    'ficha.vinc.fallback': 'Vínculo',
    'ficha.vinc.perfilEm': 'Perfil em',
    'ficha.vinc.perfilStatusPossivel': 'Perfil possível no',
    'ficha.vinc.abrirPerfil': 'Abrir perfil',
    'ficha.vinc.verFicha': 'Ver ficha',
    'kind.person': 'Pessoa',
    'kind.empresa': 'Empresa',
    'kind.perfil': 'Perfil',
    'kind.camera': 'Câmera',
    'kind.operacao': 'Operação',
  };
  return { useT: () => (k: string) => D[k] ?? k };
});

import { RelationList } from '@/components/workshop/widgets/relation-list';
import { Links } from '@/lib/api';

const neighbors = Links.neighbors as jest.Mock;

const TRAVERSAL = {
  root_id: 'n1',
  direction: 'neighbors',
  max_depth: 1,
  truncated: false,
  nodes: [
    { id: 'n2', name: 'Câmera Portaria', node_type: 'camera', depth: 1 },
    { id: 'n3', name: 'Operação Centro', node_type: 'operacao', depth: 1 },
  ],
  edges: [
    { source_id: 'n1', target_id: 'n2', relation_type: 'monitora', depth: 1 },
    { source_id: 'n3', target_id: 'n1', relation_type: 'pertence_a', depth: 1 },
  ],
};

type RP = Parameters<typeof RelationList>[0];
function renderWidget(
  config: Record<string, unknown>,
  variables: Record<string, unknown>,
  emit?: jest.Mock,
) {
  const props = {
    config,
    variables,
    bindings: {},
    emit,
  } as unknown as RP;
  return render(<RelationList {...props} />);
}

beforeEach(() => {
  neighbors.mockReset();
});

describe('relation_list — href_template (ficha canônica)', () => {
  it('renderiza vínculos in/out como LINKS pra ficha do outro nó', async () => {
    neighbors.mockResolvedValue(TRAVERSAL);

    renderWidget(
      { source: 'obj', href_template: '/ficha/{{id}}' },
      { obj: { id: 'n1', __canonical: true } },
    );

    const items = await screen.findAllByTestId('relation-item');
    expect(items).toHaveLength(2);
    for (const el of items) expect(el.tagName).toBe('A');

    const hrefs = items.map((el) => el.getAttribute('href'));
    expect(hrefs).toContain('/ficha/n2');
    expect(hrefs).toContain('/ficha/n3');

    // relation_type humanizado (grupo + linha 1) + nome + kind em pt-BR.
    expect(screen.getAllByText('Monitora').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pertence a').length).toBeGreaterThan(0);
    // LINHA 2: tipo em pt-BR (NÃO "Camera"/"Operacao" cru) · nome.
    expect(screen.getByText(/Câmera · Câmera Portaria/)).toBeInTheDocument();
    expect(screen.getByText(/Operação · Operação Centro/)).toBeInTheDocument();
    // afirma que o kind CRU não vaza mais.
    expect(screen.queryByText(/^Camera$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Operacao$/)).not.toBeInTheDocument();
    // ação navegacional pra ficha.
    expect(screen.getAllByText('Ver ficha →').length).toBe(2);

    expect(neighbors).toHaveBeenCalledWith('n1', expect.objectContaining({ max_depth: 1 }));
  });

  it('sem href_template → botão emit intacto (regressão overlays)', async () => {
    neighbors.mockResolvedValue(TRAVERSAL);
    const emit = jest.fn();

    renderWidget({ source: 'obj' }, { obj: { id: 'n1', __canonical: true } }, emit);

    const items = await screen.findAllByTestId('relation-item');
    expect(items[0].tagName).toBe('BUTTON');
    fireEvent.click(
      items.find((el) => el.textContent?.includes('Câmera Portaria'))!,
    );
    expect(emit).toHaveBeenCalledWith(
      'select_change',
      expect.objectContaining({ selected_id: 'n2' }),
    );
  });

  it('sem arestas → estado honesto', async () => {
    neighbors.mockResolvedValue({ ...TRAVERSAL, nodes: [], edges: [] });

    renderWidget(
      { source: 'obj', href_template: '/ficha/{{id}}' },
      { obj: { id: 'n1', __canonical: true } },
    );

    expect(
      await screen.findByText('Sem vínculos para este registro.'),
    ).toBeInTheDocument();
  });
});

describe('relation_list — enriquecido pelo type_def.links (P5)', () => {
  it('relação declarada no contrato → tipo-alvo + cardinalidade; fallback intacto', async () => {
    neighbors.mockResolvedValue(TRAVERSAL);

    renderWidget(
      { source: 'obj', href_template: '/ficha/{{id}}' },
      {
        obj: { id: 'n1', __canonical: true },
        // contrato do Object Type: só 'monitora' declarado (1:N → Câmera).
        type_def: {
          links: [
            {
              relation: 'monitora',
              target_kind: 'camera',
              target_label: 'Câmera',
              cardinality: 'one_to_many',
              direction: 'outgoing',
            },
          ],
        },
      },
    );

    await screen.findAllByTestId('relation-item');

    // o rótulo da relação continua isolado (fallback i18n intacto).
    expect(screen.getAllByText('Monitora').length).toBeGreaterThan(0);
    // enriquecimento do contrato: tipo-alvo legível + cardinalidade.
    const hints = screen.getAllByTestId('relation-group-hint').map((h) => h.textContent);
    expect(hints).toContain('Câmera · 1:N');
    // 'pertence_a' NÃO está no contrato → sem hint (só 1 hint no total).
    expect(hints).toHaveLength(1);
  });

  it('sem type_def → nenhum hint (multidomínio: relação nova legível por fallback)', async () => {
    neighbors.mockResolvedValue(TRAVERSAL);
    renderWidget(
      { source: 'obj', href_template: '/ficha/{{id}}' },
      { obj: { id: 'n1', __canonical: true } },
    );
    await screen.findAllByTestId('relation-item');
    expect(screen.queryByTestId('relation-group-hint')).not.toBeInTheDocument();
  });
});

describe('relation_list — vínculo societário (FRENTE A)', () => {
  const Entities = jest.requireMock('@/lib/api').Entities as { graph: jest.Mock };

  beforeEach(() => Entities.graph.mockReset());

  it('socio_de: LINHA 1 "Sócio de — Diretor" + LINHA 2 "Pessoa · <nome>" + Confiança%', async () => {
    // DADO REAL: Petrobras (cnpj) socio_de pessoa, qualificacao "Diretor".
    Entities.graph.mockResolvedValue({
      nodes: [{ id: 'e2', display: 'CLARICE COPPETTI', kind: 'person' }],
      edges: [
        {
          src: 'e1',
          dst: 'e2',
          rel: 'socio_de',
          weight: 0.92,
          properties: { status: 'confirmed', qualificacao: 'Diretor' },
        },
      ],
    });

    renderWidget({ source: 'obj' }, { obj: { id: 'e1' } });

    // LINHA 1: natureza do vínculo + qualificação (não "socio_de" cru).
    expect(await screen.findByText('Sócio de — Diretor')).toBeInTheDocument();
    // LINHA 2: tipo em pt-BR + nome em Title Case (não CAPS cru).
    expect(screen.getByText(/Pessoa · Clarice Coppetti/)).toBeInTheDocument();
    // CHIPS: status + confiança com rótulo CLARO (não "conf" abreviado).
    const badges = screen.getAllByTestId('relation-badge').map((b) => b.textContent);
    expect(badges).toContain('confirmada');
    expect(badges).toContain('Confiança 92%');
    expect(badges).not.toContain('conf 92%');
    // vínculo de ontologia → emite seleção (sem href_template, sem url): botão.
    const item = screen.getByTestId('relation-item');
    expect(item.tagName).toBe('BUTTON');
    expect(screen.getByText('Ver ficha →')).toBeInTheDocument();
  });
});

describe('relation_list — perfil correlacionado navegável (FRENTE A)', () => {
  const Entities = jest.requireMock('@/lib/api').Entities as { graph: jest.Mock };

  beforeEach(() => Entities.graph.mockReset());

  it('identity_decision com url+rede → <a> externo + "Perfil possível no Instagram: @felipeneto"', async () => {
    // DADO REAL: Felipe Neto (person) identity_decision, properties {url, rede, status, confianca}.
    Entities.graph.mockResolvedValue({
      nodes: [{ id: 'e3', display: '@felipeneto', kind: 'perfil' }],
      edges: [
        {
          src: 'e1',
          dst: 'e3',
          rel: 'identity_decision',
          properties: {
            url: 'https://instagram.com/felipeneto',
            rede: 'instagram',
            status: 'possible',
            confianca: 0.44,
          },
        },
      ],
    });

    renderWidget({ source: 'obj' }, { obj: { id: 'e1' } });

    // LINHA 1: natureza = perfil possível na rede certa, com o handle.
    expect(
      await screen.findByText('Perfil possível no Instagram: @felipeneto'),
    ).toBeInTheDocument();

    // NAVEGAÇÃO + DESTINO: <a> externo pro PERFIL real, nova aba, não /ficha.
    const item = screen.getByTestId('relation-item');
    expect(item.tagName).toBe('A');
    expect(item.getAttribute('href')).toBe('https://instagram.com/felipeneto');
    expect(item.getAttribute('target')).toBe('_blank');
    expect(item.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText('Abrir perfil ↗')).toBeInTheDocument();

    // CHIPS: status + confiança clara.
    const badges = screen.getAllByTestId('relation-badge').map((b) => b.textContent);
    expect(badges).toContain('possível');
    expect(badges).toContain('Confiança 44%');
  });
});
