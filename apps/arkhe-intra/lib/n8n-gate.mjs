// Aviso externo do piloto n8n. Não admite, não publica e não lê o campo verdict:
// o verificador offline deixa verdict em INCONCLUSIVE mesmo com as três conferências em PASS.
export function effectAllowed(report) {
  return report?.integrity === 'PASS' && report?.state === 'PASS' && report?.signatures === 'PASS';
}
