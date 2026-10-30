/**
 * FRENTE A — Roteamento da Busca avançada por TIPO canônico.
 *
 * BUG PROVADO: o casamento campo-avançado → fonte era por IGUALDADE LITERAL de
 * string (chave do campo == accept da fonte). O catálogo fragmenta "documento"
 * em 3 accepts (cpf, cpf_cnpj, cnpj) e o form mostrava 3 campos. Resultado: CPF
 * digitado no campo `cpf` NÃO satisfazia a fonte `cpf_cnpj` (gate
 * fieldProvides=false → "Esta fonte não aceita") e o valor não chegava na chave
 * que o adapter ESTRITO lê (maigret lê username; mr_cnpj/opencnpj leem cnpj;
 * doc_validar lê cpf_cnpj).
 *
 * Estes testes provam a camada de TIPO canônico:
 *   - fieldValueForAccept casa por kind (doc/username/email/phone), validando
 *     formato (11 díg = CPF, 14 = CNPJ) para não mandar CNPJ a accept só-CPF.
 *   - o gate do runWorker não bloqueia fontes doc/username quando o campo certo
 *     está preenchido (mesmo com query=nome).
 *   - searchMcp PER-SOURCE entrega o valor NA CHAVE declarada de cada adapter
 *     (mr_cnpj←cnpj, doc_validar←cpf_cnpj), sem shotgun.
 */
import { fieldValueForAccept, acceptKind } from '@/lib/buscar/classify';
import { runWorker, FonteNaoAceitaError } from '@/lib/buscar/workers';
import type { SourceDef } from '@/lib/buscar/types';

jest.mock('@/lib/api/mcp', () => ({
  Mcp: { invoke: jest.fn().mockResolvedValue({ result: { items: [] } }) },
}));
jest.mock('@/lib/api', () => ({ Entities: { list: jest.fn() } }));
jest.mock('@/lib/api/cctv', () => ({
  Cctv: { streams: { list: jest.fn(), detections: jest.fn() } },
  detectionFrameUrl: () => undefined,
  nonAggregate: () => true,
}));

const { Mcp } = jest.requireMock('@/lib/api/mcp') as { Mcp: { invoke: jest.Mock } };

const CPF = '00000000000'; // 11 dígitos
const CNPJ = '00000000000191'; // 14 dígitos (Banco do Brasil)

describe('acceptKind — accept → kind canônico (espelha backend _ACCEPTS_ALIASES)', () => {
  it('cpf/cpf_cnpj/cnpj → "doc"', () => {
    expect(acceptKind('cpf')).toBe('doc');
    expect(acceptKind('cpf_cnpj')).toBe('doc');
    expect(acceptKind('cnpj')).toBe('doc');
  });
  it('username/handle/usuario/perfil → "username"', () => {
    expect(acceptKind('username')).toBe('username');
    expect(acceptKind('handle')).toBe('username');
    expect(acceptKind('usuario')).toBe('username');
    expect(acceptKind('perfil')).toBe('username');
  });
  it('email/telefone variações → "email"/"phone"', () => {
    expect(acceptKind('email')).toBe('email');
    expect(acceptKind('telefone')).toBe('phone');
    expect(acceptKind('numero')).toBe('phone');
    expect(acceptKind('phone')).toBe('phone');
  });
  it('placa e desconhecidos → o próprio accept', () => {
    expect(acceptKind('placa')).toBe('placa');
    expect(acceptKind('uf')).toBe('uf');
  });
});

describe('fieldValueForAccept — casa por TIPO e valida formato de documento', () => {
  it('campo cpf (11 díg) satisfaz accept cpf_cnpj', () => {
    expect(fieldValueForAccept({ cpf: CPF }, 'cpf_cnpj')).toBe(CPF);
  });
  it('campo cnpj (14 díg) satisfaz accept cpf_cnpj E accept cnpj', () => {
    expect(fieldValueForAccept({ cnpj: CNPJ }, 'cpf_cnpj')).toBe(CNPJ);
    expect(fieldValueForAccept({ cnpj: CNPJ }, 'cnpj')).toBe(CNPJ);
  });
  it('14 díg NÃO satisfaz accept cpf (só-CPF não recebe CNPJ)', () => {
    expect(fieldValueForAccept({ cnpj: CNPJ }, 'cpf')).toBeNull();
  });
  it('11 díg NÃO satisfaz accept cnpj (só-CNPJ não recebe CPF)', () => {
    expect(fieldValueForAccept({ cpf: CPF }, 'cnpj')).toBeNull();
  });
  it('campo canônico "doc" alcança qualquer accept-documento conforme formato', () => {
    expect(fieldValueForAccept({ doc: CPF }, 'cpf')).toBe(CPF);
    expect(fieldValueForAccept({ doc: CPF }, 'cpf_cnpj')).toBe(CPF);
    expect(fieldValueForAccept({ doc: CPF }, 'cnpj')).toBeNull();
    expect(fieldValueForAccept({ doc: CNPJ }, 'cnpj')).toBe(CNPJ);
    expect(fieldValueForAccept({ doc: CNPJ }, 'cpf_cnpj')).toBe(CNPJ);
    expect(fieldValueForAccept({ doc: CNPJ }, 'cpf')).toBeNull();
  });
  it('strip de máscara: CPF/CNPJ formatado vira só dígitos', () => {
    expect(fieldValueForAccept({ cnpj: '00.000.000/0001-91' }, 'cnpj')).toBe(CNPJ);
    expect(fieldValueForAccept({ doc: '000.000.000-00' }, 'cpf')).toBe(CPF);
  });
  it('username casa por kind entre chaves equivalentes (usuario→username)', () => {
    expect(fieldValueForAccept({ usuario: 'smachs' }, 'username')).toBe('smachs');
    expect(fieldValueForAccept({ username: 'smachs' }, 'handle')).toBe('smachs');
  });
  it('email/phone casam por kind; phone vira dígitos', () => {
    expect(fieldValueForAccept({ email: 'a@b.com' }, 'email')).toBe('a@b.com');
    expect(fieldValueForAccept({ telefone: '(11) 99999-9999' }, 'phone')).toBe('11999999999');
  });
  it('vazio / ausente → null', () => {
    expect(fieldValueForAccept({}, 'cpf_cnpj')).toBeNull();
    expect(fieldValueForAccept({ cpf: '' }, 'cpf_cnpj')).toBeNull();
    expect(fieldValueForAccept(undefined, 'username')).toBeNull();
  });
});

// ── Fontes ESTRITAS que provaram a regressão ao vivo ──────────────────────────
const maigret: SourceDef = {
  key: 'maigret_username@v1',
  label: 'Maigret · username',
  category: 'username',
  mcpTool: 'maigret_username@v1',
};
const mrCnpj: SourceDef = {
  key: 'mr_cnpj@v1',
  label: 'Minha Receita · CNPJ',
  category: 'empresa-br',
  mcpTool: 'mr_cnpj@v1',
};
const docValidar: SourceDef = {
  key: 'doc_validar@v1',
  label: 'Documento · validar',
  category: 'empresa-br',
  mcpTool: 'doc_validar@v1',
};

describe('runWorker gate (Fase 2) — query=nome + campo avançado certo NÃO bloqueia fonte estrita', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maigret: query=nome, mas campo username preenchido → INVOCA (não FonteNaoAceita)', async () => {
    await runWorker(maigret, 'fulano da silva', { username: 'smachs' }, ['username']);
    expect(Mcp.invoke).toHaveBeenCalledTimes(1);
  });

  it('mr_cnpj: query=nome, campo cnpj preenchido → INVOCA', async () => {
    await runWorker(mrCnpj, 'fulano da silva', { cnpj: CNPJ }, ['cnpj']);
    expect(Mcp.invoke).toHaveBeenCalledTimes(1);
  });

  it('doc_validar (accept cpf_cnpj): query=nome, campo cpf preenchido → INVOCA', async () => {
    await runWorker(docValidar, 'fulano da silva', { cpf: CPF }, ['cpf_cnpj']);
    expect(Mcp.invoke).toHaveBeenCalledTimes(1);
  });

  it('mr_cnpj: query=nome, NENHUM campo doc → PULA (FonteNaoAceita)', async () => {
    await expect(
      runWorker(mrCnpj, 'fulano da silva', {}, ['cnpj']),
    ).rejects.toBeInstanceOf(FonteNaoAceitaError);
    expect(Mcp.invoke).not.toHaveBeenCalled();
  });

  it('mr_cnpj (só aceita cnpj): campo cpf 11 díg → PULA (formato não casa cnpj)', async () => {
    await expect(
      runWorker(mrCnpj, 'fulano da silva', { cpf: CPF }, ['cnpj']),
    ).rejects.toBeInstanceOf(FonteNaoAceitaError);
    expect(Mcp.invoke).not.toHaveBeenCalled();
  });
});

describe('searchMcp PER-SOURCE (Fase 3) — valor chega na CHAVE declarada de cada adapter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('campo doc=CNPJ → mr_cnpj recebe params.cnpj (não cpf_cnpj solto)', async () => {
    await runWorker(mrCnpj, 'fulano da silva', { doc: CNPJ }, ['cnpj']);
    const params = Mcp.invoke.mock.calls[0][1] as Record<string, unknown>;
    expect(params.cnpj).toBe(CNPJ);
  });

  it('campo doc=CPF → doc_validar recebe params.cpf_cnpj', async () => {
    await runWorker(docValidar, 'fulano da silva', { doc: CPF }, ['cpf_cnpj']);
    const params = Mcp.invoke.mock.calls[0][1] as Record<string, unknown>;
    expect(params.cpf_cnpj).toBe(CPF);
  });

  it('campo cpf (11 díg) → fonte cpf_cnpj recebe params.cpf_cnpj=CPF', async () => {
    await runWorker(docValidar, 'fulano da silva', { cpf: CPF }, ['cpf_cnpj']);
    const params = Mcp.invoke.mock.calls[0][1] as Record<string, unknown>;
    expect(params.cpf_cnpj).toBe(CPF);
  });

  it('campo username → maigret recebe params.username', async () => {
    await runWorker(maigret, 'fulano da silva', { usuario: 'smachs' }, ['username']);
    const params = Mcp.invoke.mock.calls[0][1] as Record<string, unknown>;
    expect(params.username).toBe('smachs');
  });

  it('CNPJ no campo doc NÃO escreve params.cpf para fonte que só aceita cnpj', async () => {
    await runWorker(mrCnpj, 'fulano da silva', { doc: CNPJ }, ['cnpj']);
    const params = Mcp.invoke.mock.calls[0][1] as Record<string, unknown>;
    expect(params.cnpj).toBe(CNPJ);
    expect(params.cpf).toBeUndefined();
  });
});
