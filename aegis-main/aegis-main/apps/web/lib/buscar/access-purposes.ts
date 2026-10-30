/**
 * Finalidades de acesso (LGPD) para o gesto "Montar dossiê".
 *
 * REGRA MULTI-DOMÍNIO: o default é NEUTRO — as BASES LEGAIS da LGPD (art. 7º/11),
 * transversais a QUALQUER domínio. NUNCA strings de vertical ("Investigação",
 * "Segurança pública" etc.) que tatuariam o AEGIS num caso de uso.
 *
 * A lista é CONFIGURÁVEL por domínio/tenant via a WorkshopVariable static
 * `dossier_purposes` (editável no painel visual de variáveis) — ver
 * use-dossier-purposes.ts. Este conjunto é só o fallback quando não há config.
 *
 * O backend (entity_dossier@v1) aceita `purpose` como string livre não-vazia e a
 * grava em AccessAudit.detail.purpose — então o VALOR é um slug estável (bom p/
 * filtro/relatório LGPD), e o rótulo é localizado via i18n.
 */
export type AccessPurpose = { value: string; label: string };

/** Bases legais da LGPD (neutras). value = slug estável (vai p/ a auditoria);
 *  labelKey = chave i18n do rótulo humano. */
export const ACCESS_PURPOSE_DEFS: { value: string; labelKey: string }[] = [
  { value: 'obrigacao_legal', labelKey: 'buscar.purpose.obrigacao_legal' },
  { value: 'exercicio_direitos', labelKey: 'buscar.purpose.exercicio_direitos' },
  { value: 'execucao_contrato', labelKey: 'buscar.purpose.execucao_contrato' },
  { value: 'politica_publica', labelKey: 'buscar.purpose.politica_publica' },
  { value: 'legitimo_interesse', labelKey: 'buscar.purpose.legitimo_interesse' },
  { value: 'protecao_vida', labelKey: 'buscar.purpose.protecao_vida' },
  { value: 'tutela_saude', labelKey: 'buscar.purpose.tutela_saude' },
  { value: 'prevencao_fraude', labelKey: 'buscar.purpose.prevencao_fraude' },
  { value: 'consentimento', labelKey: 'buscar.purpose.consentimento' },
];

/** Identificador estável do app de configuração (resolvido por slug). Admin cria um
 *  WorkshopApp com este external_id + a var static `dossier_purposes` p/ customizar. */
export const BUSCAR_CONFIG_SLUG = 'security.buscar-config';
export const DOSSIER_PURPOSES_VAR = 'dossier_purposes';

/**
 * Normaliza a config crua da variável para AccessPurpose[]. Aceita:
 *  - `["Consentimento", "Obrigação legal"]`            (strings → value=label)
 *  - `[{value:"obrigacao_legal", label:"Obrigação..."}]` (config rica)
 * Qualquer outra coisa → [].
 */
export function coercePurposes(raw: unknown): AccessPurpose[] {
  if (!Array.isArray(raw)) return [];
  const out: AccessPurpose[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const s = item.trim();
      if (s) out.push({ value: s, label: s });
    } else if (item && typeof item === 'object') {
      const o = item as { value?: unknown; label?: unknown };
      const v = typeof o.value === 'string' ? o.value.trim() : '';
      const l = typeof o.label === 'string' ? o.label.trim() : '';
      const value = v || l;
      if (value) out.push({ value, label: l || v });
    }
  }
  return out;
}
