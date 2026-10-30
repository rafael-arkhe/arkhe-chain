'use client';

/**
 * BrandContext — expõe a Marca do tenant (company_name/logo_url/pwa_name/
 * pwa_short_name) pro chrome autenticado consumir (BrandLink, sidebar do
 * Painel de Controle, previews do editor).
 *
 * Espelha o padrão de RegionColorsMount/GlobalStylesheetMount: fetch
 * client-side só quando há principal, falha silenciosa (fallback aos
 * defaults visuais que o chrome já usava antes desta wiring existir).
 */
import * as React from 'react';
import { Styles, type BrandOut } from '@/lib/api';
import { useAuth } from '@/lib/auth/useAuth';

const EMPTY_BRAND: BrandOut = {
  company_name: null,
  logo_url: null,
  logo_dark_url: null,
  slogan: null,
  primary_color: null,
  favicon_url: null,
  pwa_name: null,
  pwa_short_name: null,
};

/** Marca do tenant + `refresh()` pra revalidar depois de um save alhures
 * (ex.: styles-configurator) — espelha o `refresh` de `useAuth()`. Sem
 * isto, salvar a Marca em /painel-de-controle/styles-configurator nunca
 * atualizava o BrandLink/CpSidebarHeader (cada um só buscava uma vez no
 * mount do AuthShell). */
export interface BrandState extends BrandOut {
  refresh: () => void;
}

const NOOP = () => {};
const DEFAULT_STATE: BrandState = { ...EMPTY_BRAND, refresh: NOOP };

const BrandContext = React.createContext<BrandState>(DEFAULT_STATE);

/**
 * Marca do tenant (campos `null` enquanto carrega, sem principal, ou não
 * personalizados) — cada consumidor decide o próprio fallback visual.
 */
export function useBrand(): BrandState {
  return React.useContext(BrandContext);
}

function BrandFetcher({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = React.useState<BrandOut>(EMPTY_BRAND);

  const load = React.useCallback(() => {
    Styles.getBrand()
      .then((out) => setBrand(out))
      .catch(() => setBrand(EMPTY_BRAND));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const value = React.useMemo<BrandState>(
    () => ({ ...brand, refresh: load }),
    [brand, load],
  );

  return (
    <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
  );
}

/**
 * Só busca a Marca quando há principal — em /login o fetch autenticado
 * bateria 401 (a tela de login já usa `Styles.getPublicBrand()` à parte).
 */
export function BrandWhenAuthed({
  children,
}: {
  children: React.ReactNode;
}) {
  const { principal } = useAuth();
  if (!principal) return <>{children}</>;
  return <BrandFetcher>{children}</BrandFetcher>;
}
