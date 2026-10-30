'use client';

/**
 * OntologiaTabs — barra de abas compartilhada do explorador de Ontologia
 * (Fase 3 da consolidação de IA). Une as 5 telas que antes eram itens irmãos
 * soltos no "Catálogo" numa única superfície coesa: Tipos · Instâncias · Grafo ·
 * Vizinhança (explorar) + Editar (Ontology Manager = modo Avançado).
 *
 * As páginas vivem em /ontologia/* (PageShell, 700+L) + /painel-de-controle/
 * tipos-editor; embuti-las exigiria desembrulhar o PageShell (arriscado), então
 * as abas ROTEIAM entre elas (mantêm o ?cp=1 p/ a chrome do Painel) — um único
 * item de sidenav "Ontologia", várias abas. Highlight via usePathname.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { label: string; href: string; match: string; adv?: boolean }[] = [
  { label: 'Tipos', href: '/ontologia/tipos?cp=1', match: '/ontologia/tipos' },
  { label: 'Instâncias', href: '/ontologia/instancias?cp=1', match: '/ontologia/instancias' },
  { label: 'Grafo', href: '/ontologia/grafo?cp=1', match: '/ontologia/grafo' },
  { label: 'Vizinhança', href: '/ontologia/vizinhanca?cp=1', match: '/ontologia/vizinhanca' },
  { label: 'Editar', href: '/painel-de-controle/tipos-editor', match: '/painel-de-controle/tipos-editor', adv: true },
];

export function OntologiaTabs() {
  const path = usePathname() || '';
  return (
    <nav className="h-9 px-4 border-b border-border-light flex items-center gap-1 shrink-0 bg-white scrollbar-hide overflow-x-auto" data-testid="ontologia-tabs" aria-label="Ontologia">
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mr-2 shrink-0">Ontologia</span>
      {TABS.map((t) => {
        const active = path.startsWith(t.match);
        return (
          <Link key={t.match} href={t.href} data-testid={`ont-tab-${t.match.split('/').pop()}`}
            aria-current={active ? 'page' : undefined}
            className={'h-6 px-2.5 text-[11px] border flex items-center gap-1 shrink-0 ' + (active ? 'border-primary text-primary bg-primary/5' : 'border-border-light text-text-on-light hover:border-primary')}>
            {t.label}{t.adv && <span className="text-[9px] text-muted-on-light">avançado</span>}
          </Link>
        );
      })}
    </nav>
  );
}
