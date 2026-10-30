/**
 * i18n — parâmetros por-fonte + feedback de desempenho da fila /buscar (FE-B).
 * pt-BR default + en-US peer. Interpolação `{x}` é resolvida na UI via .replace.
 */
export const BUSCAR_PERF_DICT: Record<string, { 'pt-BR': string; 'en-US': string }> = {
  /* seção de parâmetros por-fonte na Busca avançada */
  'buscar.fonte.params': {
    'pt-BR': 'Parâmetros da fonte',
    'en-US': 'Source parameters',
  },
  'buscar.fonte.params.hint': {
    'pt-BR': 'Opcional — a maioria das fontes funciona bem no padrão.',
    'en-US': 'Optional — most sources work fine on defaults.',
  },
  'buscar.fonte.padrao': {
    'pt-BR': 'Padrão',
    'en-US': 'Default',
  },
  'buscar.fonte.ajustes': {
    'pt-BR': '{n} ajuste(s)',
    'en-US': '{n} set',
  },
  /* feedback de desempenho na fila */
  'buscar.perf.decorrido': {
    'pt-BR': 'decorrido',
    'en-US': 'elapsed',
  },
  'buscar.perf.estimado': {
    'pt-BR': 'estimado ~{tempo}s',
    'en-US': 'estimated ~{tempo}s',
  },
  'buscar.perf.estimativa': {
    'pt-BR': 'estimativa',
    'en-US': 'estimate',
  },
  /* cobertura final — wmn (varreu X sites) */
  'buscar.perf.cobertura': {
    'pt-BR': 'varreu {sites} sites em {tempo}s, {contas} contas',
    'en-US': 'scanned {sites} sites in {tempo}s, {contas} accounts',
  },
  /* cobertura final — maigret/sherlock (sem `checked`, só found+duração) */
  'buscar.perf.coberturaSimples': {
    'pt-BR': '{contas} contas em {tempo}s',
    'en-US': '{contas} accounts in {tempo}s',
  },
};
