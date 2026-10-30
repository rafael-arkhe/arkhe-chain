/**
 * W3 (2026-06-28) — defaults + leitor dos PARÂMETROS da experiência
 * "Agentes" (frota 24/7 — kanban + execução em tempo real).
 *
 * A página `/agentes` é uma rota `app_route` (o kanban É a experiência,
 * servido por código; não montável por widgets), mas a PARAMETRIZAÇÃO de
 * COMO A FROTA se comporta por padrão é editável pelo operador em Páginas →
 * "Configurar experiência". Esses parâmetros vivem em `Page.config.params`
 * (Tenant.metadata_, sem migração) e são lidos aqui de forma defensiva.
 *
 * Módulo DELIBERADAMENTE leve (zero deps de UI / API): tanto o configurador
 * (`agents-experience-editor`) quanto o runtime (`app/agentes/page.tsx`)
 * importam daqui sem puxar bundles pesados para os testes. Importa apenas o
 * TIPO `CronPreset` (apagado em runtime) do cliente de Agentes para manter o
 * vocabulário de cron numa fonte única.
 */
import type { CronPreset } from '@/lib/api/agentes';

/** Slug canônico da Página "Agentes" (registry de Páginas do tenant). */
export const AGENTES_SLUG = 'agentes';

/** ``experience_kind`` da /agentes (contrato do backend, seed canônico). */
export const AGENTES_EXPERIENCE_KIND = 'agents';

/** Perm canônica de leitura do kanban da frota (catálogo IAM). */
export const AGENTES_VIEW_PERM = 'security.agentes.view';

/**
 * Presets de cron válidos — fonte única do dropdown do configurador.
 * Espelha o union `CronPreset` do cliente de Agentes; usado para validar o
 * valor persistido (defensivo contra blobs antigos/inválidos).
 */
export const AGENTES_CRON_PRESETS: readonly CronPreset[] = [
  'off',
  'every_15m',
  'every_hour',
  'every_6h',
  'daily_6am_brt',
  'daily_6pm_brt',
  'weekly_monday_6am_brt',
];

/**
 * Cadência default da frota. `off` preserva o comportamento atual (um agente
 * recém-instalado sem agenda mostra "Sem cron"); o operador eleva isto para
 * uma cadência fixa e o board passa a oferecê-la como padrão a agentes ainda
 * sem agenda própria.
 */
export const AGENTES_DEFAULT_CRON: CronPreset = 'off';

/**
 * Modelo AIP default da frota — mesmo carro-chefe soberano do AIP Chat /
 * Arquiteto. Codinome via `aipModelLabel`, NUNCA exposto cru. A escolha é
 * centralizada em Dados → Modelos.
 */
export const AGENTES_DEFAULT_MODEL = 'mistralai/mixtral-8x22b-instruct';
export const AGENTES_DEFAULT_PROVIDER = 'openrouter';

/**
 * Prompt-base default para novos agentes. Vazio = cada tipo de agente usa o
 * seu próprio prompt-padrão (sem sobrescrever) — espelha a semântica do
 * `AgentConfigEditor` (campo vazio = prompt-padrão do tipo).
 */
export const AGENTES_DEFAULT_SYSTEM_PROMPT = '';

/** Parâmetros resolvidos (sempre completos — defaults preenchem ausências). */
export interface AgentsExperienceParams {
  /** Cadência default oferecida a agentes sem agenda própria. */
  defaultCron: CronPreset;
  /** Prompt-base default para novos agentes ('' = prompt-padrão do tipo). */
  systemPrompt: string;
  /** Slug real do modelo (resolvido para codinome AIP na exibição). */
  model: string;
  provider: string;
}

/**
 * Lê os parâmetros da experiência do `Page.config` (blob app_route),
 * preenchendo defaults para qualquer campo ausente/inválido. Defensivo:
 * aceita o config cru (qualquer shape) e nunca lança.
 */
export function readAgentsExperienceParams(
  config: unknown,
): AgentsExperienceParams {
  const rawParams =
    config && typeof config === 'object'
      ? (config as Record<string, unknown>).params
      : null;
  const params =
    rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
      ? (rawParams as Record<string, unknown>)
      : {};

  const defaultCron: CronPreset =
    typeof params.default_cron === 'string' &&
    (AGENTES_CRON_PRESETS as readonly string[]).includes(params.default_cron)
      ? (params.default_cron as CronPreset)
      : AGENTES_DEFAULT_CRON;

  const systemPrompt =
    typeof params.system_prompt === 'string'
      ? params.system_prompt
      : AGENTES_DEFAULT_SYSTEM_PROMPT;

  const model =
    typeof params.model === 'string' && params.model.trim()
      ? params.model
      : AGENTES_DEFAULT_MODEL;

  const provider =
    typeof params.provider === 'string' && params.provider.trim()
      ? params.provider
      : AGENTES_DEFAULT_PROVIDER;

  return { defaultCron, systemPrompt, model, provider };
}
