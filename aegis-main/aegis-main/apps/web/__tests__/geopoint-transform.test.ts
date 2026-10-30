/**
 * Wave 2 — transform geometry→geopoint (declarativo): trava o contrato do registro.
 * Edita config.args.* (transform-op, como crypto/html); campos input(coluna)/output.
 */
import { TRANSFORM_REGISTRY } from '@/lib/pipeline/node-registry';
import { defaultArgsForTransform } from '@/lib/pipeline/node-defaults';

describe('geopoint — transform declarativo', () => {
  it('existe no TRANSFORM_REGISTRY com container pb-cfg-geopoint', () => {
    const spec = TRANSFORM_REGISTRY.geopoint;
    expect(spec).toBeTruthy();
    expect(spec.container).toBe('pb-cfg-geopoint');
    const keys = spec.fields.map((f) => f.key);
    expect(keys).toEqual(['input', 'output']);
    expect(spec.fields.find((f) => f.key === 'input')?.type).toBe('column');
  });

  it('defaultArgsForTransform nasce input=geometry, output=geopoint (contrato do backend)', () => {
    expect(defaultArgsForTransform('geopoint')).toEqual({ input: 'geometry', output: 'geopoint' });
  });
});
