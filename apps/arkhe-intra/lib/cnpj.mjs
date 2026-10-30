// RFB algorithm: first 12 positions A-Z/0-9, final two numeric DVs, ASCII - 48.
// https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf
export function normalizeCnpj(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9]{12}[0-9]{2}|[A-Za-z0-9]{2}\.[A-Za-z0-9]{3}\.[A-Za-z0-9]{3}\/[A-Za-z0-9]{4}-[0-9]{2})$/.test(value)) return null;
  return value.replace(/[.\/-]/g, '').toUpperCase();
}
export function validCnpj(value) {
  const cnpj = normalizeCnpj(value);
  if (!cnpj || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = length => {
    let weight = length - 7, sum = 0;
    for (let i = 0; i < length; i++) {
      sum += (cnpj.charCodeAt(i) - 48) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return Number(cnpj[12]) === digit(12) && Number(cnpj[13]) === digit(13);
}
