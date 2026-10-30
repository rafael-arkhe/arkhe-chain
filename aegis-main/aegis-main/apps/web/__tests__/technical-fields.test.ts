/**
 * Heurística compartilhada campo técnico vs negócio (lib/ontology/technical-fields).
 * Reusada pela ficha (#6) e pelos widgets de detecção (#7). O teste trava o
 * contrato: metadados de pipeline = técnico; campos operacionais = negócio.
 */
import { isTechnicalField, TECHNICAL_FIELD_RE } from '@/lib/ontology/technical-fields';

describe('isTechnicalField', () => {
  it('marca metadados de pipeline como técnicos', () => {
    for (const k of [
      'id',
      'kind',
      'source',
      'device',
      'cuda',
      'gpu',
      'driver',
      'frame_index',
      'sha256',
      'hash',
      'embedding',
      'vector',
      'node_type',
      'version',
      'created_at',
      'updated_at',
      'created_by',
    ]) {
      expect(isTechnicalField(k)).toBe(true);
    }
  });

  it('NÃO marca campos operacionais/negócio', () => {
    for (const k of ['nome', 'classe', 'placa', 'cidade', 'confianca', 'endereco', 'cpf', 'descricao']) {
      expect(isTechnicalField(k)).toBe(false);
    }
  });

  it('REGRESSÃO #6: first_seen_at/last_seen_at são NEGÓCIO na ficha (não técnico)', () => {
    // a ficha mostra LAST/FIRST SEEN AT como dado de negócio formatado —
    // se entrarem no técnico, regridem a Fatia 1 do #6.
    expect(isTechnicalField('first_seen_at')).toBe(false);
    expect(isTechnicalField('last_seen_at')).toBe(false);
  });

  it('é case-insensitive e casa nas bordas (^|_ … _|$)', () => {
    expect(isTechnicalField('DEVICE')).toBe(true);
    expect(isTechnicalField('frame_index')).toBe(true);
    // substring no meio de outra palavra não casa (evita falso positivo)
    expect(isTechnicalField('idade')).toBe(false); // "id" não é a palavra toda
    expect(TECHNICAL_FIELD_RE.test('sourcecode')).toBe(false);
  });
});
