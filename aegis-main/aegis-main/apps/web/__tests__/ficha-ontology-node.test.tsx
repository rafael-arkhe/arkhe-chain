/**
 * T1 — /ficha resolve OBJETO CANÔNICO (OntologyNode).
 *
 * Débito achado pelo gesto: /ficha/<id-de-OntologyNode> dava "Ficha não
 * encontrada" porque a página só resolvia Entity legado + stream CCTV.
 * O fallback novo: id não é Entity → Ontology.getNode (objeto canônico)
 * → renderiza a MESMA surface FichaWorkshopShell com:
 *   - título = node.name
 *   - tipo humano = display_name do type-def (objectTypeSchema)
 *   - properties do nó (formatadas pelo widget identificação)
 *   - relacionamentos navegáveis via seed canônica (relation_list com
 *     href_template '/ficha/{{id}}')
 *
 * Cobertura:
 *  1. id de OntologyNode → nome + tipo humano + obj canônico no shell.
 *  2. objectTypeSchema falha → fallback honesto pro node_type cru.
 *  3. id de Entity → comportamento atual intacto (sem getNode, rename ok).
 *  4. id inexistente em tudo → "Ficha não encontrada" (estado honesto).
 *  5. seed canônica: pickFichaSeed(kind, {canonical}) + relation_list
 *     navegável + identificação presente; defaults antigos intactos.
 *  6. Tarefa D — rename inline do nó CANÔNICO: perm ontology.objects.write
 *     → InlineRename presente; salvar chama Ontology.updateNode(id, {name})
 *     otimista (título muda já); erro → rollback do título + mensagem.
 */
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockShellObjs: Array<Record<string, unknown>> = [];
jest.mock('@/components/ficha/ficha-workshop-shell', () => ({
  FichaWorkshopShell: (props: { obj: Record<string, unknown> }) => {
    mockShellObjs.push(props.obj);
    return <div data-testid="ficha-shell" />;
  },
}));

jest.mock('@/components/ficha/personalizar-button', () => ({
  PersonalizarFichaButton: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

// Tarefa D — gate de escrita do rename canônico (espelha o backend).
const mockCan = jest.fn((_key: string) => true);
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: (key: string) => mockCan(key),
}));

jest.mock('@/lib/api', () => ({
  Entities: { get: jest.fn() },
  Ontology: { getNode: jest.fn(), objectTypeSchema: jest.fn(), updateNode: jest.fn() },
}));

jest.mock('@/lib/api/cctv', () => ({
  Cctv: { cctvEntity: jest.fn(), entityUpdate: jest.fn() },
}));

import FichaPage from '@/app/ficha/[id]/page';
import { Entities, Ontology } from '@/lib/api';
import { Cctv } from '@/lib/api/cctv';
import { FICHA_SEEDS, pickFichaSeed } from '@/lib/workshop/seeds/ficha';

const entitiesGet = Entities.get as jest.Mock;
const getNode = Ontology.getNode as jest.Mock;
const objectTypeSchema = Ontology.objectTypeSchema as jest.Mock;
const updateNode = Ontology.updateNode as jest.Mock;
const cctvEntity = Cctv.cctvEntity as jest.Mock;

const NODE = {
  id: 'node-conn-1',
  name: 'Coletor G1',
  node_type: 'connector',
  properties: { url: 'https://g1.globo.com', metodo: 'GET', ativo: true },
  schema_definition: {},
  description: '',
  version: 3,
  created_by: 'ferreira',
  signed_hash: null,
  created_at: '2026-06-01T12:00:00Z',
  updated_at: null,
};

const ENTITY = {
  id: 'ent-1',
  name: 'João da Silva',
  entity_type: 'pessoa',
  properties: { cpf: '123.456.789-00' },
  classification: 'restrito',
  signed_hash: null,
  version: 1,
  created_by: 'ferreira',
  created_at: '2026-06-01T12:00:00Z',
  updated_at: null,
};

async function renderPage(id: string) {
  // `use(params)` suspende — o render precisa ser aguardado dentro de act.
  await act(async () => {
    render(
      <React.Suspense fallback={<div data-testid="ficha-susp" />}>
        <FichaPage params={Promise.resolve({ id })} />
      </React.Suspense>,
    );
  });
}

beforeEach(() => {
  mockShellObjs.length = 0;
  entitiesGet.mockReset();
  getNode.mockReset();
  objectTypeSchema.mockReset();
  updateNode.mockReset();
  cctvEntity.mockReset();
  mockCan.mockReset();
  mockCan.mockReturnValue(true);
});

describe('/ficha/[id] — fallback pra OntologyNode canônico', () => {
  it('resolve id de OntologyNode: nome, tipo humano e obj canônico no shell', async () => {
    entitiesGet.mockRejectedValue(new Error('404'));
    cctvEntity.mockRejectedValue(new Error('404'));
    getNode.mockResolvedValue(NODE);
    objectTypeSchema.mockResolvedValue({
      kind: 'connector',
      display_name: 'Conector HTTP',
      title_property: 'name',
      count: 1,
      properties: [],
      links: [],
      actions: [],
    });

    await renderPage('node-conn-1');

    expect(await screen.findByText('Coletor G1')).toBeInTheDocument();
    // Tipo humano do type-def no subtítulo (não o kind cru).
    expect(screen.getByText(/Conector HTTP · node-conn-1/)).toBeInTheDocument();
    expect(getNode).toHaveBeenCalledWith('node-conn-1');

    const obj = mockShellObjs.at(-1)!;
    expect(obj.__canonical).toBe(true);
    expect(obj.entity_type).toBe('connector');
    expect(obj.__type_label).toBe('Conector HTTP');
    expect((obj.properties as Record<string, unknown>).url).toBe(
      'https://g1.globo.com',
    );
    // Tarefa D — nó canônico TAMBÉM renomeia (via Ontology.updateNode),
    // gated pela perm de escrita do backend.
    expect(screen.getByTestId('ficha-rename')).toBeInTheDocument();
    expect(mockCan).toHaveBeenCalledWith('ontology.objects.write');
  });

  it('type-def indisponível → fallback honesto pro node_type', async () => {
    entitiesGet.mockRejectedValue(new Error('404'));
    cctvEntity.mockRejectedValue(new Error('404'));
    getNode.mockResolvedValue(NODE);
    objectTypeSchema.mockRejectedValue(new Error('500'));

    await renderPage('node-conn-1');

    expect(await screen.findByText('Coletor G1')).toBeInTheDocument();
    expect(screen.getByText(/connector · node-conn-1/)).toBeInTheDocument();
  });

  it('id de Entity → comportamento atual intacto (sem fallback canônico)', async () => {
    entitiesGet.mockResolvedValue(ENTITY);

    await renderPage('ent-1');

    expect(await screen.findByText('João da Silva')).toBeInTheDocument();
    expect(getNode).not.toHaveBeenCalled();
    const obj = mockShellObjs.at(-1)!;
    expect(obj.__canonical).toBeUndefined();
    expect(screen.getByTestId('ficha-rename')).toBeInTheDocument();
  });

  it('canônico SEM perm ontology.objects.write → rename ausente', async () => {
    mockCan.mockImplementation((key: string) => key !== 'ontology.objects.write');
    entitiesGet.mockRejectedValue(new Error('404'));
    cctvEntity.mockRejectedValue(new Error('404'));
    getNode.mockResolvedValue(NODE);
    objectTypeSchema.mockRejectedValue(new Error('500'));

    await renderPage('node-conn-1');

    expect(await screen.findByText('Coletor G1')).toBeInTheDocument();
    expect(screen.queryByTestId('ficha-rename')).not.toBeInTheDocument();
  });

  it('id inexistente em Entity, CCTV e ontologia → estado honesto', async () => {
    entitiesGet.mockRejectedValue(new Error('404'));
    cctvEntity.mockRejectedValue(new Error('404'));
    getNode.mockRejectedValue(new Error('404'));

    await renderPage('nao-existe');

    expect(await screen.findByText('Ficha não encontrada')).toBeInTheDocument();
  });
});

describe('Tarefa D — rename inline do nó canônico', () => {
  const setupCanonical = async () => {
    entitiesGet.mockRejectedValue(new Error('404'));
    cctvEntity.mockRejectedValue(new Error('404'));
    getNode.mockResolvedValue(NODE);
    objectTypeSchema.mockResolvedValue({
      kind: 'connector',
      display_name: 'Conector HTTP',
      title_property: 'name',
      count: 1,
      properties: [],
      links: [],
      actions: [],
    });
    await renderPage('node-conn-1');
    expect(await screen.findByText('Coletor G1')).toBeInTheDocument();
  };

  const typeAndSave = async (name: string) => {
    fireEvent.click(screen.getByTestId('ficha-rename'));
    const input = await screen.findByTestId('ficha-rename-input');
    fireEvent.change(input, { target: { value: name } });
    // Enter dispara o save async — act flusha o otimista + resposta.
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
  };

  it('salvar chama Ontology.updateNode(id, {name}) e atualiza o título', async () => {
    updateNode.mockResolvedValue({ ...NODE, name: 'Coletor Norte', version: 4 });
    await setupCanonical();

    await typeAndSave('Coletor Norte');

    await waitFor(() =>
      expect(updateNode).toHaveBeenCalledWith('node-conn-1', { name: 'Coletor Norte' }),
    );
    // Endpoint do CCTV NÃO entra no caminho canônico.
    expect(Cctv.entityUpdate).not.toHaveBeenCalled();
    expect(await screen.findByText('Coletor Norte')).toBeInTheDocument();
    expect(screen.queryByText('Coletor G1')).not.toBeInTheDocument();
  });

  it('erro no updateNode → rollback do título + mensagem visível', async () => {
    updateNode.mockRejectedValue(new Error('403: sem permissão de escrita'));
    await setupCanonical();

    await typeAndSave('Nome Quebrado');

    await waitFor(() => expect(updateNode).toHaveBeenCalled());
    // Rollback otimista: o título volta pro nome anterior.
    expect(await screen.findByText('Coletor G1')).toBeInTheDocument();
    expect(screen.queryByText('Nome Quebrado')).not.toBeInTheDocument();
    // Mensagem de erro fica visível pro operador.
    expect(await screen.findByTestId('ficha-rename-error')).toHaveTextContent(
      /403: sem permissão de escrita/,
    );
  });
});

describe('seed canônica da ficha (Workshop surface entity_ficha)', () => {
  it('pickFichaSeed(kind desconhecida, {canonical}) → seed canônica genérica', () => {
    const seed = pickFichaSeed('connector', { canonical: true });
    expect(seed.id).toBe('seed.security.ficha.canonical');
  });

  it('kind com seed específica vence mesmo com canonical', () => {
    expect(pickFichaSeed('person', { canonical: true })).toBe(FICHA_SEEDS.person);
    expect(pickFichaSeed('pessoa', { canonical: true })).toBe(FICHA_SEEDS.person);
  });

  it('sem flag canonical → default antigo intacto (regressão Entity)', () => {
    expect(pickFichaSeed('connector')).toBe(FICHA_SEEDS.default);
    expect(pickFichaSeed(undefined)).toBe(FICHA_SEEDS.default);
  });

  it('seed canônica tem identificação + relation_list navegável pra /ficha', () => {
    const seed = FICHA_SEEDS.canonical;
    const types = seed.layout.root.map((n) => n.widget.type);
    expect(types).toContain('security.ficha.identificacao');
    const rel = seed.layout.root.find((n) => n.widget.type === 'relation_list');
    expect(rel).toBeDefined();
    const props = (rel!.widget.props ?? {}) as Record<string, unknown>;
    expect(props.source).toBe('obj');
    expect(props.href_template).toBe('/ficha/{{id}}');
  });
});
