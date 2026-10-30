/**
 * #7 — Formatação de DETECÇÃO no display layer (locale ativo).
 *
 * O backend é locale-agnóstico (devolve a classe canônica em inglês, ex.: "car")
 * — a tradução é responsabilidade do FRONTEND (régua multidomínio: nunca
 * traduzir no backend). Este módulo é o ponto ÚNICO que as superfícies usam pra
 * não repetir "car"/"OBJ"/"conf" cru. Puro (recebe o `t` do useT()).
 *
 * Resolução da classe: dict `skillClasses.<name>` → label do backend → name
 * canônico (ver lib/i18n/class-labels.ts). Modalidade (OBJ/LPR/FACE) e o rótulo
 * "conf" vêm do dict `detection.*`.
 */
import { DICT } from './dict';
import { detectorClassLabel } from './class-labels';

type T = (key: string) => string;

/** Classe da detecção localizada ("car" → "carro"). Reusa a barreira existente. */
export function detectionClassLabel(t: T, name: string, fallbackLabel?: string): string {
  return detectorClassLabel(t, name, fallbackLabel);
}

/** Modalidade (object/lpr/face) localizada via dict; fallback = code em maiúsculas. */
export function detectionKindLabel(t: T, kind: string): string {
  if (!kind) return '';
  const k = `detection.kind.${kind}`;
  return k in DICT ? t(k) : kind.toUpperCase();
}

/** Rótulo curto de confiança ("conf") localizado. */
export function detectionConfLabel(t: T): string {
  return t('detection.conf');
}

/** "conf 96%" pronto (rótulo localizado + percentual). `pct` 0–100 já arredondado. */
export function detectionConf(t: T, pct: number): string {
  return `${t('detection.conf')} ${pct}%`;
}
