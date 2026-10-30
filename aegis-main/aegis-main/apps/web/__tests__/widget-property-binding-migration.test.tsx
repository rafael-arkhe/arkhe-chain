/**
 * Front (b) da propagação OSDK (2026-05-30) — os widgets que bindavam property
 * em TEXTO LIVRE ('string') ou JSON cru passam a usar pickers dirigidos pelo
 * CONTRATO do Object Type:
 *   - single/multi property  → FieldKind 'property' (typeFrom resolve o kind do
 *     campo irmão `source`);
 *   - listas estruturadas     → FieldKind 'object-columns' / 'object-groups'
 *     (builder visual com PropertyFieldPicker embutido por linha).
 *
 * Fecha a adoção: só `object_card` consumia o contrato (1 de N). Agora
 * timeline / property_list / object_table / object_view também — fim do
 * "bind no escuro" e do JSON manual (memory feedback_no_manual_technical_input).
 *
 * Importar cada módulo de widget registra o meta no registry global; lemos o
 * config_schema por `getWidgetMeta`.
 */
import { getWidgetMeta, type PropFieldDef } from '@/components/workshop/WorkshopV2Renderer';

// Side-effect imports: registram os widgets no registry.
import '@/components/workshop/widgets/timeline';
import '@/components/workshop/widgets/property-list';
import '@/components/workshop/widgets/object-table';
import '@/components/workshop/widgets/object-view';
import '@/components/workshop/widgets/object-list';
import '@/components/workshop/widgets/time-axis';
// Guard de não-migração: registram os widgets de agregação.
import '@/components/workshop/widgets/chart-xy';
import '@/components/workshop/widgets/pivot-table';

function fieldOf(type: string, name: string): PropFieldDef {
  const schema = getWidgetMeta(type)?.config_schema ?? [];
  const f = schema.find((s) => s.name === name);
  if (!f) throw new Error(`config_schema de ${type} não tem campo ${name}`);
  return f;
}

describe('timeline — property bindings dirigidos pelo contrato', () => {
  it('source vira variable-ref (escolhe o dado, não digita o nome)', () => {
    expect(fieldOf('timeline', 'source').field).toBe('variable-ref');
  });

  it.each(['timestamp_key', 'label_key', 'kind_key', 'actor_key'])(
    '%s vira property single resolvendo o tipo de source',
    (name) => {
      const f = fieldOf('timeline', name);
      expect(f.field).toBe('property');
      expect(f.typeFrom).toBe('source');
      expect(f.multi).toBeFalsy();
    },
  );
});

describe('property_list — keys via contrato', () => {
  it('keys vira property multi resolvendo o tipo de source', () => {
    const f = fieldOf('property_list', 'keys');
    expect(f.field).toBe('property');
    expect(f.multi).toBe(true);
    expect(f.typeFrom).toBe('source');
  });
});

describe('object_table — columns via builder estruturado (sem JSON cru)', () => {
  it.each(['object_table', 'object_table_v2'])('%s.columns vira object-columns', (type) => {
    const f = fieldOf(type, 'columns');
    expect(f.field).toBe('object-columns');
    expect(f.typeFrom).toBe('source');
  });
});

describe('object_view — groups via builder estruturado (sem JSON cru)', () => {
  it('groups vira object-groups resolvendo o tipo de source', () => {
    const f = fieldOf('object_view', 'groups');
    expect(f.field).toBe('object-groups');
    expect(f.typeFrom).toBe('source');
  });
});

describe('object_table — filter_field via contrato', () => {
  it.each(['object_table', 'object_table_v2'])('%s.filter_field vira property de source', (type) => {
    const f = fieldOf(type, 'filter_field');
    expect(f.field).toBe('property');
    expect(f.typeFrom).toBe('source');
  });
});

describe('object_list — primary/secondary_field via contrato', () => {
  it.each(['primary_field', 'secondary_field'])('%s vira property single de source', (name) => {
    const f = fieldOf('object_list', name);
    expect(f.field).toBe('property');
    expect(f.typeFrom).toBe('source');
    expect(f.multi).toBeFalsy();
  });
});

describe('time_axis — timestamp/label key via contrato', () => {
  it.each(['timestamp_key', 'label_key'])('%s vira property single de source', (name) => {
    const f = fieldOf('time_axis', name);
    expect(f.field).toBe('property');
    expect(f.typeFrom).toBe('source');
  });
});

/**
 * Guarda anti-regressão semântica: os widgets de AGREGAÇÃO (chart/pivot/slate)
 * NÃO foram migrados — seus *_field são colunas de saída da agregação, não
 * properties de Object Type. 'property' (contrato do tipo) não se aplica.
 */
describe('widgets de agregação NÃO migram (colunas de saída ≠ property)', () => {
  it.each([
    ['chart_xy', 'x_field'],
    ['chart_xy', 'y_field'],
    ['pivot_table', 'row_field'],
    ['pivot_table', 'value_field'],
  ])('%s.%s permanece string', (type, name) => {
    expect(fieldOf(type, name).field).toBe('string');
  });
});
