'use client';

import { RequirePerm } from '@/components/auth/require-perm';
import { AuditPanel } from '@/components/iam/AuditPanel';

export default function IamAuditPage() {
  return (
    <RequirePerm perm="iam.audit.read">
      <div className="flex-1 overflow-y-auto bg-canvas-light p-6 space-y-4">
        <div>
          <h1 className="text-text-on-light text-sm font-mono uppercase tracking-[0.2em]">
            Auditoria
          </h1>
          <p className="text-[11px] text-muted-on-light mt-1 max-w-2xl">
            Log imutável de eventos IAM (logins, alterações de papel,
            criação/desativação de usuário). Append-only — registros são
            assinados criptograficamente pelo backend.
          </p>
        </div>
        <AuditPanel />
      </div>
    </RequirePerm>
  );
}
