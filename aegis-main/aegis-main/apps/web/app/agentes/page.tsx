/**
 * /agentes — casca de REDIRECT (W8 · 2026-06-28).
 *
 * A frota de agentes 24/7 (kanban + execução) deixou de ter rota própria. O
 * render canônico agora é ``/paginas/agentes/view``, que resolve a Page
 * ``agentes`` (app_route) e renderiza o componente registrado (``AgentesApp``)
 * DENTRO do shell do OPERADOR (AuthShell → Sidenav). Esta rota antiga vira
 * apenas um redirect — sem deprecação: o componente foi extraído para
 * ``components/agentes/AgentesApp.tsx`` e é importado/registrado pela view
 * canônica. (O catálogo ``/agentes/catalog`` permanece intacto.) A query é
 * preservada por robustez (deep-links).
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

export default async function AgentesLegacyRedirect({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  redirect(`/paginas/agentes/view${toQuery(sp)}`);
}
