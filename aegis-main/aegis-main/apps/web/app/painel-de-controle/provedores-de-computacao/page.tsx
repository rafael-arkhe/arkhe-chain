'use client';

/**
 * /provedores-de-computacao — rota viva (deep-link). O nav aponta para o hub
 * "Dados", que embute este workspace na aba Provedores. Componente em
 * components/dados/provedores-workspace (V1 visão→georref→mapa, spec §5).
 */
import { RequirePerm } from '@/components/auth/require-perm';
import { ProvedoresWorkspace } from '@/components/dados/provedores-workspace';

export default function ProvedoresPage() {
  return (
    <RequirePerm perm="compute.providers.read">
      <ProvedoresWorkspace />
    </RequirePerm>
  );
}
