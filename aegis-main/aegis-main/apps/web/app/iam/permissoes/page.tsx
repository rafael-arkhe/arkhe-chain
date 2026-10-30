'use client';

import { RequirePerm } from '@/components/auth/require-perm';
import { PermissionsPanel } from '@/components/iam/PermissionsPanel';

export default function IamPermissionsPage() {
  return (
    <RequirePerm perm="iam.permissions.read">
      <div className="flex-1 overflow-y-auto bg-canvas-light p-6 space-y-4">
        <div>
          <h1 className="text-text-on-light text-sm font-mono uppercase tracking-[0.2em]">
            Permissões
          </h1>
          <p className="text-[11px] text-muted-on-light mt-1 max-w-2xl">
            Catálogo bruto de permissões do sistema (chaves como
            <code className="font-mono text-primary mx-1">iam.users.write</code>,
            <code className="font-mono text-primary mx-1">workshop.apps.read</code>).
            Use a aba Papéis pra agrupar e atribuir permissões.
          </p>
        </div>
        <PermissionsPanel />
      </div>
    </RequirePerm>
  );
}
