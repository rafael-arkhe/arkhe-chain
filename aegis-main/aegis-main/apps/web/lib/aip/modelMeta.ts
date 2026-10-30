/**
 * modelMeta — helpers neutros para exibir metadados de modelos de IA.
 *
 * Regra inviolável: ZERO nomes proprietários visíveis (sem "OpenAI",
 * "Anthropic", "Llama", "Claude", "GPT", "Mistral", "Groq", etc.).
 * Tudo passa pela camada de display (codinomes + chips neutros).
 *
 * Exports:
 *   modelTier(m)          → 'rápido' | 'equilibrado' | 'avançado'
 *   capabilityChipLabel() → chave i18n p/ o chip (ex.: 'aip.cap.vision')
 *   NEUTRAL_CAPS          → lista de capabilities exibíveis (sem streaming)
 */

import type { AipCatalogModel } from '@/lib/api';
import { CAPABILITY_I18N_KEYS } from './modelLabels';

export type ModelTier = 'rápido' | 'equilibrado' | 'avançado';

// Chaves i18n do tier
export const TIER_I18N: Record<ModelTier, string> = {
  'rápido': 'solutions.inferenceModelTierRapido',
  'equilibrado': 'solutions.inferenceModelTierEquilibrado',
  'avançado': 'solutions.inferenceModelTierAvancado',
};

/**
 * Heurística de tier baseada em context_window + capabilities.
 *   avançado : context_window >= 128k  OU  reasoning capability
 *   rápido   : context_window < 16k   OU  nenhuma capability pesada
 *   equilibrado: demais
 *
 * Nunca usa o id do modelo ou nome do provedor.
 */
export function modelTier(m: AipCatalogModel): ModelTier {
  const caps = m.capabilities ?? [];
  if (caps.includes('reasoning') || (m.context_window >= 128_000)) {
    return 'avançado';
  }
  if (m.context_window > 0 && m.context_window < 16_000) {
    return 'rápido';
  }
  if (caps.length === 0 || (caps.length === 1 && caps[0] === 'streaming')) {
    return 'rápido';
  }
  return 'equilibrado';
}

/**
 * Capabilities exibíveis ao operador (exclui 'streaming' que é infra interna).
 * Limitado a 4 chips pra não estourar o card.
 */
export const NEUTRAL_CAPS: ReadonlyArray<string> = [
  'tool_use',
  'reasoning',
  'long_context',
  'vision',
  'structured_outputs',
  'audio',
];

/**
 * Retorna a chave i18n do chip da capability, ou null se não exibível.
 * Componente passa por useT(key) antes de renderizar — nunca o código cru.
 */
export function capabilityI18nKey(cap: string): string | null {
  if (!NEUTRAL_CAPS.includes(cap)) return null;
  return CAPABILITY_I18N_KEYS[cap] ?? null;
}

/**
 * Formata o tamanho do contexto de forma neutra.
 * 128000 → "128 mil" | 16000 → "16 mil" | 0 → null
 */
export function formatContextWindow(ctx: number): string | null {
  if (!ctx || ctx <= 0) return null;
  const k = Math.round(ctx / 1000);
  return k >= 1 ? String(k) : null;
}
