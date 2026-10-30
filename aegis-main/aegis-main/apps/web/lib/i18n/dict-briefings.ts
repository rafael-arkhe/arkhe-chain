/**
 * i18n — /briefings (P5 Onda 3, 2026-06-27).
 *
 * De MOCK militar (OUTLINE "Forças hostis"/"Heliponto médico", "Operação
 * Aurora") para REALIDADE multidomínio dirigida por dado. Strings NEUTRAS
 * (sem lente militar/eleitoral). Mesclado em DICT via spread em dict.ts.
 */
export const BRIEFINGS_DICT: Record<string, { 'pt-BR': string; 'en-US': string }> = {
  'briefings.title': { 'pt-BR': 'Briefings', 'en-US': 'Briefings' },
  'briefings.subtitle': {
    'pt-BR': 'Briefing operacional — montado por widgets genéricos',
    'en-US': 'Operational briefing — assembled from generic widgets',
  },
  'briefings.classificationLabel': { 'pt-BR': 'BRIEFING', 'en-US': 'BRIEFING' },

  // Estados de carga / acesso / vazio.
  'briefings.loading': { 'pt-BR': 'Carregando briefing…', 'en-US': 'Loading briefing…' },
  'briefings.denied': {
    'pt-BR': 'Você não possui a permissão ou marcação exigida para abrir este briefing.',
    'en-US': "You don't have the permission or marking required to open this briefing.",
  },
  'briefings.empty': {
    'pt-BR': 'Este briefing ainda não tem widgets configurados. Monte-o no Workshop.',
    'en-US': 'This briefing has no widgets configured yet. Build it in the Workshop.',
  },

  // Eixo de classificação (dropdown de catálogo — nunca texto livre).
  'briefings.classification.label': { 'pt-BR': 'Classificação', 'en-US': 'Classification' },
  'briefings.cls.publico': { 'pt-BR': 'Público', 'en-US': 'Public' },
  'briefings.cls.restrito': { 'pt-BR': 'Restrito', 'en-US': 'Restricted' },
  'briefings.cls.confidencial': { 'pt-BR': 'Confidencial', 'en-US': 'Confidential' },
  'briefings.cls.sigiloso': { 'pt-BR': 'Sigiloso', 'en-US': 'Secret' },

  // #6 — DEGRAUS de detalhe (progressive disclosure), não modos abstratos. Cada
  // degrau mostra as seções do seu nível p/ baixo; a descrição diz o que entra.
  'briefings.modo.label': { 'pt-BR': 'Nível de detalhe', 'en-US': 'Detail level' },
  'briefings.modo.resumo': { 'pt-BR': 'Resumo', 'en-US': 'Summary' },
  'briefings.modo.operacional': { 'pt-BR': 'Operacional', 'en-US': 'Operational' },
  'briefings.modo.analitico': { 'pt-BR': 'Completo', 'en-US': 'Complete' },
  'briefings.modo.resumo.desc': {
    'pt-BR': 'Só o essencial: narrativas e indicadores-chave.',
    'en-US': 'Just the essentials: narratives and key indicators.',
  },
  'briefings.modo.operacional.desc': {
    'pt-BR': 'Resumo + texto, tabelas e listas para trabalhar.',
    'en-US': 'Summary plus text, tables and lists to work with.',
  },
  'briefings.modo.analitico.desc': {
    'pt-BR': 'Tudo: gráficos, mapas, vínculos e figuras.',
    'en-US': 'Everything: charts, maps, links and figures.',
  },
  'briefings.modo.sections': { 'pt-BR': 'seções', 'en-US': 'sections' },
  'briefings.modo.emptyLevel': {
    'pt-BR': 'Este documento não tem seções neste nível de detalhe.',
    'en-US': 'This document has no sections at this detail level.',
  },
  'briefings.modo.showAll': { 'pt-BR': 'Ver tudo (Completo)', 'en-US': 'Show all (Complete)' },

  // Toolbar.
  'briefings.toolbar.present': { 'pt-BR': 'Apresentar', 'en-US': 'Present' },
  'briefings.toolbar.exitPresent': { 'pt-BR': 'Sair da apresentação', 'en-US': 'Exit presentation' },
  'briefings.toolbar.export': { 'pt-BR': 'Exportar PDF', 'en-US': 'Export PDF' },
  'briefings.toolbar.broadcast': { 'pt-BR': 'Transmitir', 'en-US': 'Broadcast' },

  // Transmitir (broadcast) — confirmação + feedback.
  'briefings.broadcast.title': { 'pt-BR': 'Transmitir briefing', 'en-US': 'Broadcast briefing' },
  'briefings.broadcast.body': {
    'pt-BR':
      'Gera um link temporário de transmissão deste briefing para a equipe. O link expira automaticamente.',
    'en-US':
      'Generates a temporary broadcast link of this briefing for the team. The link expires automatically.',
  },
  'briefings.broadcast.confirm': { 'pt-BR': 'Transmitir', 'en-US': 'Broadcast' },

  // Toasts.
  'briefings.toast.saved': { 'pt-BR': 'Briefing salvo.', 'en-US': 'Briefing saved.' },
  'briefings.toast.saveFailed': {
    'pt-BR': 'Falha ao salvar o briefing.',
    'en-US': 'Failed to save the briefing.',
  },
  'briefings.toast.broadcast': {
    'pt-BR': 'Transmissão iniciada — link temporário gerado.',
    'en-US': 'Broadcast started — temporary link generated.',
  },
  'briefings.toast.broadcastFailed': {
    'pt-BR': 'Falha ao transmitir o briefing.',
    'en-US': 'Failed to broadcast the briefing.',
  },
};
