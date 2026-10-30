export type ClassificationLevel = 'publico' | 'restrito' | 'confidencial' | 'sigiloso';

export const CLASSIFICATION_RANK: Record<ClassificationLevel, number> = {
  publico: 0,
  restrito: 1,
  confidencial: 2,
  sigiloso: 3,
};

export const CLASSIFICATION_LABEL: Record<ClassificationLevel, string> = {
  publico: 'PÚBLICO',
  restrito: 'RESTRITO',
  confidencial: 'CONFIDENCIAL',
  sigiloso: 'SIGILOSO',
};

export const CLASSIFICATION_BG: Record<ClassificationLevel, string> = {
  publico: 'bg-cls-publico',
  restrito: 'bg-cls-restrito',
  confidencial: 'bg-cls-confidencial',
  sigiloso: 'bg-cls-sigiloso',
};

export const CLASSIFICATION_TEXT: Record<ClassificationLevel, string> = {
  publico: 'text-white',
  restrito: 'text-black',
  confidencial: 'text-white',
  sigiloso: 'text-white',
};

export function maxLevel(levels: ClassificationLevel[]): ClassificationLevel {
  if (levels.length === 0) return 'publico';
  return levels.reduce((max, cur) =>
    CLASSIFICATION_RANK[cur] > CLASSIFICATION_RANK[max] ? cur : max,
  );
}

const CLASSIFICATION_LEVELS: ClassificationLevel[] = [
  'publico',
  'restrito',
  'confidencial',
  'sigiloso',
];

/** Type-guard: a string é um dos 4 níveis de classificação conhecidos. */
export function isClassificationLevel(v: unknown): v is ClassificationLevel {
  return typeof v === 'string' && (CLASSIFICATION_LEVELS as string[]).includes(v);
}

/**
 * Deriva o NÍVEL de classificação (eixo CBAC) a partir das marcações ARMAZENADAS
 * de um recurso (ex.: `WorkshopApp.markings` / `RegisteredPage.marking_requirements`).
 *
 * O eixo de classificação e o eixo de marcações de compartimento coexistem no
 * mesmo array `markings`: filtramos as entradas que são níveis conhecidos e
 * pegamos o MAIOR (defesa-em-profundidade — o teto vence). Entradas que não são
 * nível (compartimentos como "operacional") são ignoradas aqui.
 *
 * Sem nenhum nível armazenado, cai no `fallback` (default neutro `restrito`) —
 * nunca um nível hardcoded por tela.
 */
export function classificationFromMarkings(
  markings: string[] | null | undefined,
  fallback: ClassificationLevel = 'restrito',
): ClassificationLevel {
  const levels = (markings ?? []).filter(isClassificationLevel);
  if (levels.length === 0) return fallback;
  return maxLevel(levels);
}

/**
 * Sprint Foundry-D (2026-05-22) — CBAC invariant client-side preview.
 *
 * Mirrors backend `app/lib/classification.py:validate_invariant`. Use to
 * disable UI submits before the server rejects (defense in depth). `null`
 * entries are treated as "unclassified" and skipped from the inequality.
 *
 * Returns the violation message (pt-BR) on failure, or `null` if invariant holds.
 */
export function validateInvariant(
  fileCls: ClassificationLevel | null,
  dataCls: ClassificationLevel | null,
  upstreamData: (ClassificationLevel | null)[] = [],
): string | null {
  // data >= file
  if (dataCls != null && fileCls != null) {
    if (CLASSIFICATION_RANK[dataCls] < CLASSIFICATION_RANK[fileCls]) {
      return `Classificação de dado (${CLASSIFICATION_LABEL[dataCls]}) deve ser ≥ classificação de arquivo (${CLASSIFICATION_LABEL[fileCls]}).`;
    }
  }
  // data >= max(upstream)
  if (dataCls != null) {
    const nonNullUpstreams = upstreamData.filter(
      (l): l is ClassificationLevel => l != null,
    );
    if (nonNullUpstreams.length > 0) {
      const floor = maxLevel(nonNullUpstreams);
      if (CLASSIFICATION_RANK[dataCls] < CLASSIFICATION_RANK[floor]) {
        return `Classificação de dado (${CLASSIFICATION_LABEL[dataCls]}) deve ser ≥ classificação máxima dos upstreams (${CLASSIFICATION_LABEL[floor]}).`;
      }
    }
  }
  return null;
}
