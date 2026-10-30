'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { WorkshopEditor } from '@/components/workshop/workshop-editor';

export default function WorkshopEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [appId, setAppId] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => setAppId(id));
  }, [params]);

  return (
    <RequirePerm perm="security.painel.view">
      <PageShell
        title={`Workshop · editor`}
        subtitle={appId ? `${appId} · edições salvas neste navegador` : 'Carregando…'}
        theme="light"
      >
        <div className="h-full">
          {appId && <WorkshopEditor appId={appId} />}
        </div>
      </PageShell>
    </RequirePerm>
  );
}
