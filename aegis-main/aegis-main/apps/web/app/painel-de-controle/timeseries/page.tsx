'use client';

/**
 * /timeseries — rota viva (deep-link) do workspace de séries temporais. A UI de
 * navegação aponta para o hub "Análise" (/painel-de-controle/analise), que embute
 * este workspace na aba Séries. O componente vive em
 * components/analise/time-series-workspace (page.tsx não pode ter export nomeado).
 */
import { RequirePerm } from '@/components/auth/require-perm';
import { TimeSeriesWorkspace } from '@/components/analise/time-series-workspace';

export default function TimeSeriesPage() {
  return (
    <RequirePerm perm="ontology.objects.read">
      <TimeSeriesWorkspace />
    </RequirePerm>
  );
}
