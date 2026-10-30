/**
 * Backlog #7a — VENDOR controla quais FONTES o /buscar oferece por tenant.
 *
 * Reusa o engine de variáveis (WorkshopVariable static `source_overrides` no
 * mesmo app `security.buscar-config`, resolvido via useResolvedApp honrando o
 * ORG ATIVO). Cobertura:
 *
 *   coerceSourceOverrides — normaliza a config crua (objeto/array/aliases/lixo).
 *   applySourceOverrides  — esconde (nunca alwaysOn), allowlist, fixa no topo.
 *   useEnabledSources     — default = TODAS as fontes; override esconde/allowlist.
 *   PainelFiltros         — fonte hidden some do painel; default mostra tudo;
 *                           fixada ganha badge + abre a categoria.
 */
import { render, screen, renderHook } from '@testing-library/react';

import {
  coerceSourceOverrides,
  applySourceOverrides,
  SOURCE_OVERRIDES_VAR,
} from '@/lib/buscar/source-overrides';
import type { SourceDef } from '@/lib/buscar/types';

// ── useResolvedApp mockado: o hook lê a var do app resolvido ─────────────────
const mockUseResolvedApp = jest.fn();
jest.mock('@/lib/workshop/runtime', () => ({
  useResolvedApp: (fallback: unknown) => mockUseResolvedApp(fallback),
}));

// Importado DEPOIS do mock (o hook usa useResolvedApp).
import { useEnabledSources } from '@/lib/buscar/use-enabled-sources';
import { PainelFiltros } from '@/components/buscar/painel-filtros';

/** Catálogo determinístico de teste — 1 alwaysOn local, 1 aegis (abre), 2 username (fecha). */
const CAT: SourceDef[] = [
  { key: 'entities', label: 'Entidades locais', category: 'local', alwaysOn: true, mcpTool: null },
  { key: 'entity_dossier@v1', label: 'Dossiê', category: 'aegis', mcpTool: 'entity_dossier@v1' },
  { key: 'maigret_username@v1', label: 'Maigret', category: 'username', mcpTool: 'maigret_username@v1' },
  { key: 'sherlock_username@v1', label: 'Sherlock', category: 'username', mcpTool: 'sherlock_username@v1' },
];

const keysOf = (list: SourceDef[]) => list.map((s) => s.key);

describe('coerceSourceOverrides', () => {
  it('shape canônico { hidden, pinned } → normaliza os dois', () => {
    expect(
      coerceSourceOverrides({ hidden: ['maigret_username@v1'], pinned: ['entity_dossier@v1'] }),
    ).toEqual({ hidden: ['maigret_username@v1'], pinned: ['entity_dossier@v1'], enabled: null });
  });

  it('campos parciais (só hidden) → pinned/enabled vazios', () => {
    expect(coerceSourceOverrides({ hidden: ['x'] })).toEqual({
      hidden: ['x'],
      pinned: [],
      enabled: null,
    });
  });

  it('array nu → vira allowlist `enabled`', () => {
    expect(coerceSourceOverrides(['entities', 'entity_dossier@v1'])).toEqual({
      hidden: [],
      pinned: [],
      enabled: ['entities', 'entity_dossier@v1'],
    });
  });

  it('alias `enabled_sources` é aceito como allowlist', () => {
    expect(coerceSourceOverrides({ enabled_sources: ['a', 'b'] }).enabled).toEqual(['a', 'b']);
  });

  it('aceita itens objeto { key | value } e ignora não-strings', () => {
    expect(
      coerceSourceOverrides({ hidden: [{ key: 'a' }, { value: 'b' }, 42, '', '  c  '] }).hidden,
    ).toEqual(['a', 'b', 'c']);
  });

  it('lixo (null/número/string) → tudo vazio (default = todas as fontes)', () => {
    for (const junk of [null, undefined, 7, 'foo', true]) {
      expect(coerceSourceOverrides(junk)).toEqual({ hidden: [], pinned: [], enabled: null });
    }
  });
});

describe('applySourceOverrides', () => {
  it('sem overrides → catálogo inteiro, ordem preservada (multidomínio neutro)', () => {
    expect(keysOf(applySourceOverrides(CAT, coerceSourceOverrides({})))).toEqual(keysOf(CAT));
  });

  it('hidden remove fonte não-alwaysOn', () => {
    const out = applySourceOverrides(CAT, coerceSourceOverrides({ hidden: ['maigret_username@v1'] }));
    expect(keysOf(out)).not.toContain('maigret_username@v1');
    expect(keysOf(out)).toContain('sherlock_username@v1');
  });

  it('hidden NUNCA esconde fonte alwaysOn (núcleo local)', () => {
    const out = applySourceOverrides(CAT, coerceSourceOverrides({ hidden: ['entities'] }));
    expect(keysOf(out)).toContain('entities');
  });

  it('allowlist mantém só as habilitadas + alwaysOn', () => {
    const out = applySourceOverrides(CAT, coerceSourceOverrides({ enabled: ['entity_dossier@v1'] }));
    expect(keysOf(out).sort()).toEqual(['entities', 'entity_dossier@v1']);
  });

  it('pinned move as fixadas pro topo (preservando o resto)', () => {
    const out = applySourceOverrides(CAT, coerceSourceOverrides({ pinned: ['maigret_username@v1'] }));
    expect(keysOf(out)[0]).toBe('maigret_username@v1');
    // o restante mantém a ordem original
    expect(keysOf(out).slice(1)).toEqual(['entities', 'entity_dossier@v1', 'sherlock_username@v1']);
  });
});

describe('useEnabledSources', () => {
  const appWithVar = (defaultValue: unknown) => ({
    app: {
      id: 'x',
      external_id: 'security.buscar-config',
      variables: [{ external_id: SOURCE_OVERRIDES_VAR, default: defaultValue }],
    },
    source: 'server',
    loading: false,
  });

  beforeEach(() => jest.clearAllMocks());

  it('default (sem a var) → TODAS as fontes', () => {
    mockUseResolvedApp.mockReturnValue({ app: { variables: [] }, source: 'server', loading: false });
    const { result } = renderHook(() => useEnabledSources(CAT));
    expect(keysOf(result.current.catalog)).toEqual(keysOf(CAT));
    expect(result.current.overrides.hidden).toEqual([]);
  });

  it('override hidden → fonte some do catálogo oferecido', () => {
    mockUseResolvedApp.mockReturnValue(appWithVar({ hidden: ['maigret_username@v1'] }));
    const { result } = renderHook(() => useEnabledSources(CAT));
    expect(keysOf(result.current.catalog)).not.toContain('maigret_username@v1');
    expect(result.current.overrides.hidden).toEqual(['maigret_username@v1']);
  });

  it('override allowlist → só as habilitadas (+ alwaysOn)', () => {
    mockUseResolvedApp.mockReturnValue(appWithVar({ enabled: ['entity_dossier@v1'] }));
    const { result } = renderHook(() => useEnabledSources(CAT));
    expect(keysOf(result.current.catalog).sort()).toEqual(['entities', 'entity_dossier@v1']);
  });

  it('pinned é exposto p/ o painel destacar', () => {
    mockUseResolvedApp.mockReturnValue(appWithVar({ pinned: ['entity_dossier@v1'] }));
    const { result } = renderHook(() => useEnabledSources(CAT));
    expect(result.current.overrides.pinned).toEqual(['entity_dossier@v1']);
  });
});

describe('PainelFiltros · catálogo oferecido', () => {
  const baseProps = {
    query: '',
    setQuery: jest.fn(),
    selectedClass: new Set<string>(),
    toggleClass: jest.fn(),
    selectedSourceKeys: new Set<string>(),
    toggleSource: jest.fn(),
    availableMcpTools: new Set<string>(),
    loadingAdapters: true, // mostra tudo que é oferecido, sem filtro de disponibilidade
    inferredKind: null,
    acceptsByTool: {},
    onSubmit: jest.fn(),
  };

  it('default → mostra a fonte (categoria aegis abre por padrão)', () => {
    render(<PainelFiltros {...baseProps} catalog={CAT} pinnedKeys={new Set()} />);
    expect(screen.getByTestId('buscar-fonte-entity_dossier@v1')).toBeInTheDocument();
  });

  it('fonte hidden some do painel (não vira checkbox/busca); demais ficam', () => {
    const offered = applySourceOverrides(
      CAT,
      coerceSourceOverrides({ hidden: ['entity_dossier@v1'] }),
    );
    render(<PainelFiltros {...baseProps} catalog={offered} pinnedKeys={new Set()} />);
    expect(screen.queryByTestId('buscar-fonte-entity_dossier@v1')).toBeNull();
    // alwaysOn local segue visível — só a escondida sumiu
    expect(screen.getByTestId('buscar-fonte-entities')).toBeInTheDocument();
  });

  it('fonte fixada → abre a categoria + ganha badge "fixada"', () => {
    render(
      <PainelFiltros
        {...baseProps}
        catalog={CAT}
        pinnedKeys={new Set(['maigret_username@v1'])}
      />,
    );
    // username normalmente fecha; com fixada, abre e renderiza o checkbox
    expect(screen.getByTestId('buscar-fonte-maigret_username@v1')).toBeInTheDocument();
    expect(screen.getByTestId('buscar-fonte-fixada-maigret_username@v1')).toBeInTheDocument();
  });
});
