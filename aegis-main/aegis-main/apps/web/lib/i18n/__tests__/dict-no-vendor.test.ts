/**
 * Sprint 5 (Estação WhatsApp) — trava de marca no dicionário.
 *
 * Regra dura: nenhum VALOR (pt-BR/en-US) das chaves edge.* e conectores.* pode
 * citar "Evolution" (vendor) nem "AEGIS Edge" (marca antiga do dispositivo).
 */
import { DICT } from '@/lib/i18n/dict';

const BANNED = ['Evolution', 'AEGIS Edge'];
const LOCALES = ['pt-BR', 'en-US'] as const;

const KEYS = Object.keys(DICT).filter(
  (k) => k.startsWith('edge.') || k.startsWith('conectores.'),
);

describe('i18n — edge.*/conectores.* sem marca de vendor', () => {
  it('há chaves edge.* e conectores.* para checar', () => {
    expect(KEYS.length).toBeGreaterThan(0);
  });

  it.each(KEYS)('%s não cita vendor em pt-BR nem en-US', (key) => {
    for (const loc of LOCALES) {
      const value = DICT[key][loc];
      for (const banned of BANNED) {
        expect(value).not.toContain(banned);
      }
    }
  });
});
