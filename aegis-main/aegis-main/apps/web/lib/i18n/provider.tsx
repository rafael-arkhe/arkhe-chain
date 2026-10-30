'use client';

/**
 * I18nProvider + useT() — Sprint UX-1.7 (2026-05-22).
 *
 * Infra mínima de i18n para honrar memórias:
 *   - feedback_i18n_locales · pt-BR default, en-US peer
 *   - feedback_ui_english_only · zero strings hardcoded em UI
 *
 * Pattern:
 *   - <I18nProvider> envolve a app (no AuthShell)
 *   - useT() retorna função `t(key)` que traduz
 *   - Locale lido de `/me/context.locale`; mutado via `PUT /me/context`
 *   - Fallback gracioso: chave inexistente retorna a própria key (visível)
 *
 * Persistência: server-side (User.metadata_.context.locale). Zero
 * localStorage para preferência de domínio (memória
 * feedback_no_localstorage_for_persistence).
 */
import * as React from 'react';
import { useMeContext } from '@/lib/data/me-context-store';
import { DEFAULT_LOCALE, DICT, type DictKey, type Locale, SUPPORTED_LOCALES } from './dict';

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => Promise<void>;
  t: (key: string) => string;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

interface ProviderProps {
  children: React.ReactNode;
  /** Initial locale (vem do server-side via cookie hint). Default pt-BR. */
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: ProviderProps) {
  const [locale, setLocaleState] = React.useState<Locale>(
    initialLocale ?? DEFAULT_LOCALE,
  );

  // Sincroniza com server-side ao montar via store COMPARTILHADO de /me/context
  // (#12) — dedupado com os outros providers. Semeia o locale UMA vez; trocas
  // locais via setLocale prevalecem (`touched` evita que o GET, que pode
  // resolver DEPOIS, sobrescreva a escolha do operador).
  const { data: ctx } = useMeContext();
  const seeded = React.useRef(false);
  const touched = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || touched.current || !ctx) return;
    if (typeof ctx.locale === 'string' && SUPPORTED_LOCALES.includes(ctx.locale as Locale)) {
      setLocaleState(ctx.locale as Locale);
    }
    seeded.current = true;
  }, [ctx]);

  const setLocale = React.useCallback(async (next: Locale) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    // Optimistic update + persist server-side.
    touched.current = true;
    setLocaleState(next);
    try {
      await fetch('/api/me/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
    } catch {
      // Falha de rede: locale local permanece, server fica defasado.
    }
  }, []);

  const t = React.useCallback(
    (key: string) => {
      const entry = DICT[key as DictKey];
      if (!entry) {
        // Graceful: return key visible so devs identify missing translations.
        return key;
      }
      return entry[locale] ?? entry[DEFAULT_LOCALE] ?? key;
    },
    [locale],
  );

  const value = React.useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook principal. Uso:
 *
 *   const t = useT();
 *   <button>{t('common.save')}</button>
 *
 * Fallback: se chamado fora de <I18nProvider>, retorna função identity
 * (chave = string mostrada). Garante zero crash em rotas de auth/login.
 */
export function useT(): (key: string) => string {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    return (key: string) => {
      const entry = DICT[key as DictKey];
      return entry?.[DEFAULT_LOCALE] ?? key;
    };
  }
  return ctx.t;
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: async () => {},
      t: (key) => DICT[key as DictKey]?.[DEFAULT_LOCALE] ?? key,
    };
  }
  return ctx;
}
