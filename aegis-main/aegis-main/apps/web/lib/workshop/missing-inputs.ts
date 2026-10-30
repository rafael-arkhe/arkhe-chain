/**
 * Unified missing-input error handler (2026-06-07).
 *
 * ÚNICA fonte de verdade do frontend para reconhecer QUALQUER erro de
 * "entrada obrigatória ausente" que um endpoint do workshop pode devolver, e
 * transformá-lo em campos coletáveis + uma mensagem humana — NUNCA o JSON cru.
 *
 * Régua do operador (violada 5x): nenhum caminho de invocação — Ação, Função,
 * query — pode vazar um erro cru de missing-input/param/signature. Tudo passa
 * por aqui. `ApiError.message` carrega o corpo cru da resposta (client.ts), daí
 * fazermos o parse aqui.
 *
 * Formas reconhecidas (backend):
 *   - missing_required_params (workshop.py::invoke_action) →
 *       {detail:{error:"missing_required_params", params:[{name,label,type,component}],
 *                needs_selection, message}}
 *   - function_signature_violation (aip_logic.py / platform_v24 logic.py) →
 *       {detail:{error:"function_signature_violation", missing:[name...],
 *                type_errors:[...], message}}
 *   - string solta "missing required input(s): a, b, c"
 */
import type { FormFieldSpec, FormFieldType } from '@/lib/api';

export type MissingGateKind =
  | 'action_params'
  | 'function_signature'
  | 'generic_missing';

export interface MissingInputGate {
  kind: MissingGateKind;
  /** Campos a coletar do operador (FormFieldRow-compatível). */
  fields: FormFieldSpec[];
  /** Ação contextual sem objeto selecionado → orientar a SELECIONAR, não coletar. */
  needsSelection: boolean;
  /** Mensagem humana pronta p/ exibir (nunca JSON cru). */
  message: string;
}

/** Rótulos humanos p/ nomes técnicos transversais (espelha _PARAM_LABEL_LEXICON do backend). */
const PARAM_LABELS: Record<string, string> = {
  to: 'Destinatário',
  recipient: 'Destinatário',
  destinatario: 'Destinatário',
  text: 'Mensagem',
  message: 'Mensagem',
  msg: 'Mensagem',
  body: 'Mensagem',
  subject: 'Assunto',
  url: 'Link',
  link: 'Link',
  ttl_hours: 'Validade (horas)',
  ttl: 'Validade',
  reason: 'Motivo',
  motivo: 'Motivo',
  note: 'Nota',
  nota: 'Nota',
  query: 'Termo de busca',
  q: 'Termo de busca',
  termo: 'Termo',
  hashtag: 'Hashtag',
  status: 'Status',
  data_inicio: 'Data início',
  data_fim: 'Data fim',
  data: 'Data',
  // Operações/agente (coleta, visão, OCR, conector) — coletados no clique pelo gate.
  image_url: 'URL da imagem',
  imagem: 'Imagem',
  image: 'Imagem',
  instruction: 'O que detectar',
  instrucao: 'O que detectar',
  prompt: 'Instrução',
  api_endpoint: 'Endpoint da API',
  endpoint: 'Endpoint',
  api_url: 'URL da API',
};

/** snake_case → Título humano (tira _id, capitaliza). Nunca expõe a chave crua. */
export function humanizeInputName(name: string): string {
  const n = (name || '').trim();
  if (PARAM_LABELS[n.toLowerCase()]) return PARAM_LABELS[n.toLowerCase()];
  const key = n.replace(/_id$/, '');
  const words = key.split('_').filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || n;
}

/** Componente de campo inferido pelo nome (e-mail/telefone/link/data/número/texto-longo). */
function componentForName(name: string): { type: FormFieldType; format?: string } {
  const n = (name || '').toLowerCase();
  if (/e[-_ ]?mail/.test(n)) return { type: 'text', format: 'email' };
  if (/(telefone|celular|whatsapp|fone)/.test(n)) return { type: 'text', format: 'phone' };
  if (/(^url$|_url$|link|site)/.test(n)) return { type: 'text', format: 'url' };
  if (/(^data|_data$|data_|_em$|nascimento|vencimento|_date$)/.test(n)) return { type: 'date' };
  if (/(valor|pre[çc]o|custo|qtd|quantidade|total|numero|idade|area|preco)/.test(n))
    return { type: 'number' };
  if (/(mensagem|message|texto|observ|descri|nota|motivo|reason)/.test(n))
    return { type: 'textarea' };
  return { type: 'text' };
}

/** Nome cru → FieldSpec rico (label humano + componente inferido). */
export function nameToField(name: string): FormFieldSpec {
  const c = componentForName(name);
  return {
    key: name,
    label: humanizeInputName(name),
    type: c.type,
    format: c.format,
    required: true,
  } as FormFieldSpec;
}

/** Param estruturado do 422 de Ação → FieldSpec (usa o `component` que o backend mandou). */
function paramToField(p: {
  name: string;
  label?: string;
  component?: { type?: FormFieldType; format?: string };
}): FormFieldSpec {
  const c = p.component || {};
  // Backend às vezes manda `label` == nome técnico cru (params de skill: image_url,
  // instruction, api_endpoint não têm label humano). Nesse caso, humaniza pelo léxico
  // — NUNCA expõe o identificador cru no form do gate.
  const rawLabel = !p.label || p.label === p.name;
  return {
    key: p.name,
    label: rawLabel ? humanizeInputName(p.name) : (p.label as string),
    type: (c.type as FormFieldType) || componentForName(p.name).type,
    format: c.format || componentForName(p.name).format,
    required: true,
  } as FormFieldSpec;
}

/**
 * Reconhece QUALQUER erro de entrada-ausente no texto cru de um ApiError.
 * Devolve o gate (campos a coletar + mensagem humana) ou null se não for esse caso.
 */
/** Varre uma STRING solta de erro (EN ou PT) por nomes de input ausentes.
 *  EN: "missing required input(s): a, b". PT: "input obrigatório ausente: 'x'". */
function scanLooseMissing(s: string): MissingInputGate | null {
  const en = /missing required (?:input|param)\(?s?\)?:?\s*(.+)/i.exec(s);
  const pt = /input(?:s)? obrigat[óo]ri[oa](?:s)? ausente(?:s)?:?\s*(.+)/i.exec(s);
  const m = en || pt;
  if (!m) return null;
  const names = m[1]
    .split(/[,;]/)
    .map((x) => x.trim().replace(/^['"]|['"]$/g, '').replace(/[.'"]$/g, '').trim())
    .filter(Boolean);
  if (!names.length) return null;
  return {
    kind: 'generic_missing',
    fields: names.map(nameToField),
    needsSelection: false,
    message: `Preencha para executar: ${names.map(humanizeInputName).join(', ')}.`,
  };
}

export function parseMissingInputError(raw: string): MissingInputGate | null {
  if (!raw) return null;
  let detail: unknown;
  try {
    const body = JSON.parse(raw) as { detail?: unknown };
    detail = body?.detail ?? body;
  } catch {
    // não-JSON → tenta a string solta (EN/PT)
    return scanLooseMissing(raw);
  }

  // detail PODE ser uma string crua (ex.: /workshop/evaluate → HTTPException(422, str(e)),
  // pv26 → "input obrigatório ausente: 'x'") — varre EN/PT antes de desistir.
  if (typeof detail === 'string') return scanLooseMissing(detail);
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;

  if (d.error === 'missing_required_params' && Array.isArray(d.params)) {
    const fields = (d.params as Array<{ name: string; label?: string; component?: { type?: FormFieldType; format?: string } }>).map(paramToField);
    return {
      kind: 'action_params',
      fields,
      needsSelection: Boolean(d.needs_selection),
      message:
        typeof d.message === 'string'
          ? d.message
          : `Preencha para executar: ${fields.map((f) => f.label).join(', ')}.`,
    };
  }

  if (d.error === 'function_signature_violation' && Array.isArray(d.missing)) {
    const names = (d.missing as string[]).filter(Boolean);
    if (names.length) {
      return {
        kind: 'function_signature',
        fields: names.map(nameToField),
        needsSelection: false,
        message: `Preencha para executar: ${names.map(humanizeInputName).join(', ')}.`,
      };
    }
  }

  // detail.message com texto de missing (defesa extra)
  if (typeof d.message === 'string' && /missing required (?:input|param)/i.test(d.message)) {
    const m = /:\s*(.+)$/.exec(d.message);
    const names = m ? m[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [];
    if (names.length) {
      return {
        kind: 'generic_missing',
        fields: names.map(nameToField),
        needsSelection: false,
        message: `Preencha para executar: ${names.map(humanizeInputName).join(', ')}.`,
      };
    }
  }

  return null;
}

/**
 * Mensagem de erro SEMPRE humana — nunca JSON cru. Para erros que NÃO são de
 * entrada-ausente, extrai `detail.message`/`detail`/`message`; só cai no texto
 * cru se nada estruturado existir (e ainda assim sem chaves de JSON).
 */
export function humanizeApiError(raw: string): string {
  if (!raw) return 'Não foi possível executar a ação.';
  try {
    const body = JSON.parse(raw) as { detail?: unknown; message?: unknown };
    const detail = body?.detail ?? body;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
      const d = detail as Record<string, unknown>;
      if (typeof d.message === 'string') return d.message;
      if (typeof body.message === 'string') return body.message;
    }
    if (typeof body.message === 'string') return body.message;
  } catch {
    // não-JSON → o texto cru já é legível (a menos que pareça JSON)
    if (!/^[[{]/.test(raw.trim())) return raw;
  }
  return 'Não foi possível executar a ação. Tente novamente.';
}
