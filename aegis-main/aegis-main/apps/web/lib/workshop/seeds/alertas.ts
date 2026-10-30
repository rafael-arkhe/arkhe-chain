import type { WorkshopApp } from '@/lib/workshop/types';

/**
 * Seed local de FALLBACK da rota /alertas (2026-06-12; gestão #6a 2026-06-27).
 *
 * A rota resolve a página registrada `alertas` (registered_pages do
 * tenant — seed completo com KPIs por severidade + gestão/auditoria vive
 * no backend, ontology-module `pages.py::_DEFAULT_PAGE_LAYOUTS`). Este
 * seed local só entra quando a página registrada SUMIU (operador deletou /
 * backend sem o slug): renderiza o `alert_list` REAL (API do inbox) +
 * `buscas_monitoradas`, que se auto-buscam.
 *
 * Os metric_card de gestão e o chart de severidade ESPELHAM o layout do
 * backend (mesmos `value_from`/`source`) pra que a estrutura seja idêntica
 * quando o operador re-publicar a página pelo Workshop. Como o app local
 * (`seed.*`) NÃO tem evaluate no backend, aqui `variables` fica vazio de
 * propósito (adicionar variáveis dispararia /evaluate num id não-persistido
 * → erro) — nesse fallback degradado os KPIs mostram "—" e o gráfico cai no
 * estado vazio honesto. O dado VIVO vem sempre da página registrada.
 */
export const ALERTAS_FALLBACK_SEED: WorkshopApp = {
  id: 'seed.security.alertas',
  external_id: 'seed.security.alertas',
  display: 'Alertas',
  description: 'Caixa unificada de alertas — fallback do seed registrado.',
  schema_version: 2,
  variables: [],
  layout: {
    columns: 20,
    root: [
      // ── Linha de gestão/auditoria — pendentes · reconhecidos · escalados · MTTR.
      {
        id: 'alertas_kpi_pendentes',
        widget: {
          type: 'metric_card',
          props: { label: 'Pendentes', value_from: 'alertas_pendentes_n', variant: 'primary' },
        },
        layout: { col_span: 5 },
      },
      {
        id: 'alertas_kpi_reconhecidos',
        widget: {
          type: 'metric_card',
          props: { label: 'Reconhecidos', value_from: 'alertas_reconhecidos_n', variant: 'success' },
        },
        layout: { col_span: 5 },
      },
      {
        id: 'alertas_kpi_escalados',
        widget: {
          type: 'metric_card',
          props: { label: 'Escalados', value_from: 'alertas_escalados_n', variant: 'warning' },
        },
        layout: { col_span: 5 },
      },
      {
        id: 'alertas_kpi_mttr',
        widget: {
          type: 'metric_card',
          props: {
            label: 'Tempo médio até reconhecimento',
            value_from: 'alertas_mttr_ack_seg',
            // Duração + cor por LIMIAR de SLA configurável (WorkshopVariable,
            // nunca hardcode): vermelho quando o MTTR estoura o SLA.
            format: 'duration_s',
            threshold_from: 'alertas_sla_ack_seg',
          },
        },
        layout: { col_span: 5 },
      },
      // ── Volume por severidade (chart genérico chart_xy sobre os pendentes).
      {
        id: 'alertas_chart_severidade',
        widget: {
          type: 'chart_xy',
          props: {
            title: 'Volume por severidade',
            source: 'alertas_volume_severidade',
            x_field: 'label',
            y_field: 'value',
            kind: 'bar',
            height: 220,
          },
        },
        layout: { col_span: 20, min_height: '280px' },
      },
      {
        id: 'buscas_monitoradas',
        widget: { type: 'buscas_monitoradas', props: {} },
        layout: { col_span: 20, min_height: '220px' },
      },
      {
        id: 'alertas_lista',
        widget: { type: 'alert_list', props: { limit: 50, mostrar_origem: true } },
        layout: { col_span: 20, min_height: '420px' },
      },
    ],
  },
};
