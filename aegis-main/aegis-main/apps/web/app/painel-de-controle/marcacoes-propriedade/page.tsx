'use client';

/**
 * Marcações por Propriedade — deep-link para a sub-aba "Por propriedade" da aba
 * "Marcações" do hub Dados.
 *
 * LOTE1 ELO PAGES (#7 · 2026-06-28): a seção de sidenav "Marcações" foi
 * dissolvida; "Por propriedade" virou sub-aba da aba "Marcações" em
 * `/painel-de-controle/dados`. Esta rota NÃO some (honra
 * feedback_no_deprecation_of_existing_code): vira um deep-link estável que
 * redireciona, preservando a sub-view via `?sub=propriedade`. O conteúdo vive em
 * `components/markings/marcacoes-propriedade-workspace.tsx`, reusado pelo hub.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';

import { RequirePerm } from '@/components/auth/require-perm';
import { useT } from '@/lib/i18n/provider';

const TARGET = '/painel-de-controle/dados?aba=marcacoes&sub=propriedade';

export default function MarcacoesPropriedadePage() {
  return (
    <RequirePerm perm="markings.read">
      <MarcacoesPropriedadeRedirect />
    </RequirePerm>
  );
}

function MarcacoesPropriedadeRedirect() {
  const t = useT();
  const router = useRouter();

  React.useEffect(() => {
    router.replace(TARGET);
  }, [router]);

  return (
    <div className="p-6" data-testid="marcacoes-propriedade-redirect">
      <p className="text-[12px] text-muted-on-light italic">{t('common.loading')}</p>
    </div>
  );
}
