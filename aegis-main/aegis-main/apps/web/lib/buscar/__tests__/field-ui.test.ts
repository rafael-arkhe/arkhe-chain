/**
 * field-ui.test.ts — prova do MOTOR DATA-DRIVEN (FRENTE A).
 *
 * O ponto central: applyMask é UM engine genérico — CPF, CNPJ, telefone, CEP e
 * placa saem todos do MESMO código, só mudando o pattern (dado). validateValue
 * despacha por estratégia (DV de CPF/CNPJ portado do backend). E a PROVA de
 * modularidade: adicionar uma linha em FIELD_FORMATS faz o campo formatar/validar
 * sem nenhum código novo.
 */
import {
  applyMask,
  unmaskValue,
  validateValue,
  fieldUIForKind,
  cpfValido,
  cnpjValido,
  FIELD_FORMATS,
  type FormatSpec,
} from '../field-ui';
import { fieldKind } from '../classify';

describe('applyMask — engine genérico (mesmo código, patterns diferentes)', () => {
  it('formata CPF com ###.###.###-##', () => {
    expect(applyMask('###.###.###-##', '52998224725')).toBe('529.982.247-25');
  });

  it('formata CNPJ com ##.###.###/####-##', () => {
    expect(applyMask('##.###.###/####-##', '11222333000181')).toBe('11.222.333/0001-81');
  });

  it('formata telefone com (##) #####-####', () => {
    expect(applyMask('(##) #####-####', '11987654321')).toBe('(11) 98765-4321');
  });

  it('formata CEP com #####-###', () => {
    expect(applyMask('#####-###', '01310100')).toBe('01310-100');
  });

  it('formata placa Mercosul com LLL#L## (letra maiúscula automática)', () => {
    expect(applyMask('LLL#L##', 'abc1d23')).toBe('ABC1D23');
  });

  it('é incremental: pattern parcialmente preenchido não vaza literais à toa', () => {
    expect(applyMask('###.###.###-##', '529')).toBe('529');
    expect(applyMask('###.###.###-##', '5299')).toBe('529.9');
  });

  it('descarta caracteres que não casam a classe do slot', () => {
    // letras num pattern só-dígito são ignoradas; sobram os dígitos.
    expect(applyMask('###.###.###-##', '5a2b9982247c25')).toBe('529.982.247-25');
  });

  it('passthrough quando não há pattern', () => {
    expect(applyMask('', 'qualquer texto')).toBe('qualquer texto');
  });

  it('para de consumir quando o pattern enche (não excede o formato)', () => {
    // 14 dígitos no pattern de CPF (11 slots) → só os 11 primeiros entram.
    expect(applyMask('###.###.###-##', '52998224725999')).toBe('529.982.247-25');
  });
});

describe('validateValue — DV de CPF/CNPJ (portado do backend) + demais', () => {
  it('CPF válido passa, inválido devolve chave', () => {
    expect(validateValue(FIELD_FORMATS.cpf, '52998224725')).toBeNull();
    expect(validateValue(FIELD_FORMATS.cpf, '52998224724')).toBe('buscar.campo.erro.cpf');
  });

  it('CNPJ válido passa, inválido devolve chave', () => {
    expect(validateValue(FIELD_FORMATS.cnpj, '11222333000181')).toBeNull();
    expect(validateValue(FIELD_FORMATS.cnpj, '11222333000180')).toBe('buscar.campo.erro.cnpj');
  });

  it('rejeita sequência repetida (DV trivial) — CPF e CNPJ', () => {
    expect(cpfValido('00000000000')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });

  it('CEP exige 8 dígitos', () => {
    expect(validateValue(FIELD_FORMATS.cep, '01310100')).toBeNull();
    expect(validateValue(FIELD_FORMATS.cep, '0131010')).toBe('buscar.campo.erro.cep');
  });

  it('placa aceita Mercosul e antiga, rejeita lixo', () => {
    expect(validateValue(FIELD_FORMATS.placa, 'ABC1D23')).toBeNull(); // Mercosul
    expect(validateValue(FIELD_FORMATS.placa, 'ABC1234')).toBeNull(); // antiga
    expect(validateValue(FIELD_FORMATS.placa, '12345')).toBe('buscar.campo.erro.placa');
  });

  it('telefone aceita 10 ou 11 dígitos', () => {
    expect(validateValue(FIELD_FORMATS.phone, '11987654321')).toBeNull(); // 11
    expect(validateValue(FIELD_FORMATS.phone, '1133334444')).toBeNull(); // 10
    expect(validateValue(FIELD_FORMATS.phone, '119876')).toBe('buscar.campo.erro.telefone');
  });

  it('email valida regex', () => {
    expect(validateValue(FIELD_FORMATS.email, 'a@b.com')).toBeNull();
    expect(validateValue(FIELD_FORMATS.email, 'invalido')).toBe('buscar.campo.erro.email');
  });

  it('username valida charset de handle', () => {
    expect(validateValue(FIELD_FORMATS.username, 'fulano.de_silva-1')).toBeNull();
    expect(validateValue(FIELD_FORMATS.username, 'com espaço')).toBe('buscar.campo.erro.username');
  });

  it('vazio é sempre válido (campo opcional)', () => {
    expect(validateValue(FIELD_FORMATS.cpf, '')).toBeNull();
    expect(validateValue(FIELD_FORMATS.email, '')).toBeNull();
  });
});

describe('doc — auto CPF↔CNPJ pelo tamanho (mask é função, validate é cpf_cnpj)', () => {
  const ui = fieldUIForKind('doc');

  it('<=11 dígitos → máscara de CPF; 14 → máscara de CNPJ', () => {
    expect(ui.mask('52998224725')).toBe('529.982.247-25');
    expect(ui.mask('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('valida CPF quando 11 díg, CNPJ quando 14, erro genérico no meio', () => {
    expect(ui.validate('52998224725')).toEqual({ ok: true });
    expect(ui.validate('11222333000181')).toEqual({ ok: true });
    expect(ui.validate('529982247')).toEqual({ ok: false, errorKey: 'buscar.campo.erro.cpfCnpj' });
    expect(ui.validate('52998224724')).toEqual({ ok: false, errorKey: 'buscar.campo.erro.cpf' });
  });
});

describe('unmaskValue — derivação do canônico por estratégia', () => {
  it('digits: tira tudo que não é dígito', () => {
    expect(unmaskValue(FIELD_FORMATS.cpf, '529.982.247-25')).toBe('52998224725');
    expect(unmaskValue(FIELD_FORMATS.phone, '(11) 98765-4321')).toBe('11987654321');
  });

  it('stripAt: tira @ inicial e espaço (username)', () => {
    expect(unmaskValue(FIELD_FORMATS.username, '@fulano')).toBe('fulano');
    expect(unmaskValue(FIELD_FORMATS.username, '  fulano  ')).toBe('fulano');
  });

  it('trim: só remove espaços (email/placa)', () => {
    expect(unmaskValue(FIELD_FORMATS.email, '  a@b.com ')).toBe('a@b.com');
  });
});

describe('fieldUIForKind — só lookup + engine; inputKind correto', () => {
  it('uf → select, date → date, demais → masked', () => {
    expect(fieldUIForKind('uf').inputKind).toBe('select');
    expect(fieldUIForKind('date').inputKind).toBe('date');
    expect(fieldUIForKind('cpf').inputKind).toBe('masked');
    expect(fieldUIForKind('placa').inputKind).toBe('masked');
  });

  it('kind desconhecido cai em text (passthrough), nunca quebra', () => {
    const ui = fieldUIForKind('algo_que_nao_existe');
    expect(ui.inputKind).toBe('masked');
    expect(ui.mask('xyz 123')).toBe('xyz 123');
    expect(ui.validate('qualquer')).toEqual({ ok: true });
  });
});

describe('fieldKind (classify) resolve TODO campo avançado a um KIND com formato', () => {
  it.each([
    ['cpf', 'doc'],
    ['cnpj', 'doc'],
    ['cpf_cnpj', 'doc'],
    ['documento', 'doc'],
    ['telefone', 'phone'],
    ['celular', 'phone'],
    ['email', 'email'],
    ['username', 'username'],
    ['handle', 'username'],
    ['placa', 'placa'],
    ['cep', 'cep'],
    ['uf', 'uf'],
    ['estado', 'uf'],
    ['data_nascimento', 'date'],
    ['datainicio', 'date'],
    ['nome_mae', 'text'],
    ['url', 'text'], // tem acceptKind 'url' mas SEM formato → texto livre
  ])('fieldKind(%s) → %s', (name, expected) => {
    expect(fieldKind(name)).toBe(expected);
  });
});

/* -------------------------------------------------------------------------- */
/* PROVA DE MODULARIDADE — adicionar uma LINHA de DADO basta.                  */
/* -------------------------------------------------------------------------- */

describe('modularidade: um formato novo = UMA LINHA em FIELD_FORMATS', () => {
  it('um FormatSpec arbitrário formata/valida sem código novo (mesmo engine)', () => {
    // Simula a linha que se acrescentaria à tabela — ex.: título de eleitor.
    // Nenhuma função foi escrita pra ele: o engine genérico faz tudo.
    const titulo: FormatSpec = {
      mask: '#### #### ####',
      validate: 'none',
      unmask: 'digits',
      placeholderKey: 'buscar.campo.ph.text',
    };
    expect(applyMask(titulo.mask as string, '123456780910')).toBe('1234 5678 0910');
    expect(unmaskValue(titulo, '1234 5678 0910')).toBe('123456780910');
    expect(validateValue(titulo, '123456780910')).toBeNull();
  });

  it('CEP — provando que era só dado: a linha cep do FIELD_FORMATS já formata', () => {
    const ui = fieldUIForKind('cep');
    expect(ui.mask('01310100')).toBe('01310-100');
    expect(ui.unmask('01310-100')).toBe('01310100');
    expect(ui.validate('01310100')).toEqual({ ok: true });
  });
});

/* -------------------------------------------------------------------------- */
/* KINDS NOVOS (multiselect/duration/toggle) — ADD, sem quebrar os 11.        */
/* -------------------------------------------------------------------------- */

describe('os 11 formatos originais continuam intactos', () => {
  it('FIELD_FORMATS ainda tem todos os 11 kinds originais', () => {
    for (const k of [
      'doc', 'cpf', 'cnpj', 'cpf_cnpj', 'phone', 'cep', 'placa',
      'email', 'username', 'uf', 'date', 'text',
    ]) {
      expect(FIELD_FORMATS[k]).toBeDefined();
    }
  });

  it('inputKind dos originais inalterado (select/date/masked)', () => {
    expect(fieldUIForKind('uf').inputKind).toBe('select');
    expect(fieldUIForKind('date').inputKind).toBe('date');
    expect(fieldUIForKind('cpf').inputKind).toBe('masked');
    expect(fieldUIForKind('text').inputKind).toBe('masked');
  });
});

describe('toggle — switch genérico, sem máscara nem validação', () => {
  const ui = fieldUIForKind('toggle');
  it('inputKind toggle; canônico passthrough; nunca dá erro', () => {
    expect(ui.inputKind).toBe('toggle');
    expect(ui.validate('1')).toEqual({ ok: true });
    expect(ui.validate('')).toEqual({ ok: true });
    expect(ui.unmask(' 1 ')).toBe('1');
  });
});

describe('duration — só dígitos + faixa min/max (overrides de ui_fields)', () => {
  it('inputKind duration; unmask digits; unitKey default unit.seconds', () => {
    const ui = fieldUIForKind('duration');
    expect(ui.inputKind).toBe('duration');
    expect(ui.unmask('20s')).toBe('20');
    expect(ui.unitKey).toBe('unit.seconds');
  });

  it('faixa: dentro de [min,max] ok; fora devolve chave de duração', () => {
    const ui = fieldUIForKind('duration', { min: 5, max: 240, default: 20 });
    expect(ui.min).toBe(5);
    expect(ui.max).toBe(240);
    expect(ui.default).toBe(20);
    expect(ui.validate('20')).toEqual({ ok: true });
    expect(ui.validate('5')).toEqual({ ok: true });
    expect(ui.validate('240')).toEqual({ ok: true });
    expect(ui.validate('4')).toEqual({ ok: false, errorKey: 'buscar.campo.erro.duracao' });
    expect(ui.validate('241')).toEqual({ ok: false, errorKey: 'buscar.campo.erro.duracao' });
  });

  it('sem faixa declarada, qualquer número é válido', () => {
    const ui = fieldUIForKind('duration');
    expect(ui.validate('99999')).toEqual({ ok: true });
  });

  it('validateValue direto: faixa via spec (não via VALIDATORS)', () => {
    const spec: FormatSpec = {
      mask: '', validate: 'duration', unmask: 'digits',
      min: 10, max: 30, placeholderKey: 'buscar.campo.ph.duration',
    };
    expect(validateValue(spec, '20')).toBeNull();
    expect(validateValue(spec, '9')).toBe('buscar.campo.erro.duracao');
    expect(validateValue(spec, '')).toBeNull(); // vazio sempre ok
  });
});

describe('fieldUIForKind overrides: não apaga o base com undefined', () => {
  it('override parcial mantém unitKey do base quando não sobreposto', () => {
    const ui = fieldUIForKind('duration', { min: 5, max: 240 });
    expect(ui.unitKey).toBe('unit.seconds'); // veio do base, não foi apagado
    expect(ui.min).toBe(5);
  });
});

/* -------------------------------------------------------------------------- */
/* P1 FUNDAÇÃO — kinds NOVOS number/select (ADD, sem quebrar os anteriores).   */
/* -------------------------------------------------------------------------- */

describe('number — inteiro SEM unidade + faixa min/max (overrides de ui_fields)', () => {
  it('inputKind number; unmask só dígitos; SEM unitKey (≠ duration)', () => {
    const ui = fieldUIForKind('number');
    expect(ui.inputKind).toBe('number');
    expect(ui.unmask(' 42 ')).toBe('42');
    expect(ui.unmask('1.234')).toBe('1234'); // strip não-dígitos
    expect(ui.unitKey).toBeUndefined();
  });

  it('faixa: dentro de [min,max] ok; fora devolve erro de FAIXA', () => {
    const ui = fieldUIForKind('number', { min: 1, max: 100, default: 20 });
    expect(ui.min).toBe(1);
    expect(ui.max).toBe(100);
    expect(ui.default).toBe(20);
    expect(ui.validate('20')).toEqual({ ok: true });
    expect(ui.validate('1')).toEqual({ ok: true });
    expect(ui.validate('100')).toEqual({ ok: true });
    expect(ui.validate('0')).toEqual({ ok: false, errorKey: 'buscar.campo.erro.faixa' });
    expect(ui.validate('101')).toEqual({ ok: false, errorKey: 'buscar.campo.erro.faixa' });
  });

  it('sem faixa declarada, qualquer inteiro é válido', () => {
    const ui = fieldUIForKind('number');
    expect(ui.validate('99999')).toEqual({ ok: true });
  });

  it('vazio é sempre válido (campo opcional)', () => {
    expect(fieldUIForKind('number', { min: 1, max: 10 }).validate('')).toEqual({ ok: true });
  });

  it('validateValue direto: não-número → erro de número; faixa via spec', () => {
    const spec: FormatSpec = {
      mask: '', validate: 'number', unmask: 'digits',
      min: 10, max: 30, placeholderKey: 'buscar.campo.ph.numero',
    };
    expect(validateValue(spec, '20')).toBeNull();
    expect(validateValue(spec, '9')).toBe('buscar.campo.erro.faixa');
    expect(validateValue(spec, '31')).toBe('buscar.campo.erro.faixa');
    expect(validateValue(spec, 'abc')).toBe('buscar.campo.erro.numero');
    expect(validateValue(spec, '')).toBeNull(); // vazio sempre ok
  });
});

describe('select — escolha ÚNICA (enum inline OU catálogo), sem máscara/validação', () => {
  it('inputKind select; canônico = trim; nunca dá erro', () => {
    const ui = fieldUIForKind('select');
    expect(ui.inputKind).toBe('select');
    expect(ui.unmask(' asc ')).toBe('asc');
    expect(ui.validate('asc')).toEqual({ ok: true });
    expect(ui.validate('')).toEqual({ ok: true });
  });

  it('select-uf legado segue inputKind select — não quebrou (mesmo inputKind, render inline)', () => {
    expect(fieldUIForKind('uf').inputKind).toBe('select');
  });
});

describe('modularidade intacta: number/select são ADD, originais preservados', () => {
  it('FIELD_FORMATS ganhou number e select', () => {
    expect(FIELD_FORMATS.number).toBeDefined();
    expect(FIELD_FORMATS.select).toBeDefined();
    expect(FIELD_FORMATS.number.input).toBe('number');
    expect(FIELD_FORMATS.select.input).toBe('select');
  });

  it('todos os kinds anteriores seguem definidos (nada removido)', () => {
    for (const k of [
      'doc', 'cpf', 'cnpj', 'cpf_cnpj', 'phone', 'cep', 'placa',
      'email', 'username', 'uf', 'date', 'text', 'toggle', 'duration', 'multiselect',
    ]) {
      expect(FIELD_FORMATS[k]).toBeDefined();
    }
  });

  it('inputKind dos anteriores inalterado', () => {
    expect(fieldUIForKind('uf').inputKind).toBe('select');
    expect(fieldUIForKind('date').inputKind).toBe('date');
    expect(fieldUIForKind('cpf').inputKind).toBe('masked');
    expect(fieldUIForKind('duration').inputKind).toBe('duration');
    expect(fieldUIForKind('toggle').inputKind).toBe('toggle');
    expect(fieldUIForKind('multiselect').inputKind).toBe('multiselect');
  });
});
