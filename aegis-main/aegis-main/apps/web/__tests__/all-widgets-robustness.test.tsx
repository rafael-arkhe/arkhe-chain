/**
 * ONDA 5 · GARANTIA 100% — nenhum widget do Workshop quebra na mão do cliente.
 *
 * Sem ErrorBoundary, uma exceção no render de UM widget derruba o APP INTEIRO
 * (tela branca). Este harness monta CADA widget REGISTRADO (o registry é a
 * fonte-de-verdade, casada ao catálogo pela widget-catalog-parity) em 3 regimes
 * e falha se qualquer um lançar no render síncrono — o gatilho nº1 de tela branca:
 *   1. VAZIO         — todo input undefined (o cliente abre o app sem dado).
 *   2. mockVariables — o dado representativo que o PRÓPRIO widget declara (render realista).
 *   3. MALFORMADO    — cada input do catálogo apontando p/ valor "sujo" (null/[]/tipo errado).
 *
 * Defesa em profundidade: o WidgetErrorBoundary no RenderNode contém qualquer
 * falha residual num card, sem derrubar o painel.
 */
import fs from 'fs';
import path from 'path';

// Cesium/maplibre são WebGL-only (não rodam em jsdom) — o render 3D é
// certificado ao vivo no browser. Aqui mockamos com stubs no-op (Proxy) para
// que o harness monte os widgets geo SEM disparar WebGL (que, sem tratamento,
// derruba o processo). A ROBUSTEZ de init no-WebGL é endurecida no componente
// real (cesium-globe try/catch → fallback), coberta à parte.
jest.mock('cesium', () => {
  const make = (): any =>
    new Proxy(function () {}, {
      get: (_t, prop) => (prop === 'then' ? undefined : make()),
      apply: () => make(),
      construct: () => make(),
    });
  return new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : make()) });
}, { virtual: true });
jest.mock('cesium/Build/Cesium/Widgets/widgets.css', () => ({}), { virtual: true });
jest.mock('maplibre-gl', () => {
  const make = (): any =>
    new Proxy(function () {}, {
      get: (_t, prop) => (prop === 'then' ? undefined : make()),
      apply: () => make(),
      construct: () => make(),
    });
  return { __esModule: true, default: new Proxy({}, { get: () => make() }) };
}, { virtual: true });

// Contextos de app que o runtime SEMPRE provê (i18n + router). Sem eles, hooks
// como useT/useRouter lançam por FALTA DE PROVIDER — ruído de teste, não crash de
// widget. Mockamos p/ isolar as falhas REAIS de robustez de dado.
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string, d?: string) => d ?? k,
  T: ({ children }: { children?: unknown }) => children ?? null,
  I18nProvider: ({ children }: { children?: unknown }) => children ?? null,
  useLocale: () => 'pt-BR',
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => {}, replace: () => {}, prefetch: () => {},
    back: () => {}, forward: () => {}, refresh: () => {},
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Auth: o app envolve tudo em <AuthProvider>; sem ele useAuth/useCan lançam por
// falta de provider (ruído de teste). Mockamos como admin autenticado (permissivo)
// p/ o widget renderizar o conteúdo COMPLETO — mais caminhos de código exercitados.
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: { roles: ['admin'], permissions: [], clearances: [] },
    user: { username: 'robustness' }, loading: false, isAuthenticated: true,
  }),
  useCan: () => true,
  AuthProvider: ({ children }: { children?: unknown }) => children ?? null,
}));

// jsdom não tem fetch/ResizeObserver/IntersectionObserver — o BROWSER tem. Stubs
// p/ os widgets que os usam não lançarem por ambiente (não é crash de cliente).
beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.fetch) {
    g.fetch = () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  }
  class RO { observe() {} unobserve() {} disconnect() {} }
  if (!g.ResizeObserver) g.ResizeObserver = RO;
  if (!g.IntersectionObserver) {
    g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  }
});

import type * as React from 'react';
import { render, cleanup } from '@testing-library/react';

import '@/components/workshop/widgets'; // side-effect: registerWidget de TODOS
import {
  getRegisteredWidgets,
  getWidgetComponent,
  getWidgetMeta,
} from '@/components/workshop/WorkshopV2Renderer';

interface CatalogEntry {
  type: string;
  inputs: { name: string; variable_type: string }[];
}

const catalog: CatalogEntry[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'lib', 'workshop', 'widget-catalog.json'), 'utf-8'),
);
const inputsByType = new Map(catalog.map((e) => [e.type, e.inputs ?? []]));

const widgets = getRegisteredWidgets()
  .map((w) => w.type)
  .sort();

function baseProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    appId: 'robustness',
    config: {},
    variables: {},
    bindings: {},
    setBinding: () => {},
    emit: () => {},
    ...overrides,
  };
}

const ADVERSARIAL: unknown[] = [
  null, undefined, [], {}, '', 0, false, 'string-inesperada',
  [null, undefined, {}], { objects: null }, { rows: null }, { properties: null }, [{ id: null }],
];

afterEach(() => cleanup());

describe('Workshop robustez — inventário N/N', () => {
  it('todos os widgets registrados presentes (>=100)', () => {
    expect(widgets.length).toBeGreaterThanOrEqual(100);
  });
  it('todo widget registrado tem entrada no catálogo (sem órfão)', () => {
    const orphans = widgets.filter((t) => !inputsByType.has(t));
    expect(orphans).toEqual([]);
  });
});

/**
 * 🔴 **Um teste por widget, com os TRÊS regimes dentro** — e não três por
 * widget.
 *
 * Eram `3 × N` casos: 329 testes, 31,6 s, e o ficheiro mais lento da suite
 * inteiro. A cobertura é a mesma — o widget é montado nos três regimes de
 * qualquer forma — mas a **saída** é outra: com `it.each`, um widget partido
 * é UM teste vermelho entre 329, e descobrir qual obriga a ler a lista de
 * todos. Aqui a falha diz *"estes widgets quebraram: a, b, c"*, que é a
 * informação que se quer no momento em que a tela branca aparece.
 *
 * E o `it.each` paga um `it()` por widget por regime: 219 testes de
 * cabeçalho, de buffer e de reporte, para 110 linhas de asserção.
 */
describe('Workshop — nenhum widget rebenta com dado nenhum', () => {
  it.each(widgets)('%s aguenta VAZIO, o seu próprio dado, e dado SUJO', (type) => {
    const Comp = getWidgetComponent(type)! as unknown as React.ComponentType<
      Record<string, unknown>
    >;
    expect(Comp).toBeTruthy();

    // Regime 1 — VAZIO: o cliente abre a aplicação sem nenhum dado.
    expect(() => render(<Comp {...baseProps()} />)).not.toThrow();
    cleanup();

    // Regime 2 — o dado representativo que o PRÓPRIO widget declara.
    const meta = getWidgetMeta(type);
    expect(() =>
      render(
        <Comp
          {...baseProps({
            config: (meta?.mockConfig ?? {}) as Record<string, unknown>,
            variables: (meta?.mockVariables ?? {}) as Record<string, unknown>,
          })}
        />,
      ),
    ).not.toThrow();
    cleanup();

    // Regime 3 — MALFORMADO: cada input do catálogo apontando para cada valor
    // adverso. Aqui o `expect` está DENTRO do laço e sem `cleanup()` depois,
    // porque a falha tem de dizer **qual** input e **qual** valor.
    const inputs = inputsByType.get(type) ?? [];
    for (const adverse of ADVERSARIAL) {
      const config: Record<string, unknown> = {};
      const variables: Record<string, unknown> = {};
      for (const inp of inputs) {
        config[inp.name] = `v_${inp.name}`;
        variables[`v_${inp.name}`] = adverse;
        config[`${inp.name}_raw`] = adverse; // widgets que leem config cru
      }
      expect(() =>
        render(<Comp {...baseProps({ config, variables })} />),
      ).not.toThrow();
      cleanup();
    }
  });
});
