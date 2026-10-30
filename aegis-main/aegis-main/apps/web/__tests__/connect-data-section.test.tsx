/**
 * #1 (feedback do operador) — nós de Coleta ACIONÁVEIS.
 *
 * Cobre a seção "Conectar dados" do inspector (ConnectDataSection):
 *   - vincular existente: dropdown POPULADO (fontes/conectores/datasets;
 *     nunca input técnico manual) → grava config.linked_source no nó;
 *   - fail-soft por grupo: 403 numa lista não derruba as outras;
 *   - subir arquivo pequeno: CSV parseado → POST /ingest/event (governado)
 *     → nó vinculado na hora; >2 MB recusa sem chamada;
 *   - desvincular remove a chave do config;
 *   - parseCsvRows/readLinkedSource puros;
 * e o chip de status no canvas (Conectado vs Sem dados, só fase Coleta).
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import {
  ConnectDataSection,
  parseCsvRows,
  readLinkedSource,
  readLinkedSources,
} from '@/components/solution-designer/ConnectDataSection';
import { SolutionCanvas, deriveRouteEdges } from '@/components/solution-designer/SolutionCanvas';

jest.mock('@/lib/api', () => ({
  Sources: { list: jest.fn() },
  Connectors: { list: jest.fn(), bindings: jest.fn() },
  Datasets: { list: jest.fn() },
  Ingest: { event: jest.fn() },
  Skills: { catalog: jest.fn().mockResolvedValue([]), installOpenclaw: jest.fn() },
}));

// reactflow real não roda em jsdom — mock fino que renderiza os nós custom.
jest.mock('reactflow', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: (props: any) =>
      React.createElement(
        'div',
        { 'data-testid': 'rf-mock' },
        (props.nodes || []).map((n: any) =>
          React.createElement(props.nodeTypes.solution, {
            key: n.id,
            id: n.id,
            data: n.data,
            selected: false,
          }),
        ),
      ),
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    NodeResizer: () => null,
    applyNodeChanges: (_c: any, n: any) => n,
    Position: { Left: 'left', Right: 'right' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
  };
});

const { Sources, Connectors, Datasets, Ingest, Skills } = jest.requireMock('@/lib/api') as {
  Sources: Record<string, jest.Mock>;
  Connectors: Record<string, jest.Mock>;
  Datasets: Record<string, jest.Mock>;
  Ingest: Record<string, jest.Mock>;
  Skills: Record<string, jest.Mock>;
};

const coletaNode = {
  id: 'c1',
  kind: 'dataset',
  phase: 'coleta',
  title: 'Ocorrências da região',
  config: {},
};

// Os pickers viraram SearchableSelect (combobox): abrir = clicar o botão do
// wrapper; opção = `${testid}-option-${value}`.
async function openCombo(testid: string) {
  const wrap = await screen.findByTestId(testid);
  fireEvent.click(wrap.querySelector('button') as HTMLButtonElement);
  return wrap;
}
async function pickCombo(testid: string, value: string) {
  await openCombo(testid);
  fireEvent.click(await screen.findByTestId(`${testid}-option-${value}`));
}

describe('parseCsvRows / readLinkedSource (puros)', () => {
  it('parseia CSV simples com header', () => {
    expect(parseCsvRows('nome,idade\nAna,30\nBeto,41')).toEqual([
      { nome: 'Ana', idade: '30' },
      { nome: 'Beto', idade: '41' },
    ]);
  });
  it('CSV sem linhas de dados → []', () => {
    expect(parseCsvRows('só-header')).toEqual([]);
    expect(parseCsvRows('')).toEqual([]);
  });
  it('readLinkedSource valida o shape defensivamente', () => {
    expect(readLinkedSource(undefined)).toBeNull();
    expect(readLinkedSource({ linked_source: 'x' })).toBeNull();
    expect(readLinkedSource({ linked_source: { kind: 'outra', id: '1', label: 'x' } })).toBeNull();
    expect(
      readLinkedSource({ linked_source: { kind: 'fonte', id: 's1', label: 'Fonte X' } }),
    ).toEqual({ kind: 'fonte', id: 's1', label: 'Fonte X' });
  });
  it('readLinkedSources lê o array, filtra inválidos e migra o legado singular', () => {
    expect(readLinkedSources(undefined)).toEqual([]);
    // array canônico (P2) — entradas inválidas são filtradas, nunca explodem
    expect(
      readLinkedSources({
        linked_sources: [
          { kind: 'fonte', id: 's1', label: 'F1' },
          'lixo',
          { kind: 'outra', id: 'x', label: 'X' },
          { kind: 'conector', id: 'a1', label: 'C1' },
        ],
      }),
    ).toEqual([
      { kind: 'fonte', id: 's1', label: 'F1' },
      { kind: 'conector', id: 'a1', label: 'C1' },
    ]);
    // MIGRAÇÃO: diagrama pré-P2 com linked_source singular → array de 1
    expect(
      readLinkedSources({ linked_source: { kind: 'dataset', id: 'd1', label: 'D1' } }),
    ).toEqual([{ kind: 'dataset', id: 'd1', label: 'D1' }]);
  });
});

describe('ConnectDataSection — vincular / criar / subir', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Sources.list.mockResolvedValue([
      { id: 's1', name: 'Câmeras centro', connector_type: 'http', status: 'connected', latency_ms: 5, last_check: '' },
    ]);
    Connectors.list.mockResolvedValue([
      { id: 'a1', slug: 'meu-conector', display_name: 'Meu conector HTTP', kind: 'worker', status: 'active', config: {}, created_at: '' },
    ]);
    Datasets.list.mockResolvedValue([
      { name: 'ocorrencias', asset_count: 3, head_version: 3, head_asset_id: 'x', branches: [] },
    ]);
    Connectors.bindings.mockResolvedValue([]); // sem binding → vincula só a origem
  });

  it('popula o dropdown com os 3 grupos e vincula a escolha no config do nó', async () => {
    const onPatchNode = jest.fn();
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={onPatchNode} />);
    expect(screen.getByTestId('connect-none')).toBeInTheDocument(); // sem vínculo ainda
    const select = await openCombo('connect-existing-select');
    await screen.findByTestId('connect-existing-select-option-dataset:ocorrencias'); // opções carregaram
    expect(select).toHaveTextContent('Câmeras centro');
    expect(select).toHaveTextContent('Meu conector HTTP');
    expect(select).toHaveTextContent('ocorrencias');
    fireEvent.click(screen.getByTestId('connect-existing-select-option-dataset:ocorrencias'));
    expect(onPatchNode).toHaveBeenCalledWith('c1', {
      config: { linked_sources: [{ kind: 'dataset', id: 'ocorrencias', label: 'ocorrencias' }] },
    });
  });

  it('fail-soft por grupo: uma lista 403 não derruba as outras', async () => {
    Sources.list.mockRejectedValue(new Error('403'));
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={jest.fn()} />);
    const select = await openCombo('connect-existing-select');
    await screen.findByTestId('connect-existing-select-option-dataset:ocorrencias'); // opções carregaram (Sources 403)
    expect(select).not.toHaveTextContent('Câmeras centro');
    expect(select).toHaveTextContent('Meu conector HTTP');
    expect(select).toHaveTextContent('ocorrencias');
  });

  it('mostra o vínculo LEGADO (singular) + desvincular limpa as duas chaves', async () => {
    const onPatchNode = jest.fn();
    const linkedNode = {
      ...coletaNode,
      config: { keep: 1, linked_source: { kind: 'fonte', id: 's1', label: 'Câmeras centro' } },
    };
    render(<ConnectDataSection node={linkedNode as never} onPatchNode={onPatchNode} />);
    expect(screen.getByTestId('connect-linked')).toHaveTextContent('Câmeras centro');
    fireEvent.click(screen.getByTestId('connect-unlink'));
    expect(onPatchNode).toHaveBeenCalledWith('c1', { config: { keep: 1 } });
  });

  it('P2: várias fontes — adicionar APPENDA (nunca sobrescreve), com contador e dedupe', async () => {
    // Harness com estado real: o patch atualiza o node (como a página faz).
    function Harness() {
      const [node, setNode] = React.useState(coletaNode as never as { id: string; config: Record<string, unknown> });
      return (
        <ConnectDataSection
          node={node as never}
          onPatchNode={(_id, patch) => setNode((n) => ({ ...n, ...(patch as object) }))}
        />
      );
    }
    render(<Harness />);
    await pickCombo('connect-existing-select', 'fonte:s1');
    // 1ª fonte vinculada
    expect(await screen.findByTestId('connect-count')).toHaveTextContent('(1)');
    await pickCombo('connect-existing-select', 'conector:a1');
    // 2ª fonte APPENDADA — a 1ª continua lá (o bug era sobrescrever)
    expect(await screen.findByTestId('connect-count')).toHaveTextContent('(2)');
    const chips = screen.getAllByTestId('connect-linked');
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveTextContent('Câmeras centro');
    expect(chips[1]).toHaveTextContent('Meu conector HTTP');
    // dedupe visível: já-vinculadas saem do dropdown
    const select2 = await openCombo('connect-existing-select');
    await screen.findByTestId('connect-existing-select-option-dataset:ocorrencias');
    expect(select2).not.toHaveTextContent('Câmeras centro');
    expect(select2).not.toHaveTextContent('Meu conector HTTP');
    expect(select2).toHaveTextContent('ocorrencias');
    // remover só a 1ª — a 2ª permanece
    fireEvent.click(screen.getAllByTestId('connect-unlink')[0]);
    expect(await screen.findByTestId('connect-count')).toHaveTextContent('(1)');
    expect(screen.getByTestId('connect-linked')).toHaveTextContent('Meu conector HTTP');
  });

  it('deep-links "Criar agora" apontam pras abas do hub Dados', async () => {
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={jest.fn()} />);
    expect(screen.getByTestId('connect-create-conexoes')).toHaveAttribute(
      'href',
      '/painel-de-controle/dados?aba=conexoes',
    );
    expect(screen.getByTestId('connect-create-datasets')).toHaveAttribute(
      'href',
      '/painel-de-controle/dados?aba=datasets',
    );
    expect(screen.getByTestId('connect-create-arquivos')).toHaveAttribute(
      'href',
      '/painel-de-controle/dados?aba=arquivos',
    );
  });

  it('subir CSV pequeno → /ingest/event governado + vincula o nó', async () => {
    Ingest.event.mockResolvedValue({ asset_id: 'abcdef1234567890', transform: null });
    const onPatchNode = jest.fn();
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={onPatchNode} />);
    const file = new File(['nome,idade\nAna,30'], 'planilha.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('connect-upload-input'), { target: { files: [file] } });
    await waitFor(() => expect(Ingest.event).toHaveBeenCalled());
    const body = Ingest.event.mock.calls[0][0];
    expect(body.source_type).toBe('manual_upload');
    expect(body.source_name).toBe('ocorrencias-da-regiao'); // slug do título (sem acento)
    expect(body.payload.rows).toEqual([{ nome: 'Ana', idade: '30' }]);
    // vinculado na hora
    await waitFor(() =>
      expect(onPatchNode).toHaveBeenCalledWith('c1', {
        config: {
          linked_sources: [
            { kind: 'fonte', id: 'ocorrencias-da-regiao', label: 'planilha.csv' },
          ],
        },
      }),
    );
    expect(await screen.findByTestId('connect-upload-done')).toHaveTextContent('abcdef12');
  });

  it('arquivo acima de 2 MB é recusado SEM chamada', async () => {
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={jest.fn()} />);
    const big = new File([new ArrayBuffer(2 * 1024 * 1024 + 1)], 'grande.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('connect-upload-input'), { target: { files: [big] } });
    expect(await screen.findByTestId('connect-error')).toHaveTextContent(/2 MB/);
    expect(Ingest.event).not.toHaveBeenCalled();
  });
});

describe('ConnectDataSection — B (#1): a ROTA Fonte→Tipo de objeto + campos', () => {
  const OBJ_TYPES = [
    { kind: 'Ocorrencia', label: 'Ocorrência' },
    { kind: 'Endereco', label: 'Endereço' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    Sources.list.mockResolvedValue([]);
    Connectors.list.mockResolvedValue([
      { id: 'a1', slug: 'meu-conector', display_name: 'Meu conector', kind: 'worker', status: 'active', config: {}, created_at: '' },
    ]);
    Datasets.list.mockResolvedValue([]);
    Connectors.bindings.mockResolvedValue([]);
  });

  it('chip de uma fonte ligada mostra o dropdown de Tipo de objeto (da ontologia); adicionar grava target_node_type + lista', async () => {
    const onPatchNode = jest.fn();
    const linkedNode = {
      ...coletaNode,
      config: { linked_sources: [{ kind: 'fonte', id: 'planilha', label: 'planilha.csv' }] },
    };
    render(
      <ConnectDataSection node={linkedNode as never} onPatchNode={onPatchNode} objectTypes={OBJ_TYPES} />,
    );
    // estado "sem saída" enquanto não escolhe nenhum Tipo
    const chip = screen.getByTestId('connect-linked');
    expect(chip).toHaveAttribute('data-output', 'unset');
    const typeSel = await openCombo('connect-output-type');
    await screen.findByTestId('connect-output-type-option-Ocorrencia');
    expect(typeSel).toHaveTextContent('Ocorrência');
    expect(typeSel).toHaveTextContent('Endereço');
    // adicionar um Tipo grava o singular (retrocompat) E a lista canônica
    fireEvent.click(screen.getByTestId('connect-output-type-option-Ocorrencia'));
    expect(onPatchNode).toHaveBeenCalledWith('c1', {
      config: {
        linked_sources: [
          {
            kind: 'fonte',
            id: 'planilha',
            label: 'planilha.csv',
            target_node_type: 'Ocorrencia',
            target_node_types: ['Ocorrencia'],
          },
        ],
      },
    });
  });

  it('N-TIPOS: uma fonte produz VÁRIOS Tipos — adicionar 2º mantém ambos como chips removíveis', async () => {
    function Harness() {
      const [node, setNode] = React.useState(
        {
          ...coletaNode,
          config: { linked_sources: [{ kind: 'conector', id: 'ig', label: 'Instagram' }] },
        } as never as { id: string; config: Record<string, unknown> },
      );
      return (
        <ConnectDataSection
          node={node as never}
          onPatchNode={(_id, patch) => setNode((n) => ({ ...n, ...(patch as object) }))}
          objectTypes={OBJ_TYPES}
        />
      );
    }
    render(<Harness />);
    // adiciona PerfilInstagram (kind 'Ocorrencia' no fixture) …
    await pickCombo('connect-output-type', 'Ocorrencia');
    // … e um 2º tipo (Endereco) — NÃO sobrescreve o 1º
    await pickCombo('connect-output-type', 'Endereco');
    const chips = screen.getAllByTestId('connect-produced-chip');
    expect(chips).toHaveLength(2);
    expect(chips.map((c) => c.getAttribute('data-kind')).sort()).toEqual(['Endereco', 'Ocorrencia']);
    // remover o 1º deixa só o 2º (não some tudo)
    fireEvent.click(within(chips[0]).getByTestId('connect-produced-remove'));
    expect(screen.getAllByTestId('connect-produced-chip')).toHaveLength(1);
  });

  it('sem Tipos de objeto no blueprint → mostra orientação, nunca input livre', () => {
    const linkedNode = { ...coletaNode, config: { linked_sources: [{ kind: 'fonte', id: 'p', label: 'p' }] } };
    render(<ConnectDataSection node={linkedNode as never} onPatchNode={jest.fn()} objectTypes={[]} />);
    expect(screen.getByTestId('connect-no-types')).toBeInTheDocument();
    expect(screen.queryByTestId('connect-output-type')).not.toBeInTheDocument();
  });

  it('CSV subido captura os headers → seletores de campo id/nome populados (sem digitar coluna)', async () => {
    Ingest.event.mockResolvedValue({ asset_id: 'aaaaaaaa1111', transform: null });
    function Harness() {
      const [node, setNode] = React.useState(
        { ...coletaNode, config: {} } as never as { id: string; config: Record<string, unknown> },
      );
      return (
        <ConnectDataSection
          node={node as never}
          onPatchNode={(_id, patch) => setNode((n) => ({ ...n, ...(patch as object) }))}
          objectTypes={OBJ_TYPES}
        />
      );
    }
    render(<Harness />);
    const file = new File(['protocolo,titulo,bairro\nP1,Furto,Centro'], 'ocorr.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('connect-upload-input'), { target: { files: [file] } });
    await waitFor(() => expect(Ingest.event).toHaveBeenCalled());
    // escolhe o Tipo → aparece o mapa de campos com as COLUNAS do CSV
    await pickCombo('connect-output-type', 'Ocorrencia');
    const idSel = await screen.findByTestId('connect-id-field');
    expect(idSel).toHaveTextContent('protocolo');
    expect(idSel).toHaveTextContent('titulo');
    expect(idSel).toHaveTextContent('bairro');
    // escolher o id grava id_field no vínculo
    fireEvent.change(idSel, { target: { value: 'protocolo' } });
    await waitFor(() => {
      const chip = screen.getByTestId('connect-linked');
      expect(chip).toHaveAttribute('data-output', 'set');
    });
  });

  it('vincular um CONECTOR herda o mapa do binding (node_type/id_field/name_field) — sem redigitar', async () => {
    Connectors.bindings.mockResolvedValue([
      { skill_key: 'connector.http', active: true, config: { node_type: 'Endereco', id_field: 'cep', name_field: 'logradouro' } },
    ]);
    function Harness() {
      const [node, setNode] = React.useState(
        { ...coletaNode, config: {} } as never as { id: string; config: Record<string, unknown> },
      );
      return (
        <ConnectDataSection
          node={node as never}
          onPatchNode={(_id, patch) => setNode((n) => ({ ...n, ...(patch as object) }))}
          objectTypes={OBJ_TYPES}
        />
      );
    }
    render(<Harness />);
    await pickCombo('connect-existing-select', 'conector:a1');
    await waitFor(() => expect(Connectors.bindings).toHaveBeenCalledWith('a1'));
    // prefill: a rota fica completa (verde) + o Tipo = Endereco do binding,
    // exibido como chip de tipo produzido (o singular herdado vira a lista).
    await waitFor(() => {
      const chip = screen.getByTestId('connect-linked');
      expect(chip).toHaveAttribute('data-output', 'set');
    });
    const producedChip = screen.getByTestId('connect-produced-chip');
    expect(producedChip).toHaveAttribute('data-kind', 'Endereco');
  });
});

describe('ConnectDataSection — Fonte de coleta (catálogo estilo Foundry)', () => {
  // Catálogo HORIZONTAL com várias categorias + 1 rótulo SUJO (jargão de
  // mecanismo) + 1 clawhub (requer ativação) — espelha o mundo real.
  const CATALOG = [
    {
      skill_key: 'openclaw:postiz',
      label: 'Postiz',
      description: 'Posts públicos de redes sociais',
      category: 'social',
      source: 'native',
      platforms: ['instagram'],
      requires_secrets: [],
      param_schema: [
        { key: 'hashtag', label: 'Hashtag', param_type: 'string', required: true, placeholder: '#exemplo' },
        { key: 'count', label: 'Qtd posts', param_type: 'number', required: false, default: 5 },
      ],
    },
    {
      // RÓTULO SUJO — jargão de mecanismo que NUNCA pode vazar na UI.
      skill_key: 'clawhub:telegram',
      label: 'Telegram (agente + sessão do servidor)',
      description: 'Mensagens de canais públicos',
      category: 'social',
      source: 'clawhub',
      platforms: ['telegram'],
      requires_secrets: [],
      param_schema: [{ key: 'channel', label: 'Canal', param_type: 'string', required: true }],
    },
    {
      skill_key: 'connector.http',
      label: 'API HTTP',
      description: 'Endpoint REST genérico',
      category: 'ingestion',
      source: 'native',
      platforms: ['http'],
      requires_secrets: [],
      param_schema: [{ key: 'url', label: 'URL', param_type: 'string', required: true }],
    },
    {
      skill_key: 'aegis.detect_objects',
      label: 'Detecção de objetos',
      description: 'Visão computacional em imagens',
      category: 'vision',
      source: 'native',
      platforms: ['image'],
      requires_secrets: [],
      param_schema: [],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    Sources.list.mockResolvedValue([]);
    Connectors.list.mockResolvedValue([]);
    Datasets.list.mockResolvedValue([]);
    Skills.catalog.mockResolvedValue(CATALOG);
    Skills.installOpenclaw.mockResolvedValue({ installed: true, discovered: ['telegram'] });
  });

  const PROPOSED = { skill_key: 'openclaw:postiz', label: 'Postiz', platforms: ['instagram'], ready: true };

  // #15 — categorias do catálogo nascem COLAPSADAS; expande p/ ver os itens
  // (gesto real do operador: clicar a categoria → ver as skills).
  async function expandCats() {
    await screen.findByTestId('coleta-catalog');
    for (const k of ['social', 'ingestion', 'vision', 'ocr', 'audio', 'image', 'compose', 'other']) {
      const cat = screen.queryByTestId(`coleta-cat-${k}`);
      if (cat) fireEvent.click(cat);
    }
  }

  it('(a) renderiza o catálogo AGRUPADO por categoria com cabeçalhos limpos pt-BR', async () => {
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={jest.fn()} />);
    expect(await screen.findByTestId('coleta-catalog')).toBeInTheDocument();
    // cabeçalhos de categoria limpos (visíveis mesmo colapsados)
    expect(await screen.findByTestId('coleta-cat-social')).toHaveTextContent('Redes sociais & OSINT');
    expect(screen.getByTestId('coleta-cat-ingestion')).toHaveTextContent('Conectores & APIs');
    expect(screen.getByTestId('coleta-cat-vision')).toHaveTextContent('Visão computacional');
    await expandCats();
    // itens limpos (nomes humanos)
    expect(screen.getByTestId('coleta-item-openclaw:postiz')).toHaveTextContent('Postiz');
    expect(screen.getByTestId('coleta-item-connector.http')).toHaveTextContent('API HTTP');
    // NUNCA exibe o skill_key cru
    expect(screen.getByTestId('coleta-catalog')).not.toHaveTextContent('connector.http');
    expect(screen.getByTestId('coleta-catalog')).not.toHaveTextContent('aegis.detect_objects');
  });

  it('(b) higieniza o rótulo sujo — remove o sufixo de jargão "(agente + sessão…)"', async () => {
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={jest.fn()} />);
    await expandCats();
    const item = await screen.findByTestId('coleta-item-clawhub:telegram');
    expect(item).toHaveTextContent('Telegram');
    // jargão de mecanismo removido
    expect(item).not.toHaveTextContent('agente');
    expect(item).not.toHaveTextContent('sessão');
    expect(item).not.toHaveTextContent('servidor');
  });

  it('(b2) item clawhub = "Requer ativação"; native = "Pronto"', async () => {
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={jest.fn()} />);
    await expandCats();
    const claw = await screen.findByTestId('coleta-item-clawhub:telegram');
    expect(claw).toHaveTextContent('requer ativação');
    const http = screen.getByTestId('coleta-item-connector.http');
    expect(http).toHaveTextContent('pronta');
  });

  it('(c) a busca filtra por label/description/plataforma (case-insensitive)', async () => {
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={jest.fn()} />);
    const search = await screen.findByTestId('coleta-catalog-search');
    fireEvent.change(search, { target: { value: 'telegram' } });
    expect(screen.getByTestId('coleta-item-clawhub:telegram')).toBeInTheDocument();
    expect(screen.queryByTestId('coleta-item-openclaw:postiz')).not.toBeInTheDocument();
    expect(screen.queryByTestId('coleta-item-connector.http')).not.toBeInTheDocument();
    // busca por descrição
    fireEvent.change(search, { target: { value: 'rest' } });
    expect(screen.getByTestId('coleta-item-connector.http')).toBeInTheDocument();
    expect(screen.queryByTestId('coleta-item-clawhub:telegram')).not.toBeInTheDocument();
  });

  it('(d) proposedSkill aparece destacado "Sugerido pelo AIP" e pré-selecionado, com o form', async () => {
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={jest.fn()} proposedSkill={PROPOSED as never} />);
    const suggested = await screen.findByTestId('coleta-suggested');
    expect(suggested).toHaveTextContent('Postiz');
    expect(suggested).toHaveTextContent('Sugerido pelo AIP');
    // pré-selecionado → o form dos parâmetros já aparece
    expect(await screen.findByTestId('coleta-param-field-hashtag')).toBeInTheDocument();
  });

  // Harness reutilizável: estado real (o patch atualiza o node, como a página).
  function SkillHarness({ initialConfig = {}, onPatch }: { initialConfig?: Record<string, unknown>; onPatch?: (p: unknown) => void }) {
    const [node, setNode] = React.useState(
      { ...coletaNode, config: initialConfig } as never as { id: string; config: Record<string, unknown> },
    );
    return (
      <ConnectDataSection
        node={node as never}
        onPatchNode={(id, patch) => {
          onPatch?.(patch);
          setNode((n) => ({ ...n, ...(patch as object) }));
        }}
      />
    );
  }

  it('(e) selecionar um item do catálogo ADICIONA à lista coleta_skills[] e mostra o form', async () => {
    const onPatch = jest.fn();
    render(<SkillHarness onPatch={onPatch} />);
    await expandCats();
    const item = await screen.findByTestId('coleta-item-connector.http');
    fireEvent.click(item);
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        coleta_skills: [{ skill_key: 'connector.http', params: {} }],
      }),
    }));
    // form dos params da capacidade em foco + chip dela
    expect(await screen.findByTestId('coleta-param-field-url')).toBeInTheDocument();
    expect(screen.getByTestId('coleta-skill-chip-connector.http')).toBeInTheDocument();
  });

  it('(e2) preencher um parâmetro grava em coleta_skills[] e MIGRA o singular legado', async () => {
    const onPatch = jest.fn();
    render(<SkillHarness initialConfig={{ coleta_skill_key: 'openclaw:postiz' }} onPatch={onPatch} />);
    const hashtag = await screen.findByTestId('coleta-param-field-hashtag');
    fireEvent.change(hashtag, { target: { value: '#eleicoes' } });
    const cfg = onPatch.mock.calls.at(-1)![0].config;
    expect(cfg.coleta_skills).toEqual([{ skill_key: 'openclaw:postiz', params: { hashtag: '#eleicoes' } }]);
    expect(cfg.coleta_skill_key).toBeUndefined(); // singular legado removido
    expect(cfg.coleta_params).toBeUndefined();
  });

  it('(e4) N-SKILLS: adicionar 2ª skill APPENDA (1ª permanece) — 2 chips', async () => {
    render(<SkillHarness />);
    await expandCats();
    fireEvent.click(await screen.findByTestId('coleta-item-connector.http'));
    fireEvent.click(await screen.findByTestId('coleta-item-openclaw:postiz'));
    const chips = within(screen.getByTestId('coleta-skills-list')).getAllByTestId(/^coleta-skill-chip-/);
    expect(chips).toHaveLength(2);
    expect(screen.getByTestId('coleta-skill-chip-connector.http')).toBeInTheDocument();
    expect(screen.getByTestId('coleta-skill-chip-openclaw:postiz')).toBeInTheDocument();
  });

  it('(e5) remover uma skill deixa a outra intacta', async () => {
    render(<SkillHarness initialConfig={{ coleta_skills: [
      { skill_key: 'connector.http', params: {} },
      { skill_key: 'openclaw:postiz', params: {} },
    ] }} />);
    expect(await screen.findByTestId('coleta-skill-chip-connector.http')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('coleta-skill-remove-connector.http'));
    await waitFor(() =>
      expect(screen.queryByTestId('coleta-skill-chip-connector.http')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('coleta-skill-chip-openclaw:postiz')).toBeInTheDocument();
  });

  it('(e6) re-selecionar a mesma skill é NOP (não duplica)', async () => {
    render(<SkillHarness />);
    await expandCats();
    const item = await screen.findByTestId('coleta-item-connector.http');
    fireEvent.click(item);
    fireEvent.click(item);
    const chips = within(screen.getByTestId('coleta-skills-list')).getAllByTestId(/^coleta-skill-chip-/);
    expect(chips).toHaveLength(1);
  });

  it('(e3) selecionar uma capacidade clawhub mostra o botão Ativar → endpoint real', async () => {
    const selectedNode = { ...coletaNode, config: { coleta_skill_key: 'clawhub:telegram' } };
    render(<ConnectDataSection node={selectedNode as never} onPatchNode={jest.fn()} />);
    const act = await screen.findByTestId('coleta-activate');
    fireEvent.click(act);
    await waitFor(() => expect(Skills.installOpenclaw).toHaveBeenCalledWith('clawhub:telegram'));
  });

  it('(f) retrocompat: sem proposedSkill o catálogo funciona standalone', async () => {
    render(<ConnectDataSection node={coletaNode as never} onPatchNode={jest.fn()} />);
    expect(await screen.findByTestId('coleta-catalog')).toBeInTheDocument();
    // sem sugestão destacada
    expect(screen.queryByTestId('coleta-suggested')).not.toBeInTheDocument();
    // "Outras fontes" permanece como caminho secundário
    expect(screen.getByTestId('connect-advanced-toggle')).toBeInTheDocument();
  });
});

describe('deriveRouteEdges (puro) — auto-seta Coleta→Tipo de objeto', () => {
  it('liga o nó de Coleta ao nó da fase ontologia quando há rota', () => {
    const edges = deriveRouteEdges(
      [
        { id: 'col', kind: 'connector', phase: 'coleta', config: { linked_sources: [{ target_node_type: 'Ocorrencia' }] } },
        { id: 'onto', kind: 'concept', phase: 'ontologia', title: 'Ontologia' },
      ],
      new Set(),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'col', target: 'onto', label: 'Ocorrencia' });
  });

  it('prefere um nó ontology_type específico do tipo, quando existir', () => {
    const edges = deriveRouteEdges(
      [
        { id: 'col', kind: 'connector', phase: 'coleta', config: { linked_sources: [{ target_node_type: 'Ocorrencia' }] } },
        { id: 'onto', kind: 'concept', phase: 'ontologia', title: 'Ontologia' },
        { id: 'tEnd', kind: 'ontology_type', phase: 'ontologia', title: 'Endereço', config: { object_kind: 'Endereco' } },
        { id: 'tOcc', kind: 'ontology_type', phase: 'ontologia', title: 'Ocorrência', config: { object_kind: 'Ocorrencia' } },
      ],
      new Set(),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0].target).toBe('tOcc'); // o nó do tipo certo, não o genérico
  });

  it('não duplica uma aresta que já existe + ignora fontes sem Saída', () => {
    const nodes = [
      { id: 'col', kind: 'connector', phase: 'coleta', config: { linked_sources: [
        { target_node_type: 'Ocorrencia' }, { label: 'sem rota' }] } },
      { id: 'onto', kind: 'concept', phase: 'ontologia', title: 'Ontologia' },
    ];
    expect(deriveRouteEdges(nodes, new Set(['col->onto']))).toHaveLength(0); // já existe
    expect(deriveRouteEdges(nodes, new Set())).toHaveLength(1); // só a com rota
  });
});

describe('SolutionCanvas — chip de status de dados nos nós de Coleta', () => {
  it('Coleta sem vínculo → "Sem dados"; com vínculo (legado) → "Conectado"; outras fases → nada', () => {
    render(
      <SolutionCanvas
        graph={{
          nodes: [
            { id: 'n1', kind: 'dataset', phase: 'coleta', title: 'A', config: {} },
            {
              id: 'n2', kind: 'connector', phase: 'coleta', title: 'B',
              config: { linked_source: { kind: 'fonte', id: 's1', label: 'F' } },
            },
            { id: 'n3', kind: 'pipeline', phase: 'processamento', title: 'C', config: {} },
          ],
          edges: [],
        }}
      />,
    );
    expect(screen.getAllByTestId('node-data-missing')).toHaveLength(1);
    expect(screen.getAllByTestId('node-data-linked')).toHaveLength(1);
  });

  it('B (#1): fontes SEM Saída → mostra cada nome + "sem saída", estado parcial', () => {
    render(
      <SolutionCanvas
        graph={{
          nodes: [
            {
              id: 'n1', kind: 'connector', phase: 'coleta', title: 'B',
              config: {
                linked_sources: [
                  { kind: 'fonte', id: 's1', label: 'F1' },
                  { kind: 'conector', id: 'a1', label: 'C1' },
                  { kind: 'dataset', id: 'd1', label: 'D1' },
                ],
              },
            },
          ],
          edges: [],
        }}
      />,
    );
    const chip = screen.getByTestId('node-data-linked');
    // mostra os NOMES das fontes inline (não escondidos em tooltip)
    expect(chip).toHaveTextContent('F1');
    expect(chip).toHaveTextContent('C1');
    expect(chip).toHaveTextContent('D1');
    // nenhuma tem Saída → estado parcial (atenção)
    expect(chip).toHaveAttribute('data-output', 'partial');
    expect(chip).toHaveTextContent('sem saída');
    expect(chip).toHaveAttribute('title', 'F1 · C1 · D1');
  });

  it('B (#6): a rota mostra o NOME HUMANO do Tipo (display_name do blueprint), não o kind cru', () => {
    render(
      <SolutionCanvas
        graph={{
          nodes: [
            {
              id: 'n1', kind: 'connector', phase: 'coleta', title: 'B',
              config: { linked_sources: [{ kind: 'fonte', id: 's1', label: 'planilha', target_node_type: 'Ocorrencia' }] },
            },
          ],
          edges: [],
          wizard: { _blueprint: { ontology_types: [{ kind: 'Ocorrencia', display_name: 'Ocorrência' }] } },
        }}
      />,
    );
    const chip = screen.getByTestId('node-data-linked');
    expect(chip).toHaveTextContent('Ocorrência'); // display_name (com acento)
    expect(chip).not.toHaveTextContent('Ocorrencia'); // nunca o kind cru
  });

  it('B (#1): fonte COM Saída → rota "Fonte → Tipo", estado completo', () => {
    render(
      <SolutionCanvas
        graph={{
          nodes: [
            {
              id: 'n1', kind: 'connector', phase: 'coleta', title: 'B',
              config: {
                linked_sources: [
                  { kind: 'fonte', id: 's1', label: 'planilha', target_node_type: 'Ocorrencia' },
                ],
              },
            },
          ],
          edges: [],
        }}
      />,
    );
    const chip = screen.getByTestId('node-data-linked');
    expect(chip).toHaveAttribute('data-output', 'all');
    expect(chip).toHaveTextContent('planilha');
    expect(chip).toHaveTextContent('Ocorrencia'); // a Saída legível no nó
    expect(chip).not.toHaveTextContent('sem saída');
  });
});
