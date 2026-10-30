/**
 * W8 LOTE2 (2026-06-28) — fonte ÚNICA das 3 Páginas modulares servidas no
 * shell do OPERADOR (rotas ``app_route`` com ``experience_kind``):
 * "Conversas" (aip_chat), "Agentes" (agents) e "Soluções" (solutions).
 *
 * Compartilhada (DRY) entre:
 *  - ``lib/use-nav-tree.ts`` — hidrata os itens dinâmicos a partir de
 *    ``Pages.list()`` e os anota com o GRUPO-ALVO ({@link EXPERIENCE_KIND_TO_GROUP})
 *    e o ÍCONE ({@link ICON_BY_EXPERIENCE_KIND}) por ``experience_kind``;
 *  - ``app/painel-de-controle/dev`` (NavCard do vendor) — liga/desliga a
 *    visibilidade de cada uma para o tenant, persistido em ``cp_nav_hidden``.
 *
 * O ``id`` (``app-route-${slug}``) é o MESMO usado pela seção dinâmica do
 * sidenav e pela chave de ``cp_nav_hidden`` — assim o toggle do vendor casa
 * com o item real. ``experience_kind`` é o contrato do backend (seed). ``label``
 * é fallback pt-BR; ``t('nav.<id>')`` é a fonte real quando houver chave.
 *
 * Módulo DELIBERADAMENTE leve (zero deps de UI / API) para entrar nos bundles
 * do NavCard e dos testes sem puxar componentes pesados. Os slugs/kinds
 * literais aqui espelham as constantes canônicas (``SOLUTIONS_SLUG``,
 * ``AGENTES_SLUG``, ``AIP_THREADS_SLUG``) — AIP_THREADS_SLUG vive num
 * componente pesado, por isso não importamos de lá.
 */

export interface ModularAppNav {
  /** id estável do item de nav (= `app-route-${slug}`); chave de cp_nav_hidden. */
  id: string;
  /** slug canônico da Página registrada. */
  slug: string;
  /** rótulo do contrato app_route (seed do backend). */
  experience_kind: string;
  /** fallback pt-BR do label (t('nav.<id>') é a fonte real). */
  label: string;
  /** ícone neutro lucide (sem cor). */
  icon: string;
  /** grupo-alvo (Operação/Análise/Conteúdo) onde o item é injetado. */
  targetGroup: string;
}

export const MODULAR_APP_NAV: ModularAppNav[] = [
  // Conversas (AIP) → Operação. Ícone canônico do AIP.
  {
    id: 'app-route-aip-threads',
    slug: 'aip-threads',
    experience_kind: 'aip_chat',
    label: 'Conversas',
    icon: 'audio-lines',
    targetGroup: 'operacao',
  },
  // Agentes (frota 24/7) → Análise. Ícone técnico (CPU).
  {
    id: 'app-route-agentes',
    slug: 'agentes',
    experience_kind: 'agents',
    label: 'Agentes',
    icon: 'cpu',
    targetGroup: 'analise',
  },
  // Soluções (Desenho da Operação) → Conteúdo. Ícone de fluxo (workflow) —
  // SAIU de 'share-2' p/ não colidir com "Rede" no nav do operador.
  {
    id: 'app-route-solutions',
    slug: 'solutions',
    experience_kind: 'solutions',
    label: 'Soluções',
    icon: 'workflow',
    targetGroup: 'conteudo',
  },
  // Construtor de Camadas (o "My Maps" do AEGIS) → Operação, ao lado do Mapa,
  // que é onde o resultado dele aparece. Ferramenta do TENANT (as camadas que
  // publica são do tenant), por isso entra por aqui e não pela seção "Meus
  // Apps", que lista apps de Operação. Ícone de traço (desenho), sem colidir
  // com 'layers' (Mapa) nem 'workflow' (Soluções).
  {
    id: 'app-route-construtor-camadas',
    slug: 'construtor-camadas',
    experience_kind: 'layer_builder',
    label: 'Construtor de camadas',
    icon: 'pen-line',
    targetGroup: 'operacao',
  },
];

/**
 * Ícone neutro por ``experience_kind`` (derivado da fonte única). Soluções usa
 * 'workflow' (semântica de fluxo/desenho) — NÃO 'share-2', que é o ícone da
 * "Rede" (evita colisão). aip_chat=audio-lines, agents=cpu.
 */
export const ICON_BY_EXPERIENCE_KIND: Record<string, string> = {
  ...Object.fromEntries(MODULAR_APP_NAV.map((m) => [m.experience_kind, m.icon])),
  // Onda 3b (Safe Tag) — SPAs de portaria embutidas same-origin
  // (experience_kind:'embed'). Ícone genérico do grupo (moldura); cada Page
  // sobrepõe com o seu via ``config.params.nav_icon`` (ver readNavIconParam) —
  // ex.: Mapa Vivo → 'map-pin', Alertas ao Vivo → 'bell-ring'.
  embed: 'frame',
  // Verticais industriais (contagem de sacos): as Páginas Workshop do vertical
  // (`mode:'workshop'` + `experience_kind:'workshop'`, semeadas por
  // `ontology-module/app/utils/seed_contagem_sacos.py`) entram na sidenav por
  // aqui — sem o rótulo o `use-nav-tree` não as injeta e a operação só abre as
  // telas por URL digitada. Ícone-por-kind é o do grupo; cada Página declara o
  // seu em `config.params.nav_icon` (activity/clipboard-list/gauge/bar-chart-3).
  workshop: 'layout-dashboard',
};

/**
 * Grupo-alvo por ``experience_kind`` (derivado da fonte única): aip_chat →
 * Operação, agents → Análise, solutions → Conteúdo. Itens cujo kind não está
 * neste mapa caem na seção residual "Aplicações" (always-on) no sidenav.
 */
export const EXPERIENCE_KIND_TO_GROUP: Record<string, string> = {
  ...Object.fromEntries(MODULAR_APP_NAV.map((m) => [m.experience_kind, m.targetGroup])),
  // Onda 3b — as telas de portaria (Mapa Vivo / Alertas ao Vivo) são de
  // Operação.
  embed: 'operacao',
  // As telas do vertical industrial (Ao Vivo/Produção/Calibração/Relatórios)
  // são a OPERAÇÃO da linha — vão para o grupo "Operação", ao lado de Câmeras.
  workshop: 'operacao',
};

/**
 * Ícone de nav DECLARADO pela própria Página em ``config.params.nav_icon``
 * (Onda 3b). Precede o ícone-por-kind na hidratação do nav — deixa duas
 * Páginas do MESMO ``experience_kind`` (ex.: duas ``embed``) terem ícones
 * distintos (Mapa Vivo × Alertas). Puro (zero deps) de propósito. Devolve o
 * nome do ícone lucide (string) ou ``null`` quando ausente/ inválido.
 */
export function readNavIconParam(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  const params = (config as Record<string, unknown>).params;
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  const icon = (params as Record<string, unknown>).nav_icon;
  return typeof icon === 'string' && icon.length > 0 ? icon : null;
}
