/**
 * F6 — TDD do esqueleto contextual da IDE do transformer.
 */
import { transformerSkeleton, transformerSkeletonBatch } from '../components/dev/transformer-skeleton';

describe('transformerSkeleton', () => {
  const props = [
    { key: 'username', type: 'text', label: 'Usuário' },
    { key: 'bio', type: 'text' },
    { key: 'seguidores', type: 'number' },
  ];

  it('cita o tipo de entrada e suas propriedades reais', () => {
    const code = transformerSkeleton('PerfilInstagram', props, 'contexto_gerado');
    expect(code).toContain('Transformador de "PerfilInstagram"');
    expect(code).toContain('- username (text) — Usuário');
    expect(code).toContain('- seguidores (number)');
    // acesso pré-escrito às propriedades
    expect(code).toContain('username = props.get("username")');
  });

  it('escreve o contrato de saída na propriedade do nó', () => {
    const code = transformerSkeleton('PerfilInstagram', props, 'contexto_gerado');
    expect(code).toContain('na propriedade "contexto_gerado"');
    expect(code).toContain('return {"contexto_gerado": contexto_gerado}');
  });

  it('é robusto sem propriedades e sem outputProperty', () => {
    const code = transformerSkeleton('X', [], '');
    expect(code).toContain('Transformador de "X"');
    expect(code).toContain('ainda não tem propriedades declaradas');
    expect(code).toContain('return {"resultado": resultado}'); // fallback
    expect(code).toContain('def transform(obj):');
  });
});

describe('transformerSkeletonBatch (O3c — nó código do pipeline, contrato BATCH)', () => {
  it('é AUTO-CONTIDO: lê input.json {rows} e IMPRIME {rows} (o sandbox roda o source cru)', () => {
    const code = transformerSkeletonBatch('Empresa', [{ key: 'cnpj', type: 'text' }]);
    // O contrato de _apply_code_step: a Function lê input.json e imprime {"rows":[...]}.
    expect(code).toContain('input.json');
    expect(code).toContain('json.load');
    expect(code).toContain('"rows"');
    expect(code).toContain('print(json.dumps({"rows"');
    // BATCH (lista de linhas), nunca per-object.
    expect(code).toContain('rows = data.get("rows"');
    expect(code).not.toContain('def transform(obj)'); // não é o esqueleto per-object
  });

  it('cita as colunas reais da entrada; robusto sem propriedades', () => {
    expect(transformerSkeletonBatch('Empresa', [{ key: 'cnpj' }, { key: 'uf' }])).toContain('cnpj');
    const empty = transformerSkeletonBatch('X', []);
    expect(empty).toContain('input.json');
    expect(empty).toContain('print(json.dumps({"rows"'); // continua válido/runnable
  });
});
