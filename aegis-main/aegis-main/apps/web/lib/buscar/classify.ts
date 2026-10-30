/**
 * Classificador ÚNICO do /buscar — fonte de verdade para "que tipo de dado é este?"
 * e "que fontes servem a este dado?". Antes a heurística estava triplicada
 * (page.tsx, workers.ts). O guia de fontes usa isto pra orientar o operador.
 */
import { FIELD_FORMATS } from './field-ui';

/** KINDs que têm FORMATO declarado (máscara+validador). fieldKind só promove estes. */
const FIELD_FORMAT_KINDS = new Set(Object.keys(FIELD_FORMATS));

export type DossierKind = 'cnpj' | 'cpf' | 'email' | 'phone' | 'username' | 'person';

/** Infere o tipo da entidade a partir do texto digitado. */
export function inferDossierKind(raw: string): { kind: DossierKind; value: string } {
  const t = (raw || '').trim();
  const digits = t.replace(/\D/g, '');
  if (/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(t)) return { kind: 'cnpj', value: digits };
  if (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(t)) return { kind: 'cpf', value: digits };
  if (/@.+\./.test(t) && !t.includes(' ')) return { kind: 'email', value: t };
  if (/^\+?\d[\d\s().-]{8,}$/.test(t)) return { kind: 'phone', value: digits };
  if (!t.includes(' ') && /^@?[A-Za-z0-9._-]{1,64}$/.test(t)) {
    return { kind: 'username', value: t.replace(/^@/, '') };
  }
  return { kind: 'person', value: t };
}

/** Os `accepts` (do backend) que o tipo digitado SATISFAZ especificamente. */
const KIND_TO_ACCEPTS: Record<DossierKind, string[]> = {
  cnpj: ['cnpj', 'cpf_cnpj'],
  cpf: ['cpf', 'cpf_cnpj'],
  email: ['email'],
  phone: ['telefone'],
  username: ['username'],
  person: ['nome'],
};

/* -------------------------------------------------------------------------- */
/* Camada CANÔNICA de TIPO (FRENTE A)                                          */
/* -------------------------------------------------------------------------- */
/**
 * Tipo canônico de um `accept`/chave de campo. Espelha o backend
 * `_ACCEPTS_ALIASES` (ontology-module/app/mcp_adapters/__init__.py) — MESMA
 * tabela, fonte única. O catálogo fragmenta "documento" em 3 accepts
 * (cpf, cpf_cnpj, cnpj) e identidade em vários (username/handle/usuario/perfil);
 * sem esta camada o casamento campo↔fonte era por igualdade literal de string,
 * então CPF no campo `cpf` não satisfazia a fonte `cpf_cnpj` (e nem chegava na
 * chave que o adapter estrito lê). Aqui colapsamos accepts equivalentes num
 * KIND e o roteamento por tipo reparte para cada fonte.
 *
 * Multi-domínio: derivado dos accepts do backend, ZERO hardcode de vertical.
 */
export type AcceptKind = 'doc' | 'username' | 'email' | 'phone' | 'placa' | string;

const ACCEPT_KIND: Record<string, AcceptKind> = {
  // documento (CPF/CNPJ): colapsa cpf, cnpj e cpf_cnpj num único kind "doc".
  cpf: 'doc', cnpj: 'doc', cpf_cnpj: 'doc', documento: 'doc', doc: 'doc',
  // identidade / handle (identificador-de-conta de pessoa colapsa em "username").
  // Espelha _ACCEPTS_ALIASES do backend: channel/user_id/actor/account/screen_name/
  // profile já chegam como `username` nos accepts; mapeamos os equivalentes diretos aqui.
  username: 'username', handle: 'username', usuario: 'username',
  perfil: 'username', user: 'username',
  // contato
  email: 'email', e_mail: 'email',
  telefone: 'phone', phone: 'phone', numero: 'phone', tel: 'phone',
  celular: 'phone', number: 'phone',
  // veículo
  placa: 'placa',
  // endereço
  cep: 'cep',
  // link de post/vídeo (kind próprio, NÃO username)
  url: 'url',
  // comunidade (NÃO pessoa) — kind próprio para o gate pular neutro num nome de pessoa
  subreddit: 'subreddit',
};

/** Tipo canônico de um accept/chave de campo (default: o próprio accept). */
export function acceptKind(accept: string): AcceptKind {
  return ACCEPT_KIND[accept] || accept;
}

/** Só dígitos (CPF/CNPJ/telefone vêm com máscara do operador). */
function digitsOnly(v: string): string {
  return v.replace(/\D/g, '');
}

/**
 * O accept-documento ACEITA o valor pelo FORMATO? — evita mandar CNPJ (14 díg)
 * a uma fonte que só quer CPF (accept `cpf`) e vice-versa. `cpf_cnpj` aceita
 * ambos; `cpf` só 11 díg; `cnpj` só 14. Outros accepts-doc (documento/doc)
 * são genéricos → aceitam ambos.
 */
function docAcceptMatchesFormat(accept: string, digits: string): boolean {
  if (accept === 'cpf') return digits.length === 11;
  if (accept === 'cnpj') return digits.length === 14;
  return true; // cpf_cnpj, documento, doc
}

/**
 * Valor do campo (em `extra`) cujo KIND canônico == kind(accept), procurando
 * TODAS as chaves equivalentes. Para documentos VALIDA o formato (11=CPF,
 * 14=CNPJ) para não entregar um valor que a fonte estrita rejeita. Devolve o
 * valor JÁ NORMALIZADO (doc/phone só dígitos; demais trim). `null` se nada casa.
 *
 * É o coração do roteamento por tipo: o gate (Fase 2) usa para saber se algum
 * campo serve à fonte; o searchMcp (Fase 3) usa para preencher a chave que cada
 * adapter declara.
 */
export function fieldValueForAccept(
  extra: Record<string, string> | undefined,
  accept: string,
): string | null {
  if (!extra) return null;
  const wantKind = acceptKind(accept);
  for (const [key, rawVal] of Object.entries(extra)) {
    const val = (rawVal ?? '').trim();
    if (!val) continue;
    if (acceptKind(key) !== wantKind) continue;
    if (wantKind === 'doc') {
      const digits = digitsOnly(val);
      if (!digits) continue;
      if (!docAcceptMatchesFormat(accept, digits)) continue;
      return digits;
    }
    if (wantKind === 'phone') {
      const digits = digitsOnly(val);
      return digits || null;
    }
    return val;
  }
  return null;
}

/**
 * Chave CANÔNICA de campo por kind — usada na Busca avançada (Fase 4) para
 * colapsar accepts equivalentes (cpf/cpf_cnpj/cnpj → 1 campo "doc";
 * username/handle/usuario → 1 campo "username"). Kinds sem colapso conhecido
 * (placa, ou accepts próprios) usam o próprio nome. O roteamento por tipo
 * (Fase 2/3) reparte o valor desse campo único para cada fonte.
 */
const KIND_CANONICAL_FIELD: Record<string, string> = {
  doc: 'doc',
  username: 'username',
  email: 'email',
  phone: 'telefone',
  placa: 'placa',
  url: 'url',
  subreddit: 'subreddit',
};

export function canonicalFieldForKind(kind: AcceptKind): string {
  return KIND_CANONICAL_FIELD[kind] || kind;
}

/**
 * Colapsa um conjunto de accepts (de várias fontes) nos campos CANÔNICOS por
 * kind, preservando ordem de 1ª aparição. Ex.: [cpf, cpf_cnpj, cnpj, username]
 * → [doc, username]. ZERO hardcode de vertical — deriva do que as fontes
 * declaram. Accepts que SÃO a caixa principal (termo/nome/q…) são filtrados
 * pelo chamador via QUERY_ACCEPTS antes daqui.
 */
export function collapseAcceptsToFields(accepts: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of accepts) {
    const field = canonicalFieldForKind(acceptKind(a));
    if (seen.has(field)) continue;
    seen.add(field);
    out.push(field);
  }
  return out;
}

const KIND_LABEL: Record<DossierKind, string> = {
  cnpj: 'CNPJ', cpf: 'CPF', email: 'e-mail', phone: 'telefone',
  username: 'usuário', person: 'nome',
};

const ACCEPT_LABEL: Record<string, string> = {
  nome: 'nome', cpf: 'CPF', cnpj: 'CNPJ', cpf_cnpj: 'CPF/CNPJ', telefone: 'telefone',
  username: 'usuário', email: 'e-mail', placa: 'placa', termo: 'texto',
  url: 'URL', ip: 'IP', host: 'host', documento: 'documento',
  // comunidade (Reddit) — kind/campo próprio, distinto de usuário.
  subreddit: 'Subreddit',
  // campo CANÔNICO da Busca avançada (Fase 4): 1 campo "doc" = CPF OU CNPJ.
  doc: 'CPF/CNPJ',
};

/** Accepts que SÃO a caixa de busca principal (não viram campo na avançada). */
export const QUERY_ACCEPTS = new Set(['termo', 'nome', 'name', 'q', 'query']);

export function kindLabel(k: DossierKind): string {
  return KIND_LABEL[k] || k;
}

/** A fonte SERVE ao dado digitado (aceita o tipo específico). */
export function sourceServesKind(accepts: string[] | undefined, kind: DossierKind): boolean {
  if (!accepts || !accepts.length) return false;
  const sat = KIND_TO_ACCEPTS[kind] || [];
  return accepts.some((a) => sat.includes(a));
}

/** A fonte PEDE OUTRO dado (tem aceite específico, mas nenhum casa). Fontes só-`termo`
 *  (busca genérica) são neutras — servem a tudo, não "pedem outro". */
export function sourceNeedsOther(accepts: string[] | undefined, kind: DossierKind): boolean {
  if (!accepts || !accepts.length) return false;
  const specific = accepts.filter((a) => a !== 'termo');
  if (!specific.length) return false;
  return !sourceServesKind(accepts, kind);
}

/** Rótulo legível do que a fonte aceita (p/ o aviso "requer CNPJ"). */
export function acceptsLabel(accepts: string[] | undefined): string {
  if (!accepts || !accepts.length) return '';
  const specific = accepts.filter((a) => a !== 'termo');
  const list = (specific.length ? specific : accepts).map((a) => ACCEPT_LABEL[a] || a);
  return Array.from(new Set(list)).join(' ou ');
}

/** Rótulo pt-BR de cada refiner (desambiguador) que as fontes expõem via `refines`.
 *  A busca avançada é MODULAR: os campos vêm do union dos refines das fontes
 *  selecionadas, não de um set fixo. */
const REFINER_LABEL: Record<string, string> = {
  nome_mae: 'Nome da mãe',
  data_nascimento: 'Data de nascimento',
  uf: 'UF',
  estado: 'Estado',
  inscricao: 'Inscrição',
  profissao: 'Profissão',
  orgao: 'Órgão',
  cidade: 'Cidade',
  municipio: 'Município',
  contexto: 'Contexto',
  datainicio: 'Data início',
  datafim: 'Data fim',
  data_inicio: 'Data início',
  data_fim: 'Data fim',
};

/** Humaniza uma chave técnica (camelCase/snake) num rótulo legível, GENÉRICO:
 *  tira ruído de prefixo (sigla/id), quebra camelCase e snake/kebab, title-case.
 *  Ex: siglaPartido→"Partido", idLegislatura→"Legislatura", max_results→"Max results". */
function humanizeKey(r: string): string {
  let s = r
    .replace(/^sigla(?=[A-Z])/, '')
    .replace(/^id(?=[A-Z])/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim();
  if (!s) s = r;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function refinerLabel(r: string): string {
  return REFINER_LABEL[r] || ACCEPT_LABEL[r] || humanizeKey(r);
}

/** Componente semântico do refiner (select de UF, date, cep ou texto), por convenção de nome. */
export function refinerInputKind(r: string): 'uf' | 'date' | 'cep' | 'text' {
  if (r === 'uf' || r === 'estado') return 'uf';
  if (r.startsWith('data') || r.includes('nascimento')) return 'date';
  if (r === 'cep') return 'cep';
  return 'text';
}

/* -------------------------------------------------------------------------- */
/* fieldKind — FONTE ÚNICA do tipo de INPUT de um campo (FRENTE A)            */
/* -------------------------------------------------------------------------- */
/**
 * O KIND de input de um campo/refiner. É a fonte ÚNICA que a UI consome para
 * resolver máscara + validador + placeholder (via fieldUIForKind).
 *
 * Ordem de resolução, SEM duplicar lógica:
 *  1. refinerInputKind cobre os refiners por convenção de nome (uf/date/cep) —
 *     caso particular reusado tal e qual; só promovemos quando NÃO é 'text',
 *     senão deixamos a camada de accept decidir.
 *  2. acceptKind(name) colapsa accepts/chaves equivalentes no KIND canônico
 *     (cpf/cnpj/cpf_cnpj→doc, handle/usuario→username, telefone/celular→phone…).
 *  3. devolvemos o KIND somente SE existir um FORMATO declarado pra ele
 *     (FIELD_FORMAT_KINDS = chaves de FIELD_FORMATS). Assim um KIND sem formato
 *     (url/subreddit/ip…) cai em 'text' (passthrough), e o motor é a fonte única.
 *
 * Multi-domínio/MODULAR: deriva 100% de acceptKind (= accepts do backend) + da
 * TABELA de formatos. Um adapter novo com accept `cnpj`/`telefone`/`email`/`cep`/
 * `placa` ganha o input certo sem tocar UI nem esta função. Acrescentar um KIND
 * = UMA LINHA em FIELD_FORMATS — esta função reconhece automaticamente.
 */
export type FieldKind = string;

export function fieldKind(name: string): FieldKind {
  // 1. refiner por convenção (uf/date/cep) tem precedência quando aplicável.
  const ri = refinerInputKind(name);
  if (ri !== 'text') return ri;
  // 2. colapsa pelo accept canônico.
  const kind = acceptKind(name);
  // 3. só promove se há FORMATO declarado pra esse KIND; senão texto livre.
  return FIELD_FORMAT_KINDS.has(kind) ? kind : 'text';
}
