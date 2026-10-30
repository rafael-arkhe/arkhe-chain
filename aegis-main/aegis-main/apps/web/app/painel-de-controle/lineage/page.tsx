'use client';

/**
 * Lineage (log) — deep-link para a aba "Eventos" do Mapa do Workflow.
 *
 * M5-10 (2026-05-23): as duas entradas confusas (grafo + log) foram
 * UNIFICADAS em `/painel-de-controle/grafo` com abas "Mapa" + "Eventos".
 * Esta rota NÃO some (honra feedback_no_deprecation_of_existing_code):
 * vira um deep-link estável que redireciona para a aba "Eventos" da
 * página unificada. Qualquer bookmark / link antigo continua funcionando.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';

import { RequirePerm } from '@/components/auth/require-perm';
import { useT } from '@/lib/i18n/provider';

const TARGET = '/painel-de-controle/grafo?aba=eventos';

export default function LineagePage() {
  return (
    <RequirePerm perm="data.lineage.read">
      <LineageRedirect />
    </RequirePerm>
  );
}

function LineageRedirect() {
  const t = useT();
  const router = useRouter();

  React.useEffect(() => {
    router.replace(TARGET);
  }, [router]);

  return (
    <div className="p-6" data-testid="lineage-redirect">
      <p className="text-[12px] text-muted-on-light italic">{t('common.loading')}</p>
    </div>
  );
}
