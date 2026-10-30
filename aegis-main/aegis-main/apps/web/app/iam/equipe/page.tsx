'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { RequirePerm } from '@/components/auth/require-perm';
import { useAuth } from '@/lib/auth/useAuth';
import { UsersPanel } from '@/components/iam/UsersPanel';
import { TotpDialog } from '@/components/iam/TotpDialog';

export default function IamUsersPage() {
  const { principal } = useAuth();
  const [totpOpen, setTotpOpen] = React.useState(false);

  return (
    <RequirePerm perm="iam.users.read">
      <div className="flex-1 overflow-y-auto bg-canvas-light p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-text-on-light text-sm font-mono uppercase tracking-[0.2em]">
              Equipe
            </h1>
            <p className="text-[11px] text-muted-on-light mt-1 max-w-2xl">
              Quem pode entrar no painel. Ativar/desativar, redefinir
              senha ou alterar papéis — mudanças entram em vigor
              imediatamente; sessões ativas são revogadas.
            </p>
          </div>
          <Button
            size="sm"
            variant={principal?.totp_enabled ? 'default' : 'outline'}
            onClick={() => setTotpOpen(true)}
            className="font-mono text-[10px] uppercase tracking-wider"
            data-testid="totp-button"
          >
            2FA: {principal?.totp_enabled ? 'ativado' : 'desativado'}
          </Button>
        </div>
        <UsersPanel />
        <TotpDialog open={totpOpen} onOpenChange={setTotpOpen} />
      </div>
    </RequirePerm>
  );
}
