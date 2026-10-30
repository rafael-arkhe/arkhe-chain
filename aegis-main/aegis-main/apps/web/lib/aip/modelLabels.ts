/**
 * Display-layer mapping for AIP model + provider IDs.
 *
 * Portado de `politicians-app/lib/aip/modelLabels.ts` — o MAPA de codinomes
 * (`MODEL_CODENAMES`), os aliases e as funções de resolução são cópia EXATA;
 * apenas as NOTAS (`MODEL_NOTES`) foram neutralizadas para o domínio de
 * segurança pública (analista / centro de operações) — sem viés militar e
 * sem viés político (memory `feedback_politicians_audit_no_military_lens`:
 * a label/nota nunca cita "military"/defesa nem framing eleitoral; tudo via
 * display-layer "AIP Cloud" + codinome).
 *
 * Hard rules:
 *   - O operador NUNCA vê "OpenRouter", "Groq", "Anthropic", "Mistral",
 *     etc. Tudo é "AIP Cloud".
 *   - Provider Groq é removido inteiro do seletor.
 *   - Cada model.id real vira um codinome ``AIP-<Familia>-<tamanho>``.
 *   - Cada modelo carrega uma descrição PT-BR contextualizada para o
 *     centro de operações / analista de segurança pública.
 *
 * Famílias (uma por fornecedor real, sem repetição entre famílias):
 *
 *   | Família    | Mapeia                | Pra que serve                              |
 *   |------------|-----------------------|--------------------------------------------|
 *   | Ipiranga   | Mistral / Mixtral     | Análise sólida, raciocínio amplo           |
 *   | Cascata    | AI21 Jamba            | Janela longa, leitura de relatórios        |
 *   | Aurora     | Qwen                  | Síntese pesada, multi-idioma               |
 *   | Atlântico  | Z-AI / GLM            | Resposta rápida em triagem                 |
 *   | Vereda     | Meta Llama            | Conversação ágil, primeira leitura         |
 *   | Concílio   | Anthropic Claude      | Texto cuidadoso, postura editorial         |
 *   | Diplomata  | OpenAI GPT            | Articulação fluida, redação institucional  |
 *   | Tribuno    | Cohere Command        | Argumentação direta                        |
 *   | Lume       | DeepSeek              | Pesquisa exploratória, raciocínio passo-a-passo |
 *   | Luar       | Moonshot / Kimi       | Coleta agêntica, orquestração de ferramentas, janela longa |
 */

export interface AipBranded<T> {
  /** Display label shown to the operator. */
  label: string
  /** Original payload — kept for callbacks that need the real id. */
  raw: T
}


// --------------------------------------------------------------------------- //
// Codinomes
// --------------------------------------------------------------------------- //
const MODEL_CODENAMES: Record<string, string> = {
  // Mistral → Ipiranga
  "mistralai/mixtral-8x22b-instruct": "AIP-Ipiranga-22B",
  "mistralai/mistral-large":          "AIP-Ipiranga-Pro",
  "mistralai/mistral-large-2407":     "AIP-Ipiranga-Pro",
  "mistralai/mistral-medium-3":       "AIP-Ipiranga-Med",
  "mistralai/mistral-small":          "AIP-Ipiranga-Lite",

  // AI21 → Cascata
  "ai21/jamba-1-5-large":             "AIP-Cascata-Pro",
  "ai21/jamba-large":                 "AIP-Cascata-Pro",
  "ai21/jamba-1-5-mini":              "AIP-Cascata-Lite",

  // Qwen → Aurora
  "qwen/qwen-max":                    "AIP-Aurora-Max",
  "qwen/qwen-2-72b-instruct":         "AIP-Aurora-72B",
  "qwen/qwen-2.5-72b-instruct":       "AIP-Aurora-72B",
  "qwen/qwen-plus":                   "AIP-Aurora-Plus",

  // Embeddings soberanos (busca vetorial — não LLM de chat).
  "qwen/text-embedding-v4":           "AIP-Aurora-Embeddings",
  "baai/bge-m3":                      "AIP-Boreal-Embeddings",

  // Z-AI / GLM → Atlântico
  "z-ai/glm-5-turbo":                 "AIP-Atlantico-Turbo",
  "z-ai/glm-4-air":                   "AIP-Atlantico-Air",

  // Meta Llama → Vereda
  "meta-llama/llama-3.3-70b-instruct":"AIP-Vereda-70B",
  "meta-llama/llama-3.1-70b-instruct":"AIP-Vereda-70B",
  "meta-llama/llama-3.1-8b-instruct": "AIP-Vereda-8B",

  // Anthropic Claude → Concílio
  "anthropic/claude-sonnet-4-6":      "AIP-Concilio-Pro",
  "anthropic/claude-sonnet-4-5":      "AIP-Concilio-Pro",
  "anthropic/claude-3.5-sonnet":      "AIP-Concilio-35",
  "anthropic/claude-opus-4-7":        "AIP-Concilio-Ultra",
  "anthropic/claude-opus-4-1":        "AIP-Concilio-Ultra",
  "anthropic/claude-haiku-4-5":       "AIP-Concilio-Lite",

  // OpenAI GPT → Diplomata
  "openai/gpt-4o":                    "AIP-Diplomata-4",
  "openai/gpt-4o-mini":               "AIP-Diplomata-Mini",
  "openai/gpt-4-turbo":               "AIP-Diplomata-Turbo",
  "openai/o1":                        "AIP-Diplomata-Reflexao",
  "openai/o1-mini":                   "AIP-Diplomata-Reflexao-Mini",

  // Cohere Command → Tribuno
  "cohere/command-r-plus":            "AIP-Tribuno-Pro",
  "cohere/command-r":                 "AIP-Tribuno-Std",

  // DeepSeek → Lume
  "deepseek/deepseek-chat":           "AIP-Lume-Chat",
  "deepseek/deepseek-r1":             "AIP-Lume-Reflexao",

  // Moonshot / Kimi → Luar (soberano CN; default da finalidade Coleta).
  "moonshotai/kimi-k2.6":             "AIP-Luar-Pro",
}


// --------------------------------------------------------------------------- //
// Descrições contextualizadas para o centro de operações / analista.
// Texto curto (≤ 1 frase), frame: pra que esse modelo serve no dia-a-dia.
// Domínio: segurança pública (sem viés militar, sem viés eleitoral).
// --------------------------------------------------------------------------- //
const MODEL_NOTES: Record<string, string> = {
  // Ipiranga — o estado-da-arte do AEGIS. Às margens do riacho Ipiranga, em 1822,
  // ecoou o grito da independência; esta linha carrega esse nome porque é a nossa,
  // soberana, rodando sob nosso controle. Notas decorativas com esse paralelo.
  "mistralai/mixtral-8x22b-instruct":
    "Carro-chefe do AEGIS. Como o grito às margens do Ipiranga selou a independência em 1822, este é o nosso topo de linha — raciocínio amplo, soberano, sem depender de ninguém.",
  "mistralai/mistral-large":
    "O mais robusto da linha Ipiranga: pareceres e análises densas. Independência também é não terceirizar o pensamento.",
  "mistralai/mistral-large-2407":
    "O mais robusto da linha Ipiranga: pareceres e análises densas. Independência também é não terceirizar o pensamento.",
  "mistralai/mistral-medium-3":
    "O equilíbrio da linha Ipiranga — versátil para o dia a dia da operação, soberano de ponta a ponta.",
  "mistralai/mistral-small":
    "O ágil da linha Ipiranga — respostas rápidas sem abrir mão da independência.",

  // Cascata
  "ai21/jamba-1-5-large":
    "Janela longa — junte vários relatórios e pergunte cruzado. Bom para consolidar dossiês.",
  "ai21/jamba-large":
    "Janela longa — junte vários relatórios e pergunte cruzado. Bom para consolidar dossiês.",
  "ai21/jamba-1-5-mini":
    "Cascata reduzida — leitura rápida de documentos médios sem perder o contexto.",

  // Aurora
  "qwen/qwen-max":
    "Síntese robusta multi-idioma. Use quando precisar comparar fontes em PT, EN e ES.",
  "qwen/qwen-2-72b-instruct":
    "Modelo de capacidade alta com bom desempenho em tarefas de raciocínio e síntese.",
  "qwen/qwen-2.5-72b-instruct":
    "Modelo de capacidade alta com bom desempenho em tarefas de raciocínio e síntese.",
  "qwen/qwen-plus":
    "Aurora de uso geral — equilíbrio entre custo e qualidade nas tarefas do dia-a-dia.",

  // Atlântico
  "z-ai/glm-5-turbo":
    "Resposta rápida no plantão — ideal quando você precisa de uma leitura em segundos.",
  "z-ai/glm-4-air":
    "Atlântico leve — triagem de mensagens e perguntas simples com latência mínima.",

  // Vereda
  "meta-llama/llama-3.3-70b-instruct":
    "Conversação ágil para primeira leitura — deixa as decisões finas para os modelos sêniores.",
  "meta-llama/llama-3.1-70b-instruct":
    "Conversação ágil para primeira leitura — deixa as decisões finas para os modelos sêniores.",
  "meta-llama/llama-3.1-8b-instruct":
    "Vereda compacta — pergunta rápida, resposta direta, sem contexto longo.",

  // Concílio
  "anthropic/claude-sonnet-4-6":
    "Texto cuidadoso, tom editorial, ótimo para nota oficial e comunicação institucional.",
  "anthropic/claude-sonnet-4-5":
    "Texto cuidadoso, tom editorial, ótimo para nota oficial e comunicação institucional.",
  "anthropic/claude-3.5-sonnet":
    "Concílio de geração anterior — ainda excelente para revisão e tom institucional.",
  "anthropic/claude-opus-4-7":
    "O mais cuidadoso da família. Use para parecer crítico, peças formais e análise delicada.",
  "anthropic/claude-opus-4-1":
    "O mais cuidadoso da família. Use para parecer crítico, peças formais e análise delicada.",
  "anthropic/claude-haiku-4-5":
    "Concílio enxuto — respostas curtas e bem escritas em alta velocidade.",

  // Diplomata
  "openai/gpt-4o":
    "Articulação fluida e versátil. Bom curinga quando ainda não sabe qual modelo escolher.",
  "openai/gpt-4o-mini":
    "Diplomata enxuto — sumarização e classificação rápida de mensagens.",
  "openai/gpt-4-turbo":
    "Geração anterior do Diplomata — confiável para tarefas conhecidas.",
  "openai/o1":
    "Reflete antes de responder. Use para problemas que exigem raciocínio passo-a-passo (jurídico, técnico).",
  "openai/o1-mini":
    "Diplomata reflexivo enxuto — raciocínio passo-a-passo em escala menor.",

  // Tribuno
  "cohere/command-r-plus":
    "Argumentação direta com base em fontes citadas. Ideal para fundamentar conclusões.",
  "cohere/command-r":
    "Tribuno padrão — respostas com citações em estrutura clara.",

  // Lume
  "deepseek/deepseek-chat":
    "Pesquisa exploratória — bom para abrir caminho em assunto novo antes de pedir o aprofundamento.",
  "deepseek/deepseek-r1":
    "Lume reflexivo — raciocínio passo-a-passo aberto, útil para entender problemas complexos.",
  "deepseek/deepseek-chat-v3-0324":
    "Geração recente do Lume — conversação ampla e tool use, soberano e hospedável.",
  "qwen/qwen-2.5-7b-instruct":
    "Aurora compacta — leve e rápida para tarefas simples e classificação.",

  // Luar
  "moonshotai/kimi-k2.6":
    "Linha Luar — o agente de Coleta do AEGIS: orquestra ferramentas e percorre fontes externas com janela longa, soberano e sob nosso controle.",
}


// Aliases sem prefixo de provedor — o backend grava o ``model`` cru
// (ex.: ``"llama-3.3-70b-versatile"``, ``"mixtral-8x22b-instruct"``,
// ``"gpt-4o"``) sem o ``provider/`` na frente. Aqui mapeamos os
// nomes canônicos do Groq/OpenRouter/etc. de volta para a entrada
// do MODEL_CODENAMES correspondente. Mantém os codinomes
// idênticos aos exibidos no seletor de modelo do AIP Chat.
const MODEL_ALIASES: Record<string, string> = {
  // Llama (Groq usa "llama-3.3-70b-versatile" — mapeia pra Vereda 70B)
  "llama-3.3-70b-versatile": "meta-llama/llama-3.3-70b-instruct",
  "llama-3.3-70b": "meta-llama/llama-3.3-70b-instruct",
  "llama-3.3-70b-instruct": "meta-llama/llama-3.3-70b-instruct",
  "llama-3.1-70b-versatile": "meta-llama/llama-3.1-70b-instruct",
  "llama-3.1-70b": "meta-llama/llama-3.1-70b-instruct",
  "llama-3.1-70b-instruct": "meta-llama/llama-3.1-70b-instruct",
  "llama-3.1-8b-instant": "meta-llama/llama-3.1-8b-instruct",
  "llama-3.1-8b": "meta-llama/llama-3.1-8b-instruct",
  "llama-3.1-8b-instruct": "meta-llama/llama-3.1-8b-instruct",
  // Mistral / Mixtral
  "mixtral-8x22b-instruct": "mistralai/mixtral-8x22b-instruct",
  "mixtral-8x22b": "mistralai/mixtral-8x22b-instruct",
  "mistral-large": "mistralai/mistral-large",
  "mistral-large-2407": "mistralai/mistral-large-2407",
  "mistral-medium-3": "mistralai/mistral-medium-3",
  "mistral-small": "mistralai/mistral-small",
  // OpenAI GPT
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4-turbo": "openai/gpt-4-turbo",
  "o1": "openai/o1",
  "o1-mini": "openai/o1-mini",
  // Anthropic Claude
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4-5",
  "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
  "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
  "claude-opus-4-7": "anthropic/claude-opus-4-7",
  "claude-opus-4-1": "anthropic/claude-opus-4-1",
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
  // Cohere Command
  "command-r-plus": "cohere/command-r-plus",
  "command-r": "cohere/command-r",
  // DeepSeek
  "deepseek-chat": "deepseek/deepseek-chat",
  "deepseek-r1": "deepseek/deepseek-r1",
  // Qwen
  "qwen-max": "qwen/qwen-max",
  "qwen-2.5-72b-instruct": "qwen/qwen-2.5-72b-instruct",
  "qwen-2-72b-instruct": "qwen/qwen-2-72b-instruct",
  "qwen-plus": "qwen/qwen-plus",
  // AI21 Jamba
  "jamba-1-5-large": "ai21/jamba-1-5-large",
  "jamba-large": "ai21/jamba-large",
  "jamba-1-5-mini": "ai21/jamba-1-5-mini",
  // Z-AI / GLM
  "glm-5-turbo": "z-ai/glm-5-turbo",
  "glm-4-air": "z-ai/glm-4-air",

  // --------------------------------------------------------------------- //
  // IDs sintéticos do catálogo do security-app (ontology-module byom.py
  // `PRESET_MODELS`). O catálogo serve ``preset-<provider>-<modelo>`` em
  // vez do id canônico (``meta-llama/...``). Mapeamos de volta para a
  // entrada curada de MODEL_CODENAMES/MODEL_NOTES correspondente para que
  // o seletor mostre o codinome AIP + a descrição PT-BR (nunca o id cru).
  // --------------------------------------------------------------------- //
  "preset-groq-llama-3.3-70b": "meta-llama/llama-3.3-70b-instruct",
  "preset-groq-llama-3.1-8b": "meta-llama/llama-3.1-8b-instruct",
  "preset-openrouter-r1": "deepseek/deepseek-r1",
  "preset-openrouter-qwen-72b": "qwen/qwen-2.5-72b-instruct",
}


/**
 * Resolve qualquer string crua de modelo para a chave canônica do
 * ``MODEL_CODENAMES``. Tenta:
 *   1. correspondência direta (com ou sem prefixo de provedor)
 *   2. correspondência via alias sem prefixo
 *   3. correspondência por sufixo dentro de uma key conhecida (cobre
 *      variações pontuais do tipo ``"-versatile"`` vs ``"-instruct"``)
 */
function canonicaliseModelId(modelId: string): string | null {
  if (!modelId) return null
  if (MODEL_CODENAMES[modelId]) return modelId
  const stripped = modelId.includes("/") ? modelId.split("/").pop()! : modelId
  if (MODEL_ALIASES[modelId]) return MODEL_ALIASES[modelId]
  if (MODEL_ALIASES[stripped]) return MODEL_ALIASES[stripped]
  // Heurística suave: pega a primeira chave canonical que termina com o
  // nome cru. Cobre variações de sufixo (``-versatile``/``-instant``/
  // ``-instruct``/``-turbo``).
  const lower = stripped.toLowerCase()
  for (const k of Object.keys(MODEL_CODENAMES)) {
    const kSuffix = k.split("/").pop()!.toLowerCase()
    // Substring match grosseiro pra cobrir e.g. "llama-3.3-70b" ⊂ "llama-3.3-70b-instruct"
    const lowerStem = lower.replace(/-(versatile|instant|instruct|turbo)$/, "")
    const kStem = kSuffix.replace(/-(versatile|instant|instruct|turbo)$/, "")
    if (lowerStem === kStem) return k
  }
  return null
}


// Codinomes para fallback (model.id desconhecido). Vocabulário civil,
// sem repetir nomes do mapa principal.
const FALLBACK_CODENAMES = [
  "Brisa",
  "Cruzeiro",
  "Equador",
  "Estela",
  "Foz",
  "Manha",
  "Mares",
  "Nexo",
  "Solar",
  "Vertice",
]


function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}


function inferSize(id: string): string {
  const m = id.match(/(\d+)x?(\d+)?b/i)
  if (m) return m[2] ? `${m[1]}x${m[2]}B` : `${m[1]}B`
  const lower = id.toLowerCase()
  if (lower.includes("ultra")) return "Ultra"
  if (lower.includes("turbo")) return "Turbo"
  if (lower.includes("large") || lower.includes("max") || lower.includes("plus")) return "Pro"
  if (lower.includes("medium") || lower.includes("std")) return "Med"
  if (lower.includes("mini") || lower.includes("small") || lower.includes("lite")) return "Lite"
  if (lower.includes("o1") || lower.includes("reflexao")) return "Reflexao"
  return "Std"
}


/** Padrões de model id que NÃO são modelos LLM e portanto não recebem
 *  codinome — são serviços internos (RAG federado, cache, fila etc.).
 *  Em vez disso o caller deve usar ``aipProviderLabel`` para exibir
 *  apenas o tipo de serviço (ex.: "Busca interna").
 */
const INTERNAL_MODEL_PATTERNS = [
  /^rag(\.|$)/i,            // rag.federation.v1, rag, rag.foo
  /^federation/i,
  /^cache(\.|$)/i,
  /^aegis-?internal/i,
  /^entity_dossier@/i,
]

export function isInternalModel(modelId: string): boolean {
  if (!modelId) return false
  return INTERNAL_MODEL_PATTERNS.some((p) => p.test(modelId))
}


export function aipModelLabel(modelId: string): string {
  // Serviços internos NÃO recebem codinome — retornam vazio para que o
  // caller exiba apenas o rótulo do provedor (ex.: "Busca interna").
  if (isInternalModel(modelId)) return ""
  const canon = canonicaliseModelId(modelId)
  if (canon && MODEL_CODENAMES[canon]) return MODEL_CODENAMES[canon]
  const cn = FALLBACK_CODENAMES[fnv1a(modelId) % FALLBACK_CODENAMES.length]
  return `AIP-${cn}-${inferSize(modelId)}`
}

export function aipModelNote(modelId: string): string {
  if (isInternalModel(modelId)) return ""
  const canon = canonicaliseModelId(modelId)
  if (canon && MODEL_NOTES[canon]) return MODEL_NOTES[canon]
  // Sem descrição curada → SEM nota (nunca um placeholder "será publicada…",
  // que soa amador). O card renderiza a nota só quando existe.
  return ""
}

/**
 * True quando o modelo tem codinome + descrição PT-BR contextualizada.
 * Modelos não-curados são escondidos do seletor.
 */
export function isCuratedModel(modelId: string): boolean {
  const canon = canonicaliseModelId(modelId)
  return canon !== null && canon in MODEL_CODENAMES && canon in MODEL_NOTES
}


// --------------------------------------------------------------------------- //
// Provedores
// --------------------------------------------------------------------------- //
export function aipProviderLabel(providerId: string): string {
  // Serviços internos viram rótulos descritivos PT-BR; provedores
  // externos (groq, openrouter, anthropic, openai etc.) viram todos
  // "AIP Cloud" para o operador.
  const p = (providerId || "").toLowerCase()
  if (p === "rag" || p === "federation") return "Busca interna"
  if (p === "cache") return "Cache"
  if (p.startsWith("aegis") || p === "internal") return "AIP"
  return "AIP Cloud"
}

// Famílias de modelos ABERTOS/livres que o AEGIS hospeda (ou hospedará) — são
// considerados "AIP Cloud" DE FATO: viram propriedade/responsabilidade do AEGIS.
// Os proprietários fechados (OpenAI, Anthropic, Cohere, Meta/Llama do norte global)
// NÃO são AIP Cloud — o AEGIS só roteia, não controla → "Nuvem externa". BYOM
// (endpoint do próprio tenant) é sempre AIP Cloud.
const AIP_CLOUD_FAMILIES = ["deepseek/", "mistralai/", "qwen/", "z-ai/", "baai/", "moonshotai/"]

// Topo de linha do AIP que carrega "Destaque": os 2 carros-chefe de chat
// (Ipiranga 22B + Pro) + o melhor embedding soberano (Aurora/Qwen v4). Nunca um
// modelo externo, nunca os secundários.
const FLAGSHIP_CODENAMES = new Set([
  "AIP-Ipiranga-22B",
  "AIP-Ipiranga-Pro",
  "AIP-Aurora-Embeddings",
])
export function isFlagshipModel(modelId: string, source?: string): boolean {
  if (source === "byom") return false
  if (!isAipCloudModel(modelId, source)) return false
  return FLAGSHIP_CODENAMES.has(aipModelLabel(modelId) || "")
}

export function isAipCloudModel(modelId: string, source?: string): boolean {
  if (source === "byom") return true
  const canon = (canonicaliseModelId(modelId) || modelId || "").toLowerCase()
  return AIP_CLOUD_FAMILIES.some((f) => canon.startsWith(f))
}

/** Provider IDs hidden from the operator-facing chat selector. */
export const HIDDEN_PROVIDERS: ReadonlySet<string> = new Set(["groq"])

export function isHiddenProvider(providerId: string): boolean {
  return HIDDEN_PROVIDERS.has(providerId.toLowerCase())
}


// --------------------------------------------------------------------------- //
// Capability badges.
//
// O catálogo (`AipCatalogModel.capabilities`) entrega códigos crus da
// taxonomia do backend (`tool_use`, `reasoning`, `long_context`, `vision`,
// `streaming`, `structured_outputs`, `audio`). O seletor NUNCA exibe o
// código cru — traduz para um rótulo legível bilíngue (memória
// `feedback_widget_type_never_raw_in_ui` + `feedback_ui_english_only`).
//
// `aipCapabilityLabel` retorna a chave de i18n curta (sem prefixo) quando
// houver tradução; o componente resolve via `useT('aip.cap.<key>')`. Para
// códigos desconhecidos retorna o próprio código humanizado (sem `_`).
// --------------------------------------------------------------------------- //
export const CAPABILITY_I18N_KEYS: Record<string, string> = {
  tool_use: "aip.cap.tool_use",
  reasoning: "aip.cap.reasoning",
  long_context: "aip.cap.long_context",
  vision: "aip.cap.vision",
  streaming: "aip.cap.streaming",
  structured_outputs: "aip.cap.structured_outputs",
  audio: "aip.cap.audio",
}

/** True quando a capability é conhecida (tem rótulo i18n curado). */
export function isKnownCapability(cap: string): boolean {
  return cap in CAPABILITY_I18N_KEYS
}

/**
 * Chave de i18n para a capability, ou string humanizada de fallback
 * (``"long_context"`` → ``"long context"``) quando não houver tradução.
 * O caller deve passar o resultado por `t()` quando `isKnownCapability`.
 */
export function aipCapabilityKey(cap: string): string {
  return CAPABILITY_I18N_KEYS[cap] ?? cap.replace(/_/g, " ")
}

/** As capabilities que disparam os filtros do seletor de modelo. */
export const FILTER_CAPABILITIES = {
  tools: "tool_use",
  reasoning: "reasoning",
} as const

/** Exposto p/ canonicalização nas camadas de exibição (chips, seletor). */
export { canonicaliseModelId }
