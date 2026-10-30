/**
 * Wave 2 — nó REATIVO (declarativo): trava o contrato do registro. 1 nó, method-driven;
 * cada método (cerca/limiar/alerta/notificar) revela seus campos via displayOptions.
 */
import { NODE_REGISTRY } from '@/lib/pipeline/node-registry';
import { shouldDisplayField, defaultsFromFields, type NodeFieldSpec } from '@/lib/pipeline/node-fields';
import { defaultNodeConfig } from '@/lib/pipeline/node-defaults';

const spec = NODE_REGISTRY.reactive;

function field(key: string): NodeFieldSpec {
  const f = spec.fields.find((x) => x.key === key);
  if (!f) throw new Error(`campo ausente: ${key}`);
  return f;
}

describe('reactive — registro declarativo', () => {
  it('existe com container pb-cfg-reactive e os 4 métodos', () => {
    expect(spec).toBeTruthy();
    expect(spec.container).toBe('pb-cfg-reactive');
    expect(field('method').options?.map((o) => o.value)).toEqual([
      'geofence_eval', 'threshold_alarm', 'emit_alert', 'notify',
    ]);
  });

  it('default do nó nasce em geofence_eval, per_row, saída reactive_output', () => {
    const c = defaultNodeConfig('reactive');
    expect(c.method).toBe('geofence_eval');
    expect(c.mode).toBe('per_row');
    expect(c.output).toBe('reactive_output');
  });

  it('displayOptions: cada método revela SÓ os seus campos', () => {
    const byMethod: Record<string, string[]> = {
      geofence_eval: ['lat_field', 'lng_field'],
      threshold_alarm: ['node_id', 'property_name', 'value_field'],
      emit_alert: ['alert_kind', 'severity', 'title'],
      notify: ['channel', 'to', 'text'],
    };
    const allSpecific = Object.values(byMethod).flat();
    for (const [method, keys] of Object.entries(byMethod)) {
      for (const k of keys) expect(shouldDisplayField(field(k), { method })).toBe(true);
      // campos de OUTROS métodos ficam escondidos
      for (const other of allSpecific.filter((k) => !keys.includes(k))) {
        expect(shouldDisplayField(field(other), { method })).toBe(false);
      }
      // comuns sempre visíveis
      for (const k of ['method', 'mode', 'output', 'max_rows']) {
        expect(shouldDisplayField(field(k), { method })).toBe(true);
      }
    }
  });

  it('emit_alert tem as 4 severidades; notify tem os 3 canais', () => {
    expect(field('severity').options?.map((o) => o.value)).toEqual(['low', 'medium', 'high', 'critical']);
    expect(field('channel').options?.map((o) => o.value)).toEqual(['log', 'webhook', 'whatsapp']);
  });

  it('defaultsFromFields cobre severity=medium e channel=log', () => {
    const d = defaultsFromFields(spec.fields);
    expect(d.severity).toBe('medium');
    expect(d.channel).toBe('log');
  });
});
