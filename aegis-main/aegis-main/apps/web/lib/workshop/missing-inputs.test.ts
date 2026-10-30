import {
  parseMissingInputError,
  humanizeApiError,
  humanizeInputName,
  nameToField,
} from './missing-inputs';

describe('parseMissingInputError — reconhece TODA forma de missing-input', () => {
  it('missing_required_params (ação) → fields com component + needsSelection', () => {
    const raw = JSON.stringify({
      detail: {
        error: 'missing_required_params',
        params: [{ name: 'to', label: 'Destinatário', type: 'String', component: { type: 'text' } }],
        needs_selection: false,
        message: 'Preencha para executar: Destinatário.',
      },
    });
    const g = parseMissingInputError(raw);
    expect(g).not.toBeNull();
    expect(g!.kind).toBe('action_params');
    expect(g!.needsSelection).toBe(false);
    expect(g!.fields[0]).toMatchObject({ key: 'to', label: 'Destinatário', type: 'text' });
  });

  it('agent.run gated: label cru (== name) é humanizado pelo léxico, nunca exposto', () => {
    // O backend manda label == nome técnico para params de skill (image_url, instruction,
    // api_endpoint não têm label humano). O gate precisa mostrar rótulo humano, não a chave.
    const raw = JSON.stringify({
      detail: {
        error: 'missing_required_params',
        params: [
          { name: 'image_url', label: 'image_url', type: 'String', component: { type: 'text', format: 'url' } },
          { name: 'instruction', label: 'instruction', type: 'String', component: { type: 'text' } },
          { name: 'api_endpoint', label: 'api_endpoint', type: 'String' },
        ],
        needs_selection: false,
        message: 'Preencha para executar: image_url, instruction, api_endpoint.',
      },
    });
    const g = parseMissingInputError(raw);
    expect(g).not.toBeNull();
    const labelOf = (key: string) => g!.fields.find((f) => f.key === key)?.label;
    expect(labelOf('image_url')).toBe('URL da imagem');
    expect(labelOf('instruction')).toBe('O que detectar');
    expect(labelOf('api_endpoint')).toBe('Endpoint da API');
    // nenhum rótulo cru com underscore vaza pro operador
    expect(g!.fields.every((f) => !/_/.test(f.label ?? ''))).toBe(true);
  });

  it('function_signature_violation (Function) → fields a partir de missing[]', () => {
    const raw = JSON.stringify({
      detail: {
        error: 'function_signature_violation',
        missing: ['status', 'data_inicio', 'data_fim'],
        type_errors: [],
        message: 'missing required input(s): status, data_inicio, data_fim',
      },
    });
    const g = parseMissingInputError(raw);
    expect(g).not.toBeNull();
    expect(g!.kind).toBe('function_signature');
    expect(g!.fields.map((f) => f.key)).toEqual(['status', 'data_inicio', 'data_fim']);
    // inferência de componente por nome: datas viram date
    expect(g!.fields.find((f) => f.key === 'data_inicio')!.type).toBe('date');
    // rótulo humano, nunca a chave crua
    expect(g!.fields.find((f) => f.key === 'data_fim')!.label).toBe('Data fim');
  });

  it('string solta "missing required input(s): a, b" → generic_missing', () => {
    const g = parseMissingInputError('missing required input(s): hashtag, termo');
    expect(g).not.toBeNull();
    expect(g!.kind).toBe('generic_missing');
    expect(g!.fields.map((f) => f.key)).toEqual(['hashtag', 'termo']);
  });

  it('detail STRING crua do /evaluate (422, str) → reconhece (não vaza)', () => {
    // workshop.py /evaluate faz HTTPException(422, str(e)) → detail é string crua.
    const raw = JSON.stringify({ detail: 'missing required input(s): status, data_fim' });
    const g = parseMissingInputError(raw);
    expect(g).not.toBeNull();
    expect(g!.fields.map((f) => f.key)).toEqual(['status', 'data_fim']);
  });

  it('detail STRING em PT (pv26 "input obrigatório ausente") → reconhece', () => {
    const raw = JSON.stringify({ detail: "input obrigatório ausente: 'cpf'" });
    const g = parseMissingInputError(raw);
    expect(g).not.toBeNull();
    expect(g!.fields.map((f) => f.key)).toEqual(['cpf']);
  });

  it('needs_selection=true é propagado (ação contextual sem objeto)', () => {
    const raw = JSON.stringify({
      detail: { error: 'missing_required_params', params: [{ name: 'imovel_id' }], needs_selection: true, message: 'Selecione um item…' },
    });
    const g = parseMissingInputError(raw);
    expect(g!.needsSelection).toBe(true);
  });

  it('erro NÃO relacionado a input → null (cai no humanizeApiError)', () => {
    expect(parseMissingInputError(JSON.stringify({ detail: 'permission denied' }))).toBeNull();
    expect(parseMissingInputError('Internal Server Error')).toBeNull();
  });
});

describe('humanizeApiError — NUNCA devolve JSON cru', () => {
  it('extrai detail.message do 422', () => {
    expect(humanizeApiError(JSON.stringify({ detail: { message: 'Algo deu errado.' } }))).toBe('Algo deu errado.');
  });
  it('extrai detail string', () => {
    expect(humanizeApiError(JSON.stringify({ detail: 'Acesso negado.' }))).toBe('Acesso negado.');
  });
  it('texto não-JSON legível passa direto', () => {
    expect(humanizeApiError('Tempo limite excedido')).toBe('Tempo limite excedido');
  });
  it('JSON sem message → mensagem genérica, nunca as chaves cruas', () => {
    const out = humanizeApiError(JSON.stringify({ detail: { error: 'x', code: 42 } }));
    expect(out).not.toContain('{');
    expect(out).not.toContain('detail');
  });
});

describe('humanizeInputName + nameToField', () => {
  it('léxico transversal: to→Destinatário, data_inicio→Data início', () => {
    expect(humanizeInputName('to')).toBe('Destinatário');
    expect(humanizeInputName('data_inicio')).toBe('Data início');
  });
  it('nome desconhecido → Título humano (sem chave crua)', () => {
    expect(humanizeInputName('nome_do_responsavel')).toBe('Nome Do Responsavel');
  });
  it('nameToField infere componente: email→email, preco→number', () => {
    expect(nameToField('email_corretor')).toMatchObject({ type: 'text', format: 'email' });
    expect(nameToField('preco').type).toBe('number');
  });
});
