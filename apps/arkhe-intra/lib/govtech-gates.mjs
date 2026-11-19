/** Fail-closed gates for effects outside this installation. None of them releases. */

export const qualifications = [
  { id: 'mandate', title: 'Mandato do principal e identidade ICP-Brasil verificados', status: 'pending', finding: 'A revisão assina com Ed25519 local. Não há cadeia ICP-Brasil nem mandato verificado.' },
  { id: 'connector', title: 'Conector oficial com mTLS e deduplicação no destino', status: 'pending', finding: 'SIAFE, e-GP e SEI estão simulados. Não há sessão mTLS nem deduplicação no destino.' },
  { id: 'dispatch', title: 'Revalidação de saldo, vigência e revogação no despacho', status: 'pending', finding: 'O despacho confere alçada local e parada de emergência. Não consulta saldo, vigência legal nem revogação.' },
  { id: 'checkpoint', title: 'Checkpoint independente e recuperação exercitada', status: 'pending', finding: 'O verificador pede um checkpoint colado. Não há retenção independente nem ensaio de recuperação.' },
  { id: 'custody', title: 'Isolamento, custódia de chaves e responsáveis operacionais', status: 'pending', finding: 'A chave de revisão fica no navegador. TEE e HSM não estão provisionados.' },
];

export const pilotCriteria = [
  { id: 'problem', title: 'Problema e processo público', detail: 'Definir órgão parceiro, processo, usuários e indicadores de sucesso.', bound: 'SEAD, SEFAZ e SECTI são escopos sintéticos desta instalação. Não há órgão parceiro, usuários externos nem indicador de sucesso.' },
  { id: 'identity', title: 'Identidade e poderes', detail: 'Qualificar mandato, cadeia ICP-Brasil e separação de responsabilidades.', bound: 'O autor não aprova a própria proposta. A assinatura é Ed25519 local. A cadeia ICP-Brasil não está qualificada.' },
  { id: 'connector', title: 'Conector e efeito autorizado', detail: 'Validar API oficial, mTLS, idempotência e reconciliação no destino.', bound: 'O efeito corre no simulador e o recibo repete o mesmo operationId. externalEffect fica falso. API oficial e mTLS não estão validados.' },
  { id: 'data', title: 'Dados e custódia de evidências', detail: 'Definir minimização, retenção, acessos e checkpoint independente.', bound: 'O pacote exporta a cadeia local e o verificador pede um checkpoint colado. Não há prazo de retenção nem checkpoint retido fora do ficheiro.' },
  { id: 'recovery', title: 'Operação e recuperação', detail: 'Exercitar backup, restauração, incidentes e responsáveis operacionais.', bound: 'O journal local permanece na mesma base SQLite. Não há ensaio de backup, restauração nem incidente.' },
];

export function externalRelease() {
  return { released: false, reason: 'official-connector-pending' };
}
