/**
 * Apresentação amigável dos agentes para o operador.
 *
 * O backend (compartilhado com o ontology-module) carrega `name` e
 * `description` com jargão técnico interno: "Worker", "OpenClaw",
 * "Postiz", "dry_run", "skill", IDs numéricos, etc. Nada disso pode
 * aparecer para um operador de segurança pública.
 *
 * Esta camada substitui o que o backend manda por copy preparado para
 * a sala de situação. Slugs desconhecidos caem no fallback (mostra o
 * que veio do backend, sem exposição extra).
 */

interface FriendlyAgentMeta {
  display_name: string;
  description: string;
  /** Subtítulo curto: pra que serve no dia-a-dia. */
  purpose?: string;
}

// Rótulos genéricos — operador pediu que nomes não citem alvos
// específicos e sejam óbvios em primeira leitura. O slug fica como
// id técnico no banco; aqui só apresentamos.
const AGENT_OVERRIDES: Record<string, FriendlyAgentMeta> = {
  // Coletores de redes sociais
  "worker-target-x": {
    display_name: "Coletor X (Twitter)",
    description:
      "Acompanha posts, respostas e menções de uma conta-alvo no X.",
    purpose: "coleta X",
  },
  "worker-target-ig": {
    display_name: "Coletor Instagram",
    description:
      "Acompanha posts, stories e métricas de uma conta-alvo no Instagram.",
    purpose: "coleta Instagram",
  },

  // F17 — coletor de notícias via RSS
  "worker-news": {
    display_name: "Coletor de Notícias",
    description:
      "Lê os principais veículos brasileiros (G1, Folha, Estadão, UOL, Poder360, JOTA, Metrópoles, Veja, CartaCapital, CNN, BBC e mais) e ingere matérias relevantes.",
    purpose: "coleta de imprensa",
  },

  // AIPs — sem citar nome
  "aip-narrative": {
    display_name: "Análise de narrativa",
    description:
      "Lê posts e notícias e produz análise de tom, vetores de ataque e linhas de mensagem recomendadas.",
    purpose: "síntese de narrativa",
  },
  "aip-broadcast": {
    display_name: "Publicação multicanal",
    description:
      "Publica texto e mídia nos canais conectados. Sempre exige aprovação antes de publicar.",
    purpose: "publicação",
  },
};


export function friendlyAgentDisplayName(slug: string, fallback: string): string {
  return AGENT_OVERRIDES[slug]?.display_name ?? fallback;
}

export function friendlyAgentDescription(
  slug: string,
  fallback: string | null | undefined,
): string {
  // Mesmo sem override, varre o fallback por jargão e suprime se acharmos.
  const override = AGENT_OVERRIDES[slug];
  if (override) return override.description;
  const text = fallback ?? "";
  if (containsInternalJargon(text)) return "";
  return text;
}

export function friendlyAgentPurpose(slug: string): string | undefined {
  return AGENT_OVERRIDES[slug]?.purpose;
}


function containsInternalJargon(s: string): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  return [
    "openclaw", "clawhub", "claw-hub",
    "dry_run", "dry-run", "dryrun",
    "postiz",
    "skill ", "skill_",
    "worker ", "pull ", "fetch ",
    "mcp_", "mcp adapter",
  ].some((needle) => lower.includes(needle));
}
