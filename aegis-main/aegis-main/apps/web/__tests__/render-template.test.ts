/**
 * F8.2a — espelho TS do _render_template do engine (preview inline do NDV).
 * A semântica TEM que bater com o backend (transforms.py): ausente/null → '',
 * não-string intocado, sem expressão além de $json.campo.
 */
import { hasTemplate, renderTemplate } from '@/lib/pipeline/render-template';

describe('renderTemplate (espelho do engine)', () => {
  const row = { g: 'G1', a: 7, 'ns.key': 'x', vazio: null };

  it('substitui {{ $json.campo }} pelo valor da linha (stringificado)', () => {
    expect(renderTemplate('grupo {{ $json.g }}!', row)).toBe('grupo G1!');
    expect(renderTemplate('{{ $json.a }}', row)).toBe('7');
  });

  it('espaçamento flexível dentro das chaves', () => {
    expect(renderTemplate('{{$json.g}}', row)).toBe('G1');
    expect(renderTemplate('{{   $json.g   }}', row)).toBe('G1');
  });

  it('A9: resolve $now/$today/$itemIndex/$execution/$workflow/$prevNode do ctx', () => {
    const ctx = {
      now: '2026-07-04T12:00:00+00:00', today: '2026-07-04',
      executionId: 'exec-1', workflowId: 'wf-1', workflowName: 'Fluxo X', prevNode: 'src',
    };
    expect(renderTemplate('{{ $now }}', row, ctx)).toBe('2026-07-04T12:00:00+00:00');
    expect(renderTemplate('{{ $today }}', row, ctx)).toBe('2026-07-04');
    expect(renderTemplate('{{ $itemIndex }}', row, ctx, 3)).toBe('3');
    expect(renderTemplate('{{ $execution.id }}', row, ctx)).toBe('exec-1');
    expect(renderTemplate('{{ $workflow.id }}', row, ctx)).toBe('wf-1');
    expect(renderTemplate('{{ $workflow.name }}', row, ctx)).toBe('Fluxo X');
    expect(renderTemplate('{{ $prevNode }}', row, ctx)).toBe('src');
    // $json continua funcionando lado a lado
    expect(renderTemplate('{{ $json.g }} @ {{ $today }}', row, ctx)).toBe('G1 @ 2026-07-04');
    // token desconhecido → vazio
    expect(renderTemplate('{{ $foo }}', row, ctx)).toBe('');
  });

  it('A9: hasTemplate detecta as novas famílias de token', () => {
    expect(hasTemplate('{{ $now }}')).toBe(true);
    expect(hasTemplate('{{ $execution.id }}')).toBe(true);
  });

  it('campo ausente ou null → string vazia (igual ao backend)', () => {
    expect(renderTemplate('[{{ $json.nao_existe }}]', row)).toBe('[]');
    expect(renderTemplate('[{{ $json.vazio }}]', row)).toBe('[]');
  });

  it('múltiplos tokens na mesma string', () => {
    expect(renderTemplate('{{ $json.g }}-{{ $json.a }}', row)).toBe('G1-7');
  });

  it('chaves com ponto/hífen são aceitas (mesmo charset do backend)', () => {
    expect(renderTemplate('{{ $json.ns.key }}', row)).toBe('x');
  });

  it('não-string passa intocado; texto sem token idem', () => {
    expect(renderTemplate(42 as unknown, row)).toBe(42);
    expect(renderTemplate('sem token', row)).toBe('sem token');
  });

  it('hasTemplate detecta token (e é estável em chamadas repetidas — regex /g)', () => {
    expect(hasTemplate('{{ $json.g }}')).toBe(true);
    expect(hasTemplate('{{ $json.g }}')).toBe(true); // lastIndex reset
    expect(hasTemplate('nada')).toBe(false);
    expect(hasTemplate(7)).toBe(false);
    // token de outra sintaxe (handlebars widget) NÃO conta
    expect(hasTemplate('{{ nome }}')).toBe(false);
  });
});
