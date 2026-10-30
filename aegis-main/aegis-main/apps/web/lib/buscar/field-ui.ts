/**
 * field-ui.ts — Motor de máscara/validação DIRIGIDO POR DADOS (FRENTE A).
 *
 * Nada de switch por tipo, nada de máscara escrita à mão só pra CNPJ. Um campo é
 * descrito por DADO (FIELD_FORMATS) e um ENGINE GENÉRICO interpreta esse dado:
 *   - applyMask(pattern, raw)  → preenche o pattern (# díg, L letra, A alfanum.)
 *   - unmaskValue(spec, val)   → valor canônico (digits / trim / stripAt)
 *   - validateValue(spec, val) → null | chave i18n, despachado por spec.validate
 *
 * Adicionar um formato novo (ex.: título de eleitor, RENAVAM, IE) é UMA LINHA em
 * FIELD_FORMATS — não código. fieldUIForKind(kind) é só um lookup + o engine.
 *
 * As regras de dígito verificador de CPF/CNPJ são PORTADAS, idênticas, do backend
 * `ontology-module/app/mcp_adapters/doc_validate.py` (_cpf_valido/_cnpj_valido).
 * Mesma regra dos dois lados.
 *
 * Mensagens de erro e placeholders são CHAVES i18n — o componente resolve via
 * useT() (regra dura: nenhuma string visível hardcoded). Multi-domínio: deriva
 * 100% do KIND canônico (acceptKind), ZERO hardcode de vertical.
 */

/* -------------------------------------------------------------------------- */
/* Tipos do MODELO DE DADOS                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Componente semântico do input. Os originais (select/date/masked) seguem
 * dirigidos pela TABELA; os novos (multiselect/duration/toggle/number/select)
 * entram por ADD — todos têm linha genérica em FIELD_FORMATS (multiselect é 100%
 * dinâmico via `ui_fields` do adapter, não por kind fixo).
 *
 * `select` foi GENERALIZADO: continua servindo o select-uf legado (lista fixa de
 * UFs desenhada inline pelo MaskedField, quando SEM options/catalog) E agora a
 * escolha ÚNICA genérica (options de um ENUM inline OU catálogo dinâmico). ADD,
 * sem quebrar o UF — o discriminador é a presença de options/catalog.
 * `number` é inteiro com faixa min/max/step, SEM unidade (≠ duration).
 */
export type FieldInputKind =
  | 'select'
  | 'date'
  | 'masked'
  | 'multiselect'
  | 'duration'
  | 'toggle'
  | 'number';

/** Estratégia de validação despachada por `validateValue`. */
export type ValidateStrategy =
  | 'cpf'
  | 'cnpj'
  | 'cpf_cnpj'
  | 'phone'
  | 'cep'
  | 'placa'
  | 'email'
  | 'username'
  | 'duration'
  | 'number'
  | 'none';

/** Estratégia de normalização para o valor canônico emitido. */
export type UnmaskStrategy = 'digits' | 'trim' | 'stripAt';

/**
 * Um pattern de máscara: string com CLASSES de caractere
 *   `#` = dígito, `L` = letra, `A` = alfanumérico — qualquer outro = literal.
 * Ou uma FUNÇÃO dos dígitos crus (ex.: doc auto CPF↔CNPJ por tamanho).
 */
export type MaskPattern = string | ((digits: string) => string);

/** FORMATO de um campo, como DADO. Tudo que o engine precisa para se comportar. */
export interface FormatSpec {
  /** Pattern de máscara (string de classes ou função de dígitos). */
  mask: MaskPattern;
  /** Como validar o canônico. */
  validate: ValidateStrategy;
  /** Como derivar o canônico do texto exibido. */
  unmask: UnmaskStrategy;
  /** Componente do input (default 'masked'). */
  input?: FieldInputKind;
  /** dica de teclado mobile. */
  inputMode?: 'numeric' | 'tel' | 'email' | 'text';
  /** Placeholder de fallback (chave i18n). */
  placeholderKey: string;
  /* ---- OPCIONAIS dos kinds dirigidos por `ui_fields` (multiselect/duration/toggle) ---- */
  /** Faixa mínima (duration: segundos). */
  min?: number;
  /** Faixa máxima (duration: segundos). */
  max?: number;
  /** Passo do incremento (duration). */
  step?: number;
  /** Chave i18n da unidade (duration; default 'unit.seconds'). */
  unitKey?: string;
  /** Valor default sugerido pelo adapter (toggle: bool; duration: number; multiselect: csv). */
  default?: unknown;
  /** Aceita múltiplos valores (multiselect → CSV de ids). */
  multiple?: boolean;
}

/* -------------------------------------------------------------------------- */
/* CPF / CNPJ — dígito verificador (PORTADO de doc_validate.py)               */
/* -------------------------------------------------------------------------- */

const onlyDigits = (v: string): string => (v || '').replace(/\D+/g, '');

/** Espelha `_cpf_valido` (doc_validate.py:23). */
export function cpfValido(c: string): boolean {
  if (c.length !== 11 || c === c[0].repeat(11)) return false;
  for (const i of [9, 10]) {
    let s = 0;
    for (let n = 0; n < i; n++) s += Number(c[n]) * (i + 1 - n);
    const d = ((s * 10) % 11) % 10;
    if (d !== Number(c[i])) return false;
  }
  return true;
}

/** Espelha `_cnpj_valido` (doc_validate.py:34). */
export function cnpjValido(c: string): boolean {
  if (c.length !== 14 || c === c[0].repeat(14)) return false;
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, ...pesos1];
  for (const [pesos, pos] of [
    [pesos1, 12],
    [pesos2, 13],
  ] as const) {
    let s = 0;
    for (let i = 0; i < pos; i++) s += Number(c[i]) * pesos[i];
    let d = s % 11;
    d = d < 2 ? 0 : 11 - d;
    if (d !== Number(c[pos])) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* TABELA DE FORMATOS — o DADO. Um campo novo = UMA LINHA AQUI.                */
/* -------------------------------------------------------------------------- */

/** Placa Mercosul (LLL#L##) ou antiga (LLL#### / LLL-####). */
const PLACA_RE = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;
/** username/handle: charset de identificador de conta. */
const USERNAME_RE = /^[A-Za-z0-9._-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Máscara doc AUTO: <=11 dígitos formata como CPF, senão como CNPJ. */
const docMask = (digits: string): string =>
  digits.length <= 11 ? applyMask('###.###.###-##', digits) : applyMask('##.###.###/####-##', digits);

/**
 * FIELD_FORMATS — Record<kind, FormatSpec>. A fonte ÚNICA de "como o campo se
 * comporta". TUDO aqui é dado interpretado pelo engine; nenhuma linha é código
 * específico de um tipo. Para adicionar um formato (ex.: 'renavam'), basta uma
 * linha com seu pattern + validate + unmask.
 *
 * `#`=dígito, `L`=letra, `A`=alfanumérico; qualquer outro caractere é literal.
 */
export const FIELD_FORMATS: Record<string, FormatSpec> = {
  /* documento auto CPF↔CNPJ (mask é função dos dígitos). */
  doc: {
    mask: docMask,
    validate: 'cpf_cnpj',
    unmask: 'digits',
    inputMode: 'numeric',
    placeholderKey: 'buscar.campo.ph.doc',
  },
  /* CPF estrito. */
  cpf: {
    mask: '###.###.###-##',
    validate: 'cpf',
    unmask: 'digits',
    inputMode: 'numeric',
    placeholderKey: 'buscar.campo.ph.cpf',
  },
  /* CNPJ estrito. */
  cnpj: {
    mask: '##.###.###/####-##',
    validate: 'cnpj',
    unmask: 'digits',
    inputMode: 'numeric',
    placeholderKey: 'buscar.campo.ph.cnpj',
  },
  /* documento que aceita CPF OU CNPJ — alias explícito do auto. */
  cpf_cnpj: {
    mask: docMask,
    validate: 'cpf_cnpj',
    unmask: 'digits',
    inputMode: 'numeric',
    placeholderKey: 'buscar.campo.ph.doc',
  },
  /* telefone BR (celular 11 díg → (##) #####-####; fixo 10 cai no mesmo engine). */
  phone: {
    mask: '(##) #####-####',
    validate: 'phone',
    unmask: 'digits',
    inputMode: 'tel',
    placeholderKey: 'buscar.campo.ph.phone',
  },
  /* CEP. */
  cep: {
    mask: '#####-###',
    validate: 'cep',
    unmask: 'digits',
    inputMode: 'numeric',
    placeholderKey: 'buscar.campo.ph.cep',
  },
  /* placa Mercosul (LLL#L##) — o engine preenche L/#/A do pattern. */
  placa: {
    mask: 'LLL#L##',
    validate: 'placa',
    unmask: 'trim',
    inputMode: 'text',
    placeholderKey: 'buscar.campo.ph.placa',
  },
  /* e-mail — sem máscara (passthrough), valida regex. */
  email: {
    mask: '',
    validate: 'email',
    unmask: 'trim',
    inputMode: 'email',
    placeholderKey: 'buscar.campo.ph.email',
  },
  /* username/handle — tira @, valida charset. */
  username: {
    mask: '',
    validate: 'username',
    unmask: 'stripAt',
    inputMode: 'text',
    placeholderKey: 'buscar.campo.ph.username',
  },
  /* UF → select (o componente desenha as opções). */
  uf: {
    mask: '',
    validate: 'none',
    unmask: 'trim',
    input: 'select',
    placeholderKey: 'buscar.campo.ph.uf',
  },
  /* data → input type=date (o browser valida o formato). */
  date: {
    mask: '',
    validate: 'none',
    unmask: 'trim',
    input: 'date',
    placeholderKey: 'buscar.campo.ph.date',
  },
  /* texto livre — passthrough, sem validação. Default de fallback. */
  text: {
    mask: '',
    validate: 'none',
    unmask: 'trim',
    inputMode: 'text',
    placeholderKey: 'buscar.campo.ph.text',
  },
  /* toggle (switch) genérico — valor canônico '1'/''; o componente desenha o switch.
     Sem máscara, sem validação. Linha genérica: ADD, não código por fonte. */
  toggle: {
    mask: '',
    validate: 'none',
    unmask: 'trim',
    input: 'toggle',
    placeholderKey: 'buscar.campo.ph.text',
  },
  /* duration (número + sufixo de unidade) — só dígitos; valida faixa min/max via
     a estratégia 'duration' (a faixa em si vem de ui_fields, sobreposta no spec). */
  duration: {
    mask: '',
    validate: 'duration',
    unmask: 'digits',
    input: 'duration',
    inputMode: 'numeric',
    unitKey: 'unit.seconds',
    placeholderKey: 'buscar.campo.ph.duration',
  },
  /* multiselect (combobox de sites/categorias) — 100% dinâmico: o catálogo vem do
     adapter (ui_fields[propKey].catalog), não desta tabela. Valor canônico = CSV de
     ids; sem máscara, sem validação. Linha genérica: ADD, não código por fonte.
     Necessária p/ fieldUIForKind('multiselect').inputKind === 'multiselect'
     (senão o kind degradava p/ 'text' e o MaskedField nunca delegava ao componente). */
  multiselect: {
    mask: '',
    validate: 'none',
    unmask: 'trim',
    input: 'multiselect',
    placeholderKey: 'buscar.multiselect.buscar',
    multiple: true,
  },
  /* number (inteiro SEM unidade) — só dígitos; valida FAIXA min/max via a
     estratégia 'number' (a faixa em si vem de ui_fields, sobreposta no spec).
     Difere de 'duration' por NÃO ter unitKey (nenhum sufixo de unidade). Linha
     genérica: ADD, não código por fonte. Cobre limit/count/ano/mês/dias. */
  number: {
    mask: '',
    validate: 'number',
    unmask: 'digits',
    input: 'number',
    inputMode: 'numeric',
    placeholderKey: 'buscar.campo.ph.numero',
  },
  /* select (escolha ÚNICA) — 100% dinâmico: as opções vêm do adapter, não desta
     tabela (ENUM inline em `ui.options` OU catálogo dinâmico em `ui.catalog`,
     reusa useSiteCatalog). Valor canônico = o value único escolhido; sem máscara,
     sem validação. Linha genérica: ADD, não código por fonte. Cobre
     sort/tipo/cargo/ordem/sigla/region/dataset. O select-uf legado (lista fixa de
     UFs) compartilha este inputKind mas é desenhado inline pelo MaskedField
     quando NÃO há options/catalog — o discriminador. */
  select: {
    mask: '',
    validate: 'none',
    unmask: 'trim',
    input: 'select',
    placeholderKey: 'buscar.campo.ph.select',
  },
};

/* -------------------------------------------------------------------------- */
/* ENGINE GENÉRICO — o coração. Sem if por tipo.                               */
/* -------------------------------------------------------------------------- */

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
const isLetter = (ch: string): boolean => /[A-Za-z]/.test(ch);
const isAlnum = (ch: string): boolean => isDigit(ch) || isLetter(ch);

/**
 * applyMask(pattern, raw) — percorre o PATTERN e consome do `raw` o próximo
 * caractere que casa com a classe de cada slot:
 *   `#` → próximo dígito · `L` → próxima letra · `A` → próximo alfanumérico.
 * Qualquer outro caractere do pattern é um LITERAL, inserido só quando ainda há
 * entrada para consumir depois dele (máscara incremental enquanto digita).
 *
 * Funciona para QUALQUER pattern — é o que torna o motor data-driven.
 * String vazia (sem pattern) é passthrough.
 */
export function applyMask(pattern: string, raw: string): string {
  if (!pattern) return raw;
  const src = raw || '';
  let out = '';
  let i = 0; // ponteiro na entrada
  for (let p = 0; p < pattern.length; p++) {
    const slot = pattern[p];
    const isClass = slot === '#' || slot === 'L' || slot === 'A';
    if (!isClass) {
      // literal: só emite se ainda houver entrada por consumir (incremental).
      if (i < src.length) out += slot;
      continue;
    }
    // avança na entrada até achar um caractere que case a classe do slot.
    let matched = '';
    while (i < src.length) {
      const ch = src[i++];
      if (slot === '#' && isDigit(ch)) { matched = ch; break; }
      if (slot === 'L' && isLetter(ch)) { matched = ch.toUpperCase(); break; }
      if (slot === 'A' && isAlnum(ch)) { matched = ch.toUpperCase(); break; }
      // caractere não casa a classe → descarta e continua (ex.: letra num slot #).
    }
    if (!matched) break; // sem mais entrada que case → para (máscara incremental).
    out += matched;
  }
  return out;
}

/** Resolve o pattern (string ou função) contra os dígitos crus e mascara. */
function maskWith(spec: FormatSpec, raw: string): string {
  if (typeof spec.mask === 'function') return spec.mask(onlyDigits(raw));
  return applyMask(spec.mask, raw);
}

/** unmaskValue(spec, masked) → valor canônico, despachado por spec.unmask. */
export function unmaskValue(spec: FormatSpec, masked: string): string {
  const v = masked || '';
  switch (spec.unmask) {
    case 'digits':
      return onlyDigits(v);
    case 'stripAt':
      return v.trim().replace(/^@+/, '');
    case 'trim':
    default:
      return v.trim();
  }
}

/* -------------------------------------------------------------------------- */
/* VALIDADORES — um por estratégia, despachados por validateValue.             */
/* -------------------------------------------------------------------------- */

/** Cada estratégia → (canônico) ⇒ null (ok) | chave i18n (erro). Vazio = ok. */
const VALIDATORS: Record<ValidateStrategy, (v: string) => string | null> = {
  cpf: (v) =>
    v.length === 11 && cpfValido(v) ? null : 'buscar.campo.erro.cpf',
  cnpj: (v) =>
    v.length === 14 && cnpjValido(v) ? null : 'buscar.campo.erro.cnpj',
  cpf_cnpj: (v) => {
    if (v.length === 11) return cpfValido(v) ? null : 'buscar.campo.erro.cpf';
    if (v.length === 14) return cnpjValido(v) ? null : 'buscar.campo.erro.cnpj';
    return 'buscar.campo.erro.cpfCnpj';
  },
  phone: (v) =>
    v.length === 10 || v.length === 11 ? null : 'buscar.campo.erro.telefone',
  cep: (v) => (v.length === 8 ? null : 'buscar.campo.erro.cep'),
  placa: (v) =>
    PLACA_RE.test(v.toUpperCase()) ? null : 'buscar.campo.erro.placa',
  email: (v) => (EMAIL_RE.test(v) ? null : 'buscar.campo.erro.email'),
  username: (v) =>
    USERNAME_RE.test(v) ? null : 'buscar.campo.erro.username',
  /* duration: a FAIXA (min/max) vem do spec, não do valor — tratada em
     validateValue (que tem o spec). Aqui é no-op; sem spec não há faixa. */
  duration: () => null,
  /* number: idem duration — a FAIXA vem do spec; tratada em validateValue. */
  number: () => null,
  none: () => null,
};

/**
 * validateValue(spec, value) — valida o CANÔNICO (já desmascarado). Vazio é
 * sempre válido (campo opcional). Devolve null (ok) ou a chave i18n do erro.
 *
 * `duration` é o único validador que precisa do SPEC (faixa min/max sobreposta
 * por `ui_fields`): fora de [min,max] devolve a chave de erro de faixa.
 */
export function validateValue(spec: FormatSpec, value: string): string | null {
  if (!value) return null;
  if (spec.validate === 'duration') {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'buscar.campo.erro.duracao';
    if (spec.min != null && n < spec.min) return 'buscar.campo.erro.duracao';
    if (spec.max != null && n > spec.max) return 'buscar.campo.erro.duracao';
    return null;
  }
  if (spec.validate === 'number') {
    // inteiro sem unidade: não-número → erro de número; fora de [min,max] → faixa.
    const n = Number(value);
    if (!Number.isFinite(n)) return 'buscar.campo.erro.numero';
    if (spec.min != null && n < spec.min) return 'buscar.campo.erro.faixa';
    if (spec.max != null && n > spec.max) return 'buscar.campo.erro.faixa';
    return null;
  }
  return (VALIDATORS[spec.validate] || VALIDATORS.none)(value);
}

/* -------------------------------------------------------------------------- */
/* fieldUIForKind — só um lookup na TABELA + o engine genérico.               */
/* -------------------------------------------------------------------------- */

/** Resultado da validação para o componente: ok, ou erro como chave i18n. */
export type FieldValidation = { ok: true } | { ok: false; errorKey: string };

export interface FieldUI {
  /** Componente do input: 'select' (uf), 'date', 'masked', 'multiselect', 'duration', 'toggle'. */
  inputKind: FieldInputKind;
  /** Mascara o texto exibido enquanto digita (passthrough se kind sem máscara). */
  mask: (raw: string) => string;
  /** Normaliza o texto exibido para o canônico emitido. */
  unmask: (display: string) => string;
  /** Valida o canônico (já desmascarado). Vazio é sempre válido. */
  validate: (canonical: string) => FieldValidation;
  /** Placeholder de fallback (chave i18n). */
  placeholderKey: string;
  /** dica de teclado mobile. */
  inputMode?: 'numeric' | 'tel' | 'email' | 'text';
  /* OPCIONAIS resolvidos do spec (+ overrides de `ui_fields`) p/ os kinds novos. */
  min?: number;
  max?: number;
  step?: number;
  unitKey?: string;
  default?: unknown;
}

/**
 * Overrides vindos de `ui_fields[propKey]` do adapter (min/max/step/unitKey/
 * default). São SOBREPOSTOS no FormatSpec base (ex.: duration do maigret tem
 * min:5/max:240/default:20) — o kind continua dirigindo o comportamento, o
 * adapter só ajusta a faixa/unidade. Multi-domínio: tudo derivado de dado.
 */
export type FieldUIOverrides = Pick<
  FormatSpec,
  'min' | 'max' | 'step' | 'unitKey' | 'default'
>;

/**
 * Resolve a UI do campo a partir do KIND. É SÓ um lookup em FIELD_FORMATS + o
 * engine genérico — sem nenhum ramo por tipo. KIND desconhecido cai em `text`
 * (passthrough), nunca quebra. `overrides` (de `ui_fields`) refinam a faixa/
 * unidade/default sem trocar o comportamento do kind.
 */
export function fieldUIForKind(kind: string, overrides?: FieldUIOverrides): FieldUI {
  const base = FIELD_FORMATS[kind] || FIELD_FORMATS.text;
  const spec: FormatSpec = overrides ? { ...base, ...stripUndef(overrides) } : base;
  return {
    inputKind: spec.input || 'masked',
    mask: (raw) => maskWith(spec, raw),
    unmask: (display) => unmaskValue(spec, display),
    validate: (canonical) => {
      const errorKey = validateValue(spec, canonical);
      return errorKey ? { ok: false, errorKey } : { ok: true };
    },
    placeholderKey: spec.placeholderKey,
    inputMode: spec.inputMode,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    unitKey: spec.unitKey,
    default: spec.default,
  };
}

/** Remove chaves `undefined` p/ o spread de overrides não apagar o base. */
function stripUndef<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}
