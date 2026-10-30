'use client';

/**
 * Registry de componentes de "rota de aplicação" (#7 · 2026-05-24).
 *
 * Algumas Páginas registradas no registry de Páginas
 * (``Tenant.metadata_["registered_pages"]``) têm ``config.mode ===
 * 'app_route'``: rotas servidas por código de aplicação, NÃO montáveis
 * pela paleta genérica de widgets (ex.: ``/docs``, ``/workshop``,
 * ``/sala/[slug]`` e — desde #7 — ``aip-threads`` / Conversas).
 *
 * Para essas Páginas o conteúdo interno é fixo (código), mas elas
 * continuam sendo Páginas de primeira classe: salvas no banco, listadas
 * e com status/perm/bindings/marcações editáveis em
 * ``/painel-de-controle/paginas``.
 *
 * Este módulo mapeia ``slug → Componente`` para que:
 *   - a rota real (ex.: ``/painel-de-controle/aip-threads``) resolva
 *     ATRAVÉS do registry (lê a Page salva, aplica a perm dela, e
 *     renderiza o componente registrado);
 *   - o "Visualizar" de Páginas (``/paginas/[slug]/view``) renderize o
 *     componente real em vez do placeholder genérico de rota de
 *     aplicação.
 *
 * Não é um sistema paralelo de Páginas — é só o adaptador que conecta um
 * ``app_route`` Page ao código que o serve. Sem localStorage, sem estado
 * próprio: a fonte de verdade da Page continua sendo o registry no
 * backend.
 */
import type * as React from 'react';

/** Componente que renderiza o corpo interno de uma rota de aplicação. */
export type AppRouteComponent = React.ComponentType;

const APP_ROUTE_REGISTRY = new Map<string, AppRouteComponent>();

/**
 * Registra o componente que serve o slug de uma Page ``app_route``.
 * Idempotente — a última chamada vence (igual ao registry de widgets).
 */
export function registerAppRoute(slug: string, Component: AppRouteComponent): void {
  APP_ROUTE_REGISTRY.set(slug, Component);
}

/** Componente registrado para o slug, ou ``null`` se nenhum. */
export function getAppRouteComponent(slug: string): AppRouteComponent | null {
  return APP_ROUTE_REGISTRY.get(slug) ?? null;
}

/** ``true`` se há componente de aplicação registrado para o slug. */
export function hasAppRoute(slug: string): boolean {
  return APP_ROUTE_REGISTRY.has(slug);
}
