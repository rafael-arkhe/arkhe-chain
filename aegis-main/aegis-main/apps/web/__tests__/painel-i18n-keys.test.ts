/**
 * Onda L.1 (2026-05-23) — i18n das 7 páginas do Painel de Controle.
 *
 * Garante a integridade do dicionário e a cobertura `useT()` das pages
 * que tinham strings hardcoded (task #152):
 *   marcacoes · operacoes · salas · tours · espacos · organizacoes ·
 *   marcacoes-propriedade
 *
 * Honra memórias:
 *   - feedback_i18n_locales · pt-BR default + en-US peer (toda chave nos 2)
 *   - feedback_ui_english_only · nada de string hardcoded; tudo via useT()
 *   - feedback_no_palantir_product_names · proibido Foundry/Gotham/etc
 */
import * as fs from 'fs';
import * as path from 'path';
import { DICT, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/lib/i18n/dict';

const APP_DIR = path.join(__dirname, '..', 'app', 'painel-de-controle');

const TARGET_PAGES = [
  'marcacoes',
  'operacoes',
  'salas',
  'tours',
  'espacos',
  'organizacoes',
  'marcacoes-propriedade',
] as const;

describe('Onda L.1 · dicionário i18n', () => {
  it('default locale é pt-BR e en-US é peer', () => {
    expect(DEFAULT_LOCALE).toBe('pt-BR');
    expect(SUPPORTED_LOCALES).toEqual(['pt-BR', 'en-US']);
  });

  it('toda chave tem tradução pt-BR + en-US (nenhuma vazia indevida)', () => {
    for (const [key, entry] of Object.entries(DICT)) {
      for (const loc of SUPPORTED_LOCALES) {
        expect(entry).toHaveProperty(loc);
        expect(typeof entry[loc]).toBe('string');
      }
      // pt-BR nunca pode ser string vazia (é o fallback final).
      expect(entry['pt-BR'].length).toBeGreaterThan(0);
    }
  });

  it('namespaces das 7 pages + locale/cp existem no dicionário', () => {
    const prefixes = [
      'marcacoes.',
      'operacoes.',
      'salas.',
      'tours.',
      'espacos.',
      'orgs.',
      'mp.',
      'locale.',
      'cp.',
    ];
    for (const prefix of prefixes) {
      const hits = Object.keys(DICT).filter((k) => k.startsWith(prefix));
      expect(hits.length).toBeGreaterThan(0);
    }
  });

  it('chaves do LocalePicker cobrem os 2 locales suportados', () => {
    expect(DICT['locale.label']).toBeDefined();
    for (const loc of SUPPORTED_LOCALES) {
      expect(DICT[`locale.${loc}` as keyof typeof DICT]).toBeDefined();
    }
  });

  it('nenhuma tradução visível cita nomes de produto proibidos', () => {
    const banned = /\b(Palantir|Gotham|Foundry|Carbon|OpenClaw|ClawHub)\b/i;
    for (const [key, entry] of Object.entries(DICT)) {
      for (const loc of SUPPORTED_LOCALES) {
        expect(entry[loc]).not.toMatch(banned);
        // sanity: a própria chave não vaza pro texto
        expect(key).not.toMatch(banned);
      }
    }
  });

  it('nenhuma tradução visível contém emoji', () => {
    // Faixas de emoji comuns (pictográficos + símbolos).
    const emoji =
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
    for (const entry of Object.values(DICT)) {
      for (const loc of SUPPORTED_LOCALES) {
        expect(entry[loc]).not.toMatch(emoji);
      }
    }
  });
});

describe('Onda L.1 · cobertura useT() nas 7 pages', () => {
  it.each(TARGET_PAGES)('%s/page.tsx importa e usa useT()', (page) => {
    const file = path.join(APP_DIR, page, 'page.tsx');
    const src = fs.readFileSync(file, 'utf8');
    expect(src).toMatch(/from ['"]@\/lib\/i18n\/provider['"]/);
    expect(src).toMatch(/useT\(\)/);
  });

  it.each(TARGET_PAGES)('%s/page.tsx não tem subtitle hardcoded no CpPageHeader', (page) => {
    const file = path.join(APP_DIR, page, 'page.tsx');
    const src = fs.readFileSync(file, 'utf8');
    // subtitle deve ser uma expressão {t('...')} — não string literal.
    const literalSubtitle = /subtitle="[^"]+"/;
    expect(src).not.toMatch(literalSubtitle);
  });
});
