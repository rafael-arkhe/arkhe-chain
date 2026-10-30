/**
 * Tarefa A (2026-06-11) — labels das classes do detector no DISPLAY LAYER.
 *
 * O endpoint GET /cctv/detector/classes entrega o catálogo do detector ativo
 * com label só em pt-BR (é o dado estruturado do backend). Regra do produto
 * (feedback_i18n_locales + feedback_ui_english_only): pt-BR default + en-US
 * 1ª classe, traduzido na CAMADA DE EXIBIÇÃO — MESMO padrão de
 * lib/i18n/skill-labels.ts (o backend nunca precisa saber de locale).
 *
 * Resolução (nesta ordem):
 *   1. dicionário `skillClasses.<name>` (pt-BR ESPELHA o backend; en-US é o
 *      par traduzido) — cobre as 80 classes COCO do detector ativo;
 *   2. label vindo do backend (CONTINUA a fonte p/ classes que ainda não
 *      ganharam par no dict — ex.: catálogo de um modelo novo);
 *   3. fallback final: o próprio name canônico — nunca string vazia.
 *
 * O caller passa o próprio `t` (useT()): o helper fica puro (testável sem
 * provider) e a tradução segue o locale ativo do operador.
 */
import { DICT } from './dict';

type Translate = (key: string) => string;

/** Chave do dict para o label da classe, ou null quando não curada. */
export function detectorClassLabelKey(name: string): string | null {
  const k = `skillClasses.${name}`;
  return k in DICT ? k : null;
}

/**
 * Label humano da classe no locale ativo: dict → label do backend → name
 * canônico. Name vazio retorna '' (o caller decide o placeholder).
 */
export function detectorClassLabel(
  t: Translate,
  name: string,
  fallbackLabel?: string,
): string {
  if (!name) return '';
  const k = detectorClassLabelKey(name);
  if (k) return t(k);
  return fallbackLabel || name;
}

/** Chave do dict para o label da CATEGORIA operacional, ou null. */
export function detectorCategoryLabelKey(key: string): string | null {
  const k = `skillClassCategories.${key}`;
  return k in DICT ? k : null;
}

/**
 * Label humano da CATEGORIA operacional (taxonomia 2026-06-11) no locale
 * ativo: dict (`skillClassCategories.<key>`) → label do backend → a própria
 * key — MESMO padrão de detectorClassLabel (fallback honesto, nunca vazio).
 */
export function detectorCategoryLabel(
  t: Translate,
  key: string,
  fallbackLabel?: string,
): string {
  if (!key) return '';
  const k = detectorCategoryLabelKey(key);
  if (k) return t(k);
  return fallbackLabel || key;
}
