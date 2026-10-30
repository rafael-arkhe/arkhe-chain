'use client';

import { RequirePerm } from '@/components/auth/require-perm';
import { RolesPanel } from '@/components/iam/RolesPanel';

export default function IamRolesPage() {
  return (
    <RequirePerm perm="iam.roles.read">
      <div className="flex-1 overflow-y-auto bg-canvas-light p-6 space-y-4">
        <div>
          <h1 className="text-text-on-light text-sm font-mono uppercase tracking-[0.2em]">
            Papéis
          </h1>
          <p className="text-[11px] text-muted-on-light mt-1 max-w-2xl">
            Catálogo de papéis (roles) com as permissões agregadas. Atribua
            permissões individuais a cada papel; quem detém o papel herda
            todas elas.
          </p>
        </div>
        <RolesPanel />
      </div>
    </RequirePerm>
  );
}
