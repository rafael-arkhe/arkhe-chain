/**
 * Wave F.2 (2026-05-23) — VariableType slate-parity catálogo.
 *
 * Garante: o tipo `VariableType` em `lib/workshop/types.ts` inclui
 * `ObjectReference` e `Json` (extensão R2 slate parity MVP). Como o
 * tipo é puramente compile-time, o test verifica que o uso explícito
 * desses valores no shape `WorkshopVariable` compila e é serializável.
 */
import type { WorkshopVariable } from '@/lib/workshop/types';

describe('VariableType · Wave F.2 — slate-parity', () => {
  it('aceita ObjectReference como valor de type', () => {
    const v: WorkshopVariable = {
      id: 'v1',
      external_id: 'ref_pessoa',
      label: 'Pessoa selecionada',
      type: 'ObjectReference',
      kind: 'static',
      recompute_mode: 'auto',
      spec: { default_value: null } as never,
    };
    expect(v.type).toBe('ObjectReference');
    expect(JSON.parse(JSON.stringify(v)).type).toBe('ObjectReference');
  });

  it('aceita Json como valor de type', () => {
    const v: WorkshopVariable = {
      id: 'v2',
      external_id: 'payload_livre',
      label: 'Payload livre',
      type: 'Json',
      kind: 'static',
      recompute_mode: 'auto',
      spec: { default_value: { foo: 'bar' } } as never,
    };
    expect(v.type).toBe('Json');
    expect(JSON.parse(JSON.stringify(v)).type).toBe('Json');
  });

  it('os 13 tipos slate-parity são todos serializáveis sem erro', () => {
    const types = [
      'String',
      'Numeric',
      'Boolean',
      'Date',
      'ObjectSet',
      'ObjectSetFilter',
      'Struct',
      'Series',
      'Events',
      'GeoPoints',
      'Calendar',
      'ObjectReference',
      'Json',
    ] as const;
    for (const t of types) {
      const v: WorkshopVariable = {
        id: `v_${t}`,
        external_id: `var_${t.toLowerCase()}`,
        label: t,
        type: t,
        kind: 'static',
        recompute_mode: 'auto',
      };
      const json = JSON.stringify(v);
      expect(JSON.parse(json).type).toBe(t);
    }
    expect(types.length).toBe(13);
  });
});
