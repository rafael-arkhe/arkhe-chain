/**
 * #7 — campos CONSULTÁVEIS não podem ser input de texto cru
 * (feedback_no_manual_technical_input). Os seletores de campo que apontam para
 * properties de Object Type usam o picker 'property' (resolve do contrato do
 * tipo via typeFrom='source'); a ação do botão usa o picker 'action-type'.
 */
import '@/components/workshop/widgets'; // side-effect: popula o REGISTRY
import { getWidgetMeta, type PropFieldDef } from '@/components/workshop/WorkshopV2Renderer';

function fieldKind(type: string, name: string): { field?: string; typeFrom?: string } {
  const schema = (getWidgetMeta(type)?.config_schema ?? []) as PropFieldDef[];
  const f = schema.find((x) => x.name === name);
  return { field: f?.field, typeFrom: f?.typeFrom };
}

describe('#7 — campos de dado usam picker, não input cru', () => {
  it.each([
    ['heatmap', 'row_field'],
    ['heatmap', 'col_field'],
    ['heatmap', 'value_field'],
    ['slate_chart', 'x_field'],
  ])('%s.%s é property + typeFrom=source', (type, name) => {
    const { field, typeFrom } = fieldKind(type, name);
    expect(field).toBe('property');
    expect(typeFrom).toBe('source');
  });

  it('object_action_button.action_id usa o picker de ação (action-type), não string', () => {
    expect(fieldKind('object_action_button', 'action_id').field).toBe('action-type');
  });
});
