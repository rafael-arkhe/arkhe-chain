/**
 * i18n — correlação em CADEIA no detalhe do /buscar (P3 Onda 3, 2026-06-27).
 *
 * Cobre os 3 fluxos do elo de frontend:
 *   - AUTO-LEVE  · vínculos imediatos (quick-links 1-hop, automático).
 *   - APROFUNDAR · "Expandir em cadeia" (chain multi-hop, controles num popover).
 *   - PREVIEW+SALVAR · a rede é PRÉVIA até o operador salvar na ontologia.
 *
 * Mesclado em DICT via spread em dict.ts. pt-BR default + en-US peer
 * (memória feedback_i18n_locales / feedback_ui_english_only).
 */
export const BUSCAR_CORRELACAO_DICT: Record<string, { 'pt-BR': string; 'en-US': string }> = {
  // ── AUTO-LEVE: vínculos imediatos (1 hop) ──────────────────────────────
  'buscar.correlacao.titulo': {
    'pt-BR': 'Vínculos imediatos',
    'en-US': 'Immediate links',
  },
  'buscar.correlacao.carregando': {
    'pt-BR': 'Buscando vínculos…',
    'en-US': 'Finding links…',
  },
  'buscar.correlacao.vazio': {
    'pt-BR': 'Nenhum vínculo imediato encontrado para este seletor.',
    'en-US': 'No immediate links found for this selector.',
  },
  'buscar.correlacao.erro': {
    'pt-BR': 'Falha ao consultar vínculos.',
    'en-US': 'Failed to query links.',
  },
  'buscar.correlacao.verNaRede': {
    'pt-BR': 'Ver na rede',
    'en-US': 'View in network',
  },

  // ── APROFUNDAR: expandir em cadeia + controles ─────────────────────────
  'buscar.correlacao.expandir': {
    'pt-BR': 'Expandir em cadeia',
    'en-US': 'Expand into chain',
  },
  'buscar.correlacao.expandirHint': {
    'pt-BR': 'Corre o BFS multi-salto e desenha a rede crescendo (prévia).',
    'en-US': 'Runs the multi-hop BFS and draws the network growing (preview).',
  },
  'buscar.correlacao.config': {
    'pt-BR': 'Ajustar profundidade e orçamento',
    'en-US': 'Adjust depth and budget',
  },
  'buscar.correlacao.profundidade': {
    'pt-BR': 'Profundidade (saltos)',
    'en-US': 'Depth (hops)',
  },
  'buscar.correlacao.orcamento': {
    'pt-BR': 'Orçamento (nós)',
    'en-US': 'Budget (nodes)',
  },
  'buscar.correlacao.crescendo': {
    'pt-BR': 'Expandindo a rede…',
    'en-US': 'Growing the network…',
  },
  'buscar.correlacao.cancelar': {
    'pt-BR': 'Cancelar expansão',
    'en-US': 'Cancel expansion',
  },

  // ── PREVIEW: a rede da cadeia (prévia até salvar) ──────────────────────
  'buscar.correlacao.previewTitulo': {
    'pt-BR': 'Cadeia de correlação — prévia',
    'en-US': 'Correlation chain — preview',
  },
  'buscar.correlacao.previewAviso': {
    'pt-BR': 'Prévia: nada é gravado na ontologia até você salvar na rede.',
    'en-US': 'Preview: nothing is written to the ontology until you save to the network.',
  },
  'buscar.correlacao.nos': {
    'pt-BR': 'nós',
    'en-US': 'nodes',
  },
  'buscar.correlacao.vinculos': {
    'pt-BR': 'vínculos',
    'en-US': 'links',
  },
  'buscar.correlacao.semNos': {
    'pt-BR': 'A cadeia não retornou nós.',
    'en-US': 'The chain returned no nodes.',
  },
  'buscar.correlacao.fechar': {
    'pt-BR': 'Fechar',
    'en-US': 'Close',
  },

  // ── SALVAR: materializar na ontologia (opt-in) ─────────────────────────
  'buscar.correlacao.salvarNaRede': {
    'pt-BR': 'Salvar na rede',
    'en-US': 'Save to network',
  },
  'buscar.correlacao.salvarConfirmTitulo': {
    'pt-BR': 'Salvar a cadeia na ontologia?',
    'en-US': 'Save the chain to the ontology?',
  },
  'buscar.correlacao.salvarConfirmDesc': {
    'pt-BR':
      'A rede da prévia será materializada na ontologia canônica (objetos e vínculos). É idempotente — salvar de novo não duplica.',
    'en-US':
      'The preview network will be materialized into the canonical ontology (objects and links). It is idempotent — saving again does not duplicate.',
  },
  'buscar.correlacao.salvarConfirmar': {
    'pt-BR': 'Salvar agora',
    'en-US': 'Save now',
  },
  'buscar.correlacao.salvando': {
    'pt-BR': 'Salvando…',
    'en-US': 'Saving…',
  },
  'buscar.correlacao.salvoOk': {
    'pt-BR': 'Cadeia salva na rede.',
    'en-US': 'Chain saved to the network.',
  },
  'buscar.correlacao.salvarErro': {
    'pt-BR': 'Falha ao salvar a cadeia.',
    'en-US': 'Failed to save the chain.',
  },
};
