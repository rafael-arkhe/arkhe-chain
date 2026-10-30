/**
 * #7 — formatador de detecção no display layer (locale ativo).
 * Classe canônica EN ("car") → label localizado; modalidade e "conf" do dict;
 * fallback honesto p/ classes/placas fora do dicionário.
 */
import { detectionClassLabel, detectionConf, detectionKindLabel } from '@/lib/i18n/detection';
import { DICT } from '@/lib/i18n/dict';

// `t` que resolve pelo dict pt-BR (espelha o useT sem provider).
const tPt = (k: string) => DICT[k as keyof typeof DICT]?.['pt-BR'] ?? k;
const tEn = (k: string) => DICT[k as keyof typeof DICT]?.['en-US'] ?? k;

describe('detectionClassLabel — classe localizada', () => {
  it('classe COCO conhecida vira label do locale (não fica em inglês cru)', () => {
    const pt = detectionClassLabel(tPt, 'car');
    // só exigimos que NÃO seja o cru "car" quando há entrada no dict
    if ('skillClasses.car' in DICT) {
      expect(pt).not.toBe('car');
      expect(pt).toBe(DICT['skillClasses.car' as keyof typeof DICT]['pt-BR']);
    }
  });
  it('classe/placa fora do dict cai no próprio valor (nunca vazio)', () => {
    expect(detectionClassLabel(tPt, 'ABC1D23')).toBe('ABC1D23');
    expect(detectionClassLabel(tPt, 'classe_inexistente_xyz')).toBe('classe_inexistente_xyz');
  });
  it('vazio → vazio (caller decide placeholder)', () => {
    expect(detectionClassLabel(tPt, '')).toBe('');
  });
});

describe('detectionKindLabel — modalidade do dict', () => {
  it('object/lpr/face localizados (pt diferente de en p/ placa/rosto)', () => {
    expect(detectionKindLabel(tPt, 'lpr')).toBe('PLACA');
    expect(detectionKindLabel(tEn, 'lpr')).toBe('LPR');
    expect(detectionKindLabel(tPt, 'face')).toBe('ROSTO');
    expect(detectionKindLabel(tPt, 'object')).toBe('OBJ');
  });
  it('kind desconhecido → code em maiúsculas (fallback)', () => {
    expect(detectionKindLabel(tPt, 'sensor')).toBe('SENSOR');
  });
});

describe('detectionConf — confiança localizada', () => {
  it('monta "conf NN%" com o rótulo do dict', () => {
    expect(detectionConf(tPt, 96)).toBe('conf 96%');
  });
});
