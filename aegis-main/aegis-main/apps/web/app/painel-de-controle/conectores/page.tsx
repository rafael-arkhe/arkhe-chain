'use client';

/**
 * /conectores — deep-link para a seção "Fontes" (Conexões) da Tela de Dados
 * (Onda 2 · I1b). A Tela de Dados unificou a camada num só 3-pane
 * (/painel-de-controle/dados): o Acervo (esquerda) embute este workspace na seção
 * Fontes. Esta rota NÃO some (feedback_no_deprecation_of_existing_code): vira um
 * deep-link estável que redireciona. Conteúdo em
 * components/dados/conectores-workspace.tsx.
 *
 * NB: o `/conectores` da RAIZ (app/conectores) é OUTRA tela — o dashboard de
 * saúde das fontes — e segue independente.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';

import { RequirePerm } from '@/components/auth/require-perm';
import { useT } from '@/lib/i18n/provider';

const TARGET = '/painel-de-controle/dados?aba=conexoes';

export default function ConectoresPage() {
  return (
    <RequirePerm perm="connectors.manage">
      <ConectoresRedirect />
    </RequirePerm>
  );
}

function ConectoresRedirect() {
  const t = useT();
  const router = useRouter();

  React.useEffect(() => {
    router.replace(TARGET);
  }, [router]);

  return (
    <div className="p-6" data-testid="conectores-redirect">
      <p className="text-[12px] text-muted-on-light italic">{t('common.loading')}</p>
    </div>
  );
}
