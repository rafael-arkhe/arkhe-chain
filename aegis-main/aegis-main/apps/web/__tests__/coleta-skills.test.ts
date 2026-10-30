import {
  readColetaSkill,
  readColetaSkills,
  writeColetaSkillsConfig,
  addColetaSkill,
  removeColetaSkill,
  setColetaSkillParam,
  type ColetaSkill,
} from '@/components/solution-designer/coleta-skills';

describe('readColetaSkill (singular legado)', () => {
  it('lê coleta_skill_key + coleta_params', () => {
    expect(
      readColetaSkill({ coleta_skill_key: 'social.instagram', coleta_params: { query: '#x' } }),
    ).toEqual({ skill_key: 'social.instagram', params: { query: '#x' } });
  });
  it('sem skill_key → null', () => {
    expect(readColetaSkill({ coleta_params: { a: 1 } })).toBeNull();
    expect(readColetaSkill(undefined)).toBeNull();
  });
  it('params ausente → {}', () => {
    expect(readColetaSkill({ coleta_skill_key: 'x' })).toEqual({ skill_key: 'x', params: {} });
  });
});

describe('readColetaSkills', () => {
  it('array canônico', () => {
    expect(
      readColetaSkills({
        coleta_skills: [
          { skill_key: 'social.instagram', params: { query: '#x' } },
          { skill_key: 'osint.extrair_posts', params: {} },
        ],
      }),
    ).toEqual([
      { skill_key: 'social.instagram', params: { query: '#x' } },
      { skill_key: 'osint.extrair_posts', params: {} },
    ]);
  });

  it('retrocompat: singular legado vira array de 1', () => {
    expect(
      readColetaSkills({ coleta_skill_key: 'social.instagram', coleta_params: { query: '#x' } }),
    ).toEqual([{ skill_key: 'social.instagram', params: { query: '#x' } }]);
  });

  it('dedupe por skill_key (1ª vence) + descarta lixo', () => {
    expect(
      readColetaSkills({
        coleta_skills: [
          { skill_key: 'a', params: { v: 1 } },
          null,
          { skill_key: '' },
          { skill_key: 'a', params: { v: 2 } },
          { skill_key: 'b', params: {} },
        ],
      }),
    ).toEqual([
      { skill_key: 'a', params: { v: 1 } },
      { skill_key: 'b', params: {} },
    ]);
  });

  it('vazio/sem nada → []', () => {
    expect(readColetaSkills({})).toEqual([]);
    expect(readColetaSkills(undefined)).toEqual([]);
  });
});

describe('writeColetaSkillsConfig', () => {
  it('grava coleta_skills e deleta o singular legado', () => {
    const out = writeColetaSkillsConfig(
      { coleta_skill_key: 'old', coleta_params: { z: 1 }, outra: 'preserva' },
      [{ skill_key: 'a', params: { v: 1 } }],
    );
    expect(out.coleta_skills).toEqual([{ skill_key: 'a', params: { v: 1 } }]);
    expect(out.coleta_skill_key).toBeUndefined();
    expect(out.coleta_params).toBeUndefined();
    expect(out.outra).toBe('preserva');
  });

  it('lista vazia remove coleta_skills', () => {
    const out = writeColetaSkillsConfig({ coleta_skills: [{ skill_key: 'a', params: {} }] }, []);
    expect(out.coleta_skills).toBeUndefined();
  });
});

describe('add/remove/setParam', () => {
  const base: ColetaSkill[] = [{ skill_key: 'a', params: { v: 1 } }];

  it('addColetaSkill anexa e dedupe (NOP se já presente)', () => {
    expect(addColetaSkill(base, 'b')).toEqual([
      { skill_key: 'a', params: { v: 1 } },
      { skill_key: 'b', params: {} },
    ]);
    expect(addColetaSkill(base, 'a')).toBe(base); // NOP
    expect(addColetaSkill(base, '')).toBe(base); // vazio NOP
  });

  it('removeColetaSkill remove por skill_key', () => {
    expect(removeColetaSkill([...base, { skill_key: 'b', params: {} }], 'a')).toEqual([
      { skill_key: 'b', params: {} },
    ]);
  });

  it('setColetaSkillParam atualiza só a skill alvo', () => {
    const skills = [
      { skill_key: 'a', params: { v: 1 } },
      { skill_key: 'b', params: { w: 9 } },
    ];
    expect(setColetaSkillParam(skills, 'b', 'w', 42)).toEqual([
      { skill_key: 'a', params: { v: 1 } },
      { skill_key: 'b', params: { w: 42 } },
    ]);
  });
});
