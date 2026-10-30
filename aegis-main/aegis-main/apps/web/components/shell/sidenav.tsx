'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth/useAuth';
import { useSidenav } from '@/lib/store';
import { overrideAlertBadge, useNavTree, type AppNavItem } from '@/lib/use-nav-tree';
import { iconByName } from '@/lib/icon-by-name';
import { useAppShellConfig } from '@/lib/app-shell/preview-provider';
import { useT } from '@/lib/i18n/provider';
import type { NavItem, NavSection } from '@/lib/api/types';

/**
 * Resolve um label de navegação com fallback literal. As seções/itens do
 * tree default (FALLBACK_NAV) têm chaves `nav.section.<id>` / `nav.<id>`
 * no dicionário; sections/itens vindos do config do operador (ids
 * `cfg-*` / `grp-*`) não têm chave e caem no label literal que o operador
 * digitou — `t()` devolve a própria key quando a tradução falta, então o
 * `=== key` detecta a ausência e usa o fallback. Mantém pt-BR idêntico ao
 * histórico (testes verdes) e honra o LocalePicker em en-US.
 */
function translateNav(
  t: (key: string) => string,
  key: string,
  fallback: string,
): string {
  const out = t(key);
  return out === key ? fallback : out;
}

/**
 * `cp_nav_hidden` fala o vocabulário dos ids do nav (`buscar`, `geo`,
 * `app-route-solutions`…). Itens de `sidenav.groups` guardam esse id em
 * `key`; itens de `sidenav.sections` (legado) só têm `href` — derivamos os
 * ids canônicos dele para o filtro valer nas DUAS origens.
 */
function navIdsFromHref(href: string): string[] {
  const path = (href.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  if (path === '/') return ['painel'];
  const pagina = path.match(/^\/paginas\/([^/]+)\/view$/);
  if (pagina) return [pagina[1], `app-route-${pagina[1]}`];
  return [path.replace(/^\//, '')];
}

/**
 * Seções dinâmicas (vindas do useNavTree) que SOBREVIVEM a um
 * ``sidenav.groups`` custom do operador. ``meus-apps`` é carve-out do
 * ``tree.sections``; ``aplicacoes`` é a seção RESIDUAL (always-on) montada aqui
 * para os itens modulares cujo grupo-alvo não existe nos grupos atuais — assim
 * NUNCA somem (bug #2). Ver `distributeAppItems` + `Sidenav`.
 */
const ALWAYS_ON_SECTION_IDS = new Set(['meus-apps', 'aplicacoes']);

/**
 * "Group key" de uma seção: o tree default usa ids crus (``operacao``…); os
 * groups custom do tenant viram ``grp-${key}`` — descasca o prefixo para casar
 * com o ``targetGroup`` dos itens modulares.
 */
function groupKeyOf(s: NavSection): string {
  return s.id.startsWith('grp-') ? s.id.slice(4) : s.id;
}

/** Item modular sem o campo ``targetGroup`` (só auxiliar de distribuição). */
function stripTarget(a: AppNavItem): NavItem {
  return {
    id: a.id,
    label: a.label,
    href: a.href,
    icon: a.icon,
    perm_key: a.perm_key,
    badge: a.badge,
  };
}

/**
 * LOTE2 (#2) — distribui os itens modulares (anotados com ``targetGroup``)
 * DENTRO da seção/grupo cujo group-key casa com o alvo (Operação/Análise/
 * Conteúdo), tanto no tree default quanto em groups custom do tenant. Dedupe por
 * href dentro do grupo. Itens cujo grupo-alvo NÃO existe em nenhuma seção caem
 * numa seção residual "Aplicações" (always-on) p/ nunca sumir.
 */
function distributeAppItems(
  base: NavSection[],
  appItems: AppNavItem[],
): { sections: NavSection[]; residual: NavSection | null } {
  if (!appItems.length) return { sections: base, residual: null };
  const presentKeys = new Set(base.map(groupKeyOf));
  const sections = base.map((s) => {
    const gk = groupKeyOf(s);
    const matching = appItems.filter((a) => a.targetGroup === gk);
    if (!matching.length) return s;
    const seen = new Set(s.items.map((it) => it.href.split('?')[0]));
    const toAdd: NavItem[] = [];
    for (const a of matching) {
      const baseHref = a.href.split('?')[0];
      if (seen.has(baseHref)) continue; // dedupe por href dentro do grupo
      seen.add(baseHref);
      toAdd.push(stripTarget(a));
    }
    return toAdd.length ? { ...s, items: [...s.items, ...toAdd] } : s;
  });
  const residualItems = appItems.filter((a) => !presentKeys.has(a.targetGroup));
  const residual: NavSection | null = residualItems.length
    ? {
        id: 'aplicacoes',
        label: 'Aplicações',
        default_open: true,
        items: residualItems.map(stripTarget),
      }
    : null;
  return { sections, residual };
}

function findActive(pathname: string, sections: NavSection[]):
  | { section: NavSection; item: NavItem }
  | null {
  let best: { section: NavSection; item: NavItem } | null = null;
  let bestLen = 0;
  for (const s of sections) {
    for (const i of s.items) {
      const base = i.href.split('?')[0];
      if (pathname === base) return { section: s, item: i };
      if (pathname.startsWith(base) && base !== '/' && base.length > bestLen) {
        best = { section: s, item: i };
        bestLen = base.length;
      }
    }
  }
  return best;
}

export function Sidenav() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const { principal, logout } = useAuth();
  // Vendor (#1): passa cp_nav_hidden (MESMA fonte do shell) p/ o hook filtrar
  // os itens modulares ocultos. appItems pode vir undefined de mocks legados que
  // só devolvem { tree } → default [].
  const { tree, alertBadge, live, appItems = [] } = useNavTree(
    principal?.tenant?.cp_nav_hidden ?? [],
  );
  // Wave E.1: sections do config são PREPENDED (não replace) — sempre
  // mantem topologia hardcoded como base, operador adiciona sections
  // próprias acima.
  const { config } = useAppShellConfig();
  // Vendor (Onda 0 Safe Tag): `cp_nav_hidden` é o override do vendor e vale
  // para QUALQUER origem — inclusive os grupos que o operador salvou no
  // /painel-de-controle/app-shell. Sem este filtro, um save do editor (que
  // semeava os grupos a partir do nav SEM o filtro) reabilitava os itens
  // escondidos, porque `sidenav.groups` SUBSTITUI a árvore filtrada.
  const navHidden = useMemo(
    () => principal?.tenant?.cp_nav_hidden ?? [],
    [principal],
  );
  const sections = useMemo<NavSection[]>(() => {
    const escondido = (key: string | null | undefined, href: string) =>
      navHidden.includes(key ?? '') ||
      navIdsFromHref(href).some((id) => navHidden.includes(id));
    // Wave E.1 — legacy sections (NavSection compat shape)
    const configSections: NavSection[] = (config.sidenav.sections ?? [])
      .map((s, sIdx) => ({
        id: `cfg-${sIdx}`,
        label: s.title,
        default_open: true,
        items: s.items.map((it, iIdx) => ({
          id: `cfg-${sIdx}-${iIdx}`,
          label: it.label,
          href: it.href,
          icon: it.icon ?? 'circle',
          perm_key: it.perm_key ?? null,
          badge: null,
        })),
      }))
      .map((s) => ({
        ...s,
        items: s.items.filter((it) => !escondido(null, it.href)),
      }))
      .filter((s) => s.items.length > 0);
    // Wave H.4.Y — groups CRUD-driven (preferido)
    const configGroups: NavSection[] = (config.sidenav.groups ?? [])
      .map((g) => ({
        id: `grp-${g.key}`,
        label: g.label,
        default_open: !g.collapsed_by_default,
        items: g.items
          .filter((it) => !escondido(it.key, it.href))
          .map((it) => ({
            id: `grp-${g.key}-${it.key}`,
            label: it.label,
            href: it.href,
            icon: it.icon ?? 'circle',
            perm_key: it.perm_required ?? null,
            badge: it.badge ?? null,
          })),
      }))
      // Grupo que ficou 100% oculto some inteiro (mesma regra do tree).
      .filter((s) => s.items.length > 0);
    // Quando o operador grava groups, eles substituem o tree; mantemos
    // legacy sections como prefix pra backward-compat. Se nem groups nem
    // sections forem populados, cai para o tree default vindo do
    // ontology-module.
    // Seções dinâmicas que SEMPRE sobrevivem — mesmo quando o operador tem
    // groups custom (que substituem o tree). Senão:
    //   - "Meus Apps" (operações materializadas pelo AIP) nunca apareceria;
    //   - "Aplicações" (Páginas modulares app_route: Conversas/Soluções/Agentes,
    //     W8) sumiria após hidratar o config — ERA O BUG #2 (ssp-xx tem 3 groups
    //     salvos sem essas experiências, então o FALLBACK era descartado e só
    //     'meus-apps' sobrevivia). Ambas vêm do useNavTree (tree.sections) e são
    //     carve-out aqui pra entrar nas DUAS ramificações.
    const alwaysOn = tree.sections.filter((s) =>
      ALWAYS_ON_SECTION_IDS.has(s.id),
    );
    // Base por ramo: groups custom SUBSTITUEM o tree (alwaysOn carve-out p/
    // "Meus Apps"); sem groups, cai no tree default.
    const base =
      configGroups.length > 0
        ? [...alwaysOn, ...configSections, ...configGroups]
        : [...configSections, ...tree.sections];
    // LOTE2 (#2): distribui os itens modulares (Conversas/Agentes/Soluções)
    // DENTRO de Operação/Análise/Conteúdo — no tree default E em groups custom
    // (sobrevivem ao bug #2). Grupo-alvo ausente → seção residual "Aplicações"
    // (always-on) no topo, p/ nunca sumir.
    const { sections: distributed, residual } = distributeAppItems(base, appItems);
    const merged = residual ? [residual, ...distributed] : distributed;
    // Badge de alertas é SEMPRE o real (count_pending) — groups/sections
    // persistidos no app-shell config nunca fabricam número (Sprint 6).
    return overrideAlertBadge(merged, alertBadge);
  }, [
    config.sidenav.sections,
    config.sidenav.groups,
    tree.sections,
    appItems,
    alertBadge,
    navHidden,
  ]);
  const active = findActive(pathname, sections);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of sections) {
        if (next[s.id] === undefined) {
          next[s.id] = !!s.default_open;
          changed = true;
        }
      }
      if (active && !next[active.section.id]) {
        next[active.section.id] = true;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [sections, active]);

  const toggle = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }));

  const collapsed = useSidenav((s) => s.collapsed);
  const toggleCollapsed = useSidenav((s) => s.toggle);

  // Wave H.4.Y — operator-configured width/density.
  const widthPx = Math.max(
    200,
    Math.min(320, Math.floor(config.sidenav.width_px ?? 220)),
  );
  const dense = !!config.sidenav.dense;
  const footerLink = config.sidenav.footer_link ?? null;

  const canSee = (perm: string | null) => {
    if (!perm) return true;
    if (!principal) return false;
    if (principal.roles.includes('admin')) return true;
    return principal.permissions.includes(perm);
  };

  return (
    <nav
      data-testid="sidenav"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-dense={dense ? 'true' : 'false'}
      className={cn(
        'bg-panel-dark border-r border-border-dark flex flex-col shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out',
        collapsed && 'w-[44px]',
      )}
      // Onda brand2 (2026-07-09) — cor de região do tenant. `--sidenav-bg` é
      // injetado por RegionColorsMount quando o operador personaliza; o
      // fallback é o token DS panel-dark (#14181E), então o default é idêntico
      // a antes. Mesmo padrão nos textos/ativo abaixo.
      style={{
        backgroundColor: 'var(--sidenav-bg, #14181E)',
        ...(collapsed ? {} : { width: `${widthPx}px` }),
      }}
      aria-label={translateNav(t, 'nav.aria', 'Navegação principal')}
    >
      <ul className="flex-1 overflow-y-auto py-2">
        {sections.map((s) => (
          <li key={s.id} className={cn(collapsed ? 'mb-0.5' : 'mb-2')}>
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggle(s.id)}
                data-testid={`section-${s.id}`}
                className="w-full flex items-center gap-1.5 px-3 h-7 text-[10px] uppercase tracking-[0.22em] text-muted-on-dark hover:text-text-on-dark transition-colors"
                style={{ color: 'var(--sidenav-text, #8A93A0)' }}
              >
                {open[s.id] ? (
                  <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                ) : (
                  <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                )}
                <span className="flex-1 text-left font-semibold">
                  {translateNav(t, `nav.section.${s.id}`, s.label)}
                </span>
              </button>
            )}
            {(collapsed || open[s.id]) && (
              <ul>
                {s.items.map((item) => {
                  const allowed = canSee(item.perm_key);
                  const Icon = iconByName(item.icon);
                  const isActive = active?.item.id === item.id;
                  const itemLabel = translateNav(t, `nav.${item.id}`, item.label);
                  return (
                    <li key={item.id}>
                      <Link
                        href={allowed ? item.href : '#'}
                        data-testid={`nav-${item.id}`}
                        title={collapsed ? itemLabel : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        aria-disabled={!allowed}
                        onClick={(e) => {
                          if (!allowed) e.preventDefault();
                        }}
                        className={cn(
                          'flex items-center text-[12px] transition-colors relative',
                          dense ? 'h-6' : 'h-8',
                          collapsed ? 'justify-center' : 'gap-2.5 pl-7 pr-3',
                          !allowed && 'opacity-40 cursor-not-allowed',
                          allowed && isActive &&
                            'text-text-on-dark bg-raised-dark before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-white',
                          allowed && !isActive &&
                            'text-muted-on-dark hover:text-text-on-dark hover:bg-raised-dark/60',
                        )}
                        // Onda brand2 — cores de região do tenant. Fallbacks =
                        // tokens DS (text-on-dark/muted-on-dark/raised-dark), então
                        // o default é idêntico; item ativo também recebe --sidenav-active.
                        style={
                          allowed && isActive
                            ? {
                                color: 'var(--sidenav-text, #E6E9EE)',
                                backgroundColor: 'var(--sidenav-active, #1A1F2A)',
                              }
                            : { color: 'var(--sidenav-text, #8A93A0)' }
                        }
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                        {!collapsed && <span className="truncate">{itemLabel}</span>}
                        {!collapsed && item.badge && (
                          <span className="ml-auto px-1.5 h-4 flex items-center justify-center bg-danger text-white text-[10px] font-mono font-semibold">
                            {item.badge}
                          </span>
                        )}
                        {collapsed && item.badge && (
                          <span
                            className="absolute top-1 right-1.5 w-1.5 h-1.5 bg-danger"
                            aria-label={`${item.badge}`}
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {!collapsed && footerLink && (
        <div
          data-testid="sidenav-footer-link"
          className="border-t border-border-dark px-3 py-2 text-[10px] font-mono text-muted-on-dark hover:text-text-on-dark"
        >
          <Link href={footerLink}>{footerLink}</Link>
        </div>
      )}
      {principal && (
        <div
          className={cn(
            'border-t border-border-dark',
            collapsed
              ? 'p-1.5 flex items-center justify-center'
              : 'p-3 space-y-2',
          )}
        >
          {!collapsed && (
            <div className="text-[10px] font-mono">
              <p className="text-text-on-dark truncate">
                {principal.display_name || principal.username}
              </p>
              <p className="text-muted-on-dark truncate">
                {principal.username} ·{' '}
                {principal.roles[0] ?? translateNav(t, 'nav.noRole', 'sem papel')}
              </p>
            </div>
          )}
          <button
            type="button"
            data-testid="logout"
            title={collapsed ? translateNav(t, 'nav.logout', 'Sair') : undefined}
            onClick={() => {
              void logout();
            }}
            className={cn(
              'border border-border-dark hover:border-primary flex items-center justify-center text-muted-on-dark hover:text-text-on-dark transition-colors',
              collapsed
                ? 'w-7 h-7'
                : 'w-full h-7 px-2 text-[11px] gap-2',
            )}
          >
            <LogOut className="w-3 h-3" strokeWidth={1.5} />
            {!collapsed && translateNav(t, 'nav.logout', 'Sair')}
          </button>
        </div>
      )}

      <div
        className={cn(
          'border-t border-border-dark flex items-center',
          collapsed
            ? 'justify-center py-1.5'
            : 'justify-between px-3 py-1.5 gap-1.5',
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                'w-1.5 h-1.5 shrink-0',
                live ? 'bg-success' : 'bg-warning',
              )}
            />
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-on-dark truncate">
              {live
                ? translateNav(t, 'nav.statusLive', 'nav · ontology-module')
                : translateNav(t, 'nav.statusDemo', 'nav · modo demo')}
            </span>
          </div>
        )}
        <button
          type="button"
          data-testid="sidenav-toggle"
          onClick={toggleCollapsed}
          aria-label={
            collapsed
              ? translateNav(t, 'nav.expand', 'Expandir menu')
              : translateNav(t, 'nav.collapse', 'Esconder menu')
          }
          aria-expanded={!collapsed}
          title={
            collapsed
              ? translateNav(t, 'nav.expand', 'Expandir menu')
              : translateNav(t, 'nav.collapse', 'Esconder menu')
          }
          className="w-6 h-6 flex items-center justify-center text-muted-on-dark hover:text-text-on-dark transition-colors"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <PanelLeftClose className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </nav>
  );
}
