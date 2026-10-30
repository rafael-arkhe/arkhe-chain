import type { LayoutNode, WorkshopApp } from '@/lib/workshop/types';

/**
 * Seeds do "Detalhe da busca" — surface=search_result.
 *
 * 4 widgets atômicos refletindo o DetalheObjeto default; operador
 * pode deletar/reordenar/trocar cada bloco sem código.
 *
 *   security.detalhe.cabecalho  — thumb + nome + snippet + kind/score
 *   security.detalhe.meta       — fonte/tool/query/externalId/url
 *   security.detalhe.acoes      — abrir ficha · criar · enriquecer
 *   security.detalhe.payload    — JSON bruto (collapsible)
 *
 * O DetalheResolver injeta `variables.result/source/query` em runtime.
 */

interface NodeSpec {
  id: string;
  type: string;
  col_span?: number;
}

function buildNodes(specs: NodeSpec[]): LayoutNode[] {
  return specs.map((s) => {
    const layout: NonNullable<LayoutNode['layout']> = {};
    if (s.col_span) layout.col_span = s.col_span;
    return {
      id: s.id,
      widget: { type: s.type, props: {} },
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

const DEFAULT_NODES: NodeSpec[] = [
  { id: 'detalhe_cabecalho', type: 'security.detalhe.cabecalho', col_span: 20 },
  { id: 'detalhe_meta',      type: 'security.detalhe.meta',      col_span: 20 },
  { id: 'detalhe_acoes',     type: 'security.detalhe.acoes',     col_span: 20 },
  { id: 'detalhe_payload',   type: 'security.detalhe.payload',   col_span: 20 },
];

export const SEARCH_RESULT_SEEDS: Record<string, WorkshopApp> = {
  default: buildApp(
    'seed.security.detalhe.default',
    'Detalhe de busca',
    buildNodes(DEFAULT_NODES),
  ),
};

/**
 * Hoje só existe um seed default — receber `sourceKey` aqui é o gancho
 * pra quando criarmos variantes por fonte (ex: YouTube com player
 * embutido, Bluesky com thread, etc).
 */
export function pickSearchResultSeed(_sourceKey?: string | null): WorkshopApp {
  return SEARCH_RESULT_SEEDS.default;
}
