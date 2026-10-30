import type { WorkshopApp } from '@/lib/workshop/types';

/**
 * Seed local da Home — layout 20 colunas com cada widget como nó
 * INDEPENDENTE. Operador pode mover/excluir item-por-item no editor.
 *
 *  Grid:  ── 20 cols totais ──
 *   linha 1: 5 KpiCards × col_span 4 = 20
 *   linha 2: 5 widgets   × col_span 4 = 20
 *   linha 3: 1 timeline  × col_span 20
 *
 *  #4 — dois widgets DISTINTOS e coerentes (fonte = destino):
 *   · `alert_list`              → inbox de alertas (regra/geocerca) → /alertas
 *   · `security.alertas_destaque` → feed de detecções CCTV          → /cameras
 */
export const HOME_SEED_APP: WorkshopApp = {
  id: 'seed.security.home',
  external_id: 'seed.security.home',
  display: 'Início',
  description: 'Mosaico de comando — KPIs · Mini-map · Alertas · Câmeras · Linha do tempo',
  schema_version: 2,
  variables: [],
  layout: {
    columns: 20,
    root: [
      // ── linha 1: KPIs ────────────────────────────────────────
      { id: 'kpi_bos',       widget: { type: 'security.home.kpi_card', props: { kpi: 'bos_24h' } },          layout: { col_span: 4 } },
      { id: 'kpi_mandados',  widget: { type: 'security.home.kpi_card', props: { kpi: 'mandados_abertos' } }, layout: { col_span: 4 } },
      { id: 'kpi_viaturas',  widget: { type: 'security.home.kpi_card', props: { kpi: 'viaturas_ativas' } },  layout: { col_span: 4 } },
      { id: 'kpi_deteccoes', widget: { type: 'security.home.kpi_card', props: { kpi: 'detecoes_cctv' } },    layout: { col_span: 4 } },
      { id: 'kpi_streams',   widget: { type: 'security.home.kpi_card', props: { kpi: 'streams_cctv' } },     layout: { col_span: 4 } },

      // ── linha 2: mid widgets (5 × col_span 4 = 20) ──────────
      { id: 'mid_minimap',    widget: { type: 'security.mini_map' },                            layout: { col_span: 4, min_height: '460px' } },
      { id: 'mid_alertas',    widget: { type: 'alert_list', props: { limit: 6, status: 'pending' } }, layout: { col_span: 4, min_height: '460px' } },
      { id: 'mid_deteccoes',  widget: { type: 'security.alertas_destaque' },                    layout: { col_span: 4, min_height: '460px' } },
      { id: 'mid_contagem',   widget: { type: 'security.contagem_classe' },                     layout: { col_span: 4, min_height: '460px' } },
      { id: 'mid_cameras',    widget: { type: 'security.cameras_prioritarias' },                layout: { col_span: 4, min_height: '460px' } },

      // ── linha 3: linha do tempo ─────────────────────────────
      { id: 'timeline_full', widget: { type: 'security.home.timeline_row' },    layout: { col_span: 20, min_height: '340px' } },
    ],
  },
};
