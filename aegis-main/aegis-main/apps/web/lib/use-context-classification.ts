'use client';

import { useAppShellConfig } from '@/lib/app-shell/preview-provider';
import { useMeContext } from '@/lib/data/me-context-store';
import { CLASSIFICATION_LABEL, type ClassificationLevel } from '@/lib/classification';

/**
 * Classificação do banner vinda de DADO, nunca hardcode por página:
 *  - nível = `banner.classification_default` da config do app-shell do
 *    tenant (mesma fonte do header); fallback honesto 'restrito';
 *  - rótulo = Operação ativa (project_name do /me/context; fallback
 *    organization_name; vazio se sem contexto).
 * Compartilhado por /geo, /cameras e qualquer página operacional.
 */
export function useContextClassification(): {
  level: ClassificationLevel;
  label: string;
} {
  const { config } = useAppShellConfig();
  // Contexto do operador via store COMPARTILHADO (#12) — mesma fonte do banner,
  // dedupada com os providers de i18n/assistente/AIP/layout (1 GET /me/context).
  const { data: ctx } = useMeContext();
  const label = ctx
    ? (ctx.project_name ?? ctx.organization_name ?? '').toUpperCase()
    : '';

  // Defensivo: configs parciais (preview/teste) podem não ter banner.
  const raw = config?.banner?.classification_default;
  const level: ClassificationLevel =
    raw && raw in CLASSIFICATION_LABEL ? (raw as ClassificationLevel) : 'restrito';
  return { level, label };
}
