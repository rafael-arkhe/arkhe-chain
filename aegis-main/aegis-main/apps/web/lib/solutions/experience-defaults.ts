/**
 * W2 (2026-06-28) — defaults + leitor dos PARÂMETROS da experiência
 * "Soluções" (Desenho da Operação / AIP Arquiteto).
 *
 * A página `/paginas/solutions/view` é uma rota `app_route` (canvas
 * reactflow servido por código; não montável por widgets), mas a
 * PARAMETRIZAÇÃO de COMO o AIP Arquiteto se comporta é editável pelo
 * operador em Páginas → "Configurar experiência". Esses parâmetros vivem em
 * `Page.config.params` (Tenant.metadata_, sem migração) e são lidos aqui de
 * forma defensiva.
 *
 * Este módulo é DELIBERADAMENTE leve (zero deps de UI / API / markdown):
 * tanto o configurador (`solutions-experience-editor`) quanto o runtime
 * (`solutions/page.tsx` → `ArquitetoChat`) importam daqui sem puxar bundles
 * pesados para os testes. É a ÚNICA fonte de verdade do par provider/model
 * default do AIP Arquiteto (o `ArquitetoChat` reusa estas constantes).
 */

/** Slug canônico da Página "Soluções" (registry de Páginas do tenant). */
export const SOLUTIONS_SLUG = 'solutions';

/** ``experience_kind`` da /solutions (contrato do backend, seed canônico). */
export const SOLUTIONS_EXPERIENCE_KIND = 'solutions';

/** Perm canônica de leitura do Desenho da Operação (catálogo IAM). */
export const SOLUTIONS_READ_PERM = 'solution.diagram.read';

/** Profundidade default da proposta do AIP Arquiteto. `lean` = núcleo enxuto
 *  (1 chamada, segundos); `full` = largura multi-agente (minutos). */
export type SolutionsDepth = 'lean' | 'full';
export const SOLUTIONS_DEFAULT_DEPTH: SolutionsDepth = 'lean';

/** Escopo default do desenho. `full` = solução inteira (comportamento atual,
 *  sem foco); `module`/`page` recortam a geração. */
export type SolutionsScopeKind = 'full' | 'module' | 'page';
export const SOLUTIONS_DEFAULT_SCOPE_KIND: SolutionsScopeKind = 'full';

// Mesmo par vencedor de eval do aip-chat (codinome AIP via aipModelLabel —
// NUNCA exposto cru). Fonte única reusada pelo ArquitetoChat.
export const SOLUTIONS_DEFAULT_MODEL = 'mistralai/mixtral-8x22b-instruct';
export const SOLUTIONS_DEFAULT_PROVIDER = 'openrouter';

/** Parâmetros resolvidos (sempre completos — defaults preenchem ausências). */
export interface SolutionsExperienceParams {
  depth: SolutionsDepth;
  scope: SolutionsScopeKind;
  /** Slug real do modelo (resolvido para codinome AIP na exibição). */
  model: string;
  provider: string;
}

/**
 * Lê os parâmetros da experiência do `Page.config` (blob app_route),
 * preenchendo defaults para qualquer campo ausente/ inválido. Defensivo:
 * aceita o config cru (qualquer shape) e nunca lança.
 */
export function readSolutionsExperienceParams(
  config: unknown,
): SolutionsExperienceParams {
  const rawParams =
    config && typeof config === 'object'
      ? (config as Record<string, unknown>).params
      : null;
  const params =
    rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
      ? (rawParams as Record<string, unknown>)
      : {};

  const depth: SolutionsDepth =
    params.depth === 'full' ? 'full' : SOLUTIONS_DEFAULT_DEPTH;
  const scope: SolutionsScopeKind =
    params.scope === 'module' || params.scope === 'page'
      ? (params.scope as SolutionsScopeKind)
      : SOLUTIONS_DEFAULT_SCOPE_KIND;
  const model =
    typeof params.model === 'string' && params.model.trim()
      ? params.model
      : SOLUTIONS_DEFAULT_MODEL;
  const provider =
    typeof params.provider === 'string' && params.provider.trim()
      ? params.provider
      : SOLUTIONS_DEFAULT_PROVIDER;

  return { depth, scope, model, provider };
}
