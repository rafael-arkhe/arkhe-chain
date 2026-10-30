import { redirect } from 'next/navigation';

/**
 * /iam é redirect — sub-rotas dedicadas:
 *   /iam/equipe       UsersPanel
 *   /iam/papeis       RolesPanel
 *   /iam/permissoes   PermissionsPanel
 *   /iam/auditoria    AuditPanel
 */
export default function IamRedirectPage() {
  redirect('/iam/equipe');
}
