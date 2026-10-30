'use client';

/**
 * Registry de CONFIGURAÇÃO de experiências bespoke (W0 · 2026-06-28).
 *
 * Algumas Páginas ``app_route`` (servidas por código, não montáveis por
 * widgets) ainda expõem PARÂMETROS editáveis pelo operador — ex.: a
 * /buscar expõe as finalidades LGPD do "Montar dossiê". Antes isso era um
 * special-case ``slug === 'buscar'`` espalhado pela UI. Este registry
 * genérico troca o special-case por um lookup:
 *
 *   experience_kind  →  { ConfigEditor, labelKey?, icon? }
 *
 * O ``experience_kind`` vem do ``Page.config`` (mode=app_route) — é o
 * rótulo da aplicação bespoke que serve a rota (contrato do backend). O
 * frontend roteia a configuração por este rótulo, NUNCA pelo slug, para
 * que novas experiências bespoke (aip-threads / solutions / agents em
 * W1+) só precisem registrar seu editor aqui — sem tocar a lista de
 * Páginas nem o dispatcher do editor.
 *
 * Este é o gêmeo de ``app-route-registry`` (slug → componente de
 * RUNTIME que renderiza o corpo da rota). Aqui mapeamos kind → editor de
 * CONFIGURAÇÃO. Os dois são complementares e independentes: um app_route
 * pode ter runtime sem configurador, ou configurador sem runtime
 * registrado. Sem localStorage, sem estado próprio — a fonte de verdade
 * da Page continua sendo o registry no backend.
 */
import type * as React from 'react';
import type { RegisteredPage } from '@/lib/api';

/** Props que todo configurador de experiência bespoke recebe. */
export interface ExperienceConfigProps {
  /** A Page sendo configurada (registry de Páginas do tenant). */
  page: RegisteredPage;
  /** Callback opcional chamado após um save bem-sucedido. */
  onSaved?: () => void;
}

/** Definição registrada de uma experiência bespoke configurável. */
export interface ExperienceConfigDef {
  /** Editor de PARÂMETROS da experiência (não widgets). */
  ConfigEditor: React.ComponentType<ExperienceConfigProps>;
  /**
   * Chave i18n do rótulo do botão "Configurar experiência" exibido na
   * lista de Páginas. Default (quando ausente): ``pages.configureExperience``.
   */
  labelKey?: string;
  /** Ícone lucide opcional para o botão/cabeçalho. */
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const EXPERIENCE_CONFIG_REGISTRY = new Map<string, ExperienceConfigDef>();

/**
 * Registra o configurador de uma experiência bespoke por ``kind``.
 * Idempotente — a última chamada vence (igual ao registry de widgets e
 * ao ``registerAppRoute``).
 */
export function registerExperienceConfig(
  kind: string,
  def: ExperienceConfigDef,
): void {
  EXPERIENCE_CONFIG_REGISTRY.set(kind, def);
}

/** Definição registrada para o ``kind``, ou ``null`` se nenhuma. */
export function getExperienceConfig(
  kind: string | null | undefined,
): ExperienceConfigDef | null {
  if (!kind) return null;
  return EXPERIENCE_CONFIG_REGISTRY.get(kind) ?? null;
}

/** ``true`` se há configurador registrado para o ``kind``. */
export function hasExperienceConfig(kind: string | null | undefined): boolean {
  if (!kind) return false;
  return EXPERIENCE_CONFIG_REGISTRY.has(kind);
}
