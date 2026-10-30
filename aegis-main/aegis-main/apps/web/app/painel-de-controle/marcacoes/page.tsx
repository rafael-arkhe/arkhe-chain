'use client';

/**
 * Marcações (Vocabulário) — deep-link para a aba "Marcações" do hub Dados.
 *
 * LOTE1 ELO PAGES (#7 · 2026-06-28): a seção de sidenav "Marcações" foi
 * dissolvida e Vocabulário virou a sub-aba default da aba "Marcações" em
 * `/painel-de-controle/dados`. Esta rota NÃO some (honra
 * feedback_no_deprecation_of_existing_code): vira um deep-link estável que
 * redireciona para lá. O conteúdo vive em
 * `components/markings/marcacoes-vocab-workspace.tsx`, reusado pelo hub.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';

import { RequirePerm } from '@/components/auth/require-perm';
import { useT } from '@/lib/i18n/provider';

const TARGET = '/painel-de-controle/dados?aba=marcacoes';

export default function MarcacoesPage() {
  return (
    <RequirePerm perm="markings.read">
      <MarcacoesRedirect />
    </RequirePerm>
  );
}

function MarcacoesRedirect() {
  const t = useT();
  const router = useRouter();

  React.useEffect(() => {
    router.replace(TARGET);
  }, [router]);

  return (
    <div className="p-6" data-testid="marcacoes-redirect">
      <p className="text-[12px] text-muted-on-light italic">{t('common.loading')}</p>
    </div>
  );
}
