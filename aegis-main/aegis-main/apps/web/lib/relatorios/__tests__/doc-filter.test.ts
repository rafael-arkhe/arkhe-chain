import { filterDocs, orderDocs, hasActiveFilter } from '@/lib/relatorios/doc-filter';
import type { NotepadDoc } from '@/lib/api';

const doc = (over: Partial<NotepadDoc>): NotepadDoc =>
  ({
    id: 'x', slug: 'x', title: 'X', body_md: '', sections: [], markings: [],
    classification_level: 'restrito', version: 1, pinned: false, signed: false,
    signed_hash: null, signed_at: null, signed_by: null, project_id: null,
    created_at: null, updated_at: null, ...over,
  }) as NotepadDoc;

const A = doc({ id: 'a', title: 'Alvo Norte', slug: 'alvo-norte', classification_level: 'sigiloso', signed: true, markings: ['PII'] });
const B = doc({ id: 'b', title: 'Briefing Sul', slug: 'brief-sul', classification_level: 'restrito', signed: false, pinned: true });
const C = doc({ id: 'c', title: 'Censo', slug: 'censo', classification_level: 'restrito', signed: false, markings: ['LGPD'] });
const ALL = [A, B, C];

describe('filterDocs', () => {
  it('vazio → todos', () => {
    expect(filterDocs(ALL, {}).map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });
  it('busca por título', () => {
    expect(filterDocs(ALL, { query: 'sul' }).map((d) => d.id)).toEqual(['b']);
  });
  it('busca casa marcação e classificação também', () => {
    expect(filterDocs(ALL, { query: 'pii' }).map((d) => d.id)).toEqual(['a']);
    expect(filterDocs(ALL, { query: 'sigiloso' }).map((d) => d.id)).toEqual(['a']);
    expect(filterDocs(ALL, { query: 'lgpd' }).map((d) => d.id)).toEqual(['c']);
  });
  it('filtra por classificação', () => {
    expect(filterDocs(ALL, { classification: 'restrito' }).map((d) => d.id)).toEqual(['b', 'c']);
  });
  it('filtra por estado selado / rascunho', () => {
    expect(filterDocs(ALL, { state: 'signed' }).map((d) => d.id)).toEqual(['a']);
    expect(filterDocs(ALL, { state: 'draft' }).map((d) => d.id)).toEqual(['b', 'c']);
  });
  it('combina filtros (E lógico)', () => {
    expect(filterDocs(ALL, { classification: 'restrito', state: 'draft', query: 'cen' }).map((d) => d.id)).toEqual(['c']);
  });
});

describe('orderDocs', () => {
  it('fixados primeiro, depois alfabético', () => {
    expect(orderDocs(ALL).map((d) => d.id)).toEqual(['b', 'a', 'c']); // B pinned; A,C alpha
  });
});

describe('hasActiveFilter', () => {
  it('detecta filtro ativo', () => {
    expect(hasActiveFilter({})).toBe(false);
    expect(hasActiveFilter({ query: '  ' })).toBe(false);
    expect(hasActiveFilter({ query: 'x' })).toBe(true);
    expect(hasActiveFilter({ classification: 'restrito' })).toBe(true);
    expect(hasActiveFilter({ state: 'signed' })).toBe(true);
  });
});
