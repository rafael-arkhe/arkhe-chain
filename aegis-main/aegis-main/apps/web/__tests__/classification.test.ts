import {
  CLASSIFICATION_BG,
  CLASSIFICATION_LABEL,
  CLASSIFICATION_RANK,
  CLASSIFICATION_TEXT,
  maxLevel,
} from '@/lib/classification';

describe('classification', () => {
  it('mantém a ordem hierárquica correta', () => {
    expect(CLASSIFICATION_RANK.publico).toBe(0);
    expect(CLASSIFICATION_RANK.restrito).toBe(1);
    expect(CLASSIFICATION_RANK.confidencial).toBe(2);
    expect(CLASSIFICATION_RANK.sigiloso).toBe(3);
  });

  it('exibe rótulos em pt-BR maiúsculos', () => {
    expect(CLASSIFICATION_LABEL.publico).toBe('PÚBLICO');
    expect(CLASSIFICATION_LABEL.restrito).toBe('RESTRITO');
    expect(CLASSIFICATION_LABEL.confidencial).toBe('CONFIDENCIAL');
    expect(CLASSIFICATION_LABEL.sigiloso).toBe('SIGILOSO');
  });

  it('mapeia cores de fundo distintas por nível', () => {
    const cores = Object.values(CLASSIFICATION_BG);
    expect(new Set(cores).size).toBe(4);
  });

  it('aplica texto preto apenas em amarelo restrito', () => {
    expect(CLASSIFICATION_TEXT.restrito).toBe('text-black');
    expect(CLASSIFICATION_TEXT.publico).toBe('text-white');
    expect(CLASSIFICATION_TEXT.confidencial).toBe('text-white');
    expect(CLASSIFICATION_TEXT.sigiloso).toBe('text-white');
  });

  describe('maxLevel', () => {
    it('retorna público para lista vazia', () => {
      expect(maxLevel([])).toBe('publico');
    });
    it('retorna o maior nível de uma lista', () => {
      expect(maxLevel(['publico', 'restrito', 'confidencial'])).toBe('confidencial');
      expect(maxLevel(['restrito', 'sigiloso'])).toBe('sigiloso');
      expect(maxLevel(['publico'])).toBe('publico');
    });
  });
});
