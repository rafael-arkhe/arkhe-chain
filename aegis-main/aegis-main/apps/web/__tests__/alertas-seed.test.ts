/**
 * Seed de FALLBACK da rota /alertas (BACKLOG #6a — gestão/auditoria).
 *
 * O seed local espelha o layout do backend pra que a estrutura seja idêntica
 * quando o operador re-publicar a página pelo Workshop. Aqui garantimos que os
 * metric_card de GESTÃO (reconhecidos · escalados · MTTR) e o chart de volume
 * por severidade estão presentes — além dos pendentes que já existiam.
 *
 * Invariante crítica: o card de MTTR colore por LIMIAR vindo de
 * WorkshopVariable (`threshold_from`), NUNCA um número fixo no layout.
 */
import { ALERTAS_FALLBACK_SEED } from '@/lib/workshop/seeds/alertas';
import type { LayoutNode } from '@/lib/workshop/types';

function nodeById(): Record<string, LayoutNode> {
  const out: Record<string, LayoutNode> = {};
  for (const n of ALERTAS_FALLBACK_SEED.layout.root) out[n.id] = n;
  return out;
}

describe('ALERTAS_FALLBACK_SEED (gestão/auditoria)', () => {
  const nodes = nodeById();

  it('mantém alert_list + buscas_monitoradas (auto-buscam, sem evaluate)', () => {
    expect(nodes['alertas_lista'].widget.type).toBe('alert_list');
    expect(nodes['buscas_monitoradas'].widget.type).toBe('buscas_monitoradas');
    // app local não tem evaluate → variables vazio de propósito
    expect(ALERTAS_FALLBACK_SEED.variables).toEqual([]);
  });

  it('tem os metric_card de gestão (reconhecidos · escalados · MTTR) além de pendentes', () => {
    const expected: Record<string, string> = {
      alertas_kpi_pendentes: 'alertas_pendentes_n',
      alertas_kpi_reconhecidos: 'alertas_reconhecidos_n',
      alertas_kpi_escalados: 'alertas_escalados_n',
      alertas_kpi_mttr: 'alertas_mttr_ack_seg',
    };
    for (const [id, valueFrom] of Object.entries(expected)) {
      expect(nodes[id]).toBeDefined();
      expect(nodes[id].widget.type).toBe('metric_card');
      expect((nodes[id].widget.props as { value_from?: string }).value_from).toBe(valueFrom);
    }
  });

  it('card de MTTR usa SLA configurável (threshold_from), nunca limiar hardcoded', () => {
    const props = nodes['alertas_kpi_mttr'].widget.props as {
      format?: string;
      threshold_from?: string;
      threshold?: unknown;
    };
    expect(props.format).toBe('duration_s');
    expect(props.threshold_from).toBe('alertas_sla_ack_seg');
    expect(props.threshold).toBeUndefined();
  });

  it('tem o chart genérico de volume por severidade (chart_xy)', () => {
    const chart = nodes['alertas_chart_severidade'];
    expect(chart).toBeDefined();
    expect(chart.widget.type).toBe('chart_xy');
    const props = chart.widget.props as { source?: string; x_field?: string; y_field?: string };
    expect(props.source).toBe('alertas_volume_severidade');
    expect(props.x_field).toBe('label');
    expect(props.y_field).toBe('value');
  });
});
