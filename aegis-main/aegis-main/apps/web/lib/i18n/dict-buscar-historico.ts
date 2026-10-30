/**
 * i18n — /buscar · Histórico de buscas RICO (BACKLOG #7b ELO 2).
 *
 * Strings do dropdown rico de histórico (backend `SearchHistory` SDK):
 * carregar/erro · filtro · re-rodar · detalhe (contexto completo) · limpar.
 * pt-BR (default) + en-US. As chaves toggle/vazio/limpar JÁ existem em
 * `dict-buscar-ficha.ts` e são reusadas — não duplicar aqui.
 */
export const BUSCAR_HISTORICO_DICT: Record<string, { 'pt-BR': string; 'en-US': string }> = {
  'buscar.historico.carregando': {
    'pt-BR': 'Carregando histórico…',
    'en-US': 'Loading history…',
  },
  'buscar.historico.erro': {
    'pt-BR': 'Falha ao carregar o histórico.',
    'en-US': 'Failed to load history.',
  },
  'buscar.historico.tentar': {
    'pt-BR': 'Tentar de novo',
    'en-US': 'Try again',
  },
  'buscar.historico.filtroPlaceholder': {
    'pt-BR': 'Filtrar no histórico…',
    'en-US': 'Filter history…',
  },
  'buscar.historico.filtroVazio': {
    'pt-BR': 'Nenhuma busca corresponde ao filtro.',
    'en-US': 'No search matches the filter.',
  },
  'buscar.historico.rerodar': {
    'pt-BR': 'Re-rodar',
    'en-US': 'Re-run',
  },
  'buscar.historico.rerodarTooltip': {
    'pt-BR': 'Restaura a busca (consulta + fontes + filtros avançados) e executa de novo.',
    'en-US': 'Restores the search (query + sources + advanced filters) and runs it again.',
  },
  'buscar.historico.detalhe': {
    'pt-BR': 'Detalhe',
    'en-US': 'Details',
  },
  'buscar.historico.remover': {
    'pt-BR': 'Remover',
    'en-US': 'Remove',
  },
  'buscar.historico.semFontes': {
    'pt-BR': 'sem fontes',
    'en-US': 'no sources',
  },
  'buscar.historico.fonteSingular': {
    'pt-BR': 'fonte',
    'en-US': 'source',
  },
  'buscar.historico.fontePlural': {
    'pt-BR': 'fontes',
    'en-US': 'sources',
  },
  'buscar.historico.limparTitulo': {
    'pt-BR': 'Limpar histórico de buscas',
    'en-US': 'Clear search history',
  },
  'buscar.historico.limparCorpo': {
    'pt-BR': 'Isto apaga TODO o seu histórico de buscas. Esta ação não pode ser desfeita.',
    'en-US': 'This deletes ALL of your search history. This action cannot be undone.',
  },
  'buscar.historico.limparConfirmar': {
    'pt-BR': 'Limpar tudo',
    'en-US': 'Clear all',
  },
  'buscar.historico.detalheConsulta': {
    'pt-BR': 'Consulta',
    'en-US': 'Query',
  },
  'buscar.historico.detalheFontes': {
    'pt-BR': 'Fontes',
    'en-US': 'Sources',
  },
  'buscar.historico.detalheAvancado': {
    'pt-BR': 'Busca avançada',
    'en-US': 'Advanced search',
  },
  'buscar.historico.detalheFinalidade': {
    'pt-BR': 'Finalidade',
    'en-US': 'Purpose',
  },
  'buscar.historico.detalheCaso': {
    'pt-BR': 'Caso',
    'en-US': 'Case',
  },
  'buscar.historico.detalheResumo': {
    'pt-BR': 'Resultados por fonte',
    'en-US': 'Results per source',
  },
  'buscar.historico.detalheSemAvancado': {
    'pt-BR': 'Sem filtros avançados.',
    'en-US': 'No advanced filters.',
  },
};
