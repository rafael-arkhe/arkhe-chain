'use client';

/**
 * /painel-de-controle/alertas — Rotas de notificação (config de alertas).
 *
 * Workspace em components/control-panel/alert-routes-workspace. Perms:
 * alerts.routes.view (página) · alerts.routes.manage (gestos — gate no
 * próprio workspace). Item da sidenav: cluster Operacional do CP.
 */
import { RequirePerm } from '@/components/auth/require-perm';
import { AlertRoutesWorkspace } from '@/components/control-panel/alert-routes-workspace';

export default function AlertasConfigPage() {
  return (
    <RequirePerm perm="alerts.routes.view">
      <AlertRoutesWorkspace />
    </RequirePerm>
  );
}
