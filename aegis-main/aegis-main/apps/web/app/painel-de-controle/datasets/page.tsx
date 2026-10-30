'use client';

/**
 * /datasets — deep-link para a seção "Datasets" da Tela de Dados (Onda 2 · I1b).
 *
 * A Tela de Dados unificou a camada num só 3-pane (/painel-de-controle/dados): o
 * Acervo (esquerda) embute este workspace na seção Datasets. Esta rota NÃO some
 * (honra feedback_no_deprecation_of_existing_code): vira um deep-link estável que
 * redireciona. O conteúdo vive em components/dados/datasets-workspace.tsx.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';

import { RequirePerm } from '@/components/auth/require-perm';
import { useT } from '@/lib/i18n/provider';

const TARGET = '/painel-de-controle/dados?aba=datasets';

export default function DatasetsPage() {
  return (
    <RequirePerm perm="data.datasets.read">
      <DatasetsRedirect />
    </RequirePerm>
  );
}

function DatasetsRedirect() {
  const t = useT();
  const router = useRouter();

  React.useEffect(() => {
    router.replace(TARGET);
  }, [router]);

  return (
    <div className="p-6" data-testid="datasets-redirect">
      <p className="text-[12px] text-muted-on-light italic">{t('common.loading')}</p>
    </div>
  );
}
