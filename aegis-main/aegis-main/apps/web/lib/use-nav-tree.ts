'use client';

import { useEffect, useMemo, useState } from 'react';
import { FALLBACK_NAV } from './api/fallback';
import { Workshop } from './workshop/client';
import { Alerts, Pages } from './api';
import {
  EXPERIENCE_KIND_TO_GROUP,
  ICON_BY_EXPERIENCE_KIND,
  readNavIconParam,
} from './nav/modular-apps';
import type { NavItem, NavSection, NavTree } from './api/types';

/**
 * W8 (2026-06-28) + LOTE2 — itens modulares distribuídos NOS grupos do nav.
 *
 * As Páginas modulares servidas por código (``config.mode === 'app_route'`` com
 * ``config.experience_kind``) — Conversas (aip_chat), Agentes (agents),
 * Soluções (solutions) — saíram do shell do Painel de Controle e do
 * FALLBACK_NAV estático. São lidas do registry de Páginas (Pages.list),
 * roteando para o render canônico ``/paginas/{slug}/view`` (shell do operador).
 *
 * LOTE2 (#2): em vez de uma seção "Aplicações" ISOLADA, expomos os itens como
 * uma lista anotada com ``targetGroup`` ({@link EXPERIENCE_KIND_TO_GROUP}:
 * aip_chat→Operação, agents→Análise, solutions→Conteúdo). O sidenav DISTRIBUI
 * cada um DENTRO do grupo-alvo (no tree default E em groups custom do tenant),
 * caindo numa seção residual "Aplicações" (always-on) só quando o grupo-alvo
 * não existe — assim aparecem dentro de Operação/Análise/Conteúdo E sobrevivem
 * a um ``sidenav.groups`` custom (era o bug #2).
 *
 * Ícone neutro por experiência (sem cor, sem infantil): chat=audio-lines (ícone
 * canônico do AIP), soluções=workflow (fluxo/desenho — NÃO 'share-2', que é a
 * "Rede"), agentes=cpu (técnico). Experiências futuras caem em 'box'.
 *
 * Dedupe: páginas cuja rota canônica JÁ é item base do nav (ex.: ``buscar`` →
 * ``/buscar``, que tem experience_kind mas é item de Operação) ficam de fora —
 * não duplicamos. Degrada em silêncio: sem páginas / erro → sem itens.
 *
 * Vendor (#1): os itens cujo ``id`` está em ``cp_nav_hidden`` (override do
 * vendor, MESMA fonte do shell — ``principal.tenant.cp_nav_hidden``) são
 * filtrados. ``cpNavHidden`` é PARÂMETRO (não ``useAuth`` interno) p/ manter o
 * hook testável via ``renderHook`` sem AuthProvider.
 */

/** Item modular anotado com o grupo-alvo (distribuído no sidenav). */
export interface AppNavItem extends NavItem {
  /** id/key do grupo onde o item deve ser injetado (Operação/Análise/Conteúdo). */
  targetGroup: string;
}

/**
 * NavTree do security-app — FALLBACK_NAV local (rotas UI-side: /buscar, /geo,
 * /cameras, /explorador, /rede, /alertas, …) + uma seção dinâmica **"Meus Apps"**
 * MESCLADA (nunca substitui) no topo.
 *
 * "Meus Apps" lista as OPERAÇÕES materializadas (apps Workshop `standalone`
 * com Operação/`project_id` — exclui seeds/templates tenant-wide) da Org ativa,
 * cada uma linkando `/workshop/view/{id}`. É assim que a operação criada pelo AIP
 * Arquiteto aparece NO SIDENAV (o backend já expõe isso em `iam/nav.py::my-apps`;
 * o security-app não consumia). Salas promovidas seguem no menu "Salas" do navbar
 * (superfície distinta — ver feedback_salas_navbar_not_sidenav). Degrada em
 * silêncio: sem apps (ou erro) → só o FALLBACK, nav intacta.
 *
 * Badge de ALERTAS (2026-06-12): o '5' hardcoded morreu. O item `alertas`
 * recebe a contagem REAL de pendentes do núcleo (GET /alerts/count_pending,
 * store na ontologia). Honesto por construção: sem alerta = sem badge;
 * erro = sem badge — nunca número inventado.
 */
/**
 * Aplica o badge REAL de alertas (count_pending) a qualquer item de nav que
 * roteia pra /alertas — independente da origem (tree default, sections legacy
 * ou groups persistidos no app-shell config). Pego na certificação do Sprint 6
 * (2026-06-12): groups salvos pelo operador carregavam badge '5' decorativo da
 * era hardcoded e SUBSTITUÍAM o tree, bypassando o badge real. Dado persistido
 * nunca vira número inventado: o item de alertas sempre mostra o real.
 */
export function overrideAlertBadge(
  sections: NavSection[],
  badge: string | null,
): NavSection[] {
  return sections.map((s) => ({
    ...s,
    items: s.items.map((it) =>
      it.id === 'alertas' || it.href.split('?')[0] === '/alertas'
        ? { ...it, badge }
        : it,
    ),
  }));
}

export function useNavTree(cpNavHidden: string[] = []) {
  const [meusApps, setMeusApps] = useState<NavSection | null>(null);
  const [appItems, setAppItems] = useState<AppNavItem[]>([]);
  const [alertBadge, setAlertBadge] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => Workshop.list())
      .then((apps) => {
        if (cancelled) return;
        const ops = (apps ?? [])
          .filter((a) => (a.surface ?? 'standalone') === 'standalone' && !!a.project_id)
          .slice(0, 15);
        if (!ops.length) return;
        setMeusApps({
          id: 'meus-apps',
          label: 'Meus Apps',
          default_open: true,
          items: ops.map((a) => ({
            id: `app-${a.id}`,
            label: a.display || 'App',
            href: `/workshop/view/${a.id}`,
            icon: 'layout-dashboard',
            perm_key: null,
            badge: null,
          })),
        });
      })
      .catch(() => {
        if (!cancelled) setMeusApps(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // W8 + LOTE2 — itens modulares (Páginas app_route com experience_kind),
  // anotados com targetGroup p/ o sidenav distribuir nos grupos.
  useEffect(() => {
    let cancelled = false;
    // Rotas base do nav (FALLBACK_NAV): dedupe por rota canônica — uma Página
    // app_route cuja rota já é item base (ex.: buscar → /buscar) NÃO entra aqui.
    const baseHrefs = new Set(
      FALLBACK_NAV.sections.flatMap((s) =>
        s.items.map((it) => it.href.split('?')[0]),
      ),
    );
    Promise.resolve()
      .then(() => Pages.list({ status: 'published' }))
      .then((pages) => {
        if (cancelled) return;
        const items: AppNavItem[] = (pages ?? [])
          .filter((p) => {
            const ek = (p.config as Record<string, unknown> | null)
              ?.experience_kind;
            return typeof ek === 'string' && ek.length > 0;
          })
          .filter((p) => !baseHrefs.has((p.route || '').split('?')[0]))
          .map((p) => {
            const ek = String(
              (p.config as Record<string, unknown>).experience_kind,
            );
            return {
              id: `app-route-${p.slug}`,
              label: p.title || p.slug,
              href: p.route,
              // Onda 3b — a Página pode declarar o próprio ícone
              // (config.params.nav_icon); senão cai no ícone-por-kind, senão
              // 'box'. Deixa duas 'embed' (Mapa Vivo × Alertas) distintas.
              icon: readNavIconParam(p.config) ?? ICON_BY_EXPERIENCE_KIND[ek] ?? 'box',
              perm_key: p.iam_perm_required,
              badge: null,
              // grupo-alvo no nav do operador; kind desconhecido → residual.
              targetGroup: EXPERIENCE_KIND_TO_GROUP[ek] ?? 'aplicacoes',
            };
          });
        setAppItems(items);
      })
      .catch(() => {
        if (!cancelled) setAppItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => Alerts.inbox.countPending())
      .then(({ count }) => {
        if (cancelled) return;
        setAlertBadge(count > 0 ? (count > 99 ? '99+' : String(count)) : null);
      })
      .catch(() => {
        if (!cancelled) setAlertBadge(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tree = useMemo<NavTree>(() => {
    // Vendor (delta Onda 0 Safe Tag): cp_nav_hidden também esconde itens do
    // FALLBACK (ex.: 'buscar') — antes só os modulares eram filtrados. Seção
    // que ficar vazia some inteira; id desconhecido é no-op.
    const base = FALLBACK_NAV.sections
      .map((s) => ({
        ...s,
        items: s.items.filter((it) => !cpNavHidden.includes(it.id)),
      }))
      .filter((s) => s.items.length > 0);
    const sections = overrideAlertBadge(base, alertBadge);
    // "Meus Apps" (operações materializadas) segue como seção dinâmica MESCLADA
    // no topo (nunca substitui o FALLBACK) e SOBREVIVE a um sidenav.groups
    // custom — ver carve-out no sidenav.tsx. Os itens modulares NÃO entram aqui:
    // são distribuídos pelo sidenav (appItems) nos grupos-alvo.
    const dynamic: NavSection[] = [];
    if (meusApps) dynamic.push(meusApps);
    return { sections: [...dynamic, ...sections] };
  }, [meusApps, alertBadge, cpNavHidden]);

  // Vendor (#1): filtra os itens cujo id está em cp_nav_hidden (mesma fonte do
  // shell). Sem ocultos → lista intacta; degrada em silêncio.
  const visibleAppItems = useMemo<AppNavItem[]>(
    () => appItems.filter((a) => !cpNavHidden.includes(a.id)),
    [appItems, cpNavHidden],
  );

  return { tree, appItems: visibleAppItems, alertBadge, live: true, loading: false };
}
