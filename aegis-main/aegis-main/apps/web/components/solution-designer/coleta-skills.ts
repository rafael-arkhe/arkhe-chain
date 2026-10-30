/**
 * coleta-skills — um nó de Coleta pode ter N skills (cada uma → seu worker).
 *
 * Erro do operador: ao montar a operação Instagram, a Coleta só deixava
 * escolher UMA skill (`coleta_skill_key`), então parecia "limitada a 1 tipo".
 * Aqui o modelo passa a ser uma LISTA `coleta_skills: [{skill_key, params}]`,
 * com retrocompat ao singular (lê `coleta_skill_key` + `coleta_params` como
 * 1 item). O backend já materializa N workers (1 por proposed_agent), então
 * cada skill da lista vira um worker na materialização.
 */

export interface ColetaSkill {
  skill_key: string;
  params: Record<string, unknown>;
}

/** Lê o singular LEGADO (`coleta_skill_key` + `coleta_params`). */
export function readColetaSkill(
  config: Record<string, unknown> | undefined,
): ColetaSkill | null {
  const sk = config?.coleta_skill_key;
  if (typeof sk !== 'string' || !sk) return null;
  const params = (config?.coleta_params as Record<string, unknown>) || {};
  return { skill_key: sk, params: params && typeof params === 'object' ? params : {} };
}

/**
 * Lista canônica de skills do nó: lê `coleta_skills` (array) com fallback
 * defensivo ao singular legado. Dedupe por skill_key (1ª ocorrência vence).
 * NUNCA retorna null — sempre array (vazio ok).
 */
export function readColetaSkills(
  config: Record<string, unknown> | undefined,
): ColetaSkill[] {
  const raw = config?.coleta_skills;
  if (Array.isArray(raw)) {
    const seen = new Set<string>();
    const out: ColetaSkill[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const sk = o.skill_key;
      if (typeof sk !== 'string' || !sk || seen.has(sk)) continue;
      seen.add(sk);
      const params = o.params && typeof o.params === 'object'
        ? (o.params as Record<string, unknown>)
        : {};
      out.push({ skill_key: sk, params });
    }
    return out;
  }
  const legacy = readColetaSkill(config);
  return legacy ? [legacy] : [];
}

/**
 * Reescreve o config do nó com a lista de skills. Grava `coleta_skills` e
 * REMOVE o singular legado (`coleta_skill_key`/`coleta_params`) — nunca deixa
 * os dois esquemas coexistirem. Lista vazia → remove a chave.
 */
export function writeColetaSkillsConfig(
  config: Record<string, unknown> | undefined,
  skills: ColetaSkill[],
): Record<string, unknown> {
  const next = { ...(config || {}) } as Record<string, unknown>;
  delete next.coleta_skill_key;
  delete next.coleta_params;
  if (skills.length > 0) {
    next.coleta_skills = skills.map((s) => ({
      skill_key: s.skill_key,
      params: s.params || {},
    }));
  } else {
    delete next.coleta_skills;
  }
  return next;
}

/** Adiciona uma skill (NOP se já presente — dedupe por skill_key). */
export function addColetaSkill(skills: ColetaSkill[], skillKey: string): ColetaSkill[] {
  if (!skillKey || skills.some((s) => s.skill_key === skillKey)) return skills;
  return [...skills, { skill_key: skillKey, params: {} }];
}

/** Remove uma skill por skill_key. */
export function removeColetaSkill(skills: ColetaSkill[], skillKey: string): ColetaSkill[] {
  return skills.filter((s) => s.skill_key !== skillKey);
}

/** Atualiza um parâmetro de uma skill específica. */
export function setColetaSkillParam(
  skills: ColetaSkill[],
  skillKey: string,
  paramKey: string,
  value: unknown,
): ColetaSkill[] {
  return skills.map((s) =>
    s.skill_key === skillKey
      ? { ...s, params: { ...s.params, [paramKey]: value } }
      : s,
  );
}
