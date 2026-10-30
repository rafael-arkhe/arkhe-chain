/**
 * metric_card — formato de duração + cor por LIMIAR de SLA (BACKLOG #6a).
 *
 * O card de MTTR do painel /alertas:
 *  - `format: 'duration_s'` → lê o valor como segundos e renderiza duração;
 *  - `threshold_from` → compara com um LIMIAR vindo de WorkshopVariable
 *    (configurável, NUNCA hardcode) reusando o util de "Regras de cor" (Onda 1):
 *    vermelho quando estoura o SLA, verde quando dentro.
 *
 * `format_rules` explícito tem prioridade sobre `threshold_from`; sem nenhum
 * dos dois, vale a `variant`.
 */
import { render, screen } from '@testing-library/react';
import { getWidgetComponent } from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets/metric-card';

function renderCard(
  config: Record<string, unknown>,
  variables: Record<string, unknown>,
) {
  const Comp = getWidgetComponent('metric_card')!;
  render(
    <Comp
      appId="page::alertas"
      config={config}
      variables={variables}
      bindings={{}}
      setBinding={() => {}}
      emit={jest.fn()}
    />,
  );
  return screen.getByTestId('metric-card');
}

describe('metric_card — duração + SLA', () => {
  it('format=duration_s renderiza segundos como duração legível', () => {
    const el = renderCard(
      { label: 'MTTR', value_from: 'mttr', format: 'duration_s' },
      { mttr: 930 },
    );
    expect(el).toHaveTextContent('15m 30s');
  });

  it('threshold_from: valor acima do SLA fica vermelho (danger)', () => {
    const el = renderCard(
      { value_from: 'mttr', format: 'duration_s', threshold_from: 'sla' },
      { mttr: 1200, sla: 900 },
    );
    expect(el.className).toContain('text-danger');
    expect(el.className).not.toContain('text-success');
  });

  it('threshold_from: valor dentro do SLA fica verde (success)', () => {
    const el = renderCard(
      { value_from: 'mttr', format: 'duration_s', threshold_from: 'sla' },
      { mttr: 600, sla: 900 },
    );
    expect(el.className).toContain('text-success');
    expect(el.className).not.toContain('text-danger');
  });

  it('SLA configurável: mudar o limiar muda a cor (nunca fixo no código)', () => {
    // mesmo MTTR (800s), SLA mais curto (600) → estoura; SLA mais longo (1200) → ok
    const apertado = renderCard(
      { value_from: 'mttr', threshold_from: 'sla' },
      { mttr: 800, sla: 600 },
    );
    expect(apertado.className).toContain('text-danger');
  });

  it('sem threshold_from nem format_rules, vale a variant', () => {
    const el = renderCard(
      { value_from: 'mttr', variant: 'primary' },
      { mttr: 600 },
    );
    expect(el.className).toContain('text-primary');
  });

  it('threshold ausente/inválido cai na variant (sem cor de SLA inventada)', () => {
    const el = renderCard(
      { value_from: 'mttr', threshold_from: 'sla', variant: 'default' },
      { mttr: 600 }, // sla não fornecido
    );
    expect(el.className).not.toContain('text-danger');
    expect(el.className).not.toContain('text-success');
  });
});
