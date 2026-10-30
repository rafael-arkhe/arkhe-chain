'use client';

import { useEffect, useState } from 'react';
import { Bell, Search } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Alerts } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { useCommandPalette, useSidenav } from '@/lib/store';
import { BrandLink } from './brand-link';
import { ClassificationBanner } from './classification-banner';
import { HeaderSalasMenu } from './header-salas-menu';
import { UserMenu } from './user-menu';
import { useAppShellConfig } from '@/lib/app-shell/preview-provider';
import { iconByName } from '@/lib/icon-by-name';

/**
 * Onda M1.b (2026-05-23, Feedback #4) — barra de busca personalizável.
 *
 * O shape de `config.navbar.search` é semeado pelo agente da config (M1.a)
 * em `defaults.ts` + tipos em `lib/api`. Aqui (renderer) consumimos de forma
 * DEFENSIVA: se o campo ainda não existir em runtime (config antiga ou agente
 * de config em paralelo), caímos no default abaixo — o header preserva o
 * placeholder histórico e o layout largo, sem quebrar.
 */
const DEFAULT_SEARCH_PLACEHOLDER =
  'Buscar pessoa, veículo, BO, mandado, endereço…';

interface NavbarSearchConfig {
  placeholder: string;
  compact: boolean;
}

function resolveSearch(navbar: unknown): NavbarSearchConfig {
  const raw = (navbar as { search?: Partial<NavbarSearchConfig> } | null)
    ?.search;
  const placeholder =
    typeof raw?.placeholder === 'string' && raw.placeholder.trim().length > 0
      ? raw.placeholder
      : DEFAULT_SEARCH_PLACEHOLDER;
  return { placeholder, compact: raw?.compact ?? false };
}

export function Header() {
  const t = useT();
  const setOpen = useCommandPalette((s) => s.setOpen);
  const navCollapsed = useSidenav((s) => s.collapsed);
  // #11 — badge REAL de alertas pendentes (count_pending da inbox). Some em 0
  // (não é mais ponto estático). Mesma fonte do sidenav; falha → sem badge.
  const [alertBadge, setAlertBadge] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Alerts.inbox
        .countPending()
        .then(({ count }) => {
          if (!cancelled) setAlertBadge(count > 0 ? (count > 99 ? '99+' : String(count)) : null);
        })
        .catch(() => {
          if (!cancelled) setAlertBadge(null);
        });
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  // Wave E.1: itens extras configurados pelo operador via "Layout do
  // App". Items declarados com position="left" entram à esquerda da
  // search, position="right" entram à direita.
  const { config } = useAppShellConfig();
  const navbarItems = config.navbar.items ?? [];
  const leftExtras = navbarItems.filter((i) => (i.position ?? 'right') === 'left');
  const rightExtras = navbarItems.filter((i) => (i.position ?? 'right') === 'right');
  // Onda M1.b (#4) — placeholder + modo compacto da busca (defensivo).
  const search = resolveSearch(config.navbar);

  return (
    <header
      data-testid="header"
      className="h-10 bg-panel-dark flex items-stretch shrink-0 select-none"
    >
      <BrandLink collapsed={navCollapsed} />

      <div
        className="flex-1 flex items-center px-3 bg-canvas-light text-text-on-light border-b border-border-light gap-2"
        // Onda brand2 (2026-07-09) — cor de região "navbar" do tenant
        // (fallbacks = tokens DS canvas-light/text-on-light → default idêntico).
        style={{
          backgroundColor: 'var(--navbar-bg, #FFFFFF)',
          color: 'var(--navbar-text, #14181E)',
        }}
      >
        {leftExtras.map((item, idx) => {
          const Icon = item.icon ? iconByName(item.icon) : null;
          return (
            <Link
              key={`nav-left-${idx}`}
              href={item.href}
              data-testid={`header-extra-left-${idx}`}
              className="h-7 px-2.5 flex items-center gap-1.5 text-[11.5px] bg-canvas-light border border-border-light hover:border-primary text-text-on-light"
            >
              {Icon && <Icon className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />}
              {item.label}
            </Link>
          );
        })}
        {/* Onda M1.b (#4) — busca personalizável: placeholder vem do config;
            modo compacto renderiza só o ícone numa largura fixa (sem o texto
            longo nem o atalho), preservando a abertura do CommandPalette. */}
        <button
          type="button"
          data-testid="header-search"
          data-compact={search.compact ? 'true' : 'false'}
          onClick={() => setOpen(true)}
          aria-label={search.placeholder}
          title={search.compact ? search.placeholder : undefined}
          className={cn(
            'h-7 flex items-center px-3 bg-canvas-light border border-border-light text-left text-muted-on-light hover:border-primary transition-colors',
            search.compact ? 'w-9 justify-center gap-0' : 'flex-1 max-w-xl gap-2',
          )}
        >
          <Search className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
          {!search.compact && (
            <>
              <span className="text-[12px] text-muted-on-light truncate">
                {search.placeholder}
              </span>
              <span className="ml-auto font-mono text-[10px] text-muted-on-light opacity-70 shrink-0">
                ⌘K
              </span>
            </>
          )}
        </button>
      </div>

      <div
        className="flex items-center px-3 border-l border-b border-border-light shrink-0 bg-canvas-light text-text-on-light gap-2"
        style={{
          backgroundColor: 'var(--navbar-bg, #FFFFFF)',
          color: 'var(--navbar-text, #14181E)',
        }}
      >
        {rightExtras.map((item, idx) => {
          const Icon = item.icon ? iconByName(item.icon) : null;
          return (
            <Link
              key={`nav-right-${idx}`}
              href={item.href}
              data-testid={`header-extra-right-${idx}`}
              className="h-7 px-2.5 flex items-center gap-1.5 text-[11.5px] bg-canvas-light border border-border-light hover:border-primary text-text-on-light"
            >
              {Icon && <Icon className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />}
              {item.label}
            </Link>
          );
        })}
        <HeaderSalasMenu />
        <ClassificationBanner />
      </div>

      <div className="flex items-center border-l border-b border-border-light bg-canvas-light text-text-on-light">
        {/* #2 (2026-05-24) — sino numa célula quadrada simétrica: SEM o `px-3`
            à esquerda (que o empurrava ~12px à direita), ícone dead-center
            entre o `border-l` do container e o `border-r` divisor. O UserMenu
            recebe seu próprio padding depois do divisor. */}
        <Link
          href="/alertas"
          aria-label={t('nav.notificacoes')}
          title={t('nav.notificacoes')}
          data-testid="header-alertas"
          className="relative w-9 h-8 flex items-center justify-center border-r border-border-light hover:bg-raised-light transition-colors"
        >
          <Bell className="w-4 h-4" strokeWidth={1.5} />
          {alertBadge && (
            <span
              data-testid="header-alertas-badge"
              className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 bg-danger text-white text-[9px] font-mono leading-[14px] text-center"
            >
              {alertBadge}
            </span>
          )}
        </Link>
        <div className="flex items-center px-3">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
