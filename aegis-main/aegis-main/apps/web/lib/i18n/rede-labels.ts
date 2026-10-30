/**
 * FRENTE A (2026-06-26) — rótulo de exibição da REDE/plataforma de um perfil.
 *
 * Nomes próprios de plataforma (X, Instagram, TikTok…) NÃO são traduzíveis —
 * são marcas. Por isso este util é um mapa puro (não usa `t`): normaliza o
 * slug cru do dado (`properties.rede` = 'x_twitter' | 'instagram' | …) para o
 * nome de marca correto, com fallback capitalize p/ redes ainda não mapeadas.
 *
 * Espelha o mapa que components/ficha/widget-identidades.tsx:17-20 já tinha
 * duplicado (TIPO_LABEL). NÃO refatorar os outros arquivos agora — só criar o
 * util e usá-lo no relation-list (ADD-alongside).
 */

/** slug-normalizado → nome de marca. Chaves sempre minúsculas. */
const REDE_LABEL: Record<string, string> = {
  x_twitter: 'X',
  x: 'X',
  twitter: 'X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  email: 'E-mail',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  telegram: 'Telegram',
  github: 'GitHub',
};

function capitalize(s: string): string {
  const v = (s || '').replace(/_/g, ' ').trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : '';
}

/** Nome de exibição da rede: mapa de marcas → capitalize do slug cru. */
export function redeLabel(rede: unknown): string {
  const key = String(rede ?? '').trim().toLowerCase();
  if (!key) return '';
  return REDE_LABEL[key] ?? capitalize(String(rede));
}
