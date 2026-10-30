'use client';

/**
 * /media — deep-link para a seção "Arquivos" da Tela de Dados (Onda 2 · I1b).
 *
 * A Tela de Dados unificou a camada num só 3-pane (/painel-de-controle/dados): o
 * Acervo (esquerda) embute este workspace na seção Arquivos. Esta rota NÃO some
 * (feedback_no_deprecation_of_existing_code): vira deep-link estável que
 * redireciona. Conteúdo em components/dados/media-workspace.tsx.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';

import { RequirePerm } from '@/components/auth/require-perm';
import { useT } from '@/lib/i18n/provider';

const TARGET = '/painel-de-controle/dados?aba=arquivos';

export default function MediaPage() {
  return (
    <RequirePerm perm="data.media.read">
      <MediaRedirect />
    </RequirePerm>
  );
}

function MediaRedirect() {
  const t = useT();
  const router = useRouter();

  React.useEffect(() => {
    router.replace(TARGET);
  }, [router]);

  return (
    <div className="p-6" data-testid="media-redirect">
      <p className="text-[12px] text-muted-on-light italic">{t('common.loading')}</p>
    </div>
  );
}
