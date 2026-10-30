/**
 * i18n — /buscar · controle de FONTES por tenant (VENDOR).
 * Rótulos do painel de fontes ligados ao override `source_overrides`
 * (esconder/fixar fontes). pt-BR (default) + en-US. Toda string via useT().
 */
export const BUSCAR_FONTES_DICT: Record<string, { 'pt-BR': string; 'en-US': string }> = {
  'buscar.filtros.fixada': {
    'pt-BR': 'fixada',
    'en-US': 'pinned',
  },
  'buscar.filtros.fixadaTooltip': {
    'pt-BR': 'Fonte fixada no topo pela configuração do tenant.',
    'en-US': 'Source pinned to top by the tenant configuration.',
  },
};
