'use client';

import * as React from 'react';
import {
  getWidgetComponent,
  getWidgetMeta,
  readBindingsFromURL,
  writeBindingsToURL,
} from '@/components/workshop/WorkshopV2Renderer';
import { useT } from '@/lib/i18n/provider';
import '@/components/workshop/widgets';
import { pickFichaSeed } from '@/lib/workshop/seeds/ficha';
import { FICHA_GOTO_TAB_EVENT } from '@/lib/ficha/type-actions';
import { useResolvedApp } from '@/lib/workshop/runtime';
import { Workshop } from '@/lib/workshop/client';
import type { LayoutNode, WorkshopApp } from '@/lib/workshop/types';

/**
 * Renderiza a /ficha/{id} 100% baseado em SLOTS declarados pelo
 * `app.layout.root[].layout.slot`. Não hardcoda paleta/tabs/inspetor —
 * tudo são widgets normais que o operador adiciona/remove/move via
 * editor.
 *
 *   slot='top'    → cabeçalho horizontal (full-width)
 *   slot='left'   → sidebar esquerda fixa (24-col)
 *   slot='right'  → sidebar direita fixa
 *   slot='canvas' (default) → grid central, agrupado por `layout.tab`
 *
 * Aba ativa é mantida em URL binding (`?var.active_tab=...`) e exposta
 * aos widgets via `variables.active_tab`. O widget `security.ficha.tabs`
 * lê a lista de abas em `variables.__ficha_tabs__` (injetada aqui) e
 * troca o binding ao clicar.
 */

type ObjLike = {
  id: string;
  name: string;
  entity_type: string;
  properties: Record<string, unknown>;
  classification?: string;
  /** true quando o id resolveu pra OntologyNode canônico (T1). */
  __canonical?: boolean;
  [key: string]: unknown;
};

interface TabSpec {
  id: string;
  label: string;
  count: number;
}

const TAB_LABELS: Record<string, string> = {
  identidade: 'Identidade',
  vinculos: 'Vínculos',
  acoes: 'Ações',
  historico: 'Histórico',
  atividade: 'Atividade',
  parlamentar: 'Mandato',
  midia: 'Mídia',
  integridade: 'Integridade',
};
const FALLBACK_TAB_ID = '__outros__';

function slotOf(node: LayoutNode): string {
  return node.layout?.slot?.trim() || 'canvas';
}

function tabOf(node: LayoutNode): string {
  return node.layout?.tab?.trim() || FALLBACK_TAB_ID;
}

/**
 * Deriva as abas da ficha a partir do LAYOUT REAL — a ordem é a ordem em que
 * cada aba aparece pela 1ª vez nos nodes do canvas (sem ordem fixa com
 * vocabulário de pessoa/parlamentar). O fallback "Outros" sempre por último.
 * Pura (sem i18n) pra ser testável; o componente mapeia os rótulos.
 */
export function orderFichaTabs(canvasNodes: LayoutNode[]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const node of canvasNodes) {
    const id = tabOf(node);
    if (!counts.has(id)) order.push(id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const list: { id: string; count: number }[] = [];
  for (const id of order) {
    if (id === FALLBACK_TAB_ID) continue;
    const c = counts.get(id) ?? 0;
    if (c) list.push({ id, count: c });
  }
  const out = counts.get(FALLBACK_TAB_ID);
  if (out) list.push({ id: FALLBACK_TAB_ID, count: out });
  return list;
}

export function FichaWorkshopShell({ obj }: { obj: ObjLike }) {
  const t = useT();
  // Rótulo via i18n com fallback pt-BR (quando a chave ainda não existe no dict).
  const tl = React.useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t],
  );
  // Backend resolver: app workshop com surface=entity_ficha + target_kind
  // sobrescreve a seed em código. Sem app → cai pra seed (default).
  // Objeto canônico (OntologyNode) sem seed específica usa a seed genérica
  // de objeto (identificação + vínculos), nunca a default de pessoa.
  const seedFallback = pickFichaSeed(obj.entity_type, {
    canonical: obj.__canonical === true,
  });
  const [backendApp, setBackendApp] = React.useState<WorkshopApp | null>(null);
  const [resolvedSeed, setResolvedSeed] = React.useState<WorkshopApp>(seedFallback);

  React.useEffect(() => {
    let cancelled = false;
    Workshop.bySurface({
      surface: 'entity_ficha',
      target_kind: obj.entity_type,
    })
      .then((found) => {
        if (cancelled) return;
        if (found) {
          setBackendApp(found);
          setResolvedSeed(found);
        } else {
          setBackendApp(null);
          setResolvedSeed(seedFallback);
        }
      })
      .catch(() => {
        // Backend offline / sem perm → mantém seed default
        if (!cancelled) setResolvedSeed(seedFallback);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.entity_type]);

  const { app, source } = useResolvedApp(resolvedSeed);
  // `backendApp` é só pra debug; o renderer já usa `app` resolvido.
  void backendApp;

  // URL bindings + active_tab (compartilhado via binding).
  const [bindings, setBindings] = React.useState<Record<string, unknown>>({});
  React.useEffect(() => {
    setBindings((b) => ({ ...readBindingsFromURL(), ...b }));
  }, []);
  React.useEffect(() => {
    writeBindingsToURL(bindings);
  }, [bindings]);
  const setBinding = React.useCallback((external: string, value: unknown) => {
    setBindings((prev) => ({ ...prev, [external]: value }));
  }, []);

  // Navegação decoupled toolbar→shell: a toolbar "Ações" (fora da shell) emite
  // `ficha:goto-tab` pra trocar a aba ativa sem prop-drilling.
  React.useEffect(() => {
    const onGoto = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string }>).detail;
      if (detail?.tab) setBinding('active_tab', detail.tab);
    };
    window.addEventListener(FICHA_GOTO_TAB_EVENT, onGoto);
    return () => window.removeEventListener(FICHA_GOTO_TAB_EVENT, onGoto);
  }, [setBinding]);

  // Particiona os nodes por slot.
  const slots = React.useMemo(() => {
    const out: Record<string, LayoutNode[]> = {
      top: [],
      left: [],
      right: [],
      canvas: [],
    };
    for (const node of app.layout.root) {
      const s = slotOf(node);
      (out[s] ??= []).push(node);
    }
    return out;
  }, [app]);

  // Calcula as abas a partir SOMENTE dos nodes do slot canvas. A ORDEM deriva
  // do LAYOUT REAL (ordem em que cada aba aparece pela 1ª vez nos nodes) — sem
  // ordem fixa com vocabulário de pessoa/parlamentar. Cada seed (pessoa,
  // parlamentar, objeto canônico) define sua própria ordem pela ordem dos nodes.
  // Multidomínio: o "Outros" (fallback) sempre por último.
  const tabs: TabSpec[] = React.useMemo(() => {
    return orderFichaTabs(slots.canvas ?? []).map(({ id, count }) => ({
      id,
      count,
      label:
        id === FALLBACK_TAB_ID
          ? tl('ficha.tab.outros', 'Outros')
          : tl('ficha.tab.' + id, TAB_LABELS[id] ?? id),
    }));
  }, [slots.canvas, tl]);

  // Active tab — controlado por binding (deep-linkable).
  const activeTab =
    typeof bindings.active_tab === 'string' && bindings.active_tab
      ? (bindings.active_tab as string)
      : (tabs[0]?.id ?? '');
  // Garante default na URL na primeira render.
  React.useEffect(() => {
    if (!bindings.active_tab && tabs.length > 0) {
      setBinding('active_tab', tabs[0].id);
    }
  }, [bindings.active_tab, tabs, setBinding]);

  // Índice NAVEGÁVEL das seções (multi-domínio): cada widget do canvas vira um item
  // {id, tab, label pt-BR (do meta), icon}. A paleta (left nav) renderiza isto e clicar
  // NAVEGA pra aba (setBinding active_tab). Reflete o layout REAL — pessoa, empresa,
  // instituição, evento: o que estiver no layout daquele tipo aparece aqui.
  const navItems = React.useMemo(() => {
    return (slots.canvas ?? []).map((n) => {
      const meta = getWidgetMeta(n.widget.type);
      const raw = (meta?.label || n.widget.type).replace(/^Ficha\s*·\s*/i, '').trim();
      const fallback = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : n.widget.type;
      // i18n da seção por tipo de widget (ficha.section.<short>), fallback = rótulo do meta.
      const short = n.widget.type.replace(/^security\.ficha\./, '').replace(/[^a-z0-9_]/gi, '');
      const label = tl('ficha.section.' + short, fallback);
      return { id: n.id, tab: tabOf(n), label, icon: meta?.icon ?? 'circle' };
    });
  }, [slots.canvas, tl]);

  // Variables compartilhadas com todos os widgets (incluindo o tabs).
  const variables = React.useMemo(
    () => ({
      ...bindings,
      entity_id: obj.id,
      properties: obj.properties,
      obj,
      // Contrato do type-def (se houver) — o WidgetIdentificacao usa pra
      // rotular/formatar negócio e colapsar técnico. null → fallback heurístico.
      type_def: (obj as { __schema?: unknown }).__schema ?? null,
      __ficha_tabs__: tabs,
      __ficha_nav__: navItems,
      active_tab: activeTab,
    }),
    [bindings, obj, tabs, navItems, activeTab],
  );

  // Nodes do canvas, filtrados pela aba ativa.
  const canvasNodes = React.useMemo(() => {
    return (slots.canvas ?? []).filter((n) => tabOf(n) === activeTab);
  }, [slots.canvas, activeTab]);

  const totalCols = app.layout.columns ?? 20;

  // Helper de render — repassa variables/bindings consistentes.
  const renderNode = (node: LayoutNode, withGrid = false) => {
    const Component = getWidgetComponent(node.widget.type);
    const style: React.CSSProperties = {};
    if (withGrid && node.layout?.col_span) {
      style.gridColumn = `span ${node.layout.col_span}`;
    }
    if (node.layout?.row_span) style.gridRow = `span ${node.layout.row_span}`;
    if (node.layout?.min_height) style.minHeight = node.layout.min_height;
    if (!Component) {
      return (
        <div
          key={node.id}
          style={style}
          className="p-3 border border-dashed border-warning bg-warning/5 text-[11px] font-mono text-warning"
        >
          Widget não registrado: <strong>{node.widget.type}</strong>
        </div>
      );
    }
    return (
      <div
        key={node.id}
        data-testid={`ficha-widget-${node.id}`}
        style={style}
      >
        <Component
          appId={app.id}
          config={(node.widget.props as Record<string, unknown>) ?? {}}
          variables={variables}
          bindings={bindings}
          setBinding={setBinding}
        />
      </div>
    );
  };

  const hasLeft = (slots.left?.length ?? 0) > 0;
  const hasRight = (slots.right?.length ?? 0) > 0;
  const hasTop = (slots.top?.length ?? 0) > 0;

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      data-ficha-source={source}
      data-ficha-app-id={app.id}
    >
      {/* ─── slot=top (header, full-width) ──────────────── */}
      {hasTop && (
        <div className="shrink-0">
          {slots.top.map((node) => renderNode(node))}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* ─── slot=left ────────────────────────────────── */}
        {hasLeft && (
          <div className="shrink-0 w-[240px] overflow-hidden flex flex-col">
            {slots.left.map((node) => (
              <div key={node.id} className="flex-1 overflow-hidden">
                {renderNode(node)}
              </div>
            ))}
          </div>
        )}

        {/* ─── slot=canvas (grid agrupado por tab) ─────── */}
        <section
          role="tabpanel"
          aria-labelledby={activeTab ? `ficha-tab-${activeTab}` : undefined}
          data-testid={activeTab ? `ficha-tabpanel-${activeTab}` : undefined}
          className="flex-1 overflow-y-auto bg-canvas-light"
        >
          {canvasNodes.length === 0 ? (
            <div className="p-6 text-[12px] text-muted-on-light italic">
              {t('ficha.shell.emptyTabPrefix')} <strong>{activeTab || '—'}</strong>{' '}
              {t('ficha.shell.emptyTabSuffix')}{' '}
              <a
                href={`/workshop/edit/${encodeURIComponent(app.id)}`}
                className="text-primary underline"
              >
                /workshop/edit/{app.id}
              </a>
              .
            </div>
          ) : (
            <div
              className="grid gap-3 p-4"
              style={{
                gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))`,
              }}
            >
              {canvasNodes.map((node) => renderNode(node, true))}
            </div>
          )}
        </section>

        {/* ─── slot=right ───────────────────────────────── */}
        {hasRight && (
          <div className="shrink-0 w-[280px] overflow-hidden flex flex-col">
            {slots.right.map((node) => (
              <div key={node.id} className="flex-1 overflow-hidden">
                {renderNode(node)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Mantém export pra compat — não usado mais externamente.
export type { WorkshopApp };
