'use client';

/**
 * /quiver — rota viva (deep-link) do workspace de análise interativa. A UI de
 * navegação aponta para o hub "Análise" (/painel-de-controle/analise), que
 * embute este mesmo workspace na aba Distribuições. O componente vive em
 * components/analise/quiver-workspace (page.tsx não pode ter export nomeado).
 */
import { RequirePerm } from '@/components/auth/require-perm';
import { QuiverWorkspace } from '@/components/analise/quiver-workspace';

export default function QuiverPage() {
  return (
    <RequirePerm perm="ontology.objects.read">
      <QuiverWorkspace />
    </RequirePerm>
  );
}
