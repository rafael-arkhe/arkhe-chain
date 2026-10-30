/**
 * Cliente do Vault (chaves/credenciais) — Sprint 9. Reusa o wizard que já existe
 * no backend (GET /governance/vault/wizard) + create_secret (POST). Usado pelo
 * modal "Configurar chaves" do card do AIP Chat no catálogo de agentes.
 */
import { apiFetch } from "./client";

export interface VaultWizardField {
  namespace: string;
  slug: string;
  display_name: string;
  description: string;
  kind: string; // "text" | "file"
  scope_skill_key?: string | null;
  cadastrado: boolean; // já existe linha no Vault deste tenant
}

export interface VaultWizardPack {
  pack_id: string;
  titulo: string;
  descricao_curta: string;
  fields: VaultWizardField[];
  skill_key: string;
  has_probe: boolean;
}

export const Vault = {
  /** Pacotes de credenciais sociais (X/Instagram/YouTube/…) — fluxo do browser. */
  wizard: () => apiFetch<VaultWizardPack[]>(`/governance/vault/wizard`),
  /**
   * Chaves de API dos conectores MCP (Tavily, urlscan, Reddit, DataJud, …) por
   * tenant. Mesmo shape do wizard → o modal reusa a renderização. Derivado por
   * regra do registro de adapters no backend.
   */
  connectorKeys: () => apiFetch<VaultWizardPack[]>(`/governance/vault/connector-keys`),
  /**
   * Define/atualiza (idempotente) a credencial de uma skill de pesquisa.
   * Cria na primeira vez e rotaciona ao substituir — sem 409, sem id. Escopo
   * restrito às credenciais de skills declaradas (gate vault.cookies.manage).
   */
  setSecret: (body: {
    namespace: string;
    slug: string;
    display_name: string;
    description?: string;
    value: string;
    scope_skill_key?: string | null;
  }) =>
    apiFetch(`/governance/vault/skill-secret`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
