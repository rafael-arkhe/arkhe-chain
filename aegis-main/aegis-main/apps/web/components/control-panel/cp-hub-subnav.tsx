'use client';

/**
 * CpHubSubnav — barra de abas compartilhada dos HUBS do Painel de Controle
 * (Fase 4 da consolidação de IA). Generaliza o padrão provado em
 * `components/ontologia/ontologia-tabs.tsx`: várias rotas-irmãs que servem a uma
 * mesma intenção viram UM item de sidenav + uma barra de abas que ROTEIAM entre
 * elas (Link), preservando rota + perm de cada página.
 *
 * Por que roteia (≠ embed): as páginas-alvo são grandes (CpPageHeader/PageShell,
 * 250–3700L) e desembrulhar pra export nomeado é arriscado sem ganho. As abas
 * navegam; o highlight vem de `usePathname` (match por prefixo).
 *
 * Filtro por permissão: espelha o `canSee` do ControlPanelShell — aba com `perm`
 * só aparece pra quem tem (admin short-circuita); `devOnly` exige dev-mode. Assim
 * um hub de gating heterogêneo (ex.: Sistema) não expõe abas que o operador não
 * pode abrir. A barreira real continua server-side; aqui é higiene de UI.
 *
 * Estética: idêntica ao OntologiaTabs (sharp, sem rounded/emoji), `scrollbar-hide`.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';

export type CpHubTab = {
  /** Texto visível da aba (pt-BR, por intenção — sem jargão técnico). */
  label: string;
  /** Destino do Link (rotas internas do painel; inclua ?cp=1 se for externa). */
  href: string;
  /** Prefixo de pathname que marca a aba como ativa. */
  match: string;
  /** Permissão exigida p/ ver a aba (ausente = sempre visível). */
  perm?: string;
  /** Só com dev-mode (vendor) ativo. */
  devOnly?: boolean;
  /** Marca a aba como modo Avançado (badge "avançado"). */
  adv?: boolean;
};

export function CpHubSubnav({
  group,
  tabs,
}: {
  /** Rótulo curto do hub, exibido à esquerda da barra (ex.: "Identidade"). */
  group: string;
  tabs: CpHubTab[];
}) {
  const path = usePathname() || '';
  const { principal } = useAuth();

  const canSee = (t: CpHubTab) => {
    if (!principal) return false;
    if (t.devOnly && !principal.dev_mode?.enabled) return false;
    if (!t.perm) return true;
    if (principal.roles?.includes('admin')) return true;
    return !!principal.permissions?.includes(t.perm);
  };

  const visible = tabs.filter(canSee);
  // Se só sobra 1 aba (perms filtraram o resto), a barra vira ruído — esconde.
  if (visible.length <= 1) return null;

  return (
    <nav
      className="h-9 px-4 border-b border-border-light flex items-center gap-1 shrink-0 bg-white scrollbar-hide overflow-x-auto"
      data-testid={`cp-hub-subnav-${group.toLowerCase()}`}
      aria-label={group}
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mr-2 shrink-0">
        {group}
      </span>
      {visible.map((t) => {
        // Match exato-ou-mais-profundo: evita que um `match` que é prefixo de
        // outro (ex.: /marcacoes ⊂ /marcacoes-propriedade) acenda as duas abas.
        const active = path === t.match || path.startsWith(t.match + '/');
        return (
          <Link
            key={t.match}
            href={t.href}
            data-testid={`cp-hub-tab-${t.match.split('/').pop()}`}
            aria-current={active ? 'page' : undefined}
            className={
              'h-6 px-2.5 text-[11px] border flex items-center gap-1 shrink-0 ' +
              (active
                ? 'border-primary text-primary bg-primary/5'
                : 'border-border-light text-text-on-light hover:border-primary')
            }
          >
            {t.label}
            {t.adv && <span className="text-[9px] text-muted-on-light">avançado</span>}
          </Link>
        );
      })}
    </nav>
  );
}
