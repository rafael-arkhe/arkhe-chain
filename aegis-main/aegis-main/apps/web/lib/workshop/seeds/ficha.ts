import type { LayoutNode, WorkshopApp } from '@/lib/workshop/types';

/**
 * Seeds da Ficha — agora 100% explodidas em nós editáveis, INCLUINDO
 * o "chrome" do template:
 *
 *   • security.ficha.paleta    (slot=left)   — sidebar esquerda
 *   • security.ficha.tabs      (slot=top)    — barra de abas
 *   • widgets atômicos          (slot=canvas) — conteúdo agrupado por aba
 *   • security.ficha.inspetor  (slot=right)  — sidebar direita
 *
 * O FichaWorkshopShell renderiza tudo pela posição declarada em
 * `layout.slot`. Operador pode remover qualquer um (deletar o nó),
 * mover entre slots (slot picker no Inspetor) ou trocar por outro
 * widget — sem precisar tocar em código.
 */

interface NodeSpec {
  id: string;
  type: string;
  col_span?: number;
  min_height?: string;
  slot?: 'top' | 'left' | 'right' | 'canvas';
  tab?:
    | 'identidade'
    | 'vinculos'
    | 'historico'
    | 'atividade'
    | 'parlamentar'
    | 'midia'
    | 'integridade'
    | 'acoes';
  /** Props default do widget (ex.: relation_list com href_template). */
  props?: Record<string, unknown>;
}

function buildNodes(specs: NodeSpec[]): LayoutNode[] {
  return specs.map((s) => {
    const layout: NonNullable<LayoutNode['layout']> = {};
    if (s.col_span) layout.col_span = s.col_span;
    if (s.min_height) layout.min_height = s.min_height;
    if (s.slot && s.slot !== 'canvas') layout.slot = s.slot;
    if (s.tab) layout.tab = s.tab;
    return {
      id: s.id,
      widget: { type: s.type, props: s.props ?? {} },
      layout: Object.keys(layout).length ? layout : undefined,
    };
  });
}

function buildApp(id: string, display: string, nodes: LayoutNode[]): WorkshopApp {
  return {
    id,
    external_id: id,
    display,
    schema_version: 2,
    variables: [],
    layout: { columns: 20, root: nodes },
  };
}

// ── Chrome reutilizável ─────────────────────────────────────────────
// Barra esquerda = NAVEGADOR DE ASSOCIAÇÕES real (Links.neighbors agrupado por tipo +
// evidências por fonte, contagens reais, navegável em nova aba). type-key mantido
// (security.ficha.paleta) por compat de layout; o widget renderiza AssociacoesRail.
const CHROME: NodeSpec[] = [
  { id: 'ficha_associacoes', type: 'security.ficha.paleta', slot: 'left' },
  { id: 'ficha_tabs', type: 'security.ficha.tabs', slot: 'top' },
  { id: 'ficha_inspetor', type: 'security.ficha.inspetor', slot: 'right' },
];

// ── Resumo executivo (FRENTE D) — painel de SITUAÇÃO no slot TOPO ───
// Vai junto do ficha_tabs no slot:'top' das fichas que têm dossiê real.
const RESUMO_NODE: NodeSpec = { id: 'ficha_resumo', type: 'security.ficha.resumo', slot: 'top' };

// ── Pessoa — canvas completo ────────────────────────────────────────
const PERSON_NODES: NodeSpec[] = [
  ...CHROME,
  RESUMO_NODE,
  { id: 'ficha_identificacao', type: 'security.ficha.identificacao', col_span: 20, tab: 'identidade' },
  { id: 'ficha_enderecos', type: 'security.ficha.enderecos', col_span: 20, tab: 'identidade' },
  // Aba "Vínculos": relações 1-hop REAIS da entidade (Links.neighbors), navegáveis.
  { id: 'ficha_vinculos', type: 'relation_list', col_span: 20, tab: 'vinculos', props: { source: 'obj', href_template: '/ficha/{{id}}' } },
  { id: 'ficha_antecedentes', type: 'security.ficha.antecedentes', col_span: 10, tab: 'historico' },
  { id: 'ficha_mandados', type: 'security.ficha.mandados', col_span: 10, tab: 'historico' },
  { id: 'ficha_veiculos', type: 'security.ficha.veiculos', col_span: 20, tab: 'historico' },
  // Aba "Mídia": fotos/posts/perfis das fontes sociais coletadas (OSINT).
  { id: 'ficha_midia_social', type: 'security.ficha.midia_social', col_span: 20, tab: 'midia' },
  { id: 'ficha_cidades', type: 'security.ficha.cidades', col_span: 10, min_height: '320px', tab: 'atividade' },
  { id: 'ficha_observacoes_cctv', type: 'security.ficha.observacoes_cctv', col_span: 10, min_height: '320px', tab: 'atividade' },
  { id: 'ficha_linha_tempo', type: 'security.ficha.linha_tempo', col_span: 20, min_height: '340px', tab: 'atividade' },
];

// ── Placa LPR ──────────────────────────────────────────────────────
const LPR_NODES: NodeSpec[] = [
  ...CHROME,
  RESUMO_NODE,
  { id: 'ficha_identificacao', type: 'security.ficha.identificacao', col_span: 20, tab: 'identidade' },
  { id: 'ficha_veiculos', type: 'security.ficha.veiculos', col_span: 20, tab: 'historico' },
  { id: 'ficha_cidades', type: 'security.ficha.cidades', col_span: 10, min_height: '320px', tab: 'atividade' },
  { id: 'ficha_observacoes_cctv', type: 'security.ficha.observacoes_cctv', col_span: 10, min_height: '320px', tab: 'atividade' },
  { id: 'ficha_linha_tempo', type: 'security.ficha.linha_tempo', col_span: 20, min_height: '340px', tab: 'atividade' },
];

// ── Stream CCTV ────────────────────────────────────────────────────
const CCTV_NODES: NodeSpec[] = [
  ...CHROME,
  RESUMO_NODE,
  { id: 'ficha_identificacao', type: 'security.ficha.identificacao', col_span: 20, tab: 'identidade' },
  { id: 'ficha_observacoes_cctv', type: 'security.ficha.observacoes_cctv', col_span: 20, min_height: '420px', tab: 'atividade' },
  { id: 'ficha_linha_tempo', type: 'security.ficha.linha_tempo', col_span: 20, min_height: '340px', tab: 'atividade' },
];

// ── Parlamentar — dossiê 360° (Câmara + CEAP + redes + integridade) ─
const PARLAMENTAR_NODES: NodeSpec[] = [
  ...CHROME,

  // ─── Aba "Mandato" ────────────────────────────────────────
  { id: 'ficha_mandato',       type: 'security.ficha.mandato',       col_span: 10, tab: 'parlamentar' },
  { id: 'ficha_hist_legis',    type: 'security.ficha.historico_legislativo', col_span: 10, tab: 'parlamentar' },
  { id: 'ficha_resumo360',     type: 'security.ficha.resumo360',     col_span: 20, tab: 'parlamentar' },
  { id: 'ficha_cronologia',    type: 'security.ficha.cronologia_integrada', col_span: 20, tab: 'parlamentar' },

  // ─── Aba "Mídia" ──────────────────────────────────────────
  { id: 'ficha_videos_yt',     type: 'security.ficha.videos_youtube', col_span: 20, tab: 'midia' },
  { id: 'ficha_midia',         type: 'security.ficha.midia',         col_span: 20, tab: 'midia' },
  { id: 'ficha_redes',         type: 'security.ficha.redes_sociais', col_span: 10, tab: 'midia' },
  { id: 'ficha_citacoes',      type: 'security.ficha.citacoes',      col_span: 10, tab: 'midia' },

  // ─── Aba "Histórico" (CEAP + correlações) ────────────────
  { id: 'ficha_top_forn',      type: 'security.ficha.top_fornecedores', col_span: 10, tab: 'historico' },
  { id: 'ficha_correlacoes',   type: 'security.ficha.correlacoes',   col_span: 10, tab: 'historico' },
  { id: 'ficha_documentos',    type: 'security.ficha.documentos_ceap', col_span: 20, tab: 'historico' },
  { id: 'ficha_linha_tempo',   type: 'security.ficha.linha_tempo',   col_span: 20, min_height: '280px', tab: 'historico' },

  // ─── Aba "Integridade" ────────────────────────────────────
  { id: 'ficha_integridade',   type: 'security.ficha.integridade',   col_span: 20, tab: 'integridade' },

  // Identificação genérica vai como fallback na aba "Identidade"
  { id: 'ficha_identificacao', type: 'security.ficha.identificacao', col_span: 20, tab: 'identidade' },
];

// ── Objeto CANÔNICO (OntologyNode) — T1 / P5 ───────────────────────
// Ficha genérica multidomínio pra QUALQUER instância da ontologia
// (conector, câmera, compute_endpoint, carro, país, empresa, evento,
// operação, instância de create_object...). Tudo é widget GENÉRICO,
// dirigido pelo type-def (objectTypeSchema), nunca por kind/keyword:
//   • identificação — properties formatadas pelo contrato (negócio vs técnico).
//   • vínculos      — relações 1-hop NAVEGÁVEIS (relation_list lê variables.obj
//                     e o type_def.links enriquece o agrupamento).
//   • ações         — type_def.actions renderizadas como botões GOVERNADOS
//                     (ActionType.execute → gates + lineage). Sem hardcode.
//   • atividade     — linha do tempo genérica (evidências/eventos datados).
//   • mídia         — fotos/posts/perfis das fontes sociais coletadas.
// Zero widget de vertical (antecedentes/mandados/veículos) — domínio vem da
// ontologia, não do código (régua "mineração herdaria?").
const CANONICAL_NODES: NodeSpec[] = [
  ...CHROME,
  RESUMO_NODE,
  { id: 'ficha_identificacao', type: 'security.ficha.identificacao', col_span: 20, tab: 'identidade' },
  {
    id: 'ficha_vinculos',
    type: 'relation_list',
    col_span: 20,
    tab: 'vinculos',
    props: { source: 'obj', href_template: '/ficha/{{id}}' },
  },
  // Aba "Ações": ações do TIPO (type_def.actions) executadas pelo pipeline
  // governado (ActionType). Genérico — vale pra qualquer Object Type.
  { id: 'ficha_acoes', type: 'security.ficha.acoes', col_span: 20, tab: 'acoes' },
  // Aba "Atividade": linha do tempo genérica (aparece quando há evidências/
  // eventos datados; estado vazio honesto quando não há).
  { id: 'ficha_linha_tempo', type: 'security.ficha.linha_tempo', col_span: 20, min_height: '340px', tab: 'atividade' },
  // Aba "Mídia": fotos/posts/perfis das fontes sociais (genérico, multi-domínio).
  { id: 'ficha_midia_social', type: 'security.ficha.midia_social', col_span: 20, tab: 'midia' },
];

// DEFAULT = ficha GENÉRICA (objeto canônico). Régua multidomínio: kind
// desconhecido NUNCA herda os widgets de pessoa (antecedentes/mandados/
// veículos) — cai na ficha neutra. Pessoa só quando o kind é pessoa/person
// (pickFichaSeed resolve a seed `person` explicitamente).
const DEFAULT_NODES = CANONICAL_NODES;

export const FICHA_SEEDS: Record<string, WorkshopApp> = {
  person: buildApp('seed.security.ficha.person', 'Ficha de pessoa', buildNodes(PERSON_NODES)),
  lpr_plate: buildApp('seed.security.ficha.lpr_plate', 'Ficha de placa LPR', buildNodes(LPR_NODES)),
  cctv_stream: buildApp('seed.security.ficha.cctv_stream', 'Ficha de câmera CCTV', buildNodes(CCTV_NODES)),
  parlamentar: buildApp('seed.security.ficha.parlamentar', 'Ficha de parlamentar', buildNodes(PARLAMENTAR_NODES)),
  canonical: buildApp('seed.security.ficha.canonical', 'Ficha de objeto', buildNodes(CANONICAL_NODES)),
  default: buildApp('seed.security.ficha.default', 'Ficha', buildNodes(DEFAULT_NODES)),
};

export function pickFichaSeed(
  kind: string | null | undefined,
  opts?: { canonical?: boolean },
): WorkshopApp {
  // Régua multidomínio (P5): kind DESCONHECIDO/canônico cai na ficha GENÉRICA
  // (CANONICAL_NODES — identificação type-def + vínculos + ações + atividade),
  // NUNCA na ficha de pessoa. Pessoa só quando o kind é explicitamente
  // pessoa/person. Tanto `default` quanto `canonical` projetam o seed genérico.
  // Backend usa "pessoa", frontend antigo usava "person" — aceita os dois.
  const normalized = kind === 'pessoa' ? 'person' : kind;
  // Objeto canônico (OntologyNode) sem seed específica → ficha genérica
  // de objeto, nunca a default de pessoa.
  if (opts?.canonical) {
    if (normalized && normalized in FICHA_SEEDS && normalized !== 'default') {
      return FICHA_SEEDS[normalized];
    }
    return FICHA_SEEDS.canonical;
  }
  if (!normalized) return FICHA_SEEDS.default;
  return FICHA_SEEDS[normalized in FICHA_SEEDS ? normalized : 'default'] ?? FICHA_SEEDS.default;
}
