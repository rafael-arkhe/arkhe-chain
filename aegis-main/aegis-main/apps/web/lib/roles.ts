/**
 * Roles em pt-BR — Sprint Foundry-B (2026-05-22).
 *
 * Backend usa strings EN canônicas (owner/editor/reviewer/viewer/discoverer).
 * UI exibe sempre via este mapping em pt-BR. Mantém consistência com a
 * skill `foundry-feature-parity` e o memory rule `feedback_ui_english_only`
 * (toda string visível via mapping/useT()).
 */

export type Role = 'owner' | 'editor' | 'reviewer' | 'viewer' | 'discoverer';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Dono',
  editor: 'Editor',
  reviewer: 'Revisor',
  viewer: 'Leitor',
  discoverer: 'Observador',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Controle total da Operação — pode adicionar/remover membros e mudar permissões.',
  editor: 'Pode criar e modificar recursos da Operação. Não gerencia membros.',
  reviewer: 'Pode revisar e aprovar; modificações limitadas ao escopo de revisão.',
  viewer: 'Apenas leitura. Vê todos os recursos da Operação.',
  discoverer: 'Sabe que a Operação existe (aparece em busca/listagem) mas não vê o conteúdo.',
};

export const ROLE_ORDER: Role[] = ['owner', 'editor', 'reviewer', 'viewer', 'discoverer'];

export function labelOfRole(role: string | undefined | null): string {
  if (!role) return '—';
  if (role in ROLE_LABELS) return ROLE_LABELS[role as Role];
  return role; // unknown role — pass-through (safe default for legacy data)
}
