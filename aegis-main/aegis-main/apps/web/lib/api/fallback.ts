/**
 * Fallbacks usados quando o backend está offline.
 *
 * REGRA (shell honesto, 2026-06-12): fallback offline mostra ESTADO
 * honesto — NUNCA número/conteúdo fabricado que renderize como dado real.
 *
 *  - FALLBACK_NAV é topologia de ROTAS da UI (estrutura real do app, não
 *    dado de domínio) — pode viver aqui.
 *  - FALLBACK_ME_HOME existe só para dar o SHAPE do payload: todos os
 *    KPIs são null (a UI renderiza '—' / badge n/d) e a timeline é vazia.
 *  - Os corpora demo fabricados (FALLBACK_ENTITIES, FALLBACK_ROLES,
 *    FALLBACK_AUDIT, FALLBACK_VIDEO_*, FALLBACK_ONTOLOGY_*) MORRERAM:
 *    vazavam pra /explorador, /ficha, /rede, /admin e ⌘K como se fossem
 *    dado real. A guarda anti-regressão vive em __tests__/api-fallback.test.ts.
 */
import type { MeHome, NavTree } from './types';

export const FALLBACK_NAV: NavTree = {
  sections: [
    {
      id: 'operacao',
      label: 'Operação',
      default_open: true,
      items: [
        { id: 'painel', label: 'Início', href: '/', icon: 'layout-dashboard', perm_key: 'security.painel.view', badge: null },
        { id: 'buscar', label: 'Buscar', href: '/buscar', icon: 'search', perm_key: 'security.buscar.view', badge: null },
        { id: 'geo', label: 'Mapa', href: '/geo', icon: 'map', perm_key: 'security.geo.view', badge: null },
        { id: 'cameras', label: 'Câmeras', href: '/cameras', icon: 'cctv', perm_key: 'security.cameras.view', badge: null },
      ],
    },
    {
      id: 'analise',
      label: 'Análise',
      default_open: true,
      items: [
        { id: 'explorador', label: 'Explorador', href: '/explorador', icon: 'funnel', perm_key: 'security.explorador.view', badge: null },
        { id: 'rede', label: 'Rede', href: '/rede', icon: 'share-2', perm_key: 'security.rede.view', badge: null },
        // W8 (2026-06-28): "Agentes" SAIU daqui — agora vem da seção dinâmica
        // "Aplicações" (useNavTree, via Pages.list → /paginas/agentes/view), ao
        // lado de "Conversas" e "Soluções". Mantê-lo aqui duplicaria o item
        // (estático /agentes + dinâmico /paginas/agentes/view). A perm
        // `security.agentes.view` segue governando o item dinâmico.
        // Sprint H1.2 (2026-05-22): "Fluxos" migrou pro Painel de Controle
        // como "Lineage" (CONFIGURAÇÕES DA UNIDADE). Route /fluxos mantida.
      ],
    },
    {
      id: 'conteudo',
      label: 'Conteúdo',
      default_open: true,
      items: [
        // Badge REAL injetado pelo useNavTree (GET /alerts/count_pending) —
        // o '5' hardcoded morreu (2026-06-12); sem alerta/erro = sem badge.
        { id: 'alertas', label: 'Alertas', href: '/alertas', icon: 'bell', perm_key: 'security.alertas.view', badge: null },
        { id: 'relatorios', label: 'Relatórios', href: '/relatorios', icon: 'file-text', perm_key: 'security.relatorios.view', badge: null },
        { id: 'briefings', label: 'Briefings', href: '/briefings', icon: 'layout-template', perm_key: 'security.briefings.view', badge: null },
        // Wave D.3 (2026-05-23): Docs UI — espelha /docs/tree + /docs/content do backend.
        { id: 'docs', label: 'Documentação', href: '/docs', icon: 'book-open', perm_key: 'docs.tree.read', badge: null },
      ],
    },
    // Sprint H1 (2026-05-22): "Painel de Controle" saiu do sidenav e
    // virou full-bleed Palantir-style. Acesso pelo UserMenu do header.
  ],
};

/**
 * Shape honesto da Home offline: KPI null → KpiCard renderiza '—';
 * timeline vazia → LinhaTempo mostra estado vazio. Os números fabricados
 * (142 BOs, 5 alertas críticos…) morreram em 2026-06-12.
 */
export const FALLBACK_ME_HOME: MeHome = {
  kpis: {
    bos_24h: { value: null, delta_pct: null },
    mandados_abertos: { value: null, delta_pct: null },
    viaturas_ativas: { value: null, delta_pct: null },
    alertas_criticos: { value: null, delta_pct: null },
    operadores_online: { value: null, delta_pct: null },
  },
  timeline: [],
};
