/**
 * Tarefa E (2026-06-11) — labels de skill no DISPLAY LAYER com i18n.
 *
 * O catálogo de skills (GET /governance/agents/skills) entrega label e
 * descrição só em pt-BR — são as strings declaradas nas classes Skill do
 * backend. Regra do produto (memórias feedback_i18n_locales +
 * feedback_ui_english_only): pt-BR default + en-US 1ª classe, com a tradução
 * na CAMADA DE EXIBIÇÃO — mesmo padrão do aipModelLabel/aipCapabilityKey em
 * lib/aip/modelLabels.ts (o backend nunca precisa saber de locale).
 *
 * Resolução (nesta ordem):
 *   1. dicionário `skills.<skill_key>.label|.desc` (pt-BR ESPELHA o backend;
 *      en-US é o par traduzido) — cobre as skills de conector visíveis hoje;
 *   2. label/descrição vindos do catálogo (o backend CONTINUA a fonte para
 *      skills novas que ainda não ganharam par no dict);
 *   3. fallback final: a key humanizada (pontos/underscores → espaço) para
 *      label — nunca a key técnica crua sozinha
 *      (memória feedback_widget_type_never_raw_in_ui) — e '' para desc.
 *
 * O caller passa o próprio `t` (useT()): o helper fica puro (testável sem
 * provider) e a tradução segue o locale ativo do operador.
 */
import { DICT } from './dict';

type Translate = (key: string) => string;

/** Chave do dict para o label da skill, ou null quando não curada. */
export function skillLabelKey(skillKey: string): string | null {
  const k = `skills.${skillKey}.label`;
  return k in DICT ? k : null;
}

/** Chave do dict para a descrição da skill, ou null quando não curada. */
export function skillDescKey(skillKey: string): string | null {
  const k = `skills.${skillKey}.desc`;
  return k in DICT ? k : null;
}

/**
 * Label da skill no locale ativo: dict → label do catálogo → key humanizada.
 * Key vazia retorna '' (o caller decide o placeholder, ex.: '—').
 */
export function skillLabel(t: Translate, skillKey: string, fallbackLabel?: string): string {
  if (!skillKey) return '';
  const k = skillLabelKey(skillKey);
  if (k) return t(k);
  if (fallbackLabel) return fallbackLabel;
  return skillKey.replace(/[._]/g, ' ');
}

/**
 * Descrição da skill no locale ativo: dict → descrição do catálogo → ''.
 * Sem placeholder inventado — o caller só renderiza quando existe.
 */
export function skillDesc(t: Translate, skillKey: string, fallbackDesc?: string): string {
  if (!skillKey) return '';
  const k = skillDescKey(skillKey);
  if (k) return t(k);
  return fallbackDesc ?? '';
}
