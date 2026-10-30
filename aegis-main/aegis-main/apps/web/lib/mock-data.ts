/**
 * SHELL HONESTO (2026-06-12): este módulo NÃO exporta mais dado demo.
 *
 * Os corpora fabricados (MOCK_OBJECTS, KPIS, LINHA_TEMPO, ALERTAS,
 * CAMERAS_PRIORITARIAS) vazavam pra UI como se fossem dado real
 * (⌘K listava "CARLOS ROBERTO SILVA" inventado, KPIs traziam números
 * fabricados). Regra: fallback offline mostra ESTADO honesto, nunca
 * conteúdo inventado. A guarda anti-regressão vive em
 * __tests__/api-fallback.test.ts (módulo precisa ficar vazio em runtime).
 *
 * Só sobra o vocabulário de TIPOS de objeto, usado por ícones/labels.
 */
export type ObjectType =
  | 'pessoa'
  | 'veiculo'
  | 'telefone'
  | 'endereco'
  | 'documento'
  | 'bo'
  | 'mandado'
  | 'processo'
  | 'arma'
  | 'evento'
  | 'organizacao'
  | 'midia';
