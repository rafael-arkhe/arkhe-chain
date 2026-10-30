/**
 * /painel-de-controle/solutions — casca de REDIRECT (W8 · 2026-06-28).
 *
 * O Desenho da Operação (AIP Arquiteto) deixou de ser uma rota do shell do
 * Painel de Controle. O render canônico agora é ``/paginas/solutions/view``,
 * que resolve a Page ``solutions`` (app_route) e renderiza o componente
 * registrado (``SolutionsApp``) DENTRO do shell do OPERADOR (AuthShell →
 * Sidenav). Esta rota antiga vira apenas um redirect — sem deprecação: o
 * componente foi extraído para ``components/solution-designer/SolutionsApp.tsx``
 * e é importado/registrado pela view canônica.
 *
 * A query é PRESERVADA: o fluxo "Editar no AIP" navega com
 * ``?diagram=<id>&app=<id>`` e o SolutionsApp lê esses params via
 * ``useSearchParams`` para carregar o diagrama em modo-edição.
 */
import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

function toQuery(sp: SearchParams): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
  }
  const q = qs.toString();
  return q ? `?${q}` : '';
}

export default async function SolutionsLegacyRedirect({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  redirect(`/paginas/solutions/view${toQuery(sp)}`);
}
