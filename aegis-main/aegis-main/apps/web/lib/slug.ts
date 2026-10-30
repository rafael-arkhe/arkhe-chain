/**
 * slugify — gera um identificador técnico estável a partir de um nome legível.
 * Centraliza o padrão que estava duplicado inline (novo-app-modal, pipeline-builder,
 * quiver). O operador NUNCA digita o slug: ele é derivado do nome + botão "Gerar"
 * (feedback_no_manual_technical_input).
 */
export function slugify(input: string, maxLen = 64): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "") // remove acentos (combining marks)
    .replace(/[^a-z0-9]+/g, '-') // não-alfanumérico → hífen
    .replace(/^-+|-+$/g, '') // apara hífens das pontas
    .slice(0, maxLen);
}
