/**
 * Sprint L7 — Handlebars engine puro (sem eval) — 15+ casos cobrindo cada
 * construct documentado em docs/research/foundry/slate/logic/handlebars.md.
 */
import { compile, lookup } from '@/lib/handlebars/engine';

describe('handlebars engine — compile()', () => {
  it('returns empty string for empty template', () => {
    expect(compile('', {})).toBe('');
  });

  it('passes through static text unchanged', () => {
    expect(compile('hello world', {})).toBe('hello world');
  });

  it('interpolates a simple variable', () => {
    expect(compile('Olá, {{name}}!', { name: 'Alice' })).toBe('Olá, Alice!');
  });

  it('escapes HTML in default mustache', () => {
    expect(compile('{{x}}', { x: '<b>hi</b>' })).toBe('&lt;b&gt;hi&lt;/b&gt;');
  });

  it('does NOT escape with triple-mustache', () => {
    expect(compile('{{{x}}}', { x: '<b>hi</b>' })).toBe('<b>hi</b>');
  });

  it('resolves nested paths with dots', () => {
    expect(compile('{{user.name}}', { user: { name: 'Bob' } })).toBe('Bob');
  });

  it('resolves array indexing with [i]', () => {
    expect(compile('{{items[1]}}', { items: ['a', 'b', 'c'] })).toBe('b');
  });

  it('returns empty string for missing var', () => {
    expect(compile('"{{missing}}"', {})).toBe('""');
  });

  it('serializes numbers and booleans', () => {
    expect(compile('{{a}}={{b}}', { a: 42, b: true })).toBe('42=true');
  });

  it('serializes objects as JSON', () => {
    const out = compile('{{x}}', { x: { a: 1 } });
    // Escape HTML default → quotes viram &quot;
    expect(out).toContain('a');
    expect(out).toContain('1');
  });

  it('renders {{#if}} branch when truthy', () => {
    expect(compile('{{#if ok}}YES{{/if}}', { ok: true })).toBe('YES');
  });

  it('skips {{#if}} branch when falsy', () => {
    expect(compile('{{#if ok}}YES{{/if}}', { ok: false })).toBe('');
  });

  it('renders else branch when condition is falsy', () => {
    expect(
      compile('{{#if ok}}A{{else}}B{{/if}}', { ok: false }),
    ).toBe('B');
  });

  it('iterates {{#each}} producing one block per item', () => {
    // Static `<`/`>` no template NÃO são escapados (são literais),
    // apenas o conteúdo de {{this}} passa pelo escapeHtml (e como `a`/`b`
    // não têm chars especiais, sai literal mesmo).
    expect(
      compile('-{{#each xs}}<{{this}}>{{/each}}', { xs: ['a', 'b'] }),
    ).toBe('-<a><b>');
  });

  it('inside #each, fields from item are accessible', () => {
    expect(
      compile(
        '{{#each users}}{{name}}={{role}};{{/each}}',
        { users: [{ name: 'a', role: 'admin' }, { name: 'b', role: 'guest' }] },
      ),
    ).toBe('a=admin;b=guest;');
  });

  it('handles empty arrays in #each (renders nothing)', () => {
    expect(compile('start{{#each xs}}X{{/each}}end', { xs: [] })).toBe('startend');
  });

  it('treats empty arrays as falsy in #if', () => {
    expect(compile('{{#if xs}}HAVE{{else}}NONE{{/if}}', { xs: [] })).toBe('NONE');
  });

  it('nests #if inside #each', () => {
    expect(
      compile(
        '{{#each xs}}{{#if v}}YES{{else}}NO{{/if}};{{/each}}',
        { xs: [{ v: true }, { v: false }, { v: 1 }] },
      ),
    ).toBe('YES;NO;YES;');
  });

  it('lookup() helper works standalone', () => {
    expect(lookup('a.b', { a: { b: 7 } })).toBe(7);
    expect(lookup('xs[2]', { xs: [10, 20, 30] })).toBe(30);
    expect(lookup('this', { a: 1 })).toEqual({ a: 1 });
    expect(lookup('missing.path', {})).toBeUndefined();
  });

  it('does NOT eval JavaScript expressions', () => {
    // Garantia de segurança: expressões JS NÃO são executadas.
    const out = compile('{{x}}', { x: 'alert("xss")' });
    // Texto sai literal (escapado), nada de execução.
    expect(out).toContain('alert');
    expect(out).toContain('xss');
  });
});
